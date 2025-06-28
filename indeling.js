const leerlingen = [
  "Samira", "Daan", "Tobias", "Yara", "Levi", "Mila",
  "Noah", "Sophie", "Liam", "Emma", "Finn", "Julia",
  "Lucas", "Nora", "Sem", "Lotte", "Thijs", "Eva",
  "Mats", "Zoë"
];

function kiesIndeling(type) {
  switch (type) {
    case "h216":
      h216Indeling();
      break;
    case "u008":
      u008Indeling();
      break;
    case "groepjes":
      groepjesIndeling();
      break;
    default:
      h216Indeling();
  }
}

function h216Indeling() {
  const shuffled = [...leerlingen].sort(() => 0.5 - Math.random());
  const grid = document.getElementById("plattegrond");
  grid.innerHTML = "";

  for (let i = 0; i < 15; i++) {
    const naam1 = shuffled[i * 2] || "-";
    const naam2 = shuffled[i * 2 + 1] || "-";
    grid.appendChild(maakDuotafel(naam1, naam2));
  }
}

function u008Indeling() {
  const shuffled = [...leerlingen].sort(() => 0.5 - Math.random());
  const grid = document.getElementById("plattegrond");
  grid.innerHTML = "";

  const patroon = [3, 3, 3, 3, 3, 3, 2, 2, 2];
  let index = 0;

  for (let tafelsInRij of patroon) {
    const rij = document.createElement("div");
    rij.className = "duotafel";
    rij.style.flexDirection = "row";
    rij.style.justifyContent = "center";
    rij.style.gap = "2em";

    for (let i = 0; i < tafelsInRij; i++) {
      const naam1 = shuffled[index++] || "-";
      const naam2 = shuffled[index++] || "-";
      rij.appendChild(maakDuotafel(naam1, naam2));
    }

    grid.appendChild(rij);
  }
}

function groepjesIndeling() {
  const grid = document.getElementById("plattegrond");
  grid.innerHTML = "<p style='color:#999'>Groepjes-indeling volgt nog.</p>";
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

document.addEventListener("DOMContentLoaded", () => kiesIndeling("h216"));
