from fastapi import APIRouter
from pydantic import BaseModel
from backend.agents.task_agent import process_text

router = APIRouter()

class TextRequest(BaseModel):
  text: str
  
@router.post("/agent/process/")
def run_agent(request: TextRequest):
  result = process_text(request.text)
  return {
    "processed_tasks": result,
    "message": "AI Agent executed successfully"
    }