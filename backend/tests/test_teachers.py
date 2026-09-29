from conftest import PNG, TEACHER, english


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
    olena = api.teacher(admin)  # $22, online + Lisbon, B1, job interviews, evenings, trial
    mark = api.teacher(
        admin, name="Mark Stone", price=40, format="online", free_trial=False, trial_minutes=None,
        offers=english(topics=["grammar"], goal=["exam"], exams=["ielts"]), experience_years=2,
    )  # fmt: skip
    python = {"level": ["beginner"], "age": ["adults"], "goal": ["switch"], "topics": ["basics"]}
    api.teacher(admin, name="Priya Nair", offers=[{"subject": "Python", "attrs": python}])
    api.teacher(name="Not Published")

    r = client.get("/api/teachers/search", params={"subject": "english"}).json()
    assert r["total"] == 2 and r["relax"] == []
    assert {t["display_name"] for t in r["items"]} == {"Olena Kovalenko", "Mark Stone"}
    assert client.get("/api/teachers/search", params={"subject": "англійська"}).json()["total"] == 2  # aliases

    params = {"subject": "English", "attr": ["topics:speaking", "topics:language_for_your_job", "goal:interviews"], "times": ["evening"]}
    r = client.get("/api/teachers/search", params=params).json()
    assert [t["id"] for t in r["items"]] == [olena["teacher_id"], mark["teacher_id"]]  # best match first
    assert r["items"][0]["match"] == 100 and r["items"][1]["match"] < 100
    assert r["items"][0]["topics"] == ["Speaking", "Language for your job"]  # tags as labels

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


def test_subject_fields_pair_teacher_and_learner(client, api):
    admin = api.admin()
    c1 = api.teacher(admin, name="C1 Teacher", offers=english(own_level="C1", level=["B1", "B2", "C1"], teaching_cert=["celta"]))
    native = api.teacher(
        admin, name="Native Teacher",
        offers=english(own_level="native", level=["A1", "A2"], age=["kids"], goal=["nmt"], nmt_best="200", nmt_start=["strong"]),
    )  # fmt: skip
    c1, native = c1["teacher_id"], native["teacher_id"]

    def found(*attr, **params):
        r = client.get("/api/teachers/search", params={"subject": "English", "attr": list(attr), **params}).json()
        return sorted(t["id"] for t in r["items"])

    assert found() == sorted([c1, native])
    assert found("level:B2") == [c1]  # "in": the learner's level is among the teacher's levels
    assert found("own_level:C1") == sorted([c1, native])  # "min": the teacher's own level is at least C1
    assert found("own_level:native") == [native]
    assert found("teaching_cert:1") == [c1]  # "has": only teachers with a teaching qualification
    assert found("goal:nmt", "nmt_best:200") == [native]  # NMT is a goal with its own fields
    assert found("nmt_best:200") == sorted([c1, native])  # NMT fields count only with the NMT goal
    assert found(for_whom="myself") == [c1]  # "Myself" is an adult; the native teacher teaches kids
    assert found("age:kids") == [native]
    assert found("level:Z9", "unknown:1") == sorted([c1, native])  # unknown answers are ignored

    r = client.get("/api/teachers/search", params={"subject": "English", "attr": ["goal:nmt", "nmt_best:200", "level:B2"]}).json()
    assert r["total"] == 0
    assert sorted(x["filter"] for x in r["relax"]) == ["attr:level", "attr:nmt_best"]

    public = client.get(f"/api/teachers/{native}").json()
    facts = {f["label"]: f["value"] for f in public["offers_view"][0]["facts"]}
    assert facts["English level"] == "Native speaker" and facts["Best NMT score of students"] == "200"

    # The teacher can't teach above their own level, and subjects come from the catalog.
    h = api.signup("New Teacher")["headers"]
    r = client.put("/api/teacher/profile", headers=h, json={"offers": english(own_level="B2", level=["C1"], topics=["nope"])})
    assert r.status_code == 200
    assert "topics" not in r.json()["offers"][0]["attrs"]  # unknown values are dropped
    assert "English: Student levels (not above your own level)" in r.json()["missing"]
    assert "English: Topics" in r.json()["missing"]
    r = client.put("/api/teacher/profile", headers=h, json={"offers": [{"subject": "Maths", "attrs": {}}, {"subject": "math"}]})
    assert r.json()["subjects"] == ["Math"]
    assert client.put("/api/teacher/profile", headers=h, json={"offers": [{"subject": "Klingon"}]}).status_code == 422


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
    # Searches saved before fields per subject still work.
    old = client.post("/api/alerts", headers=learner["headers"], json={"subject": "English", "level": "B1", "goal": "Travel"})
    assert old.json()["filters"]["attr"] == ["level:B1", "goal:travel"]
    client.delete(f"/api/alerts/{old.json()['id']}", headers=learner["headers"])
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


def test_submit_checks_required_fields_and_formats(client, api):
    user = api.signup("Format Teacher")
    h = user["headers"]
    client.post("/api/auth/me/photo", headers=h, files={"file": ("me.png", PNG, "image/png")})
    bad = {
        **TEACHER, "contact_method": "email", "contact_value": "not-an-email", "video_url": "https://example.com/video",
        "links": ["not a link"], "offers": english(own_level=None),
    }  # fmt: skip
    r = client.put("/api/teacher/profile", headers=h, json=bad)
    assert r.status_code == 200  # drafts are saved as they are
    missing = r.json()["missing"]
    assert "contact_value (use an email like name@example.com)" in missing
    assert "video_url (use a YouTube or Vimeo link)" in missing
    assert "links (use addresses like linkedin.com/in/name)" in missing
    assert "English: Your English level" in missing
    r = client.post("/api/teacher/profile/submit", headers=h)
    assert r.status_code == 422 and "contact_value (use an email like name@example.com)" in r.json()["detail"]["missing"]

    fixed = {**bad, "contact_value": "olena@example.com", "video_url": "https://youtu.be/abc123", "links": ["linkedin.com/in/olena"],
             "offers": english()}  # fmt: skip
    assert client.put("/api/teacher/profile", headers=h, json=fixed).json()["missing"] == []
    assert client.post("/api/teacher/profile/submit", headers=h).json()["status"] == "pending"
