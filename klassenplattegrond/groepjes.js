export function groepjesIndeling(leerlingen, aantalVier, aantalVijf) {
  const shuffled = [...leerlingen].sort(() => 0.5 - Math.random());
  const grid = document.getElementById("plattegrond");
  grid.innerHTML = "";

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
    groepje.style.display = "flex";
    groepje.style.flexWrap = "wrap";
    groepje.style.justifyContent = "center";
    groepje.style.alignItems = "center";
    groepje.style.gap = "4px";
    groepje.style.margin = `${Math.random() * 40 + 10}px`;
    groepje.style.width = "240px";
    groepje.style.background = "#f9f9f9";
    groepje.style.border = "2px dashed #ccc";
    groepje.style.padding = "1em";
    groepje.style.borderRadius = "12px";
    groepje.style.transform = `rotate(${Math.random() * 10 - 5}deg)`;

    for (let j = 0; j < grootte; j++) {
      const naam = shuffled[index++] || "-";
      const tafel = document.createElement("div");
      tafel.className = "tafel";
      tafel.textContent = naam;
      groepje.appendChild(tafel);
    }

    wrapper.appendChild(groepje);
  });

  grid.appendChild(wrapper);
}
