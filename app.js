// app.js - FINAL para seu style.css antigo
import { auth, db } from "./oauth.js";
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUID = null;
let points = 5;
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

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUID = user.uid;

  const fichaRef = doc(db, "fichas", currentUID);
  const snap = await getDoc(fichaRef);

  userData = snap.data() ?? {};

  points = userData.experiencia ?? 5;
  skillsState = userData.skills ?? {};

  skills.forEach(s => s.level = skillsState[s.id] || 0);

  render();
});

function parentLevel(id) {
  const p = skills.find(s => s.id === id);
  return p ? p.level : 0;
}

function makeCard(skill) {
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
}

function render() {
  document.getElementById("infoTopo").textContent =
    `${userData.nick ?? "Sem Nome"} | Clã: ${userData.cla ?? "Nenhum"}`;

  document.getElementById("xpBar").textContent = `XP: ${points}`;
  document.getElementById("points").textContent = `Pontos Disponíveis: ${points}`;

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

async function levelUp(id) {
  const sk = skills.find(s => s.id === id);
  if (!sk || points <= 0 || sk.level >= sk.max) return;
  if (sk.parent && parentLevel(sk.parent) < 2) return;

  sk.level++;
  points--;
  skillsState[id] = sk.level;

  await updateDoc(doc(db, "fichas", currentUID), {
    skills: skillsState,
    experiencia: points
  });

  render();
}
