import hashlib
import json
import os
import secrets
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

import database
import database_structure

database_structure.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="D&D Nexus Hub")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")


# =============================================================================
# Хешування паролів (без зовнішніх залежностей)
# =============================================================================
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100_000).hex()
    return f"{salt}${pwd_hash}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, pwd_hash = stored.split("$")
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100_000).hex()
    return check == pwd_hash


# =============================================================================
# Схеми (Pydantic)
# =============================================================================
class DMRegisterSchema(BaseModel):
    nickname: str
    email: EmailStr
    password: str


class DMLoginSchema(BaseModel):
    email: EmailStr
    password: str


class PlayerCreateSchema(BaseModel):
    name: str
    dm_id: int


class CharacterCreateSchema(BaseModel):
    """Створення "порожнього" персонажа - саме так DM тисне 'Новий герой'."""
    player_id: int
    name: str = "Новий герой"


class StatItem(BaseModel):
    name: str
    val: int


class AbilityItem(BaseModel):
    title: str = ""
    principle: str = ""
    desc: str = ""
    actionType: str = "full"


class InventoryItem(BaseModel):
    name: str = ""
    qty: int = 1
    desc: str = ""


class CharacterUpdateSchema(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    session: Optional[str] = None
    current_hp: Optional[int] = None
    max_hp: Optional[int] = None
    ac: Optional[int] = None
    max_slots: Optional[int] = None
    gp: Optional[int] = None
    sp: Optional[int] = None
    cp: Optional[int] = None
    stats: Optional[List[StatItem]] = None
    abilities: Optional[List[AbilityItem]] = None
    inventory: Optional[List[InventoryItem]] = None
    backstory: Optional[str] = None
    portrait_data: Optional[str] = None


def character_to_dict(c: database_structure.Character) -> dict:
    return {
        "id": c.id,
        "player_id": c.player_id,
        "name": c.name,
        "role": c.role,
        "session": c.session,
        "current_hp": c.current_hp,
        "max_hp": c.max_hp,
        "ac": c.ac,
        "max_slots": c.max_slots,
        "gp": c.gp,
        "sp": c.sp,
        "cp": c.cp,
        "stats": json.loads(c.stats_json or "[]"),
        "abilities": json.loads(c.abilities_json or "[]"),
        "inventory": json.loads(c.inventory_json or "[]"),
        "backstory": c.backstory,
        "portrait_data": c.portrait_data,
    }


# =============================================================================
# API: Auth
# =============================================================================
@app.post("/api/dm/register", status_code=status.HTTP_201_CREATED)
def register_dm(data: DMRegisterSchema, db: Session = Depends(database.get_db)):
    existing_user = db.query(database_structure.DMUser).filter(
        database_structure.DMUser.email == data.email
    ).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="Користувач з таким Email вже існує")

    new_dm = database_structure.DMUser(
        nickname=data.nickname,
        email=data.email,
        password=hash_password(data.password),
    )
    db.add(new_dm)
    db.commit()
    db.refresh(new_dm)

    return {
        "message": "Реєстрація успішна",
        "dm": {"id": new_dm.id, "nickname": new_dm.nickname, "email": new_dm.email},
    }


@app.post("/api/dm/login")
def login_dm(data: DMLoginSchema, db: Session = Depends(database.get_db)):
    user = db.query(database_structure.DMUser).filter(
        database_structure.DMUser.email == data.email
    ).first()

    if not user or not verify_password(data.password, user.password):
        raise HTTPException(status_code=401, detail="Невірний Email або пароль")

    return {
        "message": "Успішний вхід",
        "dm": {"id": user.id, "nickname": user.nickname, "email": user.email},
    }


# =============================================================================
# API: Players
# =============================================================================
@app.get("/api/dm/{dm_id}/players")
def get_dm_players(dm_id: int, db: Session = Depends(database.get_db)):
    """Отримати всіх гравців конкретного DM разом з їх персонажами."""
    players = db.query(database_structure.Player).filter(
        database_structure.Player.dm_id == dm_id
    ).all()

    result = []
    for p in players:
        result.append({
            "id": p.id,
            "name": p.name,
            "characters": [
                {"id": c.id, "name": c.name, "role": c.role}
                for c in p.characters
            ],
        })
    return result


@app.post("/api/players", status_code=status.HTTP_201_CREATED)
def create_player(data: PlayerCreateSchema, db: Session = Depends(database.get_db)):
    """Додати нового гравця до DM."""
    new_player = database_structure.Player(name=data.name, dm_id=data.dm_id)
    db.add(new_player)
    db.commit()
    db.refresh(new_player)
    return {"id": new_player.id, "name": new_player.name, "characters": []}


@app.delete("/api/players/{player_id}")
def delete_player(player_id: int, db: Session = Depends(database.get_db)):
    player = db.query(database_structure.Player).get(player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Гравця не знайдено")
    db.delete(player)
    db.commit()
    return {"message": "Гравця видалено"}


# =============================================================================
# API: Characters
# =============================================================================
@app.post("/api/characters", status_code=status.HTTP_201_CREATED)
def create_character(data: CharacterCreateSchema, db: Session = Depends(database.get_db)):
    """DM тисне '+ Новий герой' у player_navigation -> створюємо порожню картку
    і повертаємо її id, щоб фронтенд одразу перейшов у редактор."""
    player = db.query(database_structure.Player).get(data.player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Гравця не знайдено")

    new_char = database_structure.Character(name=data.name, player_id=data.player_id)
    db.add(new_char)
    db.commit()
    db.refresh(new_char)
    return character_to_dict(new_char)


@app.get("/api/characters/{char_id}")
def get_character(char_id: int, db: Session = Depends(database.get_db)):
    char = db.query(database_structure.Character).get(char_id)
    if not char:
        raise HTTPException(status_code=404, detail="Персонажа не знайдено")
    return character_to_dict(char)


@app.put("/api/characters/{char_id}")
def update_character(char_id: int, data: CharacterUpdateSchema, db: Session = Depends(database.get_db)):
    char = db.query(database_structure.Character).get(char_id)
    if not char:
        raise HTTPException(status_code=404, detail="Персонажа не знайдено")

    payload = data.dict(exclude_unset=True)

    if "stats" in payload and payload["stats"] is not None:
        char.stats_json = json.dumps(payload.pop("stats"))
    if "abilities" in payload and payload["abilities"] is not None:
        char.abilities_json = json.dumps(payload.pop("abilities"))
    if "inventory" in payload and payload["inventory"] is not None:
        char.inventory_json = json.dumps(payload.pop("inventory"))

    for field, value in payload.items():
        setattr(char, field, value)

    db.commit()
    db.refresh(char)
    return character_to_dict(char)


@app.delete("/api/characters/{char_id}")
def delete_character(char_id: int, db: Session = Depends(database.get_db)):
    char = db.query(database_structure.Character).get(char_id)
    if not char:
        raise HTTPException(status_code=404, detail="Персонажа не знайдено")
    db.delete(char)
    db.commit()
    return {"message": "Персонажа видалено"}


# =============================================================================
# Статичні файли та сторінки
# =============================================================================
# ВАЖЛИВО: css/js мають лежати саме в templates/css та templates/js,
# інакше mount мовчки не спрацює і всі сторінки будуть без стилів/логіки.
css_dir = os.path.join(TEMPLATES_DIR, "css")
js_dir = os.path.join(TEMPLATES_DIR, "js")

if os.path.isdir(css_dir):
    app.mount("/css", StaticFiles(directory=css_dir), name="css")
if os.path.isdir(js_dir):
    app.mount("/js", StaticFiles(directory=js_dir), name="js")


@app.get("/")
def read_root():
    return FileResponse(os.path.join(TEMPLATES_DIR, "Menu.html"))


@app.get("/player_navigation")
def get_player_navigation_page():
    file_path = os.path.join(TEMPLATES_DIR, "player_navigation.html")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File player_navigation.html not found")
    return FileResponse(file_path)


@app.get("/character_creation")
def get_character_creation_page():
    file_path = os.path.join(TEMPLATES_DIR, "character_creation.html")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File character_creation.html not found")
    return FileResponse(file_path)