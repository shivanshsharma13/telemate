import os
import asyncio
import logging
from pathlib import Path
from typing import Optional, Callable, Tuple

from telethon import TelegramClient
from telethon.tl.types import (
    Channel as TLChannel,
    Chat,
    InputMessagesFilterDocument,
    MessageMediaDocument,
    DocumentAttributeFilename,
)
from telethon.errors import SessionPasswordNeededError

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
SESSION_FILE = str(DATA_DIR / "telegram")

_auth_state: dict = {
    "step": "unauthenticated",
    "phone": None,
    "phone_code_hash": None,
}

_sync_tasks: dict = {}


class TelegramClientManager:
    def __init__(self):
        self._client: Optional[TelegramClient] = None

    def _get_credentials(self):
        api_id_raw = os.environ.get("TELEGRAM_API_ID", "")
        api_hash = os.environ.get("TELEGRAM_API_HASH", "")
        if not api_id_raw or not api_hash:
            raise RuntimeError("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set")
        return int(api_id_raw), api_hash

    def get_client(self) -> TelegramClient:
        if self._client is None:
            DATA_DIR.mkdir(exist_ok=True)
            api_id, api_hash = self._get_credentials()
            self._client = TelegramClient(
                SESSION_FILE,
                api_id,
                api_hash,
                system_version="4.16.30-vxCUSTOM",
            )
        return self._client

    async def startup(self):
        try:
            client = self.get_client()
            await client.connect()
            if await client.is_user_authorized():
                _auth_state["step"] = "authenticated"
                logger.info("Telegram: connected with existing session")
            else:
                _auth_state["step"] = "unauthenticated"
                logger.info("Telegram: connected, awaiting auth")
        except Exception as e:
            logger.error(f"Telegram startup error: {e}")

    async def shutdown(self):
        if self._client and self._client.is_connected():
            await self._client.disconnect()

    async def is_connected(self) -> bool:
        return bool(self._client and self._client.is_connected())

    async def is_authorized(self) -> bool:
        try:
            client = self.get_client()
            if not client.is_connected():
                await client.connect()
            return await client.is_user_authorized()
        except Exception:
            return False

    async def get_me(self):
        client = self.get_client()
        return await client.get_me()

    async def send_code(self, phone: str):
        client = self.get_client()
        if not client.is_connected():
            await client.connect()
        result = await client.send_code_request(phone)
        _auth_state["phone"] = phone
        _auth_state["phone_code_hash"] = result.phone_code_hash
        _auth_state["step"] = "code_sent"
        return result.phone_code_hash

    async def verify_code(self, phone: str, code: str) -> Tuple[bool, bool]:
        client = self.get_client()
        phone_code_hash = _auth_state.get("phone_code_hash")
        try:
            await client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)
            _auth_state["step"] = "authenticated"
            return True, False
        except SessionPasswordNeededError:
            _auth_state["step"] = "two_fa_required"
            return True, True

    async def verify_2fa(self, password: str) -> bool:
        client = self.get_client()
        await client.sign_in(password=password)
        _auth_state["step"] = "authenticated"
        return True

    async def logout(self):
        client = self.get_client()
        if await client.is_user_authorized():
            await client.log_out()
        _auth_state["step"] = "unauthenticated"
        _auth_state["phone"] = None
        _auth_state["phone_code_hash"] = None

    async def get_dialogs(self, limit: int = 500):
        client = self.get_client()
        dialogs = []
        async for dialog in client.iter_dialogs(limit=limit):
            entity = dialog.entity
            if isinstance(entity, (TLChannel, Chat)):
                dialogs.append(dialog)
        return dialogs

    async def get_entity(self, channel_id: int):
        client = self.get_client()
        return await client.get_entity(channel_id)

    async def iter_channel_messages(self, channel_id: int, limit=None):
        client = self.get_client()
        entity = await client.get_entity(channel_id)
        async for message in client.iter_messages(
            entity,
            filter=InputMessagesFilterDocument,
            limit=limit,
            reverse=False,
        ):
            if message.media and isinstance(message.media, MessageMediaDocument):
                yield message

    async def download_file(
        self,
        channel_id: int,
        message_id: int,
        output_path: Path,
        progress_callback: Optional[Callable] = None,
    ):
        client = self.get_client()
        entity = await client.get_entity(channel_id)
        message = await client.get_messages(entity, ids=message_id)
        if not message or not message.media:
            raise ValueError(f"Message {message_id} has no downloadable media")
        await client.download_media(
            message,
            file=str(output_path),
            progress_callback=progress_callback,
        )


def get_filename_from_message(message) -> Tuple[str, str, str, int]:
    """Returns (filename, extension, mime_type, size)."""
    doc = message.media.document
    filename = "unknown"
    for attr in doc.attributes:
        if isinstance(attr, DocumentAttributeFilename):
            filename = attr.file_name
            break
    ext = ""
    if "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
    mime_type = getattr(doc, "mime_type", "") or ""
    size = getattr(doc, "size", 0) or 0
    return filename, ext, mime_type, size


telegram_client = TelegramClientManager()
