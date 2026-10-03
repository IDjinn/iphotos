# AGENTS.md

## Project Rules

- **DO** write `.md` files and code in English; plan documents (`docs/plans/`) follow decision D1 (PT-BR docs, English code/UI).
- **DO** keep the frontend dependent on explicit API contracts (`src/data/*` typed modules) — never encode backend implementation details, business rules, or pricing into the app.
- **DO** follow the roadmap workflow in `docs/plans/00-roadmap.md`: read the doc for the topic before coding, update the §5 status table and task checkboxes when a stage is done.

## Docker (local compose)

- **IF** Docker is running (compose services up), **DO** rebuild and restart the containers after finishing each task that touches `backend/` (API or worker) — `docker compose up --build -d` from `backend/`. Migrations apply automatically at startup, so a rebuild also applies schema changes.
- **DO** verify the API came back healthy after the restart: `GET http://localhost:5205/health`.
- Frontend changes do not require a Docker rebuild (the app runs on the device via Metro).
