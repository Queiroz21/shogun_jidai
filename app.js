// app.js — FINAL CORRIGIDO (XP + LEVEL UP + POPUP)

import { auth, db } from "./oauth.js";
import {
  doc, getDoc, updateDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUID = null;
let skillsState = {};
let userData = {};
let skills = [];
let currentCategory = "fisico";
let lastScroll = { left: 0, top: 0 }; 
let openNodes = new Set();

/* =========================================================
   XP — PROGRESSÃO REAL (100, 300, 600…)
   Usado em: render(), checkLevelUp()
========================================================= */
function xpToReachLevel(level) {
  return 100 * (level - 1) * level / 2;
}

// Calcula o nível atual baseado no XP total
// Usado em: checkLevelUp()
function calculateLevelFromXP(xp) {
  let level = 1;
  while (xp >= xpToReachLevel(level + 1)) {
    level++;
  }
  return level;
}

/* =========================================================
   UTIL — NORMALIZA DOUJUTSUS
   Tolerância pra campo que pode ser "doujutsus" ou "doujutsu"
   Usado em: renderTreeByCategory()
========================================================= */
function normalizeDoujutsus() {
  if (Array.isArray(userData.doujutsus)) return userData.doujutsus;
  if (Array.isArray(userData.doujutsu)) return userData.doujutsu;
  if (typeof userData.doujutsu === "string") return [userData.doujutsu];
  return [];
}

/* =========================================================
   LOAD SKILLS
   Carrega do Firestore (game_data/skills_v1)
   Tolerância: Skills (maiúsculo) ou skills (minúsculo)
   Usado em: onAuthStateChanged auth listener
========================================================= */
//OLD VERSION -> PRIMEIRO JSON
// async function loadSkills() {
//   const snap = await getDocs(collection(db, "skill_tree"));
//   const loaded = snap.docs.map(d => d.data());

//   loaded.forEach(s => {
//     s.level = skillsState[s.id] ?? 0;
//     s.requires = s.requires ?? [];
//     s.max = s.max ?? 5;
//   });

//   return loaded;
// }
async function loadSkills() {
  const snap = await getDoc(doc(db, "game_data", "skills_v1"));

  if (!snap.exists()) {
    throw new Error("Documento game_data/skills_v1 não encontrado");
  }

  const data = snap.data();

  // 1) pega Skills com tolerância a maiúsculo/minúsculo
  let rawSkills = data.Skills ?? data.skills;

  // 2) se vier como objeto/mapa, converte para array
  // Ex: { fisico: {...}, mental: {...} } -> [{id:"fisico",...}, {id:"mental",...}]
  if (rawSkills && !Array.isArray(rawSkills) && typeof rawSkills === "object") {
    rawSkills = Object.entries(rawSkills).map(([id, skill]) => ({
      id,
      ...(skill ?? {})
    }));
  }

  // 3) se ainda não for array, loga o formato real pra você ver
  if (!Array.isArray(rawSkills)) {
    console.error("📌 Documento recebido:", data);
    throw new Error("Formato inválido: Skills não é array nem objeto");
  }

  const loaded = rawSkills;

  loaded.forEach(s => {
    s.level = skillsState[s.id] ?? 0;
    s.requires = s.requires ?? [];
    // ✅ NÃO forçar max = 5 (mantém max 0 nas skills-guia)
    s.max = s.max ?? 0;
  });

  return loaded;
}



/* =========================================================
   AUTH
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
  userData.skills ??= {};
  
  console.log("userData após inicialização:", userData);

  skillsState = { ...userData.skills };
  skills = await loadSkills();

  await checkLevelUp();
  render();
});

/* =========================================================
   LEVEL UP — XP REAL + POPUP
   Verifica se jogador atingiu novo nível
   Se sim: ganha +3 pontos de árvore e +40 de atributo
   Usado em: onAuthStateChanged auth listener
========================================================= */
// Cálculo de XP necessário pra atingir um nível
// Usado em: checkLevelUp()
function xpTotalForLevel(level) {
  // progressão: 100, +200, +300, +400...
  // fórmula: 50 * level * (level - 1)
  return  100 * (level - 1) * level / 2;
}

// Detecta level up e distribui rewards (pontos árvore + atributo)
// Mostra popup com informações dos ganhos
async function checkLevelUp() {
  let oldLevel = userData.nivel;

  while (userData.xp >= xpTotalForLevel(userData.nivel + 1)) {
    userData.nivel++;
  }

  if (userData.nivel > oldLevel) {
    const gainedLevels = userData.nivel - oldLevel;
    const gainedTreePoints = gainedLevels * 3; // ✅ 3 pontos por nível na árvore
    const gainedAttrPoints = gainedLevels * 40; // ✅ 40 pontos por nível de atributo

    userData.pontos += gainedTreePoints;

    await updateDoc(doc(db, "fichas", currentUID), {
      nivel: userData.nivel,
      pontos: userData.pontos
    });

    // Mensagem melhorada
    const message = 
      `🎉 PARABÉNS! LEVEL UP!\n\n` +
      `📈 Nível: ${oldLevel} → ${userData.nivel}\n` +
      `⬆️ Subiu: ${gainedLevels} ${gainedLevels === 1 ? 'nível' : 'níveis'}\n\n` +
      `🌳 Pontos da Árvore: +${gainedTreePoints}\n` +
      `💪 Pontos de Atributo: +${gainedAttrPoints}`;

    alert(message);
  }
}

/* =========================================================
   POPUP LEVEL UP
========================================================= */
/*function showLevelUpPopup(oldLevel, newLevel, gainedPoints) {
  const popup = document.getElementById("levelUpPopup");
  if (!popup) return;

  popup.innerHTML = `
    <strong>LEVEL UP!</strong><br>
    ${oldLevel} → ${newLevel}<br>
    Pontos ganhos: +${gainedPoints}
  `;

  popup.classList.add("show");

  setTimeout(() => {
    popup.classList.remove("show");
  }, 3500);
}*/

// Mostra alerta de level up com detalhes
// Usado em: checkLevelUp()
function showLevelUpPopup(oldLevel, newLevel, gainedPoints) {
  alert(
    "LEVEL UP!\n\n" +
    "Nível: ${oldLevel} → ${newLevel}\n" +
    "Pontos ganhos: +${gainedPoints}"
  );
}

/* =========================================================
   REGRAS — FONTE ÚNICA DA VERDADE
   Valida se uma skill pode ser desbloqueada
   Suporta: skill level, player level, doujutsu, clan
   Usado em: makeCard(), levelUp()
========================================================= */
// Verifica todos os requisitos de uma skill
// Retorna { unlocked: bool, missing: [] }
function checkRequirements(skill) {
  const userDoujutsus = normalizeDoujutsus();
  let missing = [];

  for (const req of skill.requires ?? []) {
    const type = req.type ?? "skill";

    if (type === "skill") {
      const sk = skills.find(s => s.id === req.id);
      const cur = sk?.level ?? 0;
      const need = req.level ?? req.lvl ?? 1;
      if (cur < need) missing.push({ label: sk?.name ?? req.id, cur, need });
    }

    if (type === "playerLevel" && userData.nivel < req.level) {
      missing.push({ label: "Conta", cur: userData.nivel, need: req.level });
    }

    if (type === "doujutsu" && !userDoujutsus.includes(req.value)) {
      missing.push({ label: "Doujutsu", cur: "Nenhum", need: req.value });
    }

    if (type === "clan" && userData.cla !== req.value) {
      missing.push({ label: "Clã", cur: userData.cla, need: req.value });
    }
  }

  return { unlocked: missing.length === 0, missing };
}

/* =========================================================
   PARSER DE NÍVEIS — EXTRAI DESCRIÇÕES E REQUISITOS
   Busca por padrão: "lvl 1 → descrição", "lvl 2 → descrição"
   Separa descrições dos requisitos (seção final do texto)
   
   Formato esperado:
   lvl 1 → Descrição aqui
   lvl 2 → Descrição aqui
   ...
   
   Requisitos:
   • Habilidade: X / Y
   • Nível: X / Y
   
   Retorna: { levels: [{level, desc}], requirements: [...]}
   Retorna: null se não encontrou formato padronizado
   Usado em: renderCarrossel()
========================================================= */
function parseSkillLevels(desc) {
  if (!desc) return null;

  const lines = desc.split('\n').map(l => l.trim()).filter(l => l);
  const levels = [];
  let requirements = [];

  let inRequirements = false;

  for (const line of lines) {
    // Detectar início da seção de requisitos
    if (line.toLowerCase().startsWith('requisitos:')) {
      inRequirements = true;
      continue;
    }

    if (inRequirements) {
      // Capturar linhas que começam com • ou -
      if (line.startsWith('•') || line.startsWith('-')) {
        requirements.push(line.substring(1).trim());
      } else if (line && !line.toLowerCase().startsWith('lvl')) {
        // Capturar linhas soltas que são requisitos (sem • ou -)
        requirements.push(line);
      }
    } else {
      // Procura por "lvl N →"
      const match = line.match(/^lvl\s+(\d+)\s*→\s*(.+)$/i);
      if (match) {
        levels.push({
          level: parseInt(match[1]),
          desc: match[2].trim()
        });
      }
    }
  }

  // Retorna null se não encontrou formato padrão
  if (levels.length === 0) return null;

  return { levels, requirements };
}

/* =========================================================
   RENDERIZA CARROSSEL DE NÍVEIS
   Template HTML com setas ◄ ►, nível atual, descrição
   
   Features:
   - Setas navegáveis (prev/next)
   - Cores dinâmicas: verde (desbloqueado), vermelho (bloqueado)
   - Requisitos listados para nível específico
   - Data-attributes para event delegation funcionar
   
   Retorna: HTML string do carrossel
   Retorna: null se formato não-padronizado (fallback pro mega texto)
   Usado em: makeCard() quando skill.desc.includes("lvl 1 →")
========================================================= */
function renderCarrossel(skill) {
  const parsed = parseSkillLevels(skill.desc);
  if (!parsed) return null; // Formato não-padronizado

  const { levels, requirements } = parsed;
  const skillLevel = skill.level ?? 0;

  // Determinar cor do primeiro nível (baseado se skill foi desbloqueada)
  const isFirstLevelUnlocked = skillLevel >= 1;
  const descClass = isFirstLevelUnlocked ? 'unlocked' : 'locked';

  // Template inicial do carrossel (vai ser modificado por JS)
  let html = `
    <div class="tooltip-carousel" data-skill-id="${skill.id}" data-max-level="${levels.length}" data-current-level="${skillLevel}">
      <button class="carousel-btn prev" data-action="prev">◄</button>
      <div class="carousel-content">
        <div class="carousel-level" data-level="1">Lvl <span class="level-num">1</span>/<span class="level-max">${levels.length}</span></div>
        <div class="carousel-desc ${descClass}" data-level="1">${levels[0]?.desc || ''}</div>
      </div>
      <button class="carousel-btn next" data-action="next">►</button>
    </div>
  `;

  // Adicionar requisitos (se houver)
  if (requirements.length > 0) {
    html += `
      <div class="tooltip-requirements">
        <div class="req-title">Requisitos (Lvl 1):</div>
        ${requirements.map(req => {
          // Simples parse: "Habilidade: X / Y"
          const match = req.match(/(.+):\s*(\d+)\s*\/\s*(\d+)/);
          if (match) {
            const [_, name, current, need] = match;
            const isMet = parseInt(current) >= parseInt(need);
            return `<div class="req-item ${isMet ? 'met' : 'unmet'}">• ${req}</div>`;
          }
          return `<div class="req-item">${req}</div>`;
        }).join('')}
      </div>
    `;
  }

  return html;
}

/* =========================================================
   CARD DA SKILL — CRIA ELEMENTO VISUAL
   Valida requisitos, mostra nível, botão de ação
   Usado em: buildBranch(), renderNode()
========================================================= */
function makeCard(skill) {
  const el = document.createElement("div");
  el.className = "skill";

  const { unlocked, missing } = checkRequirements(skill);

  const iconName = skill.icon || "default";
  const iconIndex = Math.min(skill.level ?? 0, skill.max);
  const currentIcon = unlocked
    ? `assets/icons/${iconName}_${iconIndex}.png`
    : `assets/icons/${iconName}_locked.png`;

  if (!unlocked) el.classList.add("blocked");
  else if (skill.level > 0) el.classList.add("active");

  /* ========================= TOOLTIP — 3 TIPOS ========================= */

  let tooltipHTML = `<strong>${skill.name}</strong>`;

  // TIPO 1: SKILL GUIA (max = 0)
  if (skill.max === 0) {
    tooltipHTML += `
      <br><span class="badge-guide">🌳 Árvore Guia</span>
      <br><br><em>${skill.desc || 'Nenhuma descrição'}</em>
    `;
  }
  // TIPO 2: SKILL COMPRADA COM FORMATO PADRONIZADO
  else if (skill.desc?.includes("lvl 1 →")) {
    tooltipHTML += `<br><small>Nível: ${skill.level ?? 0} / ${skill.max}</small><br><br>`;
    const carrossel = renderCarrossel(skill);
    if (carrossel) {
      tooltipHTML += carrossel;
    }
    
    // Adicionar requisitos do Firestore para carrossel
    if (skill.requires?.length) {
      tooltipHTML += `<br><strong>Requisitos (Lvl 1):</strong><br>`;
      
      skill.requires.forEach(req => {
        const type = req.type ?? "skill";
        let label = "";
        let current = "-";
        let need = "-";
        let ok = "❌";

        if (type === "skill") {
          const sk = skills.find(s => s.id === req.id);
          current = sk?.level ?? 0;
          need = req.level ?? req.lvl ?? 1;
          label = sk?.name ?? req.id;
          ok = current >= need ? "✔" : "❌";
        }

        if (type === "playerLevel") {
          current = userData.nivel ?? 0;
          need = req.level;
          label = "Nível";
          ok = current >= need ? "✔" : "❌";
        }

        if (type === "doujutsu") {
          current = normalizeDoujutsus().join(", ") || "Nenhum";
          need = req.value;
          label = "Doujutsu";
          ok = normalizeDoujutsus().includes(req.value) ? "✔" : "❌";
        }

        if (type === "region") {
          current = userData.regiao ?? "Nenhuma";
          need = req.value;
          label = "Região";
          ok = current === need ? "✔" : "❌";
        }

        if (type === "clan") {
          current = userData.cla ?? "Nenhum";
          need = req.value;
          label = "Clã";
          ok = current === need ? "✔" : "❌";
        }

        tooltipHTML += `• ${label}: ${current} / ${need} ${ok}<br>`;
      });
    }
  }
  // TIPO 3: SKILL NÃO-FORMATADA (em desenvolvimento)
  else {
    tooltipHTML += `
      <br><span class="badge-wip">⚠️ Em Modificação</span>
      <br><small>Nível: ${skill.level ?? 0} / ${skill.max}</small>
      <br><br><small>${skill.desc || 'Sem descrição'}</small>
    `;
  }

  // Adicionar requisitos SOMENTE se não for SKILL GUIA e não tiver carrossel
  if (skill.max > 0 && !skill.desc?.includes("lvl 1 →")) {
    if (skill.requires?.length) {
      tooltipHTML += `<br><br><strong>Requisitos:</strong><br>`;

      skill.requires.forEach(req => {
        const type = req.type ?? "skill";
        let label = "";
        let current = "-";
        let need = "-";
        let ok = "❌";

        if (type === "skill") {
          const sk = skills.find(s => s.id === req.id);
          current = sk?.level ?? 0;
          need = req.level ?? req.lvl ?? 1;
          label = sk?.name ?? req.id;
          ok = current >= need ? "✔" : "❌";
        }

        if (type === "playerLevel") {
          current = userData.nivel ?? 0;
          need = req.level;
          label = "Conta";
          ok = current >= need ? "✔" : "❌";
        }

        if (type === "doujutsu") {
          current = normalizeDoujutsus().join(", ") || "Nenhum";
          need = req.value;
          label = "Doujutsu";
          ok = normalizeDoujutsus().includes(req.value) ? "✔" : "❌";
        }

        if (type === "region") {
          current = userData.regiao ?? "Nenhuma";
          need = req.value;
          label = "Região";
          ok = current === need ? "✔" : "❌";
        }

        if (type === "clan") {
          current = userData.cla ?? "Nenhum";
          need = req.value;
          label = "Clã";
          ok = current === need ? "✔" : "❌";
        }

        tooltipHTML += `• ${label}: ${current} / ${need} ${ok}<br>`;
      });
    }
  }

  el.innerHTML = `
    <img src="${currentIcon}">
	<div class="skill-name">${skill.name}</div>
    <div class="tooltip">${tooltipHTML}</div>
  `;

  el.onclick = () => {
    if (!unlocked) return;
    openConfirm(skill);
  };

  return el;
}

/* =========================================================
   BUILD TREE — RECURSIVO
   Monta a árvore de skills por parent->child
   Usado em: renderTreeByCategory()
========================================================= */
function buildBranch(parent) {
  const branch = document.createElement("div");
  branch.className = "branch";
  branch.appendChild(makeCard(parent));

  const kids = skills.filter(s => s.parent === parent.id);
  if (kids.length) {
    const row = document.createElement("div");
    row.className = "child-row";
    kids.forEach(k => row.appendChild(buildBranch(k)));
    branch.appendChild(row);
  }
  return branch;
}

/* =========================================================
   RENDER — ATUALIZA TELA INTEIRA
   Chamado após qualquer mudança (level up, skill upgrade, etc)
   Usado em: checkLevelUp(), levelUp(), onAuthStateChanged
========================================================= */
function render() {

  // ===== TOPO =====
  const infoTopo = document.getElementById("infoTopo");
  if (infoTopo) {
    infoTopo.textContent =
      `${userData.nick} | Clã: ${userData.cla}`;
  }

  const points = document.getElementById("points");
  if (points) {
    points.textContent =
      `Pontos Disponíveis: ${userData.pontos}`;
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
  const playerXp = document.getElementById("player-xp");
  if (playerXp) {
    playerXp.textContent =
      `XP: ${userData.xp} / ${xpNext} | Pontos de FICHA: ${250 + (userData.nivel - 1) * 40}`;
  }

  // ===== ÁRVORE / CATEGORIAS =====
  const chart = document.getElementById("org-chart");
  if (chart) {
    chart.innerHTML = "";
    renderTreeByCategory();
  }

}

/* =========================================================
   RENDER GRID POR CATEGORIA
   Filtra skills por categoria e mostra a árvore
   Doujutsu: só mostra se o usuário tem no userData.doujutsus
   Usado em: render(), event listeners de categoria
========================================================= */
function renderTreeByCategory() {
  const viewport = document.getElementById("tree-viewport");

  lastScroll.left = viewport.scrollLeft;
  lastScroll.top = viewport.scrollTop;

  const chart = document.getElementById("org-chart");
  chart.innerHTML = "";

  // Verificar se é Doujutsu e filtrar apenas os que o usuário possui
  let catSkills = skills.filter(s => s.parent === currentCategory);

  if (currentCategory === "doujutsu") {
    const userDoujutsus = normalizeDoujutsus();
    if (userDoujutsus.length === 0) {
      chart.innerHTML = "<p class='empty'>Você não possui nenhum doujutsu cadastrado.</p>";
      return;
    }
    // Filtrar apenas os doujutsus que o usuário possui
    catSkills = catSkills.filter(s => userDoujutsus.includes(s.id));
  }

  if (!catSkills.length) {
    chart.innerHTML = "<p class='empty'>Nenhuma skill nesta categoria</p>";
    return;
  }

  const map = {};
  skills.forEach(s => {
    s.children = []; 
    map[s.id] = s;
  });

  
  skills.forEach(s => {
    if (s.parent && map[s.parent]) {
      map[s.parent].children.push(s);
    }
  });

  const container = document.createElement("div");
  container.className = "tree-container";

  const rootRow = document.createElement("div");
  rootRow.className = "tree-row"; // Nível raiz

  catSkills.forEach(root => {
    rootRow.appendChild(renderNode(map[root.id]));
  });

  container.appendChild(rootRow);
  chart.appendChild(container);

  // Restaura scroll
  requestAnimationFrame(() => {
    viewport.scrollLeft = lastScroll.left;
    viewport.scrollTop = lastScroll.top;
  });
}

/* =========================================================
   RENDER NODE RECURSIVO — COM EXPANSÃO
   Monta node com toggle (expandir/colapsar) por skill
   Usado em: renderTreeByCategory()
========================================================= */
function renderNode(skill) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";

  const header = document.createElement("div");
  header.className = "node-header";

  const card = makeCard(skill); // Usa makeCard() do oficial
  header.appendChild(card);

  let childrenBox = null;

  if (skill.children.length) {
    const toggle = document.createElement("button");
    toggle.className = "node-toggle";
    toggle.textContent = "+";

    header.appendChild(toggle);

    childrenBox = document.createElement("div");
    childrenBox.className = "tree-children";

    const isOpen = openNodes.has(skill.id);
    if (!isOpen) childrenBox.classList.add("hidden");

    const row = document.createElement("div");
    row.className = "tree-row"; // Nível de filhos

    skill.children.forEach(child => {
      row.appendChild(renderNode(child));
    });

    childrenBox.appendChild(row);

    toggle.onclick = () => {
      const isClosing = !childrenBox.classList.contains("hidden");
      if (isClosing) {
        childrenBox.classList.add("hidden");
        openNodes.delete(skill.id);
        toggle.textContent = "+";
      } else {
        childrenBox.classList.remove("hidden");
        openNodes.add(skill.id);
        toggle.textContent = "−";
      }
    };

    toggle.textContent = openNodes.has(skill.id) ? "−" : "+";
  }

  wrapper.appendChild(header);
  if (childrenBox) wrapper.appendChild(childrenBox);

  return wrapper;
}

/* =========================================================
   LEVEL UP SKILL — INCREMENTA E SALVA
   Gasta 1 ponto, valida requisitos e max level
   Salva em Firebase e chama render() pra atualizar
   Usado em: closeConfirm() após confirmação do modal
========================================================= */
async function levelUp(id) {
  const sk = skills.find(s => s.id === id);
  if (!sk || sk.level >= sk.max || userData.pontos <= 0) return;
  if (!checkRequirements(sk).unlocked) return;

  sk.level++;
  userData.pontos--;
  skillsState[id] = sk.level;

  await updateDoc(doc(db, "fichas", currentUID), {
    skills: skillsState,
    pontos: userData.pontos
  });

  render();
}

let pendingSkillId = null;

// Abre modal de confirmação com detalhes da skill
// Salva ID temporário em pendingSkillId pra confirmação
// Usado em: makeCard() onclick
function openConfirm(skill) {
  pendingSkillId = skill.id;

  document.getElementById("modalTitle").textContent = skill.name;
  document.getElementById("modalText").innerHTML = `
  <strong>Você tem certeza?</strong><br><br>
  Ao confirmar, essa escolha será <b>PERMANENTE</b> e não poderá ser desfeita.<br><br>
  <hr>
  <b>${skill.name}</b><br>
  Nível atual: ${skill.level ?? 0}<br>
  Próximo nível: ${(skill.level ?? 0) + 1}<br>
  Custo: 1 ponto
`;

  document.getElementById("confirmModal").classList.remove("hidden");
}

// Fecha modal e limpa estado temporário
// Usado em: btnCancel onclick, após levelUp()
function closeConfirm() {
  pendingSkillId = null;
  document.getElementById("confirmModal").classList.add("hidden");
}

document.getElementById("btnConfirm").onclick = async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!pendingSkillId) return;

  await levelUp(pendingSkillId);
  closeConfirm();
};

document.getElementById("btnCancel").onclick = closeConfirm;

/* =========================================================
   CARROSSEL DE NÍVEIS — EVENT DELEGATION
   Delegação de eventos para setas do carrossel
   Permite navegar entre níveis com setas ◄ ►
   Cores dinâmicas: verde (desbloqueado), vermelho (bloqueado)
   Usado em: Tooltip hover com renderCarrossel()
========================================================= */
document.addEventListener('click', (e) => {
  // Detectar cliques nas setas do carrossel
  const btn = e.target.closest('.carousel-btn');
  if (!btn) return;

  const carousel = btn.closest('.tooltip-carousel');
  if (!carousel) return;

  const skillId = carousel.dataset.skillId;
  const maxLevel = parseInt(carousel.dataset.maxLevel);
  let currentLevel = parseInt(carousel.dataset.currentLevel) || 1;
  const action = btn.dataset.action;

  // Navegação das setas
  if (action === 'prev' && currentLevel > 1) currentLevel--;
  if (action === 'next' && currentLevel < maxLevel) currentLevel++;

  // Atualizar dataset
  carousel.dataset.currentLevel = currentLevel;

  // Buscar a skill para pegar a descrição
  const skill = skills.find(s => s.id === skillId);
  if (!skill) return;

  const parsed = parseSkillLevels(skill.desc);
  if (!parsed) return;

  const levelData = parsed.levels.find(l => l.level === currentLevel);
  const userCurrentLevel = skill.level ?? 0;
  const isUnlocked = currentLevel <= userCurrentLevel;

  // Atualizar nível exibido
  carousel.querySelector('.level-num').textContent = currentLevel;

  // Atualizar descrição com cor
  const descElement = carousel.querySelector('.carousel-desc');
  if (descElement && levelData) {
    descElement.textContent = levelData.desc;
    descElement.className = `carousel-desc ${isUnlocked ? 'unlocked' : 'locked'}`;
  }

  // Atualizar requisitos (se houver)
  const reqsContainer = carousel.nextElementSibling;
  if (reqsContainer?.classList.contains('tooltip-requirements')) {
    reqsContainer.querySelector('.req-title').textContent = `Requisitos (Lvl ${currentLevel}):`;
  }

  // Atualizar estado dos botões
  btn.parentElement.querySelector('[data-action="prev"]').disabled = currentLevel <= 1;
  btn.parentElement.querySelector('[data-action="next"]').disabled = currentLevel >= maxLevel;
});

/* =========================================================
   CENTRALIZAÇÃO AUTOMÁTICA DA ÁRVORE
   Centra a viewport quando carrega e em resize
   Usado em: window load e resize events
========================================================= */
function centerTree() {
  const vp = document.getElementById("tree-viewport");
  const tree = document.getElementById("org-chart");

  if (!vp || !tree) return;

  const centerX = (tree.scrollWidth - vp.clientWidth) / 2;
  const centerY = (tree.scrollHeight - vp.clientHeight) / 2;

  vp.scrollLeft = Math.max(0, centerX);
  vp.scrollTop = Math.max(0, centerY);
}

window.addEventListener("load", () => {
  setTimeout(centerTree, 100); // aguarda renderização
});

window.addEventListener("resize", centerTree);


/* =========================================================
  NAVEGAR NO SITE
========================================================= */
let isDragging = false;
let startX, startY, scrollLeft, scrollTop;

const viewport = document.getElementById("tree-viewport");

if (viewport) {

  viewport.addEventListener("mousedown", e => {
    isDragging = true;
    viewport.classList.add("grabbing");

    startX = e.pageX;
    startY = e.pageY;
    scrollLeft = viewport.scrollLeft;
    scrollTop = viewport.scrollTop;

    e.preventDefault();
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    viewport.classList.remove("grabbing");
  });

  viewport.addEventListener("mousemove", e => {
    if (!isDragging) return;

    e.preventDefault();

    const dx = e.pageX - startX;
    const dy = e.pageY - startY;

    viewport.scrollLeft = scrollLeft - dx;
    viewport.scrollTop = scrollTop - dy;
  });

  viewport.addEventListener("dragstart", e => e.preventDefault());

}

/* =========================================================
   CATEGORIAS
========================================================= */
/* function canAccessCategory(cat) {
  // Lógica do experimental: ex: para "doujutsu", checa se tem doujutsus
  if (cat === "doujutsu") return normalizeDoujutsus().length > 0;
  return true;
} */

  function canAccessCategory(cat) {
  return true;  // ← remove qualquer bloqueio por enquanto
}

document.querySelectorAll(".cat").forEach(btn => {
  btn.onclick = () => {
    const cat = btn.dataset.cat;
    if (!canAccessCategory(cat)) return;

    document.querySelectorAll(".cat").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    currentCategory = cat;
    renderTreeByCategory();
  };
});

document.getElementById("btnPerfil")?.addEventListener("click", () => {
  window.open("perfil.html", "_self");
});

document.getElementById("btnInvocacoes")?.addEventListener("click", () => {
  window.open("invocacoes.html", "_self");
});

async function loadLeaderboard() {
  try {
    const leaderboard = document.getElementById("leaderboard");
    if (!leaderboard) {
      console.error("O elemento #leaderboard não foi encontrado no DOM.");
      return;
    }

    // Limpa a lista do Ranking
    leaderboard.innerHTML = "";

    const playersRef = collection(db, "players");
    const playersQuery = query(playersRef, orderBy("xp", "desc"), limit(10));
    const querySnapshot = await getDocs(playersQuery);

    let rank = 1;
    querySnapshot.forEach((doc) => {
      const player = doc.data();
      
      // Cria o item da lista com as informações do jogador
      const listItem = document.createElement("li");
      listItem.innerHTML = `
        <span>${rank}° ${player.nick || "Desconhecido"} - ${player.cla || "Sem clã"} ... ${player.xp || 0} XP</span>`;
      leaderboard.appendChild(listItem);

      rank++;
    });

    console.log("Ranking carregado com sucesso.");
  } catch (error) {
    console.error("Erro ao carregar o Ranking:", error);
  }
}

// Faz o carregamento ao carregar a página
document.addEventListener("DOMContentLoaded", () => {
  console.log("Chamando loadLeaderboard...");
  loadLeaderboard();
});