export function groepjesIndeling(leerlingen) {
  const aantalVier = 5;
  const aantalVijf = 2;
  const totaalLeerlingen = leerlingen.length;
  const totaalGevraagd = aantalVier * 4 + aantalVijf * 5;

  const grid = document.getElementById("plattegrond");
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

  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexWrap = "wrap";
  wrapper.style.gap = "2em";
  wrapper.style.justifyContent = "center";

  let index = 0;
  const groepGroottes = [
    ...Array(aantalVier).fill(4),
    ...Array(aantalVijf).fill(5)
  ];

  groepGroottes.forEach(grootte => {
    const groepje = document.createElement("div");
    Object.assign(groepje.style, {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      alignItems: "center",
      gap: "4px",
      margin: `${Math.random() * 40 + 10}px`,
      width: "240px",
      background: "#f9f9f9",
      border: "2px dashed #ccc",
      padding: "1em",
      borderRadius: "12px",
      transform: `rotate(${Math.random() * 10 - 5}deg)`
    });

    for (let j = 0; j < grootte; j++) {
      const naam = shuffled[index++];
      const tafel = document.createElement("div");
      tafel.className = "tafel";
      tafel.textContent = naam;
      groepje.appendChild(tafel);
    }

    wrapper.appendChild(groepje);
  });

  grid.appendChild(wrapper);
}
