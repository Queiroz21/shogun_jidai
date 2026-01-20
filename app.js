// app.js — versão FINAL RESTAURADA + DOUJUTSU FUNCIONAL

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

/* =========================================================
   UTIL — NORMALIZA DOUJUTSUS
========================================================= */
function normalizeDoujutsus() {
  if (Array.isArray(userData.doujutsus)) return userData.doujutsus;
  if (Array.isArray(userData.doujutsu)) return userData.doujutsu;
  if (typeof userData.doujutsu === "string") return [userData.doujutsu];
  return [];
}

/* =========================================================
   LOAD SKILLS
========================================================= */
async function loadSkills() {
  const snap = await getDocs(collection(db, "skill_tree"));
  const loaded = snap.docs.map(d => d.data());

  loaded.forEach(s => {
    s.level    = skillsState[s.id] ?? 0;
    s.requires = s.requires ?? [];
    s.max      = s.max ?? 5;
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

  userData.nick    ??= "Sem Nome";
  userData.cla     ??= "Nenhum";
  userData.xp      ??= 0;
  userData.nivel   ??= 1;
  userData.pontos  ??= 0;
  userData.skills  ??= {};

  skillsState = { ...userData.skills };
  skills = await loadSkills();

  await checkLevelUp();
  render();
});

/* =========================================================
   REGRAS — FONTE ÚNICA DA VERDADE
========================================================= */
function checkRequirements(skill) {
  const userDoujutsus = normalizeDoujutsus();
  let missing = [];

  for (const req of skill.requires ?? []) {
    const type = req.type ?? "skill";

    if (type === "skill") {
      const sk = skills.find(s => s.id === req.id);
      const cur = sk?.level ?? 0;
      const need = req.level ?? 1;
      if (cur < need) missing.push({ label: sk?.name ?? req.id, cur, need });
    }

    if (type === "playerLevel") {
      if (userData.nivel < req.level)
        missing.push({ label: "Conta", cur: userData.nivel, need: req.level });
    }

    if (type === "doujutsu") {
      if (!userDoujutsus.includes(req.value))
        missing.push({ label: "Doujutsu", cur: "Nenhum", need: req.value });
    }

    if (type === "jin" && !userData.jin)
      missing.push({ label: "Jinchuriki", cur: "Não", need: "Sim" });

    if (type === "region" && userData.regiao !== req.value)
      missing.push({ label: "Região", cur: userData.regiao ?? "Nenhuma", need: req.value });

    if (type === "clan" && userData.cla !== req.value)
      missing.push({ label: "Clã", cur: userData.cla, need: req.value });
  }

  return {
    unlocked: missing.length === 0,
    missing
  };
}

/* =========================================================
   MAKE CARD — TOOLTIP COMPLETO
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

  /* ========================= TOOLTIP (IGUAL AO ANTIGO) ========================= */

  let tooltipHTML = `
    <strong>${skill.name}</strong><br>
    <small>Nível: ${skill.level ?? 0} / ${skill.max}</small>
  `;

  if (skill.desc) {
    tooltipHTML += `<br><br>${skill.desc}`;
  }

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
        need = req.level ?? 1;
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

  el.innerHTML = `
    <img src="${currentIcon}">
    <div class="tooltip">${tooltipHTML}</div>
  `;

  el.onclick = () => {
    if (!unlocked) return;
    levelUp(skill.id);
  };

  return el;
}



/* =========================================================
   BUILD TREE — SEM VAZAMENTO DE DOUJUTSU
========================================================= */
function buildBranch(parent) {
  const userDoujutsus = normalizeDoujutsus();

  const branch = document.createElement("div");
  branch.className = "branch";
  branch.appendChild(makeCard(parent));

  const kids = skills.filter(s => s.parent === parent.id);
  if (kids.length) {
    branch.appendChild(Object.assign(document.createElement("div"), {
      className: "branch-line"
    }));

    const row = document.createElement("div");
    row.className = "child-row";
    kids.forEach(k => row.appendChild(buildBranch(k)));
    branch.appendChild(row);
  }

  return branch;
}

/* =========================================================
   RENDER — HUD + ÁRVORE
========================================================= */
function render() {
  document.getElementById("infoTopo").textContent =
    `${userData.nick} | Clã: ${userData.cla}`;

  document.getElementById("points").textContent =
    `Pontos Disponíveis: ${userData.pontos}`;

  const xpNeeded = userData.nivel * 20;
  document.getElementById("player-level").textContent = `Level: ${userData.nivel}`;
  document.getElementById("player-xp").textContent =
    `XP: ${userData.xp} / ${xpNeeded}`;
  document.getElementById("xp-bar").style.width =
    `${Math.min((userData.xp / xpNeeded) * 100, 100)}%`;

  const chart = document.getElementById("org-chart");
  chart.innerHTML = "";

  const userDoujutsus = normalizeDoujutsus();

  const parents = skills.filter(s => {

	  // 🔹 JIN
	  if (s.id === "jin") return !!userData.jin;

	  // 🔹 GUIA DOUJUTSU (aparece se tiver QUALQUER doujutsu)
	  if (s.id === "doujutsu") {
		return normalizeDoujutsus().length > 0;
	  }

	  // 🔹 RAMOS DE DOUJUTSU (Sharingan, Rinnegan…)
	  if (s.type === "doujutsu" && !s.parent) {
		return normalizeDoujutsus().includes(s.doujutsuKey);
	  }

	  // 🔹 OUTROS PAIS NORMAIS
	  return !s.parent && s.type !== "doujutsu";
	});

  const container = document.createElement("div");
  container.className = "directors";
  parents.forEach(p => container.appendChild(buildBranch(p)));
  chart.appendChild(container);
}

/* =========================================================
   LEVEL UP — BLOQUEIO REAL
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

/* =========================================================
   XP
========================================================= */
async function checkLevelUp() {
  const newLevel = 1 + Math.floor(userData.xp / 20);
  if (newLevel > userData.nivel) {
    const gain = (newLevel - userData.nivel) * 2;
    userData.nivel = newLevel;
    userData.pontos += gain;

    await updateDoc(doc(db, "fichas", currentUID), {
      nivel: userData.nivel,
      pontos: userData.pontos
    });
  }
}

