import asyncio
import logging
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from ..models import TelegramFile, FileList, FileStats, SyncStatus
from ..telegram_client import telegram_client, get_filename_from_message
from ..database import (
    upsert_files,
    get_files,
    get_file_stats,
    set_channel_sync_status,
    get_channel_sync_status,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["files"])

_file_sync_tasks: dict = {}


async def _do_sync_files(channel_id: int):
    await set_channel_sync_status(channel_id, in_progress=True)
    count = 0
    batch = []
    try:
        logger.info(f"Syncing files for channel {channel_id}...")
        async for message in telegram_client.iter_channel_messages(channel_id):
            try:
                filename, ext, mime_type, size = get_filename_from_message(message)
                batch.append(
                    {
                        "message_id": message.id,
                        "filename": filename,
                        "extension": ext,
                        "size": size,
                        "mime_type": mime_type,
                        "date": message.date.isoformat() if message.date else datetime.utcnow().isoformat(),
                    }
                )
                if len(batch) >= 100:
                    await upsert_files(channel_id, batch)
                    count += len(batch)
                    batch = []
            except Exception as e:
                logger.warning(f"Error processing message {message.id}: {e}")

        if batch:
            await upsert_files(channel_id, batch)
            count += len(batch)

        await set_channel_sync_status(channel_id, in_progress=False, total_files=count)
        logger.info(f"Synced {count} files for channel {channel_id}")
    except Exception as e:
        logger.error(f"File sync error for channel {channel_id}: {e}")
        await set_channel_sync_status(channel_id, in_progress=False)
    finally:
        _file_sync_tasks.pop(channel_id, None)


@router.get("/channels/{channel_id}/stats", response_model=FileStats)
async def get_channel_file_stats(channel_id: int):
    stats = await get_file_stats(channel_id)
    return FileStats(**stats)


@router.post("/channels/{channel_id}/sync", response_model=SyncStatus)
async def sync_channel_files(channel_id: int):
    if not await telegram_client.is_authorized():
        raise HTTPException(status_code=401, detail="Not authenticated")

    sync_status = await get_channel_sync_status(channel_id)
    if sync_status and sync_status["in_progress"]:
        return SyncStatus(status="running", message="Sync already in progress for this channel")

    task = asyncio.create_task(_do_sync_files(channel_id))
    _file_sync_tasks[channel_id] = task
    return SyncStatus(
        status="started",
        message=f"File sync started for channel {channel_id}",
        task_id=str(channel_id),
    )


@router.get("/channels/{channel_id}/files", response_model=FileList)
async def list_channel_files(
    channel_id: int,
    search: Optional[str] = Query(None),
    extension: Optional[str] = Query(None),
    sort: Optional[str] = Query("date"),
    order: Optional[str] = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    files, total, total_size = await get_files(
        channel_id=channel_id,
        search=search,
        extension=extension,
        sort=sort,
        order=order,
        page=page,
        page_size=page_size,
    )
    return FileList(
        files=[TelegramFile(**f) for f in files],
        total=total,
        page=page,
        page_size=page_size,
        total_size=total_size,
    )
