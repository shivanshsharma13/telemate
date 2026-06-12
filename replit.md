# Telegram File Explorer

A production-quality file browser for Telegram channels — browse, search, filter, and bulk-download files stored in Telegram channels and groups, with a Google Drive-style interface.

## Run & Operate

- `python artifacts/api-server/main.py` — run the Python API server (port 8080)
- `pnpm --filter @workspace/telegram-explorer run dev` — run the React frontend (port 22064)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + wouter + TanStack Query
- **Backend**: Python FastAPI + Uvicorn + Telethon (MTProto)
- **Storage**: SQLite (aiosqlite) for channel/file metadata cache at `artifacts/api-server/data/cache.db`
- **Session**: Telethon SQLite session at `artifacts/api-server/data/telegram.session`
- **Downloads**: ZIP archives streamed via FastAPI FileResponse, temp files in `artifacts/api-server/downloads/`
- **API Contract**: OpenAPI 3.1 at `lib/api-spec/openapi.yaml` → codegen generates React Query hooks + Zod schemas

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `artifacts/api-server/main.py` — FastAPI app entry point
- `artifacts/api-server/src/telegram_client.py` — Telethon client singleton + auth flow
- `artifacts/api-server/src/database.py` — SQLite cache operations
- `artifacts/api-server/src/routes/` — auth, channels, files, downloads routes
- `artifacts/telegram-explorer/src/` — React frontend

## Architecture decisions

- Python FastAPI replaces the Node.js api-server for native Telethon (MTProto) integration
- SQLite used instead of PostgreSQL — no external DB needed; channel/file metadata is a cache, not source of truth
- Download jobs are in-memory (not persisted); old job directories cleaned up on startup (>2h old)
- File downloads: each file streamed to disk via Telethon, then zipped, then served via FileResponse — never fully loaded into RAM
- OpenAPI spec drives codegen for the React frontend hooks; backend uses Pydantic models directly (no Zod)

## Product

- **Auth**: multi-step Telegram OTP login (phone → code → optional 2FA password), session persisted across restarts
- **Channels**: list all channels/groups, search/sort/filter, trigger sync from Telegram
- **Files**: browse files per channel, filter by extension, sort by name/size/date, multi-select
- **Downloads**: select files → download as ZIP; real-time progress polling; completed jobs show download link

## Required Secrets

- `TELEGRAM_API_ID` — get from https://my.telegram.org/apps
- `TELEGRAM_API_HASH` — get from https://my.telegram.org/apps

## Gotchas

- After the OpenAPI spec changes, always run `pnpm --filter @workspace/api-spec run codegen` before checking TypeScript
- The api-zod barrel (`lib/api-zod/src/index.ts`) only exports from `generated/api` (not `generated/types`) to avoid TS2308 collisions — the codegen script patches this with `sed` automatically
- The api-server workflow runs from `artifacts/api-server/` directory (not workspace root)
- Channel sync and file sync are background tasks — trigger via API and poll for results
- Download jobs are in-memory; server restart clears all active jobs

## User preferences

_Populate as you build._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
