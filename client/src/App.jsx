import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:4000");

export default function App() {
  // UI state
  const [joined, setJoined] = useState(false);
  const [roomIdInput, setRoomIdInput] = useState("");
  const [currentRoom, setCurrentRoom] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [socketReady, setSocketReady] = useState(false);
  const [pendingHistory, setPendingHistory] = useState(null);

  // Drawing controls
  const [color, setColor] = useState("#000000");
  const [thickness, setThickness] = useState(3);
  const [tool, setTool] = useState("pen");

  // Canvas refs
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  // Helper: draw a single segment with its own style
  const drawSegment = useCallback((ctx, seg) => {
    if (!ctx || !seg) {
      console.warn("[drawSegment] Missing ctx or segment:", { ctx: !!ctx, seg });
      return false;
    }
    
    const { px, py, x, y, color, thickness } = seg;
    
    // Validate segment data
    if (typeof px !== 'number' || typeof py !== 'number' || 
        typeof x !== 'number' || typeof y !== 'number') {
      console.warn("[drawSegment] Invalid segment coordinates:", seg);
      return false;
    }
    
    console.log(`[drawSegment] Drawing from (${px}, ${py}) to (${x}, ${y}) with color ${color}, thickness ${thickness}`);
    
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.strokeStyle = color || '#000000';
    ctx.lineWidth = thickness || 3;
    ctx.stroke();
    return true;
  }, []);

  // Setup socket listeners FIRST, before any room operations
  useEffect(() => {
    console.log("[socket] Setting up socket listeners");

    const onConnect = () => {
      console.log("[socket] Connected to server");
      setSocketReady(true);
    };

    const onDraw = (segment) => {
      console.log("[onDraw] Received segment:", segment);
      if (ctxRef.current) {
        drawSegment(ctxRef.current, segment);
      }
    };

    const onInit = (history) => {
      console.log(`[onInit] Received history: ${history.length} segments`, history);
      if (ctxRef.current) {
        // Clear canvas first
        ctxRef.current.clearRect(0, 0, 960, 640);
        // Draw all history segments
        history.forEach(seg => {
          drawSegment(ctxRef.current, seg);
        });
        console.log("[onInit] History applied to canvas");
        setPendingHistory(null); // Clear pending history
      } else {
        console.log("[onInit] Canvas context not ready, storing history for later");
        setPendingHistory(history); // Store history for when canvas is ready
      }
    };

    const onClear = () => {
      console.log("[onClear] Board cleared");
      if (ctxRef.current) {
        ctxRef.current.clearRect(0, 0, 960, 640);
      }
    };

    const onDisconnect = () => {
      console.log("[socket] Disconnected from server");
      setSocketReady(false);
    };

    // Set up all socket listeners
    socket.on("connect", onConnect);
    socket.on("draw", onDraw);
    socket.on("init", onInit);
    socket.on("clear", onClear);
    socket.on("disconnect", onDisconnect);

    // Check if already connected
    if (socket.connected) {
      setSocketReady(true);
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("draw", onDraw);
      socket.off("init", onInit);
      socket.off("clear", onClear);
      socket.off("disconnect", onDisconnect);
    };
  }, [drawSegment]);

  // Setup canvas when joined
  useEffect(() => {
    if (!joined) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Prevent duplicate setup
    if (ctxRef.current) {
      console.log("[canvas] Canvas already set up, skipping");
      return;
    }
    
    console.log("[canvas] Setting up canvas");
    canvas.width = 960;
    canvas.height = 640;

    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
    
    console.log("[canvas] Canvas context ready");
    
    // Apply pending history if we have any
    if (pendingHistory && pendingHistory.length > 0) {
      console.log(`[canvas] Applying pending history: ${pendingHistory.length} segments`);
      console.log("[canvas] First few segments:", pendingHistory.slice(0, 3));
      ctx.clearRect(0, 0, 960, 640);
      
      let drawnCount = 0;
      pendingHistory.forEach((seg, index) => {
        if (drawSegment(ctx, seg)) {
          drawnCount++;
        }
      });
      
      setPendingHistory(null);
      console.log(`[canvas] Applied ${drawnCount}/${pendingHistory.length} segments to canvas`);
    }
  }, [joined, pendingHistory, drawSegment]);

  // Helper: safe canvas-relative coords
  const getCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Mouse handlers
  const handlePointerDown = (e) => {
    if (!joined || !ctxRef.current) return;
    if (tool !== "pen") return;

    drawingRef.current = true;
    const { x, y } = getCoords(e);
    lastPosRef.current = { x, y };
  };

  const handlePointerMove = (e) => {
    if (!joined || !drawingRef.current || !ctxRef.current) return;
    if (tool !== "pen") return;

    const ctx = ctxRef.current;
    const { x, y } = getCoords(e);
    const { x: px, y: py } = lastPosRef.current;

    // Create segment data
    const segment = { px, py, x, y, color, thickness, tool: "pen" };

    // Draw locally first
    drawSegment(ctx, segment);

    // Send to room
    socket.emit("draw", {
      roomId: currentRoom,
      segment: segment,
    });

    lastPosRef.current = { x, y };
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
  };

  // Room actions - only allow when socket is ready
  const createRoom = () => {
    if (!socketReady) {
      setErrorMsg("Connecting to server...");
      return;
    }

    console.log("[createRoom] Creating new room");
    socket.emit("create-room", (res) => {
      console.log("[createRoom] Server response:", res);
      if (res?.ok) {
        setCurrentRoom(res.roomId);
        setJoined(true);
        setErrorMsg("");
        console.log("[createRoom] Created and joined room:", res.roomId);
        // When creating a room, there's no history, so we just have a clean canvas
        if (ctxRef.current) {
          ctxRef.current.clearRect(0, 0, 960, 640);
        }
      } else {
        setErrorMsg("Could not create room");
      }
    });
  };

  const joinRoom = () => {
    if (!socketReady) {
      setErrorMsg("Connecting to server...");
      return;
    }

    if (!roomIdInput.trim()) {
      setErrorMsg("Enter a room ID");
      return;
    }

    const roomId = roomIdInput.trim();
    console.log("[joinRoom] Attempting to join room:", roomId);
    
    socket.emit("join-room", roomId, (res) => {
      console.log("[joinRoom] Server response:", res);
      if (res?.ok) {
        setCurrentRoom(roomId);
        setJoined(true);
        setErrorMsg("");
        console.log("[joinRoom] Successfully joined:", roomId);
      } else {
        setErrorMsg(res?.error || "Room not found");
      }
    });
  };

  const clearRoom = () => {
    if (!currentRoom) return;
    console.log("[clearRoom] Clearing room:", currentRoom);
    socket.emit("clear", currentRoom);
  };

  const leaveRoom = () => {
    setJoined(false);
    setCurrentRoom("");
    setRoomIdInput("");
    setErrorMsg("");
    if (ctxRef.current) {
      ctxRef.current.clearRect(0, 0, 960, 640);
    }
  };

  // UI
  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow p-6 space-y-4">
          <h1 className="text-2xl font-semibold text-gray-900">Join a Whiteboard Room</h1>
          
          {!socketReady && (
            <div className="p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
              <p className="text-sm text-yellow-700">Connecting to server...</p>
            </div>
          )}

          <button
            onClick={createRoom}
            disabled={!socketReady}
            className="w-full rounded-lg py-2 px-4 bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Create New Room
          </button>

          <div className="flex items-center gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2"
              placeholder="Enter Room ID"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
              disabled={!socketReady}
            />
            <button
              onClick={joinRoom}
              disabled={!socketReady}
              className="rounded-lg py-2 px-4 bg-gray-900 text-white font-medium hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Join
            </button>
          </div>

          {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}

          <p className="text-xs text-gray-500">
            Tip: Share a room ID with your teammate so you both draw in the same space.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen grid grid-cols-[280px_1fr]">
      <aside className="border-r bg-gray-50 p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Room</h2>
          <p className="text-sm text-gray-700">
            ID: <span className="font-mono">{currentRoom}</span>
          </p>
          <button
            onClick={leaveRoom}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Leave Room
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full h-10 p-0 border rounded"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Thickness: {thickness}px</label>
          <input
            type="range"
            min="1"
            max="32"
            value={thickness}
            onChange={(e) => setThickness(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Tool</label>
          <select
            value={tool}
            onChange={(e) => setTool(e.target.value)}
            className="w-full border rounded px-3 py-2"
            disabled
            title="Shapes coming soon"
          >
            <option value="pen">Pen</option>
          </select>
        </div>

        <button
          onClick={clearRoom}
          className="w-full rounded-lg py-2 px-4 bg-red-600 text-white font-medium hover:bg-red-700"
        >
          Clear Board
        </button>

        <p className="text-xs text-gray-500">
          Invite others with the room ID. They'll see your drawing history on join.
        </p>
      </aside>

      <main className="flex items-center justify-center bg-gray-100">
        <canvas
          ref={canvasRef}
          className="bg-white border rounded-xl shadow cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </main>
    </div>
  );
}
