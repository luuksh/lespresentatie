// js/presentatievolgorde.js

export function maakPresentatieVolgorde(leerlingen) {
  // willekeurig schudden
  let geshuffeld = [...leerlingen]
    .map(l => ({ l, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(obj => obj.l);

  // lijst met nummers maken
  return geshuffeld.map((naam, i) => {
    return { nummer: i + 1, naam: naam };
  });
}
