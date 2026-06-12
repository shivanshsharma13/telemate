---
name: Python api-server setup
description: FastAPI replaces Node.js api-server; key gotchas on run path and directory
---

The api-server artifact uses Python FastAPI + Telethon instead of the default Node.js Express template.

**Rule**: The artifact workflow runs from the `artifacts/api-server/` directory, NOT the workspace root.
**Why**: The `.replit-artifact/artifact.toml` `run` command is executed relative to the artifact directory. Using `python artifacts/api-server/main.py` doubles the path and fails with "No such file or directory". Use `python main.py` instead.

**How to apply**: Always set `run = "python main.py"` (and prod args `["python", "main.py"]`) in artifact.toml for this project's api-server.

Key files:
- Entry: `artifacts/api-server/main.py` — uses `sys.path.insert(0, str(Path(__file__).parent))` to make `src/` importable
- Session: `artifacts/api-server/data/telegram.session` (Telethon SQLiteSession)
- Cache DB: `artifacts/api-server/data/cache.db` (aiosqlite)
- Downloads: `artifacts/api-server/downloads/` (cleaned up on startup >2h old)
