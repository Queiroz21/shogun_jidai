// app.js
import { auth, db } from "./oauth.js";
import { doc, getDoc, updateDoc } 
  from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

// ESTADO
let currentUID = null;
let skillsState = {};
let points = 5; // TODO: modificar depois com a staff

// DEFINIÇÃO DAS SKILLS
const skills = [
  { id: "chakra", name: "Controle de Chakra", img: "assets/icons/chakra.png", max: 5, children: ["katon","suiton"] },
  { id: "fisico", name: "Treino Físico", img: "assets/icons/fisico.png", max: 5 },
  { id: "mental", name: "Disciplina Mental", img: "assets/icons/mental.png", max: 5 },
  { id: "construcao", name: "Construção da Aldeia", img: "assets/icons/construcao.png", max: 5 },
  { id: "jinchuriki", name: "Força do Jinchūriki", img: "assets/icons/jinchuriki.png", max: 5 },
  { id: "katon", name: "Elemento Katon", img: "assets/icons/fogo.png", max: 5, parent: "chakra" },
  { id: "suiton", name: "Elemento Suiton", img: "assets/icons/agua.png", max: 5, parent: "chakra" }
];

// AUTENTICAÇÃO
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUID = user.uid;

  const ref = doc(db, "fichas", currentUID);
  const snap = await getDoc(ref);

  const data = snap.data() || {};

  points = data.experiencia ?? 5;
  skillsState = data.skills ?? {};

  skills.forEach(s => s.level = skillsState[s.id] || 0);

  render();
});

// RENDERIZA TELA
function render() {
  document.getElementById("points").textContent = `Pontos restantes: ${points}`;
  const chart = document.getElementById("org-chart");
  chart.innerHTML = "";

  const parents = skills.filter(s => !s.parent);
  const parentRow = document.createElement("div");
  parentRow.className = "directors";

  parents.forEach(parent => {
    const branch = document.createElement("div");
    branch.className = "branch";

    branch.appendChild(makeCard(parent));

    const kids = skills.filter(s => s.parent === parent.id);
    if (kids.length && parent.level >= 2) {
      branch.appendChild(line());
      branch.appendChild(childRow(kids));
    }

    parentRow.appendChild(branch);
  });

  chart.appendChild(parentRow);
}

// UI helpers
function makeCard(sk) {
  const el = document.createElement("div");
  el.className = "skill";

  if (sk.level >= sk.max) el.classList.add("mastered");
  else if (points <= 0 || (sk.parent && parentLevel(sk.parent) < 2))
    el.classList.add("locked");

  el.innerHTML = `
      <img src="${sk.img}">
      <div>${sk.name}</div>
      <small>(${sk.level}/${sk.max})</small>
  `;
  el.onclick = () => levelUp(sk.id);
  return el;
}

function parentLevel(id) {
  const pr = skills.find(s => s.id === id);
  return pr ? pr.level : 0;
}

function line() {
  const bar = document.createElement("div");
  bar.className = "branch-line";
  return bar;
}

function childRow(arr) {
  const row = document.createElement("div");
  row.className = "child-row";
  arr.forEach(ch => row.appendChild(makeCard(ch)));
  return row;
}

// LEVEL UP
async function levelUp(id) {
  const sk = skills.find(s => s.id === id);
  if (!sk) return;
  if (points <= 0) return;
  if (sk.parent && parentLevel(sk.parent) < 2) return;
  if (sk.level >= sk.max) return;

  sk.level++;
  points--;
  skillsState[sk.id] = sk.level;

  const ref = doc(db, "fichas", currentUID);
  await updateDoc(ref, {
    skills: skillsState,
    experiencia: points
  });

  render();
}
