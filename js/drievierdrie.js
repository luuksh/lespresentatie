export function drieVierDrieIndeling(leerlingen) {
  const grid = document.getElementById('plattegrond');
  grid.innerHTML = '';

  let index = 0;
  const blokkenPerRij = [3, 4, 3];

  for (let rij = 0; rij < 3; rij++) {
    const rijElement = document.createElement('div');
    rijElement.className = 'tafelrij';
    rijElement.style.flexWrap = 'nowrap';
    rijElement.style.gap = '18px';

    blokkenPerRij.forEach((aantalTafels, blok) => {
      const blokElement = document.createElement('div');
      blokElement.className = 'tafels';
      blokElement.style.display = 'flex';
      blokElement.style.flexWrap = 'nowrap';
      blokElement.style.gap = '6px';
      blokElement.style.flex = '0 0 auto';

      for (let plek = 0; plek < aantalTafels; plek++) {
        const tafel = document.createElement('div');
        tafel.className = 'tafel';
        tafel.dataset.seatId = `r${rij + 1}b${blok + 1}s${plek + 1}`;
        tafel.textContent = leerlingen[index++] || '-';
        blokElement.appendChild(tafel);
      }

      rijElement.appendChild(blokElement);
    });

    grid.appendChild(rijElement);
  }
}
