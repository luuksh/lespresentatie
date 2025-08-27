export function groepjesIndeling(leerlingen) {
  const aantalVier = 5;
  const aantalVijf = 2;
  const totaalGevraagd = aantalVier * 4 + aantalVijf * 5;

  const grid = document.getElementById("plattegrond");
  grid.className = "grid groepjes-layout";   // ← belangrijk
  grid.innerHTML = "";

  if (leerlingen.length !== totaalGevraagd) {
    const fout = document.createElement("p");
    fout.textContent = `⚠️ Aantal leerlingen (${leerlingen.length}) past niet in de groepsindeling (${totaalGevraagd}).`;
    fout.style.color = "red";
    fout.style.fontWeight = "bold";
    grid.appendChild(fout);
    return;
  }

  const shuffled = [...leerlingen].sort(() => Math.random() - 0.5);
  const groepGroottes = [...Array(aantalVier).fill(4), ...Array(aantalVijf).fill(5)];

  let index = 0;
  groepGroottes.forEach((grootte) => {
    const groep = document.createElement("div");
    groep.className = "groepje";
    groep.dataset.size = String(grootte); // triggert jouw CSS

    for (let i = 0; i < grootte; i++) {
      const kaart = document.createElement("div");
      kaart.className = "tafel";
      kaart.textContent = shuffled[index++];
      groep.appendChild(kaart);
    }

    // optioneel: 5-persoons netjes als 2x3 met 1 leeg vakje
    if (grootte === 5) {
      const empty = document.createElement("div");
      empty.className = "placeholder";
      groep.appendChild(empty);
    }

    grid.appendChild(groep);
  });
}
