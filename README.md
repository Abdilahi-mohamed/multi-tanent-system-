# Aura Commerce

A JavaScript monorepo for a multi-tenant commerce dashboard:

- `frontend/` — Next.js App Router dashboard, public tenant storefront, and checkout.
- `backend/` — Express REST API with MongoDB/Mongoose, JWT sessions, tenant scoping, and audit events.

The shared interface follows the requested palette: navy `#0F172A`, blue `#2563EB`, background `#F8FAFC`, white panels, and the specified status colors.

## Requirements

- Node.js 20.9+
- MongoDB 6+ (local or hosted)

## Local setup

1. Copy `backend/.env.example` to `backend/.env`. Set `MONGODB_URI`, provide a random `JWT_SECRET` of at least 32 characters, and set `PAYMENT_CREDENTIAL_ENCRYPTION_KEY` to a separate high-entropy secret of at least 32 bytes. Keep this encryption key backed up and private; stored payment API keys cannot be decrypted without it. Set `SEED_DEMO_PASSWORD` to a password with 12 or more characters. If Node cannot resolve Atlas SRV records on your network, set `MONGODB_DNS_SERVERS` to a reachable DNS server IP.
2. Copy `frontend/.env.example` to `frontend/.env.local` if the API is not at `http://localhost:4000/api`.
3. From the project root run `npm install`, `npm install --prefix backend`, and `npm install --prefix frontend`.
4. Create the clearly labelled sample workspace with `npm run seed --prefix backend`.
5. Start both apps with `npm run dev`. The web client is at `http://localhost:3000`; the API health check is at `http://localhost:4000/api/health`.

Customer accounts use email/password with bcrypt-hashed passwords and HttpOnly session cookies. Configure Google OAuth with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the exact callback URI `GOOGLE_OAUTH_REDIRECT_URI` registered in Google Cloud. Password reset links require SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and optionally `SMTP_FROM`). Keep these credentials only in the backend environment; do not put OAuth secrets or SMTP credentials in frontend variables or source control. Customer orders are account-scoped and remain pending until a payment provider is integrated and verifies payment; the current payment-method choices are manual arrangements only.

Storefront catalog pages require customer authentication. Opening a public store link redirects signed-out customers to that tenant's branded login page, then returns them to the same storefront after email/password or Google OAuth sign-in. Configure the Google OAuth callback as `http://localhost:4000/api/customer/auth/google/callback` locally (or the matching deployed API URL). Company owners can configure, preview, and publish tenant-specific login branding in **Dashboard → Customize Login Page**. Logo/background images are validated PNG, JPEG, or WebP data and are stored with that tenant's MongoDB login-page settings; only published settings are returned publicly. General-purpose object storage is not configured.

The Vendora brand palette is defined for Tailwind in `frontend/tailwind.config.js` and mirrored by the live CSS theme. Example utility combinations include `bg-bg-main text-text-white`, `bg-bg-card-slate border-interaction-border`, `text-brand-primary-blue`, and `bg-brand-accent-gold text-brand-primary-blue hover:bg-interaction-gold-hover`. The dark backdrop uses a radial gradient from slate to charcoal.

The seed command creates:

- Platform admin username: `admin`
- Business owner username: `owner`
- Store: `/store/aura-atelier`

Both demo users receive the password configured as `SEED_DEMO_PASSWORD`. Change it before using the demo seed in a shared or production environment. Sample records are explicitly tagged `demoRecord` on the tenant.

## Implemented

- Separate role-protected platform and tenant layouts, with backend JWT authentication and active-tenant checks on every authenticated request.
- Super-admin business directory, approval/reactivation/suspension actions, live database/API health check, cross-tenant operational counts, and audit log.
- Super-admin user management for creating platform administrators and company dashboard accounts, with username-or-email sign-in and automatic role-based dashboard routing.
- Business account creation stores the owner's full name and required subscription fee, currency, and billing frequency on the associated tenant. These are billing terms only; the platform does not collect or mark SaaS subscription payments.
- Centralized user management shows business owners with their business and billing details, supports account/business edits and activation controls, and provides secure password resets without exposing stored password hashes.
- Business-owner and public storefront customer support conversations persist named messages and Super Admin replies, retain customer contact details, track read receipts and open/in-progress/resolved status, and update through authenticated polling while the chat is open. Dashboard and storefront notification bells surface unread support and order messages across pages; storefront visitors can contact Super Admin without placing an order or entering a subject.
- Tenant dashboard with tenant-scoped catalog/order data; product and variant creation, archive, stock display, order fulfillment status, and tenant-scoped order chat with merchant replies.
- Tenant Product Sections with per-company section management, ordering, activation, duplicate-name validation, safe deletion, and section-specific product creation. Products support multiple image URLs, published/draft visibility, size/color/SKU and custom named variant attributes, per-variant stock, price overrides, and optional variant images.
- Tenant-authenticated public storefront catalog grouped into marketplace-style active section and category rows. The storefront refreshes its published catalog while open, supports product search and a multi-item cart, and snapshots each selected variant and its attributes, SKU, image, price, section, customer contact, and delivery details. The API calculates prices from saved product data, atomically reserves stock for each cart line, requires an idempotency key, creates an order conversation, and compensates stock/order state if checkout persistence fails. Eligible order cancellation restores reserved stock once, guarded by an order-level restoration marker.
- Public storefront access requires customer sign-in using email/password or Google OAuth, then returns customers to the tenant storefront they requested. Each tenant has independent draft and published login-page branding, including its logo, background, colors, copy, form style, Google button appearance, and layout.
- Order Support chat is available after purchase through the storefront. Customers recover access using their order number and the exact name and phone number provided at checkout; verification is rate-limited and issues a signed, order-scoped 30-day access token. Conversation messages persist sender names and timestamps, poll for updates, track read state, and can be managed by the owning business or by authorized Super Admins in a separate platform support view. A separate storefront support conversation lets visitors contact Super Admin without an order.
- Orders & Fulfillment includes the historical product/variant snapshot, customer and delivery details, payment/fulfillment states, delivery updates, and order-support access. Payment stays pending unless confirmed by a configured provider.
- Payment activity is visible in both dashboards with server-side tenant scoping, status filters, and summaries. Separate tenant Payment Gateway Settings and Super Admin Payment Management support per-company provider API keys, optional webhook secrets, commission rates, and enabled settings encrypted at rest. Connection status remains disconnected or requires attention until an adapter is installed and verified; saving credentials alone does not enable payment processing.
- Company accounts are created by platform administrators in the user-management dashboard and sign in with a username and password.
- Public registration remains available for Super Admin accounts; company and tenant user accounts are created and managed inside the Super Admin dashboard.
- Rate limiting, request validation, security headers, CORS allow-list, paginated business/product endpoints, and MongoDB indexes for common tenant queries.

## Not configured / not implemented

- Merchant payment provider adapters, signed webhooks, refunds, and verified payment callbacks. Checkout orders remain `pending`; no UI action can mark them paid.
- Automated platform subscription billing/revenue collection, subscription payment tracking, invoices, and MRR. Business subscription fees are stored as billing terms only and are not represented as paid.
- General-purpose image/object storage, custom-domain verification, tenant staff and fine-grained role management, announcements, SMS/OTP customer verification, and real-time chat transport. Login-page logo/background images are stored in the tenant's MongoDB configuration; product images use URLs. Customer order-chat access is recovered with order number plus checkout name and phone, without SMS. Order-chat replies and support messages persist via the API; the UI polls rather than using WebSockets.
- Server-side session revocation. Current JWTs expire according to `JWT_EXPIRES_IN`; deactivating an account or suspending its tenant blocks subsequent authenticated requests.
- Production deployment, observability, backups, and infrastructure checks beyond the API/MongoDB readiness endpoint.

Configure payment processing only after selecting a provider and implementing provider-specific server verification and signed webhook handling. Do not treat this implementation as production-ready payment infrastructure.

Before production, configure HTTPS and a strict deployed `CLIENT_ORIGIN`, rotate all demo credentials, and replace browser local-storage JWT handling with an HttpOnly secure session/cookie design and an appropriate Content Security Policy.

## Validation

Run `npm test` for backend unit checks and `npm run build` for a production Next.js build. Mongo-backed workflows require a reachable MongoDB instance and are not exercised by the isolated unit test command.
