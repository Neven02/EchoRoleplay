# Echo City checkout setup

## Pokretanje

1. Kopiraj `.env.example` u `.env`.
2. U `.env` ubaci svoje PayPal, Discord i Western Union podatke.
3. Pokreni frontend i backend zajedno:

```bash
npm run dev:full
```

Frontend radi na `http://localhost:5173`, backend na `http://localhost:4242`.

## PayPal automatski

U `.env` postavi:

```env
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=tvoj_client_id
PAYPAL_CLIENT_SECRET=tvoj_client_secret
```

Za test koristi `sandbox`. Kad zelis pravo placanje, prebaci na:

```env
PAYPAL_MODE=live
```

PayPal flow:

1. Kupac odabere pakete.
2. Upise Discord i in-game ime.
3. Klikne `Plati PayPalom`.
4. PayPal ga prebaci na placanje.
5. Nakon povratka na shop backend potvrdi uplatu.
6. Narudzba ide staffu na Discord webhook.

## Western Union poluautomatski

U `.env` postavi:

```env
WESTERN_UNION_RECEIVER=TVOJE IME I PREZIME
WESTERN_UNION_COUNTRY=Hrvatska
```

Western Union flow:

1. Kupac odabere pakete.
2. Uplati Western Unionom na tvoje podatke.
3. Upise ime posiljatelja i MTCN.
4. Upload-a sliku ili PDF dokaza.
5. Backend salje narudzbu i dokaz staffu na Discord.
6. Staff rucno provjeri uplatu i aktivira paket.

## Discord

U `.env` postavi:

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Webhook URL ne ide u frontend. Drzi ga samo u `.env`.
