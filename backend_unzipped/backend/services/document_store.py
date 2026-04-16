import json
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import List
from uuid import uuid4


DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_FILE = DATA_DIR / "documents.json"
_store_lock = Lock()


def _ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]", encoding="utf-8")


def load_documents(user_id: str | None = None) -> List[dict]:
    _ensure_store()
    with _store_lock:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8") or "[]")
    documents = raw if isinstance(raw, list) else []
    changed = False

    for document in documents:
        tasks = document.get("tasks") or []
        normalized_tasks = []
        for task in tasks:
            normalized_task = _normalize_task(task)
            if normalized_task != task:
                changed = True
            normalized_tasks.append(normalized_task)
        document["tasks"] = normalized_tasks

    if changed:
        save_documents(documents)

    if user_id is None:
        return documents
    return [document for document in documents if document.get("user_id") == user_id]


def save_documents(documents: List[dict]) -> None:
    _ensure_store()
    with _store_lock:
        DATA_FILE.write_text(json.dumps(documents, indent=2), encoding="utf-8")


def _normalize_task(task: dict) -> dict:
    normalized_task = dict(task)
    normalized_task["id"] = normalized_task.get("id") or str(uuid4())
    normalized_task["completed"] = bool(normalized_task.get("completed", False))
    return normalized_task


def add_document(
    *,
    user_id: str,
    filename: str,
    extracted_text_preview: str,
    extracted_text_length: int,
    summary: str,
    tasks: list,
) -> dict:
    documents = load_documents()
    document = {
        "id": str(uuid4()),
        "user_id": user_id,
        "filename": filename,
        "extractedText": extracted_text_preview,
        "extractedTextLength": extracted_text_length,
        "summary": summary,
        "tasks": [_normalize_task(task) for task in tasks],
        "uploadedAt": datetime.utcnow().isoformat(),
    }
    documents.append(document)
    save_documents(documents)
    return document


def clear_documents(user_id: str | None = None) -> None:
    if user_id is None:
        save_documents([])
        return

    documents = [document for document in load_documents() if document.get("user_id") != user_id]
    save_documents(documents)


def delete_document(user_id: str, document_id: str) -> dict | None:
    documents = load_documents()
    removed_document = None
    remaining_documents = []

    for document in documents:
        if document.get("user_id") == user_id and document.get("id") == document_id and removed_document is None:
            removed_document = document
            continue
        remaining_documents.append(document)

    if removed_document is None:
        return None

    save_documents(remaining_documents)
    return removed_document


def mark_task_completed(user_id: str, task_id: str, completed: bool = True) -> dict | None:
    documents = load_documents()
    updated_document = None

    for document in documents:
        if document.get("user_id") != user_id:
            continue

        tasks = document.get("tasks") or []
        for task in tasks:
            task["id"] = task.get("id") or str(uuid4())
            if task.get("id") == task_id:
                task["completed"] = completed
                updated_document = document
                break

        if updated_document is not None:
            break

    if updated_document is None:
        return None

    save_documents(documents)
    return updated_document


def update_task(
    user_id: str,
    task_id: str,
    *,
    task_name: str | None = None,
    deadline: str | None = None,
    priority: str | None = None,
    completed: bool | None = None,
) -> dict | None:
    documents = load_documents()
    updated_document = None

    for document in documents:
        if document.get("user_id") != user_id:
            continue

        tasks = document.get("tasks") or []
        for task in tasks:
            task["id"] = task.get("id") or str(uuid4())
            if task.get("id") != task_id:
                continue

            if task_name is not None:
                task["task"] = task_name
            if deadline is not None:
                task["deadline"] = deadline
            if priority is not None:
                task["priority"] = priority
            if completed is not None:
                task["completed"] = completed

            updated_document = document
            break

        if updated_document is not None:
            break

    if updated_document is None:
        return None

    save_documents(documents)
    return updated_document
