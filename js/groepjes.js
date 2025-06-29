export function groepjesIndeling(leerlingen) {
  const aantalVier = 5;
  const aantalVijf = 2;
  const totaalLeerlingen = leerlingen.length;
  const totaalGevraagd = aantalVier * 4 + aantalVijf * 5;

  const grid = document.getElementById("plattegrond");
  grid.className = "grid groepjes-layout"; // Zet correcte class
  grid.innerHTML = "";

  if (totaalLeerlingen !== totaalGevraagd) {
    const foutmelding = document.createElement("p");
    foutmelding.textContent = `⚠️ Fout: aantal leerlingen (${totaalLeerlingen}) past niet in deze indeling (${totaalGevraagd}).`;
    foutmelding.style.color = "red";
    foutmelding.style.fontWeight = "bold";
    grid.appendChild(foutmelding);
    return;
  }

  const shuffled = [...leerlingen].sort(() => 0.5 - Math.random());
  let index = 0;
  const groepGroottes = [
    ...Array(aantalVier).fill(4),
    ...Array(aantalVijf).fill(5)
  ];

  groepGroottes.forEach(grootte => {
    const groepje = document.createElement("div");
    groepje.className = "groepje";

    for (let j = 0; j < grootte; j++) {
      const naam = shuffled[index++];
      const tafel = document.createElement("div");
      tafel.className = "tafel";
      tafel.textContent = naam;
      groepje.appendChild(tafel);
    }

    grid.appendChild(groepje);
  });
}
