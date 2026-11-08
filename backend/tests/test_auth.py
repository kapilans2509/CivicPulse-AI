"""
Auth test suite — covers all 10 auth requirements:

1. Registration creates a user and returns UserRead (no password field).
2. Duplicate email registration returns 409.
3. Login with correct credentials returns a bearer JWT and user record.
4. Login with wrong password returns 401.
5. Login with unknown email returns 401 (same message — no enumeration).
6. A valid token lets get_current_user resolve the user.
7. An expired token returns 401 with "Token has expired."
8. A tampered / invalid token returns 401.
9. require_role allows an authorised role.
10. require_role blocks an unauthorised role with 403.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.main import app

# ── In-memory SQLite database for tests ──────────────────────────────────────

# Named shared in-memory DB keeps all connections on the same in-memory store
# for the lifetime of the process, which is required by SQLAlchemy + SQLite.
TEST_DATABASE_URL = "sqlite+pysqlite:///file:testdb?mode=memory&cache=shared&uri=true"

_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
_TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def override_get_db():
    db = _TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    """
    Yields a TestClient backed by a clean in-memory database.
    Tables are created before the test and dropped after.
    """
    # Import all models so Base.metadata knows about them
    from app.models import user, issue, agent_log, approval  # noqa: F401
    Base.metadata.create_all(bind=_engine)
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=_engine)


# ── Helpers ───────────────────────────────────────────────────────────────────

CITIZEN = {"name": "Alice Citizen", "email": "alice@example.com", "password": "Str0ngPass!"}
ADMIN   = {"name": "Bob Admin",     "email": "bob@example.com",   "password": "Adm1nPass!"}
OFFICER = {"name": "Carol Officer", "email": "carol@example.com", "password": "0fficerP4ss"}


def register(client, payload=None):
    return client.post("/api/auth/register", json=payload or CITIZEN)


def seed_user(role: str, name: str, email: str, password: str) -> None:
    """
    Insert a user with an arbitrary role directly into the test DB,
    bypassing the public registration endpoint.  Used to set up
    admin/officer accounts for role-based access tests.
    """
    from app.core.security import hash_password
    from app.models.user import User
    db = _TestingSession()
    try:
        user = User(name=name, email=email.lower(),
                    hashed_password=hash_password(password), role=role)
        db.add(user)
        db.commit()
    finally:
        db.close()


def login(client, email, password):
    return client.post(
        "/api/auth/token",
        data={"username": email, "password": password},
    )


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── 1. Registration ───────────────────────────────────────────────────────────

def test_register_success(client):
    r = register(client)
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == CITIZEN["email"]
    assert body["role"] == "citizen"
    assert body["id"] > 0
    assert "hashed_password" not in body
    assert "password" not in body


# ── 2. Duplicate email ────────────────────────────────────────────────────────

def test_register_duplicate_email(client):
    register(client)  # first registration succeeds
    r = register(client)  # second must fail
    assert r.status_code == 409
    assert "already exists" in r.json()["detail"].lower()


# ── 3. Login with correct credentials ────────────────────────────────────────

def test_login_success(client):
    register(client)
    r = login(client, CITIZEN["email"], CITIZEN["password"])
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == CITIZEN["email"]
    assert "hashed_password" not in body["user"]
    # Token must be a non-empty string
    assert isinstance(body["access_token"], str) and len(body["access_token"]) > 20


# ── 4. Login with wrong password ─────────────────────────────────────────────

def test_login_wrong_password(client):
    register(client)
    r = login(client, CITIZEN["email"], "wrongpassword")
    assert r.status_code == 401
    assert "incorrect" in r.json()["detail"].lower()


# ── 5. Login with unknown email ───────────────────────────────────────────────

def test_login_unknown_email(client):
    # No registration — email does not exist
    r = login(client, "ghost@example.com", "anypassword")
    assert r.status_code == 401
    # Same error message as wrong password — no user enumeration
    assert "incorrect" in r.json()["detail"].lower()


# ── 6. Valid token resolves the current user ──────────────────────────────────

def test_get_current_user_with_valid_token(client):
    """
    /api/auth/token returns a bearer token; a protected endpoint that uses
    get_current_user should return 200 for that token.

    We test this by adding a temporary route that echoes the user back.
    """
    from fastapi import Depends
    from app.dependencies.auth import get_current_user
    from app.models.user import User

    @app.get("/api/_test_me", tags=["test"])
    def _me(u: User = Depends(get_current_user)):
        return {"id": u.id, "email": u.email, "role": u.role}

    try:
        register(client)
        token = login(client, CITIZEN["email"], CITIZEN["password"]).json()["access_token"]
        r = client.get("/api/_test_me", headers=auth_header(token))
        assert r.status_code == 200
        assert r.json()["email"] == CITIZEN["email"]
    finally:
        # Clean up the temporary route
        app.routes[:] = [rt for rt in app.routes if getattr(rt, "path", "") != "/api/_test_me"]


# ── 7. Expired token ──────────────────────────────────────────────────────────

def test_expired_token_rejected(client):
    register(client)
    # Create a token that expired 1 second ago
    expired_token = create_access_token(subject="999", expires_delta=timedelta(seconds=-1))
    r = client.get(
        "/api/issues",
        headers=auth_header(expired_token),
    )
    # Issues endpoint is currently unprotected — we need a protected endpoint.
    # Use the dependency directly through the test helper route.
    from fastapi import Depends
    from app.dependencies.auth import get_current_user
    from app.models.user import User

    @app.get("/api/_test_expired", tags=["test"])
    def _expired(u: User = Depends(get_current_user)):
        return {}

    try:
        r = client.get("/api/_test_expired", headers=auth_header(expired_token))
        assert r.status_code == 401
        assert "expired" in r.json()["detail"].lower()
    finally:
        app.routes[:] = [rt for rt in app.routes if getattr(rt, "path", "") != "/api/_test_expired"]


# ── 8. Tampered / invalid token ───────────────────────────────────────────────

def test_invalid_token_rejected(client):
    from fastapi import Depends
    from app.dependencies.auth import get_current_user
    from app.models.user import User

    @app.get("/api/_test_invalid", tags=["test"])
    def _invalid(u: User = Depends(get_current_user)):
        return {}

    try:
        r = client.get("/api/_test_invalid", headers=auth_header("not.a.real.token"))
        assert r.status_code == 401
    finally:
        app.routes[:] = [rt for rt in app.routes if getattr(rt, "path", "") != "/api/_test_invalid"]


# ── 9 & 10. Role-based access control ────────────────────────────────────────

def _make_role_endpoint(required_roles):
    """Register a temporary protected endpoint for role tests."""
    from fastapi import Depends
    from app.dependencies.auth import require_role
    from app.models.user import User

    path = f"/api/_test_role_{'_'.join(sorted(required_roles))}"

    @app.get(path, tags=["test"])
    def _role_ep(u: User = Depends(require_role(*required_roles))):
        return {"role": u.role}

    return path


def test_require_role_allows_authorised_role(client):
    """An admin user (seeded directly) can reach an admin-only endpoint."""
    path = _make_role_endpoint({"admin"})
    try:
        seed_user("admin", **ADMIN)
        token = login(client, ADMIN["email"], ADMIN["password"]).json()["access_token"]
        r = client.get(path, headers=auth_header(token))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"
    finally:
        app.routes[:] = [rt for rt in app.routes if getattr(rt, "path", "") != path]


def test_require_role_blocks_unauthorised_role(client):
    """A citizen user cannot reach an officer/admin endpoint."""
    path = _make_role_endpoint({"officer", "admin"})
    try:
        register(client, CITIZEN)
        token = login(client, CITIZEN["email"], CITIZEN["password"]).json()["access_token"]
        r = client.get(path, headers=auth_header(token))
        assert r.status_code == 403
        assert "roles" in r.json()["detail"].lower()
    finally:
        app.routes[:] = [rt for rt in app.routes if getattr(rt, "path", "") != path]


def test_require_role_allows_one_of_multiple_roles(client):
    """An officer user (seeded directly) can reach an endpoint that accepts officer or admin."""
    path = _make_role_endpoint({"officer", "admin"})
    try:
        seed_user("officer", **OFFICER)
        token = login(client, OFFICER["email"], OFFICER["password"]).json()["access_token"]
        r = client.get(path, headers=auth_header(token))
        assert r.status_code == 200
        assert r.json()["role"] == "officer"
    finally:
        app.routes[:] = [rt for rt in app.routes if getattr(rt, "path", "") != path]


# ── Schema validation ─────────────────────────────────────────────────────────

def test_register_short_password_rejected(client):
    payload = {**CITIZEN, "password": "short"}
    r = register(client, payload)
    assert r.status_code == 422


def test_register_role_field_ignored(client):
    """
    The role field is not part of UserRegister.  Any value sent by the
    client is silently ignored and the account is always created as citizen.
    (Previously this returned 422 for unknown roles; now the field is not
    accepted at all so Pydantic drops it and the request succeeds as citizen.)
    """
    payload = {**CITIZEN, "role": "superuser"}
    r = register(client, payload)
    assert r.status_code == 201
    assert r.json()["role"] == "citizen"


def test_register_invalid_email_rejected(client):
    payload = {**CITIZEN, "email": "not-an-email"}
    r = register(client, payload)
    assert r.status_code == 422


# ── Privilege escalation regression tests ─────────────────────────────────────

def test_cannot_self_register_as_admin(client):
    """Attempting to register with role=admin must produce a citizen account."""
    payload = {**CITIZEN, "role": "admin"}
    r = register(client, payload)
    assert r.status_code == 201
    assert r.json()["role"] == "citizen", (
        "SECURITY: public registration must never create admin accounts"
    )


def test_cannot_self_register_as_officer(client):
    """Attempting to register with role=officer must produce a citizen account."""
    payload = {**CITIZEN, "role": "officer"}
    r = register(client, payload)
    assert r.status_code == 201
    assert r.json()["role"] == "citizen", (
        "SECURITY: public registration must never create officer accounts"
    )


def test_cannot_self_register_as_worker(client):
    """Attempting to register with role=worker must produce a citizen account."""
    payload = {**CITIZEN, "role": "worker"}
    r = register(client, payload)
    assert r.status_code == 201
    assert r.json()["role"] == "citizen", (
        "SECURITY: public registration must never create worker accounts"
    )
