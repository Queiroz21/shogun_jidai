let totalPoints = 100;

const skills = {
  chakra: { points: 0, children: ["katon", "suiton"] },
  fisico: { points: 0 },
  mental: { points: 0 },
  construcao: { points: 0 },
  jin: { points: 0 },
  katon: { points: 0, parent: "chakra" },
  suiton: { points: 0, parent: "chakra" }
};

function render() {
  document.getElementById("points").textContent = `Pontos disponíveis: ${totalPoints}`;

  document.querySelectorAll(".skill").forEach(el => {
    const id = el.dataset.skill;
    const s = skills[id];

    // lock/unlock filhos do chakra
    if (s.parent === "chakra") {
      if (skills.chakra.points >= 2) el.classList.remove("locked");
      else el.classList.add("locked");
    }

    // ajusta borda masterizada
    if (s.points >= 5) el.classList.add("mastered");
    else el.classList.remove("mastered");

    el.textContent = `${id} (${s.points}/5)`;
  });

  drawLines();
}

function spendPoint(id) {
  const s = skills[id];

  // bloqueado?
  if (document.querySelector(`[data-skill=${id}]`).classList.contains("locked")) return;
  if (s.points >= 5) return;
  if (totalPoints <= 0) return;

  s.points++;
  totalPoints--;
  render();
}

document.querySelectorAll(".skill").forEach(el =>
  el.addEventListener("click", () => spendPoint(el.dataset.skill))
);

function drawLines() {
  const svg = document.getElementById("lines");
  svg.innerHTML = "";

  skills.chakra.children.forEach(child => {
    const parentEl = document.querySelector(`[data-skill='chakra']`);
    const childEl = document.querySelector(`[data-skill='${child}']`);

    const p = parentEl.getBoundingClientRect();
    const c = childEl.getBoundingClientRect();

    const x1 = p.left + p.width / 2;
    const y1 = p.top + p.height;
    const x2 = c.left + c.width / 2;
    const y2 = c.top;

    const line = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="cyan" stroke-width="2"/>`;
    svg.innerHTML += line;
  });
}

render();
