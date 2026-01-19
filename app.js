// app.js — versão com glow + árvore recursiva + imagens dinâmicas

import { auth, db } from "./oauth.js";
import {
  doc, getDoc, updateDoc,  collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUID = null;
let skillsState = {};
let userData = {};

// 📌 Enquanto não puxamos do Firestore
let skills = []

async function loadSkills() {
  const col = collection(db, "skill_tree");
  const snap = await getDocs(col);
  const loaded = snap.docs.map(d => d.data());

  loaded.forEach(s => {
    s.level    = skillsState[s.id] ?? 0;
    s.requires = s.requires ?? [];
    s.img      = s.img ?? "default";
    s.max      = s.max ?? 5;
  });

  return loaded;
}

// 🔥 Detect login
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUID = user.uid;
  const fichaRef = doc(db, "fichas", currentUID);
  const snap = await getDoc(fichaRef);
  userData = snap.data() ?? {};

  // Valores padrão
  userData.xp     ??= 0;
  userData.nivel  ??= 1;
  userData.pontos ??= 0;
  userData.skills ??= {};

  skillsState = { ...userData.skills };

  // ⬇️ AQUI: CARREGA SKILLS DO FIREBASE
  skills = await loadSkills();

  await checkLevelUp();
  render();
});


// 🔎 Pega nível do pai
function parentLevel(id) {
  const p = skills.find(s => s.id === id);
  return p ? p.level : 0;
}

// 🔳 Cartão com glow + tooltip + bloqueios
function makeCard(skill) {
  const el = document.createElement("div");
  el.className = "skill";

  // Estado inicial
  let unlocked = true;
  let missing = [];

  // Sempre garante array
  const reqs = Array.isArray(skill.requires) ? skill.requires : [];

  reqs.forEach(req => {
    const needId = req.id;
    const needLvl = req.level ?? req.lvl ?? 1;

    const reqSkill = skills.find(s => s.id === needId);
    const currentLvl = reqSkill?.level ?? 0;

    if (!reqSkill || currentLvl < needLvl) {
      unlocked = false;
      missing.push({ id: needId, current: currentLvl, need: needLvl });
    }
  });

  // Requisito por nível da conta
  if (skill.minAccountLevel) {
    const accLvl = userData.nivel ?? 0;
    if (accLvl < skill.minAccountLevel) {
      unlocked = false;
      missing.push({
        id: "Conta",
        current: accLvl,
        need: skill.minAccountLevel
      });
    }
  }

  // Normaliza ícone
  const iconName = skill.icon || "default";
  const iconIndex = Math.min(skill.level, skill.max);
  const currentIcon = unlocked
    ? `assets/icons/${iconName}_${iconIndex}.png`
    : `assets/icons/${iconName}_locked.png`;

  // Cores
  if (!unlocked) el.classList.add("blocked");
  else if (skill.level > 0) el.classList.add("active");

  /* =========================
     TOOLTIP (AJUSTADO)
  ========================= */

  let tooltipHTML = `
    <strong>${skill.name}</strong><br>
    <small>Nível: ${skill.level ?? 0} / ${skill.max}</small>
  `;

  if (skill.desc) {
    tooltipHTML += `<br><br>${skill.desc}`;
  }

  if (reqs.length || skill.minAccountLevel) {
    tooltipHTML += `<br><br><strong>Requisitos:</strong><br>`;

    reqs.forEach(req => {
      const reqSkill = skills.find(s => s.id === req.id);
      const atual = reqSkill?.level ?? 0;
      const necessario = req.level ?? req.lvl ?? 1;
      const ok = atual >= necessario ? "✔" : "❌";

      tooltipHTML += `• ${reqSkill?.name ?? req.id}: ${atual} / ${necessario} ${ok}<br>`;
    });

    if (skill.minAccountLevel) {
      const ok = userData.nivel >= skill.minAccountLevel ? "✔" : "❌";
      tooltipHTML += `• Conta: ${userData.nivel} / ${skill.minAccountLevel} ${ok}<br>`;
    }
  }

  // Render
  el.innerHTML = `
    <img src="${currentIcon}">
    <div class="tooltip">${tooltipHTML}</div>
  `;

  // Click para upar
  el.onclick = () => {
    if (!unlocked) return;
    levelUp(skill.id);
  };

  return el;
}



// 🌳 CRIA ÁRVORE RECURSIVA
function buildBranch(parent) {
  const branch = document.createElement("div");
  branch.className = "branch";

  branch.appendChild(makeCard(parent));
  const kids = skills.filter(s => s.parent === parent.id);

  if (kids.length) {
//if (kids.length && parent.level >= 1) {
    const bar = document.createElement("div");
    bar.className = "branch-line";
    branch.appendChild(bar);

    const row = document.createElement("div");
    row.className = "child-row";

    kids.forEach(ch => row.appendChild(buildBranch(ch)));
    branch.appendChild(row);
  }
  return branch;
}

// 🎨 Render HUD + árvore
function render() {
  document.getElementById("infoTopo").textContent =
    `${userData.nick ?? "Sem Nome"} | Clã: ${userData.cla ?? "Nenhum"}`;

  document.getElementById("points").textContent =
    `Pontos Disponíveis: ${userData.pontos}`;

  const xpNeeded = userData.nivel * 20;
  const pct = Math.min((userData.xp / xpNeeded) * 100, 100);

  document.getElementById("player-level").textContent =
    `Level: ${userData.nivel}`;
  document.getElementById("player-xp").textContent =
    `XP: ${userData.xp} / ${xpNeeded}`;
  document.getElementById("xp-bar").style.width = pct + "%";

  const chart = document.getElementById("org-chart");
  chart.innerHTML = "";

  const parents = skills.filter(s => !s.parent);
  const container = document.createElement("div");
  container.className = "directors";

  parents.forEach(p => container.appendChild(buildBranch(p)));
  chart.appendChild(container);
}

// 🌟 Gasta ponto e upa skill
async function levelUp(id) {
  const sk = skills.find(s => s.id === id);
  //if (!sk || userData.pontos <= 0 || sk.level >= sk.max) return;

  if (!sk) return;
 
  // nós que nunca recebem level
   if (sk.max === 0 || sk.type === "group") {
	  alert("❌ Você não pode investir pontos aqui!");
	  el.classList.add("groupnode");
	  return;
	}

  if (userData.pontos <= 0 || sk.level >= sk.max) return;

  //if (sk.parent && parentLevel(sk.parent) < 1) return;
  // pais guias NÃO bloqueiam
  // só bloqueia se tiver requires

  // bloqueia por nível da conta
  if (sk.minAccountLevel && userData.nivel < sk.minAccountLevel) {
    alert(`❌ Precisa ser nível ${sk.minAccountLevel}`);
    return;
  }
  
  // requisitos de skill
  for (const req of (sk.requires ?? [])) {
    const reqSkill = skills.find(s => s.id === req.id);
    if (!reqSkill || reqSkill.level < req.level) return;
  }
  
  sk.level++;
  userData.pontos--;
  skillsState[id] = sk.level;

  await updateDoc(doc(db, "fichas", currentUID), {
    skills: skillsState,
    pontos: userData.pontos
  });

  render();
}

// 🎁 Sobe de level ao ganhar XP
async function checkLevelUp() {
  let oldLevel = userData.nivel;
  let newLevel = 1 + Math.floor(userData.xp / 20);

  if (newLevel > oldLevel) {
    let ganho = (newLevel - oldLevel) * 2;
    userData.nivel = newLevel;
    userData.pontos += ganho;

    await updateDoc(doc(db, "fichas", currentUID), {
      nivel: userData.nivel,
      pontos: userData.pontos
    });

    alert(`🎉 Você subiu para nível ${newLevel}! (+${ganho} pts)`);
  }
}

function updateHeader() {
  document.getElementById("player-name").textContent = userData.nome;
  document.getElementById("player-clan").textContent = `Clã: ${userData.clan}`;
  document.getElementById("player-level").textContent = `Lv: ${userData.level}`;
  document.getElementById("player-xp").textContent = `${userData.xp} / ${userData.proximo}`;

  document.getElementById("header-xp-bar").style.width =
    `${(userData.xp / userData.proximo) * 100}%`;

  document.getElementById("points-header").textContent =
    `Pontos Disponíveis: ${userData.pontos}`;
}

