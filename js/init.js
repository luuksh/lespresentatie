import { kiesIndeling } from './indeling.js';

document.addEventListener("DOMContentLoaded", async () => {
  const indelingSelect = document.getElementById("indelingSelect");
  const klasSelect = document.getElementById("klasSelect");
  const grid = document.getElementById("plattegrond");

  try {
    const res = await fetch("leerlingen_per_klas.json"); // ✔ juiste pad aangepast
    const data = await res.json();
    for (const klas of Object.keys(data)) {
      const option = document.createElement("option");
      option.value = klas;
      option.textContent = `Klas ${klas}`;
      klasSelect.appendChild(option);
    }
    klasSelect.value = "G1D";
  } catch (err) {
    console.error("Fout bij laden van klassen:", err);
    klasSelect.innerHTML = '<option>Fout bij laden</option>';
  }

  function herlaad() {
    const kleurcodes = {
      h216: '#007bff',
      u008: '#28a745',
      groepjes: '#e83e8c'
    };

    const achtergrondcodes = {
      h216: '#eef2f7',
      u008: '#eaf7ef',
      groepjes: '#fdf2f7'
    };

    const waarde = indelingSelect.value;
    document.documentElement.style.setProperty('--primaire-kleur', kleurcodes[waarde] || '#007bff');
    document.documentElement.style.setProperty('--hover-kleur', kleurcodes[waarde] || '#005fc1');
    document.documentElement.style.setProperty('--achtergrond', achtergrondcodes[waarde] || '#eef2f7');

    grid.style.opacity = 0;
    setTimeout(() => {
      grid.innerHTML = "";
      kiesIndeling(waarde, klasSelect.value);
      grid.style.opacity = 1;
    }, 200);
  }

  indelingSelect.addEventListener("change", herlaad);
  klasSelect.addEventListener("change", herlaad);
  herlaad();
});
