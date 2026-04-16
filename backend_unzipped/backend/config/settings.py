import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except Exception:
    pass

def env_flag(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}

def env_text(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def normalized_smtp_password() -> str:
    raw_password = env_text("SMTP_PASSWORD")
    # Gmail app passwords are often copied with spaces every 4 chars.
    return "".join(raw_password.split())

class Settings:
    google_client_id = env_text("GOOGLE_CLIENT_ID")

    reminder_email_to = env_text("REMINDER_EMAIL_TO")
    reminder_email_from = env_text("REMINDER_EMAIL_FROM") or env_text("SMTP_USERNAME")
    reminder_check_interval_seconds = int(os.getenv("REMINDER_CHECK_INTERVAL_SECONDS", "300"))
    reminder_same_day_hour = int(os.getenv("REMINDER_SAME_DAY_HOUR", "9"))
    reminder_daily_digest_hour = int(os.getenv("REMINDER_DAILY_DIGEST_HOUR", "8"))

    smtp_host = env_text("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = env_text("SMTP_USERNAME")
    smtp_password = normalized_smtp_password()
    smtp_use_tls = env_flag("SMTP_USE_TLS", True)


settings = Settings()
