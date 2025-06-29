export function h216Indeling(leerlingen) {
  const shuffled = [...leerlingen].sort(() => 0.5 - Math.random());
  const grid = document.getElementById("plattegrond");
  grid.innerHTML = "";

  let index = 0;

  for (let rij = 0; rij < 5; rij++) {
    const rijElement = document.createElement("div");
    rijElement.className = "tafelrij";

    for (let kolom = 0; kolom < 3; kolom++) {
      const naam1 = shuffled[index++] || "-";
      const naam2 = shuffled[index++] || "-";
      rijElement.appendChild(maakDuotafel(naam1, naam2));
    }

    grid.appendChild(rijElement);
  }
}

function maakDuotafel(naam1, naam2) {
  const duotafel = document.createElement("div");
  duotafel.className = "duotafel fade-in";

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
