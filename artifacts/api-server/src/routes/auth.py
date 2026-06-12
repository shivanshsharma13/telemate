import logging
from fastapi import APIRouter, HTTPException
from ..models import AuthStatus, PhoneInput, CodeInput, PasswordInput
from ..telegram_client import telegram_client, _auth_state

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


async def _build_auth_status(authenticated: bool, step: str, phone: str = None) -> AuthStatus:
    me = None
    if authenticated:
        try:
            me = await telegram_client.get_me()
        except Exception:
            pass
    return AuthStatus(
        authenticated=authenticated,
        step=step,
        phone=phone or _auth_state.get("phone"),
        username=me.username if me else None,
        first_name=me.first_name if me else None,
    )


@router.get("/status")
async def get_auth_status():
    authorized = await telegram_client.is_authorized()
    step = "authenticated" if authorized else _auth_state.get("step", "unauthenticated")
    return await _build_auth_status(authorized, step)


@router.post("/send-code")
async def send_code(body: PhoneInput):
    try:
        await telegram_client.send_code(body.phone)
        return await _build_auth_status(False, "code_sent", body.phone)
    except Exception as e:
        logger.error(f"send_code error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/verify-code")
async def verify_code(body: CodeInput):
    try:
        success, needs_2fa = await telegram_client.verify_code(body.phone, body.code)
        if needs_2fa:
            return await _build_auth_status(False, "two_fa_required", body.phone)
        return await _build_auth_status(True, "authenticated", body.phone)
    except Exception as e:
        logger.error(f"verify_code error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/verify-2fa")
async def verify_2fa(body: PasswordInput):
    try:
        await telegram_client.verify_2fa(body.password)
        return await _build_auth_status(True, "authenticated")
    except Exception as e:
        logger.error(f"verify_2fa error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/logout")
async def logout_route():
    try:
        await telegram_client.logout()
        return await _build_auth_status(False, "unauthenticated")
    except Exception as e:
        logger.error(f"logout error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
