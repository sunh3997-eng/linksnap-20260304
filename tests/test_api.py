"""
LinkSnap API tests
Run with:  pytest tests/
"""

import os
import tempfile
import pytest

os.environ.setdefault("OPENAI_API_KEY", "sk-test-key")

import app as app_module
from app import app, init_db


@pytest.fixture
def client(tmp_path):
    db_file = str(tmp_path / "test.db")
    app_module.DATABASE = db_file
    app.config["TESTING"] = True
    init_db()
    with app.test_client() as c:
        yield c


# ── Health check ──────────────────────────────────────────────────────────────

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    d = r.get_json()
    assert d["status"] == "ok"
    assert "version" in d
    assert "links_total" in d


# ── GET /links (empty) ────────────────────────────────────────────────────────

def test_list_links_empty(client):
    r = client.get("/links")
    assert r.status_code == 200
    d = r.get_json()
    assert d["links"] == []
    assert d["total"] == 0


# ── POST /links ───────────────────────────────────────────────────────────────

def test_create_link_missing_url(client):
    r = client.post("/links", json={})
    assert r.status_code == 400
    assert "url" in r.get_json()["error"].lower()


def test_create_link_invalid_url(client):
    r = client.post("/links", json={"url": "not-a-url"})
    assert r.status_code == 400


def test_create_link_success(client, monkeypatch):
    # Stub out network calls so tests run offline
    monkeypatch.setattr("app.fetch_page_content", lambda url: ("Test Title", "Test content"))
    monkeypatch.setattr("app.generate_summary",   lambda t, c, u: "句子1。句子2。句子3。")

    r = client.post("/links", json={"url": "https://example.com", "title": "Example", "tags": "test"})
    assert r.status_code == 201
    d = r.get_json()
    assert d["url"] == "https://example.com"
    assert d["summary"] == "句子1。句子2。句子3。"
    assert d["tags"] == "test"


def test_create_link_not_json(client):
    r = client.post("/links", data="url=https://example.com", content_type="text/plain")
    assert r.status_code == 400


# ── GET /links with search ────────────────────────────────────────────────────

def test_search_links(client, monkeypatch):
    monkeypatch.setattr("app.fetch_page_content", lambda url: ("", ""))
    # Return a neutral summary that never contains the search term
    monkeypatch.setattr("app.generate_summary",   lambda t, c, u: "这是一段摘要。")

    client.post("/links", json={"url": "https://flask.palletsprojects.com", "title": "Flask Guide"})
    client.post("/links", json={"url": "https://vuejs.org", "title": "Vue.js"})

    r = client.get("/links?q=Flask")
    d = r.get_json()
    assert d["total"] == 1
    assert d["links"][0]["title"] == "Flask Guide"


# ── GET /links/:id ────────────────────────────────────────────────────────────

def test_get_link(client, monkeypatch):
    monkeypatch.setattr("app.fetch_page_content", lambda url: ("", ""))
    monkeypatch.setattr("app.generate_summary",   lambda t, c, u: "摘要。")

    create = client.post("/links", json={"url": "https://example.com/get"})
    link_id = create.get_json()["id"]

    r = client.get(f"/links/{link_id}")
    assert r.status_code == 200
    assert r.get_json()["id"] == link_id


def test_get_link_not_found(client):
    r = client.get("/links/99999")
    assert r.status_code == 404


# ── PATCH /links/:id ─────────────────────────────────────────────────────────

def test_update_link(client, monkeypatch):
    monkeypatch.setattr("app.fetch_page_content", lambda url: ("", ""))
    monkeypatch.setattr("app.generate_summary",   lambda t, c, u: "摘要。")

    create = client.post("/links", json={"url": "https://example.com/patch"})
    link_id = create.get_json()["id"]

    r = client.patch(f"/links/{link_id}", json={"tags": "newtag,another"})
    assert r.status_code == 200
    assert r.get_json()["tags"] == "newtag,another"


# ── DELETE /links/:id ─────────────────────────────────────────────────────────

def test_delete_link(client, monkeypatch):
    monkeypatch.setattr("app.fetch_page_content", lambda url: ("", ""))
    monkeypatch.setattr("app.generate_summary",   lambda t, c, u: "摘要。")

    create = client.post("/links", json={"url": "https://example.com/delete"})
    link_id = create.get_json()["id"]

    r = client.delete(f"/links/{link_id}")
    assert r.status_code == 200
    assert r.get_json()["deleted"] == link_id

    r2 = client.get(f"/links/{link_id}")
    assert r2.status_code == 404


def test_delete_link_not_found(client):
    r = client.delete("/links/99999")
    assert r.status_code == 404


# ── GET /tags ─────────────────────────────────────────────────────────────────

def test_list_tags(client, monkeypatch):
    monkeypatch.setattr("app.fetch_page_content", lambda url: ("", ""))
    monkeypatch.setattr("app.generate_summary",   lambda t, c, u: "摘要。")

    client.post("/links", json={"url": "https://a.com", "tags": "python,web"})
    client.post("/links", json={"url": "https://b.com", "tags": "python,ai"})

    r = client.get("/tags")
    assert r.status_code == 200
    tags = r.get_json()
    assert "python" in tags
    assert "web"    in tags
    assert "ai"     in tags


# ── GET /stats ────────────────────────────────────────────────────────────────

def test_stats(client, monkeypatch):
    monkeypatch.setattr("app.fetch_page_content", lambda url: ("", ""))
    monkeypatch.setattr("app.generate_summary",   lambda t, c, u: "摘要。")

    client.post("/links", json={"url": "https://stats-test.com"})

    r = client.get("/stats")
    assert r.status_code == 200
    d = r.get_json()
    assert d["plan"] in ("free", "pro")
    assert d["total_links"] >= 1


# ── Dashboard ─────────────────────────────────────────────────────────────────

def test_dashboard(client):
    r = client.get("/")
    assert r.status_code == 200
    assert b"LinkSnap" in r.data
