// oauth.js — Firebase v10+ (VERSÃO FINAL CORRETA)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   FIREBASE INIT
========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyC_jD2hYyzfoKNB1IO1_A3H-pUD2Ldph3s",
  authDomain: "shogunjidai-11c32.firebaseapp.com",
  projectId: "shogunjidai-11c32",
  storageBucket: "shogunjidai-11c32.firebasestorage.app",
  messagingSenderId: "889492958090",
  appId: "1:889492958090:web:da6e0761c821c4b480b673"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* =========================================================
   AUTH — SESSION ONLY (NÃO VAZA ENTRE PCS)
========================================================= */
await setPersistence(auth, browserSessionPersistence);

/* =========================================================
   AUTO LOGOUT POR INATIVIDADE
========================================================= */
let timeout;

function resetTimer() {
  clearTimeout(timeout);
  timeout = setTimeout(async () => {
    await signOut(auth);
    alert("Sessão expirada por inatividade.");
    window.location.href = "index.html";
  }, 30 * 60 * 1000); // 30 min
}

["click", "mousemove", "keydown"].forEach(evt =>
  window.addEventListener(evt, resetTimer)
);

resetTimer();

/* =========================================================
   LOAD CLÃS (CADASTRO)
========================================================= */
async function loadClans() {
  const select = document.getElementById("claSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Selecione um Clã</option>`;

  try {
    const snap = await getDocs(collection(db, "clas"));
    snap.forEach(docSnap => {
      const data = docSnap.data();

      const opt = document.createElement("option");
      opt.value = docSnap.id;
      opt.textContent = data.nome ?? docSnap.id;

      select.appendChild(opt);
    });
  } catch (e) {
    console.error("Erro ao carregar clãs:", e);
  }
}

/* =========================================================
   LOGIN
========================================================= */
if (document.getElementById("btnLogin")) {
  document.getElementById("btnLogin").onclick = async () => {
    const email = document.getElementById("email").value;
    const senha = document.getElementById("senha").value;

    try {
      await signInWithEmailAndPassword(auth, email, senha);
      window.location.href = "arvore_habilidade.html";
    } catch (e) {
      alert("Erro ao logar: " + e.message);
    }
  };
}

/* =========================================================
   CADASTRO + CRIA FICHA
========================================================= */
if (document.getElementById("btnCriar")) {
  document.getElementById("btnCriar").onclick = async () => {
    const email = document.getElementById("email").value;
    const senha = document.getElementById("senha").value;
    const nick  = document.getElementById("nick").value;
    const idade = Number(document.getElementById("idade").value);
    const cla   = document.getElementById("claSelect").value;

    if (!cla) {
      alert("Selecione um clã.");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, senha);

      await setDoc(doc(db, "fichas", cred.user.uid), {
        nick,
        idade,
        cla,
        xp: 0,
        nivel: 1,
        pontos: 0,
        skills: {},
        createdAt: new Date()
      });

      window.location.href = "arvore_habilidade.html";
    } catch (e) {
      alert("Erro ao criar conta: " + e.message);
    }
  };
}

/* =========================================================
   DOM READY
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  loadClans();
});

// ===============================
// LOAD CLÃS (GLOBAL)
// ===============================
export async function loadClas() {
  const select = document.getElementById("claSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Selecione um clã</option>`;

  const snap = await getDocs(collection(db, "clas"));

  snap.forEach(docSnap => {
    const cla = docSnap.data();

    const opt = document.createElement("option");
    opt.value = cla.id ?? docSnap.id;
    opt.textContent = cla.nome ?? cla.id;

    select.appendChild(opt);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadClas();
});

