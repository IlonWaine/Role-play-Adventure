from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class DMUser(Base):
    __tablename__ = "dm_users"

    id = Column(Integer, primary_key=True, index=True)
    nickname = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)  # зберігається як "salt$hash" (див. main.py)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Зв'язок із гравцями
    players = relationship("Player", back_populates="dm", cascade="all, delete-orphan")
    stories = relationship("Story", back_populates="dm", cascade="all, delete-orphan")


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    dm_id = Column(Integer, ForeignKey("dm_users.id"), nullable=False, index=True)

    # Зв'язки
    dm = relationship("DMUser", back_populates="players")
    characters = relationship("Character", back_populates="player", cascade="all, delete-orphan")


class Character(Base):
    """
    Повна картка персонажа — відповідає полям, які реально є
    у character_creation.html / character_creation_logic.js.
    """
    __tablename__ = "characters"

    id = Column(Integer, primary_key=True, index=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, index=True)

    name = Column(String, nullable=False, default="Новий герой")
    role = Column(String, nullable=True, default="")       # "Роль / Клас"
    session = Column(String, nullable=True, default="")    # "Ігрова Сесія (D&D Room)"

    current_hp = Column(Integer, default=10)
    max_hp = Column(Integer, default=10)
    ac = Column(Integer, default=10)
    max_slots = Column(Integer, default=10)

    gp = Column(Integer, default=0)
    sp = Column(Integer, default=0)
    cp = Column(Integer, default=0)

    # Зберігаємо як JSON-текст, бо це змінні за структурою списки
    stats_json = Column(Text, default="[]")       # [{name, val}, ...]
    abilities_json = Column(Text, default="[]")   # [{title, principle, desc, actionType}, ...]
    inventory_json = Column(Text, default="[]")   # [{name, qty, desc}, ...]

    backstory = Column(Text, default="")
    portrait_data = Column(Text, default="")       # URL або base64

    # Зв'язок
    player = relationship("Player", back_populates="characters")


class Story(Base):
    """
    Історія/пригода DM. Персонажі-учасники, акти, сцени та їх блоки
    (опис/візуал/вороги/предмети) мають свідомо змінну, вкладену
    структуру - тому зберігаємо їх одним JSON-блобом, а не окремими
    таблицями. 'title' винесено окремою колонкою для списку історій.
    """
    __tablename__ = "stories"

    id = Column(Integer, primary_key=True, index=True)
    dm_id = Column(Integer, ForeignKey("dm_users.id"), nullable=False, index=True)

    title = Column(String, nullable=False, default="Нова історія")
    # {"characters": [...], "acts": [...]} - формат ідентичний adventureData
    # у DM_create.html
    data_json = Column(Text, default='{"characters": [], "acts": []}')

    created_at = Column(DateTime, default=datetime.utcnow)

    dm = relationship("DMUser", back_populates="stories")


class LiveSession(Base):
    """
    Жива ігрова сесія: DM запускає її з готової Історії (Story).
    Учасники сесії = story.characters (вже містить character_id/player_id/goal),
    окрема таблиця участі не потрібна. Живий стан бою (HP ворогів під час сесії)
    зберігається окремо від шаблону історії, щоб не псувати сценарій для
    повторного використання.
    """
    __tablename__ = "live_sessions"

    id = Column(Integer, primary_key=True, index=True)
    dm_id = Column(Integer, ForeignKey("dm_users.id"), nullable=False, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False, index=True)

    room_code = Column(String, unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True)

    # {"enemy_hp": {block_id: {enemy_index: hp}}, "current_act_id":.., "current_scene_id":..}
    state_json = Column(Text, default='{"enemy_hp": {}}')

    created_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)  # проставляється при /end - потрібно для очищення старих сесій

    dm = relationship("DMUser")
    story = relationship("Story")


class SessionMessage(Base):
    """Повідомлення чату живої сесії (загал / DM-шепіт / приватні між персонажами)."""
    __tablename__ = "session_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("live_sessions.id"), nullable=False, index=True)

    sender_type = Column(String, nullable=False)      # "dm" | "player"
    sender_id = Column(Integer, nullable=True)          # dm_id або character_id
    sender_name = Column(String, nullable=False)

    recipient_type = Column(String, nullable=False)    # "all" | "dm" | "character"
    recipient_id = Column(Integer, nullable=True)        # character_id, якщо recipient_type == "character"

    message_type = Column(String, default="text")        # "text" | "image"
    text = Column(Text, default="")
    image_url = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)