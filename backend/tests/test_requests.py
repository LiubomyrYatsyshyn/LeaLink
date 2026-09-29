from datetime import timedelta

from sqlmodel import Session

from app import housekeeping
from app.db import engine
from app.models import LessonRequest, utcnow


def _move_deadline(request_id: int, hours_from_now: float) -> None:
    with Session(engine) as session:
        request = session.get(LessonRequest, request_id)
        request.expires_at = utcnow() + timedelta(hours=hours_from_now)
        session.commit()


def test_request_accept_chat_and_reviews(client, api, outbox):
    admin = api.admin()
    teacher = api.teacher(admin)
    learner = api.signup("Anna Petrenko")
    th, lh = teacher["headers"], learner["headers"]

    r = api.send_request(learner, teacher)
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["status"] == "pending" and req["my_role"] == "learner" and req["hours_left"] == 72
    assert req["teacher_contact"] is None
    assert outbox[-1][0] == teacher["email"] and "Anna Petrenko" in outbox[-1][1]
    # The learner's answers: stored as keys, shown as text.
    assert req["attrs"] == {"level": "B1", "age": "adults", "goal": "interviews", "topics": ["speaking"]}
    assert (req["level"], req["goal"], req["topics"]) == ("Intermediate (B1)", "Job interviews", ["Speaking"])
    assert {"label": "Level", "value": "Intermediate (B1)"} in req["details"]

    # Teacher home: incoming request with the learner's details.
    incoming = client.get("/api/requests/incoming", headers=th).json()
    assert [x["id"] for x in incoming] == [req["id"]] and incoming[0]["my_role"] == "teacher"

    # No chat before the teacher accepts.
    assert client.get(f"/api/chats/{req['id']}", headers=lh).status_code == 403
    assert client.post(f"/api/requests/{req['id']}/accept", headers=lh).status_code == 403

    r = client.post(f"/api/requests/{req['id']}/accept", headers=th)
    assert r.json()["status"] == "accepted"
    assert outbox[-1][0] == learner["email"] and "accepted" in outbox[-1][1]
    mine = client.get("/api/requests/sent", headers=lh).json()
    assert mine["active"] == 0 and mine["limit"] == 5
    assert mine["items"][0]["teacher_contact"] == {"method": "telegram", "value": "@olena_english"}
    assert [s["id"] for s in client.get("/api/requests/students", headers=th).json()] == [req["id"]]

    # Chat
    r = client.post(f"/api/chats/{req['id']}/messages", headers=th, json={"text": "Hi Anna! Tuesday 19:00?"})
    assert r.status_code == 201 and r.json()["mine"] is True
    first_id = r.json()["id"]
    assert outbox[-1][0] == learner["email"]
    client.post(f"/api/chats/{req['id']}/messages", headers=th, json={"text": "Or Thursday."})
    assert sum(1 for m in outbox if m[0] == learner["email"] and "message" in m[1]) == 1  # one email per unread batch

    chats = client.get("/api/chats?as=learner", headers=lh).json()
    assert chats[0]["unread"] == 2 and chats[0]["other"]["name"] == "Olena Kovalenko"
    assert client.get("/api/chats?as=teacher", headers=lh).json() == []
    chat = client.get(f"/api/chats/{req['id']}", headers=lh).json()
    assert [m["text"] for m in chat["messages"]] == ["Hi Anna! Tuesday 19:00?", "Or Thursday."]
    assert chat["messages"][0]["mine"] is False
    assert client.get("/api/chats?as=learner", headers=lh).json()[0]["unread"] == 0
    newer = client.get(f"/api/chats/{req['id']}?after_id={first_id}", headers=lh).json()["messages"]
    assert [m["text"] for m in newer] == ["Or Thursday."]
    stranger = api.signup("Stranger")
    assert client.get(f"/api/chats/{req['id']}", headers=stranger["headers"]).status_code == 404

    # Reviews open only after both confirm that lessons started.
    review = {"rating": 5, "text": "Olena explains everything clearly and patiently."}
    assert client.post(f"/api/requests/{req['id']}/review", headers=lh, json=review).status_code == 409
    r = client.post(f"/api/requests/{req['id']}/started", headers=lh)
    assert r.json()["learner_started"] is True and r.json()["lessons_started"] is False
    assert outbox[-1][0] == teacher["email"] and "lessons started" in outbox[-1][1]
    r = client.post(f"/api/requests/{req['id']}/started", headers=th)
    assert r.json()["lessons_started"] is True and r.json()["can_review"] is True

    r = client.post(f"/api/requests/{req['id']}/review", headers=lh, json=review)
    assert r.status_code == 201 and r.json()["author"]["name"] == "Anna Petrenko"
    assert client.post(f"/api/requests/{req['id']}/review", headers=lh, json=review).status_code == 409
    r = client.patch(f"/api/requests/{req['id']}/review", headers=lh, json={**review, "rating": 4})
    assert r.json()["rating"] == 4
    teacher_review = {"rating": 5, "text": "Anna is motivated and always prepared."}
    assert client.post(f"/api/requests/{req['id']}/review", headers=th, json=teacher_review).status_code == 201

    page = client.get(f"/api/teachers/{teacher['teacher_id']}").json()
    assert page["rating"] == 4.0 and page["reviews_count"] == 1  # the teacher's review of Anna doesn't count
    reviews = client.get(f"/api/teachers/{teacher['teacher_id']}/reviews").json()
    assert [x["rating"] for x in reviews] == [4]
    assert client.get("/api/teachers/search", params={"subject": "English", "min_rating": 4.5}).json()["total"] == 0
    assert client.get(f"/api/requests/{req['id']}", headers=th).json()["learner_rating"] == 5.0

    # The teacher ends the cooperation: the chat becomes read-only.
    assert client.post(f"/api/requests/{req['id']}/close", headers=th).json()["status"] == "closed"
    assert client.post(f"/api/chats/{req['id']}/messages", headers=lh, json={"text": "Bye"}).status_code == 409
    assert client.get(f"/api/chats/{req['id']}", headers=lh).status_code == 200


def test_decline_and_withdraw(client, api, outbox):
    admin = api.admin()
    t1 = api.teacher(admin, name="Teacher One")
    t2 = api.teacher(admin, name="Teacher Two")
    learner = api.signup()

    r1 = api.send_request(learner, t1).json()
    r = client.post(
        f"/api/requests/{r1['id']}/decline",
        headers=t1["headers"],
        json={"reason": "My schedule is full", "note": "Booked until December."},
    )
    assert r.json()["status"] == "declined" and r.json()["decline_reason"] == "My schedule is full"
    assert "Booked until December." in outbox[-1][2]
    bad = client.post(f"/api/requests/{r1['id']}/accept", headers=t1["headers"])
    assert bad.status_code == 409  # already declined

    r2 = api.send_request(learner, t2).json()
    assert client.post(f"/api/requests/{r2['id']}/withdraw", headers=t2["headers"]).status_code == 403
    assert client.post(f"/api/requests/{r2['id']}/withdraw", headers=learner["headers"]).json()["status"] == "withdrawn"
    assert client.post(f"/api/requests/{r2['id']}/accept", headers=t2["headers"]).status_code == 409
    # After decline/withdraw the learner may send a new request to the same teacher.
    assert api.send_request(learner, t2).status_code == 201


def test_request_rules(client, api):
    admin = api.admin()
    teachers = [api.teacher(admin, name=f"Teacher {i}") for i in range(6)]
    learner = api.signup()

    # Validation from the request form.
    assert api.send_request(learner, teachers[0], message="Too short").status_code == 422
    assert api.send_request(learner, teachers[0], for_whom="child").status_code == 422
    assert api.send_request(learner, teachers[0], preferred_times=["weekdays"]).status_code == 422
    assert api.send_request(learner, teachers[0], attrs={"level": "B1"}).status_code == 422  # a goal is required
    assert api.send_request(learner, teachers[0], subject="Python").status_code == 422  # not the teacher's subject
    child = api.send_request(learner, teachers[0], for_whom="child", child_age=14, parent_contact="+380501234567")
    assert child.status_code == 201
    assert client.get(f"/api/requests/{child.json()['id']}", headers=teachers[0]["headers"]).json()["parent_contact"] is None

    # No duplicates, no requests to yourself or to unpublished teachers.
    assert api.send_request(learner, teachers[0]).status_code == 409
    assert api.send_request(teachers[1], teachers[1]).status_code == 400
    draft = api.teacher(name="Draft Teacher")
    assert api.send_request(learner, draft).status_code == 404

    # Limit: 5 pending requests.
    for t in teachers[1:5]:
        assert api.send_request(learner, t).status_code == 201
    r = api.send_request(learner, teachers[5])
    assert r.status_code == 409 and "5 active requests" in r.json()["detail"]
    assert client.get("/api/requests/sent", headers=learner["headers"]).json()["active"] == 5

    # An expired request frees a slot.
    _move_deadline(child.json()["id"], -1)
    assert api.send_request(learner, teachers[5]).status_code == 201
    statuses = {x["id"]: x["status"] for x in client.get("/api/requests/sent", headers=learner["headers"]).json()["items"]}
    assert statuses[child.json()["id"]] == "expired"


def test_expiry_and_warning(client, api, outbox):
    admin = api.admin()
    teacher = api.teacher(admin)
    learner = api.signup()
    req = api.send_request(learner, teacher).json()

    _move_deadline(req["id"], 11)
    housekeeping.run_once()
    warnings = [m for m in outbox if m[0] == learner["email"] and "expires soon" in m[1]]
    assert len(warnings) == 1
    housekeeping.run_once()
    assert len([m for m in outbox if "expires soon" in m[1]]) == 1  # only once

    _move_deadline(req["id"], -0.1)
    r = client.post(f"/api/requests/{req['id']}/accept", headers=teacher["headers"])
    assert r.status_code == 409 and "expired" in r.json()["detail"]
    assert client.get("/api/requests/incoming", headers=teacher["headers"]).json() == []


def test_reports(client, api):
    admin = api.admin()
    teacher = api.teacher(admin)
    learner = api.signup()

    assert client.post("/api/reports", json={"teacher_id": teacher["teacher_id"], "reason": "Spam"}).status_code == 401
    r = client.post("/api/reports", headers=learner["headers"], json={"teacher_id": teacher["teacher_id"], "reason": "Fake profile"})
    assert r.status_code == 201
    again = client.post("/api/reports", headers=learner["headers"], json={"teacher_id": teacher["teacher_id"], "reason": "Spam"})
    assert again.status_code == 409
    bad = client.post("/api/reports", headers=learner["headers"], json={"reason": "Spam"})
    assert bad.status_code == 422

    req = api.send_request(learner, teacher).json()
    client.post(f"/api/requests/{req['id']}/accept", headers=teacher["headers"])
    r = client.post("/api/reports", headers=teacher["headers"], json={"request_id": req["id"], "reason": "Rude messages"})
    assert r.status_code == 201

    reports = client.get("/api/admin/reports", headers=admin["headers"]).json()
    assert {(x["reported"]["id"], x["reason"]) for x in reports} == {
        (teacher["id"], "Fake profile"),
        (learner["id"], "Rude messages"),
    }
    r = client.post(f"/api/admin/reports/{reports[0]['id']}/resolve", headers=admin["headers"], json={"note": "Checked"})
    assert r.json()["status"] == "resolved"
    assert len(client.get("/api/admin/reports", headers=admin["headers"]).json()) == 1


def test_request_answers_follow_the_subject(api):
    admin = api.admin()
    teacher = api.teacher(admin)
    learner = api.signup()
    # Requests from the old form (level, goal, topics) are converted; the age group comes from "For whom".
    r = api.send_request(learner, teacher, attrs={}, level="B2", goal="Travel", topics=["Speaking"],
                         for_whom="child", child_age=15, parent_contact="+380501234567")  # fmt: skip
    assert r.status_code == 201, r.text
    assert r.json()["attrs"] == {"level": "B2", "age": "teens", "goal": "travel", "topics": ["speaking"]}
