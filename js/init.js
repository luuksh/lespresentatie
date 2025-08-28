import { kiesIndeling } from './indeling.js';

document.addEventListener("DOMContentLoaded", async () => {
  const indelingSelect = document.getElementById("indelingSelect");
  const klasSelect = document.getElementById("klasSelect");
  const grid = document.getElementById("plattegrond");

  // 🟩 Klassen ophalen en dropdown vullen
  try {
    const res = await fetch("js/leerlingen_per_klas.json", { cache: "no-cache" });
    const klassen = await res.json();

    klasSelect.innerHTML = "";
    for (const klas of Object.keys(klassen)) {
      const option = document.createElement("option");
      option.value = klas;
      option.textContent = `Klas ${klas}`;
      klasSelect.appendChild(option);
    }

    // herstel laatst gebruikte klas of val terug op "G1D" of eerste optie
    const last = localStorage.getItem("lastClassId");
    if (last && [...klasSelect.options].some(o => o.value === last)) {
      klasSelect.value = last;
    } else if ([...klasSelect.options].some(o => o.value === "G1D")) {
      klasSelect.value = "G1D";
    } else if (klasSelect.options.length) {
      klasSelect.selectedIndex = 0;
    }

    if (klasSelect.value) {
      localStorage.setItem("lastClassId", klasSelect.value);
    }
  } catch (err) {
    console.error("Fout bij laden van klassen:", err);
    klasSelect.innerHTML = '<option>Fout bij laden</option>';
  }

  // 🔢 Badges voor groepjes: zet nummers als er .groepje-containers zijn
  function applyGroupNumbers() {
    const container = document.getElementById('plattegrond');
    if (!container) return;

    // oude badges verwijderen
    container.querySelectorAll('.group-badge').forEach(b => b.remove());

    const groups = container.querySelectorAll('.groepje');
    if (!groups.length) return;

    let n = 1;
    groups.forEach(g => {
      // zekerheid: zorg dat we absoluut kunnen positioneren binnen de groep
      if (getComputedStyle(g).position === 'static') {
        g.style.position = 'relative';
      }
      const badge = document.createElement('div');
      badge.className = 'group-badge';
      badge.textContent = n++;
      g.appendChild(badge);
    });
  }

  // 🟦 Kleuren + indeling tekenen
  function laadIndeling() {
    const kleuren = {
      h216: "#007bff",
      u008: "#28a745",
      groepjes: "#e83e8c",
      vijftallen: "#9b59b6"
    };

    const achtergronden = {
      h216: "#eef2f7",
      u008: "#eaf7ef",
      groepjes: "#fdf2f7",
      vijftallen: "#f3ecfb"
    };

    const type = indelingSelect.value;

    // Thema-kleuren
    document.documentElement.style.setProperty("--primaire-kleur", kleuren[type] || "#007bff");
    document.documentElement.style.setProperty("--hover-kleur", kleuren[type] || "#005fc1");
    document.documentElement.style.setProperty("--achtergrond", achtergronden[type] || "#eef2f7");

    // Layoutklasse voor viertallen
    grid.classList.remove("groepjes-layout");
    if (type === "groepjes") grid.classList.add("groepjes-layout");

    // Fade-out, opnieuw opbouwen, badges zetten
    grid.style.opacity = 0;
    setTimeout(() => {
      grid.innerHTML = "";
      kiesIndeling(type, klasSelect.value); // tekent; standaard random in indeling.js
      setTimeout(() => {
        applyGroupNumbers();  // type-onafhankelijk: zet nummers zodra er .groepje is
        grid.style.opacity = 1;
      }, 0);
    }, 200);
  }

  // 📌 Event listeners
  indelingSelect.addEventListener("change", laadIndeling);
  klasSelect.addEventListener("change", () => {
    if (klasSelect.value) localStorage.setItem("lastClassId", klasSelect.value);
    laadIndeling();
  });

  // 🚀 Initieel laden
  if (!indelingSelect.value) indelingSelect.value = "h216";
  laadIndeling();
});
