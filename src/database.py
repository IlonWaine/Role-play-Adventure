from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Назва файлу локальної бази даних
SQLALCHEMY_DATABASE_URL = "sqlite:///./dnd.db"

# create_engine для SQLite (check_same_thread потрібен лише для SQLite)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)


# WAL (Write-Ahead Log) дозволяє читати БД одночасно з записом, замість
# блокування всієї БД на час одного запиту - критично, коли кілька гравців
# і DM одночасно опитують/пишуть під час живої сесії.
@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Залежність (Dependency) для отримання сесії БД у запитах
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()