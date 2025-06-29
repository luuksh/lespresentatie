import { kiesIndeling } from './indeling.js';

document.addEventListener("DOMContentLoaded", async () => {
  const indelingSelect = document.getElementById("indelingSelect");
  const klasSelect = document.getElementById("klasSelect");
  const grid = document.getElementById("plattegrond");

  // ✅ Klassen laden
  try {
    const res = await fetch("js/leerlingen_per_klas.json");
    const klassen = await res.json();
    Object.keys(klassen).forEach(klas => {
      const option = document.createElement("option");
      option.value = klas;
      option.textContent = `Klas ${klas}`;
      klasSelect.appendChild(option);
    });
    klasSelect.value = "G1D";
  } catch (err) {
    console.error("Fout bij laden van klassen:", err);
    klasSelect.innerHTML = '<option>Fout bij laden</option>';
  }

  // 🟦 Indeling wisselen + kleuren
  function herlaad() {
    const kleuren = {
      h216: '#007bff',
      u008: '#28a745',
      groepjes: '#e83e8c'
    };

    const achtergronden = {
      h216: '#eef2f7',
      u008: '#eaf7ef',
      groepjes: '#fdf2f7'
    };

    const type = indelingSelect.value;
    document.documentElement.style.setProperty('--primaire-kleur', kleuren[type] || '#007bff');
    document.documentElement.style.setProperty('--hover-kleur', kleuren[type] || '#005fc1');
    document.documentElement.style.setProperty('--achtergrond', achtergronden[type] || '#eef2f7');

    grid.style.opacity = 0;
    setTimeout(() => {
      grid.innerHTML = "";
      kiesIndeling(type, klasSelect.value);
      grid.style.opacity = 1;
    }, 200);
  }

  indelingSelect.addEventListener("change", herlaad);
  klasSelect.addEventListener("change", herlaad);
  herlaad();
});
