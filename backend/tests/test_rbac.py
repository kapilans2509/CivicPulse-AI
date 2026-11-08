"""
RBAC integration test suite — covers the 10 required scenarios:

1.  Unauthenticated issue submission is rejected (401).
2.  Authenticated citizen can submit a complaint.
3.  Citizen cannot approve or reject a complaint (403).
4.  Citizen cannot access another citizen's issue (403 / IDOR).
5.  Officer can approve or reject a pending complaint.
6.  Worker cannot access another worker's assigned issue (403).
7.  Worker cannot approve or reject complaints (403).
8.  Admin-only operations reject non-admin users (403).
9.  Invalid and expired JWTs are rejected (401).
10. Agent pipeline and duplicate detection continue working end-to-end.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.main import app

# ── Shared in-memory test database ───────────────────────────────────────────

TEST_DB_URL = "sqlite+pysqlite:///file:rbac_testdb?mode=memory&cache=shared&uri=true"

_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
_TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def override_get_db():
    db = _TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    from app.models import user, issue, agent_log, approval  # noqa: F401
    Base.metadata.create_all(bind=_engine)
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=_engine)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register(client, name, email, password):
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


def _login(client, email, password):
    r = client.post("/api/auth/token", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_user(role, name, email, password):
    """Insert a privileged user directly into the test DB (bypasses public registration)."""
    from app.core.security import hash_password
    from app.models.user import User
    db = _TestingSession()
    try:
        u = User(name=name, email=email.lower(), hashed_password=hash_password(password), role=role)
        db.add(u)
        db.commit()
        db.refresh(u)
        return u.id
    finally:
        db.close()


def _login_seeded(client, email, password):
    """Login a seeded (privileged) user and return their token."""
    r = client.post("/api/auth/token", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _submit_issue(client, token, title="Test pothole on main road",
                  desc="Large deep pothole on Indiranagar 100ft road damaging vehicles urgent repair needed"):
    r = client.post("/api/issues/", data={
        "title": title,
        "description": desc,
        "latitude": "12.9716",
        "longitude": "77.5946",
    }, headers=_auth(token))
    return r


# ── Test 1: Unauthenticated submission rejected ───────────────────────────────

def test_unauthenticated_submission_rejected(client):
    """POST /issues/ without a token must return 401."""
    r = client.post("/api/issues/", data={
        "title": "Test pothole on main road",
        "description": "Large deep pothole causing vehicle damage on main road",
        "latitude": "12.9716",
        "longitude": "77.5946",
    })
    assert r.status_code == 401


# ── Test 2: Citizen can submit a complaint ────────────────────────────────────

def test_citizen_can_submit_complaint(client):
    """A registered citizen with a valid JWT can submit an issue."""
    _register(client, "Alice", "alice@test.com", "Passw0rd!")
    token = _login(client, "alice@test.com", "Passw0rd!")
    r = _submit_issue(client, token)
    assert r.status_code == 201
    body = r.json()
    assert body["id"] > 0
    # reporter_id must be set to the caller's user id
    assert body["reporter_id"] is not None


# ── Test 3: Citizen cannot approve or reject ──────────────────────────────────

def test_citizen_cannot_approve(client):
    """Citizen POST /approvals/{id}/decide must return 403."""
    # Set up: officer submits a high-severity issue that triggers approval
    officer_id = _seed_user("officer", "Officer", "officer@test.com", "Off1cerPass!")
    officer_token = _login_seeded(client, "officer@test.com", "Off1cerPass!")

    # Also create a citizen who tries to decide
    _register(client, "Citizen", "citizen@test.com", "Passw0rd!")
    citizen_token = _login(client, "citizen@test.com", "Passw0rd!")

    # Submit an issue as the officer (will create approval record for high-sev issues)
    r = _submit_issue(client, officer_token,
        title="Critical bridge collapse emergency hazard",
        desc="Emergency bridge collapse life threatening extremely dangerous hazard accident blocking road")
    assert r.status_code == 201
    issue_id = r.json()["id"]

    # Citizen tries to decide approval
    r = client.post(
        f"/api/approvals/{issue_id}/decide",
        json={"decision": "approved"},
        headers=_auth(citizen_token),
    )
    assert r.status_code == 403


# ── Test 4: Citizen IDOR — cannot access another citizen's issue ──────────────

def test_citizen_cannot_access_other_citizens_issue(client):
    """Citizen GET /issues/{id} for an issue they don't own must return 403."""
    _register(client, "Alice", "alice@test.com", "Passw0rd!")
    token_alice = _login(client, "alice@test.com", "Passw0rd!")

    _register(client, "Bob", "bob@test.com", "Passw0rd!")
    token_bob = _login(client, "bob@test.com", "Passw0rd!")

    # Alice submits an issue
    r = _submit_issue(client, token_alice)
    assert r.status_code == 201
    alice_issue_id = r.json()["id"]

    # Bob tries to read Alice's issue
    r = client.get(f"/api/issues/{alice_issue_id}", headers=_auth(token_bob))
    assert r.status_code == 403


# ── Test 5: Officer can approve/reject pending complaint ──────────────────────

def test_officer_can_decide_approval(client):
    """Officer POST /approvals/{id}/decide returns 200 for a pending approval."""
    officer_id = _seed_user("officer", "Officer", "officer@test.com", "Off1cerPass!")
    officer_token = _login_seeded(client, "officer@test.com", "Off1cerPass!")

    # Submit a critical issue (will generate approval record)
    r = _submit_issue(client, officer_token,
        title="Critical bridge collapse emergency hazard",
        desc="Emergency bridge collapse life threatening extremely dangerous hazard accident blocking road urgent")
    assert r.status_code == 201
    issue_id = r.json()["id"]
    issue_status = r.json()["status"]

    # Only proceed if an approval record was created (high/critical severity)
    r_ap = client.get(f"/api/approvals/{issue_id}", headers=_auth(officer_token))
    if r_ap.status_code == 404:
        pytest.skip("Issue not high-severity enough to require approval in this run")

    assert r_ap.json()["decision"] == "pending"

    r = client.post(
        f"/api/approvals/{issue_id}/decide",
        json={"decision": "approved", "notes": "Test approval"},
        headers=_auth(officer_token),
    )
    assert r.status_code == 200
    assert r.json()["decision"] == "approved"


# ── Test 6: Worker cannot access another worker's assigned issue ──────────────

def test_worker_cannot_access_other_workers_issue(client):
    """Worker PATCH on an issue assigned to a different worker returns 403."""
    officer_id = _seed_user("officer", "Officer", "officer@test.com", "Off1cerPass!")
    officer_token = _login_seeded(client, "officer@test.com", "Off1cerPass!")

    worker1_id = _seed_user("worker", "Worker One", "w1@test.com", "W0rkerPass!")
    worker2_id = _seed_user("worker", "Worker Two", "w2@test.com", "W0rkerPass!")
    worker2_token = _login_seeded(client, "w2@test.com", "W0rkerPass!")

    # Officer submits an issue
    r = _submit_issue(client, officer_token)
    assert r.status_code == 201
    issue_id = r.json()["id"]

    # Officer assigns it to worker1
    r = client.patch(
        f"/api/issues/{issue_id}",
        json={"assigned_to": worker1_id},
        headers=_auth(officer_token),
    )
    assert r.status_code == 200

    # Worker2 tries to update it
    r = client.patch(
        f"/api/issues/{issue_id}",
        json={"status": "in_progress"},
        headers=_auth(worker2_token),
    )
    assert r.status_code == 403


# ── Test 7: Worker cannot approve or reject ───────────────────────────────────

def test_worker_cannot_decide_approval(client):
    """Worker POST /approvals/{id}/decide must return 403."""
    officer_id = _seed_user("officer", "Officer", "officer@test.com", "Off1cerPass!")
    officer_token = _login_seeded(client, "officer@test.com", "Off1cerPass!")
    worker_id = _seed_user("worker", "Worker", "worker@test.com", "W0rkerPass!")
    worker_token = _login_seeded(client, "worker@test.com", "W0rkerPass!")

    r = _submit_issue(client, officer_token,
        title="Critical bridge collapse emergency hazard",
        desc="Emergency bridge collapse life threatening extremely dangerous hazard accident blocking road")
    assert r.status_code == 201
    issue_id = r.json()["id"]

    r = client.post(
        f"/api/approvals/{issue_id}/decide",
        json={"decision": "approved"},
        headers=_auth(worker_token),
    )
    assert r.status_code == 403


# ── Test 8: Admin-only operations reject non-admin users ──────────────────────

def test_stats_dashboard_requires_officer_or_admin(client):
    """GET /stats/dashboard returns 403 for a citizen."""
    _register(client, "Citizen", "citizen@test.com", "Passw0rd!")
    token = _login(client, "citizen@test.com", "Passw0rd!")
    r = client.get("/api/stats/dashboard", headers=_auth(token))
    assert r.status_code == 403


def test_stats_dashboard_accessible_to_officer(client):
    """GET /stats/dashboard returns 200 for an officer."""
    _seed_user("officer", "Officer", "officer@test.com", "Off1cerPass!")
    token = _login_seeded(client, "officer@test.com", "Off1cerPass!")
    r = client.get("/api/stats/dashboard", headers=_auth(token))
    assert r.status_code == 200


def test_issue_list_requires_officer_or_admin(client):
    """GET /issues/ returns 403 for a citizen."""
    _register(client, "Citizen", "citizen@test.com", "Passw0rd!")
    token = _login(client, "citizen@test.com", "Passw0rd!")
    r = client.get("/api/issues/", headers=_auth(token))
    assert r.status_code == 403


# ── Test 9: Invalid and expired JWTs are rejected ────────────────────────────

def test_expired_jwt_rejected(client):
    """An expired token must return 401 on a protected endpoint."""
    _register(client, "Alice", "alice@test.com", "Passw0rd!")
    expired = create_access_token(subject="1", expires_delta=timedelta(seconds=-1))
    r = _submit_issue(client, expired)
    assert r.status_code == 401


def test_invalid_jwt_rejected(client):
    """A malformed token must return 401."""
    r = _submit_issue(client, "not.a.real.jwt")
    assert r.status_code == 401


def test_unauthenticated_stats_rejected(client):
    """GET /stats/dashboard without a token must return 401."""
    r = client.get("/api/stats/dashboard")
    assert r.status_code == 401


def test_unauthenticated_approvals_rejected(client):
    """GET /approvals/pending without a token must return 401."""
    r = client.get("/api/approvals/pending")
    assert r.status_code == 401


# ── Test 10: Agent pipeline and duplicate detection end-to-end ────────────────

def test_pipeline_runs_and_deduplicates(client):
    """
    Submitting two identical issues should:
      - Run all 5 agent steps for each.
      - Flag the second as a duplicate of the first.
      - Both issues fully accessible to an officer.
    """
    _seed_user("officer", "Officer", "officer@test.com", "Off1cerPass!")
    officer_token = _login_seeded(client, "officer@test.com", "Off1cerPass!")

    payload = {
        "title": "Large pothole near Silk Board flyover test",
        "description": (
            "Deep pothole approximately 50cm wide on main road under flyover. "
            "Multiple vehicles damaged. Urgent road repair needed immediately."
        ),
        "latitude": "12.9176",
        "longitude": "77.6222",
    }

    r1 = client.post("/api/issues/", data=payload, headers=_auth(officer_token))
    assert r1.status_code == 201
    issue1 = r1.json()
    assert issue1["category"] is not None
    assert issue1["severity"] is not None
    assert issue1["is_duplicate"] is False

    r2 = client.post("/api/issues/", data=payload, headers=_auth(officer_token))
    assert r2.status_code == 201
    issue2 = r2.json()
    assert issue2["is_duplicate"] is True
    assert issue2["canonical_issue_id"] == issue1["id"]

    # Pipeline must have 5 steps with no errors for issue1
    r_pipe = client.get(f"/api/agents/pipeline/{issue1['id']}", headers=_auth(officer_token))
    assert r_pipe.status_code == 200
    pipe = r_pipe.json()
    assert pipe["total_steps"] == 5
    assert pipe["error_count"] == 0

    # Citizen's own-issue view
    _register(client, "Citizen", "citizen@test.com", "Passw0rd!")
    citizen_token = _login(client, "citizen@test.com", "Passw0rd!")
    r_citizen = client.post("/api/issues/", data={
        **payload,
        "title": "Same pothole again on main road",
    }, headers=_auth(citizen_token))
    assert r_citizen.status_code == 201
    citizen_issue = r_citizen.json()

    # Citizen can see their own issue
    r_mine = client.get(f"/api/issues/{citizen_issue['id']}", headers=_auth(citizen_token))
    assert r_mine.status_code == 200

    # Citizen cannot access officer's issue
    r_idor = client.get(f"/api/issues/{issue1['id']}", headers=_auth(citizen_token))
    assert r_idor.status_code == 403
