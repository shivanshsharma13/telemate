import asyncio
import logging
import shutil
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import aiofiles
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..models import DownloadJob, DownloadRequest, SyncStatus
from ..telegram_client import telegram_client, get_filename_from_message
from ..database import get_files, DB_FILE
import aiosqlite

logger = logging.getLogger(__name__)
router = APIRouter(tags=["downloads"])

BASE_DIR = Path(__file__).parent.parent.parent
DOWNLOADS_DIR = BASE_DIR / "downloads"

_jobs: dict[str, dict] = {}


def _make_job(channel_id: int, total_files: int, archive_name: str) -> dict:
    job_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    job = {
        "job_id": job_id,
        "status": "pending",
        "channel_id": channel_id,
        "total_files": total_files,
        "downloaded_files": 0,
        "failed_files": 0,
        "total_size": 0,
        "downloaded_size": 0,
        "error": None,
        "created_at": now,
        "completed_at": None,
        "download_url": None,
        "archive_name": archive_name,
        "zip_path": None,
    }
    _jobs[job_id] = job
    return job


async def _run_download(job_id: str, channel_id: int, message_ids: Optional[List[int]]):
    job = _jobs[job_id]
    job["status"] = "running"
    job_dir = DOWNLOADS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        client = telegram_client.get_client()
        entity = await client.get_entity(channel_id)

        if message_ids is None:
            msgs = []
            async for message in telegram_client.iter_channel_messages(channel_id):
                msgs.append(message)
        else:
            msgs = await client.get_messages(entity, ids=message_ids)
            if not isinstance(msgs, list):
                msgs = [msgs]
            msgs = [m for m in msgs if m and m.media]

        job["total_files"] = len(msgs)
        total_size = sum(
            getattr(getattr(m.media, "document", None), "size", 0) or 0 for m in msgs
        )
        job["total_size"] = total_size

        downloaded_paths = []
        for message in msgs:
            if not message or not message.media:
                continue
            try:
                filename, ext, mime_type, size = get_filename_from_message(message)
                safe_name = f"{message.id}_{filename}"
                out_path = job_dir / safe_name

                def _progress(current, total):
                    pass

                await client.download_media(
                    message,
                    file=str(out_path),
                    progress_callback=_progress,
                )
                job["downloaded_files"] += 1
                job["downloaded_size"] += out_path.stat().st_size if out_path.exists() else 0
                downloaded_paths.append((out_path, filename))
            except Exception as e:
                logger.warning(f"Failed to download message {message.id}: {e}")
                job["failed_files"] += 1

        archive_name = job.get("archive_name") or f"channel_{channel_id}"
        zip_path = DOWNLOADS_DIR / f"{job_id}.zip"

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
            for file_path, orig_name in downloaded_paths:
                if file_path.exists():
                    zf.write(file_path, orig_name)
                    file_path.unlink()

        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)

        job["zip_path"] = str(zip_path)
        job["download_url"] = f"/api/downloads/{job_id}/file"
        job["status"] = "completed"
        job["completed_at"] = datetime.utcnow().isoformat()

    except Exception as e:
        logger.error(f"Download job {job_id} failed: {e}")
        job["status"] = "failed"
        job["error"] = str(e)
        job["completed_at"] = datetime.utcnow().isoformat()


def _job_to_model(job: dict) -> DownloadJob:
    return DownloadJob(
        job_id=job["job_id"],
        status=job["status"],
        channel_id=job["channel_id"],
        total_files=job["total_files"],
        downloaded_files=job["downloaded_files"],
        failed_files=job["failed_files"],
        total_size=job["total_size"],
        downloaded_size=job["downloaded_size"],
        error=job.get("error"),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
        download_url=job.get("download_url"),
    )


@router.get("/downloads")
async def list_downloads() -> List[DownloadJob]:
    return [_job_to_model(j) for j in _jobs.values()]


@router.post("/downloads", status_code=201, response_model=DownloadJob)
async def create_download(body: DownloadRequest):
    if not await telegram_client.is_authorized():
        raise HTTPException(status_code=401, detail="Not authenticated")

    if body.message_ids is not None:
        total = len(body.message_ids)
    else:
        async with aiosqlite.connect(DB_FILE) as db:
            rows = await db.execute_fetchall(
                "SELECT COUNT(*) as cnt FROM files WHERE channel_id=?",
                [body.channel_id],
            )
            total = rows[0][0] if rows else 0

    archive_name = body.archive_name or f"channel_{body.channel_id}"
    job = _make_job(body.channel_id, total, archive_name)

    asyncio.create_task(
        _run_download(job["job_id"], body.channel_id, body.message_ids)
    )

    return _job_to_model(job)


@router.get("/downloads/{job_id}", response_model=DownloadJob)
async def get_download(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_model(job)


@router.delete("/downloads/{job_id}", status_code=204)
async def cancel_download(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job["status"] = "cancelled"
    zip_path = job.get("zip_path")
    if zip_path and Path(zip_path).exists():
        Path(zip_path).unlink(missing_ok=True)
    job_dir = DOWNLOADS_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
    _jobs.pop(job_id, None)


@router.get("/downloads/{job_id}/file")
async def download_file(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"Job is {job['status']}, not completed")
    zip_path = job.get("zip_path")
    if not zip_path or not Path(zip_path).exists():
        raise HTTPException(status_code=404, detail="ZIP file not found")
    archive_name = job.get("archive_name", f"download_{job_id}")
    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"{archive_name}.zip",
    )
