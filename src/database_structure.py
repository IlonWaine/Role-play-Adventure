from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from database import Base

class DMUser(Base):
    __tablename__ = "dm_users"

    id = Column(Integer, primary_key=True, index=True)
    nickname = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)  # Локально зберігаємо пароль
    created_at = Column(DateTime, default=datetime.utcnow)