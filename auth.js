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

/* ------------------------
   CARREGAR LISTA DE CLÃS
------------------------- */
const claSelect = document.getElementById("claSelect"); // pega select da página

if (claSelect) {
  db.collection("clas").get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const c = doc.data();
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = c.nome;
        claSelect.appendChild(opt);
      });
    })
    .catch(e => console.error("Erro ao carregar clãs:", e));
}

/* ------------------------
   LOGIN
------------------------- */
const btnLogin = document.getElementById("btnLogin");
if (btnLogin) {
  btnLogin.onclick = () => {
    const emailV = email.value;
    const senhaV = senha.value;

    auth.signInWithEmailAndPassword(emailV, senhaV)
      .then(() => window.location.href = "arvore_habilidade.html")
      .catch(err => alert("Erro: " + err.message));
  };
}

/* ------------------------
   CRIAR CONTA
------------------------- */
const btnCriar = document.getElementById("btnCriar");
if (btnCriar) {
  btnCriar.onclick = async () => {
    const emailV = email.value;
    const senhaV = senha.value;
    const idadeV = parseInt(idade.value || "0", 10);
    const claID = claSelect.value;

    try {
      // cria autenticação
      const userCred = await auth.createUserWithEmailAndPassword(emailV, senhaV);
      const uid = userCred.user.uid;

      // pega os dados do clã
      const claDoc = await db.collection("clas").doc(claID).get();
      const claData = claDoc.data();

      // monta skills com base nos bônus do clã
      const skillsBase = {
        fisico: claData.bonus_fisico || 0,
        chakra: claData.bonus_chakra || 0,
        mental: claData.bonus_mental || 0,
        construcao: claData.bonus_construcao || 0,
        jinchuriki: claData.bonus_jin || 0
      };

      await db.collection("fichas").doc(uid).set({
        email: emailV,
        cla: claData.nome,
        idade: idadeV,
        invocacao: null,
        reencarnacao: null,
        doujutsu: null,
        maldicao: null,
        experiencia: 0,
        skills: skillsBase,
        admin: false
      });

      alert("Conta criada com sucesso!");
      window.location.href = "login.html";

    } catch (e) {
      alert("Erro: " + e.message);
    }
  };
}
