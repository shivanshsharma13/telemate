from pydantic import BaseModel
from typing import Optional, List, Dict


class AuthStatus(BaseModel):
    authenticated: bool
    step: str
    phone: Optional[str] = None
    username: Optional[str] = None
    first_name: Optional[str] = None


class PhoneInput(BaseModel):
    phone: str


class CodeInput(BaseModel):
    phone: str
    code: str


class PasswordInput(BaseModel):
    password: str


class Channel(BaseModel):
    id: int
    title: str
    username: Optional[str] = None
    type: str
    member_count: Optional[int] = None
    file_count: Optional[int] = None
    total_size: Optional[int] = None
    last_sync: Optional[str] = None
    has_profile_photo: bool = False


class ChannelList(BaseModel):
    channels: List[Channel]
    total: int
    page: int
    page_size: int


class ChannelStats(BaseModel):
    total_channels: int
    total_files: int
    total_size: int
    last_sync: Optional[str] = None


class TelegramFile(BaseModel):
    message_id: int
    channel_id: int
    filename: str
    extension: str
    size: int
    mime_type: str
    date: str
    is_document: bool = True


class FileList(BaseModel):
    files: List[TelegramFile]
    total: int
    page: int
    page_size: int
    total_size: int


class FileStats(BaseModel):
    total_files: int
    total_size: int
    synced: bool
    last_sync: Optional[str] = None
    file_types: Dict[str, int] = {}


class ChannelLinkInput(BaseModel):
    link: str


class DownloadRequest(BaseModel):
    channel_id: int
    message_ids: Optional[List[int]] = None
    archive_name: Optional[str] = None


class DownloadJob(BaseModel):
    job_id: str
    status: str
    channel_id: int
    total_files: int
    downloaded_files: int
    failed_files: int
    total_size: int
    downloaded_size: int
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    download_url: Optional[str] = None


class SyncStatus(BaseModel):
    status: str
    message: str
    task_id: Optional[str] = None
