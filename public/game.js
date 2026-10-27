const socket = io();
const $ = id => document.getElementById(id);
let state = null;
let mySeat = -1;

socket.on("connect", () => { $("connection").textContent = "Conectado"; });
socket.on("disconnect", () => { $("connection").textContent = "Reconectando…"; });
socket.on("errorMessage", msg => { $("lobbyError").textContent = msg; });
socket.on("state", s => {
  state = s;
  mySeat = s.me;
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("roomLabel").textContent = s.code;
  $("message").textContent = s.message || "";
  $("roundLabel").textContent = `RODADA ${String(s.round).padStart(2, "0")}`;
  for (let i = 0; i < 2; i++) {
    const p = s.players[i];
    $( "name" + i).textContent = p ? p.name : "Esperando…";
    $("score" + i).textContent = p ? p.score : "—";
    $("state" + i).textContent = !p ? "Aguardando jogador" :
      (s.status === "playing" && s.currentTurn === i && !s.table[i] ? "Sua vez de jogar" :
      (s.table[i] ? "Carta jogada" : "Aguardando"));
    $("playedName" + i).textContent = p ? p.name : "Lugar vazio";
    renderPlayed(i, s.table[i]);
  }
  const myTurn = s.status === "playing" && s.currentTurn === mySeat && !s.table[mySeat];
  $("handCount").textContent = `${s.hand.length} CARTAS`;
  renderHand(s.hand, myTurn);
  const actions = s.status === "roundEnd" || s.status === "gameEnd";
  $("roundActions").classList.toggle("hidden", !actions);
  $("nextBtn").classList.toggle("hidden", s.status !== "roundEnd");
  $("restartBtn").classList.toggle("hidden", s.status !== "gameEnd");
  $("nextBtn").disabled = s.players.length !== 2;
  $("restartBtn").disabled = s.players.length !== 2;
  if (s.status === "waiting") {
    $("message").textContent = `${s.message} Código: ${s.code}`;
  }
});

function cardMarkup(card, extra = "") {
  if (!card) return `<div class="card back"><span>✳</span></div>`;
  return `<div class="card ${card.color} ${extra}">
    <span class="rank">${card.label}</span><span class="suit">${card.suit}</span>
    <span class="rank-bottom">${card.label}</span>
  </div>`;
}
function renderPlayed(i, card) {
  $("played" + i).outerHTML = `<div id="played${i}" class="card-slot">${cardMarkup(card)}</div>`;
  const slot = $("played" + i).firstElementChild;
  slot.style.width = "83px";
  slot.style.height = "116px";
}
function renderHand(hand, enabled) {
  const container = $("hand");
  container.innerHTML = "";
  if (!hand.length) {
    container.innerHTML = '<p class="empty">Você não tem mais cartas na mão.</p>';
    return;
  }
  hand.forEach((card, index) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = cardMarkup(card, enabled ? "" : "disabled");
    const element = wrapper.firstElementChild;
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", enabled ? "0" : "-1");
    element.setAttribute("aria-label", `Jogar ${card.label} de ${card.suitName}`);
    if (enabled) {
      element.addEventListener("click", () => socket.emit("playCard", { index }));
      element.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") socket.emit("playCard", { index });
      });
    }
    container.appendChild(element);
  });
}
$("createBtn").addEventListener("click", () => {
  $("lobbyError").textContent = "";
  socket.emit("createRoom", { name: $("playerName").value });
});
$("joinBtn").addEventListener("click", () => {
  $("lobbyError").textContent = "";
  socket.emit("joinRoom", { code: $("roomCode").value, name: $("playerName").value });
});
$("roomCode").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5));
$("copyBtn").addEventListener("click", async () => {
  if (!state) return;
  try {
    await navigator.clipboard.writeText(state.code);
    $("copyBtn").textContent = "Código copiado ✓";
    setTimeout(() => $("copyBtn").textContent = "Copiar código ↗", 1500);
  } catch {
    $("message").textContent = `Compartilhe este código: ${state.code}`;
  }
});
$("nextBtn").addEventListener("click", () => socket.emit("nextRound"));
$("restartBtn").addEventListener("click", () => socket.emit("restartGame"));
$("backBtn").addEventListener("click", () => {
  $("game").classList.add("hidden");
  $("lobby").classList.remove("hidden");
  $("lobbyError").textContent = "Para sair da sala, atualize a página antes de entrar em outra.";
});
