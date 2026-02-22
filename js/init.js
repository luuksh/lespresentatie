import { kiesIndeling } from './indeling.js';

document.addEventListener('DOMContentLoaded', async () => {
  const indelingSelect = document.getElementById('indelingSelect');
  const klasSelect = document.getElementById('klasSelect');
  const grid = document.getElementById('plattegrond');
  const LAST_LAYOUT_KEY = 'lespresentatie.lastLayoutType';

  try {
    const res = await fetch('js/leerlingen_per_klas.json', { cache: 'no-cache' });
    const klassen = await res.json();

    klasSelect.innerHTML = '';
    for (const klas of Object.keys(klassen)) {
      const option = document.createElement('option');
      option.value = klas;
      option.textContent = `Klas ${klas}`;
      klasSelect.appendChild(option);
    }

    const lastClass = localStorage.getItem('lastClassId');
    if (lastClass && [...klasSelect.options].some((o) => o.value === lastClass)) {
      klasSelect.value = lastClass;
    } else if ([...klasSelect.options].some((o) => o.value === 'G1D')) {
      klasSelect.value = 'G1D';
    } else if (klasSelect.options.length) {
      klasSelect.selectedIndex = 0;
    }

    if (klasSelect.value) localStorage.setItem('lastClassId', klasSelect.value);
  } catch (err) {
    console.error('Fout bij laden van klassen:', err);
    klasSelect.innerHTML = '<option>Fout bij laden</option>';
  }

  const hasTypeOption = (value) => [...indelingSelect.options].some((o) => o.value === value);
  const lastType = localStorage.getItem(LAST_LAYOUT_KEY);
  if (lastType && hasTypeOption(lastType)) {
    indelingSelect.value = lastType;
  }

  function dispatchRendered(type) {
    window.dispatchEvent(new CustomEvent('indeling:rendered', {
      detail: { type, timestamp: Date.now() }
    }));
  }

  function laadIndeling() {
    const kleuren = {
      h216: '#007bff',
      u008: '#28a745',
      drievierdrie: '#0e9aa7',
      groepjes: '#e83e8c',
      drietallen: '#ff9800',
      vijftallen: '#9b59b6'
    };

    const achtergronden = {
      h216: '#eef2f7',
      u008: '#eaf7ef',
      drievierdrie: '#e7f8fa',
      groepjes: '#fdf2f7',
      drietallen: '#fff5e6',
      vijftallen: '#f3ecfb'
    };

    const type = indelingSelect.value;

    document.documentElement.style.setProperty('--primaire-kleur', kleuren[type] || '#007bff');
    document.documentElement.style.setProperty('--hover-kleur', kleuren[type] || '#005fc1');
    document.documentElement.style.setProperty('--achtergrond', achtergronden[type] || '#eef2f7');

    grid.classList.remove('groepjes-layout');
    if (type === 'groepjes') grid.classList.add('groepjes-layout');

    grid.style.opacity = 0;
    setTimeout(async () => {
      grid.innerHTML = '';
      await kiesIndeling(type, klasSelect.value);
      setTimeout(() => {
        grid.style.opacity = 1;
        dispatchRendered(type);
      }, 0);
    }, 200);
  }

  indelingSelect.addEventListener('change', () => {
    if (indelingSelect.value) localStorage.setItem(LAST_LAYOUT_KEY, indelingSelect.value);
    laadIndeling();
  });

  klasSelect.addEventListener('change', () => {
    if (klasSelect.value) localStorage.setItem('lastClassId', klasSelect.value);
    laadIndeling();
  });

  if (!indelingSelect.value) indelingSelect.value = 'h216';
  localStorage.setItem(LAST_LAYOUT_KEY, indelingSelect.value);
  laadIndeling();
});
