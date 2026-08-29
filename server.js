const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("STARTUP ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

const MAX_BODY = 12 * 1024 * 1024;

function hashPassword(v) {
  return crypto.createHash("sha256").update(String(v)).digest("hex");
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function attr(v) {
  return esc(v);
}

function parseCookies(req) {
  const out = {};
  for (const p of (req.headers.cookie || "").split(";")) {
    const i = p.indexOf("=");
    if (i < 0) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function redirect(res, location, cookie) {
  const h = { Location: location };
  if (cookie) h["Set-Cookie"] = cookie;
  res.writeHead(302, h);
  res.end();
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    req.on("data", chunk => {
      size += chunk.length;

      if (size > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }

      body += chunk.toString("utf8");
    });

    req.on("end", () => {
      resolve(new URLSearchParams(body));
    });

    req.on("error", reject);
  });
}

function imageDataUrl(file) {
  return `data:${file.mimeType};base64,${file.buffer.toString("base64")}`;
}

async function readMultipart(req) {
  const ct = req.headers["content-type"] || "";

  const m = ct.match(
    /boundary=(?:"([^"]+)"|([^;]+))/i
  );

  if (!m) {
    throw new Error("Invalid multipart boundary");
  }

  const boundary = Buffer.from("--" + (m[1] || m[2]));
  const chunks = [];
  let total = 0;

  for await (const c of req) {
    total += c.length;

    if (total > MAX_BODY) {
      throw new Error("Multipart body too large");
    }

    chunks.push(c);
  }

  const body = Buffer.concat(chunks);
  const fields = {};
  const files = {};

  let pos = 0;

  while ((pos = body.indexOf(boundary, pos)) >= 0) {
    let start = pos + boundary.length;

    if (
      body[start] === 45 &&
      body[start + 1] === 45
    ) {
      break;
    }

    if (
      body[start] === 13 &&
      body[start + 1] === 10
    ) {
      start += 2;
    }

    const headEnd = body.indexOf(
      Buffer.from("\r\n\r\n"),
      start
    );

    if (headEnd < 0) break;

    const headers = body
      .slice(start, headEnd)
      .toString();

    const next = body.indexOf(
      boundary,
      headEnd + 4
    );

    if (next < 0) break;

    const dataEnd = next - 2;

    const cd = headers.match(
      /Content-Disposition:[^\r\n]*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i
    );

    const cm = headers.match(
      /Content-Type:\s*([^\r\n]+)/i
    );

    if (cd) {
      const name = cd[1];
      const filename = cd[2];

      const data = body.slice(
        headEnd + 4,
        dataEnd
      );

      if (filename) {
        files[name] = {
          filename,
          mimeType:
            (cm && cm[1].trim()) ||
            "application/octet-stream",
          buffer: data
        };
      } else {
        fields[name] = data.toString("utf8");
      }
    }

    pos = next;
  }

  return { fields, files };
}

function page(title, content, user = null) {
  const nav = user
    ? `
      <nav class="bottom">
        <a href="/"><b>⌂</b>خانه</a>
        <a href="/explore"><b>◉</b>کاوش</a>
        <a href="/new-post"><b>＋</b>انتشار</a>
        <a href="/messages"><b>✉</b>پیام</a>
        <a href="/profile"><b>●</b>پروفایل</a>
      </nav>
    `
    : "";

  const top = user
    ? `
      <div class="top">
        <a href="/notifications">🔔</a>
        <a href="/stories">⭕</a>
        <a href="/jobs">💼</a>
        <a href="/settings">⚙️</a>
        <a href="/logout">🚪</a>
      </div>
    `
    : "";

  return `
<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport"
content="width=device-width,initial-scale=1,viewport-fit=cover">

<title>${esc(title)}</title>

<style>

* {
  box-sizing:border-box
}

body {
  margin:0;
  background:#f3f4f7;
  color:#17181b;
  font-family:Tahoma,Arial,sans-serif
}

.app {
  max-width:760px;
  margin:auto;
  min-height:100vh;
  background:#fff;
  padding-bottom:${user ? 90 : 20}px
}

.header {
  position:sticky;
  top:0;
  z-index:20;
  background:#fff;
  border-bottom:1px solid #e7e7e7;
  padding:12px 15px;
  display:flex;
  justify-content:space-between;
  align-items:center
}

.logo {
  font-size:19px;
  font-weight:900
}

.title {
  font-weight:700
}

.top {
  display:flex;
  gap:8px;
  overflow:auto;
  padding:10px 14px;
  border-bottom:1px solid #eee
}

.top a {
  padding:8px 11px;
  border-radius:12px;
  background:#f2f3f6;
  white-space:nowrap
}

.content {
  padding:12px
}

.card {
  background:#fff;
  border:1px solid #e4e5e8;
  border-radius:18px;
  padding:15px;
  margin-bottom:12px;
  box-shadow:0 2px 9px rgba(0,0,0,.04)
}

.profile-head {
  display:flex;
  align-items:center;
  gap:10px
}

.avatar {
  width:50px;
  height:50px;
  border-radius:50%;
  background:#202124;
  color:#fff;
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:800;
  overflow:hidden;
  flex:none
}

.avatar.large {
  width:100px;
  height:100px;
  font-size:35px
}

.avatar img {
  width:100%;
  height:100%;
  object-fit:cover
}

.username {
  font-weight:800
}

.email,
.small {
  font-size:12px;
  color:#777
}

.email {
  direction:ltr;
  text-align:right;
  margin-top:3px
}

.post-text {
  line-height:1.9;
  white-space:pre-wrap;
  word-break:break-word;
  margin:14px 0
}

.stats {
  display:flex;
  gap:14px;
  flex-wrap:wrap;
  color:#666;
  font-size:13px
}

.actions {
  display:flex;
  gap:7px;
  flex-wrap:wrap;
  margin-top:11px
}

button,
.btn {
  border:0;
  border-radius:12px;
  padding:10px 13px;
  background:#202124;
  color:#fff;
  font-size:14px;
  cursor:pointer;
  text-decoration:none
}

.full {
  width:100%;
  margin-top:7px
}

.like {
  background:#e91e63
}

.follow {
  background:#1976d2
}

.danger {
  background:#b00020
}

.green {
  background:#087f23
}

.purple {
  background:#6a1b9a
}

input,
textarea,
select {
  width:100%;
  border:1px solid #cfd3d8;
  border-radius:12px;
  padding:12px;
  margin:6px 0;
  font:inherit;
  background:#fff
}

textarea {
  min-height:120px;
  resize:vertical
}

a {
  text-decoration:none;
  color:inherit
}

.empty {
  text-align:center;
  color:#777;
  padding:28px
}

.divider {
  height:1px;
  background:#e6e7e9;
  margin:17px 0
}

.bottom {
  position:fixed;
  bottom:0;
  left:50%;
  transform:translateX(-50%);
  width:100%;
  max-width:760px;
  height:70px;
  background:#fff;
  border-top:1px solid #ddd;
  display:flex;
  justify-content:space-around;
  align-items:center;
  z-index:50
}

.bottom a {
  text-align:center;
  font-size:11px;
  color:#333
}

.bottom b {
  display:block;
  font-size:22px
}

.story-row {
  display:flex;
  gap:10px;
  overflow:auto;
  padding:3px
}

.story-item {
  min-width:68px;
  text-align:center;
  font-size:11px
}

.story-ring {
  width:58px;
  height:58px;
  border-radius:50%;
  padding:2px;
  background:linear-gradient(45deg,#f90,#f25,#935);
  margin:auto
}

.story-ring > div {
  width:100%;
  height:100%;
  border-radius:50%;
  overflow:hidden;
  background:#fff;
  border:2px solid #fff
}

.post-image,
.post-video {
  width:100%;
  max-height:520px;
  object-fit:cover;
  border-radius:15px;
  margin-top:8px
}

.message-me {
  margin-right:35px;
  background:#eef4ff
}

.message-other {
  margin-left:35px;
  background:#f4f4f4
}

.message-card {
  padding:11px;
  border-radius:15px;
  margin:8px 0
}

.callbox {
  position:fixed;
  inset:0;
  background:#111;
  color:#fff;
  z-index:100;
  padding:15px;
  display:none
}

.callbox video {
  width:100%;
  max-height:45vh;
  background:#000;
  border-radius:15px;
  margin-bottom:10px
}

@media(max-width:480px) {
  .content {
    padding:9px
  }

  .card {
    border-radius:15px
  }

  .actions button {
    padding:9px 10px
  }
}

body.dark {
  background:#0e0f11;
  color:#eee
}

body.dark .app,
body.dark .header,
body.dark .bottom,
body.dark input,
body.dark textarea,
body.dark select {
  background:#151619;
  color:#eee
}

body.dark .card {
  background:#1b1d21;
  border-color:#303239
}

body.dark .top a {
  background:#292b30;
  color:#eee
}

body.dark .email,
body.dark .small,
body.dark .stats {
  color:#aaa
}

</style>
</head>

<body>

<div class="app">

<header class="header">
  <div class="logo">MySocial 📸</div>
  <div class="title">${esc(title)}</div>
</header>

${top}

<main class="content">
${content}
</main>

</div>

${nav}

<script>

function theme() {
  document.body.classList.toggle("dark");
  localStorage.dark =
    document.body.classList.contains("dark")
      ? "1"
      : "0";
}

if (localStorage.dark === "1") {
  document.body.classList.add("dark");
}

</script>

</body>
</html>`;
}

function sendHtml(
  res,
  status,
  title,
  content,
  user = null
) {
  res.writeHead(status, {
    "Content-Type":
      "text/html; charset=utf-8",
    "Cache-Control":"no-store"
  });

  res.end(
    page(title, content, user)
  );
}

async function col(
  table,
  column,
  definition
) {
  await pool.query(
    `ALTER TABLE ${table}
     ADD COLUMN IF NOT EXISTS
     ${column} ${definition}`
  );
}

async function createTables() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const [c,d] of [
    ["bio","TEXT"],
    ["avatar_url","TEXT"],
    ["website","TEXT"],
    ["is_private","BOOLEAN DEFAULT FALSE"],
    ["theme","TEXT DEFAULT 'light'"]
  ]) {
    await col("users",c,d);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions(
      session_id TEXT PRIMARY KEY,
      user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts(
      id SERIAL PRIMARY KEY,
      user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      image_url TEXT,
      video_url TEXT,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes(
      id SERIAL PRIMARY KEY,
      post_id INTEGER
        REFERENCES posts(id)
        ON DELETE CASCADE,
      user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      UNIQUE(post_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments(
      id SERIAL PRIMARY KEY,
      post_id INTEGER
        REFERENCES posts(id)
        ON DELETE CASCADE,
      user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      comment TEXT NOT NULL,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows(
      id SERIAL PRIMARY KEY,
      follower_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      following_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower_id,following_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookmarks(
      id SERIAL PRIMARY KEY,
      post_id INTEGER
        REFERENCES posts(id)
        ON DELETE CASCADE,
      user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_users(
      id SERIAL PRIMARY KEY,
      blocker_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      blocked_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blocker_id,blocked_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages(
      id SERIAL PRIMARY KEY,
      sender_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      receiver_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      is_read BOOLEAN DEFAULT FALSE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications(
      id SERIAL PRIMARY KEY,
      user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      actor_id INTEGER
        REFERENCES users(id)
        ON DELETE SET NULL,
      type TEXT NOT NULL,
      post_id INTEGER
        REFERENCES posts(id)
        ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports(
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      reported_user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      post_id INTEGER
        REFERENCES posts(id)
        ON DELETE CASCADE,
      reason TEXT NOT NULL,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs(
      id SERIAL PRIMARY KEY,
      user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      salary TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stories(
      id SERIAL PRIMARY KEY,
      user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      media_url TEXT NOT NULL,
      media_type TEXT DEFAULT 'image',
      caption TEXT,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        + INTERVAL '24 hours'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS story_views(
      id SERIAL PRIMARY KEY,
      story_id INTEGER
        REFERENCES stories(id)
        ON DELETE CASCADE,
      user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      viewed_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(story_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hashtags(
      id SERIAL PRIMARY KEY,
      tag TEXT UNIQUE NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_hashtags(
      post_id INTEGER
        REFERENCES posts(id)
        ON DELETE CASCADE,
      hashtag_id INTEGER
        REFERENCES hashtags(id)
        ON DELETE CASCADE,
      UNIQUE(post_id,hashtag_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS call_signals(
      id SERIAL PRIMARY KEY,
      call_id TEXT NOT NULL,
      sender_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      receiver_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      payload TEXT NOT NULL,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_searches(
      id SERIAL PRIMARY KEY,
      user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      query TEXT NOT NULL,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id,query)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_settings(
      user_id INTEGER PRIMARY KEY
        REFERENCES users(id)
        ON DELETE CASCADE,
      notifications BOOLEAN DEFAULT TRUE,
      private_messages BOOLEAN DEFAULT TRUE,
      show_email BOOLEAN DEFAULT TRUE,
      theme TEXT DEFAULT 'light'
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_posts_created
    ON posts(created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_messages_pair
    ON messages(
      sender_id,
      receiver_id,
      created_at
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_stories_exp
    ON stories(expires_at)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_notifications_user
    ON notifications(
      user_id,
      created_at DESC
    )
  `);
}

async function getSession(req) {

  const sid =
    parseCookies(req).sessionId;

  if (!sid) return null;

  const r = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.bio,
      u.avatar_url,
      u.website,
      u.is_private,
      u.theme
    FROM sessions s
    JOIN users u
      ON u.id=s.user_id
    WHERE s.session_id=$1
  `,[sid]);

  return r.rows[0] || null;
}

async function createSession(userId) {

  const sid =
    crypto.randomBytes(32).toString("hex");

  await pool.query(`
    INSERT INTO sessions(
      session_id,
      user_id
    )
    VALUES($1,$2)
  `,[sid,userId]);

  return sid;
}

async function notify(
  uid,
  actor,
  type,
  postId,
  message
) {
  if (!uid || uid === actor) return;

  await pool.query(`
    INSERT INTO notifications(
      user_id,
      actor_id,
      type,
      post_id,
      message
    )
    VALUES($1,$2,$3,$4,$5)
  `,[
    uid,
    actor,
    type,
    postId || null,
    message
  ]);
}

async function blocked(a,b) {

  if (!b || a === b) return false;

  const r = await pool.query(`
    SELECT 1
    FROM blocked_users
    WHERE
      (
        blocker_id=$1
        AND blocked_id=$2
      )
      OR
      (
        blocker_id=$2
        AND blocked_id=$1
      )
    LIMIT 1
  `,[a,b]);

  return !!r.rows.length;
}

function fileOk(file) {

  return file &&
    file.buffer &&
    [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm"
    ].includes(file.mimeType);
}

async function saveHashtags(
  postId,
  text
) {

  const tags = [
    ...String(text).matchAll(
      /#([\p{L}\p{N}_]{1,80})/gu
    )
  ].map(x => x[1].toLowerCase());

  for (
    const tag of [...new Set(tags)]
  ) {

    const r = await pool.query(`
      INSERT INTO hashtags(tag)
      VALUES($1)
      ON CONFLICT(tag)
      DO UPDATE SET tag=EXCLUDED.tag
      RETURNING id
    `,[tag]);

    await pool.query(`
      INSERT INTO post_hashtags(
        post_id,
        hashtag_id
      )
      VALUES($1,$2)
      ON CONFLICT DO NOTHING
    `,[
      postId,
      r.rows[0].id
    ]);
  }
}

function avatarHtml(
  u,
  large = false
) {

  return `
    <div class="avatar${large ? " large" : ""}">
      ${
        u.avatar_url
          ? `
            <img
              src="${attr(u.avatar_url)}"
              alt="پروفایل"
            >
          `
          : esc(
              (u.name || "?").charAt(0)
            )
      }
    </div>
  `;
}

function postCard(p,user) {

  const mine =
    Number(p.user_id) ===
    Number(user.id);

  return `
    <article class="card">

      <div class="profile-head">

        <a href="/profile?id=${p.user_id}">
          ${avatarHtml(p)}
        </a>

        <div>

          <a href="/profile?id=${p.user_id}">
            <div class="username">
              ${esc(p.name)}
            </div>
          </a>

          <div class="email">
            ${esc(p.email)}
          </div>

          <div class="small">
            ${new Date(
              p.created_at
            ).toLocaleString("fa-IR")}
          </div>

        </div>

      </div>

      <div class="post-text">
        ${esc(p.content)}
      </div>

      ${
        p.image_url
          ? `
            <img
              class="post-image"
              src="${attr(p.image_url)}"
              alt="تصویر"
            >
          `
          : ""
      }

      ${
        p.video_url
          ? `
            <video
              class="post-video"
              controls
              src="${attr(p.video_url)}"
            ></video>
          `
          : ""
      }

      <div class="stats">
        <span>❤️ ${p.like_count || 0}</span>
        <span>💬 ${p.comment_count || 0}</span>
      </div>

      <div class="actions">

        <a href="/like?post=${p.id}">
          <button class="like">
            ${
              p.liked
                ? "💔 برداشتن لایک"
                : "❤️ لایک"
            }
          </button>
        </a>

        <a href="/post?id=${p.id}">
          <button>
            💬 نظر
          </button>
        </a>

        <a href="/bookmark?post=${p.id}">
          <button>
            ${
              p.bookmarked
                ? "🔖 ذخیره‌شده"
                : "🔖 ذخیره"
            }
          </button>
        </a>

        <a href="/share?post=${p.id}">
          <button>
            🔗 اشتراک
          </button>
        </a>

        ${
          mine
            ? `
              <a href="/edit-post?id=${p.id}">
                <button>
                  ✏️ ویرایش
                </button>
              </a>

              <a href="/delete-post?id=${p.id}">
                <button class="danger">
                  🗑 حذف
                </button>
              </a>
            `
            : `
              <a href="/report?post=${p.id}">
                <button>
                  🚩 گزارش
                </button>
              </a>
            `
        }

      </div>

    </article>
  `;
}

const server =
http.createServer(
async (req,res) => {

  try {

    const url =
      new URL(
        req.url,
        "http://localhost"
      );

    const path =
      url.pathname;

    const user =
      await getSession(req);

    if (path === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (
      req.method === "GET" &&
      path === "/"
    ) {

      if (!user) {

        sendHtml(
          res,
          200,
          "خوش آمدید",
          `
            <div class="hero card">

              <h1>
                MySocial 📸
              </h1>

              <p>
                یک پلتفرم اجتماعی کامل
                برای پست، استوری، پیام،
                تماس صوتی و تصویری،
                جستجو، دنبال‌کردن و کاریابی.
              </p>

              <a href="/signup">
                <button class="full">
                  ثبت‌نام
                </button>
              </a>

              <a href="/login">
                <button class="full">
                  ورود
                </button>
              </a>

            </div>
          `
        );

        return;
      }

      const stories =
        await pool.query(`
          SELECT
            s.id,
            s.user_id,
            s.media_url,
            s.media_type,
            u.name,
            u.avatar_url
          FROM stories s
          JOIN users u
            ON u.id=s.user_id
          WHERE
            s.expires_at>NOW()
            AND NOT EXISTS(
              SELECT 1
              FROM blocked_users b
              WHERE
                (
                  b.blocker_id=$1
                  AND b.blocked_id=s.user_id
                )
                OR
                (
                  b.blocker_id=s.user_id
                  AND b.blocked_id=$1
                )
            )
          ORDER BY s.created_at DESC
          LIMIT 40
        `,[user.id]);

      const storyHtml =
        stories.rows
          .map(s => `
            <a
              class="story-item"
              href="/story?id=${s.id}"
            >

              <div class="story-ring">

                <div>

                  ${
                    s.avatar_url
                      ? `
                        <img
                          src="${attr(s.avatar_url)}"
                          style="
                            width:100%;
                            height:100%;
                            object-fit:cover
                          "
                        >
                      `
                      : esc(
                          s.name.charAt(0)
                        )
                  }

                </div>

              </div>

              ${esc(s.name)}

            </a>
          `)
          .join("");

      const posts =
        await pool.query(`
          SELECT
            p.*,
            u.name,
            u.email,
            u.avatar_url,

            (
              SELECT COUNT(*)
              FROM likes
              WHERE post_id=p.id
            ) AS like_count,

            (
              SELECT COUNT(*)
              FROM comments
              WHERE post_id=p.id
            ) AS comment_count,

            EXISTS(
              SELECT 1
              FROM likes
              WHERE
                post_id=p.id
                AND user_id=$1
            ) AS liked,

            EXISTS(
              SELECT 1
              FROM bookmarks
              WHERE
                post_id=p.id
                AND user_id=$1
            ) AS bookmarked

          FROM posts p

          JOIN users u
            ON u.id=p.user_id

          WHERE NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (
                b.blocker_id=$1
                AND b.blocked_id=p.user_id
              )
              OR
              (
                b.blocker_id=p.user_id
                AND b.blocked_id=$1
              )
          )

          ORDER BY p.created_at DESC

          LIMIT 60
        `,[user.id]);

      sendHtml(
        res,
        200,
        "خانه",
        `
          <div class="card">

            <div class="story-row">

              <a
                class="story-item"
                href="/new-story"
              >

                <div class="story-ring">
                  <div
                    style="
                      display:flex;
                      align-items:center;
                      justify-content:center;
                      font-size:25px
                    "
                  >
                    ＋
                  </div>
                </div>

                استوری من

              </a>

              ${storyHtml}

            </div>

          </div>

          ${
            posts.rows
              .map(p => postCard(p,user))
              .join("")
            ||
            `
              <div class="card empty">
                هنوز پستی نیست.
              </div>
            `
          }
        `,
        user
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/signup"
    ) {

      sendHtml(
        res,
        200,
        "ثبت‌نام",
        `
          <div class="card">

            <form
              method="POST"
              action="/signup"
            >

              <input
                name="name"
                maxlength="100"
                placeholder="نام"
                required
              >

              <input
                name="email"
                type="email"
                maxlength="200"
                placeholder="ایمیل"
                required
              >

              <input
                name="password"
                type="password"
                minlength="6"
                placeholder="رمز عبور، حداقل ۶ کاراکتر"
                required
              >

              <button class="full">
                ثبت‌نام
              </button>

            </form>

          </div>
        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/signup"
    ) {

      const d =
        await readBody(req);

      const name =
        (d.get("name") || "").trim();

      const email =
        (d.get("email") || "")
          .trim()
          .toLowerCase();

      const pw =
        d.get("password") || "";

      if (
        !name ||
        !email ||
        pw.length < 6
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `
            <div class="card">
              <p class="error">
                اطلاعات ثبت‌نام معتبر نیست.
              </p>
            </div>
          `
        );

        return;
      }

      try {

        const r =
          await pool.query(`
            INSERT INTO users(
              name,
              email,
              password
            )
            VALUES($1,$2,$3)
            RETURNING id
          `,[
            name,
            email,
            hashPassword(pw)
          ]);

        await pool.query(`
          INSERT INTO user_settings(user_id)
          VALUES($1)
          ON CONFLICT DO NOTHING
        `,[r.rows[0].id]);

        redirect(
          res,
          "/login"
        );

      } catch {

        sendHtml(
          res,
          400,
          "خطا",
          `
            <div class="card">
              <p class="error">
                این ایمیل قبلاً ثبت شده است.
              </p>
            </div>
          `
        );
      }

      return;
    }

    if (
      req.method === "GET" &&
      path === "/login"
    ) {

      sendHtml(
        res,
        200,
        "ورود",
        `
          <div class="card">

            <form
              method="POST"
              action="/login"
            >

              <input
                name="email"
                type="email"
                placeholder="ایمیل"
                required
              >

              <input
                name="password"
                type="password"
                placeholder="رمز عبور"
                required
              >

              <button class="full">
                ورود
              </button>

            </form>

          </div>
        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/login"
    ) {

      const d =
        await readBody(req);

      const email =
        (d.get("email") || "")
          .trim()
          .toLowerCase();

      const pw =
        d.get("password") || "";

      const r =
        await pool.query(`
          SELECT id
          FROM users
          WHERE
            email=$1
            AND password=$2
        `,[
          email,
          hashPassword(pw)
        ]);

      if (!r.rows.length) {

        sendHtml(
          res,
          401,
          "خطا",
          `
            <div class="card">
              <p class="error">
                ایمیل یا رمز عبور اشتباه است.
              </p>
            </div>
          `
        );

        return;
      }

      const sid =
        await createSession(
          r.rows[0].id
        );

      redirect(
        res,
        "/",
        `sessionId=${encodeURIComponent(sid)};
         HttpOnly;
         Path=/;
         SameSite=Lax${
           process.env.NODE_ENV === "production"
             ? "; Secure"
             : ""
         }`
      );

      return;
    }

    if (!user) {
      redirect(res,"/login");
      return;
    }

    if (
      req.method === "GET" &&
      path === "/new-post"
    ) {

      sendHtml(
        res,
        200,
        "انتشار پست",
        `
          <div class="card">

            <form
              method="POST"
              action="/new-post"
              enctype="multipart/form-data"
            >

              <textarea
                name="content"
                maxlength="5000"
                placeholder="چه چیزی می‌خواهی منتشر کنی؟ #هشتگ"
                required
              ></textarea>

              <label>
                🖼️ عکس یا 🎥 ویدئو
              </label>

              <input
                type="file"
                name="media"
                accept="
                  image/jpeg,
                  image/png,
                  image/webp,
                  image/gif,
                  video/mp4,
                  video/webm
                "
              >

              <div class="notice">
                حداکثر حجم فایل ۱۰ مگابایت.
              </div>

              <button class="full">
                📤 انتشار
              </button>

            </form>

          </div>
        `,
        user
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/new-post"
    ) {

      let content = "";
      let image = null;
      let video = null;

      const ct =
        req.headers["content-type"] || "";

      if (
        ct.includes("multipart/form-data")
      ) {

        const f =
          await readMultipart(req);

        content =
          String(
            f.fields.content || ""
          ).trim();

        const media =
          f.files.media;

        if (
          media &&
          media.buffer.length >
            10 * 1024 * 1024
        ) {

          sendHtml(
            res,
            400,
            "خطا",
            `
              <div class="card">
                <p class="error">
                  حجم فایل بیشتر از ۱۰ مگابایت است.
                </p>
              </div>
            `,
            user
          );

          return;
        }

        if (
          media &&
          fileOk(media)
        ) {

          if (
            media.mimeType.startsWith(
              "image/"
            )
          ) {

            image =
              imageDataUrl(media);

          } else {

            video =
              imageDataUrl(media);
          }
        }

      } else {

        const d =
          await readBody(req);

        content =
          (d.get("content") || "")
            .trim();

        image =
          (d.get("image_url") || "")
            .trim() || null;
      }

      if (!content) {

        sendHtml(
          res,
          400,
          "خطا",
          `
            <div class="card">
              <p class="error">
                متن پست خالی است.
              </p>
            </div>
          `,
          user
        );

        return;
      }

      const r =
        await pool.query(`
          INSERT INTO posts(
            user_id,
            content,
            image_url,
            video_url
          )
          VALUES($1,$2,$3,$4)
          RETURNING id
        `,[
          user.id,
          content,
          image,
          video
        ]);

      await saveHashtags(
        r.rows[0].id,
        content
      );

      redirect(res,"/");
      return;
    }

    if (
      req.method === "GET" &&
      path === "/like"
    ) {

      const id =
        Number(
          url.searchParams.get("post")
        );

      if (Number.isInteger(id)) {

        const p =
          await pool.query(`
            SELECT user_id
            FROM posts
            WHERE id=$1
          `,[id]);

        if (
          p.rows.length &&
          !await blocked(
            user.id,
            p.rows[0].user_id
          )
        ) {

          const x =
            await pool.query(`
              SELECT id
              FROM likes
              WHERE
                post_id=$1
                AND user_id=$2
            `,[
              id,
              user.id
            ]);

          if (x.rows.length) {

            await pool.query(`
              DELETE FROM likes
              WHERE
                post_id=$1
                AND user_id=$2
            `,[
              id,
              user.id
            ]);

          } else {

            await pool.query(`
              INSERT INTO likes(
                post_id,
                user_id
              )
              VALUES($1,$2)
              ON CONFLICT DO NOTHING
            `,[
              id,
              user.id
            ]);

            await notify(
              p.rows[0].user_id,
              user.id,
              "like",
              id,
              `${user.name} پست شما را پسندید.`
            );
          }
        }
      }

      redirect(
        res,
        url.searchParams.get("from") === "post"
          ? `/post?id=${id}`
          : "/"
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/bookmark"
    ) {

      const id =
        Number(
          url.searchParams.get("post")
        );

      if (Number.isInteger(id)) {

        const x =
          await pool.query(`
            SELECT id
            FROM bookmarks
            WHERE
              post_id=$1
              AND user_id=$2
          `,[
            id,
            user.id
          ]);

        if (x.rows.length) {

          await pool.query(`
            DELETE FROM bookmarks
            WHERE
              post_id=$1
              AND user_id=$2
          `,[
            id,
            user.id
          ]);

        } else {

          await pool.query(`
            INSERT INTO bookmarks(
              post_id,
              user_id
            )
            VALUES($1,$2)
            ON CONFLICT DO NOTHING
          `,[
            id,
            user.id
          ]);
        }
      }

      redirect(
        res,
        url.searchParams.get("from") === "saved"
          ? "/saved"
          : "/"
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/post"
    ) {

      const id =
        Number(
          url.searchParams.get("id")
        );

      const r =
        await pool.query(`
          SELECT
            p.*,
            u.name,
            u.email,
            u.avatar_url,

            (
              SELECT COUNT(*)
              FROM likes
              WHERE post_id=p.id
            ) AS like_count,

            (
              SELECT COUNT(*)
              FROM comments
              WHERE post_id=p.id
            ) AS comment_count,

            EXISTS(
              SELECT 1
              FROM likes
              WHERE
                post_id=p.id
                AND user_id=$1
            ) AS liked,

            EXISTS(
              SELECT 1
              FROM bookmarks
              WHERE
                post_id=p.id
                AND user_id=$1
            ) AS bookmarked

          FROM posts p
          JOIN users u
            ON u.id=p.user_id

          WHERE p.id=$2
        `,[
          user.id,
          id
        ]);

      if (!r.rows.length) {

        sendHtml(
          res,
          404,
          "پست",
          `
            <div class="card empty">
              پست پیدا نشد.
            </div>
          `,
          user
        );

        return;
      }

      const p = r.rows[0];

      if (
        await blocked(
          user.id,
          p.user_id
        )
      ) {

        sendHtml(
          res,
          403,
          "محدود",
          `
            <div class="card empty">
              دسترسی به این پست ممکن نیست.
            </div>
          `,
          user
        );

        return;
      }

      const c =
        await pool.query(`
          SELECT
            c.*,
            u.name,
            u.avatar_url
          FROM comments c
          JOIN users u
            ON u.id=c.user_id
          WHERE c.post_id=$1
          ORDER BY c.created_at ASC
          LIMIT 500
        `,[id]);

      sendHtml(
        res,
        200,
        "پست",
        `
          ${postCard(p,user)}

          <div class="card">

            <h3>
              💬 نظرات
            </h3>

            ${
              c.rows
                .map(x => `
                  <div class="comment card">

                    <div class="profile-head">

                      ${avatarHtml(x)}

                      <div>

                        <div class="username">
                          ${esc(x.name)}
                        </div>

                        <div class="small">
                          ${new Date(
                            x.created_at
                          ).toLocaleString("fa-IR")}
                        </div>

                      </div>

                    </div>

                    <div class="post-text">
                      ${esc(x.comment)}
                    </div>

                  </div>
                `)
                .join("")
              ||
              `
                <div class="empty">
                  هنوز نظری ثبت نشده است.
                </div>
              `
            }

            <form
              method="POST"
              action="/comment"
            >

              <input
                type="hidden"
                name="post_id"
                value="${id}"
              >

              <textarea
                name="comment"
                maxlength="3000"
                placeholder="نظر خود را بنویسید..."
                required
              ></textarea>

              <button class="full">
                ارسال نظر
              </button>

            </form>

          </div>
        `,
        user
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/comment"
    ) {

      const d =
        await readBody(req);

      const id =
        Number(
          d.get("post_id")
        );

      const comment =
        (d.get("comment") || "")
          .trim();

      const p =
        await pool.query(`
          SELECT user_id
          FROM posts
          WHERE id=$1
        `,[id]);

      if (
        p.rows.length &&
        comment &&
        !await blocked(
          user.id,
          p.rows[0].user_id
        )
      ) {

        await pool.query(`
          INSERT INTO comments(
            post_id,
            user_id,
            comment
          )
          VALUES($1,$2,$3)
        `,[
          id,
          user.id,
          comment
        ]);

        await notify(
          p.rows[0].user_id,
          user.id,
          "comment",
          id,
          `${user.name} روی پست شما نظر داد.`
        );
      }

      redirect(
        res,
        `/post?id=${id}`
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/edit-post"
    ) {

      const id =
        Number(
          url.searchParams.get("id")
        );

      const r =
        await pool.query(`
          SELECT *
          FROM posts
          WHERE
            id=$1
            AND user_id=$2
        `,[
          id,
          user.id
        ]);

      if (!r.rows.length) {

        sendHtml(
          res,
          404,
          "خطا",
          `
            <div class="card empty">
              پست پیدا نشد.
            </div>
          `,
          user
        );

        return;
      }

      const p =
        r.rows[0];

      sendHtml(
        res,
        200,
        "ویرایش پست",
        `
          <div class="card">

            <form
              method="POST"
              action="/edit-post"
            >

              <input
                type="hidden"
                name="id"
                value="${id}"
              >

              <textarea
                name="content"
                maxlength="5000"
                required
              >${esc(p.content)}</textarea>

              <input
                name="image_url"
                value="${attr(
                  p.image_url || ""
                )}"
                placeholder="لینک عکس، اختیاری"
              >

              <button class="full">
                💾 ذخیره
              </button>

            </form>

          </div>
        `,
        user
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/edit-post"
    ) {

      const d =
        await readBody(req);

      const id =
        Number(
          d.get("id")
        );

      const content =
        (d.get("content") || "")
          .trim();

      const image =
        (d.get("image_url") || "")
          .trim() || null;

      await pool.query(`
        UPDATE posts
        SET
          content=$1,
          image_url=$2,
          updated_at=NOW()
        WHERE
          id=$3
          AND user_id=$4
      `,[
        content,
        image,
        id,
        user.id
      ]);

      await pool.query(`
        DELETE FROM post_hashtags
        WHERE post_id=$1
      `,[id]);

      await saveHashtags(
        id,
        content
      );

      redirect(
        res,
        `/post?id=${id}`
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/delete-post"
    ) {

      const id =
        Number(
          url.searchParams.get("id")
        );

      await pool.query(`
        DELETE FROM posts
        WHERE
          id=$1
          AND user_id=$2
      `,[
        id,
        user.id
      ]);

      redirect(res,"/");
      return;
    }

    if (
      req.method === "GET" &&
      path === "/explore"
    ) {

      const q =
        (url.searchParams.get("q") || "")
          .trim();

      const r =
        q
          ? await pool.query(`
              SELECT
                p.*,
                u.name,
                u.email,
                u.avatar_url,

                (
                  SELECT COUNT(*)
                  FROM likes
                  WHERE post_id=p.id
                ) AS like_count,

                (
                  SELECT COUNT(*)
                  FROM comments
                  WHERE post_id=p.id
                ) AS comment_count

              FROM posts p

              JOIN users u
                ON u.id=p.user_id

              LEFT JOIN post_hashtags ph
                ON ph.post_id=p.id

              LEFT JOIN hashtags h
                ON h.id=ph.hashtag_id

              WHERE
                p.content ILIKE $1
                OR h.tag ILIKE $2

              ORDER BY p.created_at DESC
              LIMIT 80
            `,[
              `%${q}%`,
              `%${q.replace(/^#/,"")}%`
            ])
          : await pool.query(`
              SELECT
                p.*,
                u.name,
                u.email,
                u.avatar_url,

                (
                  SELECT COUNT(*)
                  FROM likes
                  WHERE post_id=p.id
                ) AS like_count,

                (
                  SELECT COUNT(*)
                  FROM comments
                  WHERE post_id=p.id
                ) AS comment_count

              FROM posts p

              JOIN users u
                ON u.id=p.user_id

              ORDER BY p.created_at DESC

              LIMIT 80
            `);

      sendHtml(
        res,
        200,
        "کاوش",
        `
          <div class="card">

            <form>

              <input
                name="q"
                value="${attr(q)}"
                placeholder="جستجوی کاربر، هشتگ یا پست"
              >

              <button class="full">
                🔎 جستجو
              </button>

            </form>

          </div>

          ${
            r.rows
              .map(p => postCard(p,user))
              .join("")
            ||
            `
              <div class="card empty">
                نتیجه‌ای پیدا نشد.
              </div>
            `
          }
        `,
        user
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/search"
    ) {

      redirect(
        res,
        `/explore${
          url.searchParams.toString()
            ? "?" +
              url.searchParams.toString()
            : ""
        }`
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/profile"
    ) {

      const id =
        Number(
          url.searchParams.get("id")
        ) || user.id;

      const r =
        await pool.query(`
          SELECT
            id,
            name,
            email,
            bio,
            avatar_url,
            website,
            is_private,
            created_at
          FROM users
          WHERE id=$1
        `,[id]);

      if (!r.rows.length) {

        sendHtml(
          res,
          404,
          "پروفایل",
          `
            <div class="card empty">
              کاربر پیدا نشد.
            </div>
          `,
          user
        );

        return;
      }

      const p =
        r.rows[0];

      const followers =
        await pool.query(`
          SELECT COUNT(*)
          FROM follows
          WHERE following_id=$1
        `,[id]);

      const following =
        await pool.query(`
          SELECT COUNT(*)
          FROM follows
          WHERE follower_id=$1
        `,[id]);

      const fl =
        await pool.query(`
          SELECT 1
          FROM follows
          WHERE
            follower_id=$1
            AND following_id=$2
        `,[
          user.id,
          id
        ]);

      const bl =
        await pool.query(`
          SELECT 1
          FROM blocked_users
          WHERE
            blocker_id=$1
            AND blocked_id=$2
        `,[
          user.id,
          id
        ]);

      const posts =
        await pool.query(`
          SELECT
            p.*,
            u.name,
            u.email,
            u.avatar_url,

            (
              SELECT COUNT(*)
              FROM likes
              WHERE post_id=p.id
            ) AS like_count,

            (
              SELECT COUNT(*)
              FROM comments
              WHERE post_id=p.id
            ) AS comment_count

          FROM posts p
          JOIN users u
            ON u.id=p.user_id

          WHERE p.user_id=$1

          ORDER BY p.created_at DESC

          LIMIT 100
        `,[id]);

      let actions = "";

      if (
        id === user.id
      ) {

        actions = `
          <a href="/settings">
            <button>
              ⚙️ ویرایش پروفایل
            </button>
          </a>

          <a href="/saved">
            <button>
              🔖 ذخیره‌ها
            </button>
          </a>
        `;

      } else {

        actions = `
          <a href="/follow?user=${id}">
            <button class="follow">
              ${
                fl.rows.length
                  ? "❌ لغو دنبال کردن"
                  : "➕ دنبال کردن"
              }
            </button>
          </a>

          <a href="/messages?user=${id}">
            <button>
              💬 پیام
            </button>
          </a>

          <a href="/block?user=${id}">
            <button class="danger">
              ${
                bl.rows.length
                  ? "🔓 رفع مسدودی"
                  : "🚫 مسدود کردن"
              }
            </button>
          </a>
        `;
      }

      sendHtml(
        res,
        200,
        "پروفایل",
        `
          <div class="card">

            <div
              style="
                display:flex;
                justify-content:center
              "
            >
              ${avatarHtml(p,true)}
            </div>

            <div
              style="
                text-align:center;
                margin:10px
              "
            >

              <div class="username">
                ${esc(p.name)}
              </div>

              ${
                p.email &&
                (!p.is_private ||
                  id === user.id)
                  ? `
                    <div class="email">
                      ${esc(p.email)}
                    </div>
                  `
                  : ""
              }

              ${
                p.bio
                  ? `
                    <div class="post-text">
                      ${esc(p.bio)}
                    </div>
                  `
                  : ""
              }

              ${
                p.website
                  ? `
                    <a
                      href="${attr(p.website)}"
                      rel="noreferrer"
                    >
                      🌐 ${esc(p.website)}
                    </a>
                  `
                  : ""
              }

            </div>

            <div class="stats">

              <span>
                👥
                ${followers.rows[0].count}
                دنبال‌کننده
              </span>

              <span>
                ➡️
                ${following.rows[0].count}
                دنبال‌شونده
              </span>

            </div>

            <div class="actions">
              ${actions}
            </div>

          </div>

          ${
            posts.rows
              .map(x => postCard(x,user))
              .join("")
            ||
            `
              <div class="card empty">
                هنوز پستی منتشر نشده است.
              </div>
            `
          }
        `,
        user
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/follow"
    ) {

      const id =
        Number(
          url.searchParams.get("user")
        );

      if (
        Number.isInteger(id) &&
        id !== user.id &&
        !await blocked(user.id,id)
      ) {

        const x =
          await pool.query(`
            SELECT id
            FROM follows
            WHERE
              follower_id=$1
              AND following_id=$2
          `,[
            user.id,
            id
          ]);

        if (x.rows.length) {

          await pool.query(`
            DELETE FROM follows
            WHERE
              follower_id=$1
              AND following_id=$2
          `,[
            user.id,
            id
          ]);

        } else {

          await pool.query(`
            INSERT INTO follows(
              follower_id,
              following_id
            )
            VALUES($1,$2)
            ON CONFLICT DO NOTHING
          `,[
            user.id,
            id
          ]);

          await notify(
            id,
            user.id,
            "follow",
            null,
            `${user.name} شما را دنبال کرد.`
          );
        }
      }

      redirect(
        res,
        `/profile?id=${id}`
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/block"
    ) {

      const id =
        Number(
          url.searchParams.get("user")
        );

      if (
        Number.isInteger(id) &&
        id !== user.id
      ) {

        const x =
          await pool.query(`
            SELECT id
            FROM blocked_users
            WHERE
              blocker_id=$1
              AND blocked_id=$2
          `,[
            user.id,
            id
          ]);

        if (x.rows.length) {

          await pool.query(`
            DELETE FROM blocked_users
            WHERE
              blocker_id=$1
              AND blocked_id=$2
          `,[
            user.id,
            id
          ]);

        } else {

          await pool.query(`
            INSERT INTO blocked_users(
              blocker_id,
              blocked_id
            )
            VALUES($1,$2)
            ON CONFLICT DO NOTHING
          `,[
            user.id,
            id
          ]);

          await pool.query(`
            DELETE FROM follows
            WHERE
              (
                follower_id=$1
                AND following_id=$2
              )
              OR
              (
                follower_id=$2
                AND following_id=$1
              )
          `,[
            user.id,
            id
          ]);
        }
      }

      redirect(
        res,
        `/profile?id=${id}`
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/saved"
    ) {

      const r =
        await pool.query(`
          SELECT
            p.*,
            u.name,
            u.email,
            u.avatar_url,

            (
              SELECT COUNT(*)
              FROM likes
              WHERE post_id=p.id
            ) AS like_count,

            (
              SELECT COUNT(*)
              FROM comments
              WHERE post_id=p.id
            ) AS comment_count

          FROM bookmarks b
          JOIN posts p
            ON p.id=b.post_id
          JOIN users u
            ON u.id=p.user_id

          WHERE b.user_id=$1

          ORDER BY b.created_at DESC
        `,[user.id]);

      sendHtml(
        res,
        200,
        "ذخیره‌ها",
        r.rows
          .map(p => postCard(p,user))
          .join("")
          ||
          `
            <div class="card empty">
              هنوز پستی ذخیره نکرده‌اید.
            </div>
          `,
        user
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/new-story"
    ) {

      sendHtml(
        res,
        200,
        "استوری جدید",
        `
          <div class="card">

            <form
              method="POST"
              action="/new-story"
              enctype="multipart/form-data"
            >

              <textarea
                name="caption"
                maxlength="1000"
                placeholder="متن استوری، اختیاری"
              ></textarea>

              <input
                type="file"
                name="media"
                accept="
                  image/jpeg,
                  image/png,
                  image/webp,
                  image/gif,
                  video/mp4,
                  video/webm
                "
                required
              >

              <button class="full">
                ⭕ انتشار استوری
              </button>

            </form>

          </div>
        `,
        user
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/new-story"
    ) {

      const f =
        await readMultipart(req);

      const media =
        f.files.media;

      if (
        !media ||
        !fileOk(media) ||
        media.buffer.length >
          8 * 1024 * 1024
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `
            <div class="card">
              <p class="error">
                فایل استوری معتبر نیست
                یا حجم آن زیاد است.
              </p>
            </div>
          `,
          user
        );

        return;
      }

      await pool.query(`
        INSERT INTO stories(
          user_id,
          media_url,
          media_type,
          caption
        )
        VALUES($1,$2,$3,$4)
      `,[
        user.id,
        imageDataUrl(media),
        media.mimeType.startsWith("video/")
          ? "video"
          : "image",
        String(
          f.fields.caption || ""
        ).trim()
      ]);

      redirect(res,"/");
      return;
    }

    if (
      req.method === "GET" &&
      path === "/stories"
    ) {

      const r =
        await pool.query(`
          SELECT
            s.*,
            u.name,
            u.avatar_url
          FROM stories s
          JOIN users u
            ON u.id=s.user_id

          WHERE s.expires_at>NOW()

          ORDER BY s.created_at DESC

          LIMIT 100
        `);

      sendHtml(
        res,
        200,
        "استوری‌ها",
        r.rows
          .map(s => `
            <div class="card">

              <div class="profile-head">
                ${avatarHtml(s)}

                <div>

                  <div class="username">
                    ${esc(s.name)}
                  </div>

                  <div class="small">
                    ${new Date(
                      s.created_at
                    ).toLocaleString("fa-IR")}
                  </div>

                </div>

              </div>

              ${
                s.media_type === "video"
                  ? `
                    <video
                      class="post-video"
                      controls
                      src="${attr(s.media_url)}"
                    ></video>
                  `
                  : `
                    <img
                      class="post-image"
                      src="${attr(s.media_url)}"
                    >
                  `
              }

              ${
                s.caption
                  ? `
                    <div class="post-text">
                      ${esc(s.caption)}
                    </div>
                  `
                  : ""
              }

            </div>
          `)
          .join("")
          ||
          `
            <div class="card empty">
              استوری فعالی نیست.
            </div>
          `,
        user
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/story"
    ) {

      const id =
        Number(
          url.searchParams.get("id")
        );

      const r =
        await pool.query(`
          SELECT
            s.*,
            u.name,
            u.avatar_url
          FROM stories s
          JOIN users u
            ON u.id=s.user_id
          WHERE
            s.id=$1
            AND s.expires_at>NOW()
        `,[id]);

      if (!r.rows.length) {

        sendHtml(
          res,
          404,
          "استوری",
          `
            <div class="card empty">
              استوری پیدا نشد.
            </div>
          `,
          user
        );

        return;
      }

      await pool.query(`
        INSERT INTO story_views(
          story_id,
          user_id
        )
        VALUES($1,$2)
        ON CONFLICT DO NOTHING
      `,[
        id,
        user.id
      ]);

      const s =
        r.rows[0];

      sendHtml(
        res,
        200,
        "استوری",
        `
          <div class="card">

            ${
              s.media_type === "video"
                ? `
                  <video
                    class="post-video"
                    controls
                    autoplay
                    src="${attr(s.media_url)}"
                  ></video>
                `
                : `
                  <img
                    class="post-image"
                    src="${attr(s.media_url)}"
                  >
                `
            }

            ${
              s.caption
                ? `
                  <div class="post-text">
                    ${esc(s.caption)}
                  </div>
                `
                : ""
            }

          </div>
        `,
        user
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/messages"
    ) {

      const id =
        Number(
          url.searchParams.get("user")
        );

      if (
        Number.isInteger(id) &&
        id !== user.id
      ) {

        redirect(
          res,
          `/chat?id=${id}`
        );

        return;
      }

      const r =
        await pool.query(`
          SELECT DISTINCT
            u.id,
            u.name,
            u.email,
            u.avatar_url

          FROM users u

          WHERE u.id IN(

            SELECT sender_id
            FROM messages
            WHERE receiver_id=$1

            UNION

            SELECT receiver_id
            FROM messages
            WHERE sender_id=$1

          )

          ORDER BY u.name
        `,[user.id]);

      sendHtml(
        res,
        200,
        "پیام‌ها",
        `
          <div class="card">

            <h2>
              💬 پیام‌ها
            </h2>

            <a href="/explore">
              <button>
                🔎 پیدا کردن کاربر
              </button>
            </a>

          </div>

          ${
            r.rows
              .map(x => `
                <div class="card">

                  <div class="profile-head">

                    ${avatarHtml(x)}

                    <div>

                      <div class="username">
                        ${esc(x.name)}
                      </div>

                      <div class="email">
                        ${esc(x.email)}
                      </div>

                    </div>

                  </div>

                  <a href="/chat?id=${x.id}">
                    <button class="full">
                      باز کردن گفتگو
                    </button>
                  </a>

                </div>
              `)
              .join("")
            ||
            `
              <div class="card empty">
                هنوز گفتگویی ندارید.
              </div>
            `
          }
        `,
        user
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/chat"
    ) {

      const id =
        Number(
          url.searchParams.get("id")
        );

      const r =
        await pool.query(`
          SELECT
            id,
            name,
            email,
            avatar_url
          FROM users
          WHERE id=$1
        `,[id]);

      if (!r.rows.length) {

        sendHtml(
          res,
          404,
          "گفتگو",
          `
            <div class="card empty">
              کاربر پیدا نشد.
            </div>
          `,
          user
        );

        return;
      }

      if (
        await blocked(
          user.id,
          id
        )
      ) {

        sendHtml(
          res,
          403,
          "محدود",
          `
            <div class="card empty">
              ارتباط با این کاربر مسدود است.
            </div>
          `,
          user
        );

        return;
      }

      await pool.query(`
        UPDATE messages
        SET is_read=TRUE
        WHERE
          sender_id=$1
          AND receiver_id=$2
      `,[
        id,
        user.id
      ]);

      const m =
        await pool.query(`
          SELECT
            m.*,
            u.name
          FROM messages m
          JOIN users u
            ON u.id=m.sender_id

          WHERE
            (
              m.sender_id=$1
              AND m.receiver_id=$2
            )
            OR
            (
              m.sender_id=$2
              AND m.receiver_id=$1
            )

          ORDER BY m.created_at ASC

          LIMIT 500
        `,[
          user.id,
          id
        ]);

      sendHtml(
        res,
        200,
        `گفتگو با ${r.rows[0].name}`,
        `
          <div class="card">

            <div class="profile-head">

              ${avatarHtml(r.rows[0])}

              <div>

                <div class="username">
                  ${esc(r.rows[0].name)}
                </div>

                <div class="small">
                  ${esc(r.rows[0].email)}
                </div>

              </div>

            </div>

            <div class="actions">

              <button
                onclick="startCall(${id},'audio')"
              >
                📞 تماس صوتی
              </button>

              <button
                onclick="startCall(${id},'video')"
              >
                📹 تماس تصویری
              </button>

            </div>

          </div>

          ${
            m.rows
              .map(x => `
                <div
                  class="
                    message-card
                    ${
                      Number(x.sender_id) ===
                      Number(user.id)
                        ? "message-me"
                        : "message-other"
                    }
                  "
                >

                  <b>
                    ${esc(x.name)}
                  </b>

                  <div class="post-text">
                    ${esc(x.message)}
                  </div>

                  <div class="small">
                    ${new Date(
                      x.created_at
                    ).toLocaleString("fa-IR")}
                  </div>

                </div>
              `)
              .join("")
            ||
            `
              <div class="card empty">
                هنوز پیامی نیست.
              </div>
            `
          }

          <div class="card">

            <form
              method="POST"
              action="/chat"
            >

              <input
                type="hidden"
                name="receiver_id"
                value="${id}"
              >

              <textarea
                name="message"
                maxlength="5000"
                required
                placeholder="پیام خود را بنویسید..."
              ></textarea>

              <button class="full">
                📤 ارسال
              </button>

            </form>

          </div>

          <div
            id="callbox"
            class="callbox"
          >

            <h2>
              تماس
            </h2>

            <video
              id="localVideo"
              autoplay
              muted
              playsinline
            ></video>

            <video
              id="remoteVideo"
              autoplay
              playsinline
            ></video>

            <button
              onclick="endCall()"
              class="danger"
            >
              پایان تماس
            </button>

          </div>

          <script>

          let currentStream = null;

          async function startCall(
            id,
            type
          ) {

            const box =
              document.getElementById(
                "callbox"
              );

            box.style.display =
              "block";

            try {

              currentStream =
                await navigator.mediaDevices
                  .getUserMedia({
                    audio:true,
                    video:
                      type === "video"
                  });

              document.getElementById(
                "localVideo"
              ).srcObject =
                currentStream;

            } catch (e) {

              alert(
                "دسترسی به میکروفون یا دوربین داده نشد."
              );
            }
          }

          function endCall() {

            if (currentStream) {

              currentStream
                .getTracks()
                .forEach(
                  track => track.stop()
                );

              currentStream = null;
            }

            document.getElementById(
              "callbox"
            ).style.display =
              "none";
          }

          </script>
        `,
        user
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/chat"
    ) {

      const d =
        await readBody(req);

      const id =
        Number(
          d.get("receiver_id")
        );

      const msg =
        (d.get("message") || "")
          .trim();

      if (
        Number.isInteger(id) &&
        msg &&
        !await blocked(
          user.id,
          id
        )
      ) {

        await pool.query(`
          INSERT INTO messages(
            sender_id,
            receiver_id,
            message
          )
          VALUES($1,$2,$3)
        `,[
          user.id,
          id,
          msg
        ]);

        await notify(
          id,
          user.id,
          "message",
          null,
          `${user.name} برای شما پیام فرستاد.`
        );
      }

      redirect(
        res,
        `/chat?id=${id}`
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/notifications"
    ) {

      const r =
        await pool.query(`
          SELECT
            n.*,
            u.name AS actor_name,
            u.avatar_url AS actor_avatar

          FROM notifications n

          LEFT JOIN users u
            ON u.id=n.actor_id

          WHERE n.user_id=$1

          ORDER BY n.created_at DESC

          LIMIT 100
        `,[user.id]);

      await pool.query(`
        UPDATE notifications
        SET is_read=TRUE
        WHERE user_id=$1
      `,[user.id]);

      sendHtml(
        res,
        200,
        "اعلان‌ها",
        r.rows
          .map(n => `
            <div class="card">

              <div class="profile-head">

                <div class="avatar">

                  ${
                    n.actor_avatar
                      ? `
                        <img
                          src="${attr(
                            n.actor_avatar
                          )}"
                        >
                      `
                      : "🔔"
                  }

                </div>

                <div>

                  <div class="username">
                    ${esc(
                      n.actor_name ||
                      "سیستم"
                    )}
                  </div>

                  <div class="small">
                    ${new Date(
                      n.created_at
                    ).toLocaleString("fa-IR")}
                  </div>

                </div>

              </div>

              <div class="post-text">
                ${esc(n.message)}
              </div>

            </div>
          `)
          .join("")
          ||
          `
            <div class="card empty">
              اعلانی ندارید.
            </div>
          `,
        user
      );

      return;
    }

    if (
      req.method === "GET" &&
      path === "/report"
    ) {

      const post =
        Number(
          url.searchParams.get("post")
        );

      const uid =
        Number(
          url.searchParams.get("user")
        );

      sendHtml(
        res,
        200,
        "گزارش",
        `
          <div class="card">

            <form
              method="POST"
              action="/report"
            >

              <input
                type="hidden"
                name="post_id"
                value="${
                  Number.isInteger(post)
                    ? post
                    : ""
                }"
              >

              <input
                type="hidden"
                name="reported_user_id"
                value="${
                  Number.isInteger(uid)
                    ? uid
                    : ""
                }"
              >

              <textarea
                name="reason"
                maxlength="1000"
                placeholder="دلیل گزارش..."
                required
              ></textarea>

              <button
                class="full danger"
              >
                🚩 ارسال گزارش
              </button>

            </form>

          </div>
        `,
        user
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/report"
    ) {

      const d =
        await readBody(req);

      const post =
        Number(
          d.get("post_id")
        );

      const uid =
        Number(
          d.get("reported_user_id")
        );

      const reason =
       
