const board = document.getElementById("board");
const status = document.getElementById("status");
let mySymbol = null;
let myTurn = false;

const ws = new WebSocket(
  location.protocol === "https:"
    ? "wss://" + location.host
    : "ws://" + location.host
);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "assign") {
    mySymbol = data.symbol;
    myTurn = mySymbol === "X";
    status.innerText = "You are " + mySymbol;
  }

  if (data.type === "move") {
    document.getElementById(data.id).innerText = data.symbol;
    myTurn = true;
  }
};

for (let i = 0; i < 9; i++) {
  const cell = document.createElement("div");
  cell.className = "cell";
  cell.id = i;
  cell.onclick = () => {
    if (!myTurn || cell.innerText) return;
    cell.innerText = mySymbol;
    ws.send(JSON.stringify({ type: "move", id: i, symbol: mySymbol }));
    myTurn = false;
  };
  board.appendChild(cell);
}
