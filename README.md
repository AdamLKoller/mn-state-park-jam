# MN State Park Jam

Collaborative Minnesota state-park trip planning with:

- Google sign-in
- Friend discovery and mutual connection requests
- Shared trips with required dates
- Trip invites by email (including users who have not signed up yet)
- Shared park stop editing and manual booking status
- Official Minnesota DNR park info/reservation links
- Trail reference information
- Seed endpoint for the requested Interstate State Park test trip

## Getting Started

1) Install dependencies:

```bash
npm install
```

2) Create your environment file from [.env.example](./.env.example):

```bash
cp .env.example .env.local
```

3) Fill in:

- Firebase web app values (`NEXT_PUBLIC_FIREBASE_*`)
- Firebase Admin service account values (`FIREBASE_*`)
- Route secret (`SEED_SECRET`)

4) Run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Firebase setup notes

- Enable Firestore + Authentication (Google provider).
- Deploy [firestore.rules](./firestore.rules).

## Seed the requested test scenario

The seed endpoint creates:

- Friendship between:
  - `kolleradaml01@gmail.com`
  - `steph.lewis13c@gmail.com`
- Shared trip:
  - Title: Interstate Shared Trip
  - Park: Interstate State Park
  - Dates: 2026-10-16 to 2026-10-17
  - Creator email: `kolleradaml01@gmail.com`
  - Steph included as active member email

Call:

```bash
curl -X POST http://localhost:3000/api/seed -H "x-seed-secret: <SEED_SECRET>"
```

## Privacy and compliance

- In-app privacy page: [/privacy](http://localhost:3000/privacy)
- Account deletion is available in-app.
