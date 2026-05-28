# AirCue — Ghana Radio Streaming

Next.js 16 app for listening to Ghana radio stations, podcasts, and creator broadcast management. Backend: Firebase (Auth, Firestore, Storage).

## Features

- **Listener directory** — Live HLS streams, equalizer, favorites, chat, song requests, podcasts
- **Creator studio** — `/station-dashboard` for owned stations and requests
- **Admin console** — Stations, listeners, analytics, revenue, schedules, podcasts, settings, support tickets
- **Landing search** — Firestore-backed station and podcast search

## Setup

```bash
cd ghana-radio-app
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_DEMO_MODE=true
```

Deploy Firestore rules and indexes:

```bash
firebase deploy --only firestore
```

Create first admin:

```bash
node setup-admin.mjs admin@example.com password123 Admin User
```

## Develop

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Firestore collections

| Collection | Purpose |
|------------|---------|
| `users` | Profiles, roles, preferences |
| `stations` | Radio streams |
| `podcasts` | On-demand episodes |
| `requests` | Song requests |
| `chats/{stationId}/messages` | Live chat |
| `schedules` | Program guide |
| `transactions` | Revenue ledger |
| `notifications` | Admin alerts |
| `settings/platform` | Encoder & API settings |
| `supportTickets` | Help desk |

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — run production build
