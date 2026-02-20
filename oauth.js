// oauth.js — Firebase v10+ (VERSÃO FINAL CORRETA)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
  signOut,
  onAuthStateChanged
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
   AUTENTICAÇÃO OBRIGATÓRIA
   Todas as páginas de jogo devem chamar requireAuth()
   Redireciona pra login se não estiver autenticado
========================================================= */
export function requireAuth() {
  // Verifica se usuário está logado
  // Se não estiver, redireciona pra index.html (login)
  onAuthStateChanged(auth, user => {
    if (!user && !window.location.pathname.includes("index.html") && !window.location.pathname.includes("cadastro.html")) {
      window.location.href = "index.html";
    }
  });
}

/* =========================================================
   LOAD CLÃS (CADASTRO)
========================================================= */
export async function loadClans() {
  const select = document.getElementById("claSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Selecione um Clã</option>`;

  // tenta carregar a partir de diferentes nomes de coleção (compatibilidade)
  const possibleCollections = ["clas", "clans", "cla", "clã", "clãs"];
  let loaded = false;

  for (const col of possibleCollections) {
    try {
      const snap = await getDocs(collection(db, col));
      if (snap.empty) continue;

      snap.forEach(docSnap => {
        const data = docSnap.data();
        const opt = document.createElement("option");
        opt.value = docSnap.id;
        opt.textContent = data.nome ?? docSnap.id;
        select.appendChild(opt);
      });

      loaded = true;
      console.log(`🔍 clãs carregados da coleção '${col}'`);
      break;
    } catch (err) {
      console.warn(`Coleção '${col}' indisponível:`, err.message);
      // se falha por permissão, não adianta tentar outras; sai e informa ao usuário
      if (err.message && err.message.toLowerCase().includes('permission')) {
        const opt = document.createElement("option");
        opt.disabled = true;
        opt.textContent = "Erro ao carregar clãs (permissão)";
        select.appendChild(opt);
        return;
      }
    }
  }

  if (!loaded) {
    console.warn("Nenhuma coleção de clãs encontrada; formulário exibirá apenas a opção padrão.");
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
    const uidSecundario = document.getElementById("uidSecundario")?.value.trim() || "";

    if (!cla) {
      alert("Selecione um clã.");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      const newUID = cred.user.uid;

      // Determinar se é ficha primária ou secundária
      let mainUID = newUID; // por padrão, ele é o main
      const isPrimary = !uidSecundario; // se não tem UID secundário, é primary

      if (uidSecundario) {
        // Vinculando como secondary à ficha fornecida
        mainUID = uidSecundario;

        // Verificar se o UID da ficha principal existe
        const mainFichSnap = await getDoc(doc(db, "fichas", mainUID));
        if (!mainFichSnap.exists()) {
          alert("❌ UID da ficha principal não existe! Verifique com o ADM.");
          return;
        }
      }

      // Criar documento da ficha
      await setDoc(doc(db, "fichas", newUID), {
        nick,
        idade,
        cla,
        xp: 0,
        nivel: 1,
        pontos: 0,
        skills: {},
        isPrimary, // marca se é primary ou secondary
        linkedTo: mainUID, // UID da ficha principal (ele mesmo se é primary)
        createdAt: new Date()
      });

      // Atualizar ou criar documento de linked accounts
      const linksRef = doc(db, "user_account_links", mainUID);
      const linksSnap = await getDoc(linksRef);

      if (linksSnap.exists()) {
        // Adicionar novo UID à lista (evitar duplicatas)
        const fichas = linksSnap.data().fichas || [];
        if (!fichas.includes(newUID)) {
          fichas.push(newUID);
          await setDoc(linksRef, { fichas }, { merge: true });
        }
      } else {
        // Criar novo documento com ambas as fichas
        await setDoc(linksRef, {
          fichas: [mainUID, newUID],
          criadoEm: new Date()
        });
      }

      alert(`✅ Ficha "${nick}" criada com sucesso!`);
      window.location.href = "arvore_habilidade.html";
    } catch (e) {
      console.error("Erro ao criar conta:", e);
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

