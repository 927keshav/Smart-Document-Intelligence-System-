from backend.services.task_extractor import extract_tasks
from backend.services.deadline_predictor import predict_deadline
from backend.services.context_engine import add_to_knowledge_base

def process_text(text):
  tasks = extract_tasks(text)
  processed_tasks = []
  for task in tasks:
    deadline, priority = predict_deadline(
      task["task"],
      task["deadline"]
    )
    add_to_knowledge_base(task["task"])
    processed_tasks.append({
      "task": task["task"],
      "deadline": deadline,
      "priority": priority
    })
  return processed_tasks
