const modules = {
  h216: () => import('./h216.js').then(m => m.h216Indeling),
  u008: () => import('./u008.js').then(m => m.u008Indeling),
  groepjes: () => import('./groepjes.js').then(m => m.groepjesIndeling)
};

// Leerlingenlijst ophalen uit JSON-bestand
async function laadLeerlingen(klasnaam = "G1D") {
  try {
    const response = await fetch("leerlingen_per_klas.json");
    const data = await response.json();
    const lijst = data[klasnaam];

    if (!Array.isArray(lijst)) {
      throw new Error(`Geen geldige leerlingenlijst gevonden voor klas ${klasnaam}`);
    }

    return lijst;
  } catch (error) {
    console.error("Fout bij laden van leerlingen:", error);
    return [];
  }
}

// Indeling kiezen en toepassen
async function kiesIndeling(type, klasnaam = "G1D") {
  const leerlingen = await laadLeerlingen(klasnaam);
  const laadModule = modules[type] || modules["h216"];

  try {
    const indelingFunctie = await laadModule();
    indelingFunctie(leerlingen);
  } catch (err) {
    console.error(`Fout bij toepassen van indeling "${type}":`, err);
    const fallback = await modules["h216"]();
    fallback(leerlingen);
  }
}

// Standaardindeling bij het laden van de pagina
document.addEventListener("DOMContentLoaded", () => kiesIndeling("h216", "G1D"));
