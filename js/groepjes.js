export function groepjesIndeling(leerlingen) {
  const aantalVier = 5;
  const aantalVijf = 2;
  const totaalGevraagd = aantalVier * 4 + aantalVijf * 5;

  const grid = document.getElementById("plattegrond");
  grid.className = "groepjes-layout"; // geeft de juiste grid-styling
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
  groepGroottes.forEach((grootte, gIdx) => {
    // container per groep
    const groep = document.createElement("div");
    groep.className = "groep";

    const title = document.createElement("div");
    title.className = "groep-titel";
    title.textContent = `Groep ${gIdx + 1} (${grootte})`;
    groep.appendChild(title);

    const roster = document.createElement("div");
    roster.className = "tafel-grid";
    // optioneel: iets andere vorm voor 5
    roster.dataset.size = String(grootte);
    groep.appendChild(roster);

    for (let i = 0; i < grootte; i++) {
      const naam = shuffled[index++];
      const kaart = document.createElement("div");
      kaart.className = "tafel";
      kaart.textContent = naam;
      roster.appendChild(kaart);
    }

    grid.appendChild(groep);
  });
}
