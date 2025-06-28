const modules = {
  h216: () => import('./h216.js').then(m => m.h216Indeling),
  u008: () => import('./u008.js').then(m => m.u008Indeling),
  groepjes: () => import('./groepjes.js').then(m => m.groepjesIndeling)
};

/**
 * Haalt de leerlingenlijst op voor de opgegeven klas
 * @param {string} klasnaam - De naam van de klas (bijv. "G1D")
 * @returns {Promise<string[]>} - Array van leerlingnamen
 */
async function laadLeerlingen(klasnaam = "G1D") {
  try {
    const response = await fetch("leerlingen_per_klas.json");
    if (!response.ok) throw new Error("Netwerkfout bij ophalen JSON");

    const data = await response.json();
    const lijst = data[klasnaam];

    if (!Array.isArray(lijst)) {
      throw new Error(`Geen geldige leerlingenlijst voor klas ${klasnaam}`);
    }

    return lijst;
  } catch (error) {
    console.error("Fout bij laden van leerlingen:", error);
    return [];
  }
}

/**
 * Past de gekozen indeling toe met leerlingen van de gekozen klas
 * @param {string} type - Indelingstype: "h216", "u008" of "groepjes"
 * @param {string} klasnaam - Klasnaam waarvan de leerlingen geladen worden
 */
export async function kiesIndeling(type = "h216", klasnaam = "G1D") {
  const leerlingen = await laadLeerlingen(klasnaam);
  const laadModule = modules[type] || modules["h216"];

  try {
    const indelingFunctie = await laadModule();
    if (typeof indelingFunctie === 'function') {
      indelingFunctie(leerlingen);
    } else {
      throw new Error("Module bevat geen exporteerbare functie");
    }
  } catch (err) {
    console.error(`Fout bij toepassen van indeling "${type}":`, err);
    const fallback = await modules["h216"]();
    fallback(leerlingen);
  }
}
