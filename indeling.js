// indeling.js

const leerlingen = [
  "Samira", "Daan", "Tobias", "Yara", "Levi", "Mila",
  "Noah", "Sophie", "Liam", "Emma", "Finn", "Julia",
  "Lucas", "Nora", "Sem", "Lotte", "Thijs", "Eva",
  "Mats", "Zoë"
];

function kiesIndeling(type) {
  if (type === "h216") {
    h216Indeling();
  } else if (type === "u008") {
    u008Indeling();
  } else if (type === "groepjes") {
    groepjesIndeling();
  }
}

function h216Indeling() {
  const shuffled = [...leerlingen].sort(() => 0.5 - Math.random());
  const grid = document.getElementById("plattegrond");
  grid.innerHTML = "";

  for (let i = 0; i < 15; i++) {
    const naam1 = shuffled[i * 2] || "-";
    const naam2 = shuffled[i * 2 + 1] || "-";

    const duotafel = maakDuotafel(naam1, naam2);
    grid.appendChild(duotafel);
  }
}

function u008Indeling() {
  const shuffled = [...leerlingen].sort(() => 0.5 - Math.random());
  const grid = document.getElementById("plattegrond");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = "repeat(3, 1fr)";

  let i = 0;

  // Linkerkolom en middenkolom: 4 rijen van 3 tafels
  for (let col = 0; col < 2; col++) {
    for (let rij = 0; rij < 4; rij++) {
      const naam1 = shuffled[i++] || "-";
      const naam2 = shuffled[i++] || "-";
      const duotafel = maakDuotafel(naam1, naam2);
      grid.appendChild(duotafel);
    }
  }

  // Rechterkolom: 3 rijen van 2 tafels
  for (let rij = 0; rij < 3; rij++) {
    const naam1 = shuffled[i++] || "-";
    const naam2 = shuffled[i++] || "-";
    const duotafel = maakDuotafel(naam1, naam2);
    grid.appendChild(duotafel);
  }
}

function groepjesIndeling() {
  // Placeholder - voeg je eigen groepsindeling toe
  const grid = document.getElementById("plattegrond");
  grid.innerHTML = "<p>Indeling 'Groepjes' is nog niet geïmplementeerd.</p>";
}

function maakDuotafel(naam1, naam2) {
  const duotafel = document.createElement("div");
  duotafel.className = "duotafel";

  const tafels = document.createElement("div");
  tafels.className = "tafels";

  const tafel1 = document.createElement("div");
  tafel1.className = "tafel";
  tafel1.textContent = naam1;

  const tafel2 = document.createElement("div");
  tafel2.className = "tafel";
  tafel2.textContent = naam2;

  tafels.appendChild(tafel1);
  tafels.appendChild(tafel2);

  const stoelen = document.createElement("div");
  stoelen.className = "stoelen";

  const stoel1 = document.createElement("div");
  stoel1.className = "stoel";

  const stoel2 = document.createElement("div");
  stoel2.className = "stoel";

  stoelen.appendChild(stoel1);
  stoelen.appendChild(stoel2);

  duotafel.appendChild(tafels);
  duotafel.appendChild(stoelen);

  return duotafel;
}

document.addEventListener("DOMContentLoaded", () => {
  kiesIndeling("h216");
});
