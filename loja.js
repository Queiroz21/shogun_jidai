// loja.js - Sistema de loja dinâmica com sorteio semanal

import { auth, db, requireAuth } from "./oauth.js";
import {
  doc, getDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

requireAuth();

let currentUID = null;
let fichaACarregar = null; // UID da ficha selecionada (usada para múltiplas fichas)
let userData = {};
let itensDisponiveis = [];
let itensDoJogo = [];
let itemSelecionado = null;
let itemSelecionadoParaVenda = null;

// FLAG: modo random (true = sorteio semanal, false = tudo disponível)
const MODO_RANDOM = true; // ← MUDE PARA FALSE PARA MOSTRAR TUDO

/* =========================================================
   LISTEN DE AUTH - INICIALIZAR
========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUID = user.uid;
  
  // Verificar se há ficha selecionada em localStorage (para múltiplas fichas)
  const selectedFichaUID = localStorage.getItem("selectedFichaUID");
  fichaACarregar = selectedFichaUID || currentUID;
  
  // Setup navegação
  const btnPerfil = document.getElementById("btnPerfil");
  const btnInvocacoes = document.getElementById("btnInvocacoes");
  const btnHabilidades = document.getElementById("btnHabilidades");
  const btnAdmin = document.getElementById("btnAdmin");
  const btnLogout = document.getElementById("btnLogout");

  if (btnPerfil) btnPerfil.addEventListener("click", () => window.location.href = "perfil.html");
  if (btnInvocacoes) btnInvocacoes.addEventListener("click", () => window.location.href = "invocacoes.html");
  if (btnHabilidades) btnHabilidades.addEventListener("click", () => window.location.href = "arvore_habilidade.html");
  if (btnAdmin) btnAdmin.addEventListener("click", () => window.location.href = "admin.html");
  if (btnLogout) btnLogout.addEventListener("click", async () => { await signOut(auth); window.location.href = 'index.html'; });

  // Carregar fichas disponíveis e popular dropdown
  await carregarFichasDisponiveisLoja();

  // Verificar admin
  const principalSnap = await getDoc(doc(db, "fichas", currentUID));
  const principalData = principalSnap.data() ?? {};
  if (principalData.admin) {
    const btnAdminEl = document.getElementById("btnAdmin");
    if (btnAdminEl) {
      btnAdminEl.style.display = "block";
    }
  }
  
  await carregarDados();
  atualizarDisplay();
  iniciarTimer();
});

/* =========================================================
   MÚLTIPLAS FICHAS - CARREGAR E TROCAR (Loja)
========================================================= */
async function carregarFichasDisponiveisLoja() {
  try {
    const selectFicha = document.getElementById("selectFicha");
    if (!selectFicha) return;

    // Buscar linked accounts do UID autenticado
    const linksSnap = await getDoc(doc(db, "user_account_links", currentUID));
    const fichasUIDs = linksSnap.exists() ? (linksSnap.data().fichas || []) : [currentUID];

    // Carregar dados de todas as fichas
    const fichasCarregadas = [];
    for (const uid of fichasUIDs) {
      const fichSnap = await getDoc(doc(db, "fichas", uid));
      if (fichSnap.exists()) {
        fichasCarregadas.push({
          uid,
          nick: fichSnap.data().nick,
          cla: fichSnap.data().cla,
          nivel: fichSnap.data().nivel || 1,
          isPrimary: fichSnap.data().isPrimary ?? true
        });
      }
    }

    // Ordenar: primary primeiro, depois by nick
    fichasCarregadas.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return b.isPrimary - a.isPrimary;
      return a.nick.localeCompare(b.nick);
    });

    // Preencher select (aparece apenas se tem múltiplas fichas)
    const selectedFichaUID = localStorage.getItem("selectedFichaUID") || currentUID;
    selectFicha.innerHTML = fichasCarregadas.map(f => 
      `<option value="${f.uid}" ${f.uid === selectedFichaUID ? 'selected' : ''}>${f.nick} - ${f.cla} (Lv ${f.nivel}) ${f.isPrimary ? '⭐' : ''}</option>`
    ).join("");

    // Se só tem 1 ficha, desabilitar mas manter o combo visível
    if (fichasCarregadas.length <= 1) {
      selectFicha.disabled = true;
    } else {
      selectFicha.disabled = false;
    }

    // Listener para trocar de ficha
    selectFicha.removeEventListener("change", trocaFichaSemReloadLoja);
    selectFicha.addEventListener("change", trocaFichaSemReloadLoja);
  } catch (err) {
    console.error("Erro ao carregar fichas:", err);
  }
}

async function trocaFichaSemReloadLoja(e) {
  const novoUID = e.target.value;
  if (!novoUID) return;

  localStorage.setItem("selectedFichaUID", novoUID);
  fichaACarregar = novoUID; // Atualizar variável global

  await carregarDados();
  atualizarDisplay();
  iniciarTimer();
}

/* =========================================================
   CARREGAR DADOS INICIAIS
========================================================= */
async function carregarDados() {
  try {
    // Carregar ficha do jogador (ficha selecionada ou atual)
    const fichRef = doc(db, "fichas", fichaACarregar);
    const fichSnap = await getDoc(fichRef);
    if (fichSnap.exists()) {
      userData = fichSnap.data();
      console.log("✅ Ficha carregada:", userData);
    } else {
      console.warn("❌ Ficha não encontrada:", fichaACarregar);
    }

    // Carregar itens da loja (game_data/loja_v1)
    const lojaRef = doc(db, "game_data", "loja_v1");
    const lojaSnap = await getDoc(lojaRef);
    if (lojaSnap.exists()) {
      const lojaData = lojaSnap.data();
      console.log("✅ Documento loja_v1 carregado:", lojaData);
      itensDoJogo = lojaData.itens || [];
      console.log(`📦 ${itensDoJogo.length} itens carregados da loja`);
    } else {
      console.warn("❌ Documento loja_v1 não encontrado");
      itensDoJogo = [];
    }

    // Carregar inventário do jogador
    await carregarInventarioJogador();

    // Determinar quais itens mostrar (sorteio ou tudo)
    await atualizarItensDisponiveis();
    console.log(`🛍️ ${itensDisponiveis.length} itens disponíveis para exibição`);
  } catch (err) {
    console.error("❌ Erro ao carregar dados:", err);
  }
}

/* =========================================================
   CARREGAR INVENTÁRIO DO JOGADOR
========================================================= */
async function carregarInventarioJogador() {
  try {
    const invRef = collection(db, "player_inventory", fichaACarregar, "items");
    const invSnap = await getDocs(invRef);
    userData.inventario = [];
    invSnap.forEach(doc => {
      userData.inventario.push({ id: doc.id, ...doc.data() });
    });
  } catch (err) {
    console.warn("Inventário não encontrado:", err);
    userData.inventario = [];
  }
}

/* =========================================================
   ATUALIZAR ITENS DISPONÍVEIS (SORTEIO OU TUDO)
========================================================= */
async function atualizarItensDisponiveis() {
  if (!MODO_RANDOM) {
    // Modo simples: mostrar todos os itens
    itensDisponiveis = [...itensDoJogo];
  } else {
    // Modo random: buscar/criar sorteio de domingo
    const lojaRef = doc(db, "game_data", "loja_v1");
    const lojaSnap = await getDoc(lojaRef);
    const lojaData = lojaSnap.data() || {};

    const agora = new Date();
    const proximoDomingo = calcularProximoDomingo();

    // Se última atualização foi antes de domingo às 8h, fazer sorteio novo
    const ultimaSorteio = lojaData.ultimaSorteio ? new Date(lojaData.ultimaSorteio.toDate()) : null;

    if (!ultimaSorteio || ultimaSorteio < proximoDomingo) {
      // Fazer sorteio: pega até 20 itens aleatórios
      itensDisponiveis = (lojaData.itens || []).sort(() => Math.random() - 0.5).slice(0, 20);

      // Salvar data do sorteio no Firestore
      await updateDoc(lojaRef, { ultimaSorteio: serverTimestamp() });
    } else {
      // Usar sorteio anterior
      itensDisponiveis = lojaData.itensSorteados || itensDoJogo;
    }
  }
}

/* =========================================================
   CALCULAR PRÓXIMO DOMINGO 8h
========================================================= */
function calcularProximoDomingo() {
  const now = new Date();
  const proximoDomingo = new Date(now);
  proximoDomingo.setDate(now.getDate() + ((7 - now.getDay()) % 7));
  proximoDomingo.setHours(8, 0, 0, 0);

  // Se já passou de domingo 8h esta semana, vai para próximo
  if (proximoDomingo <= now) {
    proximoDomingo.setDate(proximoDomingo.getDate() + 7);
  }

  return proximoDomingo;
}

/* =========================================================
   TIMER PARA PRÓXIMO SORTEIO
========================================================= */
function iniciarTimer() {
  const atualizarTimer = () => {
    const proximoDomingo = calcularProximoDomingo();
    const agora = new Date();
    const diferenca = proximoDomingo - agora;

    if (diferenca <= 0) {
      document.getElementById("nextSorteio").textContent = "Sorteando agora!";
      atualizarItensDisponiveis();
      atualizarDisplay();
      setTimeout(atualizarTimer, 60000); // atualizar novamente em 1 min
    } else {
      const dias = Math.floor(diferenca / (1000 * 60 * 60 * 24));
      const horas = Math.floor((diferenca / (1000 * 60 * 60)) % 24);
      const minutos = Math.floor((diferenca / 1000 / 60) % 60);

      document.getElementById("nextSorteio").textContent = `${dias}d ${horas}h ${minutos}m`;
      setTimeout(atualizarTimer, 30000); // atualizar a cada 30s
    }
  };

  atualizarTimer();
}

/* =========================================================
   ATUALIZAR DISPLAY (UI)
========================================================= */
function atualizarDisplay() {
  console.log("🔄 atualizarDisplay() chamado");
  
  // header exibe XP/Pontos e select, não usamos infoTopo mais

  // Atualizar header-left (XP e Pontos)
  const playerXpElement = document.getElementById("playerOnlyXp");
  const playerPontosElement = document.getElementById("playerOnlyPontos");
  
  if (playerXpElement && userData.xp !== undefined) {
    const xpMax = 100 * userData.nivel * (userData.nivel + 1) / 2;
    playerXpElement.textContent = `XP: ${userData.xp} / ${xpMax}`;
  }
  if (playerPontosElement) {
    playerPontosElement.textContent = `Pontos: ${userData.pontos || 0}`;
  }

  // Atualizar Ryous do player
  document.getElementById("playerRyous").textContent = userData.ryous || 0;

  // Renderizar loja geral
  const lojaGeralDiv = document.getElementById("lojaGeralItens");
  if (!lojaGeralDiv) {
    console.error("❌ #lojaGeralItens não encontrado no DOM");
    return;
  }

  console.log(`📍 Renderizando ${itensDisponiveis.length} itens na loja geral`);
  
  if (itensDisponiveis.length === 0) {
    lojaGeralDiv.innerHTML = '<div class="empty-state">Nenhum item disponível no momento</div>';
  } else {
    lojaGeralDiv.innerHTML = itensDisponiveis.map(item => `
      <div class="item-card">
        <div class="item-icon">
          ${item.icone ? `<img src="${item.icone}" alt="${item.nome}">` : "📦"}
        </div>
        <div class="item-name">${item.nome}</div>
        <div class="item-price">${item.preco} 💰</div>
        <button class="item-btn" onclick="abrirModalCompra('${item.id}')">Comprar</button>
      </div>
    `).join("");
  }

  // Renderizar inventário do player
  const inventDiv = document.getElementById("meuInventario");
  if (!inventDiv) {
    console.error("❌ #meuInventario não encontrado no DOM");
    return;
  }

  console.log(`🎁 Renderizando ${userData.inventario ? userData.inventario.length : 0} itens do inventário`);
  
  if (!userData.inventario || userData.inventario.length === 0) {
    inventDiv.innerHTML = '<div class="empty-state">Você não tem itens para vender</div>';
  } else {
    inventDiv.innerHTML = userData.inventario.map(item => {
      const rank = item.ranking || item.rank || '';
      const rankHtml = rank ? `<div class="item-rank">[${rank}]</div>` : '';
      return `
      <div class="item-card">
        <div class="item-icon">
          ${item.icone ? `<img src="${item.icone}" alt="${item.nome}">` : "📦"}
        </div>
        <div class="item-name">${item.nome} ${rankHtml}</div>
        <button class="item-btn" onclick="abrirModalVenda('${item.id}')">Vender</button>
      </div>
    `}).join("");
  }
}

/* =========================================================
   ABRIR MODAL COMPRA
========================================================= */
window.abrirModalCompra = function(itemId) {
  itemSelecionado = itensDisponiveis.find(i => i.id === itemId);
  if (!itemSelecionado) return;

  document.getElementById("modalItemImg").src = itemSelecionado.icone || "assets/icons/kuchiyose.png";
  document.getElementById("modalItemName").textContent = itemSelecionado.nome;
  document.getElementById("modalItemDesc").textContent = itemSelecionado.descricao || "Sem descrição";
  document.getElementById("modalItemPrice").textContent = itemSelecionado.preco + " 💰";

  document.getElementById("modalCompra").classList.add("show");
};

/* =========================================================
   CONFIRMAR COMPRA
========================================================= */
window.confirmarCompra = async function() {
  if (!itemSelecionado) return;

  const preco = itemSelecionado.preco;
  const ryousAtuais = userData.ryous || 0;

  if (ryousAtuais < preco) {
    alert("❌ Você não tem Ryous suficientes!");
    return;
  }

  try {
    // Adicionar item ao inventário do player
    await addDoc(collection(db, "player_inventory", fichaACarregar, "items"), {
      nome: itemSelecionado.nome,
      descricao: itemSelecionado.descricao || "",
      icone: itemSelecionado.icone || "",
      preco: itemSelecionado.preco,
      ranking: itemSelecionado.ranking || itemSelecionado.rank || 'E',
      regiao: itemSelecionado.regiao || "Geral",
      adquiridoEm: serverTimestamp()
    });

    // Descontar Ryous
    const novoRyous = ryousAtuais - preco;
    await updateDoc(doc(db, "fichas", fichaACarregar), { ryous: novoRyous });

    userData.ryous = novoRyous;
    fecharModal("modalCompra");
    atualizarDisplay();

    alert(`✅ Item "${itemSelecionado.nome}" comprado com sucesso!`);
  } catch (err) {
    console.error("Erro ao comprar:", err);
    alert("❌ Erro ao comprar item!");
  }
};

/* =========================================================
   ABRIR MODAL VENDA
========================================================= */
window.abrirModalVenda = function(itemId) {
  itemSelecionadoParaVenda = userData.inventario.find(i => i.id === itemId);
  if (!itemSelecionadoParaVenda) return;

  document.getElementById("modalVendItemImg").src = itemSelecionadoParaVenda.icone || "assets/icons/kuchiyose.png";
  document.getElementById("modalVendItemName").textContent = itemSelecionadoParaVenda.nome;
  document.getElementById("modalVendItemDesc").textContent = itemSelecionadoParaVenda.descricao || "Sem descrição";
  document.getElementById("precoVenda").value = Math.floor(itemSelecionadoParaVenda.preco * 0.7); // 70% do preço original

  document.getElementById("modalVenda").classList.add("show");
};

/* =========================================================
   CONFIRMAR VENDA
========================================================= */
window.confirmarVenda = async function() {
  if (!itemSelecionadoParaVenda) return;

  const precoVenda = Number(document.getElementById("precoVenda").value);

  if (precoVenda <= 0) {
    alert("❌ Digite um preço válido!");
    return;
  }

  try {
    // Adicionar Ryous
    const novoRyous = (userData.ryous || 0) + precoVenda;
    await updateDoc(doc(db, "fichas", fichaACarregar), { ryous: novoRyous });

    // Remover item do inventário
    await updateDoc(doc(db, "player_inventory", fichaACarregar, "items", itemSelecionadoParaVenda.id), {
      vendido: true,
      vendidoEm: serverTimestamp()
    });

    // TODO: criar "loja de players" se quiser que outros possam comprar

    userData.ryous = novoRyous;
    fecharModal("modalVenda");
    await carregarInventarioJogador();
    atualizarDisplay();

    alert(`✅ Item "${itemSelecionadoParaVenda.nome}" vendido por ${precoVenda} Ryous!`);
  } catch (err) {
    console.error("Erro ao vender:", err);
    alert("❌ Erro ao vender item!");
  }
};

/* =========================================================
   FECHAR MODAL
========================================================= */
window.fecharModal = function(modalId) {
  document.getElementById(modalId).classList.remove("show");
};

// Fechar modal ao clicar fora
window.onclick = (event) => {
  const modalCompra = document.getElementById("modalCompra");
  const modalVenda = document.getElementById("modalVenda");

  if (event.target === modalCompra) {
    modalCompra.classList.remove("show");
  }
  if (event.target === modalVenda) {
    modalVenda.classList.remove("show");
  }
};
