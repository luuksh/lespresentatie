export function drieVierDrieIndeling(leerlingen) {
  const grid = document.getElementById('plattegrond');
  grid.innerHTML = '';

  const rijContainer = document.createElement('div');
  rijContainer.style.display = 'flex';
  rijContainer.style.justifyContent = 'center';
  rijContainer.style.gap = '2em';

  const rijenPerKolom = [3, 4, 3];
  let index = 0;

  rijenPerKolom.forEach((aantalRijen, kolomIndex) => {
    const kolom = document.createElement('div');
    kolom.style.display = 'flex';
    kolom.style.flexDirection = 'column';
    kolom.style.gap = '2em';

    for (let rij = 0; rij < aantalRijen; rij++) {
      const namen = [
        leerlingen[index++] || '-',
        leerlingen[index++] || '-',
        leerlingen[index++] || '-'
      ];
      const seatPrefix = `k${kolomIndex + 1}r${rij + 1}`;
      kolom.appendChild(maakDrietafel(namen, seatPrefix));
    }

    rijContainer.appendChild(kolom);
  });

  grid.appendChild(rijContainer);
}

function maakDrietafel(namen, seatPrefix) {
  const tafelContainer = document.createElement('div');
  tafelContainer.className = 'duotafel fade-in';

  const tafels = document.createElement('div');
  tafels.className = 'tafels';

  namen.forEach((naam, idx) => {
    const tafel = document.createElement('div');
    tafel.className = 'tafel';
    tafel.dataset.seatId = `${seatPrefix}s${idx + 1}`;
    tafel.textContent = naam;
    tafels.appendChild(tafel);
  });

  tafelContainer.appendChild(tafels);
  return tafelContainer;
}
