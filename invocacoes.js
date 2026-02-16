// invocacoes.js - NOVA ÁRVORE VISUAL (similar a arvore_habilidade.js)

import { auth, db, requireAuth } from "./oauth.js";
import {
  doc, getDoc, updateDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Proteção: Verificar se usuário está logado
requireAuth();

let currentUID = null;
let userData = {};
let invocacoes = [];
let regions = {};
let currentRegion = null;
let openFamilias = new Set(); // Famílias expandidas/fechadas

/* =========================================================
   CARREGA DADOS DO FIREBASE
========================================================= */
async function loadInvocacoesAndRegions() {
  try {
    const docRef = doc(db, "game_data", "invocacoes_v1");
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      console.log("Documento invocacoes_v1 não encontrado");
      return;
    }

    const data = docSnap.data();
    invocacoes = Array.isArray(data.invocacoes) ? data.invocacoes : [];
    regions = data.regions || {};

    console.log("✅ Invocações carregadas:", invocacoes.length);
    console.log("✅ Regiões carregadas:", Object.keys(regions).length);
  } catch (error) {
    console.error("❌ Erro ao carregar invocacoes:", error);
  }
}

/* =========================================================
   EXTRAI REGIÕES ÚNICAS DOS DADOS
========================================================= */
function extractUniqueRegions() {
  const unique = new Set();
  invocacoes.forEach(inv => {
    if (inv.region) unique.add(inv.region);
  });
  
  // Incluir regiões mesmo que vazias
  Object.keys(regions).forEach(key => {
    unique.add(key);
  });
  
  return Array.from(unique).sort();
}

/* =========================================================
   SETUP: ABAS POR REGIÃO
========================================================= */
function setupRegionTabs(uniqueRegions) {
  const tabsContainer = document.getElementById("region-tabs");
  if (!tabsContainer) return;
  
  tabsContainer.innerHTML = "";
  
  uniqueRegions.forEach(regionKey => {
    const btn = document.createElement("button");
    btn.className = "region-btn";
    btn.dataset.region = regionKey;
    
    const regionMeta = regions[regionKey];
    const regionName = regionMeta ? regionMeta.name : regionKey;
    
    btn.textContent = regionName;
    btn.addEventListener("click", () => selectRegion(regionKey));
    
    tabsContainer.appendChild(btn);
  });
  
  // Selecionar primeira região por padrão
  if (uniqueRegions.length > 0) {
    selectRegion(uniqueRegions[0]);
  }
}

/* =========================================================
   SELECIONA REGIÃO E RENDERIZA
========================================================= */
function selectRegion(regionKey) {
  currentRegion = regionKey;
  
  // Marca botão como ativo
  document.querySelectorAll(".region-btn").forEach(btn => {
    btn.classList.remove("active");
    if (btn.dataset.region === regionKey) {
      btn.classList.add("active");
    }
  });
  
  // Reset expansões ao trocar região
  openFamilias.clear();
  render();
}

/* =========================================================
   RENDERIZA ÁRVORE COMPLETA
========================================================= */
function render() {
  const chart = document.getElementById("org-chart");
  if (!chart) return;
  
  chart.innerHTML = "";
  
  if (!currentRegion) {
    chart.innerHTML = "<p style='color:#888;'>Selecione uma região</p>";
    return;
  }
  
  const regionInvocacoes = invocacoes.filter(inv => (inv.region || "") === currentRegion);
  const regionMeta = regions[currentRegion];
  
  // Agrupar invocações por família
  const byFamily = {};
  (regionMeta && regionMeta.families) ? Object.keys(regionMeta.families).forEach(famKey => {
    byFamily[famKey] = [];
  }) : null;
  
  regionInvocacoes.forEach(inv => {
    const famKey = inv.family || "Sem Família";
    if (!byFamily[famKey]) byFamily[famKey] = [];
    byFamily[famKey].push(inv);
  });
  
  // Renderizar famílias na ordem definida
  const familyKeys = regionMeta && regionMeta.families 
    ? Object.keys(regionMeta.families) 
    : Object.keys(byFamily);
  
  familyKeys.forEach(famKey => {
    const familyMeta = regionMeta && regionMeta.families ? regionMeta.families[famKey] : null;
    const invList = byFamily[famKey] || [];
    
    const familiaNode = makeFamiliaNode(famKey, familyMeta, invList);
    chart.appendChild(familiaNode);
  });
}

/* =========================================================
   CRIA NÓ DE FAMÍLIA (com toggle + grid de animais)
========================================================= */
function makeFamiliaNode(famKey, familyMeta, invList) {
  const familyName = familyMeta ? familyMeta.name : famKey;
  const familyIcon = familyMeta && familyMeta.icon ? familyMeta.icon : "assets/icons/kuchiyose.png";
  const familyDesc = familyMeta ? familyMeta.description : "";
  
  const node = document.createElement("div");
  node.className = "familia-node";
  
  // CABEÇALHO DA FAMÍLIA
  const header = document.createElement("div");
  header.className = "familia-header";
  
  // Ícone da família
  const icon = document.createElement("img");
  icon.className = "familia-icon";
  icon.src = familyIcon;
  icon.alt = familyName;
  header.appendChild(icon);
  
  // Nome da família
  const name = document.createElement("div");
  name.className = "familia-nome";
  name.textContent = familyName;
  if (familyDesc) {
    name.style.borderBottom = "1px dotted rgba(74, 170, 255, 0.5)";
    name.style.cursor = "help";
    name.title = familyDesc;
  }
  header.appendChild(name);
  
  // Botão toggle
  const toggle = document.createElement("button");
  toggle.className = "familia-toggle";
  toggle.textContent = openFamilias.has(famKey) ? "−" : "+";
  toggle.addEventListener("click", () => {
    if (openFamilias.has(famKey)) {
      openFamilias.delete(famKey);
    } else {
      openFamilias.add(famKey);
    }
    render();
  });
  header.appendChild(toggle);
  
  node.appendChild(header);
  
  // GRID DE ANIMAIS (se expansível)
  if (openFamilias.has(famKey) || invList.length > 0) {
    const grid = document.createElement("div");
    grid.className = "animais-grid";
    
    if (invList.length === 0) {
      const empty = document.createElement("p");
      empty.style.cssText = "color:#888; grid-column: 1/-1; padding:20px 0;";
      empty.textContent = "(Nenhuma invocação disponível)";
      grid.appendChild(empty);
    } else {
      invList.forEach(inv => {
        grid.appendChild(makeAnimalCard(inv));
      });
    }
    
    node.appendChild(grid);
  }
  
  return node;
}

/* =========================================================
   CRIA CARD DE ANIMAL (INVOCAÇÃO)
========================================================= */
function makeAnimalCard(inv) {
  const card = document.createElement("div");
  card.className = "animal-card";
  card.dataset.invId = inv.id;
  
  // Verifica se usuário tem no ficha
  const hasInvocation = userData.invocacoes && userData.invocacoes[inv.id];
  const currentLevel = (userData.invocacoes && userData.invocacoes[inv.id]) ? userData.invocacoes[inv.id] : 0;
  
  // Ícone: desbloqueado vs bloqueado
  const isLocked = !hasInvocation;
  const iconUrl = isLocked ? "assets/icons/kuchiyose_locked.png" : "assets/icons/kuchiyose.png";
  
  const icon = document.createElement("img");
  icon.className = "animal-icon" + (isLocked ? " bloqueado" : "");
  icon.src = iconUrl;
  icon.alt = inv.name;
  card.appendChild(icon);
  
  // Nome do animal
  const nameDiv = document.createElement("div");
  nameDiv.className = "animal-nome";
  nameDiv.textContent = inv.name;
  card.appendChild(nameDiv);
  
  // Barra de Afinidade
  const barContainer = document.createElement("div");
  barContainer.className = "afinidade-bar";
  
  const barFill = document.createElement("div");
  barFill.className = "afinidade-fill";
  const maxLevel = inv.max || 10;
  barFill.style.width = ((currentLevel || 0) / maxLevel * 100) + "%";
  barContainer.appendChild(barFill);
  card.appendChild(barContainer);
  
  // Tooltip
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  
  let tooltipHTML = `<strong style="color:#4af;">${inv.name}</strong>\n`;
  tooltipHTML += `<small style="color:#aaa;">Afinidade: ${currentLevel || 0}/${maxLevel}</small>\n`;
  
  if (inv.desc) {
    tooltipHTML += `\n${inv.desc}\n`;
  }
  
  // Jutsus
  if (Array.isArray(inv.jutsus) && inv.jutsus.length > 0) {
    tooltipHTML += `\n<strong style="color:#f0a;">Jutsus:</strong>\n`;
    inv.jutsus.forEach(j => {
      const unlocked = currentLevel >= j.unlockLevel;
      const status = unlocked ? "✓" : "⊘";
      const color = unlocked ? "#51cf66" : "#ff6b6b";
      tooltipHTML += `<span style="color:${color};">${status} ${j.name}</span>\n`;
    });
  }
  
  tooltip.textContent = tooltipHTML;
  // Melhor converter para innerHTML com escaping adequado
  tooltip.innerHTML = `<strong style="color:#4af;">${escapeHtml(inv.name)}</strong><br>` +
                       `<small style="color:#aaa;">Afinidade: ${currentLevel || 0}/${maxLevel}</small><br>` +
                       (inv.desc ? `<small>${escapeHtml(inv.desc)}</small><br>` : "");
  
  if (Array.isArray(inv.jutsus) && inv.jutsus.length > 0) {
    tooltip.innerHTML += `<strong style="color:#f0a; display:block; margin-top:6px;">Jutsus:</strong>`;
    inv.jutsus.forEach(j => {
      const unlocked = currentLevel >= j.unlockLevel;
      const status = unlocked ? "✓" : "⊘";
      const color = unlocked ? "#51cf66" : "#ff6b6b";
      tooltip.innerHTML += `<div style="color:${color}; font-size:11px;">${status} ${escapeHtml(j.name)}</div>`;
    });
  }
  
  card.appendChild(tooltip);
  
  // Clique para invocar
  card.addEventListener("click", () => {
    if (isLocked && !userData.admin) {
      return alert("Você ainda não desbloqueou esta invocação!");
    }
    openConfirm(inv);
  });
  
  return card;
}

// Helper para evitar XSS
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/* =========================================================
   MODAL DE CONFIRMAÇÃO
========================================================= */
function openConfirm(inv) {
  const modal = document.getElementById("confirmModal");
  const title = document.getElementById("modalTitle");
  const text = document.getElementById("modalText");
  const jutsusDiv = document.getElementById("modalJutsus");
  
  const currentLevel = (userData.invocacoes && userData.invocacoes[inv.id]) ? userData.invocacoes[inv.id] : 0;
  const maxLevel = inv.max || 10;
  
  title.textContent = `Invocar: ${inv.name}`;
  text.textContent = `Deseja invocar ${inv.name}? (Afinidade: ${currentLevel}/${maxLevel})`;
  
  // Listar jutsus disponíveis
  jutsusDiv.innerHTML = "";
  if (Array.isArray(inv.jutsus) && inv.jutsus.length > 0) {
    jutsusDiv.innerHTML = "<strong style='color:#f0a;'>Jutsus Desbloqueados:</strong>";
    inv.jutsus.forEach(j => {
      const unlocked = currentLevel >= j.unlockLevel;
      if (unlocked) {
        jutsusDiv.innerHTML += `<div style="color:#51cf66; font-size:12px; margin:4px 0;">✓ ${j.name}</div>`;
      }
    });
  }
  
  modal.classList.remove("hidden");
  
  document.getElementById("btnConfirm").onclick = () => invocarSummon(inv.id);
  document.getElementById("btnCancel").onclick = () => modal.classList.add("hidden");
}

/* =========================================================
   INVOCAR SUMMON (AUMENTA AFINIDADE)
========================================================= */
async function invocarSummon(invId) {
  if (!userData.invocacoes) userData.invocacoes = {};
  
  const inv = invocacoes.find(i => i.id === invId);
  if (!inv) return alert("Invocação não encontrada");
  
  const currentLevel = userData.invocacoes[invId] || 0;
  const maxLevel = inv.max || 10;
  
  if (currentLevel >= maxLevel) {
    return alert(`${inv.name} atingiu afinidade máxima!`);
  }
  
  const newLevel = currentLevel + 1;
  userData.invocacoes[invId] = newLevel;
  
  try {
    const userRef = doc(db, "fichas", currentUID);
    await updateDoc(userRef, { invocacoes: userData.invocacoes });
    console.log(`✅ ${inv.name} → Afinidade ${newLevel}/${maxLevel}`);
    render();
    document.getElementById("confirmModal").classList.add("hidden");
  } catch (error) {
    console.error("❌ Erro ao atualizar afinidade:", error);
    alert("Erro ao atualizar afinidade!");
  }
}

/* =========================================================
   BOTÕES DE NAVEGAÇÃO
========================================================= */
function setupButtons() {
  document.getElementById("btnPerfil")?.addEventListener("click", () => {
    window.location.href = "perfil.html";
  });
  
  document.getElementById("btnHabilidades")?.addEventListener("click", () => {
    window.location.href = "arvore_habilidade.html";
  });
  
  const btnAdmin = document.getElementById("btnAdmin");
  if (btnAdmin && userData.admin) {
    btnAdmin.style.display = "inline-block";
    btnAdmin.addEventListener("click", () => {
      window.location.href = "admin.html";
    });
  }
}

/* =========================================================
   INIT: CARREGA USUÁRIO E DADOS
========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.log("Usuário não autenticado");
    return;
  }
  
  currentUID = user.uid;
  
  try {
    // Carregar dados do usuário
    const userRef = doc(db, "fichas", currentUID);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      userData = userSnap.data();
    }
    
    // Carregar invocacoes e regions
    await loadInvocacoesAndRegions();
    
    // Atualizar header
    document.getElementById("infoTopo").textContent = userData.nome || "Aventureiro";
    
    // Setup UI
    const uniqueRegions = extractUniqueRegions();
    setupRegionTabs(uniqueRegions);
    setupButtons();
    
    console.log("✅ Invocações carregadas e renderizadas");
  } catch (error) {
    console.error("❌ Erro ao inicializar:", error);
  }
});
