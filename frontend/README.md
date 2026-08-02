# PBC Visitor Kiosk — Frontend

React + Vite single-page app for the PBC Visitor Kiosk: visitor check-in and
check-out, photo capture, badge preview, and the administrative screens.

## Prerequisites

- Node.js 20+ and npm

## Setup

```bash
npm install
```

Create `frontend/.env` from the tracked example and point it at your backend:

```bash
cp .env.example .env         # macOS/Linux
Copy-Item .env.example .env  # Windows PowerShell
```

```env
VITE_API_BASE=http://your-backend-host:8000
```

## Common Commands

```bash
npm run dev      # start the Vite dev server (binds 0.0.0.0)
npm run build    # production build
npm run preview  # preview the production build
npm run test     # unit tests (Vitest)
npm run lint     # ESLint
```

## Documentation

- Project overview and architecture: [../README.md](../README.md)
- Local development setup (all components): [../docs/05-Development/LocalDevelopment.md](../docs/05-Development/LocalDevelopment.md)
- Full installation and deployment: [../docs/INSTALL.md](../docs/INSTALL.md)
