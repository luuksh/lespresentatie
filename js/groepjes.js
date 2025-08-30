// js/groepjes.js
// Rendert "Viertallen": groepjes van 4 en – indien nodig – 5 (geen 3).
// Exporteert: groepjesIndeling(leerlingen, { shuffle })

export function groepjesIndeling(leerlingen, { shuffle = false } = {}) {
  const grid = document.getElementById("plattegrond");
  grid.className = "grid groepjes-layout";
  grid.innerHTML = "";

  const list = shuffle ? shuffleFY([...leerlingen]) : [...leerlingen];
  const groups = chunk4of5Only(list);

  groups.forEach((g, idx) => {
    const groep = document.createElement("div");
    groep.className = "groepje";
    groep.dataset.size = String(g.length); // 4 of 5 → CSS kan hierop stylen

    // ▶️ Badge met groepsnummer
    const badge = document.createElement("div");
    badge.className = "group-badge";
    badge.textContent = String(idx + 1);
    groep.appendChild(badge);

    g.forEach(naam => {
      const kaart = document.createElement("div");
      kaart.className = "tafel";
      kaart.textContent = naam;
      groep.appendChild(kaart);
    });

    // Als 5, zet het 5e tafeltje op rij 2, kolom 1–2 (afhankelijk van je CSS)
    if (g.length === 5) {
      const vijfde = document.createElement("div");
      vijfde.className = "tafel extra";
      vijfde.textContent = g[4];
      // We hebben het al toegevoegd via loop; als je 5e apart wil positioneren:
      // groep.removeChild(groep.lastChild); groep.appendChild(vijfde);
    }

    grid.appendChild(groep);
  });
}

// --- helpers ---

function chunk4of5Only(list) {
  // Maak eerst zoveel mogelijk 4-tallen
  const groups = [];
  let i = 0;
  while (i + 4 <= list.length) {
    groups.push(list.slice(i, i + 4));
    i += 4;
  }
  const rest = list.length - i;

  if (rest === 0) return groups;
  if (rest === 4) {
    groups.push(list.slice(i, i + 4));
    return groups;
  }
  if (rest === 5) {
    groups.push(list.slice(i, i + 5));
    return groups;
  }

  // Rest is 1,2 of 3 → leen 1 uit eerdere groepen om 5 te maken (geen 3)
  const leftover = list.slice(i);
  if (groups.length === 0) {
    // heel kleine klas: maak één groep
    groups.push(leftover);
    return groups;
  }
  // Voeg leftover toe aan laatste groep tot die 5 is
  const last = groups[groups.length - 1];
  while (leftover.length && last.length < 5) {
    last.push(leftover.shift());
  }
  // Als er toch nog iets overblijft (zeldzaam bij piepkleine aantallen),
  // zet dat als aparte groep (3 max).
  if (leftover.length) groups.push(leftover);
  return groups;
}

function shuffleFY(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
