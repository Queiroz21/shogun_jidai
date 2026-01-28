# 📊 Estrutura de Dados do Firestore

## Skills Collection (game_data/skills_v1)

### Campo: `requires` (ARRAY DE OBJETOS)

**NÃO** use `requisitos`, use `requires`:

```javascript
{
  id: "manipulacao_offensive",
  name: "Manipulação Ofensiva",
  max: 5,
  level: 0,
  parent: null,
  category: "fisica",
  icon: "manipulacao",
  type: "leaf",  // ← Tipo de nó (leaf, branch, guide)
  
  desc: `lvl 1 → Controla fluxo próximo (até 5 quadrados)
lvl 2 → Detecta inimigos por vibrações
lvl 3 → Manipula correntes médias
lvl 4 → Cria redemoínhos
lvl 5 → Controla correntes oceânicas

Requisitos:
• Criacao de Agua: 2 / 2
• Suiton: 4 / 4`,

  requires: [  // ← ARRAY DE REQUISITOS
    {
      type: "skill",
      id: "criacao_agua",
      level: 2
    },
    {
      type: "skill", 
      id: "suiton",
      level: 4
    },
    {
      type: "playerLevel",
      level: 10
    },
    {
      type: "doujutsu",
      value: "Sharingan"
    },
    {
      type: "clan",
      value: "Uchiha"
    },
    {
      type: "region",
      value: "Konohagakure"
    }
  ]
}
```

---

## Tipos de Requisitos

| Tipo | Campos | Exemplo |
|------|--------|---------|
| `skill` | `type`, `id`, `level` | `{type: "skill", id: "suiton", level: 4}` |
| `playerLevel` | `type`, `level` | `{type: "playerLevel", level: 10}` |
| `doujutsu` | `type`, `value` | `{type: "doujutsu", value: "Sharingan"}` |
| `clan` | `type`, `value` | `{type: "clan", value: "Uchiha"}` |
| `region` | `type`, `value` | `{type: "region", value: "Konohagakure"}` |

---

## Campo: `type`

Indica o tipo de nó da skill na árvore:

| Valor | Significado | Uso |
|-------|-------------|-----|
| `leaf` | Nó folha (fim da árvore) | Skill sem filhos |
| `branch` | Nó intermediário | Skill com filhos |
| `guide` | Habilidade guia (max=0) | Skill de informação |

---

## Exemplo Completo de Skill Guia

```javascript
{
  id: "chakra_elemental",
  name: "Chakra Elemental",
  max: 0,           // ← ZERO = Skill Guia
  category: "chakra",
  type: "leaf",     // ← ou "guide" opcionalmente
  icon: "chakra",
  desc: "Fundação de todos os jutsus elementares. Aprenda a manipular a natureza do seu chakra.",
  requires: []      // ← Vazio ou pode omitir
}
```

---

## Exemplo Completo de Skill em Desenvolvimento

```javascript
{
  id: "jutsu_novo",
  name: "Jutsu Novo",
  max: 3,
  level: 0,
  category: "elemento",
  type: "leaf",
  icon: "elemento",
  desc: "Este é um mega texto que ainda não foi formatado com lvl 1 → lvl 2 → etc. Por enquanto fica como está, mas com aviso na tela.",
  requires: [
    {
      type: "playerLevel",
      level: 15
    }
  ]
}
```

---

## Checklist para Migração

- [ ] Todos os campos `requisitos` renomeados para `requires`
- [ ] Todos os requisitos têm campo `type`
- [ ] Skills antigas atualizadas com `type: "leaf"` ou `"branch"`
- [ ] Campo `desc` em skills compradas formatado com `lvl N →`
- [ ] Campo `requires` é ARRAY (nunca string ou objeto único)
- [ ] Testar cada skill no navegador (F12 → Console)

---

## Debug: Ver Estrutura no Console

```javascript
// No console do navegador:
console.log(skills[0]);  // Mostra estrutura completa da primeira skill
```

Deve aparecer assim:
```
{
  id: "...",
  name: "...",
  max: 5,
  level: 0,
  type: "leaf",
  requires: Array(3) [...]  // ← Array, não objeto único!
}
```
