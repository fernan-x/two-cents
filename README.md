# two-cents
💰 A shared budget tracker for couples to manage expenses, split costs, and stay on the same financial page—because every cent counts.

## 🎯 MVP Goals

Build a minimal yet functional app for couples to:

 * Create a shared space
 * Invite their partner
 * Define monthly budgets (shared or personal)
 * Track expenses

## Run locally

Requirements: Node 24 (`.node-version`, e.g. `fnm use`), pnpm, Docker. For the mobile app: Xcode (iOS) or Android Studio (Android).

### 1. Backend

```bash
pnpm install
docker compose up -d                      # Postgres :5442 (dev), :5443 (tests), Mailpit :8025
cp backend/.env.example backend/.env
```

Fill these three values in `backend/.env`, each with the output of `openssl rand -base64 32`:
`JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `IP_HASH_KEY`. The other defaults work locally; Apple and Google keys can stay empty if you only use email sign-up.

```bash
pnpm --filter @two-cents/shared build     # shared contracts + rules (rebuild after changing them)
pnpm --filter two-cents-backend db:migrate
pnpm --filter two-cents-backend start:dev # API on http://localhost:3000/v1
```

Emails (confirmation, reset…) are caught by Mailpit: http://localhost:8025.

### 2. Mobile app

The app needs a development build: Expo Go doesn't include Google sign-in, secure storage or Face ID.

```bash
cd mobile
echo "EXPO_PUBLIC_API_URL=http://localhost:3000" > .env
npx expo run:ios          # or: npx expo run:android  (first build ~10 min)
```

API address by target:

| Target | `EXPO_PUBLIC_API_URL` |
|---|---|
| iOS simulator | `http://localhost:3000` |
| Android emulator | `http://10.0.2.2:3000` |
| Physical phone | `http://<your computer's LAN IP>:3000` |

After the first build, `pnpm start` is enough.

Optional sign-in providers:
- **Google**: set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`) in `mobile/.env`, and `GOOGLE_WEB_CLIENT_ID` in `backend/.env`.
- **Apple**: real iPhone or signed-in simulator, plus the `APPLE_*` values in `backend/.env`.
- **Face ID / fingerprint**: real device only.

### 3. Tests

```bash
pnpm --filter @two-cents/shared test
cd backend && pnpm test && pnpm test:int && pnpm test:e2e   # int/e2e use the postgres-test container
cd mobile && pnpm test
pnpm -r lint && pnpm -r typecheck
```

The mobile typecheck needs Expo Router's generated route types: run `npx expo start` once first.
