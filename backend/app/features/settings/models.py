from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey

from ...core.db_base import Base


class AppSetting(Base):
    __tablename__ = "app_setting"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)

__all__ = ['AppSetting']
