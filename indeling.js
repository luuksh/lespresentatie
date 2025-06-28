const leerlingen = [
  "Samira", "Daan", "Tobias", "Yara", "Levi", "Mila",
  "Noah", "Sophie", "Liam", "Emma", "Finn", "Julia",
  "Lucas", "Nora", "Sem", "Lotte", "Thijs", "Eva",
  "Mats", "Zoë"
];

function husselTweetallen() {
  const shuffled = [...leerlingen].sort(() => 0.5 - Math.random());
  const grid = document.getElementById("plattegrond");
  grid.innerHTML = "";

  for (let i = 0; i < 15; i++) {
    const naam1 = shuffled[i * 2] || "-";
    const naam2 = shuffled[i * 2 + 1] || "-";

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

    grid.appendChild(duotafel);
  }
}

document.addEventListener("DOMContentLoaded", husselTweetallen);
