from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ...db import get_session
from .models import KnowledgeBaseEntry
from .schemas import KnowledgeBaseCreate, KnowledgeBaseOut

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("", response_model=list[KnowledgeBaseOut])
def list_entries(q: str | None = None, session: Session = Depends(get_session)):
    if q:
        rows = session.execute(
            text(
                """
                SELECT k.*
                FROM knowledge_base_entry k
                JOIN knowledge_base_fts fts ON k.id = fts.rowid
                WHERE k.is_active = 1 AND fts MATCH :q
                ORDER BY bm25(knowledge_base_fts)
                LIMIT 50
                """
            ),
            {"q": q},
        ).mappings().all()
        return [dict(r) for r in rows]
    return session.execute(select(KnowledgeBaseEntry)).scalars().all()


@router.post("", response_model=KnowledgeBaseOut)
def create_entry(payload: KnowledgeBaseCreate, session: Session = Depends(get_session)):
    entry = KnowledgeBaseEntry(
        title=payload.title,
        content=payload.content,
        tags=payload.tags,
        is_active=1 if payload.is_active else 0,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(entry)
    session.flush()
    _upsert_fts(session, entry)
    session.commit()
    session.refresh(entry)
    return entry


@router.post("/{entry_id}", response_model=KnowledgeBaseOut)
def update_entry(entry_id: int, payload: KnowledgeBaseCreate, session: Session = Depends(get_session)):
    entry = session.execute(
        select(KnowledgeBaseEntry).where(KnowledgeBaseEntry.id == entry_id)
    ).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry.title = payload.title
    entry.content = payload.content
    entry.tags = payload.tags
    entry.is_active = 1 if payload.is_active else 0
    entry.updated_at = _now_str()
    _upsert_fts(session, entry)
    session.commit()
    return entry


@router.delete("/{entry_id}")
def delete_entry(entry_id: int, session: Session = Depends(get_session)):
    entry = session.execute(
        select(KnowledgeBaseEntry).where(KnowledgeBaseEntry.id == entry_id)
    ).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    session.execute(text("DELETE FROM knowledge_base_fts WHERE rowid = :id"), {"id": entry_id})
    session.delete(entry)
    session.commit()
    return {"status": "ok"}


def _upsert_fts(session: Session, entry: KnowledgeBaseEntry) -> None:
    session.execute(text("DELETE FROM knowledge_base_fts WHERE rowid = :id"), {"id": entry.id})
    session.execute(
        text(
            """
            INSERT INTO knowledge_base_fts(rowid, title, content, tags)
            VALUES (:id, :title, :content, :tags)
            """
        ),
        {
            "id": entry.id,
            "title": entry.title or "",
            "content": entry.content or "",
            "tags": entry.tags or "",
        },
    )


def _now_str() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).isoformat()
