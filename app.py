"""
LinkSnap — 一键保存网页链接并生成 AI 摘要
Flask backend: REST API + Web Dashboard
"""

import os
import sqlite3
import logging
from datetime import datetime
from functools import wraps

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from flask import Flask, request, jsonify, g, render_template_string
from flask_cors import CORS
from openai import OpenAI

load_dotenv()

app = Flask(__name__)
CORS(app, origins=os.getenv("CORS_ORIGINS", "*").split(","))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE = os.getenv("DATABASE_PATH", "linksnap.db")
FREE_TIER_LIMIT = int(os.getenv("FREE_TIER_LIMIT", "100"))

openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))


# ─── Database ────────────────────────────────────────────────────────────────

def get_db():
    db = getattr(g, "_database", None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
    return db


@app.teardown_appcontext
def close_db(exception):
    db = getattr(g, "_database", None)
    if db is not None:
        db.close()


def init_db():
    # Use a direct connection (not g) so this works both at startup and in tests
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.executescript("""
            CREATE TABLE IF NOT EXISTS links (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                url         TEXT    NOT NULL,
                title       TEXT    NOT NULL DEFAULT '',
                summary     TEXT    NOT NULL DEFAULT '',
                content     TEXT    NOT NULL DEFAULT '',
                tags        TEXT    NOT NULL DEFAULT '',
                user_id     TEXT    NOT NULL DEFAULT 'default',
                created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_links_user_id    ON links(user_id);
            CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at DESC);

            CREATE TABLE IF NOT EXISTS users (
                id         TEXT    PRIMARY KEY,
                email      TEXT    UNIQUE,
                plan       TEXT    NOT NULL DEFAULT 'free',
                usage      INTEGER NOT NULL DEFAULT 0,
                created_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            INSERT OR IGNORE INTO users (id, email, plan) VALUES ('default', NULL, 'free');
        """)
    db.commit()
    db.close()
    logger.info("Database initialised at %s", DATABASE)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def require_json(f):
    """Decorator: 400 if request body is not JSON."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json"}), 400
        return f(*args, **kwargs)
    return decorated


def check_rate_limit(user_id: str) -> bool:
    """Return True if user is within their plan's limit."""
    db = get_db()
    user = db.execute("SELECT plan, usage FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        return True
    if user["plan"] == "pro":
        return True
    return user["usage"] < FREE_TIER_LIMIT


def fetch_page_content(url: str) -> tuple[str, str]:
    """
    Fetch URL and return (title, text_content).
    Falls back to empty strings on error.
    """
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/121.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove noise
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
            tag.decompose()

        title = soup.title.get_text(strip=True) if soup.title else ""

        # Prefer article / main content blocks
        body = (
            soup.find("article")
            or soup.find("main")
            or soup.find(id="content")
            or soup.find(class_="content")
            or soup.body
        )
        text = body.get_text(separator="\n", strip=True) if body else ""
        # Trim to ~4 000 chars so we stay within a small model's context
        return title, text[:4000]
    except Exception as exc:
        logger.warning("fetch_page_content(%s) failed: %s", url, exc)
        return "", ""


def generate_summary(title: str, content: str, url: str) -> str:
    """Call OpenAI to produce a 3-sentence Chinese summary."""
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or api_key == "sk-your-openai-api-key":
        return "（未配置 OpenAI API Key，摘要不可用）"

    system_prompt = (
        "你是一个帮助用户快速理解网页内容的助手。"
        "用中文写3句话的摘要，精炼地总结核心内容，让用户一眼就能知道这篇文章讲的是什么。"
        "直接输出摘要文字，不要加任何前缀或标题。"
    )
    user_prompt = f"网页标题：{title}\n网页地址：{url}\n\n正文内容：\n{content}"

    try:
        response = openai_client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=300,
            temperature=0.3,
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        logger.error("OpenAI summary failed: %s", exc)
        return f"（摘要生成失败：{exc}）"


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Health-check endpoint."""
    db = get_db()
    link_count = db.execute("SELECT COUNT(*) FROM links").fetchone()[0]
    return jsonify({
        "status": "ok",
        "version": "1.0.0",
        "links_total": link_count,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })


# ── Links CRUD ────────────────────────────────────────────────────────────────

@app.get("/links")
def list_links():
    """
    GET /links
    Query params:
        q       — full-text search in title/summary/tags
        tag     — filter by exact tag
        limit   — default 50, max 200
        offset  — pagination offset
        user_id — user identifier (default: 'default')
    """
    user_id = request.args.get("user_id", "default")
    q       = request.args.get("q", "").strip()
    tag     = request.args.get("tag", "").strip()
    limit   = min(int(request.args.get("limit", 50)), 200)
    offset  = int(request.args.get("offset", 0))

    db = get_db()
    params = [user_id]
    where  = "user_id = ?"

    if q:
        where += " AND (title LIKE ? OR summary LIKE ? OR tags LIKE ? OR url LIKE ?)"
        like = f"%{q}%"
        params += [like, like, like, like]

    if tag:
        where += " AND (',' || tags || ',' LIKE ?)"
        params.append(f"%,{tag},%")

    rows = db.execute(
        f"SELECT id, url, title, summary, tags, created_at "
        f"FROM links WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()

    total = db.execute(f"SELECT COUNT(*) FROM links WHERE {where}", params).fetchone()[0]

    return jsonify({
        "links":  [dict(r) for r in rows],
        "total":  total,
        "limit":  limit,
        "offset": offset,
    })


@app.post("/links")
@require_json
def create_link():
    """
    POST /links
    Body: { url, title?, tags?, user_id? }
    Returns the saved link with AI summary.
    """
    data    = request.get_json()
    url     = (data.get("url") or "").strip()
    user_id = (data.get("user_id") or "default").strip()

    if not url:
        return jsonify({"error": "url is required"}), 400
    if not url.startswith(("http://", "https://")):
        return jsonify({"error": "url must start with http:// or https://"}), 400

    if not check_rate_limit(user_id):
        return jsonify({
            "error": f"Free tier limit ({FREE_TIER_LIMIT} links/month) reached. Upgrade to Pro.",
            "upgrade_url": "/upgrade",
        }), 429

    # Use title from client if provided; otherwise fetch from page
    client_title = (data.get("title") or "").strip()
    tags         = (data.get("tags") or "").strip()

    # Fetch page content and generate summary (may be slow — good candidate for async)
    fetched_title, content = fetch_page_content(url)
    title   = client_title or fetched_title or url
    summary = generate_summary(title, content, url)

    db = get_db()
    now = datetime.utcnow().isoformat()
    cursor = db.execute(
        "INSERT INTO links (url, title, summary, content, tags, user_id, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (url, title, summary, content, tags, user_id, now, now),
    )
    db.execute(
        "UPDATE users SET usage = usage + 1 WHERE id = ?", (user_id,)
    )
    db.commit()

    link = db.execute(
        "SELECT id, url, title, summary, tags, created_at FROM links WHERE id = ?",
        (cursor.lastrowid,),
    ).fetchone()

    return jsonify(dict(link)), 201


@app.get("/links/<int:link_id>")
def get_link(link_id):
    """GET /links/:id — return full link including content."""
    user_id = request.args.get("user_id", "default")
    db  = get_db()
    row = db.execute(
        "SELECT * FROM links WHERE id = ? AND user_id = ?", (link_id, user_id)
    ).fetchone()
    if row is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(dict(row))


@app.delete("/links/<int:link_id>")
def delete_link(link_id):
    """DELETE /links/:id"""
    user_id = request.args.get("user_id", "default")
    db  = get_db()
    row = db.execute(
        "SELECT id FROM links WHERE id = ? AND user_id = ?", (link_id, user_id)
    ).fetchone()
    if row is None:
        return jsonify({"error": "Not found"}), 404
    db.execute("DELETE FROM links WHERE id = ?", (link_id,))
    db.commit()
    return jsonify({"deleted": link_id})


@app.patch("/links/<int:link_id>")
@require_json
def update_link(link_id):
    """PATCH /links/:id — update tags and/or title."""
    user_id = request.args.get("user_id", "default")
    data = request.get_json()
    db   = get_db()
    row  = db.execute(
        "SELECT id FROM links WHERE id = ? AND user_id = ?", (link_id, user_id)
    ).fetchone()
    if row is None:
        return jsonify({"error": "Not found"}), 404

    updates, params = [], []
    for field in ("title", "tags"):
        if field in data:
            updates.append(f"{field} = ?")
            params.append(data[field])

    if not updates:
        return jsonify({"error": "Nothing to update"}), 400

    updates.append("updated_at = ?")
    params.append(datetime.utcnow().isoformat())
    params.append(link_id)

    db.execute(f"UPDATE links SET {', '.join(updates)} WHERE id = ?", params)
    db.commit()

    updated = db.execute("SELECT id, url, title, summary, tags, created_at FROM links WHERE id = ?", (link_id,)).fetchone()
    return jsonify(dict(updated))


@app.get("/tags")
def list_tags():
    """GET /tags — return all unique tags used by the user."""
    user_id = request.args.get("user_id", "default")
    db  = get_db()
    rows = db.execute(
        "SELECT tags FROM links WHERE user_id = ? AND tags != ''", (user_id,)
    ).fetchall()

    tag_set = set()
    for row in rows:
        for t in row["tags"].split(","):
            t = t.strip()
            if t:
                tag_set.add(t)

    return jsonify(sorted(tag_set))


@app.get("/stats")
def stats():
    """GET /stats — usage stats for the current user."""
    user_id = request.args.get("user_id", "default")
    db = get_db()
    user = db.execute("SELECT plan, usage FROM users WHERE id = ?", (user_id,)).fetchone()
    total_links = db.execute(
        "SELECT COUNT(*) FROM links WHERE user_id = ?", (user_id,)
    ).fetchone()[0]

    plan  = user["plan"]  if user else "free"
    usage = user["usage"] if user else 0

    return jsonify({
        "plan":        plan,
        "usage":       usage,
        "total_links": total_links,
        "limit":       None if plan == "pro" else FREE_TIER_LIMIT,
        "remaining":   None if plan == "pro" else max(0, FREE_TIER_LIMIT - usage),
    })


# ─── Web Dashboard ─────────────────────────────────────────────────────────────

DASHBOARD_HTML = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LinkSnap — 我的链接库</title>
<style>
  :root {
    --bg:      #0f1117;
    --surface: #1a1d27;
    --border:  #2a2d3a;
    --accent:  #6c8fff;
    --accent2: #a78bfa;
    --text:    #e2e8f0;
    --muted:   #8892a4;
    --danger:  #f87171;
    --success: #4ade80;
    --radius:  12px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; min-height: 100vh; }

  header { border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; background: var(--bg); z-index: 10; }
  .logo { font-size: 22px; font-weight: 700; background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .logo span { font-size: 18px; }
  .header-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .plan-badge { font-size: 11px; padding: 3px 10px; border-radius: 20px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; }
  .plan-free { background: #2a2d3a; color: var(--muted); }
  .plan-pro  { background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #fff; }

  .container { max-width: 860px; margin: 0 auto; padding: 24px 16px 80px; }

  .search-bar { display: flex; gap: 10px; margin-bottom: 20px; }
  .search-bar input { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 16px; color: var(--text); font-size: 14px; outline: none; transition: border-color .2s; }
  .search-bar input:focus { border-color: var(--accent); }
  .search-bar input::placeholder { color: var(--muted); }
  .btn { padding: 10px 18px; border-radius: var(--radius); font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: opacity .15s, transform .1s; }
  .btn:active { transform: scale(.97); }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { opacity: .85; }
  .btn-danger  { background: transparent; color: var(--danger); border: 1px solid var(--danger); padding: 5px 10px; font-size: 12px; border-radius: 8px; }
  .btn-danger:hover { background: var(--danger); color: #fff; }

  .tags-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .tag-chip { padding: 4px 12px; border-radius: 20px; font-size: 12px; cursor: pointer; background: var(--surface); border: 1px solid var(--border); color: var(--muted); transition: all .15s; }
  .tag-chip:hover, .tag-chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .tag-chip-clear { color: var(--danger); border-color: transparent; }

  .stats-bar { display: flex; gap: 16px; margin-bottom: 24px; font-size: 13px; color: var(--muted); }
  .stats-bar b { color: var(--text); }

  .links-list { display: flex; flex-direction: column; gap: 14px; }
  .link-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; transition: border-color .2s; }
  .link-card:hover { border-color: #3a3d4a; }
  .link-title { font-size: 15px; font-weight: 600; color: var(--text); text-decoration: none; display: block; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .link-title:hover { color: var(--accent); }
  .link-url { font-size: 12px; color: var(--muted); margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .link-summary { font-size: 13px; line-height: 1.7; color: #b0b8c8; margin-bottom: 12px; }
  .link-footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .link-date { font-size: 11px; color: var(--muted); margin-right: auto; }
  .tag { font-size: 11px; padding: 2px 8px; border-radius: 6px; background: #1e2235; color: var(--accent2); cursor: pointer; }
  .tag:hover { background: #252840; }

  .empty-state { text-align: center; padding: 80px 20px; color: var(--muted); }
  .empty-state .icon { font-size: 48px; margin-bottom: 16px; }
  .empty-state p { font-size: 15px; line-height: 1.8; }

  .loading { text-align: center; padding: 40px; color: var(--muted); }

  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 100; display: flex; align-items: center; justify-content: center; }
  .modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; width: 480px; max-width: calc(100vw - 32px); }
  .modal h2 { font-size: 16px; margin-bottom: 18px; }
  .modal input, .modal textarea { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; color: var(--text); font-size: 13px; outline: none; margin-bottom: 12px; resize: vertical; }
  .modal input:focus, .modal textarea:focus { border-color: var(--accent); }
  .modal-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 6px; }
  .btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--muted); }
  .btn-secondary:hover { border-color: var(--text); color: var(--text); }

  #toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #1e2235; border: 1px solid var(--border); color: var(--text); padding: 10px 20px; border-radius: var(--radius); font-size: 13px; opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 200; }
  #toast.show { opacity: 1; }
</style>
</head>
<body>
<header>
  <div class="logo">🔗 LinkSnap <span>链接库</span></div>
  <div class="header-right">
    <span id="plan-badge" class="plan-badge plan-free">Free</span>
    <button class="btn btn-primary" onclick="openAddModal()">+ 添加链接</button>
  </div>
</header>

<div class="container">
  <div class="search-bar">
    <input type="text" id="search-input" placeholder="搜索标题、摘要、标签…" oninput="debounce(loadLinks, 350)()">
  </div>

  <div id="tags-row" class="tags-row" style="display:none"></div>

  <div id="stats-bar" class="stats-bar"></div>

  <div id="links-list" class="links-list">
    <div class="loading">加载中…</div>
  </div>
</div>

<!-- Add Link Modal -->
<div id="add-modal" class="modal-overlay" style="display:none" onclick="closeModal(event)">
  <div class="modal">
    <h2>添加新链接</h2>
    <input type="url" id="add-url" placeholder="https://example.com" />
    <input type="text" id="add-title" placeholder="标题（可留空，自动获取）" />
    <input type="text" id="add-tags" placeholder="标签，用英文逗号分隔（如：tech,ai,design）" />
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="document.getElementById('add-modal').style.display='none'">取消</button>
      <button class="btn btn-primary" id="add-submit-btn" onclick="submitLink()">保存并生成摘要</button>
    </div>
  </div>
</div>

<div id="toast"></div>

<script>
const API = '';
let currentTag = '';
let debounceTimers = {};

function debounce(fn, ms) {
  return (...args) => {
    clearTimeout(debounceTimers[fn]);
    debounceTimers[fn] = setTimeout(() => fn(...args), ms);
  };
}

function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

function fmtDate(iso) {
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadStats() {
  try {
    const r = await fetch(API + '/stats');
    const s = await r.json();
    const badge = document.getElementById('plan-badge');
    badge.textContent = s.plan === 'pro' ? 'Pro' : 'Free';
    badge.className   = 'plan-badge ' + (s.plan === 'pro' ? 'plan-pro' : 'plan-free');
    document.getElementById('stats-bar').innerHTML =
      `共 <b>${s.total_links}</b> 条链接` +
      (s.plan === 'free' ? ` &nbsp;·&nbsp; 本月已用 <b>${s.usage}</b> / ${s.limit}` : ' &nbsp;·&nbsp; Pro 无限量');
  } catch(e) {}
}

async function loadTags() {
  try {
    const r = await fetch(API + '/tags');
    const tags = await r.json();
    const row = document.getElementById('tags-row');
    if (!tags.length) { row.style.display = 'none'; return; }
    row.style.display = 'flex';
    row.innerHTML = `<span class="tag-chip tag-chip-clear ${!currentTag?'active':''}" onclick="filterTag('')">全部</span>` +
      tags.map(t => `<span class="tag-chip ${currentTag===t?'active':''}" onclick="filterTag('${t}')">${t}</span>`).join('');
  } catch(e) {}
}

function filterTag(tag) {
  currentTag = tag;
  loadLinks();
  loadTags();
}

async function loadLinks() {
  const q   = document.getElementById('search-input').value.trim();
  const el  = document.getElementById('links-list');
  el.innerHTML = '<div class="loading">加载中…</div>';

  const params = new URLSearchParams({ limit: 50 });
  if (q)          params.set('q', q);
  if (currentTag) params.set('tag', currentTag);

  try {
    const r = await fetch(API + '/links?' + params);
    const d = await r.json();

    if (!d.links.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">🗂️</div><p>${q ? '没有找到相关链接。' : '还没有保存任何链接。<br>安装浏览器插件或点击右上角「+ 添加链接」开始使用。'}</p></div>`;
      return;
    }

    el.innerHTML = d.links.map(l => `
      <div class="link-card" id="card-${l.id}">
        <a class="link-title" href="${l.url}" target="_blank" rel="noopener">${l.title || l.url}</a>
        <div class="link-url">${l.url}</div>
        <div class="link-summary">${l.summary || '<em style="color:var(--muted)">暂无摘要</em>'}</div>
        <div class="link-footer">
          <span class="link-date">${fmtDate(l.created_at)}</span>
          ${(l.tags || '').split(',').filter(Boolean).map(t => `<span class="tag" onclick="filterTag('${t.trim()}')">${t.trim()}</span>`).join('')}
          <button class="btn btn-danger" onclick="deleteLink(${l.id})">删除</button>
        </div>
      </div>`).join('');
  } catch(e) {
    el.innerHTML = '<div class="loading" style="color:var(--danger)">加载失败，请检查后端是否运行中。</div>';
  }
}

async function deleteLink(id) {
  if (!confirm('确认删除这条链接？')) return;
  try {
    await fetch(API + '/links/' + id, { method: 'DELETE' });
    document.getElementById('card-' + id)?.remove();
    loadStats();
    loadTags();
    toast('已删除');
  } catch(e) { toast('删除失败'); }
}

function openAddModal() {
  document.getElementById('add-url').value = '';
  document.getElementById('add-title').value = '';
  document.getElementById('add-tags').value = '';
  document.getElementById('add-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('add-url').focus(), 50);
}

function closeModal(e) {
  if (e.target.classList.contains('modal-overlay'))
    e.target.style.display = 'none';
}

async function submitLink() {
  const url   = document.getElementById('add-url').value.trim();
  const title = document.getElementById('add-title').value.trim();
  const tags  = document.getElementById('add-tags').value.trim();
  if (!url) { toast('请输入 URL'); return; }

  const btn = document.getElementById('add-submit-btn');
  btn.textContent = '正在抓取和生成摘要…';
  btn.disabled = true;

  try {
    const r = await fetch(API + '/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title, tags }),
    });
    const d = await r.json();
    if (!r.ok) { toast('错误：' + (d.error || r.status)); return; }
    document.getElementById('add-modal').style.display = 'none';
    toast('链接已保存！');
    loadLinks();
    loadStats();
    loadTags();
  } catch(e) {
    toast('请求失败，请检查后端。');
  } finally {
    btn.textContent = '保存并生成摘要';
    btn.disabled = false;
  }
}

// Keyboard shortcut: Ctrl/Cmd+K to focus search
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('search-input').focus();
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  }
});

// Initial load
loadStats();
loadTags();
loadLinks();
</script>
</body>
</html>"""


@app.get("/")
def dashboard():
    return DASHBOARD_HTML


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV", "production") == "development"
    logger.info("LinkSnap running at http://localhost:%d", port)
    app.run(host="0.0.0.0", port=port, debug=debug)
