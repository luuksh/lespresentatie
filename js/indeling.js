const modules = {
  h216: () => import('./h216.js').then(m => m.h216Indeling),
  u008: () => import('./u008.js').then(m => m.u008Indeling),
  groepjes: () => import('./groepjes.js').then(m => m.groepjesIndeling)
  vijftallen: () => import('./vijftallen.js').then(m => m.vijftallenIndeling)
};

/**
 * Haalt de leerlingenlijst op uit de JSON voor een gegeven klas.
 * @param {string} klasnaam - De naam van de klas, bijvoorbeeld "G1D"
 * @returns {Promise<string[]>} - Lijst met leerlingnamen, of lege lijst bij fout
 */
async function laadLeerlingen(klasnaam = "G1D") {
  try {
    const res = await fetch("js/leerlingen_per_klas.json");
    if (!res.ok) throw new Error("Netwerkfout bij ophalen JSON");

    const data = await res.json();
    const lijst = data[klasnaam];

    if (!Array.isArray(lijst)) throw new Error(`Klas ${klasnaam} niet gevonden of onjuist formaat`);
    return lijst;
  } catch (err) {
    console.error("❌ Fout bij laden leerlingen:", err);
    return [];
  }
}

/**
 * Laadt dynamisch de juiste indelingsfunctie en past deze toe op de leerlingenlijst.
 * @param {string} type - Indelingstype: "h216", "u008" of "groepjes"
 * @param {string} klasnaam - Klas waarvan de leerlingen worden ingedeeld
 */
export async function kiesIndeling(type = "h216", klasnaam = "G1D") {
  const leerlingen = await laadLeerlingen(klasnaam);
  const moduleLader = modules[type] || modules["h216"];

  try {
    const indeling = await moduleLader();
    if (typeof indeling !== "function") throw new Error("Module bevat geen exporteerbare functie");

    indeling(leerlingen);
  } catch (err) {
    console.error(`⚠️ Fout bij toepassen van indeling "${type}":`, err);
    const fallback = await modules["h216"]();
    fallback(leerlingen);
  }
}
