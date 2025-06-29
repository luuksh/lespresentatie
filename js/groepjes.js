export function groepjesIndeling(leerlingen) {
  const aantalVier = 5;
  const aantalVijf = 2;
  const totaalGevraagd = aantalVier * 4 + aantalVijf * 5;

  const grid = document.getElementById("plattegrond");
  grid.className = "grid"; // Verwijder 'groepjes-layout' om stylingconflict te voorkomen
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
  for (const grootte of groepGroottes) {
    for (let i = 0; i < grootte; i++) {
      const naam = shuffled[index++];
      const tafel = document.createElement("div");
      tafel.className = "tafel";
      tafel.textContent = naam;
      grid.appendChild(tafel);
    }
  }
}
