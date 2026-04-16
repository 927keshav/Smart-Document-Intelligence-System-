from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.services.auth_service import get_current_user
from backend.services.document_store import (
    clear_documents,
    delete_document,
    load_documents,
    mark_task_completed,
    update_task,
)
from backend.services.reminder_store import remove_reminders_for_task

router = APIRouter(prefix="/documents", tags=["documents"])


class TaskUpdatePayload(BaseModel):
    task: str | None = None
    deadline: str | None = None
    priority: str | None = None
    completed: bool | None = None


@router.get("/")
def list_documents(user=Depends(get_current_user)):
    documents = load_documents(user["id"])
    return {
        "count": len(documents),
        "documents": documents,
    }


@router.delete("/")
def delete_documents(user=Depends(get_current_user)):
    clear_documents(user["id"])
    return {"message": "All stored analyzed documents cleared"}


@router.delete("/{document_id}")
def delete_single_document(document_id: str, user=Depends(get_current_user)):
    removed_document = delete_document(user["id"], document_id)
    if removed_document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    return {"message": "Document removed from history", "document": removed_document}


@router.patch("/tasks/{task_id}/complete")
def complete_task(task_id: str, user=Depends(get_current_user)):
    document = mark_task_completed(user["id"], task_id, completed=True)
    if document is None:
        raise HTTPException(status_code=404, detail="Task not found.")

    remove_reminders_for_task(user["id"], task_id)
    return {"message": "Task marked as completed", "document": document}


@router.patch("/tasks/{task_id}")
def patch_task(task_id: str, payload: TaskUpdatePayload, user=Depends(get_current_user)):
    normalized_priority = payload.priority.strip().title() if isinstance(payload.priority, str) and payload.priority.strip() else None
    if normalized_priority is not None and normalized_priority not in {"High", "Medium", "Low"}:
        raise HTTPException(status_code=400, detail="Priority must be High, Medium, or Low.")

    normalized_task = payload.task.strip() if isinstance(payload.task, str) else None
    normalized_deadline = payload.deadline.strip() if isinstance(payload.deadline, str) else None
    document = update_task(
        user["id"],
        task_id,
        task_name=normalized_task,
        deadline=normalized_deadline,
        priority=normalized_priority,
        completed=payload.completed,
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Task not found.")

    if payload.completed:
        remove_reminders_for_task(user["id"], task_id)

    return {"message": "Task updated", "document": document}
