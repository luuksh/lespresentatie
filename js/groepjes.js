export function groepjesIndeling(leerlingen) {
  const aantalVier = 5;
  const aantalVijf = 2;
  const totaalLeerlingen = leerlingen.length;
  const totaalGevraagd = aantalVier * 4 + aantalVijf * 5;

  const grid = document.getElementById("plattegrond");
  grid.className = "grid";      // Reset layoutklasse
  grid.innerHTML = "";          // Leeg inhoud

  if (totaalLeerlingen !== totaalGevraagd) {
    const foutmelding = document.createElement("p");
    foutmelding.textContent = `⚠️ Fout: aantal leerlingen (${totaalLeerlingen}) past niet in deze groepsindeling (${totaalGevraagd}).`;
    foutmelding.style.color = "red";
    foutmelding.style.fontWeight = "bold";
    foutmelding.style.padding = "1em";
    foutmelding.style.backgroundColor = "#ffeaea";
    foutmelding.style.border = "1px solid red";
    foutmelding.style.borderRadius = "8px";
    grid.appendChild(foutmelding);
    return;
  }

  grid.classList.add("groepjes-layout"); // Alleen bij geldige indeling

  const shuffled = [...leerlingen].sort(() => 0.5 - Math.random());
  let index = 0;
  const groepGroottes = [
    ...Array(aantalVier).fill(4),
    ...Array(aantalVijf).fill(5)
  ];

  for (const grootte of groepGroottes) {
    const groepje = document.createElement("div");
    groepje.className = "groepje";

    for (let i = 0; i < grootte; i++) {
      const naam = shuffled[index++];
      const tafel = document.createElement("div");
      tafel.className = "tafel";
      tafel.textContent = naam;
      groepje.appendChild(tafel);
    }

    grid.appendChild(groepje);
  }
}
