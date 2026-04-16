import hashlib
import hmac
import os
from datetime import datetime
from uuid import uuid4

from fastapi import Header, HTTPException

from backend.config.settings import settings
from backend.models.user_model import UserPublic
from backend.services.auth_store import load_sessions, load_users, save_sessions, save_users

try:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token
except Exception:
    google_requests = None
    google_id_token = None


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return digest.hex()


def register_user(name: str, email: str, password: str) -> UserPublic:
    users = load_users()
    normalized_email = _normalize_email(email)
    if any(existing.get("email") == normalized_email for existing in users):
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    salt = os.urandom(16).hex()
    user = {
        "id": str(uuid4()),
        "name": name.strip(),
        "email": normalized_email,
        "provider": "local",
        "google_sub": "",
        "password_salt": salt,
        "password_hash": _hash_password(password, salt),
        "created_at": datetime.utcnow().isoformat(),
    }
    users.append(user)
    save_users(users)
    return UserPublic(id=user["id"], name=user["name"], email=user["email"])


def authenticate_user(email: str, password: str):
    normalized_email = _normalize_email(email)
    user = next((existing for existing in load_users() if existing.get("email") == normalized_email), None)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    expected_hash = _hash_password(password, user["password_salt"])
    if not hmac.compare_digest(expected_hash, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return user


def authenticate_google_user(credential: str):
    if not settings.google_client_id:
        raise HTTPException(status_code=400, detail="Google sign-in is not configured.")
    if not credential:
        raise HTTPException(status_code=400, detail="Missing Google credential.")
    if google_id_token is None or google_requests is None:
        raise HTTPException(status_code=500, detail="google-auth is not installed on the backend.")

    try:
        token_info = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception as error:
        raise HTTPException(status_code=401, detail="Invalid Google sign-in token.") from error

    email = _normalize_email(token_info.get("email", ""))
    if not email:
        raise HTTPException(status_code=400, detail="Google account email was not provided.")

    users = load_users()
    user = next((existing for existing in users if existing.get("email") == email), None)
    if user:
        if token_info.get("sub") and not user.get("google_sub"):
            user["google_sub"] = token_info["sub"]
            if not user.get("provider"):
                user["provider"] = "google"
            save_users(users)
        return user

    new_user = {
        "id": str(uuid4()),
        "name": (token_info.get("name") or email.split("@")[0]).strip(),
        "email": email,
        "provider": "google",
        "google_sub": token_info.get("sub", ""),
        "password_salt": "",
        "password_hash": "",
        "created_at": datetime.utcnow().isoformat(),
    }
    users.append(new_user)
    save_users(users)
    return new_user


def create_session(user: dict) -> str:
    sessions = load_sessions()
    token = uuid4().hex + uuid4().hex
    sessions = [session for session in sessions if session.get("user_id") != user["id"]]
    sessions.append(
        {
            "token": token,
            "user_id": user["id"],
            "created_at": datetime.utcnow().isoformat(),
        }
    )
    save_sessions(sessions)
    return token


def delete_session(token: str) -> None:
    sessions = [session for session in load_sessions() if session.get("token") != token]
    save_sessions(sessions)


def get_user_for_token(token: str):
    session = next((item for item in load_sessions() if item.get("token") == token), None)
    if not session:
        return None

    return next((user for user in load_users() if user.get("id") == session.get("user_id")), None)


def serialize_user(user: dict) -> dict:
    return UserPublic(id=user["id"], name=user["name"], email=user["email"]).model_dump()


def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")

    token = authorization.split(" ", 1)[1].strip()
    user = get_user_for_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    return user
