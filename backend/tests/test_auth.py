from conftest import PASSWORD, PNG


def test_register_login_and_me(client, api):
    user = api.signup("Anna Petrenko", email="Anna@Example.com", timezone="Europe/Kyiv")
    assert user["email"] == "anna@example.com"
    assert user["timezone"] == "Europe/Kyiv"
    assert user["teacher_id"] is None

    r = client.post("/api/auth/register", json={"full_name": "X Y", "email": "anna@example.com", "password": PASSWORD})
    assert r.status_code == 409

    assert client.post("/api/auth/login", json={"email": "anna@example.com", "password": "wrong-pass"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "ANNA@example.com", "password": PASSWORD})
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["full_name"] == "Anna Petrenko"


def test_validation(client):
    r = client.post("/api/auth/register", json={"full_name": "A B", "email": "not-an-email", "password": "short"})
    assert r.status_code == 422
    r = client.post(
        "/api/auth/register", json={"full_name": "A B", "email": "a@example.com", "password": PASSWORD, "timezone": "Mars/Base"}
    )
    assert r.status_code == 422


def test_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_settings_photo_and_password(client, api):
    user = api.signup()
    h = user["headers"]
    r = client.patch("/api/auth/me", headers=h, json={"country": "Ukraine", "notify_messages": False})
    assert r.json()["country"] == "Ukraine" and r.json()["notify_messages"] is False

    other = api.signup("Other", email="taken@example.com")
    assert client.patch("/api/auth/me", headers=h, json={"email": other["email"]}).status_code == 409

    r = client.post("/api/auth/me/photo", headers=h, files={"file": ("a.png", PNG, "image/png")})
    assert r.status_code == 200
    photo = r.json()["photo_url"]
    assert client.get(photo).content == PNG
    r = client.post("/api/auth/me/photo", headers=h, files={"file": ("a.png", b"<html>", "image/png")})
    assert r.status_code == 415
    r = client.post("/api/auth/me/photo", headers=h, files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 415

    r = client.post("/api/auth/change-password", headers=h, json={"current_password": "nope", "new_password": "new-password-2"})
    assert r.status_code == 400
    r = client.post(
        "/api/auth/change-password", headers=h, json={"current_password": PASSWORD, "new_password": "new-password-2"}
    )
    assert r.status_code == 200
    new_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=h).status_code == 401  # old sessions are logged out
    assert client.get("/api/auth/me", headers=new_headers).status_code == 200


def test_blocked_user(client, api):
    admin = api.admin()
    user = api.signup()
    r = client.post(f"/api/admin/users/{user['id']}/block", headers=admin["headers"])
    assert r.json()["is_blocked"] is True
    assert client.get("/api/auth/me", headers=user["headers"]).status_code == 403
    r = client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD})
    assert r.status_code == 403
    assert client.post(f"/api/admin/users/{user['id']}/unblock", headers=admin["headers"]).status_code == 200
    assert client.get("/api/auth/me", headers=user["headers"]).status_code == 200
    assert client.get("/api/admin/users", headers=user["headers"]).status_code == 403


def test_meta_and_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    meta = client.get("/api/meta").json()
    assert meta["request_limit"] == 5 and meta["request_ttl_hours"] == 72
    assert "English" in meta["subjects"] and "B1" in meta["levels"]
