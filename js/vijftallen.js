// vijftallen.js
//
// Exporteert/definieert: genereerGroepjes(klas)
// Retourneert een array met groepen (arrays met namen), geaimd op 5 per groep.
// Herverdeelt zodat de laatste groep niet op 1–2 personen eindigt (=> 4/5 waar mogelijk).

(function () {
  /**
   * Haal de leerlingenlijst voor een klas op uit mogelijke bronnen in de pagina.
   * - Voorkeur: window.klassenData[klas] (als je die elders al hebt gezet)
   * - Alternatief: window.leerlingenLijst (platte array)
   * - Anders: lege array
   */
  function getLeerlingenVoorKlas(klas) {
    if (window.klassenData && window.klassenData[klas]) {
      return [...window.klassenData[klas]];
    }
    if (Array.isArray(window.leerlingenLijst)) {
      return [...window.leerlingenLijst];
    }
    // Desnoods fallback naar localStorage (optioneel, alleen als je dat elders opslaat)
    try {
      const raw = localStorage.getItem("leerlingen_" + klas);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [];
  }

  /** Fisher–Yates shuffle (stabiel en eerlijk) */
  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Herverdeel zodat laatste groep niet 1 of 2 heeft.
   * We schuiven 1 of 2 leerlingen door vanuit eerdere groepen met 5.
   */
  function herverdeelLaatsteGroep(groups) {
    if (groups.length === 0) return groups;
    const last = groups[groups.length - 1];
    if (last.length >= 3) return groups; // prima

    // We hebben 1 of 2 in de laatste groep—probeer te lenen uit eerdere groepen van 5
    let nodig = 3 - last.length; // 1 of 2 nodig
    for (let i = groups.length - 2; i >= 0 && nodig > 0; i--) {
      if (groups[i].length > 4) {
        last.push(groups[i].pop());
        nodig--;
      }
    }

    // Als het nog steeds niet lukt (bijv. te weinig 5-tallen),
    // probeer het meer globaal: maak waar mogelijk 4-4-4-...-5-5-balans
    if (last.length < 3 && groups.length > 1) {
      outer: for (let i = groups.length - 2; i >= 0; i--) {
        while (groups[i].length > 3 && last.length < 3) {
          last.push(groups[i].pop());
          if (last.length >= 3) break outer;
        }
      }
    }
    return groups;
  }

  /**
   * Maak groepen van ~5 (laatste groep 3–5).
   * @param {string} klas - sleutel voor de gewenste klas
   * @returns {string[][]} groepen (arrays met namen)
   */
  function genereerGroepjes(klas) {
    const leerlingen = getLeerlingenVoorKlas(klas);
    // Als er (nog) geen lijst is, geef lege indeling terug
    if (!Array.isArray(leerlingen) || leerlingen.length === 0) return [];

    shuffleInPlace(leerlingen);

    const groups = [];
    const chunkSize = 5;

    for (let i = 0; i < leerlingen.length; i += chunkSize) {
      groups.push(leerlingen.slice(i, i + chunkSize));
    }

    // Herverdeel zodat laatste groep niet 1–2 groot is
    herverdeelLaatsteGroep(groups);

    // (Optioneel) tweede pass: probeer verschil tussen min/max groepsgrootte te beperken tot 1
    // Zodat je vooral 4's en 5's krijgt
    balance(groups);

    return groups;
  }

  function balance(groups) {
    // Streef naar sizes 4 of 5; als een groep 6 is en een andere 3, duw 1 door.
    let changed = true;
    while (changed) {
      changed = false;
      let donor = groups.findIndex(g => g.length > 5);
      let taker = groups.findIndex(g => g.length < 3);
      if (donor !== -1 && taker !== -1) {
        groups[taker].push(groups[donor].pop());
        changed = true;
      }
    }
    return groups;
  }

  // Maak beschikbaar in de globale scope voor jouw loader (eval → functie-aanroep)
  window.genereerGroepjes = genereerGroepjes;
})();
