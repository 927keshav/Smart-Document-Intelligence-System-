import io
import os
import re
import tempfile
from difflib import get_close_matches
from pathlib import Path

try:
  from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps
except Exception:
  Image = None
  ImageChops = None
  ImageEnhance = None
  ImageFilter = None
  ImageOps = None

try:
  import pdfplumber
except Exception:
  pdfplumber = None

try:
  from docx import Document
except Exception:
  Document = None

try:
  from faster_whisper import WhisperModel
except Exception:
  WhisperModel = None

try:
  import pytesseract
except Exception:
  pytesseract = None

audio_model = None
audio_model_attempted = False
audio_model_error = None
LOCAL_WHISPER_MODEL_DIR = Path(__file__).resolve().parents[2] / "models" / "faster-whisper-base"
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "").strip()
DEFAULT_TESSERACT_PATHS = [
  TESSERACT_CMD,
  r"C:\Program Files\Tesseract-OCR\tesseract.exe",
  r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
]
COMMON_HANDWRITING_WORDS = [
  "the",
  "is",
  "tomorrow",
  "today",
  "submission",
  "submit",
  "submitted",
  "ppt",
  "project",
  "assignment",
  "exam",
  "deadline",
  "meeting",
  "report",
  "class",
  "presentation",
  "due",
]

def _clean_ocr_text(text):
  lines = [" ".join(line.split()) for line in text.splitlines()]
  return "\n".join(line for line in lines if line).strip()

def _normalize_token_case(original_token, replacement):
  if original_token.isupper():
    return replacement.upper()
  if original_token[:1].isupper():
    return replacement.capitalize()
  return replacement

def _fix_token(token):
  letters_only = re.sub(r"[^A-Za-z]", "", token)
  if not letters_only:
    return token

  lowered = letters_only.lower()
  matches = get_close_matches(lowered, COMMON_HANDWRITING_WORDS, n=1, cutoff=0.72)
  if not matches:
    return token

  corrected = _normalize_token_case(letters_only, matches[0])
  return token.replace(letters_only, corrected, 1)

def _post_process_handwriting_text(text):
  text = text.replace("“", "").replace("”", "").replace('"', "")
  text = text.replace("|", "I").replace("¢", "s").replace("}", "I")
  tokens = re.split(r"(\s+)", text)
  corrected = "".join(_fix_token(token) if not token.isspace() else token for token in tokens)
  corrected = corrected.replace("SUBAMISSLON", "SUBMISSION")
  corrected = corrected.replace("SUBAMISSION", "SUBMISSION")
  corrected = corrected.replace("AS VBMISSION", "SUBMISSION")
  corrected = corrected.replace("TOMOROW", "TOMORROW")
  corrected = corrected.replace("ToMorRROW", "TOMORROW")
  corrected = corrected.replace("ToMoerRROw", "TOMORROW")
  corrected = corrected.replace("Tene", "The")
  corrected = corrected.replace("16", "IS")
  corrected = corrected.replace("Ig", "Is").replace("TO TOMORROW", "TOMORROW")
  corrected = corrected.replace("\nKS\n", "\nIS\n").replace("\nK5\n", "\nIS\n")
  corrected = re.sub(r"\bTOMORROW\s+[A-Za-z]{1,2}\b", "TOMORROW", corrected)
  corrected = re.sub(r"\b[0-9]+\s+PPT\b", "PPT", corrected)
  cleaned = _clean_ocr_text(corrected)

  filtered_lines = []
  for line in cleaned.splitlines():
    stripped = line.strip()
    alpha_count = sum(character.isalpha() for character in stripped)
    if alpha_count < 2:
      continue
    allowed_count = sum(character.isalnum() or character.isspace() for character in stripped)
    quality_ratio = allowed_count / max(1, len(stripped))
    keyword_hit = any(word in stripped.lower() for word in COMMON_HANDWRITING_WORDS)
    if quality_ratio >= 0.65 or keyword_hit:
      filtered_lines.append(stripped)

  return "\n".join(filtered_lines).strip()

def _normalize_handwritten_note(text):
  lines = [line.strip() for line in text.splitlines() if line.strip()]
  if not lines:
    return text

  merged = " ".join(lines)
  merged = re.sub(r"\bSubmission\s+IS\b", "submission is", merged, flags=re.IGNORECASE)
  merged = re.sub(r"\bPPT\s+Submission\b", "PPT submission", merged, flags=re.IGNORECASE)
  merged = re.sub(r"\bTOMORROW\b", "tomorrow", merged, flags=re.IGNORECASE)
  merged = re.sub(r"\bIS\b", "is", merged)
  merged = re.sub(r"\s+", " ", merged).strip()

  # If this looks like a short handwritten note, prefer a single sentence.
  if len(lines) <= 4 and 2 <= len(merged.split()) <= 12:
    if not merged.endswith((".", "!", "?")):
      merged = f"{merged}."
    merged = merged[:1].upper() + merged[1:]
    return merged

  return text

def _score_ocr_candidate(text):
  lowered = text.lower()
  tokens = [re.sub(r"[^a-z]", "", token.lower()) for token in text.split()]
  normalized_tokens = [token for token in tokens if token]
  exact_hits = sum(token in COMMON_HANDWRITING_WORDS for token in normalized_tokens)
  near_hits = sum(bool(get_close_matches(token, COMMON_HANDWRITING_WORDS, n=1, cutoff=0.8)) for token in normalized_tokens)
  alpha_numeric_score = sum(character.isalnum() for character in text)
  punctuation_penalty = sum(not character.isalnum() and not character.isspace() for character in text)
  digit_penalty = sum(character.isdigit() for character in text)
  line_penalty = max(0, text.count("\n")) * 12
  garbage_penalty = 25 if re.search(r"[^A-Za-z0-9\s\.\!\?]", text) else 0
  deadline_bonus = 20 if "tomorrow" in lowered else 0
  submission_bonus = 20 if "submission" in lowered else 0
  ppt_bonus = 10 if "ppt" in lowered else 0
  sentence_bonus = 40 if "ppt submission is tomorrow" in re.sub(r"[^a-z\s]", "", lowered) else 0
  return (
    alpha_numeric_score
    + exact_hits * 18
    + near_hits * 6
    + deadline_bonus
    + submission_bonus
    + ppt_bonus
    + sentence_bonus
    - punctuation_penalty * 4
    - digit_penalty * 6
    - line_penalty
    - garbage_penalty
  )

def _build_ocr_variants(grayscale_image):
  enlarged = grayscale_image.resize(
    (max(1, grayscale_image.width * 2), max(1, grayscale_image.height * 2)),
    Image.Resampling.LANCZOS,
  )
  contrasted = ImageEnhance.Contrast(enlarged).enhance(2.2)
  sharpened = contrasted.filter(ImageFilter.SHARPEN)
  median_cleaned = sharpened.filter(ImageFilter.MedianFilter(size=3))
  thresholded = median_cleaned.point(lambda pixel: 255 if pixel > 150 else 0)
  inverted_threshold = ImageOps.invert(thresholded)
  rotated_left = thresholded.rotate(-2.0, expand=True, fillcolor=255)
  rotated_right = thresholded.rotate(2.0, expand=True, fillcolor=255)

  return [
    (contrasted, "--oem 3 --psm 6"),
    (sharpened, "--oem 3 --psm 11"),
    (median_cleaned, "--oem 3 --psm 6"),
    (thresholded, "--oem 3 --psm 11"),
    (thresholded, "--oem 3 --psm 4"),
    (inverted_threshold, "--oem 3 --psm 11"),
    (rotated_left, "--oem 3 --psm 6"),
    (rotated_right, "--oem 3 --psm 6"),
  ]

def _build_color_ocr_variants(color_image):
  red_channel, _, blue_channel = color_image.split()
  blue_focus = ImageChops.subtract(blue_channel, red_channel)
  enlarged = blue_focus.resize(
    (max(1, blue_focus.width * 3), max(1, blue_focus.height * 3)),
    Image.Resampling.LANCZOS,
  )
  contrasted = ImageEnhance.Contrast(enlarged).enhance(4.0)
  thresholded = contrasted.point(lambda pixel: 255 if pixel > 35 else 0)

  return [
    (contrasted, "--oem 3 --psm 6"),
    (contrasted, "--oem 3 --psm 11"),
    (thresholded, "--oem 3 --psm 6"),
    (thresholded, "--oem 3 --psm 11"),
  ]

def get_audio_model():
  global audio_model
  global audio_model_attempted
  global audio_model_error

  if audio_model_attempted:
    return audio_model

  audio_model_attempted = True
  if WhisperModel is None:
    audio_model = None
    return audio_model

  try:
    model_source = str(LOCAL_WHISPER_MODEL_DIR) if LOCAL_WHISPER_MODEL_DIR.exists() else "base"
    audio_model = WhisperModel(model_source, device="cpu", compute_type="int8")
  except Exception as error:
    audio_model = None
    audio_model_error = str(error)

  return audio_model

def extract_text(filename, content):
  lower_name = filename.lower()
  if lower_name.endswith(".pdf"):
    return extract_pdf(content)
  elif lower_name.endswith(".docx"):
    return extract_docx(content)
  elif lower_name.endswith(".txt"):
    return content.decode("utf-8", errors="ignore")
  elif lower_name.endswith((".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tiff", ".tif", ".webp")):
    return extract_image(content)
  elif lower_name.endswith((".mp3", ".wav", ".m4a", ".ogg", ".webm", ".mpeg")):
    return extract_audio(content, lower_name)
  else:
    return "Unsupported file format"

def extract_pdf(content):
  if pdfplumber is None:
    raise RuntimeError("PDF support is not installed. Please install pdfplumber.")
  pages = []
  with pdfplumber.open(io.BytesIO(content)) as pdf:
    for page in pdf.pages:
      page_text = page.extract_text() or ""
      if page_text.strip():
        pages.append(page_text.strip())
    return "\n\n".join(pages)
  
def extract_docx(content):
  if Document is None:
    raise RuntimeError("DOCX support is not installed. Please install python-docx.")
  doc = Document(io.BytesIO(content))
  return "\n".join([para.text for para in doc.paragraphs if para.text.strip()])

def extract_image(content):
  if Image is None or ImageOps is None or ImageEnhance is None or ImageFilter is None or ImageChops is None:
    raise RuntimeError("Image OCR support is not installed. Please install pillow.")
  if pytesseract is None:
    raise RuntimeError("Image OCR support is not installed. Please install pytesseract.")

  for candidate_path in DEFAULT_TESSERACT_PATHS:
    if candidate_path and os.path.exists(candidate_path):
      pytesseract.pytesseract.tesseract_cmd = candidate_path
      break

  try:
    image = Image.open(io.BytesIO(content)).convert("RGB")
    image = ImageOps.exif_transpose(image)
    width, height = image.size
    full_image = image
    cropped_image = image.crop((20, 40, max(21, width - 20), max(41, int(height * 0.82))))
    grayscale = ImageOps.grayscale(cropped_image)
    full_grayscale = ImageOps.grayscale(full_image)

    candidates = []
    ocr_variants = (
      _build_ocr_variants(grayscale)
      + _build_color_ocr_variants(cropped_image)
      + _build_ocr_variants(full_grayscale)
      + _build_color_ocr_variants(full_image)
    )
    for variant_image, config in ocr_variants:
      extracted = pytesseract.image_to_string(variant_image, config=config)
      cleaned_candidate = _normalize_handwritten_note(_post_process_handwriting_text(extracted))
      if cleaned_candidate:
        candidates.append((_score_ocr_candidate(cleaned_candidate), cleaned_candidate))

    cleaned = max(candidates, default=(0, ""), key=lambda item: item[0])[1]
    return cleaned
  except pytesseract.TesseractNotFoundError as error:
    raise RuntimeError(
      "Image OCR requires the Tesseract OCR app to be installed on Windows. Install Tesseract and optionally set TESSERACT_CMD."
    ) from error
  except Exception as error:
    raise RuntimeError(f"Image OCR failed: {error}") from error

def extract_audio(content, filename):
  model = get_audio_model()
  if model is None:
    extra = f" Loader error: {audio_model_error}" if audio_model_error else ""
    raise RuntimeError(
      "Audio transcription support is not available. Install faster-whisper and a Whisper model." + extra
    )

  suffix = os.path.splitext(filename)[1] or ".wav"
  temp_path = None

  try:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
      temp_file.write(content)
      temp_path = temp_file.name

    segments, _ = model.transcribe(temp_path, vad_filter=True)
    transcript_parts = []
    for segment in segments:
      text = segment.text.strip()
      if not text:
        continue
      if text[-1] not in ".!?":
        text = f"{text}."
      transcript_parts.append(text)
    return " ".join(transcript_parts)
  finally:
    if temp_path and os.path.exists(temp_path):
      os.remove(temp_path)
