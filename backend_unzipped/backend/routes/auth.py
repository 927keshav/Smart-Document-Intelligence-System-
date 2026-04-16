from fastapi import APIRouter, Depends, Header, HTTPException

from backend.config.settings import settings
from backend.models.user_model import GoogleLoginRequest, UserLoginRequest, UserRegisterRequest
from backend.services.auth_service import (
    authenticate_user,
    authenticate_google_user,
    create_session,
    delete_session,
    get_current_user,
    register_user,
    serialize_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
def register(request: UserRegisterRequest):
    user = register_user(request.name, request.email, request.password)
    authenticated_user = authenticate_user(request.email, request.password)
    token = create_session(authenticated_user)
    return {"token": token, "user": user.model_dump()}


@router.post("/login")
def login(request: UserLoginRequest):
    user = authenticate_user(request.email, request.password)
    token = create_session(user)
    return {"token": token, "user": serialize_user(user)}


@router.post("/google")
def login_with_google(request: GoogleLoginRequest):
    user = authenticate_google_user(request.credential)
    token = create_session(user)
    return {"token": token, "user": serialize_user(user)}


@router.get("/config")
def auth_config():
    return {
        "google_client_id": settings.google_client_id,
        "google_enabled": bool(settings.google_client_id),
    }


@router.get("/me")
def me(user=Depends(get_current_user)):
    return {"user": serialize_user(user)}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None), user=Depends(get_current_user)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    delete_session(authorization.split(" ", 1)[1].strip())
    return {"message": f"Logged out {user['email']}"}
