// js/drietallen.js
// Verdeel in 3-tallen; rest wordt eerlijk verdeeld tot 4-tallen (alleen 3 of 4).
// Edgecases: bij heel kleine n (bv. < 3) één groep met alle namen.

export function drietallenIndeling(leerlingen, { shuffle = false } = {}) {
  const grid = document.getElementById('plattegrond');
  grid.className = 'grid groepjes-layout';
  grid.innerHTML = '';

  const list = shuffle ? fisherYates(leerlingen.slice()) : leerlingen.slice();
  const groups = chunk3Prefer4(list);

  groups.forEach((g, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'groepje';
    wrap.dataset.groupId = `groep${idx + 1}`;
    wrap.dataset.size = String(g.length); // 3 of 4

    const topic = document.createElement('div');
    topic.className = 'group-topic topic-chip is-empty';
    topic.dataset.topicKey = wrap.dataset.groupId;
    topic.dataset.topic = '';
    topic.tabIndex = 0;
    topic.textContent = '+ onderwerp';
    wrap.appendChild(topic);

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
 * Maak zoveel mogelijk 3-tallen; verdeel rest (r = 1 of 2)
 * door van de laatste r groepen een 4-tal te maken.
 * Resultaat: uitsluitend 3- en 4-tallen.
 */
function chunk3Prefer4(list) {
  const n = list.length;
  if (n < 3) return [list.slice()];

  const groups = [];
  const q = Math.floor(n / 3); // aantal 3-tallen
  let r = n % 3;               // 0..2
  let i = 0;

  // eerst q groepen van 3
  for (let g = 0; g < q; g++) groups.push(list.slice(i, i += 3));

  // r==0 → klaar
  if (r === 0) return groups;

  // r==1 of r==2 → maak van laatste r groepen een 4-tal
  for (let k = 0; k < r; k++) {
    groups[groups.length - 1 - k].push(list[i++]);
  }
  return groups;
}

// optioneel: door elkaar husselen
function fisherYates(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
