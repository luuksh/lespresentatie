# Interne Jaarplanning

De jaarplanning werkt volledig intern via de Jaarplanning Studio in de app.
Elke jaarlaag heeft nu één centrale planning (bijv. één planning voor alle brugklassen).

## Studio gebruik

1. Open `jaarplanning-studio.html`.
2. Kies jaarlaag en week.
3. Bewerk:
   - `Lessen` (regelvorm: `A | Project | Les`)
   - `Items` (1 regel = 1 item)
   - `Notitie`
4. Klik `Week opslaan`.
5. Wijzigingen zijn direct intern actief en gekoppeld aan programma van (volgende) les.

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
