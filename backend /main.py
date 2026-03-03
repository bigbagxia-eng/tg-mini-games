import json
import time
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

from db import init_db, get_conn
from telegram_auth import validate_init_data

# IMPORTANT: поставь BOT_TOKEN в переменную окружения на хостинге
import os
BOT_TOKEN = os.getenv("BOT_TOKEN", "")

app = FastAPI(title="TG Mini Games Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # на проде можешь сузить до домена фронта
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

def auth_user(x_init_data: str | None) -> dict:
    if not BOT_TOKEN:
        raise HTTPException(500, "BOT_TOKEN not set on server")
    try:
        data = validate_init_data(x_init_data or "", BOT_TOKEN)
        user = json.loads(data.get("user", "{}"))
        if not user.get("id"):
            raise ValueError("No user.id")
        return user
    except Exception as e:
        raise HTTPException(401, f"Auth failed: {e}")

@app.get("/api/me")
def me(x_init_data: str | None = Header(default=None, convert_underscores=False)):
    user = auth_user(x_init_data)
    return {"ok": True, "user": user}

@app.post("/api/score")
def submit_score(payload: dict, x_init_data: str | None = Header(default=None, convert_underscores=False)):
    user = auth_user(x_init_data)

    game = str(payload.get("game", "")).strip()
    score = payload.get("score", None)
    if game not in {"snake", "runner", "match3"}:
        raise HTTPException(400, "Bad game")
    if not isinstance(score, int) or score < 0 or score > 10_000_000:
        raise HTTPException(400, "Bad score")

    tg_id = int(user["id"])
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
      INSERT INTO users(tg_id, username, first_name, last_name, photo_url)
      VALUES(?,?,?,?,?)
      ON CONFLICT(tg_id) DO UPDATE SET
        username=excluded.username,
        first_name=excluded.first_name,
        last_name=excluded.last_name,
        photo_url=excluded.photo_url;
    """, (
        tg_id,
        user.get("username"),
        user.get("first_name"),
        user.get("last_name"),
        user.get("photo_url"),
    ))

    now = int(time.time())
    # сохраняем лучший результат (high score)
    cur.execute("SELECT score FROM scores WHERE tg_id=? AND game=?", (tg_id, game))
    row = cur.fetchone()
    if row is None:
        cur.execute("INSERT INTO scores(tg_id, game, score, created_at) VALUES(?,?,?,?)", (tg_id, game, score, now))
        best = score
        improved = True
    else:
        best = int(row["score"])
        improved = score > best
        if improved:
            cur.execute("UPDATE scores SET score=?, created_at=? WHERE tg_id=? AND game=?", (score, now, tg_id, game))
            best = score

    conn.commit()
    conn.close()
    return {"ok": True, "best": best, "improved": improved}

@app.get("/api/leaderboard")
def leaderboard(game: str, limit: int = 20, x_init_data: str | None = Header(default=None, convert_underscores=False)):
    _ = auth_user(x_init_data)
    if game not in {"snake", "runner", "match3"}:
        raise HTTPException(400, "Bad game")
    limit = max(5, min(100, int(limit)))

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
      SELECT s.score, u.tg_id, u.username, u.first_name, u.last_name, u.photo_url
      FROM scores s
      JOIN users u ON u.tg_id = s.tg_id
      WHERE s.game=?
      ORDER BY s.score DESC, s.created_at ASC
      LIMIT ?;
    """, (game, limit))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"ok": True, "rows": rows}
