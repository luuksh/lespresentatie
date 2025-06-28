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

  const rijContainer = document.createElement("div");
  rijContainer.style.display = "flex";
  rijContainer.style.justifyContent = "center";
  rijContainer.style.gap = "2em";

  let index = 0;

  // Linker- en middenkolom: 4 rijen drietafels
  for (let c = 0; c < 2; c++) {
    const kolom = document.createElement("div");
    kolom.style.display = "flex";
    kolom.style.flexDirection = "column";
    kolom.style.gap = "2em";

    for (let r = 0; r < 4; r++) {
      const naam1 = shuffled[index++] || "-";
      const naam2 = shuffled[index++] || "-";
      const naam3 = shuffled[index++] || "-";
      const tafel = maakDrietafel(naam1, naam2, naam3);
      kolom.appendChild(tafel);
    }

    rijContainer.appendChild(kolom);
  }

  // Rechterkolom: 3 rijen duotafels
  const rechterKolom = document.createElement("div");
  rechterKolom.style.display = "flex";
  rechterKolom.style.flexDirection = "column";
  rechterKolom.style.gap = "2em";

  for (let r = 0; r < 3; r++) {
    const naam1 = shuffled[index++] || "-";
    const naam2 = shuffled[index++] || "-";
    const tafel = maakDuotafel(naam1, naam2);
    rechterKolom.appendChild(tafel);
  }

  rijContainer.appendChild(rechterKolom);
  grid.appendChild(rijContainer);
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

function maakDrietafel(naam1, naam2, naam3) {
  const drietafel = document.createElement("div");
  drietafel.className = "duotafel";

  const tafels = document.createElement("div");
  tafels.className = "tafels";

  const tafel1 = document.createElement("div");
  tafel1.className = "tafel";
  tafel1.textContent = naam1;

  const tafel2 = document.createElement("div");
  tafel2.className = "tafel";
  tafel2.textContent = naam2;

  const tafel3 = document.createElement("div");
  tafel3.className = "tafel";
  tafel3.textContent = naam3;

  tafels.appendChild(tafel1);
  tafels.appendChild(tafel2);
  tafels.appendChild(tafel3);

  const stoelen = document.createElement("div");
  stoelen.className = "stoelen";

  const stoel1 = document.createElement("div");
  stoel1.className = "stoel";

  const stoel2 = document.createElement("div");
  stoel2.className = "stoel";

  const stoel3 = document.createElement("div");
  stoel3.className = "stoel";

  stoelen.appendChild(stoel1);
  stoelen.appendChild(stoel2);
  stoelen.appendChild(stoel3);

  drietafel.appendChild(tafels);
  drietafel.appendChild(stoelen);

  return drietafel;
}

document.addEventListener("DOMContentLoaded", () => kiesIndeling("h216"));
