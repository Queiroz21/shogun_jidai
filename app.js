console.log("JS carregado do arquivo externo!");

let points = 3; // simula pontos iniciais
let skillsState = JSON.parse(localStorage.getItem("skillsState") || "{}");

document.getElementById("points-value").textContent = points;

async function load() {
  const res = await fetch("data/skills.json");
  const skills = await res.json();
  render(skills);
}

function render(skills) {
  const container = document.getElementById("skills-container");

  skills.forEach(skill => {
    const id = skill.id;
    const fragments = skillsState[id] || 0;

    const card = document.createElement("div");
    card.className = "skill-card";

    const svg = makePizza(`assets/icons/${skill.icon}`, fragments);
    if (fragments >= 5) {
	  svg.classList.add("state-mastered");
	  svg.classList.remove("state-locked");
	  svg.classList.remove("state-available");
	} 
	else if (fragments > 0) {
	  svg.classList.add("state-available");
	  svg.classList.remove("state-locked");
	  svg.classList.remove("state-mastered");
	}
	else {
	  svg.classList.add("state-locked");
	  svg.classList.remove("state-mastered");
	  svg.classList.remove("state-available");
	}

    svg.addEventListener("click", () => buy(id));

    const label = document.createElement("p");
    label.textContent = skill.name;

    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.textContent = `${skill.name} (${fragments}/5)`;

    card.append(svg, label, tooltip);
    container.append(card);
  });
}

function buy(id) {
  if (points <= 0) return;
  skillsState[id] = (skillsState[id] || 0) + 1;
  points--;
  localStorage.setItem("skillsState", JSON.stringify(skillsState));
  location.reload();
}

function makePizza(icon, fragments) {
  const svgns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("width", "100");

  const angles = [
    [50,50,50,0,97,35],
    [50,50,97,35,79,90],
    [50,50,79,90,21,90],
    [50,50,21,90,3,35],
    [50,50,3,35,50,0]
  ];

  angles.forEach((p, i) => {
    const path = document.createElementNS(svgns, "path");
    path.setAttribute("d", `M${p[0]},${p[1]} L${p[2]},${p[3]} A50,50 0 0,1 ${p[4]},${p[5]} Z`);
    path.setAttribute("class", "slice");
    if (i < fragments) path.classList.add("acquired");
    svg.appendChild(path);
  });

  const img = document.createElementNS(svgns, "image");
  img.setAttribute("href", icon);
  img.setAttribute("x", "22");
  img.setAttribute("y", "22");
  img.setAttribute("width", "56");
  img.setAttribute("height", "56");
  svg.appendChild(img);

  return svg;
}

load();
