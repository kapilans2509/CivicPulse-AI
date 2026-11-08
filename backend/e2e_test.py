"""
End-to-end smoke test -- run from backend/ directory against a live server.
Tests: health, auth, issue creation, agent pipeline, approval, stats.

Requires a running server: uvicorn app.main:app --host 127.0.0.1 --port 8000
"""
import sys
import uuid
import requests

BASE = "http://127.0.0.1:8000/api"
errors = []


def check(name, condition, detail=""):
    if condition:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}  {detail}")
        errors.append(name)


# ── 1. Health (public) ────────────────────────────────────────────────────────
print("\n[1] Health check")
r = requests.get(f"{BASE}/health")
check("status 200", r.status_code == 200, r.status_code)
check("status=ok", r.json().get("status") == "ok")

# ── 2. Register + login as officer ───────────────────────────────────────────
print("\n[2] Register and login")
test_email = f"e2e_officer_{uuid.uuid4().hex[:8]}@example.com"
test_password = "E2eTestPass1!"

r = requests.post(f"{BASE}/auth/register", json={
    "name": "E2E Test Officer",
    "email": test_email,
    "password": test_password,
})
check("register 201", r.status_code == 201, r.text[:200])
user_id = r.json().get("id")
check("user id present", user_id is not None)

# Promote to officer directly in the DB for e2e purposes
# (public registration always creates citizen; privileged roles need DB-level grant)
import sqlite3, os
db_path = os.path.join(os.path.dirname(__file__), "civicpulse.db")
try:
    conn = sqlite3.connect(db_path)
    conn.execute("UPDATE users SET role='officer' WHERE id=?", (user_id,))
    conn.commit()
    conn.close()
    print(f"  INFO  promoted user #{user_id} to officer for e2e test")
except Exception as e:
    print(f"  WARN  could not promote role: {e}")

r = requests.post(f"{BASE}/auth/token", data={
    "username": test_email,
    "password": test_password,
})
check("login 200", r.status_code == 200, r.text[:200])
token = r.json().get("access_token")
check("token present", bool(token))
headers = {"Authorization": f"Bearer {token}"}

# ── 3. Create issue (authenticated) ───────────────────────────────────────────
print("\n[3] Submit new issue")
r = requests.post(f"{BASE}/issues/", data={
    "title":       "Large pothole near Silk Board flyover",
    "description": (
        "Deep pothole approximately 50cm wide on main road under Silk Board flyover. "
        "Multiple vehicles have been damaged. Urgent road repair needed."
    ),
    "latitude":  "12.9176",
    "longitude": "77.6222",
    "address":   "Silk Board Junction, Bengaluru, Karnataka",
}, headers=headers)
check("status 201", r.status_code == 201, r.text[:200])
issue    = r.json()
issue_id = issue.get("id")
print(f"     id={issue_id}  category={issue.get('category')}  severity={issue.get('severity')}")
print(f"     status={issue.get('status')}  department={issue.get('department')}")

check("id present",          issue_id is not None)
check("category assigned",   issue.get("category") not in (None, ""))
check("severity assigned",   issue.get("severity") not in (None, ""))
check("status progressed",   issue.get("status") not in ("pending", None))
check("department assigned", issue.get("department") not in (None, ""))
check("reporter_id set",     issue.get("reporter_id") == user_id)

# ── 4. Unauthenticated submission rejected ────────────────────────────────────
print("\n[4] Unauthenticated submission rejected")
r = requests.post(f"{BASE}/issues/", data={
    "title": "Unauth test pothole issue",
    "description": "This should be rejected by the auth middleware immediately",
    "latitude": "12.9176",
    "longitude": "77.6222",
})
check("401 for no token", r.status_code == 401, r.status_code)

# ── 5. Agent pipeline ─────────────────────────────────────────────────────────
print("\n[5] Agent pipeline summary")
r = requests.get(f"{BASE}/agents/pipeline/{issue_id}", headers=headers)
check("status 200", r.status_code == 200, r.text[:200])
pipe = r.json()
print(f"     total_steps={pipe.get('total_steps')}  success={pipe.get('success_count')}  errors={pipe.get('error_count')}")
check("has steps",   len(pipe.get("steps", [])) >= 4)
check("zero errors", pipe.get("error_count", 1) == 0)
for step in pipe.get("steps", []):
    ms     = step.get("duration_ms", "?")
    sts    = step.get("status", "?")
    reason = step.get("reason", "")[:80]
    print(f"     {step['agent_name']:25s} [{sts:7s}] {ms}ms")
    if reason:
        safe_reason = reason.encode("ascii", "replace").decode("ascii")
        print(f"       -> {safe_reason}")

# ── 6. GET issue by id ────────────────────────────────────────────────────────
print("\n[6] GET issue by id")
r = requests.get(f"{BASE}/issues/{issue_id}", headers=headers)
check("status 200",      r.status_code == 200)
fetched = r.json()
check("id matches",      fetched.get("id") == issue_id)
check("department set",  fetched.get("department") not in (None, ""))

# ── 7. Approval ───────────────────────────────────────────────────────────────
print("\n[7] Approval record")
r = requests.get(f"{BASE}/approvals/{issue_id}", headers=headers)
if r.status_code == 200:
    ap = r.json()
    print(f"     decision={ap.get('decision')}  requested_by={ap.get('requested_by')}")
    check("approval decision field present", "decision" in ap)
elif r.status_code == 404:
    print("     (no approval required -- direct dispatch; expected for low/medium severity)")
    check("direct dispatch", issue.get("status") == "in_progress")
else:
    check("approval endpoint", False, f"unexpected {r.status_code}")

# ── 8. List issues ────────────────────────────────────────────────────────────
print("\n[8] List issues with filters")
r = requests.get(f"{BASE}/issues", params={"category": issue.get("category")}, headers=headers)
check("status 200",       r.status_code == 200)
items = r.json()
check("result is list",   isinstance(items, list))
check("issue in results", any(i.get("id") == issue_id for i in items))

# ── 9. Dashboard stats ────────────────────────────────────────────────────────
print("\n[9] Dashboard stats")
r = requests.get(f"{BASE}/stats/dashboard", headers=headers)
check("status 200", r.status_code == 200, r.text[:200])
stats = r.json()
print(f"     total={stats.get('total')}  pending={stats.get('pending')}  in_progress={stats.get('in_progress')}")
check("total >= 1",        stats.get("total", 0) >= 1)
check("by_category list",  isinstance(stats.get("by_category"), list))
check("by_status list",    isinstance(stats.get("by_status"), list))

# ── 10. Stats requires auth ───────────────────────────────────────────────────
print("\n[10] Stats endpoint rejects unauthenticated request")
r = requests.get(f"{BASE}/stats/dashboard")
check("401 without token", r.status_code == 401, r.status_code)

# ── Result ────────────────────────────────────────────────────────────────────
print()
if errors:
    print(f"FAILED -- {len(errors)} check(s): {', '.join(errors)}")
    sys.exit(1)
else:
    print("ALL CHECKS PASSED")
