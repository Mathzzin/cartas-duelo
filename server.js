const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const SUITS = [
  { symbol: "♠", name: "Espadas", color: "dark" },
  { symbol: "♥", name: "Copas", color: "red" },
  { symbol: "♦", name: "Ouros", color: "red" },
  { symbol: "♣", name: "Paus", color: "dark" }
];
const RANKS = [
  { label: "2", value: 2 }, { label: "3", value: 3 }, { label: "4", value: 4 },
  { label: "5", value: 5 }, { label: "6", value: 6 }, { label: "7", value: 7 },
  { label: "8", value: 8 }, { label: "9", value: 9 }, { label: "10", value: 10 },
  { label: "J", value: 11 }, { label: "Q", value: 12 }, { label: "K", value: 13 },
  { label: "A", value: 14 }
];

function newDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) {
    deck.push({ ...rank, suit: suit.symbol, suitName: suit.name, color: suit.color });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
function publicState(room, socketId) {
  const players = room.players.map((p, i) => ({
    id: p.id, name: p.name, score: p.score, handCount: p.hand.length, seat: i
  }));
  return {
    code: room.code,
    players,
    me: room.players.findIndex(p => p.id === socketId),
    hand: (room.players.find(p => p.id === socketId)?.hand || []),
    table: room.table,
    currentTurn: room.currentTurn,
    round: room.round,
    status: room.status,
    message: room.message,
    lastWinner: room.lastWinner,
    deckCount: room.deck.length
  };
}
function emitRoom(room) {
  for (const p of room.players) io.to(p.id).emit("state", publicState(room, p.id));
}
function findPlayer(room, id) { return room.players.find(p => p.id === id); }
function startRound(room) {
  room.deck = newDeck();
  room.table = [null, null];
  room.players.forEach(p => { p.hand = room.deck.splice(0, 5); });
  room.currentTurn = room.round % 2 === 1 ? 0 : 1;
  room.status = "playing";
  room.message = "Escolha uma carta para jogar.";
  room.lastWinner = null;
}
function createRoom(socket, name) {
  let code = roomCode();
  while (rooms.has(code)) code = roomCode();
  const room = {
    code, players: [{ id: socket.id, name: cleanName(name), score: 0, hand: [] }],
    deck: [], table: [null, null], currentTurn: 0, round: 1,
    status: "waiting", message: "Esperando o segundo jogador entrar…", lastWinner: null
  };
  rooms.set(code, room);
  socket.join(code);
  socket.data.roomCode = code;
  emitRoom(room);
  return room;
}
function cleanName(name) {
  const value = String(name || "").trim().slice(0, 16);
  return value || "Jogador";
}

io.on("connection", socket => {
  socket.on("createRoom", ({ name } = {}) => {
    if (socket.data.roomCode) leaveRoom(socket);
    createRoom(socket, name);
  });

  socket.on("joinRoom", ({ code, name } = {}) => {
    const roomCodeInput = String(code || "").trim().toUpperCase();
    const room = rooms.get(roomCodeInput);
    if (!room) return socket.emit("errorMessage", "Não encontrei essa sala. Confira o código.");
    if (room.players.length >= 2) return socket.emit("errorMessage", "Essa sala já está cheia.");
    if (socket.data.roomCode) leaveRoom(socket);
    room.players.push({ id: socket.id, name: cleanName(name), score: 0, hand: [] });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    room.round = 1;
    startRound(room);
    emitRoom(room);
  });

  socket.on("playCard", ({ index } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== "playing") return;
    const seat = room.players.findIndex(p => p.id === socket.id);
    if (seat !== room.currentTurn || room.table[seat] !== null) return;
    if (!Number.isInteger(index) || index < 0 || index >= room.players[seat].hand.length) return;

    room.table[seat] = room.players[seat].hand.splice(index, 1)[0];
    if (room.table.every(Boolean)) {
      const a = room.table[0], b = room.table[1];
      let winner = a.value === b.value ? -1 : (a.value > b.value ? 0 : 1);
      if (winner === -1) {
        room.message = `Empate! Ambos jogaram ${a.label}. Ninguém ganha ponto.`;
        room.lastWinner = null;
      } else {
        room.players[winner].score++;
        room.message = `${room.players[winner].name} venceu a rodada com ${room.table[winner].label}${room.table[winner].suit}!`;
        room.lastWinner = winner;
      }
      room.status = "roundEnd";
    } else {
      room.currentTurn = 1 - seat;
      room.message = `Agora é a vez de ${room.players[room.currentTurn].name}.`;
    }
    emitRoom(room);
  });

  socket.on("nextRound", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== "roundEnd") return;
    if (room.players.some(p => p.hand.length === 0)) {
      room.status = "gameEnd";
      const [a, b] = room.players;
      room.message = a.score === b.score ? "Partida empatada!" : `${a.score > b.score ? a.name : b.name} venceu a partida!`;
    } else {
      room.round++;
      startRound(room);
    }
    emitRoom(room);
  });

  socket.on("restartGame", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.players.length !== 2) return;
    room.players.forEach(p => p.score = 0);
    room.round = 1;
    startRound(room);
    emitRoom(room);
  });

  socket.on("disconnect", () => leaveRoom(socket));
});

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.leave(code);
  delete socket.data.roomCode;
  if (room) {
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) rooms.delete(code);
    else {
      room.status = "waiting";
      room.table = [null, null];
      room.message = "O outro jogador saiu. Compartilhe o código para jogar novamente.";
      emitRoom(room);
    }
  }
}
server.listen(PORT, () => console.log(`Cartas Duelo disponível em http://localhost:${PORT}`));
