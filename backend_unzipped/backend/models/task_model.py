from typing import List, Optional

from pydantic import BaseModel, Field


class TaskReminder(BaseModel):
    task_id: str | None = None
    task: str
    deadline: str
    detected_deadline: Optional[str] = None
    priority: Optional[str] = None
    source: str = "analyze"
    filename: Optional[str] = None


class ReminderRegistrationRequest(BaseModel):
    email: Optional[str] = None
    tasks: List[TaskReminder] = Field(default_factory=list)
    filename: Optional[str] = None
    source: str = "manual"


class ReminderRecord(BaseModel):
    id: str
    user_id: str
    task_id: str | None = None
    email: str
    task: str
    deadline: str
    detected_deadline: Optional[str] = None
    priority: Optional[str] = None
    source: str = "manual"
    filename: Optional[str] = None
    created_at: str
    reminders_sent: List[str] = Field(default_factory=list)
