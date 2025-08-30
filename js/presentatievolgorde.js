// js/presentatievolgorde.js
// Maakt een genummerde, willekeurige presentatievolgorde en tekent die in #plattegrond

export async function tekenPresentatieVolgorde(klasId) {
  const grid = document.getElementById("plattegrond");
  grid.innerHTML = "";

  // Leerlingen ophalen
  const res = await fetch("js/leerlingen_per_klas.json", { cache: "no-cache" });
  const data = await res.json();
  const leerlingen = Array.isArray(data?.[klasId]) ? [...data[klasId]] : [];

  // Fisher–Yates shuffle (stabiel & eerlijk)
  for (let i = leerlingen.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [leerlingen[i], leerlingen[j]] = [leerlingen[j], leerlingen[i]];
  }

  // Geordende, genummerde lijst
  const ol = document.createElement("ol");
  ol.className = "presentatie-lijst";
  leerlingen.forEach((naam, index) => {
    const li = document.createElement("li");
    li.className = "presentatie-item";

    const nr = document.createElement("span");
    nr.className = "nr";
    nr.textContent = index + 1;

    const nm = document.createElement("span");
    nm.className = "naam";
    nm.textContent = naam;

    li.appendChild(nr);
    li.appendChild(nm);
    ol.appendChild(li);
  });

  grid.appendChild(ol);
}
