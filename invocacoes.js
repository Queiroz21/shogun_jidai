/* =========================================================
   INVOCAÇÕES.JS — GERENCIADOR DE INVOCAÇÕES
   Estrutura similar a app.js, mas pra tabela de invocações
   Carrega de: game_data/invocacoes_v1
   Salva em: userData.invocacoes
========================================================= */

import { auth, db } from "./oauth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* =========================================================
   ESTADO GLOBAL
========================================================= */
// Armazena UID do usuário autenticado
let currentUID = null;
// Dados do usuário (nick, nivel, xp, invocacoes, etc)
let userData = {};
// Array de invocações carregadas do Firestore
let invocacoes = [];
// Rastreador local de invocações leveled (antes de salvar)
let invocacoesState = {};
// Categoria ativa selecionada pelo usuário
let currentCategory = "todos";

/* =========================================================
   NAVEGAÇÃO — BOTÕES DE HEADER
   Permite navegar entre páginas principais
   Usado em: Event listeners onclick de botões
========================================================= */
document.getElementById("btnPerfil").addEventListener("click", () => {
  window.location.href = "perfil.html";
});

document.getElementById("btnArvore").addEventListener("click", () => {
  window.location.href = "arvore_habilidade.html";
});

/* =========================================================
   UTILIDADES XP — CÁLCULO DE PROGRESSÃO
   Mesma fórmula usada em app.js e perfil.html
========================================================= */
// Calcula XP necessário pra atingir um nível
// Usado em: render()
function xpToReachLevel(level) {
  // progressão: 100, +200, +300, +400...
  // fórmula: 100 * (level - 1) * level / 2
  return 100 * (level - 1) * level / 2;
}

// Calcula XP necessário pra passar de um nível pro próximo (não cumulativo)
// Usado em: render()
function xpTotalForLevel(level) {
  return 100 * (level - 1) * level / 2;
}

/* =========================================================
   LOAD INVOCAÇÕES
   Carrega do Firestore (game_data/invocacoes_v1)
   Tolerância: Invocacoes (maiúsculo) ou invocacoes (minúsculo)
   Retorna array de invocações com level = 0 inicialmente
   Usado em: onAuthStateChanged auth listener
========================================================= */
async function loadInvocacoes() {
  try {
    const snap = await getDoc(doc(db, "game_data", "invocacoes_v1"));
    if (!snap.exists()) {
      console.warn("invocacoes_v1 não encontrado");
      return [];
    }

    const data = snap.data();
    let raw = data.Invocacoes ?? data.invocacoes ?? [];

    if (typeof raw === "object" && !Array.isArray(raw)) {
      raw = Object.entries(raw).map(([id, obj]) => ({ id, ...obj }));
    }

    if (!Array.isArray(raw)) {
      console.warn("Formato inválido de Invocacoes");
      return [];
    }

    return raw.map(inv => ({
      ...inv,
      level: 0
    }));
  } catch (error) {
    console.error("Erro ao carregar invocações:", error);
    return [];
  }
}

/* =========================================================
   AUTH — CARREGA USUÁRIO E DADOS
   Verifica autenticação e carrega userData do Firestore
   Chama render() após tudo estar pronto
   Usado em: Listener global quando página carrega
========================================================= */
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUID = user.uid;
  const snap = await getDoc(doc(db, "fichas", currentUID));
  userData = snap.data() ?? {};

  userData.nick ??= "Sem Nome";
  userData.cla ??= "Nenhum";
  userData.xp ??= 0;
  userData.nivel ??= 1;
  userData.pontos ??= 0;
  userData.invocacoes ??= {};

  invocacoesState = { ...userData.invocacoes };
  invocacoes = await loadInvocacoes();

  invocacoes.forEach(inv => {
    inv.level = userData.invocacoes[inv.id] ?? 0;
  });

  console.log("userData após inicialização:", userData);
  console.log("invocacoes carregadas:", invocacoes);

  render();
});

/* =========================================================
   RENDER — ATUALIZA TELA INTEIRA
   Renderiza header (nick, XP, pontos) e grid de invocações
   Chamado na inicialização e após any action
   Usado em: onAuthStateChanged, invocarSummon()
========================================================= */
function render() {
  // ===== TOPO =====
  const infoTopo = document.getElementById("infoTopo");
  if (infoTopo) {
    infoTopo.textContent =
      `${userData.nick} | Clã: ${userData.cla}`;
  }

  const playerLevel = document.getElementById("player-level");
  if (playerLevel) {
    playerLevel.textContent =
      `Level: ${userData.nivel}`;
  }

  // ===== XP / LEVEL =====
  const xpCurrent = xpToReachLevel(userData.nivel);
  const xpNext = xpToReachLevel(userData.nivel + 1);

  const progress =
    ((userData.xp - xpCurrent) / (xpNext - xpCurrent)) * 100;

  const xpBar = document.getElementById("xp-bar");
  if (xpBar) {
    xpBar.style.width =
      `${Math.min(Math.max(progress, 0), 100)}%`;
  }

  const playerOnlyXp = document.getElementById("playerOnlyXp");
  if (playerOnlyXp) {
    playerOnlyXp.textContent =
      `XP: ${userData.xp} / ${xpNext}`;
  }

  const playerOnlyPontos = document.getElementById("playerOnlyPontos");
  console.log("playerOnlyPontos elemento:", playerOnlyPontos);
  if (playerOnlyPontos) {
    playerOnlyPontos.textContent =
      `Pontos: ${userData.pontos || 0}`;
    console.log("playerOnlyPontos atualizado para:", `Pontos: ${userData.pontos || 0}`);
  }

  // ===== INVOCAÇÕES / CATEGORIAS =====
  const chart = document.getElementById("org-chart");
  if (chart) {
    chart.innerHTML = "";
    renderInvocacoesByCategory();
  }
}

/* =========================================================
   RENDER GRID POR CATEGORIA
   Agrupa invocações por categoria e monta grid visual
   Cada invocação vira um card clicável
   Usado em: render()
========================================================= */
function renderInvocacoesByCategory() {
  const chart = document.getElementById("org-chart");

  // Agrupar por categoria
  const categorias = [...new Set(invocacoes.map(inv => inv.category || "outro"))];

  categorias.forEach(cat => {
    const catInvocacoes = invocacoes.filter(inv => (inv.category || "outro") === cat);

    const catDiv = document.createElement("div");
    catDiv.className = "category-section";
    catDiv.innerHTML = `<h2>${cat}</h2>`;

    const gridDiv = document.createElement("div");
    gridDiv.className = "invocacoes-grid";

    catInvocacoes.forEach(inv => {
      gridDiv.appendChild(makeCard(inv));
    });

    catDiv.appendChild(gridDiv);
    chart.appendChild(catDiv);
  });
}

/* =========================================================
   FAZER CARD DE INVOCAÇÃO
   Cria div com nome, nível, descrição, botão ação
   Abre modal ao clicar
   Usado em: renderInvocacoesByCategory()
========================================================= */
function makeCard(inv) {
  const card = document.createElement("div");
  card.className = "skill invocacao-card";
  card.onclick = () => openConfirm(inv);

  const levelDisplay = inv.level ?? 0;
  const maxLevel = inv.max ?? 5;

  card.innerHTML = `
    <div class="skill-header">
      <h3>${inv.name}</h3>
    </div>
    <div class="skill-info">
      <p><strong>Nível:</strong> ${levelDisplay}/${maxLevel}</p>
    </div>
    <div class="skill-desc">${inv.desc || "Sem descrição"}</div>
    <button class="skill-btn">
      ${levelDisplay >= maxLevel ? "Máx" : "Desbloquear"}
    </button>
    ${inv.tooltip ? `<div class="tooltip">${inv.tooltip}</div>` : ""}
  `;

  return card;
}

/* =========================================================
   ABRIR MODAL DE CONFIRMAÇÃO
   Abre modal com detalhes e pede confirmação
   Salva ID temporário pra usar depois se confirmar
   Usado em: Click handler nos cards (makeCard)
========================================================= */
function openConfirm(inv) {
  const pendingInvId = inv.id;

  document.getElementById("modalTitle").textContent = inv.name;
  document.getElementById("modalText").innerHTML = `
  <strong>Você tem certeza?</strong><br><br>
  Ao confirmar, essa escolha será <b>PERMANENTE</b> e não poderá ser desfeita.<br><br>
  <hr>
  <b>${inv.name}</b><br>
  Nível atual: ${inv.level ?? 0}<br>
  Próximo nível: ${(inv.level ?? 0) + 1}<br>
`;

  const modal = document.getElementById("confirmModal");
  modal.classList.remove("hidden");

  document.getElementById("btnConfirm").onclick = async () => {
    modal.classList.add("hidden");
    await invocarSummon(pendingInvId);
  };

  document.getElementById("btnCancel").onclick = () => {
    modal.classList.add("hidden");
  };
}

/* =========================================================
   EVOCAR SUMMON — INCREMENTA NÍVEL
   Valida se invocação não atingiu max level
   Incrementa level e salva em Firebase
   Chama render() pra atualizar tela
   Usado em: Confirmação do modal
========================================================= */
async function invocarSummon(id) {
  const inv = invocacoes.find(i => i.id === id);
  if (!inv || inv.level >= (inv.max ?? 5)) return;

  inv.level++;
  invocacoesState[id] = inv.level;

  await updateDoc(doc(db, "fichas", currentUID), {
    invocacoes: invocacoesState
  });

  render();
}
