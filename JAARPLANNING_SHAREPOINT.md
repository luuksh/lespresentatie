# Live Jaarplanning via SharePoint

De app leest een JSON-feed met deze structuur:

```json
{
  "updatedAt": "2026-02-27T10:00:00+01:00",
  "classes": {
    "G1A": {
      "2026-W09": {
        "items": ["...", "..."],
        "note": "..."
      }
    }
  }
}
```

## Werking in de app

- De geselecteerde klas (`G1A`, `G3B`, `G4C`, etc.) wordt opgezocht.
- De app toont alleen de huidige ISO-week (`YYYY-Www`), bijvoorbeeld `2026-W09`.
- Elke 5 minuten wordt de feed automatisch vernieuwd.

## Koppelen met SharePoint (aanbevolen)

1. Maak in SharePoint een doelbestand aan, bijvoorbeeld `jaarplanning-live.json`.
2. Maak in Power Automate een flow:
3. Trigger: `When a file is created or modified` op `Jaarplanning G1.xlsx`, `G3.xlsx`, `G4.xlsx`.
4. Lees de relevante rijen/tabbladen uit de drie Excel-bestanden.
5. Bouw JSON in bovengenoemde structuur.
6. Schrijf de JSON naar `jaarplanning-live.json` in SharePoint.
7. Gebruik de directe URL van `jaarplanning-live.json` als bron in het docentpaneel onder `Jaarplanning-koppeling`.

## Opmerking

Als SharePoint-authenticatie actief is, moeten leerlingen met schoolaccount ingelogd zijn om de feed te kunnen lezen.
