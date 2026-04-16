from fastapi import APIRouter, File, HTTPException, UploadFile
from backend.services.file_service import extract_text

router = APIRouter()

@router.post("/upload/")
async def upload(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    content = await file.read()
    try:
        text = extract_text(file.filename, content)
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return {
      "filename": file.filename,
      "extracted_text": text,
      "extracted_text_preview": text[:5000],
      "extracted_text_length": len(text)
    }
