from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey

from ...core.db_base import Base


class ImportBatch(Base):
    __tablename__ = "import_batch"

    id = Column(Integer, primary_key=True)
    source = Column(String)
    file_name = Column(String)
    created_at = Column(String, nullable=False)
    status = Column(String, nullable=False)
    total_rows = Column(Integer, default=0, nullable=False)
    imported_rows = Column(Integer, default=0, nullable=False)
    duplicate_rows = Column(Integer, default=0, nullable=False)

class ImportRow(Base):
    __tablename__ = "import_row"

    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("import_batch.id"), nullable=False)
    row_index = Column(Integer, nullable=False)
    raw_json = Column(Text, nullable=False)
    parsed_json = Column(Text)
    fingerprint = Column(String, nullable=False)
    status = Column(String, nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    error = Column(Text)

__all__ = ['ImportBatch', 'ImportRow']
