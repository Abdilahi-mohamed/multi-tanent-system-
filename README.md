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
- Tenant-isolated support conversations persist business-user messages and Super Admin replies, track open/in-progress/resolved status and unread conversations, and refresh through authenticated polling.
- Tenant dashboard with tenant-scoped catalog/order data; product and variant creation, archive, stock display, order fulfillment status, and tenant-scoped order chat with merchant replies.
- Public tenant store catalog and order creation. The API calculates price from the database, atomically reserves variant stock, requires an idempotency key, creates an order conversation, and compensates stock/order state if the related conversation cannot be saved. Eligible order cancellation restores reserved stock once, guarded by an order-level restoration marker.
- Payment activity is visible in both dashboards with server-side tenant scoping, status filters, and summaries. Super Admin Payment Management lists company profiles and assigned accounts, and supports per-company provider API keys, optional webhook secrets, commission rates, and enabled settings encrypted at rest. No provider adapter, online checkout, or verified payment webhook is configured; saving credentials alone does not enable payment processing.
- Company accounts are created by platform administrators in the user-management dashboard and sign in with a username and password.
- Public registration remains available for Super Admin accounts; company and tenant user accounts are created and managed inside the Super Admin dashboard.
- Rate limiting, request validation, security headers, CORS allow-list, paginated business/product endpoints, and MongoDB indexes for common tenant queries.

## Not configured / not implemented

- Merchant payment provider adapters, signed webhooks, refunds, and verified payment callbacks. Checkout orders remain `pending`; no UI action can mark them paid.
- Automated platform subscription billing/revenue collection, subscription payment tracking, invoices, and MRR. Business subscription fees are stored as billing terms only and are not represented as paid.
- Image upload/storage, custom-domain verification, tenant staff and fine-grained role management, announcements, inbound customer messaging, and real-time chat transport. Order-chat replies and support messages persist via the API; the UI refreshes rather than using WebSockets.
- Server-side session revocation. Current JWTs expire according to `JWT_EXPIRES_IN`; deactivating an account or suspending its tenant blocks subsequent authenticated requests.
- Production deployment, observability, backups, and infrastructure checks beyond the API/MongoDB readiness endpoint.

Configure payment processing only after selecting a provider and implementing provider-specific server verification and signed webhook handling. Do not treat this implementation as production-ready payment infrastructure.

Before production, configure HTTPS and a strict deployed `CLIENT_ORIGIN`, rotate all demo credentials, and replace browser local-storage JWT handling with an HttpOnly secure session/cookie design and an appropriate Content Security Policy.

## Validation

Run `npm test` for backend unit checks and `npm run build` for a production Next.js build. Mongo-backed workflows require a reachable MongoDB instance and are not exercised by the isolated unit test command.
