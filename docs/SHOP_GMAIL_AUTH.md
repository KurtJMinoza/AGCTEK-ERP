# Shop Gmail authentication

Customer sign-in at `/shop/sign-in` uses **Gmail only** (Google Identity Services + email OTP). ERP staff, admin, and HR authentication are unchanged.

## Previous flow (removed from shop UI)

- Default **mobile number** tab with mock SMS OTP (`/shop/sign-in/otp`).
- Alternate **email + password** sign-in and separate **Create account** tab.
- Backend: `POST /api/v1/retail/clients/register` and `login` with bcrypt passwords (still available for legacy/staff-provisioned accounts, not used by the shop UI).

## New flow

```text
/shop/sign-in
  → **New account:** Continue with Google only (GIS credential → POST /api/v1/shop/auth/google; verified Gmail + Google `sub`)
  → **Existing account:** Gmail → POST /api/v1/shop/auth/email/request-code (account must already exist)
  → /shop/sign-in/otp → POST /api/v1/shop/auth/email/verify-code (sign-in only; does not create accounts)
  → optional first-name completion (PATCH /api/v1/retail/clients/me)
  → JWT retail session + guest cart merge
  → redirect `next` or /shop
```

## API

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/v1/shop/auth/email/request-code` | Public |
| POST | `/api/v1/shop/auth/email/verify-code` | Public |
| POST | `/api/v1/shop/auth/google` | Public |
| GET | `/api/v1/shop/auth/me` | Bearer retail JWT |
| POST | `/api/v1/shop/auth/logout` | Bearer (client clears token) |

Gmail-only validation runs on the server for every method. OTP codes are hashed with `EMAIL_OTP_SECRET`; plain codes are never logged.

## Environment

**Backend** (`backend/.env`): see `backend/.env.example` — `RETAIL_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_OTP_SECRET`, SMTP settings, `MAIL_FROM_*`.

**Frontend** (`.env.local`): `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (same OAuth client as backend, Web application type).

Do not commit SMTP or app passwords to git; configure them only in local/production env files.

### Email OTP (SMTP)

If the shop shows **“Email delivery is temporarily unavailable.”**, the API could not send mail. Check `erp-backend` logs and `backend/.env`:

| Variable | Gmail example |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USERNAME` | sending Gmail address |
| `SMTP_PASSWORD` | [Google App Password](https://myaccount.google.com/apppasswords) (16 characters) |
| `MAIL_FROM_ADDRESS` | same as `SMTP_USERNAME` |
| `SMTP_SECURE` | `false` (STARTTLS on 587) |

After changing `.env`, rebuild/restart if needed and run:

`npx pm2 restart erp-backend --update-env`

### Google: “Access blocked: Authorization Error”

This comes from **Google Cloud**, not the ERP API. Fix the OAuth **Web application** client that matches `GOOGLE_CLIENT_ID`:

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → your Web client.
2. **Authorized JavaScript origins** — add the **exact** origin from the shop sign-in page (shown under the Google button), for example:
   - `http://localhost:3010`
   - `http://127.0.0.1:3010` (if you open the shop that way)
   - `https://erp.agctek.co` (production)
3. Open the shop on **erp-edge port 3010**, not Next directly on **3020**.
4. **OAuth consent screen** → if **Testing**, add each shopper Gmail under **Test users**. External users are blocked until the app is published or they are listed as test users.
5. Save in Google Console; wait a few minutes; hard refresh `/shop/sign-in`.

Backend `GOOGLE_CLIENT_SECRET` is optional for the GIS ID-token flow; the client ID and origins must be correct.

## Database

Migration `20261022140000_shop_gmail_auth`: optional `passwordHash`, `emailVerifiedAt`, `firstName`/`lastName`, `status`, `RetailAuthIdentity`, `RetailEmailOtp`.
