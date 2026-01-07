// --------------------------------------------------
//  SHOGUN JIDAI - ÁRVORE DE HABILIDADES
//  MODIFICAR DEPOIS: pontos iniciais = 5
// --------------------------------------------------

const auth = firebase.auth();
const db = firebase.firestore();

let uid = null;
let ficha = null;
let pontosLivres = 0;
let skills = {};

// --------------------------------------------------
//  GARANTIR LOGIN
// --------------------------------------------------
auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  uid = user.uid;

  // Carregar ficha
  const fichaSnap = await db.collection("fichas").doc(uid).get();

  if (!fichaSnap.exists) {
    alert("Ficha não encontrada. Contate o mestre!");
    return;
  }

  ficha = fichaSnap.data();
  skills = ficha.skills;
  
  // MODIFICAR DEPOIS: definir com a staff
  pontosLivres = 5;

  renderInfoTopo();
  renderSkills();
});


// --------------------------------------------------
//  MOSTRAR INFORMAÇÕES NO TOPO DA TELA
// --------------------------------------------------
function renderInfoTopo() {
  const topo = document.getElementById("infoTopo");
  topo.innerHTML = `
    <div style="
      display:flex;
      justify-content: space-around;
      padding:10px;
      background:#222;
      color:white;
      font-size:14px;
      border-bottom:2px solid #444;">
      
      <span><b>Email:</b> ${ficha.email}</span>
      <span><b>Clã:</b> ${ficha.cla}</span>
      <span><b>Idade:</b> ${ficha.idade}</span>
	  <span><b>Nick:</b> ${ficha.nick}</span>
      <span><b>Pontos Disponíveis:</b> ${pontosLivres}</span>
      <span><b>XP:</b> ${ficha.experiencia}</span>
    </div>
  `;
}


// --------------------------------------------------
//  MOSTRAR SKILLS NA ÁRVORE
//  (coloque IDs nas bolhas de cada habilidade)
// --------------------------------------------------
function renderSkills() {
  // Exemplo de IDs:
  // chakraValue, fisicoValue, mentalValue, construcaoValue, jinchurikiValue
  
  document.getElementById("chakraValue").textContent = skills.chakra;
  document.getElementById("fisicoValue").textContent = skills.fisico;
  document.getElementById("mentalValue").textContent = skills.mental;
  document.getElementById("construcaoValue").textContent = skills.construcao;
  document.getElementById("jinchurikiValue").textContent = skills.jinchuriki;

  renderInfoTopo();
}


// --------------------------------------------------
//  AUMENTAR SKILL (+1)
// --------------------------------------------------
async function addPonto(skillName) {
  if (pontosLivres <= 0) {
    alert("Sem pontos disponíveis!");
    return;
  }

  skills[skillName]++;
  pontosLivres--;

  renderSkills();

  await db.collection("fichas").doc(uid).update({
    skills: skills
  });
}


// --------------------------------------------------
//  XP PLACEHOLDER (MODIFICAR DEPOIS)
// --------------------------------------------------
document.getElementById("xpBar").textContent = `XP: ${ficha?.experiencia ?? 0}`;


// --------------------------------------------------
//  EXEMPLOS DE BOTÕES (coloque no HTML):
//  <button onclick="addPonto('chakra')">+</button>
// --------------------------------------------------
