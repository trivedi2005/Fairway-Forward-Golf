# Fairway Forward Golf

A full-stack local implementation of the Fairway Forward Golf charity and monthly draw platform.

## Run

```powershell
npm start
```

Open http://localhost:4173.

## Demo accounts

- Member: `jamie@example.com` / `password123`
- Admin: `admin@example.com` / `password123`

## What is wired

- Node HTTP server serving the frontend and REST API
- Persistent server-side JSON datastore in `data/db.json`
- Signup and login sessions
- Server-side score validation, duplicate-date protection, and five-score rolling retention
- Charity selection and contribution percentage persistence
- Admin metrics and protected draw simulation endpoint

## Production next steps

Replace the local JSON datastore with Supabase/Postgres, hash passwords, use secure signed sessions, and connect Stripe webhooks before production deployment. Provider-specific integrations are intentionally isolated behind the API boundary.
