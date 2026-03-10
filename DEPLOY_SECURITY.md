# Deploy-opzet

Gebruik twee omgevingen:

- Publiek: publiceer alleen `docs/` of `dist/public` als leerlingenplatform.
- Intern: publiceer alleen `dist/internal` achter echte server-authenticatie.

Waarom:

- Browser-opgeslagen inloggegevens werken alleen betrouwbaar met echte server-authenticatie.
- Een loginformulier in alleen HTML/JS is niet veilig genoeg voor de beheeromgeving.
- De publieke `docs/`-map bevat daarom alleen de leerlingweergave en blokkadepagina's voor interne routes.

## Aanbevolen route

- Publiek: GitHub Pages
- Intern: Docker + Caddy + Basic Auth op een aparte host, bijvoorbeeld `intern.jouwdomein.nl`

De interne deploybestanden staan in [deploy/README.md](/Users/luukhijne/Desktop/Klassenplattegrond/deploy/README.md).
