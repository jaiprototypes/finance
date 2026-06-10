from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey

from ...core.db_base import Base


class Project(Base):
    __tablename__ = "project"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    client_id = Column(Integer, ForeignKey("client.id"))
    hourly_rate = Column(Float)
    tags = Column(Text)
    is_active = Column(Integer, default=1, nullable=False)

class Task(Base):
    __tablename__ = "task"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("project.id"), nullable=False)
    name = Column(String, nullable=False)
    is_active = Column(Integer, default=1, nullable=False)

class TimeEntry(Base):
    __tablename__ = "time_entry"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("project.id"), nullable=False)
    task_id = Column(Integer, ForeignKey("task.id"))
    date = Column(String, nullable=False)
    start_time = Column(String)
    end_time = Column(String)
    duration_minutes = Column(Integer, nullable=False)
    notes = Column(Text)
    billable = Column(Integer, default=1, nullable=False)
    hourly_rate = Column(Float)
    invoiced_invoice_id = Column(Integer, ForeignKey("invoice.id"))
    created_at = Column(String, nullable=False)

__all__ = ['Project', 'Task', 'TimeEntry']
