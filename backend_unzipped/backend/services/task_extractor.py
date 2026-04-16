import re
from datetime import datetime, timedelta

try:
  import spacy
except Exception:
  spacy = None

try:
  from dateparser.search import search_dates
except Exception:
  search_dates = None

nlp = None
nlp_attempted = False

def get_nlp():
  global nlp
  global nlp_attempted

  if nlp_attempted:
    return nlp

  nlp_attempted = True
  if spacy is None:
    nlp = None
    return nlp

  try:
    nlp = spacy.load("en_core_web_sm")
  except Exception:
    nlp = None

  return nlp

def normalize_deadline(text):
  if not text:
    return None

  lowered = text.lower()
  now = datetime.now()

  if "day after tomorrow" in lowered:
    return (now + timedelta(days=2)).strftime("%Y-%m-%d")
  if "tomorrow" in lowered:
    return (now + timedelta(days=1)).strftime("%Y-%m-%d")
  if any(phrase in lowered for phrase in ["today", "tonight", "this evening", "by eod", "end of day", "eod", "by tonight"]):
    return now.strftime("%Y-%m-%d")

  if search_dates is not None:
    try:
      matches = search_dates(
        text,
        settings={
          "PREFER_DATES_FROM": "future",
          "RELATIVE_BASE": datetime.now(),
          "RETURN_AS_TIMEZONE_AWARE": False,
        },
      )
      if matches:
        for original, parsed in matches:
          cleaned_original = original.strip(" .,")
          if len(cleaned_original) < 3:
            continue
          return parsed.strftime("%Y-%m-%d")
    except Exception:
      pass

  regex_match = re.search(
    r'\b('
    r'(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)'
    r'|(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2}(?:,\s*\d{4})?'
    r'|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?'
    r'|\d{4}-\d{2}-\d{2}'
    r')\b',
    text,
    re.IGNORECASE
  )
  if regex_match:
    return regex_match.group(1).rstrip(".,")

  return None

def extract_candidate_dates(text):
  candidates = []

  if search_dates is not None:
    try:
      matches = search_dates(
        text,
        settings={
          "PREFER_DATES_FROM": "future",
          "RELATIVE_BASE": datetime.now(),
          "RETURN_AS_TIMEZONE_AWARE": False,
        },
      )
      if matches:
        for original, parsed in matches:
          cleaned_original = original.strip(" .,")
          if len(cleaned_original) < 3:
            continue
          candidates.append(
            {
              "original": cleaned_original,
              "normalized": parsed.strftime("%Y-%m-%d"),
            }
          )
    except Exception:
      pass

  seen = set()
  unique_candidates = []
  for candidate in candidates:
    key = (candidate["original"].lower(), candidate["normalized"])
    if key in seen:
      continue
    seen.add(key)
    unique_candidates.append(candidate)

  return unique_candidates

def is_task_like_sentence(sent):
  lowered = sent.lower().strip()
  action_verbs = ["submit", "complete", "finish", "send", "prepare", "discuss", "review", "update", "pay", "attend", "upload", "share", "finalize", "reply", "deliver"]
  task_nouns = ["submission", "deadline", "assignment", "project", "presentation", "meeting", "exam", "payment", "ppt"]

  if any(verb in lowered for verb in action_verbs):
    return True

  if any(noun in lowered for noun in task_nouns) and any(
    marker in lowered for marker in ["today", "tomorrow", "tonight", "eod", "due", "deadline", "before", "by", "on"]
  ):
    return True

  if re.match(r"^\s*(task|action item|todo|to-do)\s*[:\-]", lowered):
    return True

  if re.match(r"^\s*[-*]\s+", sent):
    return True

  if re.match(r"^\s*\d+[\).\s-]+", sent):
    return True

  return False

def clean_task_text(sent):
  cleaned = sent.strip()
  cleaned = re.sub(r"^\s*[-*]\s+", "", cleaned)
  cleaned = re.sub(r"^\s*\d+[\).\s-]+", "", cleaned)
  cleaned = re.sub(r"^\s*(task|action item|todo|to-do)\s*\d*\s*[:\-]?\s*", "", cleaned, flags=re.IGNORECASE)
  cleaned = re.sub(r"\s*(deadline|due date|due|by|before|on)\s*[:\-]\s*.*$", "", cleaned, flags=re.IGNORECASE)
  cleaned = re.sub(r"\s+\b(is|was|are)\s+(today|tomorrow|tonight|this evening)\b.*$", "", cleaned, flags=re.IGNORECASE)
  return cleaned.strip(" .:-")

def looks_like_number_only(sent):
  return bool(re.match(r"^\s*(?:task\s*)?\d+[\).\s:-]*$", sent, re.IGNORECASE))

def extract_explicit_deadline_from_sentence(sent):
  explicit_patterns = [
    r"(?:deadline|due date|due)\s*[:\-]?\s*(.+)$",
    r"(?:submit|complete|finish|send|prepare|review|upload|pay|attend)\b.*?\b(?:by|before|on)\s+(.+)$",
  ]

  for pattern in explicit_patterns:
    match = re.search(pattern, sent, re.IGNORECASE)
    if match:
      parsed = normalize_deadline(match.group(1))
      if parsed:
        return parsed

  return normalize_deadline(sent)

def split_transcript_fallback(text):
  normalized = re.sub(r"\s+", " ", text).strip()
  if not normalized:
    return []

  chunks = re.split(
    r'(?i)\b(?:and then|then|next|also|after that|please|kindly)\b|[.;\n]+',
    normalized
  )
  return [chunk.strip(" ,-") for chunk in chunks if chunk and chunk.strip(" ,-")]

def dedupe_tasks(tasks):
  seen = set()
  unique = []
  for task in tasks:
    key = (task.get("task", "").strip().lower(), task.get("deadline"))
    if not task.get("task") or key in seen:
      continue
    seen.add(key)
    unique.append(task)
  return unique

def extract_tasks_from_transcript(text, document_dates):
  transcript_tasks = []
  for chunk in split_transcript_fallback(text):
    if not is_task_like_sentence(chunk):
      continue

    cleaned_task = clean_task_text(chunk) or chunk
    if looks_like_number_only(cleaned_task):
      continue

    explicit_deadline = extract_explicit_deadline_from_sentence(chunk)
    if explicit_deadline:
      deadline = explicit_deadline
    elif len(document_dates) == 1:
      deadline = document_dates[0]["normalized"]
    else:
      deadline = None

    transcript_tasks.append({"task": cleaned_task, "deadline": deadline})

  return transcript_tasks

def synthesize_tasks_from_text(text, document_dates, max_tasks=3):
  synthesized = []
  for chunk in split_transcript_fallback(text):
    cleaned = clean_task_text(chunk) or chunk.strip()
    if not cleaned or len(cleaned.split()) < 3:
      continue
    if looks_like_number_only(cleaned):
      continue

    deadline = extract_explicit_deadline_from_sentence(chunk)
    if not deadline and len(document_dates) == 1:
      deadline = document_dates[0]["normalized"]

    synthesized.append({"task": cleaned, "deadline": deadline})
    if len(synthesized) >= max_tasks:
      break

  return synthesized

def extract_tasks(text):
  tasks = []
  document_dates = extract_candidate_dates(text)
  current_nlp = get_nlp()
  if current_nlp is not None:
    doc = current_nlp(text)
    sentences = [sent.text for sent in doc.sents]
  else:
    sentences = re.split(r'(?<=[.!?])\s+|\n+', text)

  pending_task_index = None
  index = 0

  while index < len(sentences):
    sent = sentences[index]
    if not sent or not sent.strip():
      index += 1
      continue
    stripped = sent.strip()
    lowered_sentence = stripped.lower()

    if looks_like_number_only(stripped) and index + 1 < len(sentences):
      next_line = sentences[index + 1].strip() if sentences[index + 1] else ""
      if next_line and not looks_like_number_only(next_line):
        stripped = f"{stripped} {next_line}"
        lowered_sentence = stripped.lower()
        index += 1

    explicit_deadline = extract_explicit_deadline_from_sentence(stripped)
    task_like = is_task_like_sentence(stripped)

    # Attach a following "deadline: ..." line to the most recent task.
    if not task_like and explicit_deadline and pending_task_index is not None:
      tasks[pending_task_index]["deadline"] = explicit_deadline
      pending_task_index = None
      index += 1
      continue

    if task_like:
      cleaned_task = clean_task_text(stripped) or stripped
      if looks_like_number_only(cleaned_task):
        index += 1
        continue
      task = {"task": cleaned_task, "deadline": None}

      if explicit_deadline:
        task["deadline"] = explicit_deadline
      else:
        matched_document_date = None
        for candidate in document_dates:
          original = candidate["original"].lower()
          if original in lowered_sentence:
            matched_document_date = candidate["normalized"]
            break

        if matched_document_date:
          task["deadline"] = matched_document_date
        elif len(document_dates) == 1:
          task["deadline"] = document_dates[0]["normalized"]

      tasks.append(task)
      pending_task_index = len(tasks) - 1
      index += 1
      continue

    # If a sentence is mostly a date/deadline marker and we already have a task,
    # attach it to the nearest previous task.
    if explicit_deadline and pending_task_index is not None:
      tasks[pending_task_index]["deadline"] = explicit_deadline
      pending_task_index = None
    index += 1
  
  tasks = dedupe_tasks(tasks)

  if not tasks:
    tasks = dedupe_tasks(extract_tasks_from_transcript(text, document_dates))
  if not tasks:
    tasks = dedupe_tasks(synthesize_tasks_from_text(text, document_dates))
  
  return tasks
