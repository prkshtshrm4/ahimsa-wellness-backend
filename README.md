# Ahimsa Wellness — API

Express + MongoDB backend for **Ahimsa Wellness Centre** (bookings, payments, staff permissions).

## Local development

```bash
cp .env.example .env   # fill in MongoDB, Razorpay, etc.
npm install
npm run seed           # services + admin staff
npm start              # http://localhost:4000
```

Admin staff mobile after seed: `+911234567890` (Firebase test OTP `191001`).

## Deploy on Railway

1. Create a new project → **Deploy from GitHub repo** (this repository).
2. Add a **MongoDB** plugin or set `MONGODB_URI` to your Railway/external MongoDB URL.
3. Set environment variables:

| Variable | Notes |
|----------|--------|
| `PORT` | Set by Railway automatically |
| `CLIENT_ORIGIN` | Your Vercel URL, e.g. `https://ahimsa.vercel.app` |
| `MONGODB_URI` | MongoDB connection string |
| `FIREBASE_PROJECT_ID` | `ahimsa-wellness` |
| `AUTH_MODE` | `firebase` |
| `RAZORPAY_KEY_ID` | Razorpay test/live key |
| `RAZORPAY_KEY_SECRET` | Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | For payment webhooks |

4. After deploy, copy the public Railway URL into the frontend `VITE_API_URL` on Vercel.
5. Run seed once on Railway: `railway run npm run seed` (or use Railway shell).

Health check: `GET /health`
