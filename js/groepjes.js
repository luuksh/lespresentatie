// js/groepjes.js
// Laadt op basis van indeling het juiste generator-script (bijv. 'viertallen' of 'vijftallen'),
// vraagt groepen op via window.genereerGroepjes(klas) en rendert ze met een zichtbare badge (1, 2, 3, ...).

document.addEventListener("DOMContentLoaded", async () => {
  const indelingSelect = document.getElementById("indelingSelect");
  const klasSelect = document.getElementById("klasSelect");
  const grid = document.getElementById("plattegrond");

  // ———————————————————————————————————————————————————————————
  // Klassen ophalen en dropdown vullen
  // ———————————————————————————————————————————————————————————
  try {
    const res = await fetch("js/leerlingen_per_klas.json", { cache: "no-cache" });
    const klassen = await res.json();

    // Vul klas-select
    klasSelect.innerHTML = "";
    Object.keys(klassen).forEach(klas => {
      const opt = document.createElement("option");
      opt.value = klas;
      opt.textContent = `Klas ${klas}`;
      klasSelect.appendChild(opt);
    });

    // Herstel laatste keuzes (indeling/klas) indien beschikbaar
    const lastKlas = localStorage.getItem("lastKlas");
    if (lastKlas && klassen[lastKlas]) {
      klasSelect.value = lastKlas;
    }

    const lastIndeling = localStorage.getItem("lastIndeling");
    if (lastIndeling && [...indelingSelect.options].some(o => o.value === lastIndeling)) {
      indelingSelect.value = lastIndeling;
    }

    // Initieel laden
    await laadIndeling();

    // Event listeners
    klasSelect.addEventListener("change", async () => {
      localStorage.setItem("lastKlas", klasSelect.value);
      await laadIndeling(true);
    });

    indelingSelect.addEventListener("change", async () => {
      localStorage.setItem("lastIndeling", indelingSelect.value);
      await laadIndeling(true);
    });

  } catch (e) {
    console.error("Fout bij ophalen klassen of initialisatie:", e);
  }

  // ———————————————————————————————————————————————————————————
  // Indeling laden en renderen
  // ———————————————————————————————————————————————————————————
  async function laadIndeling(resetWeergave = false) {
    const klas = klasSelect.value;
    const indeling = indelingSelect.value; // verwacht bv. 'viertallen' of 'vijftallen'
    grid.innerHTML = "";

    // (optioneel) terug naar leerlingweergave bij wisselen
    if (resetWeergave) {
      const viewToggle = document.getElementById("weergaveToggle");
      if (viewToggle && viewToggle.dataset.mode !== "leerling") {
        viewToggle.dataset.mode = "leerling";
        document.body.classList.remove("docent");
      }
    }

    try {
      // Laad generator-script dynamisch
      const code = await (await fetch(`js/${indeling}.js`, { cache: "no-cache" })).text();

      // Verwijder eventuele vorige generator
      delete window.genereerGroepjes;

      // Eval het script zodat window.genereerGroepjes beschikbaar komt
      // eslint-disable-next-line no-eval
      eval(code);

      if (typeof window.genereerGroepjes !== "function") {
        console.error(`In js/${indeling}.js ontbreekt de functie window.genereerGroepjes`);
        return;
      }

      // Vraag groepen op en render
      const groups = window.genereerGroepjes(klas) || [];
      renderGroups(groups);

    } catch (err) {
      console.error("Fout bij laden van indeling:", err);
    }
  }

  // ———————————————————————————————————————————————————————————
  // Renderfunctie met zichtbare nummertjes (badges)
  // ———————————————————————————————————————————————————————————
  function renderGroups(groups) {
    grid.innerHTML = "";
    groups.forEach((g, idx) => {
      const groep = document.createElement("div");
      groep.className = "groepje";
      groep.dataset.size = String(g.length); // kan 3/4/5 zijn

      // ▼ Badge met groepsnummer zichtbaar linksboven (stijlen via .group-badge in CSS)
      const badge = document.createElement("div");
      badge.className = "group-badge";
      badge.textContent = String(idx + 1);
      groep.appendChild(badge);

      // Kaartjes/tafels
      g.forEach(naam => {
        const kaart = document.createElement("div");
        kaart.className = "tafel";
        kaart.textContent = naam;
        groep.appendChild(kaart);
      });

      grid.appendChild(groep);
    });
  }
});
