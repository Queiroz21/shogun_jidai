// app.js — versão com glow + árvore recursiva + imagens dinâmicas

import { auth, db } from "./oauth.js";
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUID = null;
let skillsState = {};
let userData = {};

// 📌 Agora cada skill tem um TYPE para o glow
const skills = [
  { id: "chakra",  type:"chakra",  name: "Controle de Chakra", img: "chakra", max: 5 },
  { id: "fisico",  type:"fisico",  name: "Treino Físico",     img: "fisico", max: 5 },
  { id: "mental",  type:"mental",  name: "Disciplina Mental", img: "mental", max: 5 },
  { id: "construcao", type:"civil", name: "Construir Aldeia",img:"construcao", max:5 },
  { id: "jinchuriki", type:"chakra", name:"Força Jinchūriki",img:"jinchuriki",max:5 },

  // 🌊 Elementos
  { id: "katon", type: "fisico", parent: "chakra", name: "Katon", img:"chakra", max: 5 },
  { id: "suiton", type: "chakra", parent: "chakra", name: "Suiton", img:"chakra", max: 5 },
  
  { id: "suitonDeAgua", type: "fisico", parent: "suiton", name: "Suiton de agua", img:"chakra", max: 5 },
  { id: "suitonDefogo", type: "chakra", parent: "suiton", name: "Suiton de fogo", img:"chakra", max: 5 },
  
  
  { id: "suitonEspecialVermelho", type: "mental", parent: "suitonDefogo", name: "Suiton vermelho especial", img:"mental", max: 5 }
];

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

  // Coloca level interno em cada skill
  skills.forEach(s => {
    s.level = skillsState[s.id] ?? 0;
  });

  await checkLevelUp();
  render();
});

// 🔎 Pega nível do pai
function parentLevel(id) {
  const p = skills.find(s => s.id === id);
  return p ? p.level : 0;
}

// 🔳 Cartão com glow + animação
function makeCard(skill) {
  const el = document.createElement("div");
  el.className = "skill";

  // Atribui classe da categoria
  el.classList.add(skill.type);

  if (skill.level >= skill.max) el.classList.add("mastered");
  else if (skill.parent && parentLevel(skill.parent) < 1)
    el.classList.add("locked");

  // Nível da imagem
  const index = Math.min(skill.level, skill.max);
  const imgSrc = `./assets/icons/${skill.img}_${index}.png`;

  el.innerHTML = `
    <img src="${imgSrc}">
    <div>${skill.name}</div>
    <small>(${skill.level}/${skill.max})</small>
  `;

  el.onclick = () => {
    levelUp(skill.id);
    el.classList.add("level-up");
    setTimeout(() => el.classList.remove("level-up"), 400);
  };

  return el;
}

// 🌳 CRIA ÁRVORE RECURSIVA
function buildBranch(parent) {
  const branch = document.createElement("div");
  branch.className = "branch";

  branch.appendChild(makeCard(parent));
  const kids = skills.filter(s => s.parent === parent.id);

  if (kids.length && parent.level >= 1) {
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

// 🎨 Renderiza HUD + árvore
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
  if (!sk || userData.pontos <= 0 || sk.level >= sk.max) return;
  if (sk.parent && parentLevel(sk.parent) < 1) return;

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
