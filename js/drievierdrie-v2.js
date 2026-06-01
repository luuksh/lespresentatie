export function drieVierDrieIndeling(leerlingen) {
  const grid = document.getElementById('plattegrond');
  grid.className = 'grid row-layout drievierdrie-layout';
  grid.innerHTML = '';

  let index = 0;
  const blokkenPerRij = [3, 4, 3];

  // 3 rijen; per rij exact: 3 tafeltjes, 4 tafeltjes, 3 tafeltjes
  for (let rij = 0; rij < 3; rij++) {
    const rijElement = document.createElement('div');
    rijElement.className = 'tafelrij';

    blokkenPerRij.forEach((aantalTafels, blok) => {
      const blokElement = document.createElement('div');
      blokElement.className = 'tafels';

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
