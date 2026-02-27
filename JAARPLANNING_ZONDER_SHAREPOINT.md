# Jaarplanning zonder SharePoint-koppeling

Deze methode gebruikt alleen lokale bestanden in dit project.

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
