# Interne Jaarplanning

De jaarplanning werkt volledig intern via JSON.

## Bronbestand

- `data/jaarplanning/jaarplanning-intern.json`

## Publiceren

```bash
./update-jaarplanning.sh
```

Dit bouwt `js/jaarplanning-live.json`, commit en push (tenzij je `--no-push` gebruikt).

## Koppelen in de app

Gebruik als bron-URL in het docentpaneel:

`https://raw.githubusercontent.com/luuksh/lespresentatie/main/js/jaarplanning-live.json`

## Opmerking

- Geen OneDrive, geen PowerPoint-koppeling, geen Microsoft-diensten.
- Alleen interne projectbestanden en GitHub-publicatie van de JSON-feed.
