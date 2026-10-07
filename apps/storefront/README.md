# AGC Marketplace — mobile (Expo)

Mobile version of the web marketplace (`/shop`): same design (emerald), same ERP data and the same flows.

| App | Audience | Purpose |
| --- | --- | --- |
| `apps/driver` | Drivers | Trips, stops, POD, location pings → SCM ops APIs |
| `apps/storefront` | Customers | Marketplace: browse, cart, checkout, orders, account |
| `src/modules/storefront/marketplace` | Customers (web) | The same marketplace on the web |

The app is a sales channel only: it never posts inventory or computes ATP. Stock comes from the ERP availability API, and the server re-checks prices and totals at checkout.

## Run

```bash
cd apps/storefront
npm install
npm start          # press w (web), a (Android), i (iOS) or scan the QR with Expo Go
```

Needs the Nest backend on `:3011` and the Next.js web app on `:3010` (it serves product photos and promo images).

```env
EXPO_PUBLIC_API_URL=http://localhost:3011   # physical device: your PC's LAN IP
EXPO_PUBLIC_WEB_URL=http://localhost:3010   # optional; defaults to the API host on :3010
EXPO_PUBLIC_USE_MOCK_API=false              # true = offline demo data
```

## Same as the web marketplace

| Flow | Endpoint |
| --- | --- |
| Catalogue (all three stores) | `GET /sd/products?activeOnly=true` |
| Stock on the product page | `GET /sd/products/storefront/availability` |
| Sign in / create account / profile | `POST /retail/clients/login`, `POST /retail/clients/register`, `PATCH /retail/clients/me` |
| Checkout (one master order, lines tagged by store; idempotent `checkoutId`) | `POST /sd/sales-orders/retail/checkout` |
| My orders | `GET /sd/sales-orders?customerId=` |

- **Pricing** (`src/pricing.ts`) mirrors `calculateCartPricing` on the web: ₱150 delivery per store, `AWIC10` takes 10% off AWIC items only. Keep both in sync.
- **Add to cart** requires sign-in, then a confirmation. "Buy now" opens the cart.
- LPG add-ons cannot be checked out on their own.
- Order statuses: Processing, To be delivered, Delivered, Cancelled (same wording as the web).

## Structure

```text
app/              Expo Router: (tabs) shop · cart · orders · account, products, product/[id],
                  checkout, order/[id], favorites, sign-in (modal)
src/
  api/            CommerceApi interface, HttpCommerceApi (ERP), MockCommerceApi (offline demo)
  context/        Catalog, Auth, Cart (+ promo/pricing), Favorites, Shop (add-to-cart flow), Toast
  components/     React Native UI (cards, rows, dialogs, forms)
  catalog.ts      Stores, categories, sorting, search
  pricing.ts      Split-cart pricing
```

Storage keys are namespaced `agctek.storefront.*` (`cart`, `session`, `favorites`) and never share `agctek.driver.*`.
