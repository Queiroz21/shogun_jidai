// Carregar progresso salvo
let skillsState = JSON.parse(localStorage.getItem("skillsState") || "{}");

// Dados base da árvore
const skills = [
    { id: "fisico", name: "Treino Físico", img: "assets/icons/fisico.png", max: 5 },
    { id: "chakra", name: "Controle de Chakra", img: "assets/icons/chakra.png", max: 5 },
    { id: "mental", name: "Disciplina Mental", img: "assets/icons/mental.png", max: 5 },
    { id: "jinchuriki", name: "Força do Jinchūriki", img: "assets/icons/jinchuriki.png", max: 5 },
    { id: "construcao", name: "Construção da Aldeia", img: "assets/icons/construcao.png", max: 5 }
];

// Aplicar níveis salvos ou iniciar em 0
skills.forEach(sk => {
    sk.level = skillsState[sk.id] || 0;
});

// Pontos disponíveis
let points = 3;

function render() {
    const pointsEl = document.getElementById('points');
    const container = document.getElementById('skills');
    
    if (!pointsEl || !container) return; // evita erro caso ids não existam ainda

    pointsEl.textContent = `Pontos: ${points}`;
    container.innerHTML = "";

    skills.forEach((sk, idx) => {
        const wrapper = document.createElement('div');

        // Classes básicas
        let className = "skill";

        if (sk.level >= sk.max) {
            className += " mastered";      // 5/5 → dourado pulsante
        } else if (points <= 0) {
            className += " locked";        // sem pontos → cinza fraco
        } else {
            className += " available";     // ativo normal
        }

        wrapper.className = className;

        wrapper.innerHTML = `
            <img src="${sk.img}" />
            <div>${sk.name}</div>
            <div>(${sk.level}/${sk.max})</div>
            <div class="progress">
                <div class="progress-bar" style="width:${(sk.level/sk.max)*100}%"></div>
            </div>
        `;

        wrapper.addEventListener('click', () => levelUp(idx));
        container.appendChild(wrapper);
    });
}

function levelUp(i) {
    const sk = skills[i];
    if (points <= 0) return;
    if (sk.level >= sk.max) return;

    sk.level++;
    points--;

    // salva progresso
    skillsState[sk.id] = sk.level;
    localStorage.setItem("skillsState", JSON.stringify(skillsState));

    render();
}

render();
