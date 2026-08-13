from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
import os

import database
import database_structure

# Створення таблиць у БД
database_structure.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="D&D Nexus Hub")

# --- Schemas (Pydantic) ---
class DMRegisterSchema(BaseModel):
    nickname: str
    email: EmailStr
    password: str

class DMLoginSchema(BaseModel):
    email: EmailStr
    password: str

# --- API Endpoints ---

@app.post("/api/dm/register", status_code=status.HTTP_201_CREATED)
def register_dm(data: DMRegisterSchema, db: Session = Depends(database.get_db)):
    # Перевірка, чи існує email
    existing_user = db.query(database_structure.DMUser).filter(
        database_structure.DMUser.email == data.email
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=400, 
            detail="Користувач з таким Email вже існує"
        )
    
    # Створення нового DM
    new_dm = database_structure.DMUser(
        nickname=data.nickname,
        email=data.email,
        password=data.password  # В продакшені обов'язково хешуйте (passlib/bcrypt)
    )
    db.add(new_dm)
    db.commit()
    db.refresh(new_dm)
    
    return {
        "message": "Реєстрація успішна", 
        "dm": {"id": new_dm.id, "nickname": new_dm.nickname, "email": new_dm.email}
    }

@app.post("/api/dm/login")
def login_dm(data: DMLoginSchema, db: Session = Depends(database.get_db)):
    user = db.query(database_structure.DMUser).filter(
        database_structure.DMUser.email == data.email
    ).first()
    
    if not user or user.password != data.password:
        raise HTTPException(
            status_code=401, 
            detail="Невірний Email або пароль"
        )
    
    return {
        "message": "Успішний вхід", 
        "dm": {"id": user.id, "nickname": user.nickname, "email": user.email}
    }

# --- Обслуговування Статичних Файлів (Фронтенд) ---
# Отримуємо шлях до директорії проєкт/src
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Підключаємо CSS та JS папки (переконайтеся, що вони лежать у src/css та src/js)
if os.path.exists(os.path.join(BASE_DIR, "templates/css")):
    app.mount("/css", StaticFiles(directory=os.path.join(BASE_DIR, "templates/css")), name="css")

if os.path.exists(os.path.join(BASE_DIR, "templates/js")):
    app.mount("/js", StaticFiles(directory=os.path.join(BASE_DIR, "templates/js")), name="js")
# Головна сторінка сайту
@app.get("/")
def read_root():
    return FileResponse(os.path.join(BASE_DIR, "templates/Menu.html"))

# Віддача JS файлів у корені або папці
@app.get("{file_name}.js")
def get_js(file_name: str):
    js_path = os.path.join(BASE_DIR, f"{file_name}.js")
    if os.path.exists(js_path):
        return FileResponse(js_path, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="File not found")

# Route to serve the Character Creation page
@app.get("/character_creation.html", response_class=FileResponse)
def get_character_create_page():
    # Adjust path if your html files are in src/templates/ or root folder
    file_path = os.path.join(BASE_DIR, "templates", "character_creation.html")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File character_creation.html not found")
        
    return FileResponse(file_path)