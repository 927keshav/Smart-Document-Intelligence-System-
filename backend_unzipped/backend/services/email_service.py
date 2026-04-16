import smtplib
from email.message import EmailMessage

from backend.config.settings import settings


def email_is_configured() -> bool:
    return bool(
        settings.smtp_host
        and settings.smtp_port
        and settings.smtp_username
        and settings.smtp_password
        and settings.reminder_email_from
    )


def send_email(to_email: str, subject: str, body: str) -> None:
    if not email_is_configured():
        raise RuntimeError("SMTP is not fully configured.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.reminder_email_from
    message["To"] = to_email
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.ehlo()
        if settings.smtp_use_tls:
            smtp.starttls()
            smtp.ehlo()
        smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


def send_deadline_summary_email(to_email: str, filename: str, tasks: list[dict], summary: str) -> bool:
    if not email_is_configured():
        return False

    deadline_tasks = [task for task in tasks if task.get("deadline") and not task.get("completed")]

    lines = [
        "SGU upload summary",
        "",
        f"Document: {filename}",
        "",
        "Summary:",
        summary or "No summary available.",
        "",
    ]

    if deadline_tasks:
        lines.append("Detected deadlines:")
        for index, task in enumerate(deadline_tasks, start=1):
            lines.append(f"{index}. {task.get('task', 'Untitled task')}")
            lines.append(f"   Deadline: {task.get('deadline', 'N/A')}")
            lines.append(f"   Priority: {task.get('priority', 'N/A')}")
            if task.get("detected_deadline"):
                lines.append(f"   Original text: {task.get('detected_deadline')}")
            lines.append("")
    else:
        lines.extend(
            [
                "Detected deadlines:",
                "No deadline-bearing tasks were extracted from this upload.",
                "",
            ]
        )

    lines.append("Scheduled reminder emails will continue to use this same login email.")
    send_email(to_email, f"SGU deadlines for {filename}", "\n".join(lines))
    return True


def send_daily_deadline_digest_email(to_email: str, user_name: str, grouped_tasks: dict[str, list[dict]]) -> bool:
    if not email_is_configured():
        return False

    lines = [
        "SGU daily deadline digest",
        "",
        f"Hello {user_name or 'there'},",
        "Here is your daily deadline summary for the tasks linked to your account.",
        "",
    ]

    section_titles = {
        "overdue": "Overdue",
        "today": "Due today",
        "upcoming": "Upcoming",
    }

    total_tasks = 0
    for section_key in ("overdue", "today", "upcoming"):
        tasks = grouped_tasks.get(section_key) or []
        if not tasks:
            continue

        lines.append(f"{section_titles[section_key]}:")
        for index, task in enumerate(tasks, start=1):
            total_tasks += 1
            lines.append(f"{index}. {task.get('task', 'Untitled task')}")
            lines.append(f"   Deadline: {task.get('deadline', 'N/A')}")
            if task.get("priority"):
                lines.append(f"   Priority: {task['priority']}")
            if task.get("filename"):
                lines.append(f"   Document: {task['filename']}")
            lines.append("")

    if total_tasks == 0:
        return False

    lines.append("This email was sent automatically to your logged-in SGU account.")
    send_email(to_email, "SGU daily deadline digest", "\n".join(lines))
    return True


def get_email_configuration_status() -> dict:
    return {
        "smtp_host": settings.smtp_host,
        "smtp_port": settings.smtp_port,
        "smtp_username_set": bool(settings.smtp_username),
        "smtp_password_set": bool(settings.smtp_password),
        "smtp_password_length": len(settings.smtp_password or ""),
        "reminder_email_from": settings.reminder_email_from,
        "smtp_use_tls": settings.smtp_use_tls,
        "email_configured": email_is_configured(),
    }
