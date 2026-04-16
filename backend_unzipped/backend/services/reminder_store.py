import json
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import List
from uuid import uuid4

from backend.models.task_model import ReminderRecord, TaskReminder


DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_FILE = DATA_DIR / "reminders.json"
_store_lock = Lock()


def _ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]", encoding="utf-8")


def load_reminders(user_id: str | None = None) -> List[ReminderRecord]:
    _ensure_store()
    with _store_lock:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8") or "[]")
    reminders = []
    for item in raw:
        try:
            record = ReminderRecord(**item)
            if user_id is not None and record.user_id != user_id:
                continue
            reminders.append(record)
        except Exception:
            continue
    return reminders


def save_reminders(reminders: List[ReminderRecord]) -> None:
    _ensure_store()
    payload = [reminder.model_dump() for reminder in reminders]
    with _store_lock:
        DATA_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def register_tasks(user_id: str, email: str, tasks: List[TaskReminder], source: str = "manual", filename: str | None = None) -> List[ReminderRecord]:
    reminders = load_reminders()
    created_records: List[ReminderRecord] = []
    now = datetime.utcnow().isoformat()

    for task in tasks:
        if not task.deadline:
            continue

        normalized_task = task.task.strip()
        if not normalized_task:
            continue

        duplicate = next(
            (
                existing
                for existing in reminders
                if existing.user_id == user_id
                and (existing.task_id or "") == (task.task_id or "")
                and existing.email.lower() == email.lower()
                and existing.task.strip().lower() == normalized_task.lower()
                and existing.deadline == task.deadline
            ),
            None,
        )
        if duplicate:
            continue

        record = ReminderRecord(
            id=str(uuid4()),
            user_id=user_id,
            task_id=task.task_id,
            email=email,
            task=normalized_task,
            deadline=task.deadline,
            detected_deadline=task.detected_deadline,
            priority=task.priority,
            source=task.source or source,
            filename=task.filename or filename,
            created_at=now,
            reminders_sent=[],
        )
        reminders.append(record)
        created_records.append(record)

    if created_records:
        save_reminders(reminders)

    return created_records


def upsert_reminder_updates(updated_record: ReminderRecord) -> None:
    reminders = load_reminders()
    for index, existing in enumerate(reminders):
        if existing.id == updated_record.id:
            reminders[index] = updated_record
            save_reminders(reminders)
            return


def clear_reminders(user_id: str | None = None) -> None:
    if user_id is None:
        save_reminders([])
        return

    reminders = [reminder for reminder in load_reminders() if reminder.user_id != user_id]
    save_reminders(reminders)


def remove_reminders_for_task(user_id: str, task_id: str) -> None:
    reminders = [
        reminder for reminder in load_reminders() if not (reminder.user_id == user_id and reminder.task_id == task_id)
    ]
    save_reminders(reminders)
