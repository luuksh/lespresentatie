# Jaarplanning zonder SharePoint-koppeling

Deze methode gebruikt alleen lokale bestanden in dit project.

## Intern via GitHub-link

Wil je dat iedereen intern dezelfde planning ziet via een link, zonder Outlook:

1. Werk je bronbestanden bij (`Jaarplanning G1.xlsx`, `G3`, `G4`).
2. Draai:
```bash
./update-jaarplanning.sh
```
3. De app kan als bron deze link gebruiken:
`https://raw.githubusercontent.com/luuksh/lespresentatie/main/js/jaarplanning-live.json`
4. In het docentpaneel bij `Jaarplanning-koppeling` plak je deze link en klik je `Opslaan`.

## Werkwijze

1. Bewaar je Excelbestanden lokaal (bijv. G1, G3, straks G4).
2. Draai dit commando:

```bash
python3 scripts/build_jaarplanning_json.py "/pad/naar/Jaarplanning G1.xlsx" "/pad/naar/Jaarplanning G3.xlsx" -o js/jaarplanning-live.json
```

3. De app leest automatisch `js/jaarplanning-live.json`.

## Opmerking

- Geen SharePoint API, geen Power Automate, geen externe koppeling.
- Na elke Excel-wijziging: commando opnieuw draaien.
- Met `./update-jaarplanning.sh` staat de nieuwste JSON op GitHub en via de directe link zichtbaar.
