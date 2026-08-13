from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Назва файлу локальної бази даних
SQLALCHEMY_DATABASE_URL = "sqlite:///./dnd.db"

# create_engine для SQLite (check_same_thread потрібен лише для SQLite)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Залежність (Dependency) для отримання сесії БД у запитах
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()