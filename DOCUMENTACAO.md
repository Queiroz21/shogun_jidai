# 📚 Documentação do Projeto Shogun Jidai

## 🗺️ Mapa de Navegação do Código

### **app.js** — Árvore de Habilidades
- **xpToReachLevel()** → Calcula XP necessário pra atingir um nível (usado em render, checkLevelUp)
- **calculateLevelFromXP()** → Descobre o nível a partir do XP total (backup, usado em checkLevelUp)
- **normalizeDoujutsus()** → Tolera variações no nome do campo (doujutsus vs doujutsu)
- **loadSkills()** → Carrega skills do Firestore (game_data/skills_v1) com tolerância maiúsculo/minúsculo
- **xpTotalForLevel()** → Cálculo da progressão XP (fórmula: 100 * (level-1) * level / 2)
- **checkLevelUp()** → Detecta level up, distribui +3 pontos árvore e +40 atributo, mostra alerta
- **showLevelUpPopup()** → Alerta com detalhes do level up
- **checkRequirements()** → Valida requisitos da skill (skill level, player level, doujutsu, clan)
- **parseSkillLevels()** → **NOVO** Parser do mega texto, extrai "lvl N → desc" e requisitos
- **renderCarrossel()** → **NOVO** Renderiza carrossel HTML com setas ◄ ►, cores verde/vermelho
- **makeCard()** → **MELHORADO** 3 tipos de tooltip: Guia (simples), Carrossel (padronizado), WIP (aviso)
- **buildBranch()** → Recursivo, monta árvore parent→child de skills
- **render()** → Atualiza tela inteira (header, XP, grid de skills) - MAIN
- **renderTreeByCategory()** → Filtra e renderiza skills por categoria, com filtro doujutsu especial
- **renderNode()** → Recursivo com expansion toggle, monta node visual da skill
- **levelUp()** → Incrementa nível da skill (-1 ponto, +1 level), salva Firebase
- **openConfirm()** → Abre modal com detalhes da skill (onclick em makeCard)
- **closeConfirm()** → Fecha modal e limpa estado temporário
- **Carrossel Event Delegation** → **NOVO** Delegação de eventos para setas, navegação de níveis
- **centerTree()** → Centra viewport da árvore no load e resize

**EVENT LISTENERS:**
- Buttons de categoria (.cat) → mudam currentCategory e chamam renderTreeByCategory()
- btnConfirm onclick → chama levelUp() com pendingSkillId
- btnCancel onclick → chama closeConfirm()
- btnPerfil onclick → navega pra perfil.html
- btnInvocacoes onclick → navega pra invocacoes.html

---

### **perfil.html** — Perfil + Atributos + Skills
- **loadSkills()** → Carrega skills do Firestore (game_data/skills_v1) com tolerância
- **getAllDescendants()** → Helper recursivo pra categorias hierárquicas, retorna Set de skill IDs
- **renderPerfil()** → Renderiza info principal (nick, clã, nível, XP, atributos) - MAIN pra essa tela
- **initializeAttributes()** → Setup tabela de atributos, event listeners, inicializa radar
  - Rastreador **savedAttributeValues** bloqueia redução abaixo do valor salvo!
- **initializeRadarChart()** → Chamador único pra updateRadarChart()
- **updateRadarChart()** → Atualiza gráfico radar com valores atuais dos inputs
- **drawRadarChart()** → Desenha SVG radar com 7 atributos, grid, eixos, polígono vermelho, labels
- **handleAttributeChange()** → Incrementa atributo via botão "+", valida pontos disponíveis
- **validateAttributeInput()** → Valida input manual, bloqueia redução, auto-corrige se exceder
- **updateAttributeDisplay()** → Atualiza displays (usado/disponível), cor vermelha se excedido, chama updateRadarChart()
- **saveAttributes()** → Salva no Firebase, atualiza savedAttributeValues (bloqueia redução)
- **resetAttributes()** → Beta, reseta tudo pra 0 (precisa confirmação)
- **renderSkills()** → Renderiza grid de skills/categorias, evento de categoria buttons
- **showSkillModal()** → Abre modal com detalhes da skill (nome, ícone, desc, requisitos)

**EVENT LISTENERS:**
- Category buttons (.categoria-bar .cat) → mudam filtro e chamam renderSkills()
- Skill cards → chamam showSkillModal()
- #btnSaveAttributes → chama saveAttributes()
- #btnReset → chama resetAttributes()
- closeModal span → fecha modal
- modal onclick → fecha se clicar fora

---

### **invocacoes.js** — Gerenciador de Invocações
- **xpToReachLevel()** → Mesmo do app.js (replicado por independência do módulo)
- **xpTotalForLevel()** → Mesmo do app.js
- **loadInvocacoes()** → Carrega do Firestore (game_data/invocacoes_v1) com tolerância
- **render()** → Atualiza tela inteira (header info, grid invocações) - MAIN
- **renderInvocacoesByCategory()** → Agrupa invocações por categoria, monta grid visual
- **makeCard()** → Cria card clicável com nome, nível, desc, botão ação
- **openConfirm()** → Abre modal de confirmação (onclick em card)
- **invocarSummon()** → Incrementa nível, valida max level, salva Firebase, chama render()

**EVENT LISTENERS:**
- btnPerfil onclick → navega pra perfil.html
- btnArvore onclick → navega pra arvore_habilidade.html
- Skill cards → chamam openConfirm()
- btnConfirm onclick → chama invocarSummon() com ID salvo
- btnCancel onclick → fecha modal

---

## 🎨 NOVO: Sistema de Tooltips Inteligentes (v2.0)

### 3 Tipos de Tooltip:

#### **1️⃣ SKILL GUIA** (max = 0)
```
┌─────────────────────────┐
│ Chakra Elemental        │
│ 🌳 Árvore Guia          │
├─────────────────────────┤
│ Descrição da categoria  │
│ (sem nível, sem level up)
│                         │
│ Chakra > Elemental      │
└─────────────────────────┘
```
- Simples, sem carrossel
- Sem requisitos mostrados
- Sem botão de compra

#### **2️⃣ SKILL COMPRADA COM FORMATO PADRONIZADO** ✨
```
┌────────────────────────────────┐
│ Manipulação de Correntes       │
│ Nível: 2 / 5                   │
├────────────────────────────────┤
│ ◄ Lvl 2/5 ►                    │
│ Detecta inimigos por          │
│ vibrações... [VERDE]           │
├────────────────────────────────┤
│ Requisitos (Lvl 2):            │
│ ✓ Criação de Água: 2/2 [VERDE] │
│ ✗ Nível: 5/10 [VERMELHO]       │
└────────────────────────────────┘
```
- Carrossel interativo com ◄ ►
- Descrição dinâmica por nível
- Cores: Verde (desbloqueado), Vermelho (bloqueado)
- Requisitos atualizados por nível

**Formato esperado no Firestore:**
```
lvl 1 → Controla fluxo próximo (até 5 quadrados)
lvl 2 → Detecta inimigos por vibrações
lvl 3 → Manipula correntes médias (rios)
lvl 4 → Cria redemoínhos (2x2)
lvl 5 → Controla correntes oceânicas

Requisitos:
• Criacao de Agua: 2 / 2
• Suiton: 4 / 4
```

#### **3️⃣ SKILL NÃO-FORMATADA** ⚠️
```
┌─────────────────────────────┐
│ Nome da Skill               │
│ ⚠️ Em Modificação             │
│ Nível: 0 / 5                │
├─────────────────────────────┤
│ [mega texto conforme está   │
│  no Firestore, sem parse]   │
└─────────────────────────────┘
```
- Badge laranja "⚠️ Em Modificação"
- Mostra texto bruto (não parseia)
- Aviso visual de que precisa padronizar

---

### 🔧 Implementação Técnica:

**parseSkillLevels(desc)**
- Procura por regex: `/^lvl\s+(\d+)\s*→\s*(.+)$/i`
- Extrai levels e requisitos
- Retorna `null` se formato não-padronizado

**renderCarrossel(skill)**
- Monta HTML do carrossel
- Setas ◄ ► com data-action
- Template com data-attributes para JS

**Event Delegation**
- Listener único em document para todos os carrosséis
- Busca skill e re-renderiza nível selecionado
- Atualiza cores dinamicamente

---

### 📝 Como Migrar Skills Gradualmente:

1. **Skills críticas primeiro** → Formatar com `lvl N →`
2. **Skills secundárias** → Deixar em WIP temporariamente
3. **Skills guia** → Deixar com max=0 (sem mudanças)
4. **Testar cada uma** → Confirmar cores e requisitos

---



### Coleção: **fichas** (por UID do usuário)
```javascript
{
  nick: "Naruto",
  cla: "Clã Uzumaki",
  nivel: 10,
  xp: 5000,
  pontos: 15,  // pontos da árvore
  skills: { // IDs das skills → levels
    "afundar_punh": 3,
    "jutsu_clone": 1
  },
  atributos: {  // sistema de atributos
    hp: 100,
    sta: 80,
    ag: 60,
    ch: 50,
    vl: 40,
    pm: 30,
    fo: 20
  },
  invocacoes: {  // IDs das invocações → levels
    "sapo_gamabunta": 2
  },
  doujutsus: ["Sharingan", "Rinnegan"]  // array de doujutsus
}
```

### Documento: **game_data/skills_v1**
```javascript
{
  Skills: [
    {
      id: "afundar_punh",
      name: "Afundar Punho",
      category: "fisico",
      parent: null,  // null = root skill
      icon: "...",
      desc: "...",
      requires: [
        { type: "playerLevel", level: 5 },
        { type: "skill", id: "punch", level: 1 }
      ],
      max: 5  // 0 = skill guia (sem level up)
    }
  ]
}
```

### Documento: **game_data/invocacoes_v1** (a criar)
```javascript
{
  Invocacoes: [
    {
      id: "sapo_gamabunta",
      name: "Sapo Gamabunta",
      category: "sapos",
      desc: "Um dos sapos mais fortes",
      max: 5,
      tooltip: "Habilidade especial"
    }
  ]
}
```

---

## 🔐 Regras Firebase (Firestore)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Usuário só pode ler/escrever sua própria ficha
    match /fichas/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    
    // Game data público (skills, invocações)
    match /game_data/{document=**} {
      allow read: if request.auth != null;
    }
  }
}
```

---

## 🎮 Fluxo de Gameplay

### 1. **Árvore de Habilidades** (arvore_habilidade.html)
   - Usuário clica em skill desbloqueada
   - abre Modal com confirmação
   - Clica "Confirmar"
   - levelUp() → -1 ponto, +1 nível skill
   - Firebase salva
   - render() atualiza tudo

### 2. **Perfil** (perfil.html)
   - Mostra statblocks (HP, STA, AG, CH, VL, PM, FO)
   - Usuário distribui pontos de atributo (250 + 40*nivel)
   - Cada + incrementa, valida com savedAttributeValues (impede redução)
   - Clica "Salvar"
   - Firebase salva, atualiza savedAttributeValues
   - Radar atualiza em tempo real

### 3. **Invocações** (invocacoes.html)
   - Usuário clica em invocação
   - Modal pede confirmação
   - Clica "Confirmar"
   - invocarSummon() → +1 nível invocação
   - Firebase salva
   - render() atualiza grid

### 4. **Level Up Global**
   - Quando XP atinge threshold → checkLevelUp()
   - userData.nivel++, userData.pontos += 3, userData.atributos += 40 pontos
   - Mostra alerta com: "Nível X → X+n | Árvore: +3*n | Atributo: +40*n"
   - Firebase salva
   - render() atualiza header

---

## 🛠️ Como Adicionar Nova Página/Sistema

1. **Crie HTML** com layout idêntico à árvore (header, grid container, modal)
2. **Crie JS** baseado em invocacoes.js:
   - Import firebase
   - Estado global (currentUID, userData, items[], state)
   - loadItems() async pra Firestore
   - render() function como MAIN
   - renderGrid() ou renderItems() pra montar visual
   - makeCard() pra card individual
   - Ação main (levelUp, evocar, etc)
   - Event listeners de navegação
3. **Atualize** app.js e perfil.html com botão de navegação novo
4. **Crie documento** no Firestore (game_data/items_v1)
5. **Adicione campo** em userData pra rastrear (userData.items)

Exemplo template pronto em invocacoes.js e invocacoes.html!

---

## ⚠️ Bugs Conhecidos / TODOs

- [ ] resetAttributes() precisa ser testado (está em BETA)
- [ ] Drag scrolling na árvore poderia ser melhorado
- [ ] Modal tooltips podem overlap em telas pequenas
- [ ] Doujutsu filtering: considerar toLowerCase() pra case-insensitive

---

## 📈 Performance

- **Render:** O(n) onde n = skills/invocações na categoria
- **buildBranch/renderNode:** O(n) recursivo, considerado safe pra ~200 skills
- **Firebase:** Operações únicas por ação (update, não create+update)
- **SVG Radar:** Redrawn a cada mudança de atributo (pode otimizar se ficar lento)

---

**Última atualização:** 28/01/2026
**Dev:** Manual, style de veterano 😎
