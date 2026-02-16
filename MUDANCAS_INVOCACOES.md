# MUDANÇAS NA INTERFACE DE INVOCAÇÕES

## 📝 Resumo das Alterações

A interface de invocações (`invocacoes.html` e `invocacoes.js`) foi completamente redesenhada para ser **visual e hierárquica**, similar à estrutura de `arvore_habilidade.html`.

---

## 🎨 Novo Layout

### Estrutura Hierárquica
```
Árvore de Invocações
├── [Abas de Regiões]
│   └── Fogo | Relâmpago | Terra | etc.
│
└── Para cada Região:
    ├── [Família 1] 🐾 (ícone + nome + toggle)
    │   ├── [Animal 1] (com ícone + afinidade)
    │   ├── [Animal 2]
    │   └── [Animal 3]
    │
    ├── [Família 2] 🐾
    │   ├── [Animal 1]
    │   └── (nenhuma invocação disponível)
    │
    └── [Família 3] 🐾
        └── [Animal 1]
```

---

## 🔑 Principais Mudanças

### 1. **Famílias Agora São Nós Expandíveis (como a árvore de habilidades)**
   - Cada família tem um **ícone grande (90x90px)** + nome
   - Botão **+/-** para expandir/recolher
   - Famílias vazias são exibidas normalmente (com texto "(Nenhuma invocação disponível)")
   - Descrição da família aparece como **tooltip** ao passar o mouse

### 2. **Animais Agora São Cards Compactos (como skills)**
   - Ícone menor (70x70px) + nome + barra de afinidade
   - **Ícone dinâmico:**
     - `kuchiyose.png` = desbloqueada (cor normal)
     - `kuchiyose_locked.png` = bloqueada (opacity 0.5 + grayscale)
   - **Barra de Afinidade** (3px) mostra progresso: `0/max` até `max/max`
   - **Tooltip** ao passar mouse com:
     - Nome do animal
     - Nível de afinidade atual e máximo
     - Descrição (se existir)
     - Jutsus desbloqueados (✓ verde para desbloqueados, ⊘ vermelho para bloqueados)

### 3. **Substituição de Termo: XP → Afinidade**
   - Todas as referências a "XP de invocação" agora usam **"Afinidade"**
   - Barras de progresso mostram "Afinidade: X/max"
   - Mais semântico e tematicamente apropriado

### 4. **Lógica de Bloqueio/Desbloqueio**
   ```javascript
   - Admin vê TODAS as invocações como interactive (sempre "desbloqueável")
   - Usuário vê TODAS as invocações, mas:
     - ✓ Desbloqueada = se tem no ficha (userData.invocacoes[invId] > 0)
     - 🔒 Bloqueada = se NÃO tem ainda
   - Cards bloqueados não são clicáveis (nem DMs)
   ```

### 5. **Interatividade**
   - Clique em um animal → Modal de confirmação
   - Modal mostra jutsus desbloqueados
   - Confirmar → aumenta afinidade em +1
   - Afinidade máxima = `inv.max` (padrão 10)

---

## 📂 Arquivos Modificados

### `invocacoes.html` (completo)
- Layout semelhante a `arvore_habilidade.html`
- Abas de regiões em vez de categorias
- Grid responsivo para familias/animais
- CSS inline para estilo de árvore (family nodes, animal cards, toggles, etc.)

### `invocacoes.js` (completo reescrito)
- **Novas funções:**
  - `loadInvocacoesAndRegions()` - Carrega dados do Firestore
  - `extractUniqueRegions()` - Extrai regiões únicas (inclui vazias)
  - `setupRegionTabs()` - Cria abas clicáveis
  - `selectRegion()` - Muda região ativa e renderiza
  - `render()` - Renderiza árvore completa
  - `makeFamiliaNode()` - Cria nó de família com toggle
  - `makeAnimalCard()` - Cria card de animal com interatividade
  - `openConfirm()` - Modal de confirmação
  - `invocarSummon()` - Aumenta afinidade e salva no Firestore
  - `setupButtons()` - Liga botões de navegação
  
- **Estrutura:**
  - Importa Firebase auth/firestore
  - Responde a `onAuthStateChanged()`
  - Carrega dados do user e invocacoes_v1
  - Rende árvore com estado persistente

---

## 🎯 Fluxo de Uso

1. **Usuário acessa invocacoes.html**
   ↓
2. **Auth carrega dados:**
   - userData (incluindo userData.invocacoes = {invId: afinidadeLevel})
   - invocacoes[] array
   - regions{} object
   ↓
3. **Extrai regiões e cria abas**
   ↓
4. **Seleciona primeira região por padrão**
   ↓
5. **Renderiza famílias com animais:**
   - Famílias aparecem com ícone + nome
   - Animais aparecem em grid expandível
   - Icons são dinâmicos based on userData.invocacoes
   ↓
6. **Interação:**
   - Clima em animal → modal
   - Confirma → afinidade +1 → Firebase update → re-render

---

## 🔧 Configuração no Firestore

### Estrutura esperada em `game_data/invocacoes_v1`:

```json
{
  "invocacoes": [
    {
      "id": "pakku",
      "name": "Pakku",
      "region": "fogo",
      "family": "cachorros",
      "rank": "S",
      "max": 10,
      "desc": "Um cachorro leal...",
      "icon": "assets/icons/pakku.png",
      "jutsus": [
        {"name": "Fogo", "unlockLevel": 1, "element": "fogo", "description": "..."},
        {"name": "Chama Explosiva", "unlockLevel": 5, "element": "fogo", "description": "..."}
      ]
    }
  ],
  "regions": {
    "fogo": {
      "name": "Fogo",
      "families": {
        "cachorros": {
          "name": "Cachorros",
          "description": "Família de summons caninos do reino do Fogo",
          "icon": "assets/icons/dogs.png",
          "rankings": {
            "S": true,
            "A": true
          }
        },
        "macacos": {
          "name": "Macacos",
          "icon": "assets/icons/monkeys.png",
          ...
        }
      }
    }
  }
}
```

### Estrutura no users/{uid}:

```json
{
  "invocacoes": {
    "pakku": 5,
    "ape": 0,
    ...
  }
}
```

---

## 🎨 Estilo Visual

- **Cores:** Azul ciano (#4af) como tema principal
- **Ícones:** 90x90px para famílias, 70x70px para animais
- **Afinidade bar:** 3px, gradiente verde→ciano
- **Bloqueado:** opacidade 0.5 + grayscale 70%
- **Hover:** scale 1.08 + glow

---

## ✅ Checklist de Funcionalidades

- [x] Abas de regiões (clicáveis, com nome, não ID)
- [x] Famílias com ícones dinâmicos
- [x] Famílias vazias aparecem no display
- [x] Toggle +/- para expandir/recolher famílias
- [x] Descrição de família como tooltip
- [x] Cards de animais com ícone 70x70
- [x] Ícone dinâmico (locked/unlocked) based on userData.invocacoes
- [x] Barra de afinidade com progresso
- [x] Tooltip com nome, afinidade, desc, jutsus
- [x] Jutsus mostram status de desbloqueio (✓/⊘)
- [x] Click para invocar (se não bloqueado)
- [x] Modal de confirmação com jutsus desbloqueados
- [x] Aumenta afinidade +1 ao invocar
- [x] Persiste em Firebase
- [x] Admin bypassa bloqueio
- [x] Termo "Afinidade" em vez de "XP"

---

## 🚀 Testing

Para testar:
1. Acesse `invocacoes.html`
2. Certifique-se de estar logged in
3. Veja as famílias expandidas por padrão
4. Clique em +/- para recolher/expandir
5. Clique em um animal desbloqueado → modal aparece
6. Clique em um animal bloqueado → alerta "não desbloqueou"
7. Confirme → afinidade aumenta
8. Recarregue página → afinidade persiste

---

## 📌 Próximos Passos (Opcional)

- [ ] Adicionar animações ao expandir/recolher famílias
- [ ] Efeito de "level up" ao atingir afinidade máxima
- [ ] Ícones de brilho para jutsus desbloqueados
- [ ] Estatísticas gerais (total de invocações, afinidade média, etc.)
- [ ] Filtro por status (desbloqueadas, bloqueadas, perfeitas)
