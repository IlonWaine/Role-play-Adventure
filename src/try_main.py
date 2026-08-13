
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from src.connection_manager import manager

app = FastAPI(title="D&D Real-time Backend")

# Дозволяємо фронтенду (наприклад, React на localhost:5173) підключатися до бекенду
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # На продакшені замінити на конкретний домен
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok", "message": "D&D Server is running!"}


@app.websocket("/ws/{room_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_id: str):
    """
    WebSocket з'єднання.
    Приклад URL: ws://localhost:8000/ws/room123/player_dungeon_master
    """
    await manager.connect(websocket, room_id, player_id)
    
    try:
        while True:
            # Очікуємо JSON-повідомлення від клієнта
            data = await websocket.receive_json()
            
            action_type = data.get("action")

            # Приклад 1: Обробка передачі предмета
            if action_type == "TRADE_REQUEST":
                target_player = data.get("target_player")
                await manager.send_personal_message(
                    {
                        "type": "TRADE_OFFER",
                        "from": player_id,
                        "item": data.get("item")
                    },
                    room_id=room_id,
                    player_id=target_player
                )

            # Приклад 2: DM відправляє секрет конкретному гравцю
            elif action_type == "SEND_SECRET":
                target_player = data.get("target_player")
                await manager.send_personal_message(
                    {
                        "type": "SECRET_NOTE",
                        "content": data.get("secret_text")
                    },
                    room_id=room_id,
                    player_id=target_player
                )

            # Приклад 3: Загальне повідомлення / сповіщення на всю кімнату
            elif action_type == "BROADCAST":
                await manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "CHAT_MESSAGE",
                        "sender": player_id,
                        "text": data.get("text")
                    }
                )

    except WebSocketDisconnect:
        manager.disconnect(room_id, player_id)
        await manager.broadcast_to_room(
            room_id,
            {"type": "PLAYER_LEFT", "player_id": player_id}
        )