# Déploiement Vercel — frontend web (monorepo)

Dashboard Vercel → Add New Project → importer christanval2/autopart :

| Réglage | Valeur |
|---|---|
| Root Directory | autoparts-frontend |
| Framework Preset | Vite |
| Build Command | npx turbo build --filter=@autoparts/web |
| Output Directory | apps/web/dist |
| Install Command | npm install |

Environment Variables (Production) :
- VITE_API_URL = https://autoparts-api.onrender.com/api/v1
- VITE_SOCKET_URL = https://autoparts-api.onrender.com
- VITE_GOOGLE_CLIENT_ID = <même valeur que le backend>
