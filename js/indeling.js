// js/indeling.js
import { initPresetUI } from './seating-presets.js';

const modules = {
  h216:      () => import('./h216.js').then(m => m.h216Indeling),
  u008:      () => import('./u008.js').then(m => m.u008Indeling),
  groepjes:  () => import('./groepjes.js').then(m => m.groepjesIndeling),
  vijftallen:() => import('./vijftallen.js').then(m => m.vijftallenIndeling),
};

/**
 * Haalt de leerlingenlijst op uit de JSON voor een gegeven klas.
 * @param {string} klasnaam - Bijv. "G1D"
 * @returns {Promise<string[]>}
 */
async function laadLeerlingen(klasnaam = "G1D") {
  try {
    const res = await fetch("js/leerlingen_per_klas.json", { cache: "no-cache" });
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
 * Laadt dynamisch de juiste indelingsfunctie en tekent de plattegrond.
 * @param {"h216"|"u008"|"groepjes"|"vijftallen"} type
 * @param {string} klasnaam
 */
export async function kiesIndeling(type = "h216", klasnaam = "G1D") {
  const leerlingen = await laadLeerlingen(klasnaam);
  const moduleLader = modules[type] || modules.h216;

  try {
    const indeling = await moduleLader();
    if (typeof indeling !== "function") throw new Error("Module bevat geen exporteerbare functie");
    indeling(leerlingen);
  } catch (err) {
    console.error(`⚠️ Fout bij toepassen van indeling "${type}":`, err);
    const fallback = await modules.h216();
    fallback(leerlingen);
  }
}
