from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.migrations.runner import apply_migrations


def make_session():
    engine = create_engine("sqlite:///:memory:", future=True)
    apply_migrations(engine)
    Session = sessionmaker(bind=engine, future=True)
    return Session()

