from fastapi import APIRouter
from pydantic import BaseModel
from backend.services.task_extractor import extract_tasks
from backend.services.deadline_predictor import predict_deadline

router = APIRouter()

class TextRequest(BaseModel):
  text: str
  
@router.post("/tasks/")
def get_tasks(request: TextRequest):
  tasks = extract_tasks(request.text)
  enhanced_tasks = []
  for task in tasks:
    detected_deadline = task["deadline"]
    final_deadline, priority = predict_deadline(
      task["task"],
      detected_deadline
    )
    enhanced_tasks.append({
      "task": task["task"],
      "deadline": final_deadline,
      "detected_deadline": detected_deadline,
      "priority": priority
    })
  return {
    "tasks": enhanced_tasks
  }
  
