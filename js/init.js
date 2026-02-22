import { kiesIndeling } from './indeling.js';

document.addEventListener("DOMContentLoaded", async () => {
  const indelingSelect = document.getElementById("indelingSelect");
  const klasSelect = document.getElementById("klasSelect");
  const grid = document.getElementById("plattegrond");
  const LAST_LAYOUT_KEY = "lespresentatie.lastLayoutType";
  const LAST_DRAFT_META_KEY = "lespresentatie.draft.v1.lastmeta";

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

  const hasClassOption = (value) => [...klasSelect.options].some(o => o.value === value);
  const hasTypeOption = (value) => [...indelingSelect.options].some(o => o.value === value);

  // Herstel primair: laatst bewerkte concept (klas + indelingstype)
  let draftMeta = null;
  try { draftMeta = JSON.parse(localStorage.getItem(LAST_DRAFT_META_KEY) || "null"); } catch {}

  if (draftMeta?.classId && hasClassOption(draftMeta.classId)) {
    klasSelect.value = draftMeta.classId;
    localStorage.setItem("lastClassId", draftMeta.classId);
  }

  if (draftMeta?.type && hasTypeOption(draftMeta.type)) {
    indelingSelect.value = draftMeta.type;
    localStorage.setItem(LAST_LAYOUT_KEY, draftMeta.type);
  } else {
    const lastType = localStorage.getItem(LAST_LAYOUT_KEY);
    if (lastType && hasTypeOption(lastType)) {
      indelingSelect.value = lastType;
    }
  }

  function dispatchRendered(type) {
    window.dispatchEvent(new CustomEvent('indeling:rendered', {
      detail: { type, timestamp: Date.now() }
    }));
  }

  // 🟦 Kleuren + indeling tekenen
  function laadIndeling() {
    const kleuren = {
      h216: "#007bff",
      u008: "#28a745",
      drievierdrie: "#0e9aa7",
      groepjes: "#e83e8c",
      drietallen: "#ff9800",
      vijftallen: "#9b59b6"
    };

    const achtergronden = {
      h216: "#eef2f7",
      u008: "#eaf7ef",
      drievierdrie: "#e7f8fa",
      groepjes: "#fdf2f7",
      drietallen: "#fff5e6",
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
    setTimeout(async () => {
      grid.innerHTML = "";
      await kiesIndeling(type, klasSelect.value); // tekent; standaard random in indeling.js
      setTimeout(() => {
        grid.style.opacity = 1;
        dispatchRendered(type);
      }, 0);
    }, 200);
  }

  // 📌 Event listeners
  indelingSelect.addEventListener("change", () => {
    if (indelingSelect.value) localStorage.setItem(LAST_LAYOUT_KEY, indelingSelect.value);
    laadIndeling();
  });
  klasSelect.addEventListener("change", () => {
    if (klasSelect.value) localStorage.setItem("lastClassId", klasSelect.value);
    laadIndeling();
  });

  // 🚀 Initieel laden
  if (!indelingSelect.value) indelingSelect.value = "h216";
  localStorage.setItem(LAST_LAYOUT_KEY, indelingSelect.value);
  laadIndeling();
});
