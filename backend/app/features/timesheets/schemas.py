from typing import Optional

from pydantic import BaseModel, ConfigDict


class InvoiceFromTimeRequest(BaseModel):
    client_id: int
    number: str
    status: str = "draft"
    issue_date: str
    due_date: Optional[str] = None
    currency: str
    notes: Optional[str] = None
    agreed_total: Optional[float] = None
    time_entry_ids: list[int]
    group_by: str = "day"

class ProjectCreate(BaseModel):
    name: str
    client_id: Optional[int] = None
    hourly_rate: Optional[float] = None
    tags: Optional[str] = None
    is_active: bool = True

class ProjectOut(ProjectCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)

class TaskCreate(BaseModel):
    project_id: int
    name: str
    is_active: bool = True

class TaskOut(TaskCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)

class TimeEntryCreate(BaseModel):
    project_id: int
    task_id: Optional[int] = None
    date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: int
    notes: Optional[str] = None
    billable: bool = True
    hourly_rate: Optional[float] = None
    invoiced_invoice_id: Optional[int] = None

class TimeEntryOut(TimeEntryCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)

__all__ = ['InvoiceFromTimeRequest', 'ProjectCreate', 'ProjectOut', 'TaskCreate', 'TaskOut', 'TimeEntryCreate', 'TimeEntryOut']
