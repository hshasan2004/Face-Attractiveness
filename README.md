# Face-Attractiveness (FaceValue)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Top Language](https://img.shields.io/github/languages/top/hshasan2004/Face-Attractiveness)
![Repo Size](https://img.shields.io/github/repo-size/hshasan2004/Face-Attractiveness)
![Last Commit](https://img.shields.io/github/last-commit/hshasan2004/Face-Attractiveness)

FaceValue is a full-stack research platform for collecting structured human attractiveness ratings on celebrity photos. It provides two complete experiences:

- Evaluator workflow: sign up, review study rules, rate photos, take managed breaks, resume progress, and view rewards.
- Admin workflow: manage surveys and media, monitor real-time participation, and export analytics-ready results.

The application is built with React + Vite on the frontend, Supabase for auth/database/storage/realtime, and Firebase Hosting for deployment.

## Screenshots

Add screenshots to make the repository page more visual. Recommended location:

- `docs/screenshots/`

Recommended captures:

- Login page
- Rules page
- Survey rating interface
- Rewards page
- Admin dashboard
- Admin results/statistics

Markdown template (replace paths once images are added):

```md
![Login](docs/screenshots/login.png)
![Survey](docs/screenshots/survey.png)
![Admin Dashboard](docs/screenshots/admin-dashboard.png)
```

## Table of Contents

1. [Core Features](#core-features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Quick Start](#quick-start)
6. [Environment Variables](#environment-variables)
7. [Database and Migrations](#database-and-migrations)
8. [Rewards System Setup](#rewards-system-setup)
9. [Scripts](#scripts)
10. [Deployment](#deployment)
11. [Security and Access Model](#security-and-access-model)
12. [Known Constraints](#known-constraints)
13. [Troubleshooting](#troubleshooting)
14. [License](#license)


## 👥 Devs

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/hshasan2004">
        <img src="https://github.com/hshasan2004.png" width="100px" height="100px" style="object-fit:cover;" alt="Hasan"/>
        <br/>
        <b>Mohammad Hasan</b>
      </a>
      <br/>
      <small>Full Stack Developer</small>
    </td>
    <td align="center">
      <a href="https://github.com/if-i-shajan">
        <img src="https://github.com/if-i-shajan.png" width="100px" height="100px" style="object-fit:cover;" alt="Shajan"/>
        <br/>
        <b>J.M. Ifthakharul Islam Shajan</b>
      </a>
      <br/>
      <small>Full Stack Developer</small>
    </td>
  </tr>
</table>


## Core Features

### Evaluator Features

- Email/password registration and login.
- Rules page before survey participation.
- 1-5 star rating workflow for survey photos.
- Resume-capable progress and handling for newly added unrated photos.
- Break enforcement with countdown and delayed skip logic.
- Responsive image delivery tuned for better client performance.
- Completion summary page.
- Rewards dashboard with points, tiers, achievements, leaderboard, and transaction history.

### Admin and Research Operations

- Separate admin login and role-protected admin routes.
- Survey lifecycle management (draft, active, closed).
- Survey creation workflow with metadata controls.
- Single-active-survey operational model.
- Celebrity management and photo upload/cropping pipeline.
- Profile image support for celebrity records.
- Real-time dashboard metrics and participant breakdowns.
- Results and statistics views with filtering/sorting.
- CSV export for downstream research analysis.
- DB setup helper page and migration support scripts.

### Backend and Data Capabilities

- Supabase Auth integration with session persistence.
- PostgreSQL schema for surveys, ratings, profiles, rewards, and related entities.
- Row-Level Security (RLS) policies for user/admin access boundaries.
- SQL migration scripts for schema evolution and performance indexing.
- Realtime subscriptions for live admin metrics.

## Tech Stack

- Frontend: React 18, Vite, React Router.
- Data/Auth/Storage: Supabase (`@supabase/supabase-js`).
- Charts and analytics UI: Chart.js, react-chartjs-2.
- Image/PDF utilities: react-easy-crop, html2canvas, jsPDF.
- Hosting: Firebase Hosting.
- Tooling: Node.js/npm, SQL migrations, helper scripts in JS/Python.

## Project Structure

This repository is a workspace wrapper with the main app inside:

- `facevalue-project (1)/facevalue/`: Main FaceValue application.
- `facevalue-project (1)/facevalue/src/`: React app source code.
- `facevalue-project (1)/facevalue/migrations/`: SQL migration files.
- `supabase/config.toml`: Supabase local config reference.
- Root `package.json`: Convenience scripts that proxy into the app folder.

## Prerequisites

- Node.js 18+ (recommended LTS).
- npm 9+.
- A Supabase project with URL and anon key.
- Firebase project/CLI for hosting deployment (optional for local dev).

## Quick Start

1. Install root dependencies:

	```bash
	npm install
	```

2. Install app dependencies:

	```bash
	npm --prefix "facevalue-project (1)/facevalue" install
	```

3. Create environment file for the app:

	Path:
	`facevalue-project (1)/facevalue/.env.local`

	Example:

	```env
	VITE_SUPABASE_URL=https://your-project-id.supabase.co
	VITE_SUPABASE_ANON_KEY=your-anon-key
	```

4. Run development server from workspace root:

	```bash
	npm run dev
	```

5. Open the URL shown by Vite (typically `http://localhost:5173`).

## Environment Variables

The app currently requires:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

If these values are missing, the client falls back to placeholders and authentication/database requests will fail.

## Database and Migrations

Use the SQL and migration files in the app directory to bootstrap or evolve the schema:

- `facevalue-project (1)/facevalue/database_setup.sql`
- `facevalue-project (1)/facevalue/migrations/*.sql`
- `facevalue-project (1)/facevalue/DATABASE_SETUP.md`
- `facevalue-project (1)/facevalue/DYNAMIC_SURVEYS.md`

Suggested order:

1. Apply base schema setup.
2. Apply migration files in intended sequence.
3. Validate RLS and admin role behavior.

## Rewards System Setup

Rewards features are migration/setup dependent. Use one of the provided setup paths:

- SQL scripts: `REWARDS_SETUP.sql`
- Node scripts: `setup-rewards*.mjs`
- Python scripts: `setup-rewards*.py`
- Guide: `SETUP_REWARDS.md`

## Scripts

### Root Workspace Scripts

Run from repository root:

- `npm run dev`: Starts Vite dev server in app folder.
- `npm run build`: Builds production bundle.
- `npm run preview`: Previews build locally.
- `npm run deploy`: Builds and deploys via app-level deploy script.

### App-Level Scripts

Run in `facevalue-project (1)/facevalue`:

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run deploy`
- `npm run deploy:hosting`

## Deployment

This project is configured for Firebase Hosting with SPA rewrites:

1. Build:

	```bash
	npm run build
	```

2. Deploy:

	```bash
	npm run deploy
	```

Firebase hosting config exists in both root and app-level `firebase.json` files.

## Security and Access Model

- Role-based route protection in frontend (`user` and `admin`).
- Supabase RLS policies enforce data access boundaries.
- User-only visibility for personal records.
- Admin-only management capabilities for research operations.

## Known Constraints

- Operational model assumes a single active survey at a time.
- Certain features require schema migrations before they are available.
- Rewards features require explicit setup.
- Age and registration constraints are enforced by the current auth/profile flow.

## Troubleshooting

- If login fails immediately, verify `.env.local` values and Supabase project status.
- If admin pages are inaccessible, verify role data and RLS policies.
- If survey creation or rewards fail, confirm all required SQL migrations/scripts were applied.
- If deployment fails, verify Firebase CLI authentication and hosting target configuration.

## License

This project is licensed under the MIT License.

See the [LICENSE](LICENSE) file for full terms.