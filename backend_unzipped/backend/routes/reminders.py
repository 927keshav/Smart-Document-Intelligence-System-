from fastapi import APIRouter, Depends, HTTPException

from backend.services.auth_service import get_current_user
from backend.models.task_model import ReminderRegistrationRequest, TaskReminder
from backend.services.email_service import email_is_configured, send_email
from backend.services.reminder_service import process_daily_deadline_digests, process_due_reminders
from backend.services.reminder_store import clear_reminders, load_reminders, register_tasks

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("/")
def list_reminders(user=Depends(get_current_user)):
    reminders = load_reminders(user["id"])
    return {
        "configured_email": user["email"],
        "smtp_configured": email_is_configured(),
        "daily_digest_enabled": email_is_configured(),
        "count": len(reminders),
        "reminders": [reminder.model_dump() for reminder in reminders],
    }


@router.post("/register")
def register_reminders(request: ReminderRegistrationRequest, user=Depends(get_current_user)):
    email = request.email or user["email"]
    if not email:
        raise HTTPException(status_code=400, detail="No reminder email provided.")

    created = register_tasks(
        user["id"],
        str(email),
        [
            TaskReminder(
                task=task.task,
                deadline=task.deadline,
                detected_deadline=task.detected_deadline,
                priority=task.priority,
                source=task.source or request.source,
                filename=task.filename or request.filename,
            )
            for task in request.tasks
        ],
        source=request.source,
        filename=request.filename,
    )
    return {
        "message": "Reminder tasks registered",
        "created": len(created),
        "email": str(email),
    }


@router.post("/run")
def run_reminders():
    processed = process_due_reminders()
    daily_digests_sent = process_daily_deadline_digests()
    return {
        "processed": processed,
        "daily_digests_sent": daily_digests_sent,
    }


@router.post("/test-email")
def test_email(user=Depends(get_current_user)):
    if not email_is_configured():
        raise HTTPException(status_code=400, detail="SMTP is not fully configured.")

    send_email(
        user["email"],
        "SGU reminder test email",
        "This is a test email from the SGU deadline reminder service.",
    )
    return {"message": f"Test email sent to {user['email']}"}


@router.delete("/")
def delete_reminders(user=Depends(get_current_user)):
    clear_reminders(user["id"])
    return {"message": "All reminder records cleared"}
