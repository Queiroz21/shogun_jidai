// Progresso salvo
let save = JSON.parse(localStorage.getItem("skillTree") || "{}");
let points = save.points ?? 5;

// Lista com coordenadas + dependências
const skills = [
    { id: "fisico", name:"Treino Físico",  x:650, y:500, max:5, link:[] },
    { id: "chakra", name:"Controle de Chakra", x:450, y:350, max:5, link:["fisico"] },
    { id: "mental", name:"Disciplina Mental", x:850, y:350, max:5, link:["fisico"] },
    { id: "jinchuriki", name:"Força Jinchūriki", x:450, y:650, max:5, link:["fisico"] },
    { id: "construcao", name:"Construção Aldeia", x:850, y:650, max:5, link:["fisico"] },

    // NOVAS — Derivam da primeira habilidade
    { id:"teste1", name:"Teste Avançado 1", x:650, y:300, max:5, link:["fisico"] },
    { id:"teste2", name:"Teste Avançado 2", x:650, y:750, max:5, link:["fisico"] }
];

// aplica progresso
skills.forEach(sk => sk.level = save[sk.id] ?? 0);


// ==================== RENDER =====================
function render() {
    document.getElementById("points").textContent = `Pontos: ${points}`;
    const map = document.getElementById("map");
    const svg = document.getElementById("links");
    map.innerHTML = "";
    svg.innerHTML = "";

    skills.forEach((sk, idx) => {
        const box = document.createElement('div');
        box.className = "skill";

        if (sk.level >= sk.max) box.classList.add("mastered");
        else if (points <= 0)   box.classList.add("locked");

        box.style.left = sk.x + "px";
        box.style.top  = sk.y + "px";

        box.innerHTML = `
            <img src="assets/icons/${sk.id}.png">
            <div>${sk.name}</div>
            <small>${sk.level}/${sk.max}</small>
        `;

        box.onclick = () => levelUp(idx);
        map.appendChild(box);

        // Desenha linhas de dependência
        sk.link.forEach(parentID => {
            const parent = skills.find(s => s.id === parentID);
            if (!parent) return;

            let line = document.createElementNS("http://www.w3.org/2000/svg","line");
            line.setAttribute("x1", parent.x + 55);
            line.setAttribute("y1", parent.y + 55);
            line.setAttribute("x2", sk.x + 55);
            line.setAttribute("y2", sk.y + 55);
            line.setAttribute("stroke", "rgba(200,200,255,0.6)");
            line.setAttribute("stroke-width", "2");
            svg.appendChild(line);
        });
    });
}


// ==================== LEVEL UP =====================
function levelUp(i) {
    const sk = skills[i];

    // Checa dependências
    const locked = sk.link.some(parentID => {
        const parent = skills.find(s => s.id === parentID);
        return parent.level < 1;  // requer 1 ponto
    });
    if (locked) return;

    if (points > 0 && sk.level < sk.max) {
        sk.level++;
        points--;
        save[sk.id] = sk.level;
        save.points = points;
        localStorage.setItem("skillTree", JSON.stringify(save));
        render();
    }
}


// ===================== ZOOM + PAN ======================
let scale = 1;
const wrapper = document.getElementById("map-wrapper");

wrapper.addEventListener("wheel", e => {
    scale += (e.deltaY < 0 ? 0.1 : -0.1);
    scale = Math.max(0.4, Math.min(2.5, scale));
    document.getElementById("map").style.transform = `scale(${scale})`;
});

let dragging = false, startX=0, startY=0, origX=0, origY=0;
wrapper.addEventListener("mousedown", e => { dragging=true; startX=e.clientX; startY=e.clientY; origX=wrapper.scrollLeft; origY=wrapper.scrollTop; });
wrapper.addEventListener("mouseup", ()=> dragging=false);
wrapper.addEventListener("mousemove", e => {
    if (!dragging) return;
    wrapper.scrollLeft = origX + (startX - e.clientX);
    wrapper.scrollTop  = origY + (startY - e.clientY);
});

render();
