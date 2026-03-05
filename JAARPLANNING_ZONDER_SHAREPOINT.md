# Interne Jaarplanning

De jaarplanning werkt volledig intern via de Jaarplanning Studio in de app.
Elke jaarlaag heeft nu één centrale planning (bijv. één planning voor alle brugklassen).

## Studio gebruik

1. Open `jaarplanning-studio.html`.
2. Kies jaarlaag en week.
3. Bewerk:
   - `A/B/C Project`
   - `A/B/C Les`
   - `A/B/C Huiswerk` (standaard huiswerk voor die les)
   - `Items` (1 regel = 1 item)
   - `Notitie`
4. Klik `Alles opslaan`.
5. Wijzigingen zijn direct intern actief en gekoppeld aan programma van (volgende) les.

## itslearning export (automatisch)

Genereer een CSV met alle geplande lesmomenten uit je rooster (`js/zermelo-agenda-live.json`)
en inhoud/huiswerk uit de jaarplanning (`js/jaarplanning-live.json`):

```bash
python3 scripts/export_itslearning_agenda.py
```

Output:

- `exports/itslearning-agenda-export.csv`

Kolommen:

- `Datum`, `Start`, `Einde`
- `Klas`, `Vak`
- `Titel`, `Beschrijving`
- `Huiswerk`
- `Week`, `Lesblok`, `RoosterUID`

Aanbevolen workflow:

1. Vul eerst weekplanning + huiswerk in de Studio.
2. Ververs je Zermelo-feed (zodat tijdstippen kloppen).
3. Draai `python3 scripts/export_itslearning_agenda.py`.
4. Gebruik de CSV als bron voor bulk-invoer in itslearning (import/plakken per kolom).

## Project-overzichtspresentaties

- Per project wordt automatisch één overzichtspresentatie gebruikt.
- Elke les krijgt daarin een markerpoint (slidepositie).
- Vanuit het lesblok opent de presentatie direct op de markerpoint van die les.
- Bewerken van projectpresentaties en markerpoints kan via `presentatie-studio.html`.

## Publiceren naar GitHub (optioneel)

Wil je de studio-stand ook naar de repo publiceren:

```bash
./update-jaarplanning.sh
```

## Opmerking

- Geen OneDrive, geen PowerPoint-koppeling, geen Microsoft-diensten.
- Geen bronbestand-koppeling nodig in de UI.
- Het docentpaneel bevat alleen een knop naar de aparte Studio-pagina.
