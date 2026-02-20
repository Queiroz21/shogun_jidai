// loja.js - Sistema de loja dinâmica com sorteio semanal

import { auth, db, requireAuth } from "./oauth.js";
import {
  doc, getDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp,
  query, where, deleteDoc
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

// mercado peer-to-peer
let marketListings = [];
let myListings = [];

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

    // Carregar anúncios de mercado (p2p)
    await carregarMarketListings();

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
   helpers de mercado peer-to-peer
========================================================= */

async function carregarMarketListings() {
  try {
    const q = query(collection(db, "market_listings"), where("status", "==", "active"));
    const snap = await getDocs(q);
    marketListings = [];
    snap.forEach(d => marketListings.push({ id: d.id, ...d.data() }));
    // ordena por mais recente
    marketListings.sort((a,b) => (b.dateListed?.toDate?.() || new Date()) - (a.dateListed?.toDate?.() || new Date()));
    myListings = marketListings.filter(l => l.sellerId === fichaACarregar);
  } catch (err) {
    console.error("Erro ao carregar listings:", err);
    marketListings = [];
    myListings = [];
  }
}

function renderMarketListings() {
  const container = document.getElementById("mercadoItens");
  if (!container) return;
  if (marketListings.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum anúncio no momento</div>';
    return;
  }
  container.innerHTML = marketListings.map(l => {
    const sellerName = l.sellerNick || l.sellerId;
    return `
      <div class="item-card">
        <div class="item-icon">
          ${l.icone ? `<img src="${l.icone}" alt="${l.itemName}">` : "📦"}
        </div>
        <div class="item-name">${l.itemName}</div>
        <div class="item-type" style="font-size:12px;color:#4af;margin:2px 0 4px 0;">🏷️ ${l.type || '—'}</div>
        <div class="item-price">${l.precoVenda} 💰</div>
        <div class="item-desc" style="font-size:12px;color:#aaa;">${l.descricao || ''}</div>
        <div class="item-market" style="font-size:11px;color:#888;">Valor de mercado: ${l.marketPrice || 0} 💰</div>
        <div class="item-seller" style="font-size:11px;color:#ccc;">Vendedor: ${sellerName}</div>
        <button class="item-btn" onclick="abrirModalCompra('${l.id}','listing')">Comprar</button>
      </div>
    `;
  }).join("");
}

function renderMyListings() {
  const container = document.getElementById("meusAnuncios");
  if (!container) return;
  if (myListings.length === 0) {
    container.innerHTML = '<div class="empty-state">Você não publicou nenhum anúncio</div>';
    return;
  }
  container.innerHTML = myListings.map(l => {
    return `
      <div class="item-card">
        <div class="item-icon">
          ${l.icone ? `<img src="${l.icone}" alt="${l.itemName}">` : "📦"}
        </div>
        <div class="item-name">${l.itemName}</div>
        <div class="item-price">${l.precoVenda} 💰</div>
        <div class="item-desc" style="font-size:12px;color:#aaa;">${l.descricao || ''}</div>
        <button class="item-btn" onclick="retirarListing('${l.id}')">Retirar</button>
      </div>
    `;
  }).join("");
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
        <div class="item-type" style="font-size:12px;color:#4af;margin:2px 0 4px 0;">🏷️ ${item.type || '—'}</div>
        <div class="item-price">${item.preco} 💰</div>
        <button class="item-btn" onclick="abrirModalCompra('${item.id}')">Comprar</button>
      </div>
    `).join("");
  }

  // também renderiza marketplace e meus anúncios
  renderMarketListings();
  renderMyListings();

  // Renderizar inventário do player
  const inventDiv = document.getElementById("meuInventario");
  if (!inventDiv) {
    console.error("❌ #meuInventario não encontrado no DOM");
    return;
  }

  // filtra inventário para excluir items vendidos ou já listados
  const availableItems = (userData.inventario || []).filter(it => !it.vendido && !it.forSale);
  
  // agrupa items com mesmo nome e soma quantidade
  const groupedItems = {};
  availableItems.forEach(item => {
    const key = item.nome;
    if (!groupedItems[key]) {
      groupedItems[key] = {
        ...item,
        quantidade: 1,
        allIds: [item.id]
      };
    } else {
      groupedItems[key].quantidade++;
      groupedItems[key].allIds.push(item.id);
    }
  });
  
  console.log(`🎁 Renderizando ${Object.keys(groupedItems).length} tipos de itens do inventário`);
  
  if (Object.keys(groupedItems).length === 0) {
    inventDiv.innerHTML = '<div class="empty-state">Você não tem itens para vender</div>';
  } else {
    inventDiv.innerHTML = Object.values(groupedItems).map(item => {
      const rank = item.ranking || item.rank || '';
      const rankHtml = rank ? `<div class="item-rank">[${rank}]</div>` : '';
      const qtyDisplay = item.quantidade > 1 ? `<div style="position:absolute;top:6px;right:6px;background:#f0f;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:bold;">×${item.quantidade}</div>` : '';
      return `
      <div class="item-card" style="position:relative;">
        ${qtyDisplay}
        <div class="item-icon">
          ${item.icone ? `<img src="${item.icone}" alt="${item.nome}">` : "📦"}
        </div>
        <div class="item-name">${item.nome} ${rankHtml}</div>
        <div class="item-type" style="font-size:12px;color:#4af;margin:2px 0 4px 0;">🏷️ ${item.type || '—'}</div>
        <button class="item-btn" onclick="abrirModalVenda('${item.allIds[0]}', ${item.quantidade})">Vender</button>
      </div>
    `}).join("");
  }
}

/* =========================================================
   ABRIR MODAL COMPRA
========================================================= */
window.abrirModalCompra = function(itemId, type = 'store') {
  if (type === 'listing') {
    itemSelecionado = marketListings.find(l => l.id === itemId);
    if (!itemSelecionado) return;
    document.getElementById("modalItemImg").src = itemSelecionado.icone || "assets/icons/kuchiyose.png";
    document.getElementById("modalItemName").textContent = itemSelecionado.itemName;
    document.getElementById("modalItemDesc").textContent = itemSelecionado.descricao || "Sem descrição";
    document.getElementById("modalItemPrice").textContent = itemSelecionado.precoVenda + " 💰";
  } else {
    itemSelecionado = itensDisponiveis.find(i => i.id === itemId);
    if (!itemSelecionado) return;
    document.getElementById("modalItemImg").src = itemSelecionado.icone || "assets/icons/kuchiyose.png";
    document.getElementById("modalItemName").textContent = itemSelecionado.nome;
    document.getElementById("modalItemDesc").textContent = itemSelecionado.descricao || "Sem descrição";
    document.getElementById("modalItemPrice").textContent = itemSelecionado.preco + " 💰";
  }

  document.getElementById("modalCompra").classList.add("show");
};

/* =========================================================
   CONFIRMAR COMPRA
========================================================= */
window.confirmarCompra = async function() {
  if (!itemSelecionado) return;

  const ryousAtuais = userData.ryous || 0;

  // determine se é um listing de jogador ou item da loja
  const isListing = !!itemSelecionado.sellerId;
  const preco = isListing ? itemSelecionado.precoVenda : itemSelecionado.preco;

  if (ryousAtuais < preco) {
    alert("❌ Você não tem Ryous suficientes!");
    return;
  }

  // validar que não está comprando seu próprio item
  if (isListing && itemSelecionado.sellerId === fichaACarregar) {
    alert("❌ Você não pode comprar seu próprio anúncio!");
    return;
  }

  try {
    if (!isListing) {
      // compra normal da loja
      await addDoc(collection(db, "player_inventory", fichaACarregar, "items"), {
        nome: itemSelecionado.nome,
        descricao: itemSelecionado.descricao || "",
        icone: itemSelecionado.icone || "",
        preco: itemSelecionado.preco,
        ranking: itemSelecionado.ranking || itemSelecionado.rank || 'E',
        regiao: itemSelecionado.regiao || "Geral",
        adquiridoEm: serverTimestamp()
      });
    } else {
      // compra de anúncio parceiro
      const listing = itemSelecionado;
      // desconta comprador
      const novoRyous = ryousAtuais - preco;
      await updateDoc(doc(db, "fichas", fichaACarregar), { ryous: novoRyous });
      userData.ryous = novoRyous;

      // credita vendedor
      const sellerRef = doc(db, "fichas", listing.sellerId);
      const sellerSnap = await getDoc(sellerRef);
      const sellerData = sellerSnap.exists() ? sellerSnap.data() : {};
      const novoRyousSeller = (sellerData.ryous || 0) + preco;
      await updateDoc(sellerRef, { ryous: novoRyousSeller });

      // marca item no inventário do vendedor como vendido
      if (listing.sellerItemId) {
        await updateDoc(doc(db, "player_inventory", listing.sellerId, "items", listing.sellerItemId), {
          vendido: true,
          vendidoEm: serverTimestamp(),
          soldTo: fichaACarregar
        });
      }

      // adiciona item ao inventário do comprador
      await addDoc(collection(db, "player_inventory", fichaACarregar, "items"), {
        nome: listing.itemName,
        descricao: listing.descricao || "",
        icone: listing.icone || "",
        preco: listing.marketPrice || 0,
        ranking: listing.ranking || '',
        regiao: listing.regiao || "Geral",
        adquiridoEm: serverTimestamp()
      });

      // atualiza listing como vendido
      await updateDoc(doc(db, "market_listings", listing.id), {
        status: 'sold',
        buyerId: fichaACarregar,
        soldDate: serverTimestamp(),
        salePrice: preco
      });

      // registrar log de mercado
      await addDoc(collection(db, "market_logs"), {
        sellerId: listing.sellerId,
        buyerId: fichaACarregar,
        itemId: listing.itemId,
        itemName: listing.itemName,
        price: preco,
        marketPrice: listing.marketPrice,
        description: listing.descricao || '',
        sellerNick: listing.sellerNick || '',
        buyerNick: userData.nick || userData.nome || '',
        date: serverTimestamp()
      });

      alert(`✅ Você comprou "${listing.itemName}" de ${listing.sellerNick || listing.sellerId} por ${preco} Ryous!`);

      // recarrega inventário/market
      await carregarDados();
      atualizarDisplay();
      fecharModal("modalCompra");
      return;
    }

    // Descontar Ryous para compra normal
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
window.abrirModalVenda = function(itemId, maxQuantidade = 1) {
  itemSelecionadoParaVenda = userData.inventario.find(i => i.id === itemId && !i.vendido);
  if (!itemSelecionadoParaVenda) return;

  document.getElementById('modalVendItemImg').src = itemSelecionadoParaVenda.icone || 'assets/icons/kuchiyose.png';
  document.getElementById('modalVendItemName').textContent = itemSelecionadoParaVenda.nome;
  document.getElementById('modalVendItemDesc').textContent = itemSelecionadoParaVenda.descricao || 'Sem descrição';
  document.getElementById('precoVenda').value = Math.floor(itemSelecionadoParaVenda.preco * 0.7);
  document.getElementById('valorMercado').value = itemSelecionadoParaVenda.preco || '';
  document.getElementById('descricaoVenda').value = '';
  
  // configurar selector de quantidade
  const qtyInput = document.getElementById('qtyVenda');
  if (qtyInput) {
    qtyInput.max = maxQuantidade;
    qtyInput.value = 1;
    const qtyLabel = document.getElementById('qtyVendaLabel');
    if (qtyLabel) qtyLabel.textContent = `Quantidade (até ${maxQuantidade})`;
  }

  document.getElementById("modalVenda").classList.add("show");
};

/* =========================================================
   CONFIRMAR VENDA
========================================================= */
window.confirmarVenda = async function() {
  if (!itemSelecionadoParaVenda) return;

  const precoVenda = Number(document.getElementById('precoVenda').value);
  const descricao = document.getElementById('descricaoVenda').value || '';
  const quantidade = Math.max(1, Math.floor(Number(document.getElementById('qtyVenda').value) || 1));

  if (precoVenda <= 0) {
    alert('❌ Digite um preço válido!');
    return;
  }

  try {
    // encontrar todos os items com esse nome para listar
    const itemsAVender = (userData.inventario || []).filter(it => 
      it.nome === itemSelecionadoParaVenda.nome && !it.vendido && !it.forSale
    ).slice(0, quantidade);

    if (itemsAVender.length === 0) {
      alert('❌ Nenhum item disponível!');
      return;
    }

    // criar um anúncio para cada item
    for (const item of itemsAVender) {
      const listingRef = await addDoc(collection(db, 'market_listings'), {
        sellerId: fichaACarregar,
        sellerNick: userData.nick || userData.nome || '',
        itemId: item.id,
        itemName: item.nome,
        icone: item.icone || '',
        ranking: item.ranking || item.rank || '',
        type: item.type || '',
        marketPrice: item.preco || 0,
        precoVenda: precoVenda,
        descricao: descricao,
        status: 'active',
        sellerItemId: item.id,
        dateListed: serverTimestamp()
      });

      // marcar item como listado
      await updateDoc(doc(db, 'player_inventory', fichaACarregar, 'items', item.id), {
        listingId: listingRef.id,
        forSale: true
      });
    }

    fecharModal('modalVenda');
    await carregarDados();
    atualizarDisplay();

    const msgItem = itemsAVender.length === 1 ? 'Item' : `${itemsAVender.length} itens`;
    alert(`✅ ${msgItem} "${itemSelecionadoParaVenda.nome}" listado para venda!`);
  } catch (err) {
    console.error('Erro ao listar item:', err);
    alert('❌ Erro ao listar item!');
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

// permite retirar anúncio do mercado
window.retirarListing = async function(listingId) {
  if (!listingId) return;
  if (!confirm('Deseja realmente retirar este anúncio?')) return;
  try {
    const listingRef = doc(db, "market_listings", listingId);
    const snap = await getDoc(listingRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.sellerId === fichaACarregar && data.status === 'active') {
        await updateDoc(listingRef, { status: 'removed', removedDate: serverTimestamp() });
        if (data.sellerItemId) {
          await updateDoc(doc(db, "player_inventory", fichaACarregar, "items", data.sellerItemId), {
            listingId: null,
            forSale: false
          });
        }
      }
    }
    await carregarMarketListings();
    renderMarketListings();
    renderMyListings();
    alert('Anúncio retirado.');
  } catch (err) {
    console.error('Erro ao retirar anúncio:', err);
    alert('Erro ao retirar anúncio');
  }
};
