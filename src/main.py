import hashlib
import json
import os
import random
import secrets
import string
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.orm import Session

import database
import database_structure

database_structure.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="D&D Nexus Hub")

# Стискає JSON-відповіді (сценарії з багатьма актами/сценами - найважчі) -
# помітно економить трафік на хостингах з лімітом bandwidth.
app.add_middleware(GZipMiddleware, minimum_size=500)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")


# =============================================================================
# WebSocket: гібридна модель "сигнал -> перезапит".
# Сокет НЕ носить самі повідомлення/дані (щоб не дублювати логіку прав
# доступу з REST-фільтрації), а лише каже клієнту "щось змінилось, онови
# дані через звичайний REST-запит". REST лишається джерелом правди;
# WebSocket лише прибирає затримку опитування.
# =============================================================================
class ConnectionManager:
    def __init__(self):
        self.active: Dict[int, List[WebSocket]] = {}

    async def connect(self, session_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active.setdefault(session_id, []).append(websocket)

    def disconnect(self, session_id: int, websocket: WebSocket):
        conns = self.active.get(session_id)
        if conns and websocket in conns:
            conns.remove(websocket)
            if not conns:
                self.active.pop(session_id, None)

    async def broadcast(self, session_id: int, event_type: str):
        dead = []
        for ws in self.active.get(session_id, []):
            try:
                await ws.send_json({"type": event_type})
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(session_id, ws)


manager = ConnectionManager()


@app.websocket("/ws/sessions/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: int):
    await manager.connect(session_id, websocket)
    try:
        while True:
            # Клієнт шле "ping" раз в ~25с лише щоб з'єднання не відвалилось
            # по таймауту проксі хостингу - вміст ігнорується.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)


# =============================================================================
# Cloudflare R2 (S3-сумісне сховище) - зображення зберігаються тут, а не
# base64 прямо в БД. Клієнт ліниво ініціалізується лише якщо задані
# змінні середовища - без них /api/upload-image поверне зрозумілу помилку
# замість падіння застосунку при старті (зручно для локальної розробки).
# =============================================================================
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL")  # напр. https://pub-xxxx.r2.dev або власний домен

_r2_client = None


def get_r2_client():
    global _r2_client
    if _r2_client is not None:
        return _r2_client

    if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL]):
        raise HTTPException(
            status_code=503,
            detail="Завантаження зображень не налаштоване на сервері (відсутні R2_* змінні середовища).",
        )

    import boto3

    _r2_client = boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )
    return _r2_client


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024  # 8 МБ


@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Приймає файл зображення, кладе його в R2, повертає публічний URL.
    Фронтенд далі використовує цей URL так само, як і будь-яке зовнішнє
    посилання (imageUrl/portrait_data лишаються звичайним текстовим полем)."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Дозволені лише зображення (jpeg/png/webp/gif).")

    contents = await file.read()
    if len(contents) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Файл завеликий (максимум 8 МБ).")

    client = get_r2_client()

    ext = os.path.splitext(file.filename or "")[1] or ".jpg"
    key = f"uploads/{uuid.uuid4().hex}{ext}"

    try:
        client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=key,
            Body=contents,
            ContentType=file.content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Помилка завантаження в сховище: {e}")

    return {"url": f"{R2_PUBLIC_URL.rstrip('/')}/{key}"}


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


class StoryCreateSchema(BaseModel):
    dm_id: int
    title: str = "Нова історія"


class StoryUpdateSchema(BaseModel):
    """
    characters/acts навмисно нетипізовані (List[Dict[str, Any]]):
    сцени всередині acts містять блоки різної форми (опис/візуал/
    вороги/предмети), жорстка Pydantic-схема тут тільки заважала б.
    """
    title: Optional[str] = None
    characters: Optional[List[Dict[str, Any]]] = None
    acts: Optional[List[Dict[str, Any]]] = None


def story_to_dict(s: database_structure.Story) -> dict:
    payload = json.loads(s.data_json or "{}")
    return {
        "id": s.id,
        "dm_id": s.dm_id,
        "title": s.title,
        "characters": payload.get("characters", []),
        "acts": payload.get("acts", []),
    }


class StartSessionSchema(BaseModel):
    dm_id: int
    story_id: int


class SessionStateUpdateSchema(BaseModel):
    """enemy_hp: {block_id: {enemy_index: hp}} - об'єднується (merge) з існуючим станом,
    а не перезаписує його повністю, щоб різні блоки/акти не затирали одне одного."""
    enemy_hp: Optional[Dict[str, Dict[str, int]]] = None
    current_act_id: Optional[str] = None
    current_scene_id: Optional[str] = None


class TradeItemSchema(BaseModel):
    from_character_id: int
    to_character_id: int
    item_index: int


class SendMessageSchema(BaseModel):
    sender_type: str            # "dm" | "player"
    sender_id: Optional[int] = None
    sender_name: str
    recipient_type: str         # "all" | "dm" | "character"
    recipient_id: Optional[int] = None
    message_type: str = "text"  # "text" | "image"
    text: str = ""
    image_url: Optional[str] = None


def generate_room_code() -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


def session_to_dict(session: database_structure.LiveSession, db: Session) -> dict:
    story = db.query(database_structure.Story).get(session.story_id)
    story_payload = json.loads(story.data_json or "{}") if story else {"characters": [], "acts": []}

    participants = []
    for link in story_payload.get("characters", []):
        char_id = link.get("character_id")
        if not char_id:
            continue
        char = db.query(database_structure.Character).get(char_id)
        if not char:
            continue
        participants.append({
            **character_to_dict(char),
            "goal": link.get("goal", ""),
            "story_title": link.get("title", ""),
        })

    return {
        "id": session.id,
        "dm_id": session.dm_id,
        "story_id": session.story_id,
        "story_title": story.title if story else "",
        "room_code": session.room_code,
        "is_active": session.is_active,
        "state": json.loads(session.state_json or "{}"),
        "acts": story_payload.get("acts", []),
        "participants": participants,
    }


def message_to_dict(m: database_structure.SessionMessage) -> dict:
    return {
        "id": m.id,
        "session_id": m.session_id,
        "sender_type": m.sender_type,
        "sender_id": m.sender_id,
        "sender_name": m.sender_name,
        "recipient_type": m.recipient_type,
        "recipient_id": m.recipient_id,
        "message_type": m.message_type,
        "text": m.text,
        "image_url": m.image_url,
        "created_at": m.created_at.isoformat() if m.created_at else None,
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
            # Публічний ID для гравця: "DM_ID-PLAYER_ID" -> унікальний навіть
            # якщо у різних DM випадково збігається внутрішній player.id.
            "player_code": f"{p.dm_id}-{p.id}",
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
    return {
        "id": new_player.id,
        "name": new_player.name,
        "player_code": f"{new_player.dm_id}-{new_player.id}",
        "characters": [],
    }


@app.delete("/api/players/{player_id}")
def delete_player(player_id: int, db: Session = Depends(database.get_db)):
    player = db.query(database_structure.Player).get(player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Гравця не знайдено")
    db.delete(player)
    db.commit()
    return {"message": "Гравця видалено"}


@app.get("/api/players/lookup/{player_code}")
def lookup_player(player_code: str, db: Session = Depends(database.get_db)):
    """
    Гравцівський вхід за публічним кодом "DM_ID-PLAYER_ID".
    Формат навмисно складений з двох частин, щоб гравці різних DM
    не могли випадково (чи навмисно) підібрати чужий числовий ID.
    """
    parts = player_code.strip().split("-")
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        raise HTTPException(
            status_code=400,
            detail="Невірний формат ID. Очікується формат ДМ-Гравець, напр. 3-15",
        )

    dm_id, player_id = int(parts[0]), int(parts[1])
    player = db.query(database_structure.Player).filter(
        database_structure.Player.id == player_id,
        database_structure.Player.dm_id == dm_id,
    ).first()

    if not player:
        raise HTTPException(status_code=404, detail="Гравця з таким ID не знайдено")

    return {
        "id": player.id,
        "name": player.name,
        "player_code": f"{player.dm_id}-{player.id}",
        "characters": [
            {"id": c.id, "name": c.name, "role": c.role}
            for c in player.characters
        ],
    }


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
# API: Stories (Історії / Пригоди)
# =============================================================================
@app.get("/api/dm/{dm_id}/stories")
def get_dm_stories(dm_id: int, db: Session = Depends(database.get_db)):
    """Список історій конкретного DM (лише id + назва, без важкого JSON)."""
    stories = db.query(database_structure.Story).filter(
        database_structure.Story.dm_id == dm_id
    ).all()
    return [{"id": s.id, "title": s.title} for s in stories]


@app.post("/api/stories", status_code=status.HTTP_201_CREATED)
def create_story(data: StoryCreateSchema, db: Session = Depends(database.get_db)):
    """DM тисне '+ Нова історія' у story_navigation -> створюємо порожню
    заготовку і повертаємо її id, щоб фронтенд одразу перейшов у редактор."""
    dm = db.query(database_structure.DMUser).get(data.dm_id)
    if not dm:
        raise HTTPException(status_code=404, detail="DM не знайдено")

    new_story = database_structure.Story(
        dm_id=data.dm_id,
        title=data.title or "Нова історія",
        data_json=json.dumps({"characters": [], "acts": []}),
    )
    db.add(new_story)
    db.commit()
    db.refresh(new_story)
    return story_to_dict(new_story)


@app.get("/api/stories/{story_id}")
def get_story(story_id: int, db: Session = Depends(database.get_db)):
    story = db.query(database_structure.Story).get(story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Історію не знайдено")
    return story_to_dict(story)


@app.put("/api/stories/{story_id}")
def update_story(story_id: int, data: StoryUpdateSchema, db: Session = Depends(database.get_db)):
    story = db.query(database_structure.Story).get(story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Історію не знайдено")

    if data.title is not None:
        story.title = data.title

    existing_payload = json.loads(story.data_json or "{}")
    if data.characters is not None:
        existing_payload["characters"] = data.characters
    if data.acts is not None:
        existing_payload["acts"] = data.acts
    story.data_json = json.dumps(existing_payload)

    db.commit()
    db.refresh(story)
    return story_to_dict(story)


@app.delete("/api/stories/{story_id}")
def delete_story(story_id: int, db: Session = Depends(database.get_db)):
    story = db.query(database_structure.Story).get(story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Історію не знайдено")
    db.delete(story)
    db.commit()
    return {"message": "Історію видалено"}


# =============================================================================
# API: Live Sessions (Жива гра)
# =============================================================================
@app.post("/api/sessions", status_code=status.HTTP_201_CREATED)
def start_session(data: StartSessionSchema, db: Session = Depends(database.get_db)):
    """DM запускає гру з готової історії. Учасники беруться прямо з
    story.characters (персонажі, вже прив'язані DM у редакторі історії)."""
    story = db.query(database_structure.Story).get(data.story_id)
    if not story or story.dm_id != data.dm_id:
        raise HTTPException(status_code=404, detail="Історію не знайдено")

    code = generate_room_code()
    while db.query(database_structure.LiveSession).filter(
        database_structure.LiveSession.room_code == code
    ).first():
        code = generate_room_code()

    session = database_structure.LiveSession(dm_id=data.dm_id, story_id=data.story_id, room_code=code)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session_to_dict(session, db)


@app.get("/api/dm/{dm_id}/sessions")
def get_dm_sessions(dm_id: int, include_ended: bool = False, db: Session = Depends(database.get_db)):
    """Сесії DM. За замовчуванням лише активні (щоб продовжити гру);
    include_ended=true також повертає завершені (для ручного видалення)."""
    query = db.query(database_structure.LiveSession).filter(
        database_structure.LiveSession.dm_id == dm_id
    )
    if not include_ended:
        query = query.filter(database_structure.LiveSession.is_active == True)  # noqa: E712

    sessions = query.order_by(database_structure.LiveSession.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "room_code": s.room_code,
            "story_id": s.story_id,
            "story_title": s.story.title if s.story else "",
            "is_active": s.is_active,
        }
        for s in sessions
    ]


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: int, db: Session = Depends(database.get_db)):
    """Повне ручне видалення сесії разом з її чатом (не плутати з /end,
    яке лише позначає сесію завершеною й лишає історію)."""
    session = db.query(database_structure.LiveSession).get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Сесію не знайдено")

    db.query(database_structure.SessionMessage).filter(
        database_structure.SessionMessage.session_id == session_id
    ).delete()
    db.delete(session)
    db.commit()
    return {"message": "Сесію видалено"}


@app.get("/api/sessions/by-room/{room_code}")
def get_session_by_room(room_code: str, db: Session = Depends(database.get_db)):
    """Вхід гравця за кодом кімнати."""
    session = db.query(database_structure.LiveSession).filter(
        database_structure.LiveSession.room_code == room_code.strip().upper(),
        database_structure.LiveSession.is_active == True,  # noqa: E712
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Сесію з таким кодом не знайдено, або вона вже завершена")
    return session_to_dict(session, db)


@app.get("/api/sessions/{session_id}")
def get_session(session_id: int, db: Session = Depends(database.get_db)):
    session = db.query(database_structure.LiveSession).get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Сесію не знайдено")
    return session_to_dict(session, db)


@app.put("/api/sessions/{session_id}/state")
async def update_session_state(session_id: int, data: SessionStateUpdateSchema, db: Session = Depends(database.get_db)):
    """Живий стан бою (HP ворогів, поточна сцена) - зберігається окремо
    від шаблону історії, щоб не псувати сценарій для повторного використання."""
    session = db.query(database_structure.LiveSession).get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Сесію не знайдено")

    state = json.loads(session.state_json or "{}")
    payload = data.dict(exclude_unset=True)

    if payload.get("enemy_hp") is not None:
        state.setdefault("enemy_hp", {})
        for block_id, enemies in payload["enemy_hp"].items():
            state["enemy_hp"].setdefault(block_id, {})
            state["enemy_hp"][block_id].update(enemies)
    if "current_act_id" in payload:
        state["current_act_id"] = payload["current_act_id"]
    if "current_scene_id" in payload:
        state["current_scene_id"] = payload["current_scene_id"]

    session.state_json = json.dumps(state)
    db.commit()

    await manager.broadcast(session_id, "state")
    return {"state": state}


@app.post("/api/sessions/{session_id}/end")
def end_session(session_id: int, db: Session = Depends(database.get_db)):
    """Завершення гри. Зміни персонажів (HP/інвентар/монети/уміння) вже
    збережені в БД - вони пишуться відразу при кожній дії, а не в кінці."""
    session = db.query(database_structure.LiveSession).get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Сесію не знайдено")
    session.is_active = False
    session.ended_at = datetime.utcnow()
    db.commit()
    return {"message": "Сесію завершено"}


# =============================================================================
# Обслуговування / очищення старих даних.
# Викликається вручну (з адмінського запиту чи кнопки), можна повісити й на
# cron/scheduled job хостингу - спеціального планувальника не додано, щоб не
# ускладнювати деплой на безкоштовних тарифах без підтримки cron.
# =============================================================================
@app.post("/api/maintenance/cleanup-sessions")
def cleanup_old_sessions(days: int = 30, db: Session = Depends(database.get_db)):
    """
    Видаляє чат (SessionMessage) і самі LiveSession для ігор, завершених
    понад `days` днів тому. Дані персонажів (HP/інвентар/тощо) НЕ чіпає -
    вони вже давно й назавжди в таблиці Character, це стосується лише
    "сміття" живої сесії (чат, стан бою).
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    old_sessions = db.query(database_structure.LiveSession).filter(
        database_structure.LiveSession.is_active == False,  # noqa: E712
        database_structure.LiveSession.ended_at != None,  # noqa: E711
        database_structure.LiveSession.ended_at < cutoff,
    ).all()

    deleted_sessions = 0
    deleted_messages = 0

    for session in old_sessions:
        msgs_deleted = db.query(database_structure.SessionMessage).filter(
            database_structure.SessionMessage.session_id == session.id
        ).delete()
        deleted_messages += msgs_deleted
        db.delete(session)
        deleted_sessions += 1

    db.commit()

    return {
        "deleted_sessions": deleted_sessions,
        "deleted_messages": deleted_messages,
        "cutoff_days": days,
    }


@app.post("/api/maintenance/vacuum")
def run_vacuum(db: Session = Depends(database.get_db)):
    """
    VACUUM звільняє місце на диску після масових видалень - SQLite/Postgres
    самі його НЕ зменшують автоматично одразу після DELETE.
    Викликати після cleanup-sessions, якщо видалили багато рядків.
    Постгрес зазвичай сам робить це через autovacuum, тому для нього цей
    виклик менш критичний, але не шкодить.
    """
    try:
        db.execute(text("VACUUM"))
        db.commit()
        return {"message": "VACUUM виконано"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Помилка VACUUM: {e}")


@app.post("/api/sessions/{session_id}/trade")
async def trade_item(session_id: int, data: TradeItemSchema, db: Session = Depends(database.get_db)):
    """Передача одного предмета з інвентарю одного персонажа іншому."""
    session = db.query(database_structure.LiveSession).get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Сесію не знайдено")

    from_char = db.query(database_structure.Character).get(data.from_character_id)
    to_char = db.query(database_structure.Character).get(data.to_character_id)
    if not from_char or not to_char:
        raise HTTPException(status_code=404, detail="Персонажа не знайдено")

    from_inventory = json.loads(from_char.inventory_json or "[]")
    if data.item_index < 0 or data.item_index >= len(from_inventory):
        raise HTTPException(status_code=400, detail="Невірний індекс предмета")

    item = from_inventory.pop(data.item_index)
    to_inventory = json.loads(to_char.inventory_json or "[]")
    to_inventory.append(item)

    from_char.inventory_json = json.dumps(from_inventory)
    to_char.inventory_json = json.dumps(to_inventory)
    db.commit()

    await manager.broadcast(session_id, "inventory")

    return {
        "item": item,
        "from_character": character_to_dict(from_char),
        "to_character": character_to_dict(to_char),
    }


# =============================================================================
# API: Session Chat
# =============================================================================
@app.post("/api/sessions/{session_id}/messages", status_code=status.HTTP_201_CREATED)
async def send_message(session_id: int, data: SendMessageSchema, db: Session = Depends(database.get_db)):
    session = db.query(database_structure.LiveSession).get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Сесію не знайдено")

    msg = database_structure.SessionMessage(
        session_id=session_id,
        sender_type=data.sender_type,
        sender_id=data.sender_id,
        sender_name=data.sender_name,
        recipient_type=data.recipient_type,
        recipient_id=data.recipient_id,
        message_type=data.message_type,
        text=data.text,
        image_url=data.image_url,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    await manager.broadcast(session_id, "chat")
    return message_to_dict(msg)


@app.get("/api/sessions/{session_id}/messages")
def get_messages(
    session_id: int,
    viewer_type: str,
    viewer_id: Optional[int] = None,
    after_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
):
    """
    viewer_type: "dm" (бачить усе листування сесії) | "character" (бачить
    загальний чат + DM-оголошення + власне приватне листування).

    after_id: якщо задано, повертає лише повідомлення з id > after_id
    (delta-підвантаження) - замість повної історії при кожному опитуванні,
    що з часом стає дедалі важчим запитом і трафіком.
    """
    query = db.query(database_structure.SessionMessage).filter(
        database_structure.SessionMessage.session_id == session_id
    )
    if after_id is not None:
        query = query.filter(database_structure.SessionMessage.id > after_id)

    all_msgs = query.order_by(database_structure.SessionMessage.id.asc()).all()

    if viewer_type == "dm":
        visible = all_msgs
    else:
        visible = [
            m for m in all_msgs
            if m.recipient_type == "all"
            or (m.recipient_type == "dm" and m.sender_id == viewer_id)
            or (m.recipient_type == "character" and (m.recipient_id == viewer_id or m.sender_id == viewer_id))
        ]

    return [message_to_dict(m) for m in visible]


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


@app.get("/story_navigation")
def get_story_navigation_page():
    file_path = os.path.join(TEMPLATES_DIR, "story_navigation.html")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File story_navigation.html not found")
    return FileResponse(file_path)


@app.get("/dm_create")
def get_dm_create_page():
    file_path = os.path.join(TEMPLATES_DIR, "DM_create.html")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File DM_create.html not found")
    return FileResponse(file_path)


@app.get("/session_setup")
def get_session_setup_page():
    file_path = os.path.join(TEMPLATES_DIR, "session_setup.html")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File session_setup.html not found")
    return FileResponse(file_path)


@app.get("/dm_live")
def get_dm_live_page():
    file_path = os.path.join(TEMPLATES_DIR, "dm_live.html")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File dm_live.html not found")
    return FileResponse(file_path)


@app.get("/character_ui")
def get_character_ui_page():
    file_path = os.path.join(TEMPLATES_DIR, "character_UI.html")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File character_UI.html not found")
    return FileResponse(file_path)