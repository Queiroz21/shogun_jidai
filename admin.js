// admin.js — Painel Administrativo para Admins

import { auth, db } from "./oauth.js";
import {
  doc, getDoc, updateDoc, setDoc, collection, getDocs, addDoc, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUID = null;
let currentAdmin = false;
let currentAdminNick = null;
let players = [];
let xpLogs = [];
let skillsList = [];
let selectedSkill = null;
let currentRequirements = [];
let invocationsList = [];
let selectedInv = null;
let classificationsList = [];
let regionsObj = {};
let pendingJutsus = []; // Jutsus sendo adicionados à nova invocação
let editingJutsus = []; // Jutsus sendo editados na invocação selecionada

/* =========================================================
   AUTH CHECK
========================================================= */
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUID = user.uid;
  const snap = await getDoc(doc(db, "fichas", currentUID));
  const userData = snap.data() ?? {};

  currentAdminNick = userData.nick || null;

  // Verifica se tem permissão admin
  if (!userData.admin) {
    document.body.innerHTML = `
      <div class="no-access">
        <h2>❌ Acesso Negado</h2>
        <p>Você não possui permissão para acessar o painel administrativo.</p>
        <a href="arvore_habilidade.html" style="color: #4af;">Voltar ao jogo</a>
      </div>
    `;
    return;
  }

  currentAdmin = true;

  // Atualizar header com info do admin
  const playerXpElement = document.getElementById("playerOnlyXp");
  const playerPontosElement = document.getElementById("playerOnlyPontos");
  
  if (playerXpElement) {
    const nextLevelXP = 100 * userData.nivel * (userData.nivel + 1) / 2;
    playerXpElement.textContent = `XP: ${userData.xp || 0} / ${nextLevelXP}`;
  }
  if (playerPontosElement) {
    playerPontosElement.textContent = `Pontos: ${userData.pontos || 0}`;
  }

  // Carregar fichas disponíveis (múltiplas contas)
  await carregarFichasDisponiveisAdmin();

  // Inicializa a página
  initAdmin();
  const btnLogout = document.createElement("button");
  btnLogout.className = "header-btn";
  btnLogout.textContent = "Sair";
  btnLogout.style.cssText = "background: #f66; margin-left: 12px;";
  btnLogout.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "index.html";
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      window.location.href = "index.html";
    }
  });
  document.getElementById("header-right")?.appendChild(btnLogout);

  // Inicializa a página
  initAdmin();
});

/* =========================================================
   MÚLTIPLAS FICHAS - CARREGAR E TROCAR (Admin)
========================================================= */
async function carregarFichasDisponiveisAdmin() {
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

    // Se só tem 1 ficha, esconder select
    if (fichasCarregadas.length <= 1) {
      selectFicha.style.display = "none";
    }

    // Listener para trocar de ficha
    selectFicha.removeEventListener("change", trocaFichaSemReloadAdmin);
    selectFicha.addEventListener("change", trocaFichaSemReloadAdmin);
  } catch (err) {
    console.error("Erro ao carregar fichas:", err);
  }
}

function trocaFichaSemReloadAdmin(e) {
  const novoUID = e.target.value;
  if (!novoUID) return;

  localStorage.setItem("selectedFichaUID", novoUID);
  window.location.reload();
}


/* =========================================================
   INICIALIZAÇÃO DO PAINEL
========================================================= */
async function initAdmin() {
  // Carrega jogadores
  await loadPlayers();

  // Carrega histórico de XP
  await loadXPLogs();

  // Carrega skills para edição
  await loadSkillsForEditing();

  // Carrega invocações para criação/edição
  await loadInvocationsForEditing();

  // Setup das abas
  setupTabs();

  // Setup do formulário de XP
  setupXPForm();

  // Setup de edição de skills
  setupSkillsEditor();

  // Setup invocações
  setupInvocationsEditor();

  // Setup editor de regiões
  setupRegionsEditor();

  // Setup abas de visualização (invocações e skills do jogador)
  setupInvocacoesJogadorTab();
  setupSkillsJogadorTab();
  // Setup forms for adding invocações and doujutsu to players
  setupAddInvocacaoPlayerForm();
  setupAddDoujutsuForm();
  // diagnostic button to inspect token claims and own ficha
  setupAdminDiagnostics();
}

/* =========================================================
   NORMALIZAÇÃO DE REQUISITOS / SKILLS
========================================================= */
function normalizeRequirement(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {};
  // Detect type
  r.type = raw.type || (raw.id || raw.name ? 'skill' : (raw.value && !(raw.lvl || raw.level) ? 'clan' : ((raw.lvl || raw.level) ? 'playerLevel' : 'unknown')));

  if (r.type === 'skill') {
    r.id = raw.id || raw.name || null;
    if (raw.name) r.name = raw.name;
    else if (raw.id && raw.displayName) r.name = raw.displayName;
    else r.name = raw.name || raw.id || null;
    r.lvl = Number(raw.lvl ?? raw.level ?? raw.lvl ?? 1);
  } else if (r.type === 'clan') {
    r.value = raw.value || raw.name || '';
  } else if (r.type === 'playerLevel') {
    r.lvl = Number(raw.lvl ?? raw.level ?? 1);
  } else {
    // Preserve data but prefer lvl field if present
    if (raw.lvl || raw.level) r.lvl = Number(raw.lvl ?? raw.level);
    if (raw.value) r.value = raw.value;
    if (raw.id) r.id = raw.id;
  }
  return r;
}

function normalizeRequirementsArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeRequirement);
}

function normalizeSkillObject(skill) {
  if (!skill || typeof skill !== 'object') return skill;
  const s = { ...skill };
  const rawReqs = s.requires ?? s.requirements ?? s.requisitos ?? [];
  s.requires = normalizeRequirementsArray(rawReqs);
  // remove alternate keys to keep canonical shape
  delete s.requirements;
  delete s.requisitos;
  return s;
}

// Safe getters for XP invocation region/family selects (may be removed from DOM)
function getXPRegionValue() {
  const el = document.getElementById('xp-inv-region');
  return el ? (el.value || null) : null;
}

function getXPFamilyValue() {
  const el = document.getElementById('xp-inv-family');
  return el ? (el.value || null) : null;
}

// Diagnostic helper: create a button that inspects token claims and fichas/{uid}
async function setupAdminDiagnostics() {
  try {
    const header = document.getElementById('header-right');
    if (!header) return;
    if (document.getElementById('btn-admin-diagnostic')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-admin-diagnostic';
    btn.className = 'header-btn';
    btn.textContent = 'Diagnóstico Admin';
    btn.style.cssText = 'margin-left:8px; background: #ffb400; color: #000;';
    btn.addEventListener('click', async () => {
      try {
        const user = auth.currentUser;
        if (!user) return alert('Nenhum usuário autenticado');
        const idToken = await user.getIdTokenResult(true);
        console.log('ID Token Claims:', idToken.claims);
        const snap = await getDoc(doc(db, 'fichas', user.uid));
        console.log('fichas/' + user.uid + ':', snap.exists() ? snap.data() : null);
        const adminClaim = !!idToken.claims.admin;
        const fichaExists = snap.exists();
        const fichaAdmin = fichaExists ? !!snap.data().admin : false;
        alert(
          `UID: ${user.uid}\nCustomClaim admin: ${adminClaim}\nFicha existe: ${fichaExists}\nFicha.admin: ${fichaAdmin}`
        );
      } catch (err) {
        console.error('Erro no diagnóstico:', err);
        alert('Erro ao executar diagnóstico: ' + (err.message || err.code || ''));
      }
    });
    header.appendChild(btn);
  } catch (err) {
    console.error('Falha ao criar diagnostic button:', err);
  }
}

/* =========================================================
   INVOCACOES — CARREGAMENTO E EDIÇÃO
========================================================= */
async function loadInvocationsForEditing() {
  try {
    const snap = await getDoc(doc(db, "game_data", "invocacoes_v1"));
    if (!snap.exists()) {
      invocationsList = [];
      loadInvocationsSelect();
      return;
    }

    const data = snap.data();
    // Support structured document: classifications, regions, invocations
      // Normalize classifications: support old format (array of strings) and new (array of {id,name,desc})
      const rawClass = data.classifications || [];
      classificationsList = (rawClass || []).map(c => {
        if (!c) return null;
        if (typeof c === 'string') return { id: '', name: c, desc: '' };
        if (typeof c === 'object') return { id: (c.id || ''), name: (c.name || c.title || ''), desc: (c.desc || c.description || '') };
        return null;
      }).filter(Boolean);
    regionsObj = data.regions || {};

    // render classifications UI if present
    try { renderClassificationsList(); } catch (e) { /* ignore */ }

    let raw = data.Invocacoes ?? data.invocacoes ?? data.invocations ?? [];

    if (typeof raw === "object" && !Array.isArray(raw)) {
      raw = Object.entries(raw).map(([id, obj]) => ({ id, ...(obj || {}) }));
    }

    invocationsList = Array.isArray(raw) ? raw : [];
    loadInvocationsSelect();
    // populate hierarchical selects if present
    populateInvocationHierarchyOptions();
  } catch (err) {
    console.error("Erro ao carregar invocações para edição:", err);
  }
}

function loadInvocationsSelect() {
  const sel = document.getElementById("inv-select");
  if (!sel) return;
  sel.innerHTML = "<option value=''>-- Selecione uma Invocação --</option>";
  invocationsList.forEach((inv, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = `${inv.name || inv.id || `Inv ${idx}`}`;
    sel.appendChild(opt);
  });

  sel.addEventListener("change", (e) => {
    const idx = parseInt(e.target.value);
    if (isNaN(idx)) {
      document.getElementById("inv-editor").style.display = "none";
      return;
    }
    loadInvocationEditor(idx);
  });

  // Wire up create/save buttons
  document.getElementById("btn-create-inv")?.addEventListener("click", createNewInvocation);
  document.getElementById("btn-save-inv")?.addEventListener("click", saveInvocationChanges);
  document.getElementById("btn-create-skill")?.addEventListener("click", createNewSkill);
  document.getElementById("btn-add-jutsu")?.addEventListener("click", addJutsuToList);
  document.getElementById("btn-add-edit-jutsu")?.addEventListener("click", addJutsuToEditList);
}

// Global cascade functions for region/family/rank
function fillFamilies(regionKey, familySel, rankSel) {
  familySel.innerHTML = '<option value="">Família</option>';
  rankSel.innerHTML = '<option value="">Ranking</option>';
  if (!regionKey || !regionsObj[regionKey]) return;
  const families = regionsObj[regionKey].families || {};
  Object.keys(families).forEach(fk => {
    const fmeta = families[fk];
    const o = document.createElement('option'); o.value = fk; o.textContent = fmeta.name || fk; familySel.appendChild(o);
  });
}

function fillRanks(regionKey, familyKey, rankSel) {
  rankSel.innerHTML = '<option value="">Ranking</option>';
  if (!regionKey || !familyKey) return;
  const fam = regionsObj[regionKey]?.families?.[familyKey];
  if (!fam) return;
  const ranks = fam.rankings || {};
  Object.keys(ranks).forEach(rk => {
    const o = document.createElement('option'); o.value = rk; o.textContent = rk; rankSel.appendChild(o);
  });
}

function populateInvocationHierarchyOptions() {
  // classification - mostra ID e DESCRIÇÃO
  const clsSel = document.getElementById("new-inv-classification");
  const editCls = document.getElementById("inv-classification");
  if (clsSel) {
    clsSel.innerHTML = `<option value="">-- Selecione --</option>`;
    classificationsList.forEach(c => {
      const val = (c && c.name) ? c.name : c;
      // Build label to prefer: id - desc - name  |  id - name  |  name - desc  |  name
      let label = val;
      const hasId = !!(c && c.id);
      const hasDesc = !!(c && c.desc);
      const namePart = (c && c.name) ? c.name : val;
      if (hasId && hasDesc) label = `${c.id} - ${c.desc} - ${namePart}`;
      else if (hasId) label = `${c.id} - ${namePart}`;
      else if (hasDesc) label = `${namePart} - ${c.desc}`;
      else label = namePart;
      const o = document.createElement('option'); o.value = val; o.textContent = label; clsSel.appendChild(o);
    });
  }
  if (editCls) {
    editCls.innerHTML = `<option value="">-- Selecione --</option>`;
    classificationsList.forEach(c => {
      const val = (c && c.name) ? c.name : c;
      let label = val;
      const hasId = !!(c && c.id);
      const hasDesc = !!(c && c.desc);
      const namePart = (c && c.name) ? c.name : val;
      if (hasId && hasDesc) label = `${c.id} - ${c.desc} - ${namePart}`;
      else if (hasId) label = `${c.id} - ${namePart}`;
      else if (hasDesc) label = `${namePart} - ${c.desc}`;
      else label = namePart;
      const o = document.createElement('option'); o.value = val; o.textContent = label; editCls.appendChild(o);
    });
  }

  // regions
  const regionSel = document.getElementById('new-inv-region');
  const editRegion = document.getElementById('inv-region');
  const xpRegion = document.getElementById('xp-inv-region');
  const xpFamily = document.getElementById('xp-inv-family');
  if (regionSel) { regionSel.innerHTML = '<option value="">Região</option>'; }
  if (editRegion) { editRegion.innerHTML = '<option value="">Região</option>'; }
  if (xpRegion) { xpRegion.innerHTML = '<option value="">-- Selecione --</option>'; }
  if (xpFamily) { xpFamily.innerHTML = '<option value="">-- Selecione --</option>'; }

  Object.keys(regionsObj || {}).forEach(key => {
    const meta = regionsObj[key];
    if (regionSel) { const o = document.createElement('option'); o.value = key; o.textContent = meta.name || key; regionSel.appendChild(o); }
    if (editRegion) { const o = document.createElement('option'); o.value = key; o.textContent = meta.name || key; editRegion.appendChild(o); }
    if (xpRegion) { const o = document.createElement('option'); o.value = key; o.textContent = meta.name || key; xpRegion.appendChild(o); }
  });

  // wire cascade listeners
  const newRegion = document.getElementById('new-inv-region');
  const newFamily = document.getElementById('new-inv-family');
  const newRank = document.getElementById('new-inv-rank');
  const editRegionSel = document.getElementById('inv-region');
  const editFamily = document.getElementById('inv-family');
  const editRank = document.getElementById('inv-rank');

  if (newRegion && newFamily && newRank) {
    newRegion.addEventListener('change', (e) => fillFamilies(e.target.value, newFamily, newRank));
    newFamily.addEventListener('change', (e) => fillRanks(newRegion.value, e.target.value, newRank));
  }
  if (editRegionSel && editFamily && editRank) {
    editRegionSel.addEventListener('change', (e) => fillFamilies(e.target.value, editFamily, editRank));
    editFamily.addEventListener('change', (e) => fillRanks(editRegionSel.value, e.target.value, editRank));
  }
}

function loadInvocationEditor(idx) {
  selectedInv = invocationsList[idx];
  if (!selectedInv) return;
  document.getElementById("inv-name").value = selectedInv.name || "";
  document.getElementById("inv-classification").value = selectedInv.category || "";
  document.getElementById("inv-max").value = selectedInv.max || 1;
  document.getElementById("inv-desc").value = selectedInv.desc || "";
  document.getElementById("inv-icon").value = selectedInv.icon || "";
  
  // Set region/family/rank and trigger cascades
  const regionSel = document.getElementById("inv-region");
  const familySel = document.getElementById("inv-family");
  const rankSel = document.getElementById("inv-rank");
  
  const region = selectedInv.region || "";
  const family = selectedInv.family || "";
  const rank = selectedInv.rank || "";
  
  if (regionSel) {
    regionSel.value = region;
    if (familySel && rankSel) {
      fillFamilies(region, familySel, rankSel);
      if (family) {
        familySel.value = family;
        fillRanks(region, family, rankSel);
        if (rank) rankSel.value = rank;
      }
    }
  }

  // Carregar jutsus da invocação
  editingJutsus = selectedInv.jutsus ? JSON.parse(JSON.stringify(selectedInv.jutsus)) : [];
  renderEditJutsusList();
  
  document.getElementById("inv-editor").style.display = "block";
}

async function saveInvocationChanges() {
  if (!selectedInv) return;
  try {
    // capture old state for log
    const oldInv = Object.assign({}, selectedInv);

    selectedInv.name = document.getElementById("inv-name").value.trim();
    selectedInv.category = document.getElementById("inv-classification").value.trim();
    selectedInv.region = document.getElementById("inv-region")?.value?.trim() || null;
    selectedInv.family = document.getElementById("inv-family")?.value?.trim() || null;
    selectedInv.rank = document.getElementById("inv-rank")?.value?.trim() || null;
    selectedInv.max = parseInt(document.getElementById("inv-max").value) || 1;
    selectedInv.desc = document.getElementById("inv-desc").value;
    const iconValue = document.getElementById("inv-icon")?.value?.trim();
    if (iconValue) selectedInv.icon = iconValue;
    else delete selectedInv.icon;
    if (editingJutsus.length > 0) selectedInv.jutsus = [...editingJutsus];
    else delete selectedInv.jutsus;

    // Salva de volta no documento invocacoes_v1
    const ref = doc(db, "game_data", "invocacoes_v1");
    // Garantir array
    await updateDoc(ref, {
      invocacoes: invocationsList
    }).catch(async (err) => {
      // se update falhar porque doc não existe, cria com setDoc
      await setDoc(ref, { invocacoes: invocationsList }, { merge: true });
    });

    document.getElementById("inv-edit-message").textContent = "✅ Invocação salva";
    document.getElementById("inv-edit-message").classList.add("show");
    setTimeout(() => document.getElementById("inv-edit-message").classList.remove("show"), 3000);

    // Reload
    await loadInvocationsForEditing();

    // registrar log de edição
    try {
      await addDoc(collection(db, 'skill_logs'), {
        type: 'invocation', action: 'edit',
        itemId: selectedInv.id || null, itemName: selectedInv.name || null,
        adminId: currentUID, adminNick: currentAdminNick,
        oldData: oldInv, newData: selectedInv, date: new Date()
      });
      console.log('✅ Log de invocação registrado com sucesso');
    } catch (logErr) {
      console.error('❌ Falha ao registrar invocacao log:', logErr);
      console.warn('Tentativa falhou com código: ' + logErr.code);
    }
  } catch (err) {
    console.error("Erro ao salvar invocação:", err);
    document.getElementById("inv-edit-error").textContent = `Erro: ${err.message}`;
    document.getElementById("inv-edit-error").classList.add("show");
    setTimeout(() => document.getElementById("inv-edit-error").classList.remove("show"), 4000);
  }
}

/* =========================================================
   GERENCIADOR DE JUTSUS
   Adiciona e remove jutsus da invocação sendo criada
========================================================= */
function addJutsuToList() {
  const name = document.getElementById("new-jutsu-name")?.value?.trim();
  const level = parseInt(document.getElementById("new-jutsu-level")?.value) || 1;
  const element = document.getElementById("new-jutsu-element")?.value?.trim();
  const desc = document.getElementById("new-jutsu-desc")?.value?.trim() || "";

  if (!name) {
    alert("Nome do jutsu é obrigatório");
    return;
  }

  const jutsu = { name, unlockLevel: level };
  if (element) jutsu.element = element;
  if (desc) jutsu.description = desc;

  pendingJutsus.push(jutsu);
  renderJutsusList();

  // Limpar campos
  document.getElementById("new-jutsu-name").value = "";
  document.getElementById("new-jutsu-level").value = "1";
  document.getElementById("new-jutsu-element").value = "";
  document.getElementById("new-jutsu-desc").value = "";
  document.getElementById("new-jutsu-name").focus();
}

function removeJutsuFromList(index) {
  pendingJutsus.splice(index, 1);
  renderJutsusList();
}

function renderJutsusList() {
  const container = document.getElementById("jutsus-list");
  if (!container) return;

  if (pendingJutsus.length === 0) {
    container.innerHTML = `<em style="color: #888;">Nenhum jutsu adicionado ainda</em>`;
    return;
  }

  let html = `<div style="display: flex; flex-direction: column; gap: 6px;">`;
  pendingJutsus.forEach((jutsu, idx) => {
    html += `
      <div style="background: rgba(15, 136, 136, 0.1); border-left: 3px solid #0f8; padding: 6px 8px; border-radius: 3px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: #0f8;">${jutsu.name}</strong>
          <div style="font-size: 0.8rem; color: #aaa;">Nível ${jutsu.unlockLevel}${jutsu.element ? ` • ${jutsu.element}` : ''}</div>
          ${jutsu.description ? `<div style="font-size: 0.75rem; color: #888; margin-top: 2px;">${jutsu.description}</div>` : ''}
        </div>
        <button onclick="removeJutsuFromList(${idx})" class="btn-submit" style="width: auto; background: #f66; padding: 4px 8px;">✕</button>
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

/* =========================================================
   GERENCIADOR DE JUTSUS (EDIÇÃO)
   Função para editar jutsus de invocação já criada
========================================================= */
function addJutsuToEditList() {
  const name = document.getElementById("edit-jutsu-name")?.value?.trim();
  const level = parseInt(document.getElementById("edit-jutsu-level")?.value) || 1;
  const element = document.getElementById("edit-jutsu-element")?.value?.trim();
  const desc = document.getElementById("edit-jutsu-desc")?.value?.trim() || "";

  if (!name) {
    alert("Nome do jutsu é obrigatório");
    return;
  }

  const jutsu = { name, unlockLevel: level };
  if (element) jutsu.element = element;
  if (desc) jutsu.description = desc;

  editingJutsus.push(jutsu);
  renderEditJutsusList();

  // Limpar campos
  document.getElementById("edit-jutsu-name").value = "";
  document.getElementById("edit-jutsu-level").value = "1";
  document.getElementById("edit-jutsu-element").value = "";
  document.getElementById("edit-jutsu-desc").value = "";
  document.getElementById("edit-jutsu-name").focus();
}

function removeJutsuFromEditList(index) {
  editingJutsus.splice(index, 1);
  renderEditJutsusList();
}

function renderEditJutsusList() {
  const container = document.getElementById("edit-jutsus-list");
  if (!container) return;

  if (editingJutsus.length === 0) {
    container.innerHTML = `<em style="color: #888;">Nenhum jutsu adicionado ainda</em>`;
    return;
  }

  let html = `<div style="display: flex; flex-direction: column; gap: 6px;">`;
  editingJutsus.forEach((jutsu, idx) => {
    html += `
      <div style="background: rgba(15, 136, 136, 0.1); border-left: 3px solid #0f8; padding: 6px 8px; border-radius: 3px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: #0f8;">${jutsu.name}</strong>
          <div style="font-size: 0.8rem; color: #aaa;">Nível ${jutsu.unlockLevel}${jutsu.element ? ` • ${jutsu.element}` : ''}</div>
          ${jutsu.description ? `<div style="font-size: 0.75rem; color: #888; margin-top: 2px;">${jutsu.description}</div>` : ''}
        </div>
        <button onclick="removeJutsuFromEditList(${idx})" class="btn-submit" style="width: auto; background: #f66; padding: 4px 8px;">✕</button>
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

async function createNewInvocation(e) {
  e?.preventDefault();
  try {
    const id = document.getElementById("new-inv-id").value.trim();
    const name = document.getElementById("new-inv-name").value.trim();
    const category = (document.getElementById("new-inv-classification")?.value || document.getElementById("new-inv-category")?.value || "").trim();
    const region = document.getElementById("new-inv-region")?.value?.trim() || null;
    const family = document.getElementById("new-inv-family")?.value?.trim() || null;
    const rank = document.getElementById("new-inv-rank")?.value?.trim() || null;
    const max = parseInt(document.getElementById("new-inv-max").value) || 1;
    const desc = document.getElementById("new-inv-desc").value || "";
    const icon = document.getElementById("new-inv-icon")?.value?.trim() || null;

    if (!id || !name) {
      document.getElementById("create-inv-error").textContent = "ID e Nome são obrigatórios";
      document.getElementById("create-inv-error").classList.add("show");
      setTimeout(() => document.getElementById("create-inv-error").classList.remove("show"), 3000);
      return;
    }

    // Inserir na lista local e salvar
    const newInv = { id, name, category, max, desc };
    if (region) newInv.region = region;
    if (family) newInv.family = family;
    if (rank) newInv.rank = rank;
    if (icon) newInv.icon = icon;
    if (pendingJutsus.length > 0) newInv.jutsus = [...pendingJutsus];

    invocationsList.push(newInv);
    const ref = doc(db, "game_data", "invocacoes_v1");
    await updateDoc(ref, { invocacoes: invocationsList }).catch(async () => {
      await setDoc(ref, { invocacoes: invocationsList }, { merge: true });
    });

    // registrar criação no histórico
    try {
      await addDoc(collection(db, 'skill_logs'), {
        type: 'invocation', action: 'create',
        itemId: id, itemName: name,
        adminId: currentUID, adminNick: currentAdminNick,
        newData: newInv, date: new Date()
      });
    } catch (logErr) { console.error('Falha ao registrar invocacao (create):', logErr); }

    document.getElementById("create-inv-message").textContent = `✅ Invocação ${name} criada`;
    document.getElementById("create-inv-message").classList.add("show");
    setTimeout(() => document.getElementById("create-inv-message").classList.remove("show"), 3000);

    // limpar campos e recarregar select
    document.getElementById("new-inv-id").value = "";
    document.getElementById("new-inv-name").value = "";
    if (document.getElementById("new-inv-classification")) document.getElementById("new-inv-classification").value = "";
    if (document.getElementById("new-inv-region")) document.getElementById("new-inv-region").value = "";
    if (document.getElementById("new-inv-family")) document.getElementById("new-inv-family").value = "";
    if (document.getElementById("new-inv-rank")) document.getElementById("new-inv-rank").value = "";
    document.getElementById("new-inv-desc").value = "";
    document.getElementById("new-inv-icon").value = "";
    document.getElementById("new-inv-max").value = "1";
    document.getElementById("new-jutsu-name").value = "";
    document.getElementById("new-jutsu-level").value = "1";
    document.getElementById("new-jutsu-element").value = "";
    document.getElementById("new-jutsu-desc").value = "";
    pendingJutsus = [];
    renderJutsusList();
    await loadInvocationsForEditing();
  } catch (err) {
    console.error("Erro ao criar invocação:", err);
  }
}

// Try to upload example JSON into Firestore (used by admin button)
async function uploadExampleToFirestore() {
  const msgEl = document.getElementById('create-inv-message');
  const errEl = document.getElementById('create-inv-error');
  msgEl.classList.remove('show'); errEl.classList.remove('show');

  // embedded fallback example (matches data/invocacoes_v1.example.json)
  const embedded = {
    version: 'v1',
    classifications: ["Errante","Relâmpago","Fogo","Água","Vento","Terra","Demônios"],
    regions: {
      paises: {
        name: 'Países',
        families: {
          marsupianos: {
            name: 'Marsupianos',
            rankings: { S: [], A: [], B: [], C: [], D: [] }
          }
        }
      }
    },
    invocations: [
      {
        id: 'kurama', name: 'Kurama', classification: 'Demônios', region: 'paises', family: 'marsupianos', rank: 'S',
        jutsus: [{ name: 'Rasengan Selvagem', unlockLevel: 1 }], masters: { main: [], taught: [] }, teachableSkills: []
      }
    ]
  };

  let data = null;
  try {
    const res = await fetch('data/invocacoes_v1.example.json');
    if (res.ok) data = await res.json();
    else data = embedded;
  } catch (err) {
    data = embedded;
  }

  try {
    const ref = doc(db, 'game_data', 'invocacoes_v1');
    // Try update first, otherwise set
    await updateDoc(ref, data).catch(async () => {
      await setDoc(ref, data, { merge: true });
    });

    msgEl.textContent = '✅ Exemplo gravado em game_data/invocacoes_v1';
    msgEl.classList.add('show');
    setTimeout(() => msgEl.classList.remove('show'), 3000);
    // reload into UI
    await loadInvocationsForEditing();
  } catch (err) {
    console.error('Erro ao gravar exemplo:', err);
    errEl.textContent = 'Erro ao gravar no Firestore: ' + (err.message || err.code || 'permission-denied');
    errEl.classList.add('show');
    setTimeout(() => errEl.classList.remove('show'), 5000);
  }
}

// Wire upload-example button
document.getElementById('btn-upload-example')?.addEventListener('click', (e) => {
  e.preventDefault();
  uploadExampleToFirestore();
});

async function createNewSkill(e) {
  e?.preventDefault();
  try {
    const id = document.getElementById("new-skill-id").value.trim();
    const name = document.getElementById("new-skill-name").value.trim();
    const parent = document.getElementById("new-skill-parent").value.trim();
    const max = parseInt(document.getElementById("new-skill-max").value) || 1;
    const desc = document.getElementById("new-skill-desc").value || "";

    if (!id || !name) {
      document.getElementById("create-skill-error").textContent = "ID e Nome são obrigatórios";
      document.getElementById("create-skill-error").classList.add("show");
      setTimeout(() => document.getElementById("create-skill-error").classList.remove("show"), 3000);
      return;
    }

    // Criar objeto da skill e adicionar ao array local
    const newSkill = { id, name, parent, max, desc };
    skillsList.push(newSkill);

    // Salvar no documento skills_v1 (respeitar chave existente Skills vs skills)
    const ref = doc(db, "game_data", "skills_v1");
    try {
      const snap = await getDoc(ref);
      const dataBefore = snap.exists() ? snap.data() : {};
      const keyName = dataBefore && dataBefore.Skills ? 'Skills' : 'skills';
      const payloadSkills = skillsList.map(normalizeSkillObject);
      const payload = { [keyName]: payloadSkills };
      await updateDoc(ref, payload);
    } catch (errUpdate) {
      try {
        const payloadSkills = skillsList.map(normalizeSkillObject);
        const snap = await getDoc(ref);
        const dataBefore = snap.exists() ? snap.data() : {};
        const keyName = dataBefore && dataBefore.Skills ? 'Skills' : 'skills';
        const payload = { [keyName]: payloadSkills };
        await setDoc(ref, payload, { merge: true });
      } catch (errSet) {
        console.error('Erro ao salvar skill (createNewSkill):', errSet);
        throw errSet;
      }
    }

    // Registrar criação no histórico (skill_logs)
    try {
      await addDoc(collection(db, "skill_logs"), {
        type: 'skill', action: 'create',
        itemId: id, itemName: name,
        adminId: currentUID, adminNick: currentAdminNick,
        newData: newSkill,
        date: new Date()
      });
    } catch (logErr) { console.error('Falha ao registrar skill_logs (create):', logErr); }

    document.getElementById("create-skill-message").textContent = `✅ Habilidade ${name} criada`;
    document.getElementById("create-skill-message").classList.add("show");
    setTimeout(() => document.getElementById("create-skill-message").classList.remove("show"), 3000);

    // limpar campos e recarregar selects
    document.getElementById("new-skill-id").value = "";
    document.getElementById("new-skill-name").value = "";
    document.getElementById("new-skill-parent").value = "";
    document.getElementById("new-skill-desc").value = "";
    await loadSkillsForEditing();
  } catch (err) {
    console.error("Erro ao criar skill:", err);
  }
}

function setupInvocationsEditor() {
  // Buttons wired in loadInvocationsSelect
}

/* =========================================================
   AUTOCOMPLETE: Parent (create skill) - in-memory filtering
   Uses `skillsList` already loaded; does NOT hit the DB on input.
========================================================= */
function setupParentAutocomplete() {
  const input = document.getElementById('new-skill-parent');
  const box = document.getElementById('parent-suggestions');
  if (!input || !box) return;

  const options = Array.from(new Set(skillsList.map(s => (s.name || s.id || '').trim()).filter(Boolean))).sort();

  function renderList(matches) {
    if (!matches || matches.length === 0) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.innerHTML = '';
    matches.slice(0, 40).forEach(m => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.textContent = m;
      div.addEventListener('click', () => {
        input.value = m; box.style.display = 'none'; box.innerHTML = '';
      });
      box.appendChild(div);
    });
    box.style.display = 'block';
  }

  input.addEventListener('input', (e) => {
    const q = (e.target.value || '').toLowerCase().trim();
    if (!q) { renderList([]); return; }
    const matches = options.filter(o => o.toLowerCase().includes(q));
    renderList(matches);
  });

  // close suggestions on blur (allow click to register)
  input.addEventListener('blur', () => setTimeout(() => { box.style.display = 'none'; box.innerHTML = ''; }, 150));
}

/* =========================================================
   CLASSIFICATIONS UI + Save
========================================================= */
function renderClassificationsList() {
  const container = document.getElementById('classifications-list');
  if (!container) return;
  container.innerHTML = '';
  container.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';
  (classificationsList || []).forEach((c, idx) => {
    const chip = document.createElement('div');
    chip.className = 'classification-chip';
    chip.style.cssText = 'display: flex; align-items: stretch; gap: 10px; padding: 12px; background: rgba(170, 136, 255, 0.1); border: 1px solid #a8f; border-radius: 6px;';
    
    // Info section (left)
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'flex: 1; display: flex; flex-direction: column; justify-content: center;';
    
    const title = document.createElement('strong');
    title.textContent = `${c.id} - ${c.name}`;
    title.style.cssText = 'color: #a8f; font-size: 0.95rem; margin-bottom: 4px;';
    
    const desc = document.createElement('div');
    desc.textContent = c.desc || '(sem descrição)';
    desc.style.cssText = 'color: #ccc; font-size: 0.85rem; line-height: 1.4;';
    
    infoDiv.appendChild(title);
    infoDiv.appendChild(desc);
    chip.appendChild(infoDiv);

    // Button section (right)
    const btnDiv = document.createElement('div');
    btnDiv.style.cssText = 'display: flex; gap: 6px; align-items: center;';

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Editar';
    editBtn.className = 'btn-submit';
    editBtn.style.cssText = 'padding: 6px 10px; background: #4af; font-size: 0.85rem; min-width: 70px;';
    editBtn.addEventListener('click', () => openClassificationEditor(idx));

    const remBtn = document.createElement('button');
    remBtn.textContent = 'Remover';
    remBtn.className = 'btn-submit';
    remBtn.style.cssText = 'padding: 6px 10px; background: #f66; font-size: 0.85rem; min-width: 70px;';
    remBtn.addEventListener('click', () => {
      classificationsList.splice(idx, 1);
      renderClassificationsList();
      populateInvocationHierarchyOptions();
    });

    btnDiv.appendChild(editBtn);
    btnDiv.appendChild(remBtn);
    chip.appendChild(btnDiv);
    container.appendChild(chip);
  });
}

function openClassificationEditor(idx) {
  const item = classificationsList[idx];
  if (!item) return;
  // create modal-like inline editor below the chips
  let editor = document.getElementById('classification-editor');
  if (!editor) {
    editor = document.createElement('div'); editor.id = 'classification-editor'; editor.className = 'section-card';
    editor.style.marginTop = '8px';
    editor.innerHTML = `
      <div class="section-header"><h4 style="margin:0; color:#4af;">Editar Classificação</h4></div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
        <input id="edit-class-id" placeholder="ID" style="flex:0.8" />
        <input id="edit-class-name" placeholder="Nome" style="flex:1" />
        <input id="edit-class-desc" placeholder="Descrição" style="flex:2" />
        <button id="btn-save-class-edit" class="btn-submit">💾 Salvar</button>
        <button id="btn-cancel-class-edit" class="btn-submit" style="background:#888;">Cancelar</button>
      </div>
    `;
    document.getElementById('classifications-list')?.parentElement?.appendChild(editor);
    document.getElementById('btn-cancel-class-edit').addEventListener('click', () => { editor.remove(); });
  }
  document.getElementById('edit-class-id').value = item.id || '';
  document.getElementById('edit-class-name').value = item.name || '';
  document.getElementById('edit-class-desc').value = item.desc || '';
  document.getElementById('btn-save-class-edit').onclick = async () => {
    const newId = document.getElementById('edit-class-id').value.trim();
    const newName = document.getElementById('edit-class-name').value.trim();
    const newDesc = document.getElementById('edit-class-desc').value.trim();
    if (!newName) return alert('Nome é obrigatório');
    // update in place
    classificationsList[idx] = { id: newId, name: newName, desc: newDesc };
    renderClassificationsList();
    populateInvocationHierarchyOptions();
    editor.remove();
  };
}

document.getElementById('btn-add-classification')?.addEventListener('click', (e) => {
  e.preventDefault();
  const id = (document.getElementById('new-classification-id')?.value || '').trim();
  const name = (document.getElementById('new-classification-name')?.value || '').trim();
  const desc = (document.getElementById('new-classification-desc')?.value || '').trim();
  if (!name) return alert('Preencha o nome da classificação');
  classificationsList = classificationsList || [];
  if (classificationsList.find(c => (c.name || '').toLowerCase() === name.toLowerCase())) return alert('Classificação já existe');
  classificationsList.push({ id, name, desc });
  document.getElementById('new-classification-id').value = '';
  document.getElementById('new-classification-name').value = '';
  document.getElementById('new-classification-desc').value = '';
  renderClassificationsList();
  populateInvocationHierarchyOptions();
});

document.getElementById('btn-save-classifications')?.addEventListener('click', saveClassificationsToFirestore);

async function saveClassificationsToFirestore() {
  try {
    const ref = doc(db, 'game_data', 'invocacoes_v1');
    await updateDoc(ref, { classifications: classificationsList }).catch(async () => {
      await setDoc(ref, { classifications: classificationsList }, { merge: true });
    });
    alert('Classificações salvas com sucesso.');
    populateInvocationHierarchyOptions();
    // log
    try {
      await addDoc(collection(db, 'skill_logs'), {
        type: 'classifications', action: 'save', adminId: currentUID, adminNick: currentAdminNick,
        newData: classificationsList, date: new Date()
      });
    } catch (logErr) { console.error('Falha ao registrar classifications log:', logErr); }
  } catch (err) {
    console.error('Erro ao salvar classificações:', err);
    alert('Erro ao salvar classificações: ' + (err.message || err.code || ''));
  }
}

/* =========================================================
   SETUP REGIONS EDITOR
========================================================= */
function setupRegionsEditor() {
  document.getElementById('btn-add-region')?.addEventListener('click', () => {
    const key = document.getElementById('new-region-key').value.trim();
    const name = document.getElementById('new-region-name').value.trim();
    if (!key || !name) return alert('Preencha chave e nome da região');
    if (!regionsObj) regionsObj = {};
    if (regionsObj[key]) return alert('Região já existe com essa chave');
    regionsObj[key] = { name, families: {} };
    renderRegionsList();
    document.getElementById('new-region-key').value = '';
    document.getElementById('new-region-name').value = '';
  });

  document.getElementById('btn-add-family')?.addEventListener('click', () => {
    const regionKey = getSelectedRegionKey();
    if (!regionKey) return alert('Selecione uma região primeiro');
    const famKey = document.getElementById('new-family-key').value.trim();
    const famName = document.getElementById('new-family-name').value.trim();
    const famDesc = document.getElementById('new-family-description').value.trim();
    const famIcon = document.getElementById('new-family-icon').value.trim();
    if (!famKey || !famName) return alert('Preencha chave e nome da família');
    const region = regionsObj[regionKey];
    region.families = region.families || {};
    if (region.families[famKey]) return alert('Família já existe');
    region.families[famKey] = { name: famName, rankings: {} };
    if (famDesc) region.families[famKey].description = famDesc;
    if (famIcon) region.families[famKey].icon = famIcon;
    renderRegionsList();
    document.getElementById('new-family-key').value = '';
    document.getElementById('new-family-name').value = '';
    document.getElementById('new-family-description').value = '';
    document.getElementById('new-family-icon').value = '';
    populateFamilySelect(regionKey);
  });

  document.getElementById('btn-add-ranking')?.addEventListener('click', () => {
    const regionKey = getSelectedRegionKey();
    if (!regionKey) return alert('Selecione uma região primeiro');
    const famKey = document.getElementById('family-select').value;
    if (!famKey) return alert('Selecione uma família');
    const ranking = document.getElementById('new-ranking-key').value.trim();
    if (!ranking) return alert('Preencha o ranking (ex: S)');
    const fam = regionsObj[regionKey].families[famKey];
    fam.rankings = fam.rankings || {};
    if (fam.rankings[ranking]) return alert('Ranking já existe');
    fam.rankings[ranking] = [];
    renderRegionsList();
    document.getElementById('new-ranking-key').value = '';
    showFamilyDetails(regionKey, famKey);
  });

  document.getElementById('btn-save-regions')?.addEventListener('click', saveRegionsToFirestore);

  // family select change
  document.getElementById('family-select')?.addEventListener('change', (e) => {
    const regionKey = getSelectedRegionKey();
    const famKey = e.target.value;
    if (regionKey && famKey) showFamilyDetails(regionKey, famKey);
  });

  renderRegionsList();
}

function getSelectedRegionKey() {
  // find selected region radio
  const radios = document.querySelectorAll('input[name="region-radio"]');
  for (const r of radios) if (r.checked) return r.value;
  return null;
}

function renderRegionsList() {
  const container = document.getElementById('regions-list');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(regionsObj || {}).forEach(key => {
    const meta = regionsObj[key];
    const div = document.createElement('div');
    div.style.padding = '6px';
    div.style.borderBottom = '1px solid rgba(74,170,255,0.06)';
    div.innerHTML = `
      <label style="display:flex; align-items:center; gap:8px;">
        <input type="radio" name="region-radio" value="${key}"> <strong style="color:#4af;">${meta.name}</strong>
        <small style="color:#aaa; margin-left:8px;">(${key})</small>
      </label>
    `;
    container.appendChild(div);
  });

  // when region selection changes, populate family select
  const radios = document.querySelectorAll('input[name="region-radio"]');
  radios.forEach(r => r.addEventListener('change', () => {
    const regionKey = getSelectedRegionKey();
    populateFamilySelect(regionKey);
  }));
}

function populateFamilySelect(regionKey) {
  const sel = document.getElementById('family-select');
  sel.innerHTML = '<option value="">-- Selecione --</option>';
  if (!regionKey) return;
  const fams = regionsObj[regionKey].families || {};
  Object.keys(fams).forEach(k => {
    const o = document.createElement('option'); o.value = k; o.textContent = fams[k].name || k; sel.appendChild(o);
  });
}

function showFamilyDetails(regionKey, famKey) {
  const details = document.getElementById('family-details');
  if (!regionKey || !famKey) { details.innerHTML = '<em style="color:#888;">Selecione uma família para ver rankings</em>'; return; }
  const fam = regionsObj[regionKey].families[famKey];
  let html = `<h4 style="margin:0 0 8px 0;">${fam.name} (${famKey})</h4>`;
  html += '<div style="margin-bottom:8px;"><strong>Rankings:</strong></div>';
  const ranks = Object.keys(fam.rankings || {});
  if (ranks.length === 0) html += '<p style="color:#888;">Nenhum ranking definido.</p>';
  else {
    html += '<ul style="color:#eee;">';
    ranks.forEach(rk => html += `<li>${rk} <button data-rk="${rk}" class="btn-remove-rank" style="margin-left:8px; background:#f66;">Remover</button></li>`);
    html += '</ul>';
  }
  details.innerHTML = html;

  // wire remove buttons
  details.querySelectorAll('.btn-remove-rank').forEach(btn => btn.addEventListener('click', (e) => {
    const rk = e.target.dataset.rk;
    delete fam.rankings[rk];
    showFamilyDetails(regionKey, famKey);
    renderRegionsList();
  }));
}

async function saveRegionsToFirestore() {
  const msgEl = document.getElementById('regions-message');
  const errEl = document.getElementById('regions-error');
  msgEl.classList.remove('show'); errEl.classList.remove('show');
  try {
    const ref = doc(db, 'game_data', 'invocacoes_v1');
    await updateDoc(ref, { regions: regionsObj }).catch(async () => {
      await setDoc(ref, { regions: regionsObj }, { merge: true });
    });
    msgEl.textContent = '✅ Regiões salvas'; msgEl.classList.add('show');
    // popup de confirmação para feedback imediato
    try { alert('Regiões salvas com sucesso.'); } catch(e) { /* ignore */ }
    setTimeout(() => msgEl.classList.remove('show'), 3000);
    // refresh hierarchy
    populateInvocationHierarchyOptions();

    // registrar log de alteração de regiões
    try {
      await addDoc(collection(db, 'skill_logs'), {
        type: 'regions', action: 'save',
        adminId: currentUID, adminNick: currentAdminNick,
        newData: regionsObj, date: new Date()
      });
    } catch (logErr) { console.error('Falha ao registrar regions log:', logErr); }
  } catch (err) {
    console.error('Erro ao salvar regiões:', err);
    errEl.textContent = 'Erro ao salvar: ' + (err.message || err.code || ''); errEl.classList.add('show');
    // popup de erro
    try { alert('Erro ao salvar regiões: ' + (err.message || err.code || '')); } catch(e) { /* ignore */ }
    setTimeout(() => errEl.classList.remove('show'), 5000);
  }
}

/* =========================================================
   CARREGAMENTO DE SKILLS PARA EDIÇÃO
========================================================= */
async function loadSkillsForEditing() {
  try {
    console.log("🔄 Carregando skills para edição...");
    const skillsRef = doc(db, "game_data", "skills_v1");
    const snap = await getDoc(skillsRef);

    if (!snap.exists()) {
      console.error("❌ Documento skills_v1 não encontrado");
      skillsList = [];
      showSkillsError("Documento skills_v1 não encontrado no Firebase");
      return;
    }

    const data = snap.data();

    // 1) Pega Skills com tolerância a maiúsculo/minúsculo
    let rawSkills = data.Skills ?? data.skills;

    // 2) Se vier como objeto/mapa, converte para array
    if (rawSkills && !Array.isArray(rawSkills) && typeof rawSkills === "object") {
      rawSkills = Object.entries(rawSkills).map(([id, skill]) => ({
        id,
        ...(skill ?? {})
      }));
    }

    // 3) Se ainda não for array, loga o formato real pra você ver
    if (!Array.isArray(rawSkills)) {
      console.error("📌 Documento game_data/skills_v1 recebido:", data);
      console.error("rawSkills =", rawSkills);
      showSkillsError("Formato inválido no documento skills_v1. Verifique o console.");
      skillsList = [];
      return;
    }

    skillsList = rawSkills.map(normalizeSkillObject);
    // Ordenar A -> Z pelo nome (se houver) ou id
    skillsList.sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || '', 'pt-BR', { sensitivity: 'base' }));
    console.log(`✅ ${skillsList.length} skills carregadas (ordenadas A→Z)`);
    loadSkillsSelect();
    // setup parent autocomplete using the loaded skills (client-side only)
    try { setupParentAutocomplete(); } catch (e) { /* ignore */ }

  } catch (error) {
    console.error("❌ Erro ao carregar skills:", error);
    showSkillsError(`Erro: ${error.message}`);
  }
}

/* =========================================================
   CARREGA SELECT DE SKILLS
========================================================= */
function loadSkillsSelect() {
  const select = document.getElementById("skill-select");
  if (!select) return;

  select.innerHTML = `<option value="">-- Selecione uma Habilidade --</option>`;

  skillsList.forEach((skill, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = `${skill.name || skill.id || `Skill ${index}`}`;
    select.appendChild(option);
  });

  // Event listener para mudar de skill
  select.addEventListener("change", (e) => {
    const index = parseInt(e.target.value);
    if (isNaN(index)) {
      document.getElementById("skill-editor").style.display = "none";
      return;
    }
    loadSkillEditor(index);
  });
}

/* =========================================================
   ATUALIZA DROPDOWN DE ÁRVORE GUIA (based on category)
========================================================= */
function updateSkillTreeOptions() {
  const category = document.getElementById("skill-category").value;
  const treeSelect = document.getElementById("skill-tree");
  
  if (!category) {
    treeSelect.innerHTML = `<option value="">Selecione uma categoria primeiro</option>`;
    return;
  }

  // Encontrar skills que são guiadoras (max === 0) nesta categoria
  const guides = skillsList.filter(s => s.parent === category && s.max === 0);

  treeSelect.innerHTML = `<option value="">-- Selecione uma árvore guia --</option>`;

  if (guides.length === 0) {
    treeSelect.innerHTML += `<option disabled>Nenhuma árvore guia encontrada</option>`;
    return;
  }

  guides.forEach((guide, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = guide.name || guide.id || `Guia ${index}`;
    treeSelect.appendChild(option);
  });
}

/* =========================================================
   ATUALIZA SELECT DE SKILLS DA CATEGORIA/ÁRVORE GUIA
========================================================= */
function updateSkillsInCategory() {
  const category = document.getElementById("skill-category").value;
  const treeIndex = document.getElementById("skill-tree").value;
  const select = document.getElementById("skill-select");

  if (!category || !treeIndex) {
    select.innerHTML = `<option value="">Selecione uma categoria e árvore</option>`;
    return;
  }

  // Pegar a skill guia selecionada
  const guides = skillsList.filter(s => s.parent === category && s.max === 0);
  const selectedGuide = guides[parseInt(treeIndex)];

  if (!selectedGuide) {
    select.innerHTML = `<option value="">Guia não encontrada</option>`;
    return;
  }

  // Encontrar todas as skills filhas dessa guia (recursivamente)
  const getDescendants = (parentId) => {
    let descendants = [];
    const children = skillsList.filter(s => s.parent === parentId);
    children.forEach(child => {
      descendants.push(child);
      descendants = descendants.concat(getDescendants(child.id));
    });
    return descendants;
  };

  const treeSkills = [selectedGuide, ...getDescendants(selectedGuide.id)];

  select.innerHTML = `<option value="">-- Selecione uma Habilidade --</option>`;

  skillsList.forEach((skill, index) => {
    if (treeSkills.find(s => s.id === skill.id)) {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = `${skill.name || skill.id}`;
      select.appendChild(option);
    }
  });
}

/* =========================================================
   ATUALIZA COMBOBOX DUPLA (Skills Prontas vs Manutenção)
   Padroniza visual com árvore: verde (#0f8) pronta, laranja (#f8a) manutenção
========================================================= */
function updateSkillsCombobox() {
  const category = document.getElementById("skill-category").value;
  const readySelect = document.getElementById("skills-ready");
  const maintenanceSelect = document.getElementById("skills-maintenance");

  // Filtrar skills por categoria se selecionada
  let categorySkills = skillsList;
  if (category) {
    categorySkills = skillsList.filter(s => s.parent === category || s.id === category);
  }

  // Separar em prontas (max === 5) e em manutenção (max !== 5 e max !== 0)
  const ready = categorySkills.filter(s => s.max === 5);
  const maintenance = categorySkills.filter(s => s.max !== 5 && s.max !== 0);

  // ===== ATUALIZAR LISTA DE PRONTAS (VERDE #0f8) =====
  readySelect.innerHTML = "";
  
  if (ready.length === 0) {
    const option = document.createElement("option");
    option.disabled = true;
    option.textContent = "Nenhuma skill pronta";
    readySelect.appendChild(option);
  } else {
    const optgroup = document.createElement("optgroup");
    optgroup.label = "✅ PRONTAS (Nível Máx: 5)";
    
    ready.forEach((skill) => {
      const option = document.createElement("option");
      option.value = skillsList.indexOf(skill);
      option.textContent = skill.name || skill.id;
      option.style.color = "#0f8";  // verde
      option.style.fontWeight = "bold";
      optgroup.appendChild(option);
    });
    
    readySelect.appendChild(optgroup);
  }

  // ===== ATUALIZAR LISTA DE MANUTENÇÃO (LARANJA #f8a) =====
  maintenanceSelect.innerHTML = "";
  
  if (maintenance.length === 0) {
    const option = document.createElement("option");
    option.disabled = true;
    option.textContent = "Nenhuma skill em manutenção";
    maintenanceSelect.appendChild(option);
  } else {
    const optgroup = document.createElement("optgroup");
    optgroup.label = "🔧 EM MANUTENÇÃO";
    
    maintenance.forEach((skill) => {
      const option = document.createElement("option");
      option.value = skillsList.indexOf(skill);
      
      // Verificar se está completa: deve ter TODOS os níveis de 1 até max
      const maxLevel = skill.max || 0;
      let isComplete = true;
      
      if (maxLevel > 0) {
        const desc = skill.desc || "";
        // Procurar por padrões: "lvl 1 →", "lvl 1 ->", "lvl 1 -", "nivel 1", "level 1", etc.
        for (let i = 1; i <= maxLevel; i++) {
          // Padrão flexível: qualquer variante de "lvl/nivel/level" seguido do número
          const pattern = new RegExp(`(lvl|nivel|level)\\s+${i}\\s*[→>-]|${i}\\s*[→>-]\\s*lvl|nível\\s+${i}|skill\\s+nivel\\s+${i}`, "i");
          if (!pattern.test(desc)) {
            isComplete = false;
            break;
          }
        }
      }
      
      const status = isComplete ? "✅" : "⚠️";
      
      option.textContent = `${status} ${skill.name || skill.id} (lvl: ${maxLevel})`;
      option.style.color = "#f8a";  // laranja
      option.style.fontWeight = "bold";
      optgroup.appendChild(option);
    });
    
    maintenanceSelect.appendChild(optgroup);
  }

  // ===== LISTENERS PARA MOSTRAR DESCRIÇÕES LADO A LADO =====
  readySelect.addEventListener("change", (e) => {
    const index = parseInt(e.target.value);
    if (!isNaN(index) && skillsList[index]) {
      showReadyDescription(skillsList[index]);
    }
  });

  maintenanceSelect.addEventListener("change", (e) => {
    const index = parseInt(e.target.value);
    if (!isNaN(index) && skillsList[index]) {
      showMaintenanceDescription(skillsList[index]);
      // Selecionar automaticamente no editor
      document.getElementById("skill-select").value = index;
      const event = new Event("change", { bubbles: true });
      document.getElementById("skill-select").dispatchEvent(event);
    }
  });
}

/* =========================================================
   MOSTRA DESCRIÇÃO FORMATADA DA SKILL PRONTA (PADRÃO)
========================================================= */
function showReadyDescription(skill) {
  const descDiv = document.getElementById("ready-desc");
  if (!descDiv) return;

  const name = skill.name || skill.id || "Sem nome";
  const desc = skill.desc || "Sem descrição";
  
  // Parsear descrição no formato "lvl N → conteúdo"
  const formatted = formatSkillDescription(desc);

  descDiv.innerHTML = `<strong style="color: #0f8;">${name}</strong>\n\n${formatted}`;
}

/* =========================================================
   MOSTRA DESCRIÇÃO FORMATADA DA SKILL EM MANUTENÇÃO
========================================================= */
function showMaintenanceDescription(skill) {
  const descDiv = document.getElementById("maintenance-desc");
  if (!descDiv) return;

  const name = skill.name || skill.id || "Sem nome";
  const desc = skill.desc || "Sem descrição";
  const maxLevel = skill.max || 0;
  
  // Parsear descrição no formato "lvl N → conteúdo"
  const formatted = formatSkillDescription(desc);
  
  // Adicionar indicador de quantos níveis estão definidos
  const lines = (desc || "").split("\n").filter(l => l.trim().match(/^lvl\s+\d+\s*→/i));
  const status = lines.length === maxLevel ? "✅ Completa" : `⚠️ Incompleta (${lines.length}/${maxLevel})`;

  descDiv.innerHTML = `<strong style="color: #f8a;">${name}</strong> <span style="color: #f99; font-size: 0.9rem;">${status}</span>\n\n${formatted}`;
}

/* =========================================================
   FORMATA DESCRIÇÃO NO PADRÃO "lvl N → descrição"
========================================================= */
function formatSkillDescription(desc) {
  if (!desc) return "<em style='color: #888;'>Sem descrição</em>";

  // Dividir por linhas e processar formato "lvl N → ..."
  const lines = desc.split("\n").map(l => l.trim()).filter(l => l);
  
  let formatted = "";
  let hasLevelFormat = false;

  lines.forEach(line => {
    const match = line.match(/^lvl\s+(\d+)\s*→\s*(.+)$/i);
    if (match) {
      hasLevelFormat = true;
      const level = match[1];
      const content = match[2];
      formatted += `<strong style="color: #4af;">Lvl ${level}:</strong> ${content}<br>`;
    } else {
      formatted += line + "<br>";
    }
  });

  // Se não tiver formato de nível, exibir como está
  if (!hasLevelFormat) {
    formatted = lines.join("<br>");
  }

  return formatted;
}

/* =========================================================
   CARREGA EDITOR DE SKILL
========================================================= */
function loadSkillEditor(skillIndex) {
  selectedSkill = skillsList[skillIndex];
  
  // Guardar estado original para detectar alterações
  window.skillEditorBackup = {
    id: selectedSkill.id,
    name: selectedSkill.name || selectedSkill.id || "",
    desc: selectedSkill.desc || "",
    requires: selectedSkill.requires ?? selectedSkill.requirements ?? selectedSkill.requisitos ?? []
  };
  
  // Suporta múltiplos nomes de campo: requires, requirements, requisitos
  const reqsField = selectedSkill.requires ?? selectedSkill.requirements ?? selectedSkill.requisitos ?? [];
  currentRequirements = Array.isArray(reqsField) ? JSON.parse(JSON.stringify(reqsField)) : [];
  
  console.log(`📖 Editando skill: ${selectedSkill.name || selectedSkill.id}`, selectedSkill);
  console.log(`  Requisitos carregados:`, currentRequirements);

  // Campo EDITÁVEL de nome
  document.getElementById("skill-name").value = selectedSkill.name || selectedSkill.id || "";
  
  // Exibe o parent (habilidade pai)
  let parentName = "Nenhuma (Root)";
  if (selectedSkill.parent) {
    const parentDef = skillsList.find(s => s.id === selectedSkill.parent);
    if (parentDef) {
      parentName = parentDef.name || parentDef.id || selectedSkill.parent;
    } else {
      parentName = selectedSkill.parent + " (não encontrada)";
    }
  }
  document.getElementById("skill-parent").value = parentName;
  
  document.getElementById("skill-desc").value = selectedSkill.desc || "";
  
  renderRequirementsList();
  
  // Preencher o select de skills para requisitos
  populateSkillSelect();
  
  document.getElementById("skill-editor").style.display = "block";
}

/* =========================================================
   RENDERIZA LISTA DE REQUISITOS
========================================================= */
function renderRequirementsList() {
  const list = document.getElementById("requirements-list");
  if (!list) return;

  if (!Array.isArray(currentRequirements) || currentRequirements.length === 0) {
    list.innerHTML = "<div style='background: rgba(255, 136, 136, 0.1); padding: 12px; border-radius: 4px; color: #f88;'><strong>⚠️ Nenhum requisito definido</strong><br><small style=\"color: #aaa;\">Esta habilidade não tem pré-requisitos.</small></div>";
    return;
  }

  // Contar quantos requisitos já existiam no backup
  const backup = window.skillEditorBackup || {};
  const originalCount = (backup.requires || []).length;
  const newCount = currentRequirements.length - originalCount;

  let html = `<div style="background: rgba(74, 170, 255, 0.05); border: 1px solid rgba(74, 170, 255, 0.2); border-radius: 4px; padding: 10px; margin-bottom: 12px;">
    <strong style="color: #4af;">📋 Total: ${currentRequirements.length} requisito(s)</strong>`;
  
  if (newCount > 0) {
    html += ` <span style="color: #0f8;"> (+${newCount} novo(s))</span>`;
  }
  html += `</div>`;

  html += currentRequirements.map((req, idx) => {
    if (!req) {
      console.warn(`⚠️ Requisito nulo no índice ${idx}`);
      return '';
    }
    
    // Se for string, exibir como está
    if (typeof req === 'string') {
      return `
        <div style="background: rgba(74, 170, 255, 0.1); padding: 10px; border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid #4af;">
          <span>• <strong>${req}</strong></span>
          <div style="display: flex; gap: 6px;">
            <button onclick="removeRequirement(${idx})" style="background: #f66; border: none; color: white; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 0.9rem;">✕ Remover</button>
          </div>
        </div>
      `;
    }
    
    // Se for objeto
    if (typeof req === 'object') {
      let label = "";
      let color = "#4af";
      // Detectar tipo mesmo se undefined - observar campos presentes
      const reqType = req.type || (req.id || req.name ? "skill" : (req.value && !req.lvl && !req.level ? "clan" : ((req.lvl || req.level) && !req.id ? "playerLevel" : "desconhecido")));

      const lvlVal = req.lvl ?? req.level ?? 1;

      if (reqType === "skill" || reqType === undefined) {
        const skillDisplay = req.name || req.id || "?";
        label = `🔗 <strong>Skill:</strong> ${skillDisplay} <span style="color: #aaa;"> | Nível ${lvlVal}</span>`;
        color = "#4af";
      } else if (reqType === "clan") {
        label = `🏯 <strong>Clã:</strong> ${req.value || "?"}`;
        color = "#f8a";
      } else if (reqType === "playerLevel") {
        label = `👤 <strong>Nível Char:</strong> ${lvlVal}`;
        color = "#8af";
      } else {
        // Tipo desconhecido - mostrar o máximo de info possível
        const infoDisplay = req.value || req.name || req.id || Object.keys(req).join(",");
        label = `❓ <strong>Tipo não definido:</strong> ${infoDisplay}`;
        color = "#fa8";
      }

      return `
        <div style="background: rgba(74, 170, 255, 0.1); padding: 10px; border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${color};">
          <span>${label}</span>
          <div style="display: flex; gap: 6px;">
            <button onclick="editRequirement(${idx})" style="background: #4af; border: none; color: white; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 0.9rem;">✏️ Editar</button>
            <button onclick="removeRequirement(${idx})" style="background: #f66; border: none; color: white; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 0.9rem;">✕ Remover</button>
          </div>
        </div>
      `;
    }
    
    console.warn(`⚠️ Requisito inválido (não string nem objeto) no índice ${idx}:`, req);
    return '';
  }).filter(Boolean).join("");
  
  list.innerHTML = html;
}

window.addNewRequirement = function() {
  const typeSelect = document.getElementById("req-type");
  const skillSelect = document.getElementById("req-value-skill");
  const textInput = document.getElementById("req-value");
  const levelInput = document.getElementById("req-level");
  
  const type = typeSelect?.value;
  let value = "";

  // Obter valor de acordo com o tipo
  if (type === "skill") {
    value = skillSelect?.value?.trim();
    if (!value) {
      alert("❌ Selecione uma skill!");
      return;
    }
  } else if (type === "clan") {
    value = textInput?.value?.trim();
    if (!value) {
      alert("❌ Digite o nome do clã!");
      return;
    }
  } else if (type === "playerLevel") {
    value = parseInt(levelInput?.value) || null;
    if (value === null || value < 1) {
      alert("❌ Digite um nível válido (número maior que 0)!");
      return;
    }
  } else {
    // Tipo undefined ou desconhecido
    alert(`❌ Tipo de requisito não reconhecido: "${type}"`);
    return;
  }

  const level = parseInt(levelInput?.value) || 1;

  // Validar e processar requisito
  if (type === "skill") {
    const skillExists = skillsList.find(s => s.id === value || s.name === value);
    if (!skillExists) {
      alert(`❌ Skill não encontrada: "${value}"`);
      return;
    }
    // Usar ID da skill para consistência
    const skillId = skillExists.id || skillExists.name;
    currentRequirements.push({
      type: "skill",
      id: skillId,
      name: skillExists.name || skillId,
      lvl: level
    });
    console.log(`✅ Requisito adicionado: Skill "${skillExists.name}" nível ${level}`);
  } else if (type === "clan") {
    currentRequirements.push({
      type: "clan",
      value: value
    });
    console.log(`✅ Requisito adicionado: Clã "${value}"`);
  } else if (type === "playerLevel") {
    currentRequirements.push({
      type: "playerLevel",
      lvl: value
    });
    console.log(`✅ Requisito adicionado: Nível do Personagem ${value}`);
  }

  renderRequirementsList();
  
  // Limpar campos
  skillSelect.value = "";
  textInput.value = "";
  levelInput.value = "";
  typeSelect.value = "skill";
  // Disparar mudança para resetar a UI
  typeSelect.dispatchEvent(new Event("change"));
};

window.removeRequirement = function(idx) {
  currentRequirements.splice(idx, 1);
  renderRequirementsList();
};

window.editRequirement = function(idx) {
  const req = currentRequirements[idx];
  if (!req) return;

  const typeSelect = document.getElementById("req-type");
  const skillSelect = document.getElementById("req-value-skill");
  const textInput = document.getElementById("req-value");
  const levelInput = document.getElementById("req-level");

  // Detectar tipo mesmo se undefined
  let reqType = req.type;
  if (!reqType) {
    if (req.id || req.name) {
      reqType = "skill";
    } else if (req.value && !req.level) {
      reqType = "clan";
    } else if (req.level && !req.id) {
      reqType = "playerLevel";
    }
  }

  // Carregar valores nos campos
  if (reqType === "skill" || reqType === undefined) {
    typeSelect.value = "skill";
    typeSelect.dispatchEvent(new Event("change"));
    skillSelect.value = req.id || "";
    levelInput.value = req.lvl || req.level || 1;
  } else if (reqType === "clan") {
    typeSelect.value = "clan";
    typeSelect.dispatchEvent(new Event("change"));
    textInput.value = req.value || "";
  } else if (reqType === "playerLevel") {
    typeSelect.value = "playerLevel";
    typeSelect.dispatchEvent(new Event("change"));
    levelInput.value = req.lvl || req.level || 1;
  } else {
    alert(`❌ Não foi possível identificar o tipo do requisito`);
    return;
  }

  // Remover item atual
  currentRequirements.splice(idx, 1);
  renderRequirementsList();
  
  // Scroll para o formulário de requisitos
  document.getElementById("req-type").scrollIntoView({ behavior: 'smooth', block: 'center' });
};

/* =========================================================
   SETUP EDITOR DE SKILLS
========================================================= */
function setupSkillsEditor() {
  const btnAddReq = document.getElementById("btn-add-req");
  const btnSaveSkill = document.getElementById("btn-save-skill");
  const skillCategory = document.getElementById("skill-category");
  const skillTree = document.getElementById("skill-tree");
  const skillsReady = document.getElementById("skills-ready");
  const skillsMaintenance = document.getElementById("skills-maintenance");
  const reqTypeSelect = document.getElementById("req-type");

  if (btnAddReq) {
    btnAddReq.addEventListener("click", addNewRequirement);
  }

  if (btnSaveSkill) {
    btnSaveSkill.addEventListener("click", saveSkillChanges);
  }

  // Gerenciar alternância entre select de skill e campo de texto
  if (reqTypeSelect) {
    reqTypeSelect.addEventListener("change", (e) => {
      const skillSelect = document.getElementById("req-value-skill");
      const textInput = document.getElementById("req-value");
      const levelInput = document.getElementById("req-level");
      const labelSkill = document.getElementById("label-skill");
      const labelText = document.getElementById("label-text");
      const labelLevel = document.getElementById("label-level");
      
      // Esconder tudo
      if (skillSelect) skillSelect.style.display = "none";
      if (textInput) textInput.style.display = "none";
      if (levelInput) levelInput.style.display = "none";
      if (labelSkill) labelSkill.style.display = "none";
      if (labelText) labelText.style.display = "none";
      if (labelLevel) labelLevel.style.display = "none";
      
      // Mostrar campos específicos por tipo
      if (e.target.value === "skill") {
        if (skillSelect) skillSelect.style.display = "block";
        if (levelInput) levelInput.style.display = "block";
        if (labelSkill) labelSkill.style.display = "block";
        if (labelLevel) { labelLevel.style.display = "block"; labelLevel.textContent = "Nível Mínimo (da skill):"; }
        populateSkillSelect();
      } else if (e.target.value === "clan") {
        if (textInput) textInput.style.display = "block";
        if (labelText) labelText.style.display = "block";
        if (textInput) textInput.placeholder = "Ex: Uchiha, Senju, etc...";
        // Para clan, não mostra nível
      } else if (e.target.value === "playerLevel") {
        if (levelInput) levelInput.style.display = "block";
        if (labelLevel) { labelLevel.style.display = "block"; labelLevel.textContent = "Nível do Personagem:"; }
        // Para playerLevel, só mostra nível
      }
    });
    // Trigger inicial para mostrar skill por padrão
    reqTypeSelect.dispatchEvent(new Event("change"));
  }

  // Listeners para filtros duplos
  if (skillCategory) {
    skillCategory.addEventListener("change", () => {
      updateSkillTreeOptions();
      updateSkillsCombobox();
    });
  }

  if (skillTree) {
    skillTree.addEventListener("change", () => {
      updateSkillsInCategory();
      updateSkillsCombobox();
    });
  }

  if (skillsReady) {
    skillsReady.addEventListener("change", (e) => {
      if (e.target.value) {
        document.getElementById("skill-select").value = e.target.value;
        const skillSelect = document.getElementById("skill-select");
        const event = new Event("change", { bubbles: true });
        skillSelect.dispatchEvent(event);
      }
    });
  }

  if (skillsMaintenance) {
    skillsMaintenance.addEventListener("change", (e) => {
      if (e.target.value) {
        document.getElementById("skill-select").value = e.target.value;
        const skillSelect = document.getElementById("skill-select");
        const event = new Event("change", { bubbles: true });
        skillSelect.dispatchEvent(event);
      }
    });
  }
}

// Preenche o select de skills com todas as skills disponíveis
function populateSkillSelect() {
  const skillSelect = document.getElementById("req-value-skill");
  if (!skillSelect) return;
  
  skillSelect.innerHTML = '<option value="">-- Selecione uma skill --</option>';
  skillsList.forEach(skill => {
    const opt = document.createElement("option");
    opt.value = skill.id || skill.name;
    opt.textContent = `${skill.name || skill.id}${skill.max ? ` (max: ${skill.max})` : ''}`;
    skillSelect.appendChild(opt);
  });
}

// Inicializar combobox de comparação
updateSkillsCombobox();



/* =========================================================
   SALVA MUDANÇAS DA SKILL
========================================================= */
async function saveSkillChanges() {
  if (!selectedSkill) {
    alert("❌ Nenhuma skill selecionada!");
    return;
  }

  try {
    const newName = document.getElementById("skill-name").value.trim();
    const newDesc = document.getElementById("skill-desc").value.trim();
    
    console.log("🔄 Iniciando salvar skill...", { selectedSkill: selectedSkill.id, newName, newDesc });
    console.log("👤 Admin:", { currentUID, currentAdminNick });
    
    // Validar nome não vazio
    if (!newName) {
      alert("❌ O nome da habilidade não pode estar vazio!");
      return;
    }

    // Carregar backup para comparação
    const backup = window.skillEditorBackup || {};
    const oldName = backup.name || selectedSkill.name || "";
    const oldDesc = backup.desc || selectedSkill.desc || "";
    const oldRequires = backup.requires || [];

    // Normalizar requisitos para comparação (usa `lvl` como padrão)
    const normalizedOldReq = normalizeRequirementsArray(oldRequires);
    const normalizedCurrentReq = normalizeRequirementsArray(currentRequirements);

    // Detectar quais campos foram alterados
    const changes = {};
    if (newName !== oldName) changes.name = { old: oldName, new: newName };
    if (newDesc !== oldDesc) changes.desc = { old: oldDesc, new: newDesc };
    if (JSON.stringify(normalizedCurrentReq) !== JSON.stringify(normalizedOldReq)) {
      changes.requires = { old: normalizedOldReq, new: normalizedCurrentReq };
    }

    // Se nenhuma mudança, avisar
    if (Object.keys(changes).length === 0) {
      alert("ℹ️ Nenhuma alteração detectada.");
      return;
    }

    console.log(`💾 Alterações detectadas:`, changes);

    // Atualizar skill local
    if (changes.name) selectedSkill.name = newName;
    if (changes.desc) selectedSkill.desc = newDesc;
    if (changes.requires) selectedSkill.requires = normalizedCurrentReq;
    
    console.log("📚 skillsList antes de salvar:", skillsList.length, "skills");
    console.log("📝 Skill sendo salva:", selectedSkill);
    
    // ================== SALVAR NO FIREBASE ==================
    console.log("📤 Enviando para Firestore...");
    const skillsRef = doc(db, "game_data", "skills_v1");
    console.log("📍 Referência do documento:", skillsRef.path);
    console.log("📊 Dados a enviar (preview):", skillsList.map(s => ({ id: s.id, requiresCount: (s.requires || s.requirements || s.requisitos || []).length })));

    // Detectar qual chave o documento atual usa (Skills vs skills)
    const snapBeforeSave = await getDoc(skillsRef);
    const serverDataBefore = snapBeforeSave.exists() ? snapBeforeSave.data() : {};
    const keyName = serverDataBefore && serverDataBefore.Skills ? 'Skills' : 'skills';
    console.log("🔑 Chave detectada no documento:", Object.keys(serverDataBefore).slice(0,10), "→ usando", keyName);

    try {
      // Preparar payload com requisitos normalizados em cada skill
      const payloadSkills = skillsList.map(s => {
        const copy = { ...s };
        const rawReqs = copy.requires ?? copy.requirements ?? copy.requisitos ?? [];
        copy.requires = normalizeRequirementsArray(rawReqs);
        delete copy.requirements;
        delete copy.requisitos;
        return copy;
      });

      const payload = { [keyName]: payloadSkills };
      await updateDoc(skillsRef, payload);
      console.log("✅ Document updateDoc completado com sucesso no campo:", keyName);
    } catch (dbErr) {
      console.error("❌ updateDoc falhou:", dbErr);
      try {
        console.log("🔁 Tentando setDoc com merge=true como fallback no campo:", keyName);
        const payload = { [keyName]: skillsList };
        await setDoc(skillsRef, payload, { merge: true });
        console.log("✅ setDoc(merge) completado com sucesso!");
      } catch (setErr) {
        console.error("❌ setDoc(merge) também falhou:", setErr);
        throw setErr;
      }
    }

    // ================== REGISTRAR LOG ==================
    try {
      // Criar sumário legível das mudanças
      const changeSummary = {};
      if (changes.name) {
        changeSummary.nome = `"${changes.name.old}" → "${changes.name.new}"`;
      }
      if (changes.desc) {
        const oldPreview = changes.desc.old.substring(0, 50) + (changes.desc.old.length > 50 ? '...' : '');
        const newPreview = changes.desc.new.substring(0, 50) + (changes.desc.new.length > 50 ? '...' : '');
        changeSummary.descricao = `"${oldPreview}" → "${newPreview}"`;
      }
      if (changes.requires) {
        changeSummary.requisitos = `${changes.requires.old.length} → ${changes.requires.new.length} item(ns)`;
      }
      
      const logEntry = {
        type: 'skill',
        action: 'update',
        itemId: selectedSkill.id,
        skillName: selectedSkill.name,
        adminId: currentUID,
        adminNick: currentAdminNick,
        timestamp: new Date().toISOString(),
        date: new Date(),
        changes: changes,
        changeSummary: changeSummary,
        changesCount: Object.keys(changes).length,
        fieldLabels: Object.keys(changes).map(f => {
          if (f === 'name') return 'Nome';
          if (f === 'desc') return 'Descrição';
          if (f === 'requires') return 'Requisitos';
          return f;
        }).join(', ')
      };
      
      await addDoc(collection(db, "skill_logs"), logEntry);
      console.log('✅ skill_logs registrado:', logEntry);
    } catch (logErr) {
      console.error("❌ Falha ao registrar skill_logs:", logErr);
    }

    const fieldLabels = Object.keys(changes).map(f => {
      if (f === 'name') return 'Nome';
      if (f === 'desc') return 'Descrição';
      if (f === 'requires') return 'Requisitos';
      return f;
    }).join(', ');
    
    showSkillsSuccess(`✅ "${selectedSkill.name}" salvo! (${fieldLabels})`);
    
    // ================== RECARREGAR LISTA ==================
    console.log("🔄 Recarregando lista de skills do Firestore...");
    await loadSkillsForEditing();
    console.log("✅ Lista recarregada do Firestore!");

    // Comparar o que o servidor retornou com o que salvamos localmente
    const serverSkill = skillsList.find(s => s.id === selectedSkill.id) || skillsList.find(s => s.id === (window.skillEditorBackup && window.skillEditorBackup.id));
    console.log("🔎 Servidor - skill após salvar:", serverSkill);
    console.log("🔎 Client - skill salvo (local):", selectedSkill);
    if (serverSkill) {
      const srvReq = serverSkill.requires ?? serverSkill.requirements ?? serverSkill.requisitos ?? [];
      const localReq = selectedSkill.requires ?? selectedSkill.requirements ?? selectedSkill.requisitos ?? [];
      console.log(`📊 Requisitos - servidor: ${srvReq.length}, local: ${localReq.length}`, { server: srvReq, local: localReq });
      if (JSON.stringify(srvReq) !== JSON.stringify(localReq)) {
        console.warn("⚠️ Mismatch entre local e servidor após salvar — possivelmente regras ou projeto diferente.");
        showSkillsError("⚠️ Salvo localmente, mas servidor retornou dados diferentes. Verifique regras/console/network.");
      }
    }
    
    // Limpar backup e fechar editor
    window.skillEditorBackup = null;
    document.getElementById("skill-editor").style.display = "none";
    document.getElementById("skill-editor").innerHTML = "";
    
  } catch (error) {
    console.error("❌ Erro ao salvar skill:", error);
    console.error("📋 Stack trace:", error.stack);
    console.error("🔍 Código de erro:", error.code);
    console.error("📝 Mensagem completa:", error.message);
    showSkillsError(`❌ Erro: ${error.message}\n\nCódigo: ${error.code}\n\nVerifique o console para mais detalhes.`);
  }
}

function showSkillsSuccess(message) {
  const el = document.getElementById("skills-message");
  const errorEl = document.getElementById("skills-error");
  errorEl.classList.remove("show");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}

function showSkillsError(message) {
  const el = document.getElementById("skills-error");
  const msgEl = document.getElementById("skills-message");
  msgEl.classList.remove("show");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}

/* =========================================================
   GERENCIAMENTO DE ABAS
========================================================= */
function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;

      // Remove active de todos
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));

      // Adiciona active ao clicado
      btn.classList.add("active");
      // Compatibilidade: alguns conteúdos usam id="nome-tab" e outros id="nome"
      const tabEl = document.getElementById(`${tabName}-tab`) || document.getElementById(tabName);
      if (tabEl) tabEl.classList.add("active");
    });
  });
}

/* =========================================================
   CARREGA LISTA DE JOGADORES
========================================================= */
async function loadPlayers() {
  try {
    console.log("🔄 Carregando jogadores...");
    const playersRef = collection(db, "players");
    const snap = await getDocs(playersRef);

    players = [];
    snap.forEach(docSnap => {
      players.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    // Se não encontrou players na coleção dedicada, tentar carregar a partir de `fichas`
    if (players.length === 0) {
      console.log("Nenhum documento em /players, tentando carregar a partir de /fichas...");
      try {
        const fichasSnap = await getDocs(collection(db, "fichas"));
        fichasSnap.forEach(docSnap => {
          const data = docSnap.data() || {};
          players.push({
            id: docSnap.id,
            nick: data.nick || data.nome || docSnap.id,
            cla: data.cla || data.clan || "Nenhum",
            xp: data.xp || 0,
            nivel: data.nivel || data.level || 1,
            pontos: data.pontos || 0
          });
        });
        console.log(`✅ ${players.length} jogadores carregados a partir de /fichas`);
      } catch (fErr) {
        console.error("Erro ao carregar fichas como fallback:", fErr);
      }
    } else {
      console.log(`✅ ${players.length} jogadores carregados`);
    }

    // Ordena por nome A->Z (nick ou id)
    players.sort((a, b) => ('' + (a.nick || a.id || '')).localeCompare('' + (b.nick || b.id || ''), 'pt-BR', { sensitivity: 'base' }));

    // Carrega select de jogadores
    loadPlayersSelect();

    // Renderiza grid de jogadores
    renderPlayersGrid();

  } catch (error) {
    console.error("❌ Erro ao carregar jogadores:", error);
    console.error("Código de erro:", error.code);
    console.error("Mensagem:", error.message);

    // Mostrar mensagem amigável ao usuário
    const container = document.getElementById("players-container");
    if (container) {
      let mensagem = "❌ Erro ao carregar jogadores.\n\n";
      
      if (error.code === "permission-denied") {
        mensagem += "Possíveis causas:\n" +
          "1. Você fez login antes de as regras do Firebase serem atualizadas\n" +
          "2. Seu usuário não tem permissão de admin\n\n" +
          "📌 Solução: Faça logout e login novamente para atualizar suas permissões.";
      } else {
        mensagem += `Erro técnico: ${error.message}`;
      }

      container.innerHTML = `
        <div style="
          background: rgba(200, 0, 0, 0.2);
          border: 1px solid #f66;
          color: #f88;
          padding: 20px;
          border-radius: 8px;
          white-space: pre-wrap;
          font-family: monospace;
          font-size: 0.9rem;
          line-height: 1.5;
        ">${mensagem}</div>
      `;
    }
  }
}

/* =========================================================
   CARREGA SELECT DE JOGADORES
========================================================= */
function loadPlayersSelect() {
  const select = document.getElementById("xp-player");
  if (!select) return;

  // Limpa opções
  select.innerHTML = `<option value="">Selecione um jogador...</option>`;

  // Adiciona cada jogador
  players.forEach(player => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = `${player.nick || "Desconhecido"} - ${player.cla || "Sem clã"}`;
    select.appendChild(option);
  });
}

/* =========================================================
   RENDERIZA GRID DE JOGADORES
========================================================= */
function renderPlayersGrid() {
  const container = document.getElementById("players-container");
  if (!container) return;

  if (players.length === 0) {
    container.innerHTML = "<p style='color: #888;'>Nenhum jogador encontrado.</p>";
    return;
  }

  container.innerHTML = "";

  players.forEach(player => {
    const card = document.createElement("div");
    card.className = "player-card";
    card.innerHTML = `
      <h3>${player.nick || "Desconhecido"}</h3>
      <p><strong>Clã:</strong> ${player.cla || "Sem clã"}</p>
      <p><strong>XP:</strong> ${player.xp || 0}</p>
      <p><strong>Nível:</strong> ${player.nivel || 1}</p>
      <p><strong>Pontos:</strong> ${player.pontos || 0}</p>
    `;
    container.appendChild(card);
  });
}

/* =========================================================
   SETUP DO FORMULÁRIO DE XP
========================================================= */
function setupXPForm() {
  const form = document.getElementById("xp-form");
  const commentField = document.getElementById("xp-comment");
  const xpAmountField = document.getElementById("xp-amount");
  const charCount = document.getElementById("xp-char-count");
  const submitBtn = form.querySelector(".btn-submit");

  // Valida campo XP: apenas números, máximo 50000
  xpAmountField.addEventListener("input", () => {
    let value = xpAmountField.value;
    
    // Remove caracteres não-numéricos
    value = value.replace(/[^0-9]/g, "");
    
    // Limita a 50000
    if (value && parseInt(value) > 50000) {
      value = "50000";
    }
    
    xpAmountField.value = value;
    updateFormValidity();
  });

  // Atualiza contador de caracteres
  commentField.addEventListener("input", () => {
    const count = commentField.value.length;
    charCount.textContent = `${count}/15`;

    // Muda cor se menos de 15 caracteres
    if (count < 15) {
      charCount.classList.add("warning");
    } else {
      charCount.classList.remove("warning");
    }

    updateFormValidity();
  });

  // Função para validar e atualizar botão
  function updateFormValidity() {
    const playerId = document.getElementById("xp-player").value;
    const xpAmount = xpAmountField.value;
    const commentLength = commentField.value.length;

    const isValid = playerId && xpAmount && commentLength >= 15;
    submitBtn.disabled = !isValid;
  }

  // Atualiza validação quando muda o select de jogador
  document.getElementById("xp-player").addEventListener("change", (e) => {
    updateFormValidity();
    // Carregar invocações do jogador quando selecionado
    const playerId = e.target.value;
    if (playerId) loadPlayerInvocations(playerId);
  });

  // Handler do checkbox de invocação
  const xpUsedCheckbox = document.getElementById("xp-used-invocation");
  const invocationSelector = document.getElementById("invocation-selector");
  // optional elements for expanding the XP form (may not exist in minimal layout)
  const xpFormDetails = document.getElementById("xp-form-details");
  const xpOpenFullTrigger = document.getElementById("xp-open-full-trigger");

  function toggleInvocationsDisplay(show) {
    if (invocationSelector) invocationSelector.style.display = show ? 'block' : 'none';
  }

  if (xpUsedCheckbox) {
    xpUsedCheckbox.addEventListener("change", (e) => {
      toggleInvocationsDisplay(e.target.checked);
      // if showing, ensure the select is populated for the currently selected player
      if (e.target.checked) {
        const playerId = document.getElementById("xp-player")?.value;
        if (playerId) loadPlayerInvocations(playerId);
      }
    });
  }

  if (xpOpenFullTrigger) {
    xpOpenFullTrigger.addEventListener('click', () => {
      const currently = xpFormDetails.style.display === 'block';
      xpFormDetails.style.display = currently ? 'none' : 'block';
    });
  }
  // Close button inside details
  const xpCloseDetails = document.getElementById('xp-open-full');
  if (xpCloseDetails) xpCloseDetails.addEventListener('click', () => { if (xpFormDetails) xpFormDetails.style.display = 'none'; });

  // Handler do select de invocação para popular região/família
  const xpInvEl = document.getElementById("xp-invocation");
  if (xpInvEl) xpInvEl.addEventListener("change", () => {
    populateInvocationRegions();
    // update region/family visibility based on selected invocation(s)
    updateRegionFamilyFromSelection();
  });

  function hideRegionFamilyContainers(hide) {
    const regionSel = document.getElementById('xp-inv-region');
    const familySel = document.getElementById('xp-inv-family');
    if (regionSel) {
      const rgContainer = regionSel.closest('.form-group') || regionSel.parentElement;
      if (rgContainer) rgContainer.style.display = hide ? 'none' : '';
    }
    if (familySel) {
      const famContainer = familySel.closest('.form-group') || familySel.parentElement;
      if (famContainer) famContainer.style.display = hide ? 'none' : '';
    }
  }

  function updateRegionFamilyFromSelection() {
    const sel = document.getElementById('xp-invocation');
    if (!sel) return;
    const opts = Array.from(sel.selectedOptions).map(o => o.value).filter(Boolean);
    if (opts.length !== 1) {
      // hide region/family when none or multiple selected
      hideRegionFamilyContainers(true);
      return;
    }
    const selectedInvId = opts[0];
    // find in invocationsList
    const inv = (invocationsList || []).find(i => (i.id === selectedInvId) || (i.name === selectedInvId) || (String(i) === selectedInvId));
    if (!inv) {
      hideRegionFamilyContainers(true);
      return;
    }
    // ensure region select is populated
    populateInvocationRegions();
    // show containers
    hideRegionFamilyContainers(false);
    // set region if available
    if (inv.region) {
      const regionSel = document.getElementById('xp-inv-region');
      if (regionSel) regionSel.value = inv.region;
      populateInvocationFamilies();
      if (inv.family) {
        const famSel = document.getElementById('xp-inv-family');
        if (famSel) famSel.value = inv.family;
      }
    }
  }

  // Handler do select de região para popular família (apenas se o select existir)
  const xpInvRegionEl = document.getElementById("xp-inv-region");
  if (xpInvRegionEl) {
    xpInvRegionEl.addEventListener("change", () => {
      populateInvocationFamilies();
    });
  }

  // Handler do checkbox de bônus de árvore
  document.getElementById("xp-add-tree-bonus").addEventListener("change", (e) => {
    document.getElementById("tree-bonus-selector").style.display = e.target.checked ? "block" : "none";
    if (e.target.checked) populateTreeSelect();
  });

  // Populando select de árvores
  function populateTreeSelect() {
    const treeSelect = document.getElementById("xp-tree");
    treeSelect.innerHTML = `<option value="">-- Selecione --</option>`;
    
    // Adiciona as "guias de árvores" - skills com max === 0
    skillsList.filter(s => s.max === 0).forEach(guide => {
      const opt = document.createElement("option");
      opt.value = guide.id;
      opt.textContent = guide.name || guide.id;
      treeSelect.appendChild(opt);
    });
  }

  // Popula select de perks (usando skillsList como fonte simples)
  function populatePerkSelect() {
    const perkSel = document.getElementById('xp-perk-select');
    if (!perkSel) return;
    perkSel.innerHTML = `<option value="">-- Selecione --</option>`;
    (skillsList || []).forEach(s => {
      const opt = document.createElement('option'); opt.value = s.id || s.name; opt.textContent = s.name || s.id; perkSel.appendChild(opt);
    });
  }

  // Handler: adicionar pontos em árvore para o jogador selecionado
  document.getElementById('btn-add-tree-points')?.addEventListener('click', async () => {
    const playerId = document.getElementById('xp-player').value;
    const treeId = document.getElementById('xp-tree').value;
    const points = parseInt(document.getElementById('xp-tree-points').value) || 0;
    if (!playerId) return alert('Selecione um jogador primeiro');
    if (!treeId || points <= 0) return alert('Selecione uma árvore e um número de pontos válido');
    try {
      const fichRef = doc(db, 'fichas', playerId);
      const snap = await getDoc(fichRef);
      const data = snap.exists() ? snap.data() : {};
      const treeXp = data.treeXp || {};
      treeXp[treeId] = (treeXp[treeId] || 0) + points;
      await updateDoc(fichRef, { treeXp });
      alert(`Adicionados ${points} pontos à árvore ${treeId} do jogador.`);
    } catch (err) {
      console.error('Erro ao adicionar pontos na árvore:', err);
      alert('Erro ao adicionar pontos na árvore: ' + (err.message || err.code || ''));
    }
  });

  // Handler: adicionar perk points ao jogador
  document.getElementById('btn-add-perk')?.addEventListener('click', async () => {
    const playerId = document.getElementById('xp-player').value;
    const perkId = document.getElementById('xp-perk-select').value;
    const points = parseInt(document.getElementById('xp-perk-points').value) || 0;
    if (!playerId) return alert('Selecione um jogador primeiro');
    if (!perkId || points <= 0) return alert('Selecione um perk e um número de pontos válido');
    try {
      const fichRef = doc(db, 'fichas', playerId);
      const snap = await getDoc(fichRef);
      const data = snap.exists() ? snap.data() : {};
      const perks = data.perks || {};
      perks[perkId] = (perks[perkId] || 0) + points;
      await updateDoc(fichRef, { perks });
      alert(`Adicionados ${points} pontos ao perk ${perkId} do jogador.`);
    } catch (err) {
      console.error('Erro ao adicionar perk points:', err);
      alert('Erro ao adicionar perk points: ' + (err.message || err.code || ''));
    }
  });

  // Inicializações de selects específicos da aba
  try { populateTreeSelect(); } catch(e){}
  try { populatePerkSelect(); } catch(e){}

  // Populando região e família da invocação
  function populateInvocationRegions() {
    const regionSelect = document.getElementById("xp-inv-region");
    const familySelect = document.getElementById("xp-inv-family");
    if (!regionSelect && !familySelect) return; // nothing to populate

    if (regionSelect) regionSelect.innerHTML = `<option value="">-- Selecione --</option>`;
    if (familySelect) familySelect.innerHTML = `<option value="">-- Selecione --</option>`;

    Object.keys(regionsObj || {}).forEach(key => {
      const meta = regionsObj[key];
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = meta.name || key;
      if (regionSelect) regionSelect.appendChild(opt);
    });
  }

  // Populando famílias baseado na região selecionada
  function populateInvocationFamilies() {
    const regionKey = getXPRegionValue();
    const familySelect = document.getElementById("xp-inv-family");
    if (!familySelect) return;

    familySelect.innerHTML = `<option value="">-- Selecione --</option>`;

    if (!regionKey || !regionsObj[regionKey]) return;

    const families = regionsObj[regionKey].families || {};
    Object.keys(families).forEach(fk => {
      const fmeta = families[fk];
      const opt = document.createElement("option");
      opt.value = fk;
      opt.textContent = fmeta.name || fk;
      familySelect.appendChild(opt);
    });
  }

  // Handler: adicionar família rapidamente a partir do formulário de XP
  document.getElementById('btn-add-xp-family')?.addEventListener('click', async (e) => {
    e?.preventDefault();
    const regionKey = getXPRegionValue();
    const famKey = (document.getElementById('xp-new-family-key').value || '').trim();
    const famName = (document.getElementById('xp-new-family-name').value || '').trim();
    if (!regionKey) return alert('Selecione uma região antes de adicionar uma família.');
    if (!famKey || !famName) return alert('Preencha chave e nome da família.');
    try {
      regionsObj[regionKey] = regionsObj[regionKey] || { name: regionKey, families: {} };
      regionsObj[regionKey].families = regionsObj[regionKey].families || {};
      if (regionsObj[regionKey].families[famKey]) return alert('Família já existe nessa região');
      regionsObj[regionKey].families[famKey] = { name: famName, rankings: {} };
      // salvar no Firestore
      const ref = doc(db, 'game_data', 'invocacoes_v1');
      await updateDoc(ref, { regions: regionsObj }).catch(async () => {
        await setDoc(ref, { regions: regionsObj }, { merge: true });
      });
      populateInvocationHierarchyOptions();
      populateInvocationFamilies();
      document.getElementById('xp-new-family-key').value = '';
      document.getElementById('xp-new-family-name').value = '';
      alert('Família adicionada com sucesso.');
    } catch (err) {
      console.error('Erro ao adicionar família:', err);
      alert('Erro ao adicionar família: ' + (err.message || err.code || ''));
    }
  });

  // Handler: adicionar invocação rapidamente a partir do formulário de XP
  document.getElementById('btn-add-xp-inv')?.addEventListener('click', async (e) => {
    e?.preventDefault();
    const invId = (document.getElementById('xp-new-inv-id').value || '').trim();
    const invName = (document.getElementById('xp-new-inv-name').value || '').trim();
    const regionKey = getXPRegionValue() || null;
    const familyKey = getXPFamilyValue() || null;
    if (!invId || !invName) return alert('Preencha id e nome da invocação.');
    try {
      invocationsList = invocationsList || [];
      // avoid duplicates
      if (invocationsList.find(i => (i.id || '').toLowerCase() === invId.toLowerCase())) return alert('Invocação com esse id já existe');
      const newInv = { id: invId, name: invName, category: '', max: 1, desc: '', region: regionKey, family: familyKey };
      invocationsList.push(newInv);
      const ref = doc(db, 'game_data', 'invocacoes_v1');
      await updateDoc(ref, { invocacoes: invocationsList }).catch(async () => {
        await setDoc(ref, { invocacoes: invocationsList }, { merge: true });
      });
      await loadInvocationsForEditing();
      document.getElementById('xp-new-inv-id').value = '';
      document.getElementById('xp-new-inv-name').value = '';
      alert('Invocação adicionada com sucesso.');
    } catch (err) {
      console.error('Erro ao adicionar invocação:', err);
      alert('Erro ao adicionar invocação: ' + (err.message || err.code || ''));
    }
  });

  // Listeners para checkboxes de items
  const conseguiuItemCheckbox = document.getElementById("xp-conseguiu-item");
  const gastouItemCheckbox = document.getElementById("xp-gastou-item");
  const itemAddSection = document.getElementById("item-add-section");
  const itemRemoveSection = document.getElementById("item-remove-section");

  if (conseguiuItemCheckbox) {
    conseguiuItemCheckbox.addEventListener("change", async (e) => {
      if (e.target.checked) {
        itemAddSection.style.display = "block";
        await carregarItensLojaAdmin();
      } else {
        itemAddSection.style.display = "none";
      }
    });
  }

  if (gastouItemCheckbox) {
    gastouItemCheckbox.addEventListener("change", async (e) => {
      const playerId = document.getElementById("xp-player").value;
      if (e.target.checked) {
        itemRemoveSection.style.display = "block";
        if (playerId) {
          await carregarInventarioJogadorAdmin(playerId);
        }
      } else {
        itemRemoveSection.style.display = "none";
      }
    });
  }

  // Atualizar inventário quando mudado jogador
  document.getElementById("xp-player").addEventListener("change", async (e) => {
    if (gastouItemCheckbox && gastouItemCheckbox.checked) {
      await carregarInventarioJogadorAdmin(e.target.value);
    }
  });

  // Submissão do formulário
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const playerId = document.getElementById("xp-player").value;
    const xpAmount = parseInt(document.getElementById("xp-amount").value);
    const ryous = parseInt(document.getElementById("xp-ryous").value) || 0;
    const comment = document.getElementById("xp-comment").value;
    const usedInvocation = document.getElementById("xp-used-invocation").checked;
    
    // Coleta múltiplas invocações selecionadas
    let invocationsUsed = [];
    let invocationRegion = null;
    let invocationFamily = null;
    if (usedInvocation) {
      const selectElement = document.getElementById("xp-invocation");
      const selectedOptions = selectElement.selectedOptions;
      for (let i = 0; i < selectedOptions.length; i++) {
        if (selectedOptions[i].value) invocationsUsed.push(selectedOptions[i].value);
      }
      invocationRegion = getXPRegionValue();
      invocationFamily = getXPFamilyValue();
    }

    // Coleta bônus de árvore
    let treeBonus = null;
    const hasTreeBonus = document.getElementById("xp-add-tree-bonus").checked;
    if (hasTreeBonus) {
      const treeId = document.getElementById("xp-tree").value;
      const treePoints = parseInt(document.getElementById("xp-tree-points").value) || 0;
      if (treeId && treePoints > 0) {
        treeBonus = { treeId, points: treePoints };
      }
    }

    // Validações finais
    if (!playerId) {
      showXPError("Selecione um jogador!");
      return;
    }

    if (!xpAmount || xpAmount < 1 || xpAmount > 50000) {
      showXPError("Digite uma quantidade válida de XP (1 a 50000)!");
      return;
    }

    if (comment.length < 15) {
      showXPError("O comentário deve ter pelo menos 15 caracteres!");
      return;
    }

    // Coleta items adicionados
    let itemsAdicionados = [];
    const itemsList = document.getElementById("xp-items-list");
    if (itemsList) {
      const items = itemsList.querySelectorAll("[data-item-id]");
      items.forEach(item => {
        const itemId = item.getAttribute("data-item-id");
        const qty = parseInt(item.getAttribute("data-qty")) || 1;
        if (itemId) itemsAdicionados.push({ itemId, quantidade: qty });
      });
    }

    // Coleta items removidos
    let itemsRemovidos = [];
    const itemsRemoveList = document.getElementById("xp-items-remove-list");
    if (itemsRemoveList) {
      const items = itemsRemoveList.querySelectorAll("[data-item-remove-id]");
      items.forEach(item => {
        const itemId = item.getAttribute("data-item-remove-id");
        const qty = parseInt(item.getAttribute("data-qty")) || 1;
        if (itemId) itemsRemovidos.push({ itemId, quantidade: qty });
      });
    }

    // Processa
    await addXPToPlayer(playerId, xpAmount, ryous, comment, usedInvocation, invocationsUsed, invocationRegion, invocationFamily, treeBonus, itemsAdicionados, itemsRemovidos);
  });
}

/* =========================================================
   CARREGA INVOCAÇÕES DO JOGADOR
========================================================= */
async function loadPlayerInvocations(playerId) {
  try {
    const playerRef = doc(db, "fichas", playerId);
    const playerSnap = await getDoc(playerRef);
    if (!playerSnap.exists()) return;
    const playerData = playerSnap.data();
    
    // Ler de Familia_Invocação (novo formato)
    const familiaInvocacao = playerData.Familia_Invocação || {};
    const allInvocations = [];
    
    for (const familia in familiaInvocacao) {
      if (Array.isArray(familiaInvocacao[familia])) {
        allInvocations.push(...familiaInvocacao[familia]);
      }
    }

    const select = document.getElementById("xp-invocation");
    if (!select) return;
    select.innerHTML = '<option value="">-- Selecione --</option>';
    
    if (allInvocations.length === 0) {
      select.innerHTML = '<option disabled>Sem invocações registradas</option>';
      return;
    }
    
    allInvocations.forEach(inv => {
      const opt = document.createElement("option");
      const val = inv.id || inv.name;
      const label = inv.name || inv.id;
      opt.value = val;
      opt.textContent = label;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Erro ao carregar invocações:", err);
  }
}

/* =========================================================
   FORM: ADICIONAR INVOCAÇÃO AO JOGADOR
========================================================= */
function setupAddInvocacaoPlayerForm() {
  const form = document.getElementById('add-inv-player-form');
  const playerSel = document.getElementById('inv-player-select');
  const invSel = document.getElementById('inv-select-to-add');
  if (!form || !playerSel || !invSel) return;

  // populate options
  function refresh() {
    // players
    playerSel.innerHTML = '<option value="">Selecione um jogador...</option>';
    players.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.nick || p.id; playerSel.appendChild(o); });
    // invocations
    invSel.innerHTML = '<option value="">Selecione uma invocação...</option>';
    invocationsList.forEach(inv => { const o = document.createElement('option'); o.value = inv.id || inv.name; o.textContent = inv.name || inv.id; invSel.appendChild(o); });
  }

  refresh();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const playerId = playerSel.value;
    const invId = invSel.value;
    if (!playerId) return alert('Selecione um jogador');
    if (!invId) return alert('Selecione uma invocação');
    try {
      const fichRef = doc(db, 'fichas', playerId);
      const snap = await getDoc(fichRef);
      const data = snap.exists() ? snap.data() : {};
      
      // Encontrar a invocação para pegar a família
      const invocation = invocationsList.find(i => i.id === invId || i.name === invId);
      if (!invocation) return alert('Invocação não encontrada no banco');
      
      // Criar estrutura Familia_Invocação
      let familiaInvocacao = data.Familia_Invocação || {};
      const familia = invocation.family || 'Sem Família';
      
      if (!familiaInvocacao[familia]) {
        familiaInvocacao[familia] = [];
      }
      
      // Verificar se já existe
      const exists = familiaInvocacao[familia].find(a => a.id === invId || a.name === invocation.name);
      if (exists) return alert('Jogador já possui essa invocação');
      
      // Adicionar novo animal à família com afinidade inicial 1
      familiaInvocacao[familia].push({
        id: invId,
        name: invocation.name,
        afinidade: 1
      });
      
      await updateDoc(fichRef, { Familia_Invocação: familiaInvocacao });
      document.getElementById('add-inv-player-message').textContent = `✅ ${invocation.name} adicionado à família ${familia}.`;
      setTimeout(() => document.getElementById('add-inv-player-message').textContent = '', 3000);
      await loadPlayers();
    } catch (err) {
      console.error('Erro ao adicionar invocação ao jogador:', err);
      const code = err.code || err.message || '';
      if ((code + '').toLowerCase().includes('permission') || (code + '').toLowerCase().includes('missing')) {
        alert('Erro: Permissão negada ao gravar na ficha do jogador.\n\nVerifique no Firestore Console se: \n- Seu usuário (uid) tem o campo `admin: true` em `fichas/{seuUid}`;\n- As regras do Firestore permitem que administradores escrevam em `fichas/*`.');
      } else {
        alert('Erro ao adicionar invocação ao jogador: ' + (err.message || err.code || '')); 
      }
    }
  });
}

/* =========================================================
   FORM: ADICIONAR DOUJUTSU AO JOGADOR
========================================================= */
function setupAddDoujutsuForm() {
  const form = document.getElementById('add-doujutsu-form');
  const playerSel = document.getElementById('dj-player-select');
  const djSel = document.getElementById('dj-skill-select');
  if (!form || !playerSel || !djSel) return;

  function refresh() {
    playerSel.innerHTML = '<option value="">Selecione um jogador...</option>';
    players.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.nick || p.id; playerSel.appendChild(o); });
    djSel.innerHTML = '<option value="">Selecione um Doujutsu...</option>';
    // prefer skills with parent doujutsu or name includes doujutsu
    const doujs = skillsList.filter(s => (s.parent && s.parent.toLowerCase?.() === 'doujutsu') || (s.category && s.category.toLowerCase?.() === 'doujutsu') || (s.id && s.id.toLowerCase?.().includes('douj')));
    doujs.forEach(s => { const o = document.createElement('option'); o.value = s.id || s.name; o.textContent = s.name || s.id; djSel.appendChild(o); });
  }

  refresh();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const playerId = playerSel.value;
    const skillId = djSel.value;
    if (!playerId) return alert('Selecione um jogador');
    if (!skillId) return alert('Selecione um Doujutsu');
    try {
      const fichRef = doc(db, 'fichas', playerId);
      const snap = await getDoc(fichRef);
      const data = snap.exists() ? snap.data() : {};
      const skills = data.skills || {};
      if (skills[skillId]) return alert('Jogador já possui esse doujutsu');
      const def = skillsList.find(s => (s.id || s.name) === skillId) || { id: skillId, name: skillId, max: 5 };
      skills[skillId] = { name: def.name || skillId, level: 1, max: def.max || 5 };
      await updateDoc(fichRef, { skills });
      document.getElementById('add-doujutsu-message').textContent = '✅ Doujutsu adicionado.';
      setTimeout(() => document.getElementById('add-doujutsu-message').textContent = '', 3000);
      await loadPlayers();
    } catch (err) {
      console.error('Erro ao adicionar doujutsu:', err);
      alert('Erro: ' + (err.message || err.code || ''));
    }
  });
}

/* =========================================================
   ADICIONA XP AO JOGADOR
========================================================= */
async function addXPToPlayer(playerId, amount, ryous, comment, usedInvocation, invocationsUsed = [], invocationRegion = null, invocationFamily = null, treeBonus = null, itemsAdicionados = [], itemsRemovidos = []) {
  try {
    // Primeiro tenta procurar em /players
    let playerRef = doc(db, "players", playerId);
    let playerSnap = await getDoc(playerRef);
    let playerData = playerSnap.data();
    let isFromFichas = false;

    // Se não encontrou em /players, tenta em /fichas
    if (!playerSnap.exists()) {
      console.log("Jogador não encontrado em /players, tentando em /fichas...");
      playerRef = doc(db, "fichas", playerId);
      playerSnap = await getDoc(playerRef);
      playerData = playerSnap.data();
      isFromFichas = true;
    }

    if (!playerSnap.exists()) {
      showXPError("Jogador não encontrado em nenhuma coleção!");
      return;
    }

    const newXP = (playerData.xp || 0) + amount;
    const newRyous = (playerData.ryous || 0) + ryous;

    // Atualiza XP e Ryous do jogador na coleção correta
    await updateDoc(playerRef, {
      xp: newXP,
      ryous: newRyous
    });

    // Carregar dados do admin para obter o nick
    let adminNick = "Admin";
    try {
      const adminSnap = await getDoc(doc(db, "fichas", currentUID));
      if (adminSnap.exists()) {
        adminNick = adminSnap.data().nick || adminSnap.data().nome || "Admin";
      }
    } catch (err) {
      console.error("Aviso: não foi possível carregar nick do admin:", err);
    }

    // Registra no histórico (inclui items adicionados/removidos quando aplicável)
    await addDoc(collection(db, "xp_logs"), {
      playerId: playerId,
      playerNick: playerData.nick || playerData.nome || playerId,
      playerClan: playerData.cla || playerData.clan || "Nenhum",
      xpAmount: amount,
      ryous: ryous,
      newXPTotal: newXP,
      adminId: currentUID,
      adminNick: adminNick,
      xpComment: comment,
      usedInvocation: usedInvocation,
      invocationsUsed: invocationsUsed,
      invocationsCount: invocationsUsed.length,
      invocationRegion: invocationRegion || null,
      treeBonus: treeBonus || null,
      itemsAdded: itemsAdicionados || [],
      itemsRemoved: itemsRemovidos || [],
      dateAdded: new Date(),
      date: new Date(),
      source: isFromFichas ? "fichas" : "players"
    });

    // Atualiza invocações com 50% do XP (dividido entre elas, arredondado pra cima)
    if (usedInvocation && invocationsUsed.length > 0) {
      const xpPerInvocation = Math.ceil((amount * 0.5) / invocationsUsed.length);
      try {
        // Atualizar XP global das invocações
        for (const invName of invocationsUsed) {
          const invRef = doc(db, "game_data", "invocacoes_v1");
          const invSnap = await getDoc(invRef);
          if (invSnap.exists()) {
            const data = invSnap.data() || {};
            // Suporte para array (invocacoes) e objeto (chave-valor)
            let invocations = data.invocacoes || data.invocations || [];
            if (!Array.isArray(invocations)) {
              invocations = Object.entries(invocations).map(([id, obj]) => ({ id, ...(obj || {}) }));
            }
            // Procurar e atualizar a invocação pelo id ou name
            let found = false;
            for (let i = 0; i < invocations.length; i++) {
              const inv = invocations[i];
              if ((inv.id === invName) || (inv.name === invName) || (String(inv) === invName)) {
                invocations[i].xp = (inv.xp || 0) + xpPerInvocation;
                found = true;
                break;
              }
            }
            if (found) {
              await updateDoc(invRef, { invocacoes: invocations });
            }
          }
        }
        
        // Atualizar afinidade de invocações na ficha do jogador (fichas/{uid}.Familia_Invocação)
        const fichRef = doc(db, "fichas", playerId);
        const familiaInvocacao = playerData.Familia_Invocação || {};
        
        // Procurar cada invocação e incrementar afinidade
        for (const invName of invocationsUsed) {
          // Procurar qual família contém essa invocação
          for (const familia in familiaInvocacao) {
            if (Array.isArray(familiaInvocacao[familia])) {
              const animal = familiaInvocacao[familia].find(a => a.name === invName || a.id === invName);
              if (animal) {
                animal.afinidade = (animal.afinidade || 0) + xpPerInvocation;
              }
            }
          }
        }
        
        await updateDoc(fichRef, { Familia_Invocação: familiaInvocacao });

        // Adicionar bonus em árvore especifica se selecionado
        if (treeBonus && treeBonus.treeId && treeBonus.points > 0) {
          const currentTreeXp = playerData.treeXp || {};
          currentTreeXp[treeBonus.treeId] = (currentTreeXp[treeBonus.treeId] || 0) + treeBonus.points;
          await updateDoc(fichRef, { treeXp: currentTreeXp });
        }
      } catch (err) {
        console.warn("Aviso: erro ao atualizar XP das invocações:", err);
      }
    }
    
    // Processar items adicionados (adicionar ao inventário do jogador)
    try {
      if (itemsAdicionados && itemsAdicionados.length > 0) {
        const lojaRef = doc(db, 'game_data', 'loja_v1');
        const lojaSnap = await getDoc(lojaRef);
        const lojaItems = (lojaSnap.exists() && lojaSnap.data().itens) ? lojaSnap.data().itens : [];
        for (const it of itemsAdicionados) {
          const def = lojaItems.find(i => (i.id === it.itemId) || (i.nome === it.itemId) || (i.name === it.itemId));
          await addDoc(collection(db, 'player_inventory', playerId, 'items'), {
            nome: def?.nome || def?.name || it.itemId,
            descricao: def?.descricao || def?.desc || '',
            icone: def?.icone || '',
            preco: def?.preco || def?.price || 0,
            ranking: def?.ranking || def?.rank || 'E',
            quantidade: it.quantidade || 1,
            adquiridoEm: serverTimestamp()
          });
        }
      }
    } catch (err) {
      console.error('Erro ao adicionar items ao inventário:', err);
    }

    // Processar items removidos (remover ou decrementar quantidade)
    try {
      if (itemsRemovidos && itemsRemovidos.length > 0) {
        for (const rem of itemsRemovidos) {
          const itemRef = doc(db, 'player_inventory', playerId, 'items', rem.itemId);
          const snap = await getDoc(itemRef);
          if (!snap.exists()) continue;
          const data = snap.data() || {};
          const currentQty = data.quantidade || 1;
          const removeQty = rem.quantidade || 1;
          if (currentQty > removeQty) {
            await updateDoc(itemRef, { quantidade: currentQty - removeQty });
          } else {
            await updateDoc(itemRef, { vendido: true, vendidoEm: serverTimestamp() });
          }
        }
      }
    } catch (err) {
      console.error('Erro ao remover items do inventário:', err);
    }
    // Feedback
    showXPSuccess(`✅ ${amount} XP adicionado a ${playerData.nick || playerData.nome || playerId} com sucesso!`);

    // Limpa formulário
    document.getElementById("xp-form").reset();
    document.getElementById("xp-char-count").textContent = "0/15";
    document.getElementById("invocation-selector").style.display = "none";
    document.getElementById("xp-form").querySelector(".btn-submit").disabled = true;

    // Atualiza lista
    await loadPlayers();
    await loadXPLogs();

  } catch (error) {
    console.error("Erro ao adicionar XP:", error);
    showXPError("Erro ao adicionar XP. Tente novamente.");
  }
}

// =========================================================
// Helpers para items no admin
// =========================================================
async function carregarItensLojaAdmin() {
  try {
    const sel = document.getElementById('xp-item-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">Carregando items...</option>';
    const lojaRef = doc(db, 'game_data', 'loja_v1');
    const lojaSnap = await getDoc(lojaRef);
    const itens = (lojaSnap.exists() && lojaSnap.data().itens) ? lojaSnap.data().itens : [];
    sel.innerHTML = '<option value="">-- Selecione um item --</option>';
    itens.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.id || it.nome || it.name;
      const rank = it.ranking || it.rank || 'E';
      opt.textContent = `${it.nome || it.name} [${rank}] (${it.preco || 0} Ryous)`;
      sel.appendChild(opt);
    });
  } catch (err) {
    console.error('Erro carregar itens da loja (admin):', err);
  }
}

async function carregarInventarioJogadorAdmin(playerId) {
  try {
    const sel = document.getElementById('xp-item-remove-select');
    const container = document.getElementById('xp-items-remove-list');
    if (!sel || !container) return;
    sel.innerHTML = '<option value="">Carregando inventário...</option>';
    container.innerHTML = '';
    const invRef = collection(db, 'player_inventory', playerId, 'items');
    const invSnap = await getDocs(invRef);
    const items = [];
    invSnap.forEach(d => items.push({ id: d.id, ...d.data() }));
    if (items.length === 0) {
      sel.innerHTML = '<option value="">Nenhum item no inventário</option>';
      return;
    }
    sel.innerHTML = '<option value="">-- Selecione um item --</option>';
    items.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.id;
      const rank = it.ranking || it.rank || 'E';
      opt.textContent = `${it.nome || it.name} [${rank}] (x${it.quantidade || 1})`;
      sel.appendChild(opt);
    });
  } catch (err) {
    console.error('Erro ao carregar inventário admin:', err);
  }
}

// Funções chamadas pelos botões + adicionar/remoção do formulário
window.adicionarItemAoFormXP = function() {
  const sel = document.getElementById('xp-item-select');
  const qty = parseInt(document.getElementById('xp-item-qty').value) || 1;
  const list = document.getElementById('xp-items-list');
  if (!sel || !list) return;
  if (!sel.value) return alert('Selecione um item para adicionar');
  const id = sel.value;
  const text = sel.options[sel.selectedIndex].text;
  const div = document.createElement('div');
  div.setAttribute('data-item-id', id);
  div.setAttribute('data-qty', qty);
  div.style.padding = '6px';
  div.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
  div.textContent = `${text} x${qty}`;
  list.appendChild(div);
};

window.removerItemDoFormXP = function() {
  const sel = document.getElementById('xp-item-remove-select');
  const qty = parseInt(document.getElementById('xp-item-remove-qty').value) || 1;
  const list = document.getElementById('xp-items-remove-list');
  if (!sel || !list) return;
  if (!sel.value) return alert('Selecione um item para remover');
  const id = sel.value;
  const text = sel.options[sel.selectedIndex].text;
  const div = document.createElement('div');
  div.setAttribute('data-item-remove-id', id);
  div.setAttribute('data-qty', qty);
  div.style.padding = '6px';
  div.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
  div.textContent = `${text} x${qty}`;
  list.appendChild(div);
};


/* =========================================================
   MOSTRA MENSAGEM DE SUCESSO
========================================================= */
function showXPSuccess(message) {
  const messageEl = document.getElementById("xp-message");
  const errorEl = document.getElementById("xp-error");

  errorEl.classList.remove("show");
  messageEl.textContent = message;
  messageEl.classList.add("show");

  setTimeout(() => {
    messageEl.classList.remove("show");
  }, 4000);
}

/* =========================================================
   MOSTRA MENSAGEM DE ERRO
========================================================= */
function showXPError(message) {
  const errorEl = document.getElementById("xp-error");
  const messageEl = document.getElementById("xp-message");

  messageEl.classList.remove("show");
  errorEl.textContent = message;
  errorEl.classList.add("show");

  setTimeout(() => {
    errorEl.classList.remove("show");
  }, 4000);
}

/* =========================================================
   CARREGA HISTÓRICO DE XP
========================================================= */
async function loadXPLogs() {
  try {
    console.log("🔄 Carregando histórico de XP...");
    const logsRef = collection(db, "xp_logs");
    const logsQuery = query(logsRef, orderBy("dateAdded", "desc"));
    const snap = await getDocs(logsQuery);

    xpLogs = [];
    snap.forEach(docSnap => {
      xpLogs.push(docSnap.data());
    });

    renderLogs(); // render all combined logs
    console.log(`✅ ${xpLogs.length} registros de XP carregados`);
  } catch (error) {
    console.error("❌ Erro ao carregar histórico:", error);
    
    const container = document.getElementById("logs-container");
    if (container) {
      container.innerHTML = `
        <div style="
          background: rgba(200, 0, 0, 0.2);
          border: 1px solid #f66;
          color: #f88;
          padding: 20px;
          border-radius: 8px;
        ">⚠️ Erro ao carregar histórico: ${error.message}</div>
      `;
    }
  }
}

/* =========================================================
   RENDERIZA HISTÓRICO DE XP
========================================================= */
function renderXPLogs() {
  const container = document.getElementById("logs-container");
  if (!container) return;

  if (xpLogs.length === 0) {
    container.innerHTML = "<p style='color: #888;'>Nenhum registro ainda.</p>";
    return;
  }

  let html = "<table style='width: 100%; border-collapse: collapse; color: #eee;'>";
  html += `
    <thead>
      <tr style="background: rgba(74, 170, 255, 0.1); border-bottom: 2px solid #4af;">
        <th style="padding: 12px; text-align: left; color: #4af;">Jogador</th>
        <th style="padding: 12px; text-align: center; color: #4af;">XP</th>
        <th style="padding: 12px; text-align: left; color: #4af;">Comentário / Itens</th>
        <th style="padding: 12px; text-align: left; color: #4af;">Admin</th>
        <th style="padding: 12px; text-align: left; color: #4af;">Data</th>
      </tr>
    </thead>
    <tbody>
  `;

  xpLogs.slice(0, 50).forEach(log => {
    const date = new Date(log.dateAdded?.toDate?.() || log.dateAdded);
    const dateStr = date.toLocaleString("pt-BR");
    const adminNick = log.adminNick || "Admin";

    // build comment + itens summary
    let commentText = log.comment || "";
    const parts = [];
    if (log.itemsAdded && log.itemsAdded.length > 0) {
      parts.push('📦 +' + log.itemsAdded.map(i => `${i.itemId}${i.quantidade ? ' x' + i.quantidade : ''}`).join(', '));
    }
    if (log.itemsRemoved && log.itemsRemoved.length > 0) {
      parts.push('❌ ' + log.itemsRemoved.map(i => `${i.itemId}${i.quantidade ? ' x' + i.quantidade : ''}`).join(', '));
    }
    if (parts.length) {
      commentText += (commentText ? '<br>' : '') + parts.join(' | ');
    }

    html += `
      <tr style="border-bottom: 1px solid rgba(74, 170, 255, 0.1);">
        <td style="padding: 12px;">${log.playerNick} - ${log.playerClan}</td>
        <td style="padding: 12px; text-align: center; color: #0f8;">+${log.xpAmount || log.xpAdded || 0}</td>
        <td style="padding: 12px; font-size: 0.9rem; color: #aaa;">${commentText}</td>
        <td style="padding: 12px; font-size: 0.9rem; color: #4af;">${adminNick}</td>
        <td style="padding: 12px; font-size: 0.9rem; color: #888;">${dateStr}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

/* =========================================================
   RENDERIZA HISTÓRICO COMBINADO (XP + Skills + Invocações + Regiões)
========================================================= */
async function renderLogs() {
  const container = document.getElementById("logs-container");
  if (!container) return;

  try {
    // Carrega skill_logs (skills, invocações, regiões, classificações)
    const skillLogsQuery = query(collection(db, "skill_logs"), orderBy("date", "desc"));
    const skillLogSnap = await getDocs(skillLogsQuery);
    const skillLogs = [];
    skillLogSnap.forEach(docSnap => skillLogs.push(docSnap.data()));

    // Carrega loja_logs (itens criados/alterados) para exibir no histórico
    const lojaLogsQuery = query(collection(db, "loja_logs"), orderBy("date", "desc"));
    const lojaLogSnap = await getDocs(lojaLogsQuery);
    const lojaLogs = [];
    lojaLogSnap.forEach(docSnap => lojaLogs.push(docSnap.data()));

    // Carrega market_logs (transações entre jogadores)
    const marketLogsQuery = query(collection(db, "market_logs"), orderBy("date", "desc"));
    const marketLogSnap = await getDocs(marketLogsQuery);
    const marketLogs = [];
    marketLogSnap.forEach(docSnap => marketLogs.push(docSnap.data()));

    // Combina XP logs com skill logs, loja logs e market logs, ordena por data
    const allLogs = [
      ...xpLogs.map(l => ({ type: 'xp', ...l })),
      ...skillLogs.map(l => ({ type: l.type || 'skill', ...l })),
      ...lojaLogs.map(l => ({ type: l.type || 'item', ...l })),
      ...marketLogs.map(l => ({ type: 'market', ...l }))
    ].sort((a, b) => {
      const dateA = (a.date || a.dateAdded)?.toDate?.() || new Date(a.date || a.dateAdded);
      const dateB = (b.date || b.dateAdded)?.toDate?.() || new Date(b.date || b.dateAdded);
      return dateB - dateA;
    });

    if (allLogs.length === 0) {
      container.innerHTML = "<p style='color: #888;'>Nenhum registro ainda.</p>";
      return;
    }

    let html = "<div style='display: flex; flex-direction: column; gap: 12px;'>";

    allLogs.slice(0, 100).forEach(log => {
      const dateObj = (log.date || log.dateAdded)?.toDate?.() || new Date(log.date || log.dateAdded);
      const dateStr = dateObj.toLocaleString("pt-BR");
      const adminNick = log.adminNick || log.adminId || "Admin?";

      if (log.type === 'xp') {
        // XP Log - com detalhes de Ryous e invocação
        const xpAmount = log.xpAmount || 0;
        const playerName = log.playerNick || log.playerId || "Jogador?";
        const comment = log.xpComment || "(sem comentário)";
        const ryous = log.ryous || 0;
        
        // Formata invocações usadas
        let invocationsDisplay = '';
        if (log.usedInvocation && log.invocationsUsed && log.invocationsUsed.length > 0) {
          const xpPerInv = Math.ceil((xpAmount * 0.5) / log.invocationsUsed.length);
          invocationsDisplay = `✓ ${log.invocationsUsed.join(', ')} (${xpPerInv} XP cada)`;
        } else {
          invocationsDisplay = '✗ Nenhuma';
        }

        // Formata mudanças de inventário se houver
        let itemsDisplay = '';
        if (log.itemsAdded && log.itemsAdded.length > 0) {
          itemsDisplay += '📦 +' + log.itemsAdded.map(i => `${i.itemId}${i.quantidade ? ' x' + i.quantidade : ''}`).join(', ');
        }
        if (log.itemsRemoved && log.itemsRemoved.length > 0) {
          if (itemsDisplay) itemsDisplay += ' | ';
          itemsDisplay += '❌ ' + log.itemsRemoved.map(i => `${i.itemId}${i.quantidade ? ' x' + i.quantidade : ''}`).join(', ');
        }

        html += `
          <div style="background: rgba(0,200,100,0.1); border-left: 4px solid #0c8; padding: 12px; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div style="flex: 1;">
                <div style="color: #0f8; font-weight: bold; font-size: 0.95rem;">+${xpAmount} XP → ${playerName}</div>
                <div style="color: #ccc; font-size: 0.85rem; margin-top: 4px;">
                  💰 Ryous: ${ryous > 0 ? '+' + ryous : '0'} | 🐉 Invocação: ${invocationsDisplay}
                </div>
                ${itemsDisplay ? `<div style="color: #ccc; font-size: 0.85rem; margin-top: 4px;">${itemsDisplay}</div>` : ''}
                <div style="color: #aaa; font-size: 0.85rem; margin-top: 6px; line-height: 1.4;">
                  💬 <em>"${comment}"</em>
                </div>
              </div>
              <div style="text-align: right; color: #888; font-size: 0.8rem; white-space: nowrap; margin-left: 12px;">
                <div>👤 ${adminNick}</div>
                <div>${dateStr}</div>
              </div>
            </div>
          </div>
        `;
      } else if (log.type === 'skill') {
        // Skill Create/Edit - com detalhes da ação
        const action = log.action === 'create' ? 'Criada' : 'Atualizada';
        const skillName = log.itemName || log.skillName || 'Skill?';
        let details = '';
        
        if (log.action === 'create') {
          details = `✨ Nova habilidade: <strong>${skillName}</strong>`;
        } else if (log.action === 'update') {
          // Mostrar mudanças de forma legível
          const changes = log.changes || {};
          const changeSummary = log.changeSummary || {};
          const fieldList = Object.keys(changes).map(f => {
            if (f === 'name') return '📛 Nome';
            if (f === 'desc') return '📝 Descrição';
            if (f === 'requires') return '🔗 Requisitos';
            return f;
          }).join(' • ');
          
          details = `Alterou <strong>${skillName}</strong>: ${fieldList}`;
          
          // Se tiver sumário de mudanças, mostrar
          if (Object.keys(changeSummary).length > 0) {
            details += '<div style="color: #aaa; font-size: 0.85rem; margin-top: 6px; line-height: 1.5; font-family: monospace;">';
            Object.entries(changeSummary).forEach(([field, change]) => {
              details += `<div>• ${field}: ${change}</div>`;
            });
            details += '</div>';
          }
        } else {
          details = `📝 <strong>${skillName}</strong> modificada`;
        }
        
        html += `
          <div style="background: rgba(74,170,255,0.08); border-left: 4px solid #4af; padding: 12px; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div style="flex: 1;">
                <div style="color: #4af; font-weight: bold; font-size: 0.95rem;">Habilidade ${action}</div>
                <div style="color: #ddd; font-size: 0.9rem; margin-top: 4px;">${details}</div>
              </div>
              <div style="text-align: right; color: #888; font-size: 0.8rem; white-space: nowrap; margin-left: 12px;">
                <div>👤 ${adminNick}</div>
                <div>${dateStr}</div>
              </div>
            </div>
          </div>
        `;
      } else if (log.type === 'invocation') {
        // Invocation Create/Edit
        const action = log.action === 'create' ? 'Criada' : 'Editada';
        const invName = log.itemName || log.itemId || 'Invocação?';
        const details = log.action === 'create' ? `🐉 Nova invocação: <strong>${invName}</strong>` : `📝 Invocação <strong>${invName}</strong> modificada`;
        html += `
          <div style="background: rgba(255,100,200,0.08); border-left: 4px solid #f8a; padding: 12px; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div style="flex: 1;">
                <div style="color: #f8a; font-weight: bold; font-size: 0.95rem;">Invocação ${action}</div>
                <div style="color: #ddd; font-size: 0.9rem; margin-top: 4px;">${details}</div>
              </div>
              <div style="text-align: right; color: #888; font-size: 0.8rem; white-space: nowrap; margin-left: 12px;">
                <div>👤 ${adminNick}</div>
                <div>${dateStr}</div>
              </div>
            </div>
          </div>
        `;
        } else if (log.type === 'item' || log.type === 'loja' || log.type === 'market') {
          let details = '';
          let title = '';

          if (log.type === 'market') {
            // venda entre jogadores
            const seller = log.sellerNick || log.sellerId || 'Vendedor?';
            const buyer = log.buyerNick || log.buyerId || 'Comprador?';
            const price = log.price || 0;
            const marketPrice = log.marketPrice || 0;
            details = `🛒 <strong>${log.itemName}</strong> vendido por ${price}Ry (mercado ${marketPrice}Ry) de ${seller} ➜ ${buyer}`;
            title = 'Venda P2P';
          } else {
            // Loja item create/edit
            const action = log.action === 'create' ? 'Criado' : (log.action === 'edit' ? 'Atualizado' : 'Modificado');
            const itemName = log.itemName || (log.newData && log.newData.nome) || 'Item?';
            title = `Item ${action}`;
            if (log.action === 'create') {
              const price = log.newData?.preco ?? log.price ?? '';
              const tipo = log.newData?.type ?? log.type ?? '';
              details = `🛒 <strong>${itemName}</strong> criado — Preço: ${price} • Tipo: ${tipo}`;
            } else if (log.action === 'edit') {
              const oldD = log.oldData || {};
              const newD = log.newData || {};
              const changed = Object.keys(newD).filter(k => JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]));
              if (changed.length === 0) changed.push(' (sem mudanças detectadas)');
              details = `✏️ <strong>${itemName}</strong> atualizado — Campos: ${changed.join(', ')}`;
            } else {
              details = `📝 Ação: ${log.action || 'unknown'} em <strong>${itemName}</strong>`;
            }
          }

          html += `
            <div style="background: rgba(200,150,50,0.06); border-left: 4px solid #fa8; padding: 12px; border-radius: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                  <div style="color: #fa8; font-weight: bold; font-size: 0.95rem;">${title}</div>
                  <div style="color: #ddd; font-size: 0.9rem; margin-top: 4px;">${details}</div>
                  <div style="color: #aaa; font-size: 0.85rem; margin-top: 6px; line-height: 1.4;">${log.note || ''}</div>
                </div>
                <div style="text-align: right; color: #888; font-size: 0.8rem; white-space: nowrap; margin-left: 12px;">
                  <div>👤 ${adminNick}</div>
                  <div>${dateStr}</div>
                </div>
              </div>
            </div>
          `;
        } else if (log.type === 'regions') {
        // Regions Save - com detalhes de quantas regiões/famílias/rankings
        const regionsData = log.newData || {};
        const regionCount = Object.keys(regionsData).length;
        let familyCount = 0;
        Object.values(regionsData).forEach(r => {
          familyCount += Object.keys((r.families || {})).length;
        });
        html += `
          <div style="background: rgba(255,180,0,0.08); border-left: 4px solid #fa8; padding: 12px; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div style="flex: 1;">
                <div style="color: #fa8; font-weight: bold; font-size: 0.95rem;">Regiões Salvas</div>
                <div style="color: #ddd; font-size: 0.9rem; margin-top: 4px;">
                  🗺️ ${regionCount} região(ões) • 👨‍👩‍👧‍👦 ${familyCount} família(s)
                </div>
              </div>
              <div style="text-align: right; color: #888; font-size: 0.8rem; white-space: nowrap; margin-left: 12px;">
                <div>👤 ${adminNick}</div>
                <div>${dateStr}</div>
              </div>
            </div>
          </div>
        `;
      } else if (log.type === 'classifications') {
        // Classifications Save
        const classData = log.newData || [];
        const classCount = classData.length;
        const classList = classData.slice(0, 3).map(c => c.name || c).join(', ');
        html += `
          <div style="background: rgba(150,100,255,0.08); border-left: 4px solid #a8f; padding: 12px; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div style="flex: 1;">
                <div style="color: #a8f; font-weight: bold; font-size: 0.95rem;">Classificações Salvas</div>
                <div style="color: #ddd; font-size: 0.9rem; margin-top: 4px;">
                  📂 ${classCount} classificação(ões): <em>${classList}${classCount > 3 ? '...' : ''}</em>
                </div>
              </div>
              <div style="text-align: right; color: #888; font-size: 0.8rem; white-space: nowrap; margin-left: 12px;">
                <div>👤 ${adminNick}</div>
                <div>${dateStr}</div>
              </div>
            </div>
          </div>
        `;
      }
    });

    html += "</div>";
    container.innerHTML = html;
  } catch (err) {
    console.error("Erro ao renderizar logs:", err);
    container.innerHTML = `<div style="color: #f88;">Erro ao carregar logs: ${err.message}</div>`;
  }
}

/* =========================================================
   INVOCAÇÕES DO JOGADOR - ABA
========================================================= */
function setupInvocacoesJogadorTab() {
  const select = document.getElementById("inv-jogador-select");
  if (!select) return;
  
  select.innerHTML = `<option value="">-- Selecione um jogador --</option>`;
  players.forEach(player => {
    const opt = document.createElement("option");
    opt.value = player.id;
    opt.textContent = `${player.nick || "Desconhecido"} - ${player.cla || "Sem clã"}`;
    select.appendChild(opt);
  });
  
  select.addEventListener("change", async (e) => {
    const playerId = e.target.value;
    if (playerId) {
      await renderInvocacoesJogador(playerId);
    } else {
      document.getElementById("inv-jogador-list").innerHTML = "";
    }
  });
}

async function renderInvocacoesJogador(playerId) {
  try {
    const playerRef = doc(db, "fichas", playerId);
    const playerSnap = await getDoc(playerRef);
    
    if (!playerSnap.exists()) {
      document.getElementById("inv-jogador-list").innerHTML = `<p style="color: #f88;">Jogador não encontrado</p>`;
      return;
    }
    
    const playerData = playerSnap.data();
    const familiaInvocacao = playerData.Familia_Invocação || {};
    
    if (Object.keys(familiaInvocacao).length === 0) {
      document.getElementById("inv-jogador-list").innerHTML = `<p style="color: #888;">Este jogador não possui invocações.</p>`;
      return;
    }
    
    let html = `<div style="display: flex; flex-direction: column; gap: 16px;">`;
    Object.entries(familiaInvocacao).forEach(([familia, animais]) => {
      html += `<div style="background: rgba(74, 170, 255, 0.05); border: 1px solid rgba(74, 170, 255, 0.2); border-radius: 6px; padding: 12px;">`;
      html += `<div style="color: #4af; font-weight: bold; margin-bottom: 8px;">🐾 ${familia}</div>`;
      
      if (Array.isArray(animais) && animais.length > 0) {
        html += `<div style="display: flex; flex-wrap: wrap; gap: 8px;">`;
        animais.forEach(animal => {
          const afinidade = animal.afinidade || 0;
          html += `<div style="background: rgba(255, 150, 0, 0.1); border: 1px solid #f80; border-radius: 4px; padding: 6px 12px; font-size: 0.9rem;">
            <span style="color: #ff8; font-weight: bold;">${animal.name}</span> 
            <span style="color: #faa;">Afinidade: ${afinidade}</span>
          </div>`;
        });
        html += `</div>`;
      } else {
        html += `<p style="color: #888; font-size: 0.9rem; margin: 0;">(nenhum animal)</p>`;
      }
      
      html += `</div>`;
    });
    html += `</div>`;
    
    document.getElementById("inv-jogador-list").innerHTML = html;
  } catch (err) {
    console.error("Erro ao renderizar invocações do jogador:", err);
    document.getElementById("inv-jogador-list").innerHTML = `<p style="color: #f88;">Erro ao carregar invocações: ${err.message}</p>`;
  }
}

/* =========================================================
   SKILLS DO JOGADOR - ABA
========================================================= */
function setupSkillsJogadorTab() {
  const select = document.getElementById("skills-jogador-select");
  if (!select) return;
  
  select.innerHTML = `<option value="">-- Selecione um jogador --</option>`;
  players.forEach(player => {
    const opt = document.createElement("option");
    opt.value = player.id;
    opt.textContent = `${player.nick || "Desconhecido"} - ${player.cla || "Sem clã"}`;
    select.appendChild(opt);
  });
  
  select.addEventListener("change", async (e) => {
    const playerId = e.target.value;
    if (playerId) {
      await renderSkillsJogador(playerId);
    } else {
      document.getElementById("skills-jogador-list").innerHTML = "";
    }
  });
}

// Função para migrar skills de formato legado (número) para objeto estruturado
async function migrateSkillsIfNeeded(playerId, playerSkills) {
  let needsUpdate = false;
  const migratedSkills = {};

  Object.entries(playerSkills).forEach(([skillId, skillData]) => {
    if (typeof skillData === 'number' || typeof skillData === 'string') {
      // Formato legado: salvo como número ou string simples
      // Converter para objeto estruturado
      const levelValue = parseInt(skillData) || 0;
      const skillDef = skillsList.find(s => s.id === skillId || s.name === skillId);
      
      migratedSkills[skillId] = {
        level: levelValue,
        max: skillDef?.max || 5,
        name: skillDef?.name || skillId
      };
      needsUpdate = true;
      console.log(`🔄 Migrado ${skillId}: ${skillData} → `, migratedSkills[skillId]);
    } else {
      // Já em formato correto
      migratedSkills[skillId] = skillData;
    }
  });

  // Se houve mudanças, salvar de volta no Firestore
  if (needsUpdate) {
    try {
      console.log('💾 Salvando skills migrados ao Firestore...');
      const fichRef = doc(db, 'fichas', playerId);
      await updateDoc(fichRef, { skills: migratedSkills });
      console.log('✅ Skills migrados com sucesso!');
    } catch (err) {
      console.error('⚠️ Erro ao salvar skills migrados:', err);
    }
  }

  return migratedSkills;
}

async function renderSkillsJogador(playerId) {
  try {
    const playerRef = doc(db, "fichas", playerId);
    const playerSnap = await getDoc(playerRef);
    
    if (!playerSnap.exists()) {
      document.getElementById("skills-jogador-list").innerHTML = `<p style="color: #f88;">Jogador não encontrado</p>`;
      return;
    }
    
    const playerData = playerSnap.data();
    let playerSkills = playerData.skills || {};
    
    console.log('📊 Skills do jogador (antes migração):', playerSkills);
    
    // Migrar skills legados se necessário
    playerSkills = await migrateSkillsIfNeeded(playerId, playerSkills);
    
    console.log('📊 Skills do jogador (após migração):', playerSkills);
    
    if (Object.keys(playerSkills).length === 0) {
      document.getElementById("skills-jogador-list").innerHTML = `<p style="color: #888;">Este jogador não possui skills.</p>`;
      return;
    }
    
    let html = `<div style="display: flex; flex-direction: column; gap: 10px;">`;
    Object.entries(playerSkills).forEach(([skillId, skillData]) => {
      console.log(`  Skill [${skillId}]:`, skillData);
      console.log(`    Type: ${typeof skillData}, Keys: ${Object.keys(skillData || {}).join(', ')}`);
      
      // Be tolerant to different field names across versions
      const rawLevel = skillData?.level ?? skillData?.lvl ?? skillData?.value ?? skillData?.points;
      const rawMax = skillData?.max ?? skillData?.maxLevel ?? skillData?.limit;
      
      console.log(`    Raw level field: ${rawLevel}, Raw max field: ${rawMax}`);
      
      const level = (rawLevel !== undefined && rawLevel !== null) ? rawLevel : 0;
      const maxLevel = (rawMax !== undefined && rawMax !== null) ? rawMax : 5;
      
      console.log(`    ✓ Final level=${level}, max=${maxLevel}`);
      const progress = Math.round((Math.max(level, 0) / (maxLevel || 1)) * 100);
      
      // Busca o nome da skill no skillsList se não tiver no skillData
      let skillName = (skillData && (skillData.name || skillData.title)) || null;
      if (!skillName) {
        const skillDef = skillsList.find(s => s.id === skillId || s.name === skillId);
        skillName = skillDef ? (skillDef.name || skillDef.title || skillId) : skillId;
      }
      
      html += `
        <div style="background: rgba(74, 170, 255, 0.1); border: 1px solid #4af; border-radius: 6px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="color: #4af; font-weight: bold; font-size: 0.95rem;">⭐ ${skillName}</div>
            <div style="color: #aaa; font-size: 0.85rem; font-weight: bold;"><span style="color: #0f8;">${level}</span>/${maxLevel}</div>
          </div>
          <div style="background: rgba(0, 0, 0, 0.3); border-radius: 4px; height: 6px; overflow: hidden;">
            <div style="background: linear-gradient(to right, #4af, #0f8); height: 100%; width: ${progress}%;"></div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    
    console.log('✅ HTML renderizado com', Object.keys(playerSkills).length, 'skills');
    document.getElementById("skills-jogador-list").innerHTML = html;
  } catch (err) {
    console.error("Erro ao renderizar skills do jogador:", err);
    document.getElementById("skills-jogador-list").innerHTML = `<p style="color: #f88;">Erro ao carregar skills: ${err.message}</p>`;
  }
}

/* =========================================================
   NAVEGAÇÃO — BOTÕES DE HEADER
========================================================= */
document.getElementById("btnPerfil")?.addEventListener("click", () => {
  window.location.href = "perfil.html";
});

document.getElementById("btnLoja")?.addEventListener("click", () => {
  window.location.href = "loja.html";
});

document.getElementById("btnInvocacoes")?.addEventListener("click", () => {
  window.location.href = "invocacoes.html";
});

document.getElementById("btnHabilidades")?.addEventListener("click", () => {
  window.location.href = "arvore_habilidade.html";
});
/* =========================================================
   LOJA - CRIAR / EDITAR ITEMS
========================================================= */

let lojaItens = [];
let itemLojaEditar = null;

// Carregar items da loja quando carrega a página
async function carregarItensLoja() {
  try {
    const lojaRef = doc(db, "game_data", "loja_v1");
    const lojaSnap = await getDoc(lojaRef);
    if (lojaSnap.exists()) {
      const data = lojaSnap.data();
      let raw = data.itens;
      if (Array.isArray(raw)) {
        lojaItens = raw;
      } else if (raw && typeof raw === 'object') {
        // legacy format may have been an object/map instead of array
        lojaItens = Object.values(raw);
        console.warn('⚠️ itens da loja eram um objeto; convertendo para array', raw);
      } else {
        lojaItens = [];
      }
      console.log('✅ Itens carregados do Firestore:', lojaItens.length, lojaItens);
    } else {
      lojaItens = [];
      console.log('⚠️ Documento loja_v1 não existe');
    }
  } catch (err) {
    console.error("Erro ao carregar itens da loja:", err);
    // se falhar, mantemos variável anterior para evitar sobrescrever com vazio
  }
}

// Renderizar lista de items para editar
async function renderizarItensLoja() {
  const container = document.getElementById("item-loja-list");
  if (!container) return;

  console.log('🔁 renderizarItensLoja chamado');
  await carregarItensLoja();
  console.log('🔁 após carregarItensLoja, lojaItens.length =', lojaItens.length);

  if (lojaItens.length === 0) {
    container.innerHTML = '<p style="color: #888;">Nenhum item cadastrado ainda.</p>';
    return;
  }

  container.innerHTML = '';
  lojaItens.forEach((item, idx) => {
    // Cria o bloco do item
    const itemBlock = document.createElement('div');
    itemBlock.className = 'item-block-admin';
    itemBlock.style.background = 'rgba(74, 170, 255, 0.1)';
    itemBlock.style.padding = '12px';
    itemBlock.style.marginBottom = '10px';
    itemBlock.style.borderRadius = '6px';
    itemBlock.style.borderLeft = '3px solid #4af';
    itemBlock.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: #4af;">${item.nome}</strong>
          <div style="font-size: 12px; color: #aaa; margin-top: 4px;">
            💰 ${item.preco} Ryous | 📍 ${item.regiao || 'Geral'} | 🏷️ ${item.type || '—'}
          </div>
          <div style="font-size: 12px; color: #aaa; margin-top: 2px;">
            ${item.descricao || '(sem descrição)'}
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-editar-item-loja" data-idx="${idx}" style="padding: 6px 12px; background: #4af; border: none; border-radius: 4px; color: #000; font-weight: bold; cursor: pointer;">✏️ Editar</button>
          <button onclick="deletarItemLoja(${idx})" style="padding: 6px 12px; background: #ff6b6b; border: none; border-radius: 4px; color: #fff; font-weight: bold; cursor: pointer;">🗑️ Deletar</button>
        </div>
      </div>
    `;
    
    container.appendChild(itemBlock);
  });
  // Adiciona listeners para os botões de editar
  container.querySelectorAll('.btn-editar-item-loja').forEach(btn => {
    btn.addEventListener('click', function() {
      const idx = parseInt(this.getAttribute('data-idx'));
      // O bloco do item é o parentNode do botão
      abrirEditarItemLoja(idx, this.closest('.item-block-admin'));
    });
  });
}

// Abrir edição de item
window.abrirEditarItemLoja = function(idx, afterElem) {
  console.log('abrirEditarItemLoja called', { idx, afterElem });
  // Remove editor antigo
  const existingEditor = document.getElementById("item-loja-editor");
  if (existingEditor) existingEditor.remove();
  itemLojaEditar = idx;
  const item = lojaItens[idx];
  console.log('item for edit:', item);
  if (!item) {
    console.error('Item para editar não encontrado (índice):', idx);
    alert('Erro: item não encontrado para edição');
    return;
  }
  const editor = document.createElement("div");
  editor.id = "item-loja-editor";
  editor.style.cssText = "background: rgba(10, 20, 50, 0.9); border: 2px solid #4af; border-radius: 8px; padding: 20px; margin-top: 10px; margin-bottom: 10px;";
  editor.innerHTML = `
    <div style="color: #4af; font-weight: bold; margin-bottom: 15px;">Editando: ${item.nome}</div>
    <div class="form-group">
      <label for="edit-item-nome">Nome *</label>
      <input type="text" id="edit-item-nome" value="${item.nome}" required>
    </div>
    <div class="form-group">
      <label for="edit-item-descricao">Descrição</label>
      <textarea id="edit-item-descricao" rows="3">${item.descricao || ''}</textarea>
    </div>
    <div class="form-group">
      <label for="edit-item-icone">URL do Ícone</label>
      <input type="url" id="edit-item-icone" value="${item.icone || ''}">
    </div>
    <div class="form-group">
      <label for="edit-item-preco">Preço (Ryous) *</label>
      <input type="number" id="edit-item-preco" min="1" value="${item.preco}" required>
    </div>
    <div class="form-group">
      <label for="edit-item-type">Tipo/Categoria</label>
      <select id="edit-item-type" required>
        <option value="">Selecione o tipo</option>
        <option value="Caça" ${item.type === 'Caça' ? 'selected' : ''}>Caça</option>
        <option value="Recursos" ${item.type === 'Recursos' ? 'selected' : ''}>Recursos</option>
        <option value="Bento" ${item.type === 'Bento' ? 'selected' : ''}>Bento</option>
        <option value="Poção" ${item.type === 'Poção' ? 'selected' : ''}>Poção</option>
        <option value="Armas" ${item.type === 'Armas' ? 'selected' : ''}>Armas</option>
        <option value="Armaduras" ${item.type === 'Armaduras' ? 'selected' : ''}>Armaduras</option>
        <option value="Pergaminhos" ${item.type === 'Pergaminhos' ? 'selected' : ''}>Pergaminhos</option>
      </select>
    </div>
    <div class="form-group">
      <label for="edit-item-regiao">Região</label>
      <select id="edit-item-regiao">
        <option value="Geral" ${item.regiao === 'Geral' ? 'selected' : ''}>Geral</option>
        <option value="Fogo" ${item.regiao === 'Fogo' ? 'selected' : ''}>Fogo</option>
        <option value="Água" ${item.regiao === 'Água' ? 'selected' : ''}>Água</option>
        <option value="Vento" ${item.regiao === 'Vento' ? 'selected' : ''}>Vento</option>
        <option value="Terra" ${item.regiao === 'Terra' ? 'selected' : ''}>Terra</option>
        <option value="Raio" ${item.regiao === 'Raio' ? 'selected' : ''}>Raio</option>
      </select>
    </div>
    <div style="display: flex; gap: 10px; margin-top: 15px;">
      <button type="button" onclick="salvarEdicaoItemLoja()" style="flex: 1; padding: 10px; background: #0f8; border: none; border-radius: 4px; color: #000; font-weight: bold; cursor: pointer;">✓ Salvar</button>
      <button type="button" onclick="fecharEditorItemLoja()" style="flex: 1; padding: 10px; background: #666; border: none; border-radius: 4px; color: #fff; font-weight: bold; cursor: pointer;">✕ Cancelar</button>
    </div>
  `;
  // Insere o editor logo após o item clicado
  if (afterElem && afterElem.parentNode) {
    console.log('Inserindo editor após afterElem', { afterElem, afterElemParent: afterElem.parentNode, nextSibling: afterElem.nextSibling });
    afterElem.parentNode.insertBefore(editor, afterElem.nextSibling);
  } else {
    console.log('Inserindo editor no container');
    document.getElementById("item-loja-list").appendChild(editor);
  }
  console.log('Editor inserido no DOM:', { editor, visible: editor.offsetHeight > 0 });
};

// Salvar edição de item
window.salvarEdicaoItemLoja = async function() {
  const nome = document.getElementById("edit-item-nome").value.trim();
  const descricao = document.getElementById("edit-item-descricao").value.trim();
  const icone = document.getElementById("edit-item-icone").value.trim();
  const preco = Number(document.getElementById("edit-item-preco").value);
  const regiao = document.getElementById("edit-item-regiao").value;
  const type = document.getElementById("edit-item-type").value;

  if (!nome || preco <= 0 || !type) {
    alert("❌ Nome, preço e tipo são obrigatórios!");
    return;
  }

  const oldItem = { ...lojaItens[itemLojaEditar] };
  lojaItens[itemLojaEditar] = { id: lojaItens[itemLojaEditar].id, nome, descricao, icone, preco, regiao, type };

  try {
    await updateDoc(doc(db, "game_data", "loja_v1"), { itens: lojaItens });
    // Registrar log de edição
    try {
      await addDoc(collection(db, 'loja_logs'), {
        type: 'item', action: 'edit',
        itemId: lojaItens[itemLojaEditar].id,
        itemName: nome,
        adminId: currentUID,
        adminNick: currentAdminNick,
        oldData: oldItem,
        newData: lojaItens[itemLojaEditar],
        date: new Date()
      });
    } catch (logErr) {
      console.error('❌ Falha ao registrar log de edição de item:', logErr);
    }
    alert("✅ Item atualizado com sucesso!");
    fecharEditorItemLoja();
    renderizarItensLoja();
  } catch (err) {
    console.error("Erro ao salvar:", err);
    alert("❌ Erro ao salvar!");
  }
};

// Fechar editor
window.fecharEditorItemLoja = function() {
  const editor = document.getElementById("item-loja-editor");
  if (editor) editor.remove();
  itemLojaEditar = null;
};

// Deletar item
window.deletarItemLoja = async function(idx) {
  if (!confirm("Tem certeza que quer deletar este item?")) return;

  lojaItens.splice(idx, 1);

  try {
    await updateDoc(doc(db, "game_data", "loja_v1"), { itens: lojaItens });
    alert("✅ Item deletado com sucesso!");
    renderizarItensLoja();
  } catch (err) {
    console.error("Erro ao deletar:", err);
    alert("❌ Erro ao deletar!");
  }
};

// Formulário para criar novo item
const createItemForm = document.getElementById("create-item-loja-form");
if (createItemForm) {
  createItemForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // ensure we have the latest list before mutating; avoids wiping older items
    await carregarItensLoja();

    const nome = document.getElementById("item-nome").value.trim();
    const descricao = document.getElementById("item-descricao").value.trim();
    const icone = document.getElementById("item-icone").value.trim();
    const preco = Number(document.getElementById("item-preco").value);
    const regiao = document.getElementById("item-regiao").value;
    const type = document.getElementById("item-type").value;

    if (!nome || preco <= 0 || !type) {
      alert("❌ Nome, preço e tipo são obrigatórios!");
      return;
    }

    try {
      const newItem = {
        id: Date.now().toString(), // ID único baseado em timestamp
        nome,
        descricao,
        icone,
        preco,
        regiao,
        type,
        criadoEm: new Date()
      };

      lojaItens.push(newItem);

      // Criar ou atualizar documento loja_v1
      const lojaRef = doc(db, "game_data", "loja_v1");
      await setDoc(lojaRef, { itens: lojaItens }, { merge: true });

      // Registrar log de criação
      try {
        await addDoc(collection(db, 'loja_logs'), {
          type: 'item', action: 'create',
          itemId: newItem.id,
          itemName: nome,
          adminId: currentUID,
          adminNick: currentAdminNick,
          newData: newItem,
          date: new Date()
        });
      } catch (logErr) {
        console.error('❌ Falha ao registrar log de criação de item:', logErr);
      }

      // Feedback
      const msgEl = document.getElementById("item-create-message");
      msgEl.style.backgroundColor = "rgba(0, 255, 100, 0.2)";
      msgEl.style.borderLeft = "3px solid #0f8";
      msgEl.style.color = "#0f8";
      msgEl.textContent = "✅ Item criado com sucesso!";
      msgEl.style.display = "block";

      setTimeout(() => {
        msgEl.style.display = "none";
        createItemForm.reset();
      }, 3000);

      // Atualizar lista de edição
      renderizarItensLoja();
    } catch (err) {
      console.error("Erro ao criar item:", err);
      alert("❌ Erro ao criar item!");
    }
  });
}

// Inicializar funções relacionadas à loja imediatamente (script está no final do body)
// garantir que 
// 1. `lojaItens` esteja preenchido antes de qualquer criação ou edição
// 2. listener para a aba de editar seja sempre registrado
// Não confiamos mais em DOMContentLoaded porque o script é carregado após o evento.
{
  const editLojaTab = document.querySelector('[data-tab="edit-item-loja"]');
  if (editLojaTab) {
    editLojaTab.addEventListener('click', () => {
      renderizarItensLoja();
    });
  }
  // Carrega dados assim que possível para popular `lojaItens`.
  carregarItensLoja();
}