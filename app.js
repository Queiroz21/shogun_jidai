// app.js — versão FINAL realmente corrigida

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

  userData.xp     ??= 0;
  userData.nivel  ??= 1;
  userData.pontos ??= 0;
  userData.skills ??= {};

  skillsState = { ...userData.skills };
  skills = await loadSkills();

  await checkLevelUp();
  render();
});

/* =========================================================
   VALIDA REQUISITOS (FONTE ÚNICA DA VERDADE)
========================================================= */
function checkRequirements(skill) {
  const userDoujutsus = normalizeDoujutsus();

  for (const req of skill.requires ?? []) {
    const type = req.type ?? "skill";

    if (type === "skill") {
      const sk = skills.find(s => s.id === req.id);
      if (!sk || sk.level < (req.level ?? 1)) return false;
    }

    if (type === "playerLevel") {
      if ((userData.nivel ?? 0) < (req.level ?? 1)) return false;
    }

    if (type === "doujutsu") {
      if (!userDoujutsus.includes(req.value)) return false;
    }

    if (type === "jin") {
      if (!userData.jin) return false;
    }

    if (type === "region") {
      if (userData.regiao !== req.value) return false;
    }

    if (type === "clan") {
      if (userData.cla !== req.value) return false;
    }
  }

  return true;
}

/* =========================================================
   MAKE CARD
========================================================= */
function makeCard(skill) {
  const el = document.createElement("div");
  el.className = "skill";

  const unlocked = checkRequirements(skill);

  const iconIndex = Math.min(skill.level, skill.max);
  const icon = unlocked
    ? `assets/icons/${skill.icon}_${iconIndex}.png`
    : `assets/icons/${skill.icon}_locked.png`;

  if (!unlocked) el.classList.add("blocked");
  else if (skill.level > 0) el.classList.add("active");

  el.innerHTML = `
    <img src="${icon}">
    <div class="tooltip">
      <strong>${skill.name}</strong><br>
      Nível: ${skill.level} / ${skill.max}
    </div>
  `;

  el.onclick = () => {
    if (!unlocked) return;
    levelUp(skill.id);
  };

  return el;
}

/* =========================================================
   BUILD TREE — FILTRA DOUJUTSU CORRETAMENTE
========================================================= */
function buildBranch(parent) {
  const userDoujutsus = normalizeDoujutsus();

  if (
    parent.type === "doujutsu" &&
    parent.doujutsuKey &&
    !userDoujutsus.includes(parent.doujutsuKey)
  ) {
    return document.createDocumentFragment();
  }

  const branch = document.createElement("div");
  branch.className = "branch";
  branch.appendChild(makeCard(parent));

  const kids = skills.filter(s => {
    if (s.parent !== parent.id) return false;

    if (
      s.type === "doujutsu" &&
      s.doujutsuKey &&
      !userDoujutsus.includes(s.doujutsuKey)
    ) return false;

    return true;
  });

  if (kids.length) {
    branch.appendChild(
      Object.assign(document.createElement("div"), {
        className: "branch-line"
      })
    );

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
  const chart = document.getElementById("org-chart");
  chart.innerHTML = "";

  const userDoujutsus = normalizeDoujutsus();

  const parents = skills.filter(s => {

    if (s.id === "jin") return !!userData.jin;

    if (s.id === "doujutsu") {
      return userDoujutsus.length > 0;
    }

    if (s.type === "doujutsu" && !s.parent) {
      return userDoujutsus.includes(s.doujutsuKey);
    }

    return !s.parent && s.type !== "doujutsu";
  });

  const container = document.createElement("div");
  container.className = "directors";
  parents.forEach(p => container.appendChild(buildBranch(p)));
  chart.appendChild(container);
}

/* =========================================================
   LEVEL UP — AGORA BLOQUEIA DE VERDADE
========================================================= */
async function levelUp(id) {
  const sk = skills.find(s => s.id === id);
  if (!sk || sk.level >= sk.max || userData.pontos <= 0) return;

  if (!checkRequirements(sk)) return;

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
