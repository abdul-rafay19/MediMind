import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_login_existing_user_with_sqlite_account():
    resp = client.post(
        '/api/auth/login',
        json={'email': 'love@gmail.com', 'password': '123456'},
    )
    print(resp.status_code, resp.text)
    assert resp.status_code == 200


def test_login_unknown_user_returns_401():
    resp = client.post(
        '/api/auth/login',
        json={'email': 'nope@example.com', 'password': '123456'},
    )
    assert resp.status_code == 401
