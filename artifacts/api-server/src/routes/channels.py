import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from ..models import Channel, ChannelList, ChannelStats, SyncStatus, ChannelLinkInput
from ..telegram_client import telegram_client
from ..database import (
    upsert_channels,
    get_channels,
    get_channel_by_id,
    get_channel_stats,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["channels"])

_sync_running = False


async def _do_sync_channels():
    global _sync_running
    _sync_running = True
    try:
        logger.info("Syncing channels from Telegram...")
        dialogs = await telegram_client.get_dialogs(limit=500)
        rows = []
        for dialog in dialogs:
            entity = dialog.entity
            entity_type = type(entity).__name__.lower()
            if "channel" in entity_type:
                etype = "channel"
            else:
                etype = "group"
            row = {
                "id": entity.id,
                "title": dialog.name or "",
                "username": getattr(entity, "username", None),
                "type": etype,
                "member_count": getattr(entity, "participants_count", None),
                "has_profile_photo": entity.photo is not None,
            }
            rows.append(row)
        await upsert_channels(rows)
        logger.info(f"Synced {len(rows)} channels")
    except Exception as e:
        logger.error(f"Channel sync error: {e}")
    finally:
        _sync_running = False


@router.get("/channels/stats", response_model=ChannelStats)
async def get_channel_stats_route():
    stats = await get_channel_stats()
    return ChannelStats(**stats)


@router.post("/channels/sync", response_model=SyncStatus)
async def sync_channels():
    if not await telegram_client.is_authorized():
        raise HTTPException(status_code=401, detail="Not authenticated")
    if _sync_running:
        return SyncStatus(status="running", message="Sync already in progress")
    asyncio.create_task(_do_sync_channels())
    return SyncStatus(status="started", message="Channel sync started in background")


@router.get("/channels", response_model=ChannelList)
async def list_channels(
    search: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    sort: Optional[str] = Query("title"),
    order: Optional[str] = Query("asc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    channels, total = await get_channels(
        search=search,
        type_filter=type,
        sort=sort,
        order=order,
        page=page,
        page_size=page_size,
    )
    return ChannelList(
        channels=[Channel(**c) for c in channels],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/channels/add", response_model=Channel)
async def add_channel(body: ChannelLinkInput):
    if not await telegram_client.is_authorized():
        raise HTTPException(status_code=401, detail="Not authenticated")

    link = body.link.strip()

    # Parse the identifier from various formats
    if "t.me/" in link:
        path = link.split("t.me/", 1)[1].strip("/")
        identifier = path.split("/")[0]
    elif link.startswith("@"):
        identifier = link[1:]
    else:
        identifier = link

    if not identifier:
        raise HTTPException(status_code=400, detail="Invalid channel link or username")

    try:
        client = telegram_client.get_client()
        entity = await client.get_entity(identifier)

        entity_type_name = type(entity).__name__.lower()
        etype = "channel" if "channel" in entity_type_name else "group"

        row = {
            "id": entity.id,
            "title": getattr(entity, "title", identifier),
            "username": getattr(entity, "username", None),
            "type": etype,
            "member_count": getattr(entity, "participants_count", None),
            "has_profile_photo": entity.photo is not None,
        }
        await upsert_channels([row])

        ch = await get_channel_by_id(entity.id)
        if not ch:
            raise HTTPException(status_code=500, detail="Failed to save channel")
        return Channel(**ch)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"add_channel error for '{identifier}': {e}")
        raise HTTPException(
            status_code=404,
            detail=f"Could not find or access channel '{identifier}': {str(e)}",
        )


@router.get("/channels/{channel_id}", response_model=Channel)
async def get_channel(channel_id: int):
    ch = await get_channel_by_id(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    return Channel(**ch)
