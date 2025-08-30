// js/vijftallen.js
// Maakt groepjes van ~5 leerlingen, laatste groep altijd min. 3.
// Exporteert: window.genereerGroepjes(klas)

(function () {
  /**
   * Haalt leerlingenlijst voor een klas op
   */
  function getLeerlingenVoorKlas(klas) {
    if (window.klassenData && window.klassenData[klas]) {
      return [...window.klassenData[klas]];
    }
    if (Array.isArray(window.leerlingenLijst)) {
      return [...window.leerlingenLijst];
    }
    try {
      const raw = localStorage.getItem("leerlingen_" + klas);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [];
  }

  /** Fisher–Yates shuffle */
  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Corrigeer laatste groep (geen 1–2) */
  function fixLastGroup(groups) {
    if (!groups.length) return groups;
    const last = groups[groups.length - 1];
    if (last.length >= 3) return groups;

    let nodig = 3 - last.length;
    for (let i = groups.length - 2; i >= 0 && nodig > 0; i--) {
      if (groups[i].length > 4) {
        last.push(groups[i].pop());
        nodig--;
      }
    }
    return groups;
  }

  /**
   * Genereer groepen van ~5
   * @param {string} klas
   * @returns {string[][]}
   */
  function genereerGroepjes(klas) {
    const leerlingen = getLeerlingenVoorKlas(klas);
    if (!Array.isArray(leerlingen) || leerlingen.length === 0) return [];

    shuffleInPlace(leerlingen);

    const groups = [];
    for (let i = 0; i < leerlingen.length; i += 5) {
      groups.push(leerlingen.slice(i, i + 5));
    }

    return fixLastGroup(groups);
  }

  // Maak beschikbaar
  window.genereerGroepjes = genereerGroepjes;
})();
