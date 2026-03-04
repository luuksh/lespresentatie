# Jaarplanning zonder SharePoint-koppeling

Deze methode gebruikt alleen interne bestanden in dit project (zonder Excel-afhankelijkheid als standaard).

## Intern via GitHub-link

Wil je dat iedereen intern dezelfde planning ziet via een link, zonder Outlook:

1. Werk het interne bronbestand bij: `data/jaarplanning/jaarplanning-intern.json`.
2. Draai:
```bash
./update-jaarplanning.sh
```
3. De app kan als bron deze link gebruiken:
`https://raw.githubusercontent.com/luuksh/lespresentatie/main/js/jaarplanning-live.json`
4. In het docentpaneel bij `Jaarplanning-koppeling` plak je deze link en klik je `Opslaan`.

## Werkwijze (standaard: intern JSON)

1. Bewerk intern:
   - `data/jaarplanning/jaarplanning-intern.json`
2. Publiceer naar live JSON:

```bash
./update-jaarplanning.sh --no-push
```

3. De app leest automatisch `js/jaarplanning-live.json`.

## Excel fallback (optioneel)

Als je ooit tijdelijk uit Excel wilt blijven bouwen:

```bash
JAARPLANNING_SOURCE=excel ./update-jaarplanning.sh --no-push
```

## Opmerking

- Geen SharePoint API, geen Power Automate, geen externe koppeling.
- Met `./update-jaarplanning.sh` staat de nieuwste JSON op GitHub en via de directe link zichtbaar.
