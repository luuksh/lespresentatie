// js/presentatievolgorde.js
// Rendert een eenvoudige genummerde lijst (1..n) met de geshuffelde leerlingen.

export function presentatievolgordeIndeling(leerlingen = []) {
  const grid = document.getElementById('plattegrond');
  if (!grid) return;

  grid.innerHTML = '';

  const ol = document.createElement('ol');
  ol.className = 'presentatie-lijst';

  leerlingen.forEach((naam, idx) => {
    const li = document.createElement('li');
    li.className = 'presentatie-item';

    const nr = document.createElement('span');
    nr.className = 'nr';
    nr.textContent = idx + 1;

    const nm = document.createElement('span');
    nm.className = 'naam';
    nm.textContent = naam;

    li.appendChild(nr);
    li.appendChild(nm);
    ol.appendChild(li);
  });

  grid.appendChild(ol);
}
