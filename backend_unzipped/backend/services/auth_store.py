import json
from pathlib import Path
from threading import Lock


DATA_DIR = Path(__file__).resolve().parent.parent / "data"
USERS_FILE = DATA_DIR / "users.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"
_store_lock = Lock()


def _ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not USERS_FILE.exists():
        USERS_FILE.write_text("[]", encoding="utf-8")
    if not SESSIONS_FILE.exists():
        SESSIONS_FILE.write_text("[]", encoding="utf-8")


def _read_json(path: Path):
    _ensure_store()
    with _store_lock:
        raw = json.loads(path.read_text(encoding="utf-8") or "[]")
    return raw if isinstance(raw, list) else []


def _write_json(path: Path, payload) -> None:
    _ensure_store()
    with _store_lock:
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_users():
    return _read_json(USERS_FILE)


def save_users(users) -> None:
    _write_json(USERS_FILE, users)


def load_sessions():
    return _read_json(SESSIONS_FILE)


def save_sessions(sessions) -> None:
    _write_json(SESSIONS_FILE, sessions)
