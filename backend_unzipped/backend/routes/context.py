from fastapi import APIRouter
from pydantic import BaseModel
from backend.services.context_engine import add_to_knowledge_base, find_related

router = APIRouter()

class TextRequest(BaseModel):
  text: str
  
@router.post("/context/add/")
def add_context(request: TextRequest):
  add_to_knowledge_base(request.text)
  return {"message": "Added to knowledge base"}

@router.post("/context/search/")
def search_context(request: TextRequest):
  results = find_related(request.text)
  return {"related": results}