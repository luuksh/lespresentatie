export function h216Indeling(leerlingen) {
  const grid = document.getElementById("plattegrond");
  grid.innerHTML = "";

  let index = 0;

  for (let rij = 0; rij < 5; rij++) {
    const rijElement = document.createElement("div");
    rijElement.className = "tafelrij";

    for (let kolom = 0; kolom < 3; kolom++) {
      const naam1 = leerlingen[index++] || "-";
      const naam2 = leerlingen[index++] || "-";
      const seatPrefix = `r${rij + 1}k${kolom + 1}`;
      rijElement.appendChild(maakDuotafel(naam1, naam2, seatPrefix));
    }

    grid.appendChild(rijElement);
  }
}

function maakDuotafel(naam1, naam2, seatPrefix) {
  const duotafel = document.createElement("div");
  duotafel.className = "duotafel fade-in";

  const tafels = document.createElement("div");
  tafels.className = "tafels";

  [naam1, naam2].forEach((naam, idx) => {
    const tafel = document.createElement("div");
    tafel.className = "tafel";
    tafel.dataset.seatId = `${seatPrefix}s${idx + 1}`;
    tafel.textContent = naam;
    tafels.appendChild(tafel);
  });

  duotafel.appendChild(tafels);
  return duotafel;
}
