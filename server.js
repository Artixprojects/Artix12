const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const app = express();

app.get("/", (req, res) => {
  res.send("Multiplayer backend running");
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let rooms = {};

function checkWin(b) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a,b1,c] of lines) {
    if (b[a] && b[a] === b[b1] && b[a] === b[c]) return b[a];
  }
  if (b.every(e => e)) return "draw";
  return null;
}

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    const msg = JSON.parse(data);

    if (msg.type === "join") {
      let room = msg.room;

      if (!rooms[room]) {
        rooms[room] = { players: [], board: Array(9).fill(null), turn: 0 };
      }

      const r = rooms[room];

      if (r.players.length >= 2) {
        ws.send(JSON.stringify({ type: "full" }));
        return;
      }

      ws.room = room;
      ws.playerIndex = r.players.length;
      ws.symbol = ws.playerIndex === 0 ? "X" : "O";
      r.players.push(ws);

      ws.send(JSON.stringify({
        type: "joined",
        symbol: ws.symbol,
        board: r.board,
        turn: r.turn
      }));

      if (r.players.length === 2) {
        r.players.forEach((p) =>
          p.send(JSON.stringify({
            type: "start",
            board: r.board,
            turn: r.turn
          }))
        );
      }
    }

    if (msg.type === "move") {
      const r = rooms[ws.room];
      if (!r) return;

      if (r.turn !== ws.playerIndex) return;

      if (r.board[msg.index]) return;

      r.board[msg.index] = ws.symbol;

      const result = checkWin(r.board);
      if (result) {
        r.players.forEach((p) =>
          p.send(JSON.stringify({
            type: "update",
            board: r.board,
            result
          }))
        );
        r.board = Array(9).fill(null);
        r.turn = 0;
        return;
      }

      r.turn = 1 - r.turn;

      r.players.forEach((p) =>
        p.send(
          JSON.stringify({
            type: "update",
            board: r.board,
            turn: r.turn
          })
        )
      );
    }
  });

  ws.on("close", () => {
    const r = rooms[ws.room];
    if (!r) return;
    r.players = r.players.filter((p) => p !== ws);
    if (r.players.length === 0) delete rooms[ws.room];
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("Server running on " + PORT));
