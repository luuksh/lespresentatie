// js/groepjes.js
// Rendert "Viertallen" als groepjes van 4 en – als nodig – 5.
// Geen drietallen. Werkt met #plattegrond en .tafel/.groepje styling.

export function groepjesIndeling(leerlingen, { shuffle = false } = {}) {
  const grid = document.getElementById("plattegrond");
  grid.className = "grid groepjes-layout";
  grid.innerHTML = "";

  const list = shuffle ? fisherYates(leerlingen.slice()) : leerlingen.slice();
  const groups = chunk4of5Only(list);

  groups.forEach((g, idx) => {
    const groep = document.createElement("div");
    groep.className = "groepje";
    groep.dataset.groupId = `groep${idx + 1}`;
    // 4 of 5 (CSS gebruikt dit om het 5e tafeltje onder te zetten)
    groep.dataset.size = String(g.length);

    const topic = document.createElement("div");
    topic.className = "group-topic topic-chip is-empty";
    topic.dataset.topicKey = groep.dataset.groupId;
    topic.dataset.topic = "";
    topic.tabIndex = 0;
    topic.textContent = "+ onderwerp";
    groep.appendChild(topic);

    g.forEach((naam, seatIdx) => {
      const kaart = document.createElement("div");
      kaart.className = "tafel";
      kaart.dataset.seatId = `groep${idx + 1}-${seatIdx + 1}`;
      kaart.textContent = naam;
      groep.appendChild(kaart);
    });

    grid.appendChild(groep);
  });
}

/**
 * Verdeel in uitsluitend 4- en 5-tallen.
 * n = list.length, q = floor(n/4), r = n%4
 * r==0 → alleen 4-tallen
 * r==1 → 1 laatste 5-tal
 * r==2 → 2 laatste 5-tallen
 * r==3 → 3 laatste 5-tallen
 * Voor r>0 moet q >= r; bij hele kleine n (zeldzaam in klassen)
 * valt de functie terug op 5-jes en eventueel 1 restgroep (<4).
 */
function chunk4of5Only(list) {
  const n = list.length;
  const q = Math.floor(n / 4);
  const r = n % 4;

  const groups = [];
  let i = 0;

  // eerst q groepen van 4
  for (let g = 0; g < q; g++) groups.push(list.slice(i, i += 4));

  if (r === 0) return groups;

  if (q >= r) {
    // rest verdelen: elk rest-item maakt, vanaf het einde, een 4-tal tot 5-tal
    const rest = list.slice(i); // lengte r
    for (let k = 0; k < r; k++) {
      const idx = groups.length - 1 - k; // laatste, één-na-laatste, ...
      groups[idx].push(rest[k]);
    }
    return groups;
  }

  // --- Edge cases (hele kleine aantallen, bv. n<8) ---
  // Bouw zoveel mogelijk 5-tallen; overblijvende kleine restgroep kan <4 zijn.
  // In normale klassen kom je hier niet.
  const alt = [];
  i = 0;
  let remaining = n;
  while (remaining >= 5) {
    alt.push(list.slice(i, i += 5));
    remaining -= 5;
  }
  if (remaining > 0) alt.push(list.slice(i)); // kan 2 of 3 zijn bij piepkleine groepen
  return alt;
}

// Optioneel: zet shuffle:true mee aan om door elkaar te zetten
function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
