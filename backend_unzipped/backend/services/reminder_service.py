from __future__ import annotations

from datetime import datetime
from threading import Event, Thread
from typing import Optional

from backend.config.settings import settings
from backend.services.auth_store import load_users
from backend.services.daily_digest_store import mark_daily_digest_sent, was_daily_digest_sent
from backend.services.document_store import load_documents
from backend.services.email_service import email_is_configured, send_daily_deadline_digest_email, send_email
from backend.services.reminder_store import load_reminders, upsert_reminder_updates


def _parse_deadline(deadline: str) -> Optional[datetime]:
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(deadline, fmt)
        except Exception:
            continue

    try:
        return datetime.fromisoformat(deadline)
    except Exception:
        return None


def _deadline_has_time(deadline: str) -> bool:
    return "T" in deadline or ":" in deadline or " " in deadline[10:]


def _build_email_body(record, reminder_key: str, days_left: int, hours_left: Optional[int] = None) -> str:
    urgency_line = {
        "five_day": "This deadline is coming up in 5 days.",
        "four_day": "This deadline is coming up in 4 days.",
        "three_day": "This deadline is coming up in 3 days.",
        "two_day": "This deadline is coming up in 2 days.",
        "one_day": "This deadline is tomorrow.",
        "one_hour": "This deadline is about 1 hour away.",
        "same_day": "This deadline is today.",
        "overdue": "This deadline has passed and may need immediate attention.",
    }.get(reminder_key, "A deadline reminder was triggered.")

    details = [
        "Deadline reminder from SGU",
        "",
        urgency_line,
        f"Task: {record.task}",
        f"Deadline: {record.deadline}",
    ]

    if record.priority:
        details.append(f"Priority: {record.priority}")
    if record.filename:
        details.append(f"Document: {record.filename}")
    if record.detected_deadline:
        details.append(f"Detected deadline text: {record.detected_deadline}")

    details.extend(
        [
            "",
            f"Days left: {days_left}",
        ]
    )
    if hours_left is not None:
        details.append(f"Hours left: {hours_left}")
    details.append("Please review this task before the deadline slips.")
    return "\n".join(details)


def _reminder_key(deadline: datetime, now: datetime) -> Optional[str]:
    start_today = datetime(now.year, now.month, now.day)
    start_deadline = datetime(deadline.year, deadline.month, deadline.day)
    days_left = (start_deadline - start_today).days

    if days_left == 5:
        return "five_day"
    if days_left == 4:
        return "four_day"
    if days_left == 3:
        return "three_day"
    if days_left == 2:
        return "two_day"
    if days_left == 1:
        return "one_day"
    if days_left == 0 and now.hour >= settings.reminder_same_day_hour:
        return "same_day"
    if days_left < 0:
        return "overdue"
    return None


def _collect_daily_deadline_tasks(user_id: str, now: datetime) -> list[dict]:
    collected: list[dict] = []
    seen_task_ids: set[str] = set()

    for document in load_documents(user_id):
        for task in document.get("tasks") or []:
            if task.get("completed"):
                continue

            deadline_text = str(task.get("deadline") or "").strip()
            if not deadline_text:
                continue

            parsed_deadline = _parse_deadline(deadline_text)
            if parsed_deadline is None:
                continue

            task_id = task.get("id") or f"{document.get('id')}::{task.get('task')}::{deadline_text}"
            if task_id in seen_task_ids:
                continue

            seen_task_ids.add(task_id)
            day_delta = (
                datetime(parsed_deadline.year, parsed_deadline.month, parsed_deadline.day)
                - datetime(now.year, now.month, now.day)
            ).days

            collected.append(
                {
                    "id": task_id,
                    "task": task.get("task", "").strip() or "Untitled task",
                    "deadline": deadline_text,
                    "priority": task.get("priority") or "",
                    "filename": document.get("filename") or "",
                    "deadline_dt": parsed_deadline,
                    "day_delta": day_delta,
                }
            )

    collected.sort(key=lambda item: item["deadline_dt"])
    return collected


def _group_daily_deadline_tasks(tasks: list[dict]) -> dict[str, list[dict]]:
    grouped = {
        "overdue": [],
        "today": [],
        "upcoming": [],
    }

    for task in tasks:
        if task["day_delta"] < 0:
            grouped["overdue"].append(task)
        elif task["day_delta"] == 0:
            grouped["today"].append(task)
        else:
            grouped["upcoming"].append(task)

    return grouped


def process_daily_deadline_digests(now: Optional[datetime] = None) -> int:
    if not email_is_configured():
        return 0

    current_time = now or datetime.now()
    if current_time.hour < settings.reminder_daily_digest_hour:
        return 0

    date_key = current_time.strftime("%Y-%m-%d")
    sent_count = 0

    for user in load_users():
        email = str(user.get("email") or "").strip()
        user_id = str(user.get("id") or "").strip()
        if not user_id or not email or was_daily_digest_sent(user_id, date_key):
            continue

        tasks = _collect_daily_deadline_tasks(user_id, current_time)
        if not tasks:
            continue

        grouped_tasks = _group_daily_deadline_tasks(tasks)
        try:
            sent = send_daily_deadline_digest_email(
                email,
                str(user.get("name") or "").strip(),
                grouped_tasks,
            )
        except Exception:
            continue

        if not sent:
            continue

        mark_daily_digest_sent(user_id, email, date_key, len(tasks))
        sent_count += 1

    return sent_count


def send_immediate_same_day_reminders(records: list, now: Optional[datetime] = None) -> tuple[int, str]:
    if not email_is_configured():
        return 0, "SMTP is not fully configured."

    current_time = now or datetime.now()
    sent_count = 0
    last_error = ""

    for record in records:
        deadline = _parse_deadline(record.deadline)
        if deadline is None:
            continue

        reminder_key = _reminder_key(deadline, current_time)
        if reminder_key != "same_day" or reminder_key in record.reminders_sent:
            continue

        days_left = (
            datetime(deadline.year, deadline.month, deadline.day)
            - datetime(current_time.year, current_time.month, current_time.day)
        ).days
        subject = f"SGU deadline reminder: {record.task}"
        body = _build_email_body(record, reminder_key, days_left)

        try:
            send_email(record.email, subject, body)
        except Exception as error:
            last_error = str(error)
            continue

        record.reminders_sent.append(reminder_key)
        upsert_reminder_updates(record)
        sent_count += 1

    return sent_count, last_error


def process_due_reminders(now: Optional[datetime] = None) -> int:
    if not email_is_configured():
        return 0

    current_time = now or datetime.now()
    reminders = load_reminders()
    sent_count = 0

    for record in reminders:
        deadline = _parse_deadline(record.deadline)
        if deadline is None:
            continue

        hours_left = None
        if _deadline_has_time(record.deadline):
            remaining_seconds = (deadline - current_time).total_seconds()
            if 0 < remaining_seconds <= 3600 and "one_hour" not in record.reminders_sent:
                reminder_key = "one_hour"
                hours_left = max(0, int(remaining_seconds // 3600))
            else:
                reminder_key = _reminder_key(deadline, current_time)
        else:
            reminder_key = _reminder_key(deadline, current_time)

        if reminder_key is None or reminder_key in record.reminders_sent:
            continue

        days_left = (datetime(deadline.year, deadline.month, deadline.day) - datetime(current_time.year, current_time.month, current_time.day)).days
        subject = f"SGU deadline reminder: {record.task}"
        body = _build_email_body(record, reminder_key, days_left, hours_left=hours_left)

        try:
            send_email(record.email, subject, body)
        except Exception:
            continue

        record.reminders_sent.append(reminder_key)
        upsert_reminder_updates(record)
        sent_count += 1

    return sent_count


class ReminderScheduler:
    def __init__(self) -> None:
        self._stop_event = Event()
        self._thread: Optional[Thread] = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._thread = Thread(target=self._run, name="reminder-scheduler", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            process_due_reminders()
            process_daily_deadline_digests()
            self._stop_event.wait(max(settings.reminder_check_interval_seconds, 60))
