import { auth, db } from "./oauth.js";
import { 
  doc, 
  getDoc, 
  updateDoc 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUID = null;
let points = 5;               // TODO: mudar depois com staff
let skillsState = {};

const skills = [
  { id: "chakra", name: "Controle de Chakra", max: 5 },
  { id: "fisico", name: "Treino Físico", max: 5 },
  { id: "mental", name: "Disciplina Mental", max: 5 },
  { id: "construcao", name: "Construção da Aldeia", max: 5 },
  { id: "jinchuriki", name: "Força Jinchūriki", max: 5 },
];

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUID = user.uid;

  const fichaRef = doc(db, "fichas", currentUID);
  const snap = await getDoc(fichaRef);
  const data = snap.data();

  points = data.experiencia ?? 5;
  skillsState = data.skills ?? {};

  skills.forEach(s => s.level = skillsState[s.id] || 0);

  render();
});

async function levelUp(id) {
  if (points <= 0) return;
  const sk = skills.find(s => s.id === id);
  if (sk.level >= sk.max) return;

  sk.level++;
  points--;
  skillsState[id] = sk.level;

  await updateDoc(doc(db, "fichas", currentUID), {
    skills: skillsState,
    experiencia: points
  });

  render();
}

function render(){
  document.getElementById("points").textContent = `Pontos: ${points}`;
}
