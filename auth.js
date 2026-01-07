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

const auth = firebase.auth();
const db = firebase.firestore();

// BOTÕES
document.getElementById("btnLogin").onclick = () => {
  const email = email.value;
  const senha = senha.value;

  auth.signInWithEmailAndPassword(email, senha)
    .then(() => window.location.href = "arvore_habilidade.html")
    .catch(err => alert("Erro: " + err.message));
};

document.getElementById("btnCriar").onclick = async () => {
  const email = email.value;
  const senha = senha.value;

  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, senha);
    const uid = userCred.user.uid;

    // cria ficha base
    await db.collection("fichas").doc(uid).set({
      email,
      cla: "Nenhum",
      idade: 0,
      invocacao: null,
      reencarnacao: null,
      doujutsu: null,
      maldicao: null,
      experiencia: 0,
      skills: {
        fisico: 1,
        chakra: 1,
        mental: 0,
        construcao: 0,
        jinchuriki: 0
      },
      admin: false
    });

    alert("Ficha criada!");
    window.location.href = "arvore_habilidade.html";

  } catch (e) {
    alert("Erro: " + e.message);
  }
};
