# 📝 Exemplos de Formatação de Skills

## ✅ SKILL COMPRADA COM CARROSSEL (Formato Correto)

### Exemplo 1: Manipulação de Correntes
```
lvl 1 → Controla fluxo próximo (até 5 quadrados) para fortalecer seus jutsus
lvl 2 → Detecta inimigos por vibrações, permitindo movimento da água (5 quadrados)
lvl 3 → Manipula correntes médias (rios) fortalecer seus jutsus
lvl 4 → Cria redemoínhos (2x2) para dificultar fuga, mesmo em terra por alto consumo
lvl 5 → Controla correntes oceânicas (subindo de navegação)

Requisitos:
• Criacao de Agua: 2 / 2
• Suiton: 4 / 4
```

**Resultado no Tooltip:**
- ◄ Lvl 1/5 ►
- "Controla fluxo próximo..." [VERDE ou VERMELHO]
- Requisitos: Criacao de Agua: 2/2 ✓, Suiton: 4/4 ✓

---

### Exemplo 2: Jutsu Clone
```
lvl 1 → Cria um clone simples que copia seus movimentos
lvl 2 → Cria 2 clones com maior durabilidade
lvl 3 → Cria 3 clones independentes
lvl 4 → Clones ganham força 50% superior
lvl 5 → Clones podem usar seus jutsus

Requisitos:
• Manipulacao de Chakra: 1 / 1
• Nível Mínimo: 5 / 5
```

---

## ❌ SKILL GUIA (Sem Carrossel)

No seu Firestore, defina `max: 0`:

```javascript
{
  id: "chakra_elemental",
  name: "Chakra Elemental",
  max: 0,  // ← Isso torna uma skill guia
  category: "chakra",
  desc: "Fundação de todos os jutsus elementares. Aprenda a manipular a natureza do seu chakra."
}
```

**Resultado no Tooltip:**
```
┌────────────────────────────┐
│ Chakra Elemental           │
│ 🌳 Árvore Guia             │
├────────────────────────────┤
│ Fundação de todos os...    │
│                            │
│ Chakra                     │
└────────────────────────────┘
```

---

## 🟠 SKILL EM DESENVOLVIMENTO (Aviso)

Se a skill não tiver formato `lvl N →`, será mostrada assim:

```javascript
{
  id: "jutsu_novo",
  name: "Jutsu Novo",
  max: 3,
  desc: "Este é um mega texto que ainda não foi formatado com lvl 1 → lvl 2 → etc. Por enquanto fica como está, mas com aviso."
}
```

**Resultado no Tooltip:**
```
┌──────────────────────────┐
│ Jutsu Novo               │
│ ⚠️ Em Modificação          │
│ Nível: 0 / 3             │
├──────────────────────────┤
│ Este é um mega texto...  │
└──────────────────────────┘
```

---

## 🎯 Pontos Críticos de Formatação

✅ **CORRETO:**
```
lvl 1 → Descrição com espaço antes e depois da seta
lvl 2 → Outra descrição
lvl 3 → Mais uma

Requisitos:
• Item: X / Y
```

❌ **ERRADO:**
```
lvl1→Sem espaços
lvl 2 Sem seta
lvl3->Seta errada
Requisitos sem linha vazia antes
```

---

## 📊 Template Pronto para Copiar

Copie e use como base:

```
lvl 1 → [Descrição do nível 1]
lvl 2 → [Descrição do nível 2]
lvl 3 → [Descrição do nível 3]
lvl 4 → [Descrição do nível 4]
lvl 5 → [Descrição do nível 5]

Requisitos:
• [Requisito 1]: X / Y
• [Requisito 2]: X / Y
• [Requisito 3]: X / Y
```

---

## 🔍 Debug: Como Saber se Está Funcionando

1. **Abra o DevTools** (F12)
2. **Vá na aba Console**
3. **Passe o mouse sobre uma skill com carrossel**
4. Se ver no console: "parseSkillLevels() found X levels" = ✅ Funcionando
5. Clique nas setas ◄ ► = Deve mudar o nível e a cor

---

## 🚀 Migração Gradual

**Semana 1:** Formatar 2-3 skills principais
**Semana 2:** Formatar 5 skills secundárias
**Semana 3:** Completar as restantes
**Permanente:** Skills novas já nascem formatadas

Skills com ⚠️ aviso continuam funcionando, não há pressa!

---

**Última atualização:** 28/01/2026
