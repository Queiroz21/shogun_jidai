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

/* =========================================================
   XP — PROGRESSÃO REAL (100, 300, 600…)
========================================================= */
function xpToReachLevel(level) {
  return 100 * (level - 1) * level / 2;
}

function calculateLevelFromXP(xp) {
  let level = 1;
  while (xp >= xpToReachLevel(level + 1)) {
    level++;
  }
  return level;
}

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
    s.level = skillsState[s.id] ?? 0;
    s.requires = s.requires ?? [];
    s.max = s.max ?? 5;
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

  skillsState = { ...userData.skills };
  skills = await loadSkills();

  await checkLevelUp();
  render();
});

/* =========================================================
   LEVEL UP — XP REAL + POPUP
========================================================= */
function xpTotalForLevel(level) {
  // progressão: 100, +200, +300, +400...
  // fórmula: 50 * level * (level - 1)
  return 50 * level * (level - 1);
}

async function checkLevelUp() {
  let oldLevel = userData.nivel;

  while (userData.xp >= xpTotalForLevel(userData.nivel + 1)) {
    userData.nivel++;
  }

  if (userData.nivel > oldLevel) {
    const gainedLevels = userData.nivel - oldLevel;
    const gainedPoints = gainedLevels * 3; // ✅ 3 pontos por nível

    userData.pontos += gainedPoints;

    await updateDoc(doc(db, "fichas", currentUID), {
      nivel: userData.nivel,
      pontos: userData.pontos
    });

    showLevelUpPopup(oldLevel, userData.nivel, gainedPoints);
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

function showLevelUpPopup(oldLevel, newLevel, gainedPoints) {
  alert(
    "LEVEL UP!\n\n" +
    "Nível: ${oldLevel} → ${newLevel}\n" +
    "Pontos ganhos: +${gainedPoints}"
  );
}

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
   MAKE CARD
========================================================= */
function makeCard(skill) {
  const el = document.createElement("div");
  el.className = "skill";

  const { unlocked } = checkRequirements(skill);

  const iconName = skill.icon || "default";
  const iconIndex = Math.min(skill.level ?? 0, skill.max);
  const icon = unlocked
    ? `assets/icons/${iconName}_${iconIndex}.png`
    : `assets/icons/${iconName}_locked.png`;

  if (!unlocked) el.classList.add("blocked");
  else if (skill.level > 0) el.classList.add("active");

  el.innerHTML = `
    <img src="${icon}">
    <div class="tooltip">
      <strong>${skill.name}</strong><br>
      <small>Nível: ${skill.level ?? 0} / ${skill.max}</small><br><br>
      ${skill.desc ?? ""}
    </div>
  `;

  el.onclick = () => {
    if (!unlocked) return;
    levelUp(skill.id);
  };

  return el;
}

/* =========================================================
   BUILD TREE
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
   RENDER
========================================================= */
function render() {
  document.getElementById("infoTopo").textContent =
    `${userData.nick} | Clã: ${userData.cla}`;

  document.getElementById("points").textContent =
    `Pontos Disponíveis: ${userData.pontos}`;

  const xpCurrent = xpToReachLevel(userData.nivel);
  const xpNext = xpToReachLevel(userData.nivel + 1);
  const progress = ((userData.xp - xpCurrent) / (xpNext - xpCurrent)) * 100;

  document.getElementById("player-level").textContent =
    `Level: ${userData.nivel}`;

  document.getElementById("player-xp").textContent =
    `XP: ${userData.xp} / ${xpNext}`;

  document.getElementById("xp-bar").style.width =
    `${Math.min(Math.max(progress, 0), 100)}%`;

  const chart = document.getElementById("org-chart");
  chart.innerHTML = "";

  const parents = skills.filter(s => !s.parent);
  const container = document.createElement("div");
  container.className = "directors";
  parents.forEach(p => container.appendChild(buildBranch(p)));
  chart.appendChild(container);
}

/* =========================================================
   LEVEL UP SKILL
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
