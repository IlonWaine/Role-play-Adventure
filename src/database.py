import os

from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
# from settings import DATABASE_URL

# --------------------------------------------------------------------------
# DATABASE_URL береться зі змінної середовища (на Render/Neon - Postgres,
# формат postgresql://user:password@host/dbname).
# Якщо змінної немає (локальна розробка на своєму ПК) - падаємо назад
# на локальний SQLite-файл, як і раніше.
# --------------------------------------------------------------------------
SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./dnd.db")

# Деякі хостинги (Neon, Render Postgres) видають URL зі схемою "postgres://",
# а SQLAlchemy 2.x вимагає "postgresql://" - підправляємо автоматично.
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

IS_SQLITE = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )

    # WAL (Write-Ahead Log) дозволяє читати БД одночасно з записом, замість
    # блокування всієї БД на час одного запиту - критично, коли кілька
    # гравців і DM одночасно опитують/пишуть під час живої сесії.
    # Стосується лише SQLite - Postgres має власне, значно краще керування
    # конкурентністю "з коробки", тому цей блок для нього не потрібен.
    @event.listens_for(engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
else:
    # Postgres (Neon/Render). pool_pre_ping перевіряє з'єднання перед
    # використанням - важливо для Neon, який засинає при простої й "будить"
    # з'єднання не миттєво; без цього перший запит після сну падав би
    # з обірваним з'єднанням.
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
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