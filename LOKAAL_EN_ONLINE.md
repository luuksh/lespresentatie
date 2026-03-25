# Wat staat waar

## Online voor leerlingen

Alleen de map `docs/` is openbaar bedoeld.

Leerlingen gebruiken dus alleen de online leerlingenomgeving.

## Alleen op jouw computer

Deze bestanden zijn voor jou en horen niet online:

- `index.html`
- `docent.html`
- `jaarplanning-studio.html`
- `presentatie-studio.html`
- alle overige rootbestanden buiten `docs/`

## Hoe jij werkt

Open lokaal in je browser:

- `index.html` voor je interne startpagina
- `docent.html` voor het docentenbord
- `jaarplanning-studio.html` voor de planning
- `presentatie-studio.html` voor presentaties

Nog makkelijker op Mac:

- dubbelklik op `start-docentomgeving.command`
- de docentomgeving opent dan lokaal in je browser
- dubbelklik later op `stop-docentomgeving.command` om hem weer te stoppen

## Belangrijk

Als alleen `docs/` gepubliceerd wordt, kunnen leerlingen niet bij jouw lokale docentomgeving.

## Zermelo online automatisch verversen

Voor GitHub Pages is de beste route om de Zermelo-iCal automatisch naar JSON te laten omzetten via GitHub Actions.

De workflow staat in [sync-zermelo.yml](/Users/luukhijne/Desktop/Klassenplattegrond/.github/workflows/sync-zermelo.yml) en doet dit elke 15 minuten:

- haalt de Zermelo iCal opnieuw op
- schrijft `js/zermelo-agenda-live.json`
- kopieert die feed ook naar `docs/js/zermelo-agenda-live.json`
- commit en pusht alleen als de feed echt veranderd is

Eenmalig instellen in GitHub repository settings:

- secret `ZERMELO_ICAL_URL`: jouw privé iCal-link uit Zermelo
- optioneel secret `ZERMELO_LEERLINGEN_URL`: JSON-bron voor leerlingenlijsten

Daarmee blijft de online leerlingenomgeving op GitHub Pages automatisch meelopen met de Zermelo-feed, zonder lokale server.
