from fastapi import APIRouter
from .health import router as health_router
from .auth import router as auth_router
from .channels import router as channels_router
from .files import router as files_router
from .downloads import router as downloads_router

router = APIRouter()
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(channels_router)
router.include_router(files_router)
router.include_router(downloads_router)
