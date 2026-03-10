# Deploy-opzet

Deze repository is voorbereid op twee losse deploys:

- `dist/public`: openbare leerlingenomgeving
- `dist/internal`: interne docentomgeving achter echte Basic Auth

## 1. Build bundles

Voer vanuit de repo-root uit:

```bash
./scripts/build_deploy_bundle.sh
```

Dat maakt:

- `dist/public` op basis van `docs/`
- `dist/internal` op basis van de interne HTML/CSS/JS-bestanden

## 2. Publieke omgeving

Gebruik `dist/public` voor GitHub Pages of een andere publieke static host.

## 3. Interne omgeving

Gebruik `dist/internal` samen met de Docker/Caddy-opzet in `deploy/internal/`.

Stappen op de server:

```bash
cd /pad/naar/repo
./scripts/build_deploy_bundle.sh
export INTERNAL_HOST=intern.jouwdomein.nl
export BASIC_AUTH_USER=jouwdgebruikersnaam
export BASIC_AUTH_PASSWORD='sterk-wachtwoord'
docker compose -f deploy/internal/compose.yaml up -d --build
```

Daarna moet alleen nog DNS voor `intern.jouwdomein.nl` naar die server wijzen.

## Waarom dit veilig genoeg is

De interne site wordt pas geserveerd nadat de webserver de Basic Auth heeft gevalideerd.
Dus de HTML/JS/CSS van de docentomgeving zijn niet publiek bereikbaar zonder geldige inloggegevens.

## Restwerk buiten deze repo

Er blijven alleen externe beheeracties over:

- een server of VPS beschikbaar hebben met Docker
- DNS van het interne subdomein instellen
- een sterk wachtwoord kiezen
- eventueel later overstappen op school-SSO
