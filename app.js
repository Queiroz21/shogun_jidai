let skillsState = JSON.parse(localStorage.getItem("skillsState") || "{}");

const skills = [
    { id: "chakra", name: "Controle de Chakra", img: "assets/icons/chakra.png", max: 5, children: ["katon","suiton"] },
    { id: "fisico", name: "Treino Físico", img: "assets/icons/fisico.png", max: 5 },
    { id: "mental", name: "Disciplina Mental", img: "assets/icons/mental.png", max: 5 },
    { id: "construcao", name: "Construção da Aldeia", img: "assets/icons/construcao.png", max: 5 },
    { id: "jinchuriki", name: "Força do Jinchūriki", img: "assets/icons/jinchuriki.png", max: 5 },
    { id: "katon", name: "Elemento Katon", img: "assets/icons/fogo.png", max: 5, parent: "chakra" },
    { id: "suiton", name: "Elemento Suiton", img: "assets/icons/agua.png", max: 5, parent: "chakra" }
];

skills.forEach(s => s.level = skillsState[s.id] || 0);

let points = 100;

function render() {
    document.getElementById("points").textContent = `Pontos: ${points}`;
    const chart = document.getElementById("org-chart");
    chart.innerHTML = "";

    const directors = skills.filter(s => !s.parent);

    const directorRow = document.createElement("div");
    directorRow.className = "directors";

    directors.forEach(dir => {
        const branch = document.createElement("div");
        branch.className = "branch";

        branch.appendChild(makeCard(dir));

        const kids = skills.filter(s => s.parent === dir.id);
        if (kids.length && dir.level >= 2) {
            branch.appendChild(line());
            branch.appendChild(childRow(kids));
        }

        directorRow.appendChild(branch);
    });

    chart.appendChild(directorRow);
}

function makeCard(sk) {
    const el = document.createElement("div");
    el.className = "skill";

    if (sk.level >= sk.max) el.classList.add("mastered");
    else if (points <= 0 || (sk.parent && parentLevel(sk.parent) < 2))
        el.classList.add("locked");

    el.innerHTML = `
        <img src="${sk.img}">
        <div>${sk.name}</div>
        <small>(${sk.level}/${sk.max})</small>
    `;

    el.onclick = () => levelUp(sk.id);
    return el;
}

function parentLevel(id) {
    const pr = skills.find(s => s.id === id);
    return pr ? pr.level : 0;
}

function line() {
    const bar = document.createElement("div");
    bar.className = "branch-line";
    return bar;
}

function childRow(arr) {
    const row = document.createElement("div");
    row.className = "child-row";
    arr.forEach(ch => row.appendChild(makeCard(ch)));
    return row;
}

function levelUp(id) {
    const sk = skills.find(s => s.id === id);
    if (!sk) return;
    if (points <= 0) return;
    if (sk.parent && parentLevel(sk.parent) < 2) return;
    if (sk.level >= sk.max) return;

    sk.level++;
    points--;

    skillsState[sk.id] = sk.level;
    localStorage.setItem("skillsState", JSON.stringify(skillsState));

    render();
}

render();
