const leerlingen = [
  "Samira", "Daan", "Tobias", "Yara", "Levi", "Mila",
  "Noah", "Sophie", "Liam", "Emma", "Finn", "Julia",
  "Lucas", "Nora", "Sem", "Lotte", "Thijs", "Eva",
  "Mats", "Zoë"
];

function kiesIndeling(type) {
  switch (type) {
    case "h216":
      import('./h216.js').then(module => module.h216Indeling(leerlingen));
      break;
    case "u008":
      import('./u008.js').then(module => module.u008Indeling(leerlingen));
      break;
    case "groepjes":
      import('./groepjes.js').then(module => module.groepjesIndeling(leerlingen));
      break;
    default:
      import('./h216.js').then(module => module.h216Indeling(leerlingen));
  }
}

document.addEventListener("DOMContentLoaded", () => kiesIndeling("h216"));
