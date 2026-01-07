// Carregar progresso salvo
let skillsState = JSON.parse(localStorage.getItem("skillsState") || "{}");

let points = 100;

// Base de habilidades
const skills = [
    { id: "fisico", name: "Treino Físico", img: "assets/icons/fisico.png", max: 100 },
    { id: "chakra", name: "Controle de Chakra", img: "assets/icons/chakra.png", max: 100 },
    { id: "katon", name: "Katon (Fogo)", img: "assets/icons/katon.png", max: 100, parent: "chakra", req: 20 },
    { id: "suiton", name: "Suiton (Água)", img: "assets/icons/suiton.png", max: 100, parent: "chakra", req: 20 },
    { id: "mental", name: "Disciplina Mental", img: "assets/icons/mental.png", max: 100 },
    { id: "construcao", name: "Construção da Aldeia", img: "assets/icons/construcao.png", max: 100 },
    { id: "jinchuriki", name: "Força do Jinchūriki", img: "assets/icons/jinchuriki.png", max: 100 }
];

// aplica progresso salvo
skills.forEach(sk => sk.level = skillsState[sk.id] || 0);

// render
function render() {
    document.getElementById("points").textContent = `Pontos: ${points}`;
    const container = document.getElementById("skills");
    container.innerHTML = "";

    skills.forEach((sk, idx) => {
        const wrapper = document.createElement("div");
        wrapper.className = "skill";

        // trava derivadas se requisito não cumprido
        const lockedByTree = sk.parent && skills.find(s => s.id === sk.parent).level < sk.req;

        if (sk.level >= sk.max) {
            wrapper.classList.add("mastered");
        }
        else if (points <= 0 || lockedByTree) {
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

        wrapper.addEventListener("click", () => levelUp(idx));
        container.appendChild(wrapper);
    });
}

function levelUp(i) {
    const sk = skills[i];

    // requisito da árvore
    if (sk.parent && skills.find(s => s.id === sk.parent).level < sk.req) return;

    if (points > 0 && sk.level < sk.max) {
        sk.level++;
        points--;
        skillsState[sk.id] = sk.level;
        localStorage.setItem("skillsState", JSON.stringify(skillsState));
        render();
    }
}

render();
