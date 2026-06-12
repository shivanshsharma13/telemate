import aiosqlite
from pathlib import Path
from datetime import datetime, timedelta
import shutil
import logging

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DB_FILE = DATA_DIR / "cache.db"
DOWNLOADS_DIR = BASE_DIR / "downloads"


async def init_db():
    DATA_DIR.mkdir(exist_ok=True)
    DOWNLOADS_DIR.mkdir(exist_ok=True)

    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS channels (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                username TEXT,
                type TEXT NOT NULL DEFAULT 'channel',
                member_count INTEGER,
                has_profile_photo INTEGER DEFAULT 0,
                last_sync TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id INTEGER NOT NULL,
                message_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                extension TEXT NOT NULL DEFAULT '',
                size INTEGER NOT NULL DEFAULT 0,
                mime_type TEXT NOT NULL DEFAULT '',
                date TEXT NOT NULL,
                UNIQUE(channel_id, message_id)
            )
        """)
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_files_channel ON files(channel_id)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_files_ext ON files(extension)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_files_date ON files(date)"
        )
        await db.execute("""
            CREATE TABLE IF NOT EXISTS channel_sync_status (
                channel_id INTEGER PRIMARY KEY,
                last_sync TEXT,
                total_files INTEGER DEFAULT 0,
                in_progress INTEGER DEFAULT 0
            )
        """)
        await db.commit()


async def cleanup_old_downloads():
    """Remove download directories older than 2 hours."""
    if not DOWNLOADS_DIR.exists():
        return
    cutoff = datetime.now() - timedelta(hours=2)
    for job_dir in DOWNLOADS_DIR.iterdir():
        if job_dir.is_dir():
            try:
                mtime = datetime.fromtimestamp(job_dir.stat().st_mtime)
                if mtime < cutoff:
                    shutil.rmtree(job_dir, ignore_errors=True)
                    logger.info(f"Cleaned up old download dir: {job_dir.name}")
            except Exception as e:
                logger.warning(f"Failed to clean {job_dir}: {e}")


async def upsert_channels(channels: list):
    async with aiosqlite.connect(DB_FILE) as db:
        for ch in channels:
            await db.execute(
                """
                INSERT INTO channels (id, title, username, type, member_count, has_profile_photo, last_sync)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    username=excluded.username,
                    type=excluded.type,
                    member_count=excluded.member_count,
                    has_profile_photo=excluded.has_profile_photo,
                    last_sync=excluded.last_sync
                """,
                (
                    ch["id"],
                    ch["title"],
                    ch.get("username"),
                    ch.get("type", "channel"),
                    ch.get("member_count"),
                    1 if ch.get("has_profile_photo") else 0,
                    datetime.utcnow().isoformat(),
                ),
            )
        await db.commit()


async def get_channels(
    search: str = None,
    type_filter: str = None,
    sort: str = "title",
    order: str = "asc",
    page: int = 1,
    page_size: int = 50,
):
    valid_sorts = {"title", "member_count", "file_count", "last_sync"}
    sort_col = sort if sort in valid_sorts else "title"
    order_dir = "DESC" if order.lower() == "desc" else "ASC"

    conditions = []
    params = []

    if search:
        conditions.append("(c.title LIKE ? OR c.username LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])

    if type_filter and type_filter != "all":
        conditions.append("c.type = ?")
        params.append(type_filter)

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    if sort_col == "file_count":
        order_clause = f"file_count {order_dir}"
        select_extra = ", (SELECT COUNT(*) FROM files f WHERE f.channel_id = c.id) as file_count, (SELECT COALESCE(SUM(f.size),0) FROM files f WHERE f.channel_id = c.id) as total_size"
    else:
        order_clause = f"c.{sort_col} {order_dir}"
        select_extra = ", (SELECT COUNT(*) FROM files f WHERE f.channel_id = c.id) as file_count, (SELECT COALESCE(SUM(f.size),0) FROM files f WHERE f.channel_id = c.id) as total_size"

    offset = (page - 1) * page_size

    async with aiosqlite.connect(DB_FILE) as db:
        db.row_factory = aiosqlite.Row
        count_row = await db.execute_fetchall(
            f"SELECT COUNT(*) as cnt FROM channels c {where}", params
        )
        total = count_row[0]["cnt"] if count_row else 0

        rows = await db.execute_fetchall(
            f"""
            SELECT c.id, c.title, c.username, c.type, c.member_count,
                   c.has_profile_photo, c.last_sync
                   {select_extra}
            FROM channels c
            {where}
            ORDER BY {order_clause}
            LIMIT ? OFFSET ?
            """,
            params + [page_size, offset],
        )

    channels = []
    for row in rows:
        channels.append(
            {
                "id": row["id"],
                "title": row["title"],
                "username": row["username"],
                "type": row["type"],
                "member_count": row["member_count"],
                "has_profile_photo": bool(row["has_profile_photo"]),
                "last_sync": row["last_sync"],
                "file_count": row["file_count"],
                "total_size": row["total_size"],
            }
        )
    return channels, total


async def get_channel_by_id(channel_id: int):
    async with aiosqlite.connect(DB_FILE) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """
            SELECT c.id, c.title, c.username, c.type, c.member_count,
                   c.has_profile_photo, c.last_sync,
                   (SELECT COUNT(*) FROM files f WHERE f.channel_id = c.id) as file_count,
                   (SELECT COALESCE(SUM(f.size),0) FROM files f WHERE f.channel_id = c.id) as total_size
            FROM channels c WHERE c.id = ?
            """,
            [channel_id],
        )
    if not rows:
        return None
    row = rows[0]
    return {
        "id": row["id"],
        "title": row["title"],
        "username": row["username"],
        "type": row["type"],
        "member_count": row["member_count"],
        "has_profile_photo": bool(row["has_profile_photo"]),
        "last_sync": row["last_sync"],
        "file_count": row["file_count"],
        "total_size": row["total_size"],
    }


async def get_channel_stats():
    async with aiosqlite.connect(DB_FILE) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """
            SELECT
                (SELECT COUNT(*) FROM channels) as total_channels,
                (SELECT COUNT(*) FROM files) as total_files,
                (SELECT COALESCE(SUM(size),0) FROM files) as total_size,
                (SELECT MAX(last_sync) FROM channels) as last_sync
            """
        )
    row = rows[0] if rows else {}
    return {
        "total_channels": row["total_channels"] or 0,
        "total_files": row["total_files"] or 0,
        "total_size": row["total_size"] or 0,
        "last_sync": row["last_sync"],
    }


async def upsert_files(channel_id: int, file_rows: list):
    async with aiosqlite.connect(DB_FILE) as db:
        for f in file_rows:
            await db.execute(
                """
                INSERT INTO files (channel_id, message_id, filename, extension, size, mime_type, date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(channel_id, message_id) DO UPDATE SET
                    filename=excluded.filename,
                    size=excluded.size,
                    mime_type=excluded.mime_type
                """,
                (
                    channel_id,
                    f["message_id"],
                    f["filename"],
                    f["extension"],
                    f["size"],
                    f["mime_type"],
                    f["date"],
                ),
            )
        await db.commit()


async def set_channel_sync_status(channel_id: int, in_progress: bool, total_files: int = 0):
    async with aiosqlite.connect(DB_FILE) as db:
        now = datetime.utcnow().isoformat()
        await db.execute(
            """
            INSERT INTO channel_sync_status (channel_id, last_sync, total_files, in_progress)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(channel_id) DO UPDATE SET
                last_sync=excluded.last_sync,
                total_files=excluded.total_files,
                in_progress=excluded.in_progress
            """,
            (channel_id, now, total_files, 1 if in_progress else 0),
        )
        if not in_progress:
            await db.execute(
                "UPDATE channels SET last_sync=? WHERE id=?",
                (now, channel_id),
            )
        await db.commit()


async def get_channel_sync_status(channel_id: int):
    async with aiosqlite.connect(DB_FILE) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT * FROM channel_sync_status WHERE channel_id=?",
            [channel_id],
        )
    return rows[0] if rows else None


async def get_files(
    channel_id: int,
    search: str = None,
    extension: str = None,
    sort: str = "date",
    order: str = "desc",
    page: int = 1,
    page_size: int = 100,
):
    valid_sorts = {"filename", "size", "date", "extension"}
    sort_col = sort if sort in valid_sorts else "date"
    order_dir = "DESC" if order.lower() == "desc" else "ASC"

    conditions = ["channel_id = ?"]
    params = [channel_id]

    if search:
        conditions.append("filename LIKE ?")
        params.append(f"%{search}%")

    if extension:
        conditions.append("extension = ?")
        params.append(extension.lower().lstrip("."))

    where = "WHERE " + " AND ".join(conditions)
    offset = (page - 1) * page_size

    async with aiosqlite.connect(DB_FILE) as db:
        db.row_factory = aiosqlite.Row
        count_rows = await db.execute_fetchall(
            f"SELECT COUNT(*) as cnt, COALESCE(SUM(size),0) as total_size FROM files {where}",
            params,
        )
        total = count_rows[0]["cnt"] if count_rows else 0
        total_size = count_rows[0]["total_size"] if count_rows else 0

        rows = await db.execute_fetchall(
            f"""
            SELECT message_id, channel_id, filename, extension, size, mime_type, date
            FROM files
            {where}
            ORDER BY {sort_col} {order_dir}
            LIMIT ? OFFSET ?
            """,
            params + [page_size, offset],
        )

    files = [
        {
            "message_id": row["message_id"],
            "channel_id": row["channel_id"],
            "filename": row["filename"],
            "extension": row["extension"],
            "size": row["size"],
            "mime_type": row["mime_type"],
            "date": row["date"],
            "is_document": True,
        }
        for row in rows
    ]
    return files, total, total_size


async def get_file_stats(channel_id: int):
    sync_status = await get_channel_sync_status(channel_id)

    async with aiosqlite.connect(DB_FILE) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """
            SELECT
                COUNT(*) as total_files,
                COALESCE(SUM(size),0) as total_size
            FROM files WHERE channel_id=?
            """,
            [channel_id],
        )
        ext_rows = await db.execute_fetchall(
            """
            SELECT extension, COUNT(*) as cnt
            FROM files WHERE channel_id=?
            GROUP BY extension
            ORDER BY cnt DESC
            """,
            [channel_id],
        )

    row = rows[0] if rows else {}
    file_types = {r["extension"] or "unknown": r["cnt"] for r in ext_rows}

    return {
        "total_files": row["total_files"] or 0,
        "total_size": row["total_size"] or 0,
        "synced": sync_status is not None and not bool(sync_status["in_progress"]),
        "last_sync": sync_status["last_sync"] if sync_status else None,
        "file_types": file_types,
    }
