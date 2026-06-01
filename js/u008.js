export function u008Indeling(leerlingen) {
  const grid = document.getElementById("plattegrond");
  grid.className = "grid row-layout u008-layout";
  grid.innerHTML = "";

  const rijContainer = document.createElement("div");
  rijContainer.className = "u008-columns";

  let index = 0;

  // Linker- en middenkolom: 4 rijen drietafels
  for (let c = 0; c < 2; c++) {
    const kolom = document.createElement("div");
    kolom.className = "u008-column";

    for (let r = 0; r < 4; r++) {
      const namen = [
        leerlingen[index++] || "-",
        leerlingen[index++] || "-",
        leerlingen[index++] || "-"
      ];
      const seatPrefix = `c${c + 1}r${r + 1}`;
      kolom.appendChild(maakTafel(namen, seatPrefix));
    }

    rijContainer.appendChild(kolom);
  }

  // Rechterkolom: 3 rijen duotafels
  const rechterKolom = document.createElement("div");
  rechterKolom.className = "u008-column";

  for (let r = 0; r < 3; r++) {
    const namen = [leerlingen[index++] || "-", leerlingen[index++] || "-"];
    const seatPrefix = `c3r${r + 1}`;
    rechterKolom.appendChild(maakTafel(namen, seatPrefix));
  }

  rijContainer.appendChild(rechterKolom);
  grid.appendChild(rijContainer);
}

function maakTafel(namen, seatPrefix) {
  const tafelContainer = document.createElement("div");
  tafelContainer.className = "duotafel fade-in";

  const tafels = document.createElement("div");
  tafels.className = "tafels";

  namen.forEach((naam, idx) => {
    const tafel = document.createElement("div");
    tafel.className = "tafel";
    tafel.dataset.seatId = `${seatPrefix}s${idx + 1}`;
    tafel.textContent = naam;
    tafels.appendChild(tafel);
  });

  tafelContainer.appendChild(tafels);
  return tafelContainer;
}
