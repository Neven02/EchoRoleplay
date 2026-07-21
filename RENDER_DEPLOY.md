# Render deploy

## 1. GitHub

Napravi novi GitHub repository, npr. `echo-city-shop`.

Upload/push projekt, ali nemoj uploadati:

- `.env`
- `node_modules`
- `dist`

To je vec pokriveno u `.gitignore`.

## 2. Render

Na Renderu odaberi:

```text
New -> Web Service -> GitHub
```

Spoji GitHub account i odaberi repo.

## 3. Postavke servisa

Build Command:

```bash
npm install && npm run build
```

Start Command:

```bash
npm run server
```

## 4. Environment Variables

Dodaj ih u Render dashboard, ne u GitHub:

```env
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
DISCORD_WEBHOOK_URL=...
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_TICKET_CATEGORY_ID=...
DISCORD_STAFF_ROLE_IDS=role_id_1,role_id_2
WESTERN_UNION_RECEIVER=Neven Pavlovic
WESTERN_UNION_COUNTRY=Hrvatska
PUBLIC_SITE_URL=https://tvoj-render-link.onrender.com
AUTH_SECRET=neki-dugi-random-tekst
SUPABASE_URL=https://tvoj-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

Ako koristis samo jednu staff/donacija rolu, `DISCORD_STAFF_ROLE_IDS` moze imati samo jedan ID.
Ako nemas kategoriju za tickete, `DISCORD_TICKET_CATEGORY_ID` mozes privremeno preskociti, ali bolje je napraviti kategoriju `DONACIJE`.

Za tvoj Supabase URL nemoj stavljati `/rest/v1/` na kraj. Treba biti ovako:

```env
SUPABASE_URL=https://xxxxx.supabase.co
```

## 5. Supabase setup

U Supabase dashboardu otvori SQL Editor i pokreni sadrzaj fajla:

```text
SUPABASE_SETUP.sql
```

## 6. PayPal mode

Za test mozes koristiti:

```env
PAYPAL_MODE=sandbox
```

Za pravi Discord shop koristi:

```env
PAYPAL_MODE=live
```

## 7. Poslije deploya

Kad Render napravi prvi deploy, kopiraj URL servisa i postavi ga kao:

```env
PUBLIC_SITE_URL=https://tvoj-render-link.onrender.com
```

Zatim klikni Manual Deploy ili restart servisa.
