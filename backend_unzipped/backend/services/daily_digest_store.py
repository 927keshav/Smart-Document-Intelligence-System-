import json
from datetime import datetime
from pathlib import Path
from threading import Lock


DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_FILE = DATA_DIR / "daily_deadline_digests.json"
_store_lock = Lock()


def _ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]", encoding="utf-8")


def load_daily_digest_records() -> list[dict]:
    _ensure_store()
    with _store_lock:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8") or "[]")
    return raw if isinstance(raw, list) else []


def save_daily_digest_records(records: list[dict]) -> None:
    _ensure_store()
    with _store_lock:
        DATA_FILE.write_text(json.dumps(records, indent=2), encoding="utf-8")


def was_daily_digest_sent(user_id: str, date_key: str) -> bool:
    return any(
        record.get("user_id") == user_id and record.get("date_key") == date_key
        for record in load_daily_digest_records()
    )


def mark_daily_digest_sent(user_id: str, email: str, date_key: str, task_count: int) -> None:
    records = load_daily_digest_records()
    if any(record.get("user_id") == user_id and record.get("date_key") == date_key for record in records):
        return

    records.append(
        {
            "user_id": user_id,
            "email": email,
            "date_key": date_key,
            "task_count": task_count,
            "sent_at": datetime.utcnow().isoformat(),
        }
    )
    save_daily_digest_records(records)
