// invocacoes.js - NOVA ÁRVORE VISUAL (similar a arvore_habilidade.js)

import { auth, db, requireAuth } from "./oauth.js";
import {
  doc, getDoc, updateDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from
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
   XP - FÓRMULA: XP(n) = 75 * n * (n + 1) / 2
========================================================= */
function xpForLevel(level) {
  return 75 * level * (level + 1) / 2;
}

function levelFromXp(xp) {
  // Inverter: 75*n^2 + 75*n - 2*xp = 0
  // n = (-75 + √(75² + 4*75*2*xp)) / (2*75)
  const discriminant = 75 * 75 + 4 * 75 * 2 * xp;
  const level = (-75 + Math.sqrt(discriminant)) / (2 * 75);
  return Math.floor(level);
}

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
  
  // GRID DE ANIMAIS (mostrar sempre se há invocações, mesmo se não expandida)
  if (invList.length > 0) {
    const grid = document.createElement("div");
    grid.className = "animais-grid";
    
    invList.forEach(inv => {
      grid.appendChild(makeAnimalCard(inv));
    });
    
    node.appendChild(grid);
  } else if (openFamilias.has(famKey)) {
    // Se expandida mas sem invocações, mostra mensagem
    const grid = document.createElement("div");
    grid.className = "animais-grid";
    const empty = document.createElement("p");
    empty.style.cssText = "color:#888; grid-column: 1/-1; padding:20px 0;";
    empty.textContent = "(Nenhuma invocação disponível)";
    grid.appendChild(empty);
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
  
  // Verifica se usuário tem a FAMÍLIA desbloqueada
  const familiaInvocacao = userData.Familia_Invocação || {};
  const familyUnlocked = inv.family && familiaInvocacao[inv.family] ? true : false;
  
  // Afinidade dentro da família (novo formato)
  let afinidade = 0;
  if (familyUnlocked && familiaInvocacao[inv.family]) {
    const animal = familiaInvocacao[inv.family].find(a => a.name === inv.name || a.id === inv.id);
    afinidade = animal ? (animal.afinidade || 0) : 0;
  }
  
  // Calcula nível e XP baseado em afinidade
  const nivel = levelFromXp(afinidade);
  const xpAtual = afinidade;
  const xpProximo = xpForLevel(nivel + 1);
  const xpNivelAtual = xpForLevel(nivel);
  const xpNivelEntreAtualEProximo = xpProximo - xpNivelAtual;
  const xpEntreAtualEProximo = xpAtual - xpNivelAtual;
  let progressoNivel = (xpEntreAtualEProximo / xpNivelEntreAtualEProximo) * 100;
  // Clampa entre 0 e 100 para evitar valores inválidos
  progressoNivel = Math.max(0, Math.min(100, progressoNivel));
  
  // Ícone: desbloqueado vs bloqueado (baseado na família, não invocação individual)
  const isLocked = !familyUnlocked && !userData.admin;
  const iconUrl = isLocked ? "assets/icons/kuchiyose_locked.png" : "assets/icons/kuchiyose.png";
  
  // Ícone
  const icon = document.createElement("img");
  icon.className = "animal-icon" + (isLocked ? " bloqueado" : "");
  icon.src = iconUrl;
  icon.alt = inv.name;
  icon.style.cssText = "width: 70px; height: 70px; border-radius: 6px; object-fit: cover; border: 2px solid #4af; transition: filter 0.2s, border-color 0.2s; margin: 0 auto;";
  card.appendChild(icon);
  
  // Barra de Afinidade (abaixo do ícone)
  const barContainer = document.createElement("div");
  barContainer.style.cssText = "width: 70px; height: 8px; background: rgba(255,255,255,0.15); border-radius: 4px; margin: 6px auto 0; overflow: hidden; position: relative; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);";
  
  const barFill = document.createElement("div");
  barFill.style.cssText = `height: 100%; width: ${progressoNivel}%; background: linear-gradient(90deg, #00ff00, #00ffff); transition: width 0.3s ease; box-shadow: 0 0 6px rgba(0, 255, 200, 0.6);`;
  barContainer.appendChild(barFill);
  
  card.appendChild(barContainer);
  
  // Nome do animal
  const nameDiv = document.createElement("div");
  nameDiv.className = "animal-nome";
  nameDiv.textContent = inv.name;
  nameDiv.style.cssText = "color: #eee; font-size: 0.9rem; text-align: center; margin-top: 8px; max-width: 120px; min-height: 20px;";
  card.appendChild(nameDiv);
  
  // Tooltip
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  
  tooltip.innerHTML = `<strong style="color:#4af;">${escapeHtml(inv.name)}</strong><br>` +
                       `<small style="color:#aaa;">Nível: ${nivel} · Afinidade: ${afinidade}</small><br>` +
                       (inv.desc ? `<small>${escapeHtml(inv.desc)}</small><br>` : "");
  
  if (Array.isArray(inv.jutsus) && inv.jutsus.length > 0) {
    tooltip.innerHTML += `<strong style="color:#f0a; display:block; margin-top:6px;">Jutsus:</strong>`;
    inv.jutsus.forEach(j => {
      const unlocked = afinidade >= j.unlockLevel;
      const status = unlocked ? "✓" : "⊘";
      const color = unlocked ? "#51cf66" : "#ff6b6b";
      tooltip.innerHTML += `<div style="color:${color}; font-size:11px;">${status} ${escapeHtml(j.name)}</div>`;
    });
  }
  
  card.appendChild(tooltip);
  
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
  
  // Buscar afinidade na nova estrutura
  const familiaInvocacao = userData.Familia_Invocação || {};
  let afinidade = 0;
  if (inv.family && familiaInvocacao[inv.family]) {
    const animal = familiaInvocacao[inv.family].find(a => a.name === inv.name || a.id === inv.id);
    afinidade = animal ? (animal.afinidade || 0) : 0;
  }
  
  const nivel = levelFromXp(afinidade);
  const xpProximo = xpForLevel(nivel + 1);
  
  title.textContent = `Invocar: ${inv.name}`;
  text.textContent = `Deseja invocar ${inv.name}?\n\nNível: ${nivel} · Afinidade: ${afinidade}/${xpProximo}`;
  
  // Listar jutsus disponíveis
  jutsusDiv.innerHTML = "";
  if (Array.isArray(inv.jutsus) && inv.jutsus.length > 0) {
    jutsusDiv.innerHTML = "<strong style='color:#f0a;'>Jutsus Desbloqueados:</strong>";
    inv.jutsus.forEach(j => {
      const unlocked = afinidade >= j.unlockLevel;
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
  const inv = invocacoes.find(i => i.id === invId);
  if (!inv) return alert("Invocação não encontrada");
  
  // Inicializar estrutura se não existir
  if (!userData.Familia_Invocação) userData.Familia_Invocação = {};
  if (!userData.Familia_Invocação[inv.family]) userData.Familia_Invocação[inv.family] = [];
  
  // Encontrar animal na família
  let animal = userData.Familia_Invocação[inv.family].find(a => a.name === inv.name || a.id === inv.id);
  
  if (!animal) {
    // Primeiro invoke - criar animal com afinidade 1
    animal = {
      id: inv.id,
      name: inv.name,
      afinidade: 1
    };
    userData.Familia_Invocação[inv.family].push(animal);
  } else {
    // Aumentar afinidade existente (sem limite, cresce infinitamente)
    animal.afinidade = (animal.afinidade || 0) + 1;
  }
  
  const nivelFinal = levelFromXp(animal.afinidade);
  
  try {
    const userRef = doc(db, "fichas", currentUID);
    await updateDoc(userRef, { Familia_Invocação: userData.Familia_Invocação });
    console.log(`✅ ${inv.name} → Afinidade ${animal.afinidade} (Nível ${nivelFinal})`);
    
    // Aguardar um pouco para garantir que o Firestore foi sincronizado
    setTimeout(() => {
      render();
      document.getElementById("confirmModal").classList.add("hidden");
    }, 100);
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

  document.getElementById("btnLoja")?.addEventListener("click", () => {
    window.location.href = "loja.html";
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
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) btnLogout.addEventListener("click", async () => { await signOut(auth); window.location.href = 'index.html'; });
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

  // Verificar se há ficha selecionada em localStorage (para múltiplas fichas)
  const selectedFichaUID = localStorage.getItem("selectedFichaUID");
  const fichaACarregar = selectedFichaUID || currentUID;
  
  try {
    // Carregar dados da ficha selecionada
    const userRef = doc(db, "fichas", fichaACarregar);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      userData = userSnap.data();
    }

    // Carregar fichas disponíveis e popular dropdown
    await carregarFichasDisponiveisInvocacoes();

    // Mostra botão admin se usuário for admin (só da conta principal)
    const principalSnap = await getDoc(doc(db, "fichas", currentUID));
    const principalData = principalSnap.data() ?? {};
    if (principalData.admin) {
      const btnAdmin = document.getElementById("btnAdmin");
      if (btnAdmin) {
        btnAdmin.style.display = "block";
      }
    }
    
    // Carregar invocacoes e regions
    await loadInvocacoesAndRegions();
    
    // Atualizar header – XP e pontos (não existe mais #infoTopo)
    const playerOnlyXp = document.getElementById("playerOnlyXp");
    if (playerOnlyXp) {
      // usar mesma fórmula de xpToReachLevel da árvore
      const xpNext = 100 * userData.nivel * (userData.nivel + 1) / 2;
      playerOnlyXp.textContent = `XP: ${userData.xp} / ${xpNext}`;
    }
    const playerOnlyPontos = document.getElementById("playerOnlyPontos");
    if (playerOnlyPontos) {
      playerOnlyPontos.textContent = `Pontos: ${userData.pontos || 0}`;
    }
    
    // Setup UI
    const uniqueRegions = extractUniqueRegions();
    setupRegionTabs(uniqueRegions);
    setupButtons();
    
    console.log("✅ Invocações carregadas e renderizadas");
  } catch (error) {
    console.error("❌ Erro ao inicializar:", error);
  }
});

/* =========================================================
   MÚLTIPLAS FICHAS - CARREGAR E TROCAR (Invocações)
========================================================= */
async function carregarFichasDisponiveisInvocacoes() {
  try {
    const selectFicha = document.getElementById("selectFicha");
    if (!selectFicha) return;

    // Buscar linked accounts do UID autenticado
    const linksSnap = await getDoc(doc(db, "user_account_links", currentUID));
    const fichasUIDs = linksSnap.exists() ? (linksSnap.data().fichas || []) : [currentUID];

    // Carregar dados de todas as fichas
    const fichasCarregadas = [];
    for (const uid of fichasUIDs) {
      const fichSnap = await getDoc(doc(db, "fichas", uid));
      if (fichSnap.exists()) {
        fichasCarregadas.push({
          uid,
          nick: fichSnap.data().nick,
          cla: fichSnap.data().cla,
          nivel: fichSnap.data().nivel || 1,
          isPrimary: fichSnap.data().isPrimary ?? true
        });
      }
    }

    // Ordenar: primary primeiro, depois by nick
    fichasCarregadas.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return b.isPrimary - a.isPrimary;
      return a.nick.localeCompare(b.nick);
    });

    // Preencher select (aparece apenas se tem múltiplas fichas)
    const selectedFichaUID = localStorage.getItem("selectedFichaUID") || currentUID;
    selectFicha.innerHTML = fichasCarregadas.map(f => 
      `<option value="${f.uid}" ${f.uid === selectedFichaUID ? 'selected' : ''}>${f.nick} - ${f.cla} (Lv ${f.nivel}) ${f.isPrimary ? '⭐' : ''}</option>`
    ).join("");

    // Se só tem 1 ficha, desabilitar mas manter o combo visível
    if (fichasCarregadas.length <= 1) {
      selectFicha.disabled = true;
    } else {
      selectFicha.disabled = false;
    }

    // Listener para trocar de ficha
    selectFicha.removeEventListener("change", trocaFichaSemReloadInvocacoes);
    selectFicha.addEventListener("change", trocaFichaSemReloadInvocacoes);
  } catch (err) {
    console.error("Erro ao carregar fichas:", err);
  }
}

function trocaFichaSemReloadInvocacoes(e) {
  const novoUID = e.target.value;
  if (!novoUID) return;

  localStorage.setItem("selectedFichaUID", novoUID);
  window.location.reload();
}

