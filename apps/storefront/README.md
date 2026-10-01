# AGCTEK Storefront (Expo)

Customer-facing **commerce channel**: shop, cart, checkout, orders, and **read-only** delivery tracking.

| App | Audience | Purpose |
| --- | --- | --- |
| `apps/driver` | Drivers | Trips, stops, POD, location pings → SCM ops APIs |
| `apps/storefront` | Customers | Shop, cart, checkout, orders, read-only tracking |
| `src/modules/*` | Staff | ERP web (Next.js) |

The storefront is **not** an SCM dispatcher and **not** a driver fork. It never posts inventory, computes ATP, or captures POD.

## Run

```bash
cd apps/storefront
npm install
npm start
# or from repo root: npm run storefront
```

Press `a` (Android) / `i` (iOS) / `w` (web), or scan the QR with Expo Go.

Expo SDK, React and React Native versions are pinned to match `apps/driver`.

## Mock-first

All screens/hooks go through a single `CommerceApi` interface:

```text
Screen → Hook/Context → CommerceApi → MockCommerceApi | HttpCommerceApi → ERP
```

| File | Role |
| --- | --- |
| `src/api/commerceApi.ts` | Interface + shared types (re-exported from `src/types`) |
| `src/api/mockCommerceApi.ts` | In-memory catalog, orders, tracking timelines |
| `src/api/httpCommerceApi.ts` | Nest `/api/v1` implementation (stub until SD/SCM endpoints exist) |
| `src/api/client.ts` | Exports the `commerceApi` instance, chosen by env |

Copy `.env.example` to `.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3011
EXPO_PUBLIC_USE_MOCK_API=true
```

`EXPO_PUBLIC_USE_MOCK_API` defaults to **true**; only the literal `false` switches to HTTP. `EXPO_PUBLIC_*` values are bundled into the app — never put secrets there.

## Order status vocabulary

| Storefront status | ERP meaning |
| --- | --- |
| `PLACED` | Customer submitted |
| `CONFIRMED` | Order accepted |
| `PACKED` | Warehouse prepared |
| `OUT_FOR_DELIVERY` | Dispatched |
| `DELIVERED` | POD done |
| `CANCELLED` | Cancelled |

## Tracking boundary

```text
TMS/GPS → SCM delivery status → Customer tracking projection → Storefront UI
```

Customers may see status, timestamps, ETA, last known **area**, and milestone labels. They must **not** see coordinate streams, driver identity/phone, vehicle telemetry/OBD, or fleet data.

## Storage keys

Storefront keys are namespaced `agctek.storefront.*` (e.g. `agctek.storefront.cart`, `agctek.storefront.session`) and never share `agctek.driver.*`.

## Milestones

| # | Scope | Status |
| --- | --- | --- |
| M1 | Expo app boots | Done |
| M2 | Expo Router tabs + stacks | Done |
| M3 | Product catalog + `MockCommerceApi` | Done |
| M4 | Cart + AsyncStorage (`agctek.storefront.cart`) | Done |
| M5 | Checkout (mock place order) | Done |
| M6 | Orders list | Done |
| M7 | Order detail | Done |
| M8 | Tracking timeline + map placeholder | Done |
| M9 | Auth/session isolation (`agctek.storefront.session`) | Done (mock sign-in) |
| M10 | `HttpCommerceApi` + env switch | Switch done; methods stubbed |
| M11–13 | Real SD/SCM | After UI QA |

## Mock behaviour (for QA)

- **Sign in:** any valid email + non-empty password. Checkout and Orders require a session; Shop and Cart don't.
- **Seeded orders:** `SO-WEB-1002` (out for delivery) and `SO-WEB-1001` (delivered).
- **New orders** advance one milestone per minute (Placed → Confirmed → Packed → Out for delivery → Delivered) so the tracking screen can be checked end to end. Pull to refresh to see progress.
- **GI Rib-Type Roofing** is unavailable and can't be added or ordered.
- Mock data lives in memory and resets when the app reloads; the cart and session persist in AsyncStorage.
- Cart totals are an estimate from the price at add time; the order returned by `createOrder` is authoritative.

## Future: HTTP

`HttpCommerceApi` will call storefront-facing endpoints under the existing `/api/v1` prefix once SD (orders) and SCM (tracking projection) agree the contract. No backend endpoints are assumed today.

## Structure

```text
apps/storefront/
  app/            # Expo Router screens: (tabs), product, checkout, order, track
  src/
    api/          # CommerceApi + mock/http implementations
    components/   # RN only
    context/      # CartProvider, AuthProvider
    hooks/        # useProducts, useOrders, useTracking
    types/
    utils/        # formatting
```
