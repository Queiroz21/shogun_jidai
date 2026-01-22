// oauth.js - Firebase v10+ modular
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


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

//segurança
export const auth = getAuth();

// 🔐 MELHOR PRÁTICA
await setPersistence(auth, browserSessionPersistence);

let timeout;

function resetTimer() {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    signOut(auth);
    alert("Sessão expirada por inatividade.");
    window.location.href = "index.html";
  }, 30 * 60 * 1000); // 30 min
}

["click","mousemove","keydown"].forEach(evt =>
  window.addEventListener(evt, resetTimer)
);

resetTimer();

// ------- LOGIN HANDLER -------
if (document.getElementById("btnLogin")) {
  document.getElementById("btnLogin").onclick = async () => {
    const emailTxt = document.getElementById("email").value;
    const senhaTxt = document.getElementById("senha").value;

    try {
      await signInWithEmailAndPassword(auth, emailTxt, senhaTxt);
      window.location.href = "arvore_habilidade.html";
    } catch (e) {
      alert("Erro ao logar: " + e.message);
    }
  };
}
