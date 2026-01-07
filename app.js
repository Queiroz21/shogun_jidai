let skillsState = JSON.parse(localStorage.getItem("skillsState") || "{}");

const skills = [
    { id: "chakra", name: "Controle de Chakra", img: "assets/icons/chakra.png", level: 0, max: 5, children: ["katon","suiton"] },
    { id: "fisico", name: "Treino Físico", img: "assets/icons/fisico.png", level: 0, max: 5 },
    { id: "mental", name: "Disciplina Mental", img: "assets/icons/mental.png", level: 0, max: 5 },
    { id: "construcao", name: "Construção da Aldeia", img: "assets/icons/construcao.png", level: 0, max: 5 },
    { id: "jinchuriki", name: "Força do Jinchūriki", img: "assets/icons/jinchuriki.png", level: 0, max: 5 },
    { id: "katon", name: "Elemento Katon", img: "assets/icons/fogo.png", level: 0, max: 5, parent: "chakra" },
    { id: "suiton", name: "Elemento Suiton", img: "assets/icons/agua.png", level: 0, max: 5, parent: "chakra" }
];

// aplica níveis que já existiam
skills.forEach(sk => sk.level = skillsState[sk.id] || 0);

let points = 100;

function render() {
    document.getElementById('points').textContent = `Pontos: ${points}`;    

    const tree = document.getElementById('tree');
    tree.innerHTML = "";

    const roots = skills.filter(s => !s.parent);

    roots.forEach(root => {
        const wrapper = document.createElement('div');
        wrapper.className = "node";

        const card = buildCard(root);
        wrapper.appendChild(card);

        const children = skills.filter(s => s.parent === root.id);

        if (children.length > 0 && root.level >= 2) {
            wrapper.classList.add("has-children");

            const connector = document.createElement('div');
            connector.className = "child-connector";
            wrapper.appendChild(connector);

            const holder = document.createElement('div');
            holder.className = "children";

            children.forEach(ch => holder.appendChild(buildCard(ch)));
            wrapper.appendChild(holder);
        }

        tree.appendChild(wrapper);
    });
}

function buildCard(sk) {
    const el = document.createElement('div');
    el.className = "skill";

    if (sk.level >= sk.max) el.classList.add("mastered");
    else if (points <= 0 || (sk.parent && skills.find(s=>s.id===sk.parent).level < 2))
        el.classList.add("locked");

    el.innerHTML = `
        <img src="${sk.img}">
        <div>${sk.name}</div>
        <div>(${sk.level}/${sk.max})</div>
    `;

    el.onclick = () => levelUp(sk.id);
    return el;
}

function levelUp(id) {
    const sk = skills.find(s => s.id === id);

    if (!sk) return;
    if (points <= 0) return;
    if (sk.parent) {
        const prnt = skills.find(s => s.id === sk.parent);
        if (prnt.level < 2) return;
    }

    if (sk.level < sk.max) {
        sk.level++;
        points--;
        skillsState[sk.id] = sk.level;
        localStorage.setItem("skillsState", JSON.stringify(skillsState));
        render();
    }
}

render();
