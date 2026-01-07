// Carregar progresso salvo
let skillsState = JSON.parse(localStorage.getItem("skillsState") || "{}");

// Dados base (se não existirem salvamentos)
const skills = [
    { id: "fisico", name: "Treino Físico", img: "assets/icons/fisico.png", max: 5 },
    { id: "chakra", name: "Controle de Chakra", img: "assets/icons/chakra.png", max: 5 },
    { id: "mental", name: "Disciplina Mental", img: "assets/icons/mental.png", max: 5 },
    { id: "jinchuriki", name: "Força do Jinchūriki", img: "assets/icons/jinchuriki.png", max: 5 },
    { id: "construcao", name: "Construção da Aldeia", img: "assets/icons/construcao.png", max: 5 }
];

// Carregar níveis preservados
skills.forEach(sk => {
    sk.level = skillsState[sk.id] || 0;
});

let points = 3;

// Atualiza contadores e cards
function render() {
    document.getElementById('points').textContent = `Pontos: ${points}`;
    const container = document.getElementById('skills');
    container.innerHTML = "";

    skills.forEach((sk, idx) => {
        const wrapper = document.createElement('div');

        wrapper.className = "skill";

        // estados da classe
        if (sk.level >= sk.max) {
            wrapper.classList.add("mastered"); // pulsante dourado
        } else if (points <= 0) {
            wrapper.classList.add("locked");
        }

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

// Comprar 1 ponto
function levelUp(i) {
    const sk = skills[i];
    if (points > 0 && sk.level < sk.max) {
        sk.level++;
        points--;

        // salva progresso
        skillsState[sk.id] = sk.level;
        localStorage.setItem("skillsState", JSON.stringify(skillsState));

        render();
    }
}

render();
