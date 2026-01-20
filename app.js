// app.js — versão FINAL corrigida

import { auth, db } from "./oauth.js";
import {
  doc, getDoc, updateDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUID = null;
let skillsState = {};
let userData = {};
let skills = [];

/* =========================================================
   LOAD SKILLS
========================================================= */
async function loadSkills() {
  const col = collection(db, "skill_tree");
  const snap = await getDocs(col);
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
  const fichaRef = doc(db, "fichas", currentUID);
  const snap = await getDoc(fichaRef);
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
   MAKE CARD (INALTERADO — só leitura correta)
========================================================= */
function makeCard(skill) {
  const el = document.createElement("div");
  el.className = "skill";

  let unlocked = true;

  for (const req of skill.requires ?? []) {
    if (req.type === "skill") {
      const sk = skills.find(s => s.id === req.id);
      if (!sk || sk.level < (req.level ?? 1)) unlocked = false;
    }

    if (req.type === "doujutsu") {
      const list = normalizeDoujutsus();
      if (!list.includes(req.value)) unlocked = false;
    }
  }

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
   NORMALIZA DOUJUTSUS DA FICHA
========================================================= */
function normalizeDoujutsus() {
  if (Array.isArray(userData.doujutsu)) return userData.doujutsu;
  if (typeof userData.doujutsu === "string") return [userData.doujutsu];
  if (Array.isArray(userData.doujutsus)) return userData.doujutsus;
  return [];
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
    const line = document.createElement("div");
    line.className = "branch-line";
    branch.appendChild(line);

    const row = document.createElement("div");
    row.className = "child-row";

    kids.forEach(k => row.appendChild(buildBranch(k)));
    branch.appendChild(row);
  }

  return branch;
}

/* =========================================================
   RENDER — PARTE CRÍTICA CORRIGIDA
========================================================= */
function render() {
  const chart = document.getElementById("org-chart");
  chart.innerHTML = "";

  const userDoujutsus = normalizeDoujutsus();

  const parents = skills.filter(s => {

    // Jin
    if (s.id === "jin") return !!userData.jin;

    // GUIA DOUJUTSU → aparece se tiver QUALQUER doujutsu
    if (s.id === "doujutsu") {
      return userDoujutsus.length > 0;
    }

    // RAMOS DE DOUJUTSU → só se possuir
    if (s.type === "doujutsu" && s.doujutsuKey) {
      return userDoujutsus.includes(s.doujutsuKey) && !s.parent;
    }

    // Outros pais normais
    return !s.parent;
  });

  const container = document.createElement("div");
  container.className = "directors";

  parents.forEach(p => container.appendChild(buildBranch(p)));
  chart.appendChild(container);
}

/* =========================================================
   LEVEL UP (INALTERADO)
========================================================= */
async function levelUp(id) {
  const sk = skills.find(s => s.id === id);
  if (!sk || sk.level >= sk.max || userData.pontos <= 0) return;

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
