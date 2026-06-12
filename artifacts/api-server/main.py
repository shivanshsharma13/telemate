import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.database import init_db, cleanup_old_downloads
from src.telegram_client import telegram_client
from src.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await cleanup_old_downloads()
    await telegram_client.startup()
    yield
    await telegram_client.shutdown()


app = FastAPI(title="Telegram File Explorer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, log_level="info")
