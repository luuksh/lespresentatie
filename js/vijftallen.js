// js/vijftallen.js
// Verdeel in 5-tallen; zorg dat de laatste groep 3–5 is (geen 1–2).
// Exporteert: vijftallenIndeling(leerlingen, { shuffle })

export function vijftallenIndeling(leerlingen, { shuffle = false } = {}) {
  const grid = document.getElementById("plattegrond");
  grid.className = "grid groepjes-layout";
  grid.innerHTML = "";

  const list = shuffle ? shuffleFY([...leerlingen]) : [...leerlingen];
  let groups = chunkBy5(list);
  groups = fixLastGroup(groups); // voorkom 1–2

  groups.forEach((g, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "groepje";
    wrap.dataset.size = String(g.length); // 3–6

    // ▶️ Badge met groepsnummer
    const badge = document.createElement("div");
    badge.className = "group-badge";
    badge.textContent = String(idx + 1);
    wrap.appendChild(badge);

    g.forEach(naam => {
      const d = document.createElement("div");
      d.className = "tafel";
      d.textContent = naam;
      wrap.appendChild(d);
    });

    grid.appendChild(wrap);
  });
}

// --- helpers ---

function chunkBy5(list) {
  const groups = [];
  for (let i = 0; i < list.length; i += 5) {
    groups.push(list.slice(i, i + 5));
  }
  return groups;
}

function fixLastGroup(groups) {
  if (!groups.length) return groups;
  const last = groups[groups.length - 1];
  if (last.length >= 3) return groups;

  // Lenen uit vorige groepen tot de laatste minstens 3 heeft
  let needed = 3 - last.length; // 1 of 2
  for (let i = groups.length - 2; i >= 0 && needed > 0; i--) {
    if (groups[i].length > 4) {
      last.push(groups[i].pop());
      needed--;
    }
  }

  // Nog steeds te klein? Probeer globaler te balanceren (zeldzaam)
  if (last.length < 3) {
    outer:
    for (let i = groups.length - 2; i >= 0; i--) {
      while (groups[i].length > 3 && last.length < 3) {
        last.push(groups[i].pop());
        if (last.length >= 3) break outer;
      }
    }
  }
  return groups;
}

function shuffleFY(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
