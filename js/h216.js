export function h216Indeling(leerlingen) {
  const shuffled = [...leerlingen].sort(() => Math.random() - 0.5);
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

  [naam1, naam2].forEach(naam => {
    const tafel = document.createElement("div");
    tafel.className = "tafel";
    tafel.textContent = naam;
    tafels.appendChild(tafel);
  });

  duotafel.appendChild(tafels);
  return duotafel;
}
