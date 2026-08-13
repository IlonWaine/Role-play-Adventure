from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # Структура: { "room_id": { "player_id": WebSocket } }
        self.active_rooms: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, player_id: str):
        await websocket.accept()
        
        # Якщо кімнати ще немає — створюємо її
        if room_id not in self.active_rooms:
            self.active_rooms[room_id] = {}
            
        # Додаємо гравця у відповідну кімнату
        self.active_rooms[room_id][player_id] = websocket
        
        # Сповіщаємо кімнату про нове підключення
        await self.broadcast_to_room(
            room_id, 
            {"type": "PLAYER_JOINED", "player_id": player_id}
        )

    def disconnect(self, room_id: str, player_id: str):
        if room_id in self.active_rooms and player_id in self.active_rooms[room_id]:
            del self.active_rooms[room_id][player_id]
            # Якщо в кімнаті нікого не залишилось — видаляємо кімнату
            if not self.active_rooms[room_id]:
                del self.active_rooms[room_id]

    async def send_personal_message(self, message: dict, room_id: str, player_id: str):
        """Надіслати приватне повідомлення конкретному гравцю (для секретів/обміну)"""
        if room_id in self.active_rooms and player_id in self.active_rooms[room_id]:
            websocket = self.active_rooms[room_id][player_id]
            await websocket.send_json(message)

    async def broadcast_to_room(self, room_id: str, message: dict):
        """Надіслати повідомлення усім у кімнаті"""
        if room_id in self.active_rooms:
            for connection in self.active_rooms[room_id].values():
                await connection.send_json(message)


# Створюємо єдиний екземпляр менеджера
manager = ConnectionManager()