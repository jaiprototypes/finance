from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db import get_session
from ..receivables.models import Invoice, Client
from .models import Project, Task, TimeEntry
from ..receivables.schemas import InvoiceOut
from .schemas import ProjectCreate, ProjectOut, TaskCreate, TaskOut, TimeEntryCreate, TimeEntryOut, InvoiceFromTimeRequest
from ..receivables.service import ReceivableTrackingService
from .service import ensure_duration
from .service import invoice_from_time_entries
from ..receivables.invoice_tracking import serialize_invoice

router = APIRouter(prefix="/timesheets", tags=["timesheets"])
receivable_tracking = ReceivableTrackingService()


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(session: Session = Depends(get_session)):
    return session.execute(select(Project)).scalars().all()


@router.post("/projects", response_model=ProjectOut)
def create_project(payload: ProjectCreate, session: Session = Depends(get_session)):
    project = Project(
        name=payload.name,
        client_id=payload.client_id,
        hourly_rate=payload.hourly_rate,
        tags=payload.tags,
        is_active=1 if payload.is_active else 0,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.post("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, payload: ProjectCreate, session: Session = Depends(get_session)):
    project = session.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.name = payload.name
    project.client_id = payload.client_id
    project.hourly_rate = payload.hourly_rate
    project.tags = payload.tags
    project.is_active = 1 if payload.is_active else 0
    session.commit()
    return project


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, session: Session = Depends(get_session)):
    project = session.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    session.execute(TimeEntry.__table__.delete().where(TimeEntry.project_id == project_id))
    session.execute(Task.__table__.delete().where(Task.project_id == project_id))
    session.delete(project)
    session.commit()
    return {"status": "ok"}


@router.post("/tasks", response_model=TaskOut)
def create_task(payload: TaskCreate, session: Session = Depends(get_session)):
    task = Task(project_id=payload.project_id, name=payload.name, is_active=1 if payload.is_active else 0)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.post("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskCreate, session: Session = Depends(get_session)):
    task = session.execute(select(Task).where(Task.id == task_id)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.project_id = payload.project_id
    task.name = payload.name
    task.is_active = 1 if payload.is_active else 0
    session.commit()
    return task


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, session: Session = Depends(get_session)):
    task = session.execute(select(Task).where(Task.id == task_id)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    session.execute(TimeEntry.__table__.delete().where(TimeEntry.task_id == task_id))
    session.delete(task)
    session.commit()
    return {"status": "ok"}


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(project_id: int | None = None, session: Session = Depends(get_session)):
    query = select(Task)
    if project_id:
        query = query.where(Task.project_id == project_id)
    return session.execute(query).scalars().all()


@router.get("/entries", response_model=list[TimeEntryOut])
def list_time_entries(session: Session = Depends(get_session)):
    return session.execute(select(TimeEntry)).scalars().all()


@router.post("/entries", response_model=TimeEntryOut)
def create_time_entry(payload: TimeEntryCreate, session: Session = Depends(get_session)):
    _validate_time_entry_payload(payload, session)
    try:
        duration = ensure_duration(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    entry = TimeEntry(
        project_id=payload.project_id,
        task_id=payload.task_id,
        date=payload.date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        duration_minutes=duration,
        notes=payload.notes,
        billable=1 if payload.billable else 0,
        hourly_rate=payload.hourly_rate,
        invoiced_invoice_id=payload.invoiced_invoice_id,
        created_at=_now_str(),
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@router.post("/entries/{entry_id}", response_model=TimeEntryOut)
def update_time_entry(entry_id: int, payload: TimeEntryCreate, session: Session = Depends(get_session)):
    entry = session.execute(select(TimeEntry).where(TimeEntry.id == entry_id)).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    _validate_time_entry_payload(payload, session)
    try:
        duration = ensure_duration(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    entry.project_id = payload.project_id
    entry.task_id = payload.task_id
    entry.date = payload.date
    entry.start_time = payload.start_time
    entry.end_time = payload.end_time
    entry.duration_minutes = duration
    entry.notes = payload.notes
    entry.billable = 1 if payload.billable else 0
    entry.hourly_rate = payload.hourly_rate
    entry.invoiced_invoice_id = payload.invoiced_invoice_id
    session.commit()
    return entry


@router.delete("/entries/{entry_id}")
def delete_time_entry(entry_id: int, session: Session = Depends(get_session)):
    entry = session.execute(select(TimeEntry).where(TimeEntry.id == entry_id)).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    session.delete(entry)
    session.commit()
    return {"status": "ok"}


@router.post("/invoice", response_model=InvoiceOut)
def invoice_from_time(payload: InvoiceFromTimeRequest, session: Session = Depends(get_session)):
    if not payload.client_id:
        raise HTTPException(status_code=400, detail="Client is required")
    client = session.execute(select(Client).where(Client.id == payload.client_id)).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=400, detail="Client not found")
    if not payload.issue_date:
        raise HTTPException(status_code=400, detail="Issue date is required")
    if not payload.time_entry_ids:
        raise HTTPException(status_code=400, detail="Select at least one time entry")
    try:
        invoice_id = invoice_from_time_entries(session, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    receivable_tracking.reconcile_after_ledger_change(session, invoice_ids=[invoice_id])
    session.commit()
    invoice = session.execute(select(Invoice).where(Invoice.id == invoice_id)).scalar_one()
    return serialize_invoice(session, invoice)


@router.post("/timer/start")
def start_timer(project_id: int, task_id: int | None = None, session: Session = Depends(get_session)):
    now = _now_str()
    entry = TimeEntry(
        project_id=project_id,
        task_id=task_id,
        date=now.split("T")[0],
        start_time=now,
        end_time=None,
        duration_minutes=0,
        notes=None,
        billable=1,
        hourly_rate=None,
        created_at=now,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return {"entry_id": entry.id, "start_time": entry.start_time}


@router.post("/timer/stop")
def stop_timer(entry_id: int, session: Session = Depends(get_session)):
    entry = session.execute(select(TimeEntry).where(TimeEntry.id == entry_id)).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.end_time:
        raise HTTPException(status_code=400, detail="Entry already stopped")
    now = _now_str()
    entry.end_time = now
    entry.duration_minutes = ensure_duration({"start_time": entry.start_time, "end_time": entry.end_time, "duration_minutes": 0})
    session.commit()
    return {"entry_id": entry.id, "duration_minutes": entry.duration_minutes}


def _validate_time_entry_payload(payload: TimeEntryCreate, session: Session) -> None:
    if not payload.project_id:
        raise HTTPException(status_code=400, detail="Project is required")
    project = session.execute(select(Project).where(Project.id == payload.project_id)).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=400, detail="Project not found")
    if payload.task_id:
        task = session.execute(select(Task).where(Task.id == payload.task_id)).scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=400, detail="Task not found")
        if task.project_id != payload.project_id:
            raise HTTPException(status_code=400, detail="Task does not belong to selected project")
    if not payload.date and not payload.start_time:
        raise HTTPException(status_code=400, detail="Date or start time is required")
    if payload.start_time and payload.end_time:
        # duration validation handled in ensure_duration
        return
    if payload.duration_minutes is None or payload.duration_minutes < 0:
        raise HTTPException(status_code=400, detail="Duration must be 0 or greater")


def _now_str() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).isoformat()
