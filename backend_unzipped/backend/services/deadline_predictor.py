from datetime import datetime, timedelta

def predict_deadline(task_text, existing_deadline=None, allow_suggested=False):
  task_lower = task_text.lower()
  
  if existing_deadline:
    return existing_deadline, "Detected"
  if any(phrase in task_lower for phrase in ["today", "tonight", "this evening", "by eod", "end of day", "eod"]):
    return datetime.now().strftime("%Y-%m-%d"), "High"
  if "tomorrow" in task_lower:
    return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"), "High"
  if not allow_suggested:
    if any(word in task_lower for word in ["submit","deadline","urgent","asap"]):
      return None, "High"
    elif any(word in task_lower for word in ["prepare","complete","finish"]):
      return None, "Medium"
    elif any(word in task_lower for word in ["review","discuss","read"]):
      return None, "Low"
    else:
      return None, "Medium"
  if any(word in task_lower for word in ["submit","deadline","urgent","asap"]):
    return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"), "Suggested High"
  elif any(word in task_lower for word in ["prepare","complete","finish"]):
    return (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d"), "Suggested Medium"
  elif any(word in task_lower for word in ["review","discuss","read"]):
    return (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d"), "Suggested Low"
  else:
    return (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d"), "Suggested Medium"
  
