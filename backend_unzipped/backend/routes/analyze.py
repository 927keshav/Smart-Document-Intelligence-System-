from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from uuid import uuid4

from backend.models.task_model import TaskReminder
from backend.services.auth_service import get_current_user
from backend.services.deadline_predictor import predict_deadline
from backend.services.document_store import add_document
from backend.services.email_service import get_email_configuration_status, send_deadline_summary_email
from backend.services.file_service import extract_text
from backend.services.reminder_service import send_immediate_same_day_reminders
from backend.services.reminder_store import register_tasks
from backend.services.summarizer import generate_summary
from backend.services.task_extractor import extract_tasks

router = APIRouter()


@router.post("/analyze/")
async def analyze_document(file: UploadFile = File(...), user=Depends(get_current_user)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    content = await file.read()
    try:
        text = extract_text(file.filename, content)
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    if not text.strip() or text == "Unsupported file format":
        raise HTTPException(status_code=400, detail="No readable text could be extracted from the file")

    summary = generate_summary(text)
    extracted_tasks = extract_tasks(text)
    is_audio_file = file.filename.lower().endswith((".mp3", ".wav", ".m4a", ".ogg", ".webm", ".mpeg"))

    if is_audio_file and not extracted_tasks:
        fallback_text = summary if summary and summary != "No summary available." else text
        extracted_tasks = [
            {
                "task": sentence.strip(),
                "deadline": None,
            }
            for sentence in fallback_text.split(".")
            if sentence.strip()
        ][:3]

    tasks = []
    for task in extracted_tasks:
        detected_deadline = task.get("deadline")
        final_deadline, priority = predict_deadline(
            task.get("task", ""),
            detected_deadline,
            allow_suggested=is_audio_file,
        )
        tasks.append(
            {
                "id": str(uuid4()),
                "task": task.get("task", ""),
                "deadline": final_deadline,
                "detected_deadline": detected_deadline,
                "deadline_source": "detected" if detected_deadline else ("suggested" if final_deadline else "missing"),
                "priority": priority,
                "completed": False,
            }
        )

    reminder_records = register_tasks(
        user["id"],
        user["email"],
        [
            TaskReminder(
                task_id=task["id"],
                task=task["task"],
                deadline=task["deadline"],
                detected_deadline=task["detected_deadline"],
                priority=task["priority"],
                source="analyze",
                filename=file.filename,
            )
            for task in tasks
            if task.get("deadline")
        ],
        source="analyze",
        filename=file.filename,
    )
    reminders_registered = len(reminder_records)
    same_day_reminders_sent, same_day_reminder_error = send_immediate_same_day_reminders(reminder_records)
    same_day_deadlines_detected = sum(
        1
        for record in reminder_records
        if str(record.deadline).strip() == __import__("datetime").datetime.now().strftime("%Y-%m-%d")
    )

    saved_document = add_document(
        user_id=user["id"],
        filename=file.filename,
        extracted_text_preview=text[:8000],
        extracted_text_length=len(text),
        summary=summary,
        tasks=tasks,
    )

    summary_email_sent = False
    summary_email_error = ""
    try:
        summary_email_sent = send_deadline_summary_email(
            user["email"],
            file.filename,
            tasks,
            summary,
        )
    except Exception as error:
        summary_email_sent = False
        summary_email_error = str(error)

    return {
        "filename": file.filename,
        "extracted_text_preview": text[:8000],
        "extracted_text_length": len(text),
        "summary": summary,
        "tasks": tasks,
        "reminders_registered": reminders_registered,
        "same_day_reminders_sent": same_day_reminders_sent,
        "same_day_deadlines_detected": same_day_deadlines_detected,
        "same_day_reminder_error": same_day_reminder_error,
        "summary_email_sent": summary_email_sent,
        "summary_email_error": summary_email_error,
        "email_config": get_email_configuration_status(),
        "document": saved_document,
    }
