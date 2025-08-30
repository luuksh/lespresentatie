// js/groepjes.js
// Laadt het generator-script (viertallen/vijftallen), vraagt groepen op via
// window.genereerGroepjes(klas) en rendert ze met zichtbare nummertjes.

document.addEventListener("DOMContentLoaded", initGroepjes);

async function initGroepjes() {
  const indelingSelect = document.getElementById("indelingSelect");
  const klasSelect = document.getElementById("klasSelect");
  const grid = document.getElementById("plattegrond");

  // Zorg dat de container altijd de juiste layout-class heeft
  grid.classList.add("grid", "groepjes-layout");

  // Klassen ophalen en dropdown vullen
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

    // Herstel laatste keuzes (indeling/klas)
    const lastKlas = localStorage.getItem("lastKlas");
    if (lastKlas && klassen[lastKlas]) klasSelect.value = lastKlas;

    const lastIndeling = localStorage.getItem("lastIndeling");
    if (lastIndeling && [...indelingSelect.options].some(o => o.value === lastIndeling)) {
      indelingSelect.value = lastIndeling;
    }

    // Eerste render
    await laadIndeling();

    // Events
    klasSelect.addEventListener("change", async () => {
      localStorage.setItem("lastKlas", klasSelect.value);
      await laadIndeling(true);
    });

    indelingSelect.addEventListener("change", async () => {
      localStorage.setItem("lastIndeling", indelingSelect.value);
      await laadIndeling(true);
    });

  } catch (e) {
    console.error("Fout bij initialisatie/klassen laden:", e);
  }

  async function laadIndeling(resetWeergave = false) {
    const klas = klasSelect.value;
    const indeling = indelingSelect.value; // 'viertallen' of 'vijftallen'
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
      // Laad het generator-script dynamisch
      const code = await (await fetch(`js/${indeling}.js`, { cache: "no-cache" })).text();

      // Verwijder eerdere generator en evalueer nieuwe
      delete window.genereerGroepjes;
      // eslint-disable-next-line no-eval
      eval(code);

      if (typeof window.genereerGroepjes !== "function") {
        console.error(`In js/${indeling}.js ontbreekt window.genereerGroepjes()`);
        return;
      }

      const groups = window.genereerGroepjes(klas) || [];
      renderGroups(groups);

    } catch (err) {
      console.error("Fout bij laden indeling:", err);
    }
  }

  function renderGroups(groups) {
    grid.innerHTML = "";
    groups.forEach((g, idx) => {
      const groep = document.createElement("div");
      groep.className = "groepje";
      groep.dataset.size = String(g.length); // 3/4/5 → CSS kan hierop inspelen

      // ▼ badge met groepsnummer (zichtbaar linksboven)
      const badge = document.createElement("div");
      badge.className = "group-badge";
      badge.textContent = String(idx + 1);
      groep.appendChild(badge);

      // Tafels/leerlingen
      g.forEach(naam => {
        const kaart = document.createElement("div");
        kaart.className = "tafel";
        kaart.textContent = naam;
        groep.appendChild(kaart);
      });

      grid.appendChild(groep);
    });
  }
}
