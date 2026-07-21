# Wasil - School Communication App

A full-stack school communication platform built with React, Express, and PostgreSQL.

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: OAuth 2.0 (Google + Microsoft) via Passport.js

## Project Structure

```
wasil/
├── client/                    # React frontend (Vite)
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── pages/            # Route pages
│   │   ├── hooks/            # Custom hooks
│   │   ├── services/         # API client
│   │   ├── contexts/         # React contexts
│   │   └── types/            # TypeScript interfaces
│   └── package.json
├── server/                    # Express backend
│   ├── src/
│   │   ├── routes/           # API route handlers
│   │   ├── middleware/       # Auth, validation
│   │   └── services/         # Business logic
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema
│   │   └── seed.ts           # Seed data
│   └── package.json
└── README.md
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

## Getting Started

### 1. Clone and Install Dependencies

```bash
# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

### 2. Set Up Environment Variables

```bash
# In server directory, copy the example env file
cp .env.example .env

# Edit .env with your configuration:
# - DATABASE_URL: Your PostgreSQL connection string
# - SESSION_SECRET: A random secret for sessions
# - GOOGLE_CLIENT_ID/SECRET: (optional) For Google OAuth
# - MICROSOFT_CLIENT_ID/SECRET: (optional) For Microsoft OAuth
```

### 3. Set Up the Database

```bash
# In server directory
npm run db:push      # Push schema to database
npm run db:generate  # Generate Prisma client
npm run db:seed      # Seed demo data
```

### 4. Start Development Servers

```bash
# Terminal 1: Start the backend
cd server
npm run dev

# Terminal 2: Start the frontend
cd client
npm run dev
```

The frontend will be available at `http://localhost:3000` and the backend at `http://localhost:4000`.

## Demo Login

For development, use the demo login buttons on the login page:
- **Parent Login**: Uses `sarah@example.com`
- **Admin Login**: Uses `admin@vhps.ae`

## API Endpoints

### Authentication
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/microsoft` - Initiate Microsoft OAuth
- `GET /auth/me` - Get current user
- `POST /auth/logout` - Logout
- `POST /auth/demo-login` - Demo login (dev only)

### Messages
- `GET /api/messages` - List messages for user
- `GET /api/messages/all` - List all messages (admin)
- `POST /api/messages` - Create message (admin)
- `POST /api/messages/:id/ack` - Acknowledge message

### Surveys
- `GET /api/surveys` - List active surveys
- `POST /api/surveys` - Create survey (admin)
- `POST /api/surveys/:id/respond` - Submit response

### Events
- `GET /api/events` - List events
- `POST /api/events` - Create event (admin)
- `POST /api/events/:id/rsvp` - Submit RSVP

### Schedule
- `GET /api/schedule` - Get schedule items
- `POST /api/schedule` - Create schedule item (admin)

### Term Dates
- `GET /api/term-dates` - List term dates
- `POST /api/term-dates` - Create term date (admin)

### Weekly Message
- `GET /api/weekly-message/current` - Get current week's message
- `GET /api/weekly-message` - List all weekly messages
- `POST /api/weekly-message` - Create weekly message (admin)
- `POST /api/weekly-message/:id/heart` - Toggle heart

### Knowledge Base
- `GET /api/knowledge` - List categories and articles
- `POST /api/knowledge/category` - Create category (admin)
- `POST /api/knowledge/article` - Create article (admin)

### Pulse Surveys
- `GET /api/pulse` - List pulse surveys
- `POST /api/pulse/:id/respond` - Submit response
- `POST /api/pulse/:id/send` - Open pulse (admin)
- `POST /api/pulse/:id/close` - Close pulse (admin)

### Users & Classes
- `GET /api/users` - List users (admin)
- `POST /api/users` - Create user (admin)
- `GET /api/classes` - List classes
- `POST /api/classes` - Create class (admin)

## Deployment

### Backend (Railway)
1. Create a PostgreSQL database on Railway
2. Deploy the `server/` directory
3. Set environment variables:
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - OAuth credentials (if using)
   - `CORS_ORIGIN`

### Frontend (Vercel)
1. Connect the repository to Vercel
2. Set build directory to `client/`
3. Set environment variable: `VITE_API_URL`

## OAuth Setup

### Google OAuth
1. Go to Google Cloud Console
2. Create OAuth 2.0 credentials
3. Add callback URL: `https://your-api.com/auth/google/callback`
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### Microsoft OAuth
1. Register app in Azure Portal
2. Configure authentication
3. Add callback URL: `https://your-api.com/auth/microsoft/callback`
4. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`

## Hub SSO (staff)

Staff sign-in for the admin app is delegated to **Wasil Hub**, the ecosystem's
identity provider. Instead of a password/Google/Microsoft login inside Connect,
staff click "Connect" on the Hub dashboard:

```
Hub dashboard ──▶ Hub /launch/connect ──▶ Connect API GET /auth/hub/exchange?hub_token=<JWT>
                                                │  verifies the Hub JWT, issues Connect's
                                                │  own session tokens
                                                ▼
                            admin app  /auth/callback?code=<code>  (existing OAuth handoff)
                                                ▼
                                        admin dashboard
```

The admin app's `/auth/callback` route is unchanged — it already knows how to
exchange a `?code` for a session. What changed is the *entry point*: an
unauthenticated staff member hitting the admin app is now redirected to Hub
rather than shown Connect's own login page.

This is controlled by a coexistence flag so it can be rolled back without a
redeploy of application logic:

| Var | Where | Meaning |
| --- | --- | --- |
| `VITE_STAFF_AUTH_MODE` | `apps/admin/.env` | `hub` (default) redirects unauthenticated staff to Hub. `legacy` restores Connect's own login page — the rollback path. |
| `VITE_HUB_LAUNCH_URL` | `apps/admin/.env` | Where staff are sent to sign in (default `https://hub.wasil.app/launch/connect`). |
| `HUB_URL` / `HUB_ISSUER` / `HUB_AUDIENCE` / `HUB_JWKS_URL` | `server/.env` | Used by the API to verify Hub-issued JWTs at `GET /auth/hub/exchange` and mint Connect's own tokens. See `HUB-INTEGRATION.md` for the full server-side design. |

The legacy password/Google/Microsoft login page (`apps/admin/src/pages/LoginPage.tsx`)
is kept in the codebase but only rendered when `VITE_STAFF_AUTH_MODE=legacy` —
it is not deleted, just unrouted, so it stays available for emergency rollback.

Parents are unaffected — they continue to use Connect's existing
invitation/magic-link flow; Hub SSO in this stage covers staff only.

## Features

- **Messages**: Announcements with action items (consent, payment, RSVP)
- **Quick Surveys**: Poll parents with instant results
- **Events Calendar**: School events with RSVP tracking
- **Schedule**: Daily and recurring schedule items
- **Term Dates**: Academic calendar
- **Weekly Message**: Principal's weekly update with hearts
- **Knowledge Base**: School policies and information
- **Pulse Surveys**: Half-termly parent satisfaction surveys
- **White-label**: Customizable branding per school

## License

MIT
