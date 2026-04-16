from fastapi import APIRouter
from pydantic import BaseModel
from backend.services.summarizer import generate_summary

router = APIRouter()

class TextRequest(BaseModel):
  text: str
  
@router.post("/summarize/")
def summarize_text(request: TextRequest):
  summary = generate_summary(request.text)
  return {
    "summary": summary
  }