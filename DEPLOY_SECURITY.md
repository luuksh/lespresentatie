# Deploy-opzet

Gebruik twee omgevingen:

- Publiek: publiceer alleen `docs/` als leerlingenplatform. De makkelijke route is de root-URL van die site en de extra korte alias `/l/`.
- Intern: host de rootversie van deze map apart achter echte authenticatie, bijvoorbeeld Basic Auth of SSO op `intern.<jouwdomein>` of een afgeschermd pad.

Waarom:

- Browser-opgeslagen inloggegevens werken alleen betrouwbaar met echte server-authenticatie.
- Een loginformulier in alleen HTML/JS is niet veilig genoeg voor de beheeromgeving.
- De publieke `docs/`-map bevat daarom alleen de leerlingweergave en blokkadepagina's voor interne routes.
