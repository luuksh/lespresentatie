// js/vijftallen.js
// Verdeel in 5-tallen; rest -> zo weinig mogelijk 6-tallen (geen 3- of 4-tallen).
// Voor extreem kleine aantallen (bijv. < 7) maken we één groep met alle namen.

export function vijftallenIndeling(leerlingen, { shuffle = false } = {}) {
  const grid = document.getElementById('plattegrond');
  grid.className = 'grid groepjes-layout';
  grid.innerHTML = '';

  const list = shuffle ? fisherYates(leerlingen.slice()) : leerlingen.slice();
  const groups = chunk5Prefer6(list);

  groups.forEach((g, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'groepje';
    wrap.dataset.groupId = `groep${idx + 1}`;
    wrap.dataset.size = String(g.length); // 5 of 6 (edge: heel kleine n)

    const topic = document.createElement('div');
    topic.className = 'group-topic topic-chip is-empty';
    topic.dataset.topicKey = wrap.dataset.groupId;
    topic.dataset.topic = '';
    topic.tabIndex = 0;
    topic.textContent = '+ onderwerp';

    const date = document.createElement('div');
    date.className = 'group-date date-chip is-empty';
    date.dataset.dateKey = wrap.dataset.groupId;
    date.dataset.date = '';
    date.tabIndex = 0;
    date.textContent = '+ datum';

    const meta = document.createElement('div');
    meta.className = 'group-meta';
    meta.appendChild(topic);
    meta.appendChild(date);
    wrap.appendChild(meta);

    g.forEach((naam, seatIdx) => {
      const d = document.createElement('div');
      d.className = 'tafel';
      d.dataset.seatId = `groep${idx + 1}-${seatIdx + 1}`;
      d.textContent = naam;
      wrap.appendChild(d);
    });

    grid.appendChild(wrap);
  });
}

/**
 * Maak zoveel mogelijk 5-tallen; verdeel de rest (r) over de laatste r groepen
 * zodat die 6-tallen worden. Alleen 5 en 6 dus.
 * Edgecases: bij heel kleine n waar 5/6 niet haalbaar is, 1 groep met alle namen.
 */
function chunk5Prefer6(list) {
  const n = list.length;
  if (n < 7) return [list.slice()]; // te klein om 5/6 netjes te verdelen

  const groups = [];
  const q = Math.floor(n / 5); // aantal 5-tallen
  const r = n % 5;             // rest 0..4
  let i = 0;

  // eerst q groepen van 5
  for (let g = 0; g < q; g++) groups.push(list.slice(i, i += 5));

  if (r === 0) return groups;

  // als het kan, maak van de laatste r groepen een 6-tal
  if (q >= r) {
    for (let k = 0; k < r; k++) {
      groups[groups.length - 1 - k].push(list[i++]); // laatste, een-na-laatste, ...
    }
    return groups;
  }

  // zeldzame kleine gevallen (bv. n=7/8/9: q<r): maak 6-tallen eerst
  const alt = [];
  i = 0;
  let remaining = n;
  while (remaining >= 6) {
    alt.push(list.slice(i, i + 6));
    i += 6;
    remaining -= 6;
  }
  if (remaining > 0) alt.push(list.slice(i)); // rest (<6) als 1 groep
  return alt;
}

// optioneel: door elkaar husselen
function fisherYates(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
