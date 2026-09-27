from conftest import PNG, TEACHER


def test_profile_moderation_flow(client, api, outbox):
    admin = api.admin()
    user = api.signup("Olena Kovalenko")
    h = user["headers"]

    assert client.get("/api/teacher/profile", headers=h).status_code == 404
    r = client.put("/api/teacher/profile", headers=h, json={"headline": "English for work"})
    assert r.status_code == 200
    draft = r.json()
    assert draft["status"] == "draft" and draft["display_name"] == "Olena Kovalenko"
    assert "photo" in draft["missing"] and "subjects" in draft["missing"]

    r = client.post("/api/teacher/profile/submit", headers=h)
    assert r.status_code == 422 and "subjects" in r.json()["detail"]["missing"]

    client.post("/api/auth/me/photo", headers=h, files={"file": ("me.png", PNG, "image/png")})
    r = client.put("/api/teacher/profile", headers=h, json=TEACHER)
    assert r.json()["missing"] == []
    r = client.post("/api/teacher/profile/submit", headers=h)
    assert r.json()["status"] == "pending"
    teacher_id = r.json()["id"]
    assert client.get("/api/auth/me", headers=h).json()["teacher_status"] == "pending"

    # Not visible before moderation, except to the owner.
    assert client.get(f"/api/teachers/{teacher_id}").status_code == 404
    assert client.get(f"/api/teachers/{teacher_id}", headers=h).status_code == 200
    assert client.get("/api/teachers/search?subject=English").json()["total"] == 0

    # Moderators only.
    assert client.get("/api/admin/teachers", headers=h).status_code == 403
    queue = client.get("/api/admin/teachers", headers=admin["headers"]).json()
    assert [p["id"] for p in queue] == [teacher_id]

    r = client.post(f"/api/admin/teachers/{teacher_id}/reject", headers=admin["headers"], json={"note": "Add a clearer photo"})
    assert r.json()["status"] == "rejected"
    assert outbox[-1][0] == user["email"] and "Add a clearer photo" in outbox[-1][2]
    assert client.get("/api/teacher/profile", headers=h).json()["review_note"] == "Add a clearer photo"

    client.post("/api/teacher/profile/submit", headers=h)
    r = client.post(f"/api/admin/teachers/{teacher_id}/approve", headers=admin["headers"], json={"verified": True})
    assert r.json()["status"] == "approved" and r.json()["is_verified"] is True
    assert "published" in outbox[-1][1]

    public = client.get(f"/api/teachers/{teacher_id}").json()
    assert public["display_name"] == "Olena Kovalenko" and public["price"] == 22.0
    assert "contact_value" not in public  # the contact opens only after a request is accepted

    # The "Accepting new students" switch doesn't need moderation; content changes do.
    r = client.put("/api/teacher/profile", headers=h, json={"accepting_students": False})
    assert r.json()["status"] == "approved"
    assert client.get("/api/teachers/search?subject=English").json()["total"] == 0
    client.put("/api/teacher/profile", headers=h, json={"accepting_students": True})
    r = client.put("/api/teacher/profile", headers=h, json={"price": 25})
    assert r.json()["status"] == "pending"


def test_certificates(client, api):
    admin = api.admin()
    teacher = api.teacher()
    h = teacher["headers"]
    r = client.post(
        "/api/teacher/certificates", headers=h, data={"title": "CELTA"}, files={"file": ("c.pdf", b"%PDF-1.4 test", "application/pdf")}
    )
    assert r.status_code == 201
    cert = r.json()
    assert cert["title"] == "CELTA"
    assert client.get(cert["file_url"], headers=h).content == b"%PDF-1.4 test"
    assert client.get(cert["file_url"], headers=admin["headers"]).status_code == 200
    stranger = api.signup("Stranger")
    assert client.get(cert["file_url"], headers=stranger["headers"]).status_code == 404
    public = client.get(f"/api/teachers/{teacher['teacher_id']}", headers=h).json()
    assert public["certificates"][0]["title"] == "CELTA" and public["certificates"][0]["file_url"] is None
    assert client.delete(f"/api/teacher/certificates/{cert['id']}", headers=h).status_code == 204


def test_search_filters_match_and_sort(client, api):
    admin = api.admin()
    olena = api.teacher(admin)  # $22, online + Lisbon, B1, Job interviews, evenings, trial
    mark = api.teacher(
        admin, name="Mark Stone", price=40, format="online", free_trial=False, trial_minutes=None,
        topics=["Grammar", "Exams"], goals=["Exam preparation"], experience_years=2,
    )  # fmt: skip
    api.teacher(admin, name="Priya Nair", subjects=["Python"], topics=["Data analysis"])
    api.teacher(name="Not Published")

    r = client.get("/api/teachers/search", params={"subject": "english"}).json()
    assert r["total"] == 2 and r["relax"] == []
    assert {t["display_name"] for t in r["items"]} == {"Olena Kovalenko", "Mark Stone"}

    params = {"subject": "English", "topics": ["Speaking", "Job interviews"], "goal": "Job interviews", "times": ["evening"]}
    r = client.get("/api/teachers/search", params=params).json()
    assert [t["id"] for t in r["items"]] == [olena["teacher_id"], mark["teacher_id"]]  # best match first
    assert r["items"][0]["match"] == 100 and r["items"][1]["match"] < 100

    r = client.get("/api/teachers/search", params={"subject": "English", "sort": "price_desc"}).json()
    assert r["items"][0]["id"] == mark["teacher_id"]

    r = client.get("/api/teachers/search", params={"subject": "English", "price_max": 30}).json()
    assert [t["id"] for t in r["items"]] == [olena["teacher_id"]]
    # 1000 UAH is about 24 USD: only Olena ($22) fits.
    assert client.get("/api/teachers/search", params={"subject": "English", "price_max": 1000, "currency": "UAH"}).json()["total"] == 1

    r = client.get("/api/teachers/search", params={"subject": "English", "format": "offline", "city": "Lisbon"}).json()
    assert [t["id"] for t in r["items"]] == [olena["teacher_id"]]
    r = client.get("/api/teachers/search", params={"subject": "English", "free_trial": True, "min_experience": 5}).json()
    assert r["total"] == 1


def test_empty_search_relax_and_notify(client, api, outbox):
    admin = api.admin()
    api.teacher(admin)  # online + Lisbon, $22, not verified
    params = {"subject": "English", "format": "offline", "city": "Kyiv", "verified": True}
    r = client.get("/api/teachers/search", params=params).json()
    assert r["total"] == 0
    assert sorted(x["filter"] for x in r["relax"]) == []  # two filters fail, removing one isn't enough

    r = client.get("/api/teachers/search", params={"subject": "English", "format": "offline", "city": "Kyiv"}).json()
    assert r["total"] == 0 and r["relax"] == [{"filter": "format", "count": 1}]

    learner = api.signup("Anna Petrenko")
    assert client.post("/api/alerts", json={"subject": "English", "city": "Kyiv"}).status_code == 401
    r = client.post("/api/alerts", headers=learner["headers"], json={"subject": "English", "format": "offline", "city": "Kyiv"})
    assert r.status_code == 201
    alert_id = r.json()["id"]

    api.teacher(admin, name="Kyiv Teacher", city="Kyiv", country="Ukraine")
    mails = [m for m in outbox if m[0] == learner["email"]]
    assert len(mails) == 1 and "Kyiv Teacher" in mails[0][2]
    alerts = client.get("/api/alerts", headers=learner["headers"]).json()
    assert alerts[0]["is_active"] is False
    assert client.delete(f"/api/alerts/{alert_id}", headers=learner["headers"]).status_code == 204


def test_blocked_teacher_hidden(client, api):
    admin = api.admin()
    teacher = api.teacher(admin)
    assert client.get("/api/teachers/search?subject=English").json()["total"] == 1
    client.post(f"/api/admin/users/{teacher['id']}/block", headers=admin["headers"])
    assert client.get("/api/teachers/search?subject=English").json()["total"] == 0
    assert client.get(f"/api/teachers/{teacher['teacher_id']}").status_code == 404
