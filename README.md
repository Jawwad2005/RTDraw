# RTDraw

RTDraw is a realtime collaborative whiteboard. The frontend is a Vite React app, and the backend is now a Django ASGI app using `python-socketio` for the realtime room protocol.

## Features

- Create a new whiteboard room and share its room ID.
- Join an existing room by ID.
- Draw pen strokes in realtime with synced color and thickness.
- Replay room drawing history when a new user joins.
- Clear the board for everyone in the room.
- Delete in-memory room state when the last user disconnects.

## Requirements

- Python 3.11+ recommended
- Node.js 20+ recommended
- npm

## Backend Setup

From the project root:

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn whiteboard.asgi:application --host 0.0.0.0 --port 4000
```

The Django backend will run at `http://localhost:4000`. You can check it with:

```bash
curl http://localhost:4000/health/
```

The whiteboard state is currently in memory, matching the previous backend behavior. Restarting the backend clears all rooms and drawing history.

## Frontend Setup

Open a second terminal from the project root:

```bash
cd client
npm install
npm run dev
```

Vite will print the local frontend URL, usually `http://localhost:5173`.

By default the frontend connects to the backend at `http://localhost:4000`. To use a different backend URL:

```bash
VITE_SOCKET_URL=http://localhost:4000 npm run dev
```

## Run The Whole App

1. Start the backend:

```bash
cd server
source .venv/bin/activate
uvicorn whiteboard.asgi:application --host 0.0.0.0 --port 4000
```

2. Start the frontend in another terminal:

```bash
cd client
npm run dev
```

3. Open the Vite URL in two browser tabs.
4. Click **Create New Room** in one tab.
5. Copy the room ID into the other tab and click **Join**.
6. Draw in either tab and both canvases should update in realtime.

## Backend Socket.IO Events

The Django backend keeps the same Socket.IO contract the previous Node backend used:

- `create-room` returns `{ ok: true, roomId }`.
- `join-room` accepts a room ID and returns `{ ok: true }` or `{ ok: false, error }`.
- `init` sends drawing history to a user after joining a room.
- `draw` accepts `{ roomId, segment }` and broadcasts the segment to other users in the room.
- `clear` accepts a room ID and clears the board for everyone in that room.
