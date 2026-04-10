import random
import string

import socketio


sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
)

rooms = {}


def make_room_id(length=6):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


@sio.event
async def connect(sid, environ, auth):
    print(f"[socket.io] New connection: {sid}")


@sio.on("create-room")
async def create_room(sid):
    room_id = make_room_id()
    while room_id in rooms:
        room_id = make_room_id()

    rooms[room_id] = {"users": set(), "history": []}
    rooms[room_id]["users"].add(sid)
    await sio.enter_room(sid, room_id)
    print(f"[create-room] Room created: {room_id} by {sid}")
    return {"ok": True, "roomId": room_id}


@sio.on("join-room")
async def join_room(sid, room_id):
    room = rooms.get(room_id)
    if not room:
        print(f"[join-room] Room not found: {room_id}")
        return {"ok": False, "error": "Room not found"}

    room["users"].add(sid)
    await sio.enter_room(sid, room_id)
    print(
        f"[join-room] {sid} joined {room_id} "
        f"(history length: {len(room['history'])})"
    )
    await sio.emit("init", room["history"], to=sid)
    return {"ok": True}


@sio.event
async def draw(sid, data):
    room_id = data.get("roomId") if isinstance(data, dict) else None
    segment = data.get("segment") if isinstance(data, dict) else None
    room = rooms.get(room_id)

    if not room:
        print(f"[draw] Room not found: {room_id}")
        return

    room["history"].append(segment)
    print(
        f"[draw] Segment added to room {room_id}: {segment} "
        f"Room history length: {len(room['history'])}"
    )
    await sio.emit("draw", segment, room=room_id, skip_sid=sid)


@sio.event
async def clear(sid, room_id):
    room = rooms.get(room_id)
    if not room:
        return

    room["history"] = []
    print(f"[clear] Room history cleared for {room_id}")
    await sio.emit("clear", room=room_id)


@sio.event
async def disconnect(sid):
    print(f"[disconnect] User disconnected: {sid}")
    empty_room_ids = []

    for room_id, room in rooms.items():
        if sid in room["users"]:
            room["users"].remove(sid)
            print(f"[disconnect] Removing {sid} from {room_id}")
            if not room["users"]:
                empty_room_ids.append(room_id)

    for room_id in empty_room_ids:
        print(f"[disconnect] Deleting empty room: {room_id}")
        del rooms[room_id]
