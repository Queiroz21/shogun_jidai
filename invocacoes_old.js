/* =========================================================
   INVOCAÇÕES.JS — GERENCIADOR DE INVOCAÇÕES
   Estrutura similar a app.js, mas pra tabela de invocações
   Carrega de: game_data/invocacoes_v1
   Salva em: userData.invocacoes
========================================================= */

import { auth, db, requireAuth } from "./oauth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ======== PROTEÇÃO: Verificar se usuário está logado ========
requireAuth();

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
// Regiões disponíveis
let regions = [];
// Região ativa selecionada pelo usuário
let currentRegion = null;

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
   LOAD INVOCAÇÕES E REGIÕES
   Carrega do Firestore (game_data/invocacoes_v1)
   Tolerância: Invocacoes (maiúsculo) ou invocacoes (minúsculo)
   Retorna { invocacoes: array, regions: object }
   Usado em: onAuthStateChanged auth listener
========================================================= */
async function loadInvocacoesAndRegions() {
  try {
    const snap = await getDoc(doc(db, "game_data", "invocacoes_v1"));
    if (!snap.exists()) {
      console.warn("invocacoes_v1 não encontrado");
      return { invocacoes: [], regions: {} };
    }

    const data = snap.data();
    let raw = data.Invocacoes ?? data.invocacoes ?? [];
    let regionsData = data.regions ?? {};

    if (typeof raw === "object" && !Array.isArray(raw)) {
      raw = Object.entries(raw).map(([id, obj]) => ({ id, ...obj }));
    }

    if (!Array.isArray(raw)) {
      console.warn("Formato inválido de Invocacoes");
      return { invocacoes: [], regions: regionsData };
    }

    const invocacoesWithLevel = raw.map(inv => ({
      ...inv,
      level: 0
    }));

    return { invocacoes: invocacoesWithLevel, regions: regionsData };
  } catch (error) {
    console.error("Erro ao carregar invocações:", error);
    return { invocacoes: [], regions: {} };
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
  const { invocacoes: loadedInvocacoes, regions: loadedRegions } = await loadInvocacoesAndRegions();
  invocacoes = loadedInvocacoes;
  regions = loadedRegions;

  // Extrair regiões únicas das invocações
  const uniqueRegions = [...new Set(invocacoes.map(inv => inv.region || "Sem Região").filter(Boolean))];
  
  invocacoes.forEach(inv => {
    inv.level = userData.invocacoes[inv.id] ?? 0;
  });

  console.log("userData após inicialização:", userData);
  console.log("invocacoes carregadas:", invocacoes);
  console.log("regions carregadas:", regions);
  console.log("regiões únicas:", uniqueRegions);

  // Mostra botão admin se usuário for admin
  if (userData.admin) {
    const btnAdmin = document.getElementById("btnAdmin");
    if (btnAdmin) {
      btnAdmin.style.display = "block";
    }
  }

  // Setup das abas de regiões
  setupRegionTabs(uniqueRegions);

  // Selecionar primeira região
  if (uniqueRegions.length > 0) {
    selectRegion(uniqueRegions[0]);
  }

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

  const playerOnlyPontos = document.getElementById("playerOnlyPontos");
  if (playerOnlyPontos) {
    playerOnlyPontos.textContent =
      `Pontos: ${userData.pontos || 0}`;
  }

  // ===== INVOCAÇÕES / REGIÕES =====
  const chart = document.getElementById("org-chart");
  if (chart) {
    chart.innerHTML = "";
    if (currentRegion) {
      renderInvocacoesByRegion(currentRegion);
    }
  }
}

/* =========================================================
   SETUP ABAS DE REGIÕES
   Cria botões de regiões dinamicamente exibindo nomes (não IDs)
   Usado em: onAuthStateChanged
========================================================= */
function setupRegionTabs(uniqueRegions) {
  const regionBar = document.getElementById("regionBar");
  if (!regionBar) return;

  regionBar.innerHTML = "";

  uniqueRegions.forEach(regionKey => {
    const btn = document.createElement("button");
    btn.className = "cat";
    btn.dataset.region = regionKey;
    // Exibir nome da região, não a chave
    const displayName = (regions && regions[regionKey]) ? regions[regionKey].name : regionKey;
    btn.textContent = displayName;
    btn.addEventListener("click", () => selectRegion(regionKey));
    regionBar.appendChild(btn);
  });
}

/* =========================================================
   SELECIONAR REGIÃO
   Marca região ativa e renderiza invocações
   Usado em: Click em abas de região
========================================================= */
function selectRegion(region) {
  currentRegion = region;

  // Atualizar botões
  document.querySelectorAll("#regionBar .cat").forEach(btn => {
    if (btn.dataset.region === region) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  render();
}

/* =========================================================
   RENDER GRID POR REGIÃO (AGRUPADO POR FAMÍLIA)
   Filtra invocações por região, agrupa por família
   Exibe estrutura hierárquica com tooltips para famílias
   Usado em: render()
========================================================= */
function renderInvocacoesByRegion(region) {
  const chart = document.getElementById("org-chart");

  const regionInvocacoes = invocacoes.filter(inv => (inv.region || "Sem Região") === region);

  if (regionInvocacoes.length === 0) {
    chart.innerHTML = "<p style='color: #888;'>Nenhuma invocação nesta região.</p>";
    return;
  }

  // Agrupar invocações por família
  const byFamily = {};
  regionInvocacoes.forEach(inv => {
    const famKey = inv.family || "Sem Família";
    if (!byFamily[famKey]) byFamily[famKey] = [];
    byFamily[famKey].push(inv);
  });

  const containerDiv = document.createElement("div");
  containerDiv.style.cssText = "display: flex; flex-direction: column; gap: 20px;";

  // Obter metadados de famílias da região para ordenação e tooltips
  const regionMeta = regions && regions[region] ? regions[region] : {};
  const familiesOrder = regionMeta.families ? Object.keys(regionMeta.families) : [];

  // Renderizar TODAS as famílias na ordem definida, incluindo as vazias
  // Depois adicionar famílias com invocações que não estão em familiesOrder
  const orderedFamilyKeys = [
    ...familiesOrder,  // ← Todas as famílias da região, mesmo que vazias
    ...Object.keys(byFamily).filter(fk => !familiesOrder.includes(fk))  // Famílias sem definição ainda
  ];

  orderedFamilyKeys.forEach(famKey => {
    const invList = byFamily[famKey] || [];  // Array vazio se nenhuma invocação nesta família
    const familyDiv = document.createElement("div");
    familyDiv.style.cssText = "background: rgba(74, 170, 255, 0.05); border: 1px solid rgba(74, 170, 255, 0.2); border-radius: 8px; padding: 12px;";

    // Cabeçalho da família com tooltip e ícone
    const headerDiv = document.createElement("div");
    headerDiv.style.cssText = "margin-bottom: 12px; display: flex; align-items: center; gap: 8px;";

    // Ícone da família (se disponível)
    const familyMeta = regionMeta.families && regionMeta.families[famKey];
    if (familyMeta && familyMeta.icon) {
      const famIcon = document.createElement("img");
      famIcon.src = familyMeta.icon;
      famIcon.style.cssText = "width: 32px; height: 32px; border-radius: 4px; object-fit: cover;";
      headerDiv.appendChild(famIcon);
    }

    const famTitle = document.createElement("h3");
    famTitle.style.cssText = "margin: 0; color: #4af; font-size: 1.1rem;";
    
    // Exibir nome da família (não a chave)
    const famName = familyMeta ? familyMeta.name : famKey;
    famTitle.textContent = famName;

    // Adicionar tooltip se houver descrição
    if (familyMeta && familyMeta.description) {
      famTitle.style.cursor = "help";
      famTitle.setAttribute("title", familyMeta.description);
      famTitle.style.borderBottom = "1px dotted rgba(74, 170, 255, 0.5)";
    }

    headerDiv.appendChild(famTitle);
    familyDiv.appendChild(headerDiv);

    // Grid de invocações para essa família (pode estar vazio)
    const gridDiv = document.createElement("div");
    gridDiv.className = "invocacoes-grid";
    gridDiv.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;";

    invList.forEach(inv => {
      gridDiv.appendChild(makeCard(inv));
    });

    // Se a família está vazia, mostrar mensagem
    if (invList.length === 0) {
      const emptyMsg = document.createElement("p");
      emptyMsg.style.cssText = "color: #888; font-size: 0.9rem; grid-column: 1 / -1; padding: 12px 0;";
      emptyMsg.textContent = "(Nenhuma invocação disponível)";
      gridDiv.appendChild(emptyMsg);
    }

    familyDiv.appendChild(gridDiv);
    containerDiv.appendChild(familyDiv);
  });

  chart.appendChild(containerDiv);
}

/* =========================================================
   FAZER CARD DE INVOCAÇÃO
   Cria div com nome, nível, descrição, botão ação, barra de progresso, jutsus
   Mostra jutsus relacionados abaixo da invocação
   DM vê tudo, usuário comum só vê o que tem ou está bloqueado
   Usado em: renderInvocacoesByRegion()
========================================================= */
function makeCard(inv) {
  const card = document.createElement("div");
  card.className = "skill invocacao-card";
  
  // Determinar se tem na ficha e se é admin
  const hasInFicha = userData.invocacoes && Object.prototype.hasOwnProperty.call(userData.invocacoes, inv.id);
  const isAdmin = userData.admin === true;
  
  const levelDisplay = inv.level ?? 0;
  const maxLevel = inv.max ?? 5;
  const progress = Math.round((Math.max(levelDisplay, 0) / (maxLevel || 1)) * 100);
  
  // Ícone da invocação (padrão se não tiver)
  const iconUrl = inv.icon || "assets/icons/kuchiyose.png";

  // Construir seção de jutsus
  let jutsusHTML = '';
  if (inv.jutsus && Array.isArray(inv.jutsus) && inv.jutsus.length > 0) {
    jutsusHTML = `
      <div style="margin-top: 12px; border-top: 1px solid rgba(74, 170, 255, 0.3); padding-top: 8px;">
        <div style="font-size: 0.75rem; color: #aaa; text-transform: uppercase; margin-bottom: 6px; font-weight: bold;">⚔️ Jutsus</div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${inv.jutsus.map(jutsu => {
            const isUnlocked = levelDisplay >= (jutsu.unlockLevel || 1);
            return `
              <div style="font-size: 0.8rem; padding: 4px 6px; background: rgba(${isUnlocked ? '79, 220, 74' : '136, 136, 136'}, 0.1); border-radius: 3px; border-left: 2px solid ${isUnlocked ? '#0f8' : '#888'}; color: ${isUnlocked ? '#0f8' : '#888'};">
                ${jutsu.name} <span style="opacity: 0.6;">(Lvl ${jutsu.unlockLevel || 1})</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Determinar estado do botão
  let buttonText = "Locked";
  let buttonDisabled = true;
  let buttonColor = "#888";
  
  if (isAdmin) {
    // Admin vê tudo desbloqueável
    buttonText = levelDisplay >= maxLevel ? "Máx" : "Desbloquear";
    buttonDisabled = false;
    buttonColor = levelDisplay >= maxLevel ? "#0f8" : "#4af";
  } else if (hasInFicha) {
    // Usuário comum vê o que tem
    buttonText = levelDisplay >= maxLevel ? "Máx" : "Desbloquear";
    buttonDisabled = false;
    buttonColor = levelDisplay >= maxLevel ? "#0f8" : "#4af";
  } else {
    // Bloqueado mas visível (para gerar expectativa)
    buttonText = "Locked";
    buttonDisabled = true;
    buttonColor = "#888";
  }

  card.innerHTML = `
    <div style="width: 100%; height: 120px; background: rgba(0, 0, 0, 0.3); border-radius: 4px 4px 0 0; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 8px;">
      <img src="${iconUrl}" alt="${inv.name}" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.src='assets/icons/kuchiyose.png';">
    </div>
    <div class="skill-header">
      <h3>${inv.name}</h3>
    </div>
    <div style="background: rgba(0, 0, 0, 0.3); border-radius: 4px; height: 4px; overflow: hidden; margin-bottom: 8px;">
      <div style="background: linear-gradient(to right, #4af, #0f8); height: 100%; width: ${progress}%;"></div>
    </div>
    <div class="skill-info">
      <p><strong>Nível:</strong> <span style="color: #0f8;">${levelDisplay}</span>/<span style="color: #aaa;">${maxLevel}</span></p>
    </div>
    <div class="skill-desc">${inv.desc || "Sem descrição"}</div>
    <button class="skill-btn" ${buttonDisabled ? "disabled" : ""} onclick="event.stopPropagation();" style="background: ${buttonColor}22; border-color: ${buttonColor}; color: ${buttonColor};">
      ${buttonText}
    </button>
    ${jutsusHTML}
    ${inv.tooltip ? `<div class="tooltip">${inv.tooltip}</div>` : ""}
  `;

  // Adicionar listener do botão
  const btn = card.querySelector(".skill-btn");
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!buttonDisabled) {
      await invocarSummon(inv.id);
    }
  });

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

// Botão Admin
document.getElementById("btnAdmin")?.addEventListener("click", () => {
  window.location.href = "admin.html";
});
