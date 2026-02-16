## 🔧 Correção de Permissões Firestore

### Problema Identificado
O novo arquivo `invocacoes.js` estava referenciando a coleção errada:
```javascript
// ❌ ERRADO (não existe nas regras)
doc(db, "users", currentUID)

// ✅ CORRETO (conforme regras)
doc(db, "fichas", currentUID)
```

### Por que isso causava erro
Suas regras Firestore especificam:
```firestore
match /fichas/{userId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && (request.auth.uid == userId || admin == true)
    && !(request.resource.data.admin == true && !isAdmin);
}
```

Mas o código estava tentando acessar `/users/{uid}` que não tem permissão configurada, então Firestore bloqueava todas as leituras e escritas com erro de permissão.

### O que foi corrigido

**Arquivo: `invocacoes.js`**

1. **Linha 378** - Ao invocar/aumentar afinidade:
```javascript
// ❌ ANTES
const userRef = doc(db, "users", currentUID);

// ✅ DEPOIS
const userRef = doc(db, "fichas", currentUID);
```

2. **Linha 423** - Ao carregar dados do usuário no init:
```javascript
// ❌ ANTES
const userRef = doc(db, "users", currentUID);

// ✅ DEPOIS
const userRef = doc(db, "fichas", currentUID);
```

### Verificação Completa
✅ Verificado em todos os arquivos:
- `admin.js` - usando `fichas` ✓
- `app.js` - usando `fichas` ✓
- `perfil.html` - usando `fichas` ✓
- `oauth.js` - usando `fichas` ✓
- `invocacoes.js` - **CORRIGIDO para `fichas`** ✓

### Colecções Confirmadas nas Regras
```
/fichas/{userId}        ← User data (admin, nome, etc)
/game_data/invocacoes_v1  ← Invocations master data
/game_data/skills_v1      ← Skills master data
/xp_logs/{logId}        ← XP history logs
/skill_logs/{logId}     ← Skill edit history logs
/players/{playerId}     ← Players reference list
```

### Status
✅ **Corrigido** - As permissões devem funcionar normalmente agora
