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

  // 🟦 Past kleuren en indeling toe
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

    // Pas kleuren aan op basis van type
    document.documentElement.style.setProperty("--primaire-kleur", kleuren[type] || "#007bff");
    document.documentElement.style.setProperty("--hover-kleur", kleuren[type] || "#005fc1");
    document.documentElement.style.setProperty("--achtergrond", achtergronden[type] || "#eef2f7");

    // Verwijder layoutklasse en voeg indien nodig toe
    grid.classList.remove("groepjes-layout");
    if (type === "groepjes") {
      grid.classList.add("groepjes-layout");
    }

    // Fade-out en opnieuw opbouwen
    grid.style.opacity = 0;
    setTimeout(() => {
      grid.innerHTML = "";
      kiesIndeling(type, klasSelect.value);
      grid.style.opacity = 1;
    }, 200);
  }

  // 📌 Event listeners
  indelingSelect.addEventListener("change", laadIndeling);
  klasSelect.addEventListener("change", () => {
    if (klasSelect.value) {
      localStorage.setItem("lastClassId", klasSelect.value);
    }
    laadIndeling();
  });

  // 🚀 Initieel laden
  if (!indelingSelect.value) indelingSelect.value = "h216";
  laadIndeling();
});
