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

## Interne editor

In het docentpaneel:
1. Open `Jaarplanning intern bewerken`.
2. Klik `Koppel bronbestand` en kies `data/jaarplanning/jaarplanning-intern.json`.
3. Pas items/notitie aan voor de huidige klas/week.
4. Klik `Opslaan naar bronbestand`.
5. Draai daarna `./update-jaarplanning.sh` om te publiceren.

## Opmerking

- Geen OneDrive, geen PowerPoint-koppeling, geen Microsoft-diensten.
- Alleen interne projectbestanden en GitHub-publicatie van de JSON-feed.
