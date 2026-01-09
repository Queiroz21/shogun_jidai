// app.js — versão FINAL oficial do projeto

import { auth, db } from "./oauth.js";
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUID = null;
let skillsState = {};
let userData = {};

const skills = [
  { id: "chakra", name: "Controle de Chakra", img: "assets/icons/chakra.png", max: 5, children: ["katon", "suiton"] },
  { id: "fisico", name: "Treino Físico", img: "assets/icons/fisico.png", max: 5 },
  { id: "mental", name: "Disciplina Mental", img: "assets/icons/mental.png", max: 5 },
  { id: "construcao", name: "Construção da Aldeia", img: "assets/icons/construcao.png", max: 5 },
  { id: "jinchuriki", name: "Força do Jinchūriki", img: "assets/icons/jinchuriki.png", max: 5 },
  { id: "katon", parent: "chakra", name: "Elemento Katon", img: "assets/icons/fogo.png", max: 5 },
  { id: "suiton", parent: "chakra", name: "Elemento Suiton", img: "assets/icons/agua.png", max: 5 }
];

// 🔥 Login detectado
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUID = user.uid;

  const fichaRef = doc(db, "fichas", currentUID);
  const snap = await getDoc(fichaRef);
  userData = snap.data() ?? {};

  // Segurança para campos novos
  userData.xp = userData.xp ?? 0;
  userData.nivel = userData.nivel ?? 1;
  userData.pontos = userData.pontos ?? 0;
  userData.skills = userData.skills ?? {};

  skillsState = { ...userData.skills };

  // Atribui level interno
  skills.forEach(s => {
    s.level = skillsState[s.id] ?? 0;
  });

  await checkLevelUp();
  render();
});

// 🔍 Verifica se existe um pai e seu level
function parentLevel(id) {
  const p = skills.find(s => s.id === id);
  return p ? p.level : 0;
}

// 🔳 Monta cada card
/*function makeCard(skill) {
  const el = document.createElement("div");
  el.className = "skill";

  if (skill.level >= skill.max) el.classList.add("mastered");
  else if (skill.parent && parentLevel(skill.parent) < 2)
    el.classList.add("locked");

  el.innerHTML = `
    <img src="${skill.img}">
    <div>${skill.name}</div>
    <small>(${skill.level}/${skill.max})</small>
  `;

  el.onclick = () => levelUp(skill.id);
  return el;
}*/

// 🔳 Monta cada card
function makeCard(skill) {
  const el = document.createElement("div");
  el.className = "skill";

  if (skill.level >= skill.max) el.classList.add("mastered");
  else if (skill.parent && parentLevel(skill.parent) < 2)
    el.classList.add("locked");

  // Define nível entre 1 e skill.max
  const index = Math.max(1, Math.min(skill.level, skill.max));

  // monta caminho da imagem ( novos arquivos em /imgs )
  const imgSrc = `./assets/icons//${skill.id}_${index}.png`;

  el.innerHTML = `
    <img src="${imgSrc}">
    <div>${skill.name}</div>
    <small>(${skill.level}/${skill.max})</small>
  `;

  el.onclick = () => levelUp(skill.id);
  return el;
}


// 🎨 Renderiza tudo
function render() {
  // Topo antigo
  document.getElementById("infoTopo").textContent =
    `${userData.nick ?? "Sem Nome"} | Clã: ${userData.cla ?? "Nenhum"}`;

  document.getElementById("xpBar").textContent =
    `Nível ${userData.nivel} | XP: ${userData.xp}`;

  document.getElementById("points").textContent =
    `Pontos Disponíveis: ${userData.pontos}`;

	
  // 🌟 Novo HUD: Level + XP + Barra
  const xpNeeded = userData.nivel * 20;
  const xpCurrent = userData.xp;
  const pct = Math.min((xpCurrent / xpNeeded) * 100, 100);

 document.getElementById("player-level").textContent =
    `Level: ${userData.nivel}`;

  document.getElementById("player-xp").textContent =
    `XP: ${xpCurrent} / ${xpNeeded}`;

  document.getElementById("xp-bar").style.width = pct + "%";


  // 🌳 Render árvore normalmente
  const chart = document.getElementById("org-chart");
  chart.innerHTML = "";

  const container = document.createElement("div");
  container.className = "directors";

  const parents = skills.filter(s => !s.parent);

  parents.forEach(parent => {
    const branch = document.createElement("div");
    branch.className = "branch";

    branch.appendChild(makeCard(parent));

    const kids = skills.filter(s => s.parent === parent.id);
    if (kids.length && parent.level >= 2) {
      const bar = document.createElement("div");
      bar.className = "branch-line";
      branch.appendChild(bar);

      const row = document.createElement("div");
      row.className = "child-row";
      kids.forEach(ch => row.appendChild(makeCard(ch)));
      branch.appendChild(row);
    }

    container.appendChild(branch);
  });

  chart.appendChild(container);
}


// ⬆️ Para evoluir uma skill (gasta pontos)
async function levelUp(id) {
  const sk = skills.find(s => s.id === id);
  if (!sk) return;
  if (userData.pontos <= 0) return;
  if (sk.level >= sk.max) return;
  if (sk.parent && parentLevel(sk.parent) < 2) return;

  sk.level++;
  userData.pontos--;
  skillsState[id] = sk.level;

  await updateDoc(doc(db, "fichas", currentUID), {
    skills: skillsState,
    pontos: userData.pontos
  });

  render();
}

// 🧠 Se recebeu XP suficiente do mestre, sobe nível e ganha pontos
async function checkLevelUp() {
  let oldLevel = userData.nivel;
  let newLevel = 1 + Math.floor(userData.xp / 20);

  if (newLevel > oldLevel) {
    let ganhos = (newLevel - oldLevel) * 2;
    userData.nivel = newLevel;
    userData.pontos += ganhos;

    await updateDoc(doc(db, "fichas", currentUID), {
      nivel: userData.nivel,
      pontos: userData.pontos
    });

    alert(`🎉 Parabéns! Subiu para nível ${newLevel} e ganhou ${ganhos} pontos!`);
  }
}

function updateTreeImage(treeType = "fisico") {
  const img = document.getElementById("tree-image");

  // Garante que fica entre 1 e 5
  const index = Math.max(1, Math.min(userData.nivel, 5));

  img.src = `./imgs/${treeType}_${index}.png`;
}