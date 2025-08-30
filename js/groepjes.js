// groepjes.js

import { kiesIndeling } from "./indeling.js";

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

    // herstel laatst gebruikte klas of val terug op de eerste
    const lastKlas = localStorage.getItem("lastKlas");
    if (lastKlas && klassen[lastKlas]) {
      klasSelect.value = lastKlas;
    } else {
      klasSelect.selectedIndex = 0;
    }

    laadIndeling();

    klasSelect.addEventListener("change", () => {
      localStorage.setItem("lastKlas", klasSelect.value);
      laadIndeling();
    });

    indelingSelect.addEventListener("change", () => {
      localStorage.setItem("lastIndeling", indelingSelect.value);
      laadIndeling();
    });

  } catch (e) {
    console.error("Fout bij ophalen klassen:", e);
  }

  function laadIndeling() {
    const klas = klasSelect.value;
    const indeling = indelingSelect.value;
    grid.innerHTML = "";

    fetch(`js/${indeling}.js`)
      .then(res => res.text())
      .then(code => {
        // eslint-disable-next-line no-eval
        eval(code);
        if (typeof genereerGroepjes === "function") {
          const leerlingen = []; // wordt normaal uit json geladen
          const groups = genereerGroepjes(klas);

          groups.forEach((g, idx) => {
            const groep = document.createElement("div");
            groep.className = "groepje";
            groep.dataset.size = String(g.length);

            // ▶️ Badge met groepsnummer
            const badge = document.createElement("div");
            badge.className = "group-badge";
            badge.textContent = String(idx + 1);
            groep.appendChild(badge);

            g.forEach(naam => {
              const kaart = document.createElement("div");
              kaart.className = "tafel";
              kaart.textContent = naam;
              groep.appendChild(kaart);
            });

            grid.appendChild(groep);
          });
        }
      })
      .catch(err => console.error("Fout bij laden indeling:", err));
  }
});
