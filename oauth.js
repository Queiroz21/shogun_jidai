import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } 
  from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { getFirestore } 
  from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
  
// CONFIGURE COM SUAS CHAVES DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyC_jD2hYyzfoKNB1IO1_A3H-pUD2Ldph3s",
  authDomain: "shogunjidai-11c32.firebaseapp.com",
  projectId: "shogunjidai-11c32",
  storageBucket: "shogunjidai-11c32.firebasestorage.app",
  messagingSenderId: "889492958090",
  appId: "1:889492958090:web:da6e0761c821c4b480b673"
};

firebase.initializeApp(firebaseConfig);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* ------------------------
   CARREGAR CLÃS
------------------------- */
if (document.getElementById("claSelect")) {
  db.collection("clas").get().then(snapshot => {
    const select = document.getElementById("claSelect");
    snapshot.forEach(doc => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = doc.data().nome;
      select.appendChild(opt);
    });
  });
}

/* ------------------------
   LOGIN
------------------------- */
if (document.getElementById("btnLogin")) {
  document.getElementById("btnLogin").onclick = () => {
    const emailV = email.value;
    const senhaV = senha.value;

    auth.signInWithEmailAndPassword(emailV, senhaV)
      .then(() => window.location.href = "arvore_habilidade.html")
      .catch(err => alert("Erro: " + err.message));
  };
}

/* ------------------------
   CRIA CONTA C/ CLÃ + NICK
------------------------- */
if (document.getElementById("btnCriar")) {
  document.getElementById("btnCriar").onclick = async () => {
    const emailV = email.value;
    const senhaV = senha.value;
    const idadeV = parseInt(idade.value || "0", 10);
    const nickV = nick.value || "SemNome";
    const claID = claSelect.value;

    try {
      const userCred = await auth.createUserWithEmailAndPassword(emailV, senhaV);
      const uid = userCred.user.uid;

      // pega dados do clã escolhido
      const claDoc = await db.collection("clas").doc(claID).get();
      const claData = claDoc.data();

      await db.collection("fichas").doc(uid).set({
        email: emailV,
        nick: nickV,
        cla: claData.nome,
        idade: idadeV,
        invocacao: null,
        reencarnacao: null,
        doujutsu: null,
        maldicao: null,
        experiencia: 0,
        
        // MODIFICAR DEPOIS
        skills: {
          chakra: claData.bonus_chakra || 1,
          fisico: claData.bonus_fisico || 0,
          mental: claData.bonus_mental || 0,
          construcao: claData.bonus_construcao || 0,
          jinchuriki: claData.bonus_jin || 0
        },
        
        admin: false
      });

      alert("Conta criada com sucesso!");
      window.location.href = "index.html";

    } catch (e) {
      alert("Erro: " + e.message);
    }
  };
}
