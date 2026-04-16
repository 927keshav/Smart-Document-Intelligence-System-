import re

try:
  from transformers import pipeline
except Exception:
  pipeline = None

summarizer = None
summarizer_attempted = False

def get_summarizer():
  global summarizer
  global summarizer_attempted

  if summarizer_attempted:
    return summarizer

  summarizer_attempted = True
  if pipeline is None:
    summarizer = None
    return summarizer

  try:
    summarizer = pipeline(
      "summarization",
      model="sshleifer/distilbart-cnn-12-6"
    )
  except Exception:
    summarizer = None

  return summarizer

def split_into_chunks(text, max_words=700):
  words = text.split()
  return [
    " ".join(words[index:index + max_words])
    for index in range(0, len(words), max_words)
  ]

def simple_summary(text, max_sentences=5):
  sentences = [sentence.strip() for sentence in re.split(r'(?<=[.!?])\s+', text) if sentence.strip()]
  if not sentences:
    return "No summary available."
  return " ".join(sentences[:max_sentences])

def generate_summary(text):
  cleaned = " ".join(text.split())
  if not cleaned:
    return "No summary available."

  current_summarizer = get_summarizer()
  text_chunks = split_into_chunks(cleaned)
  summaries = []

  for chunk in text_chunks:
    if len(chunk.strip()) == 0:
      continue

    if current_summarizer is None:
      summaries.append(simple_summary(chunk, max_sentences=3))
      continue

    try:
      summary = current_summarizer(
        chunk,
        max_length=120,
        min_length=30,
        do_sample=False
      )
      summaries.append(summary[0]["summary_text"])
    except Exception:
      summaries.append(simple_summary(chunk, max_sentences=3))

  combined = " ".join(summaries).strip()
  if len(summaries) > 1:
    return simple_summary(combined, max_sentences=6)
  return combined or "No summary available."
