const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const MAX_BODY = 8 * 1024 * 1024;
const MAX_IMAGE = 2 * 1024 * 1024;

if (!DATABASE_URL) {
  console.error("STARTUP ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  max: 10
});

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function parseCookies(req) {
  const cookies = {};

  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");

    if (i < 0) continue;

    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

function readRawBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", chunk => {
      size += chunk.length;

      if (size > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

async function readBody(req) {
  const raw = await readRawBody(req, 2 * 1024 * 1024);
  return new URLSearchParams(raw.toString("utf8"));
}

function parseContentDisposition(value) {
  const out = {};
  const text = String(value || "");

  const name = text.match(/name="([^"]*)"/i);
  const filename = text.match(/filename="([^"]*)"/i);

  if (name) out.name = name[1];
  if (filename) out.filename = filename[1];

  return out;
}

function parseMultipart(raw, contentType) {
  const match = String(contentType).match(
    /boundary=(?:"([^"]+)"|([^;]+))/i
  );

  if (!match) {
    throw new Error("Multipart boundary missing");
  }

  const boundary = Buffer.from(
    "--" + (match[1] || match[2])
  );

  const fields = {};
  const files = {};

  let pos = 0;

  while (true) {
    const start = raw.indexOf(boundary, pos);

    if (start < 0) break;

    const after = start + boundary.length;

    if (raw.slice(after, after + 2).toString() === "--") {
      break;
    }

    const headerStart = after + 2;

    const headerEnd = raw.indexOf(
      Buffer.from("\r\n\r\n"),
      headerStart
    );

    if (headerEnd < 0) break;

    const headers = raw
      .slice(headerStart, headerEnd)
      .toString("utf8");

    const bodyStart = headerEnd + 4;

    const nextBoundary = raw.indexOf(
      boundary,
      bodyStart
    );

    if (nextBoundary < 0) break;

    let bodyEnd = nextBoundary - 2;

    if (bodyEnd < bodyStart) {
      bodyEnd = bodyStart;
    }

    const body = raw.slice(bodyStart, bodyEnd);

    const dispositionHeader =
      (headers.match(
        /Content-Disposition:\s*([^\r\n]+)/i
      ) || [])[1];

    const typeHeader =
      (headers.match(
        /Content-Type:\s*([^\r\n]+)/i
      ) || [])[1] ||
      "application/octet-stream";

    const disp = parseContentDisposition(
      dispositionHeader
    );

    const type = typeHeader.trim();

    if (!disp.name) {
      pos = nextBoundary;
      continue;
    }

    if (disp.filename !== undefined) {
      files[disp.name] = {
        filename: disp.filename,
        mimeType: type,
        buffer: body
      };
    } else {
      fields[disp.name] = body.toString("utf8");
    }

    pos = nextBoundary;
  }

  return {
    fields,
    files
  };
}

async function readMultipart(req) {
  const raw = await readRawBody(req, MAX_BODY);

  return parseMultipart(
    raw,
    req.headers["content-type"] || ""
  );
}

function imageToDataUrl(file) {
  return (
    `data:${file.mimeType};base64,` +
    file.buffer.toString("base64")
  );
}

function validImage(file) {
  return (
    file &&
    file.buffer &&
    file.buffer.length > 0 &&
    file.buffer.length <= MAX_IMAGE &&
    [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ].includes(file.mimeType)
  );
}

function redirect(res, location, cookie) {
  const headers = {
    Location: location
  };

  if (cookie) {
    headers["Set-Cookie"] = cookie;
  }

  res.writeHead(302, headers);
  res.end();
}

function page(title, content, user = null) {
  const nav = user
    ? `
    <nav class="bottom-nav">
      <a href="/">
        <span>🏠</span>
        خانه
      </a>

      <a href="/search">
        <span>🔎</span>
        جستجو
      </a>

      <a href="/new-post">
        <span>➕</span>
        پست
      </a>

      <a href="/messages">
        <span>💬</span>
        پیام
      </a>

      <a href="/profile">
        <span>👤</span>
        پروفایل
      </a>
    </nav>
  `
    : "";

  const top = user
    ? `
    <div class="top-actions">
      <a href="/notifications">🔔 اعلان‌ها</a>
      <a href="/jobs">💼 کاریابی</a>
      <a href="/calls">📞 تماس‌ها</a>
      <a href="/settings">⚙️ تنظیمات</a>
      <a href="/logout">🚪 خروج</a>
    </div>
  `
    : "";

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<meta
  name="theme-color"
  content="#4f46e5"
>

<title>${escapeHtml(title)}</title>

<style>

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: #eef2ff;
  color: #172033;
  font-family: Tahoma, Arial, sans-serif;
}

.app {
  max-width: 760px;
  min-height: 100vh;
  margin: auto;
  background: #fff;
  padding-bottom: ${user ? "92px" : "25px"};
}

.header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 13px 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.logo {
  font-size: 18px;
  font-weight: 900;
  color: #4f46e5;
}

.title {
  font-weight: 800;
}

.content {
  padding: 14px;
}

.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 15px;
  margin-bottom: 14px;
  box-shadow: 0 5px 18px rgba(15,23,42,.05);
}

.profile-head {
  display: flex;
  align-items: center;
  gap: 11px;
}

.avatar {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: linear-gradient(135deg,#4f46e5,#7c3aed);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 900;
  overflow: hidden;
  flex: none;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar.large {
  width: 104px;
  height: 104px;
  font-size: 42px;
}

.profile-center {
  text-align: center;
}

.username {
  font-weight: 900;
  font-size: 16px;
}

.email {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
  direction: ltr;
  text-align: right;
}

.small {
  font-size: 12px;
  color: #6b7280;
}

.post-text {
  margin: 15px 0;
  line-height: 1.95;
  white-space: pre-wrap;
  word-break: break-word;
}

.stats {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  color: #667085;
  font-size: 13px;
}

.actions {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.actions form {
  margin: 0;
}

button,
.btn {
  border: 0;
  border-radius: 12px;
  padding: 11px 14px;
  background: #4f46e5;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  text-decoration: none;
  display: inline-block;
}

button:hover,
.btn:hover {
  filter: brightness(.96);
}

button.secondary {
  background: #eef2ff;
  color: #3730a3;
}

.danger {
  background: #b91c1c !important;
}

.green {
  background: #15803d !important;
}

.like {
  background: #e11d48 !important;
}

.follow {
  background: #2563eb !important;
}

.full {
  width: 100%;
  text-align: center;
  margin-top: 7px;
}

input,
textarea,
select {
  width: 100%;
  padding: 12px;
  margin: 7px 0;
  border: 1px solid #cfd5df;
  border-radius: 12px;
  font: inherit;
  background: #fff;
  color: #172033;
}

textarea {
  min-height: 125px;
  resize: vertical;
}

label {
  font-weight: 700;
  font-size: 13px;
  display: block;
  margin-top: 8px;
}

a {
  text-decoration: none;
  color: inherit;
}

.top-actions {
  display: flex;
  gap: 7px;
  overflow: auto;
  padding: 0 14px 12px;
}

.top-actions a {
  background: #f1f5f9;
  border-radius: 11px;
  padding: 8px 10px;
  white-space: nowrap;
  font-size: 12px;
}

.menu {
  display: grid;
  gap: 9px;
}

.empty {
  text-align: center;
  color: #6b7280;
  padding: 30px 10px;
}

.success {
  color: #15803d;
}

.error {
  color: #b91c1c;
}

.notice {
  padding: 10px;
  border-radius: 12px;
  background: #fff7ed;
  color: #9a3412;
  margin: 10px 0;
}

.divider {
  height: 1px;
  background: #e5e7eb;
  margin: 18px 0;
}

.comment {
  background: #f8fafc;
  border-radius: 13px;
  padding: 11px;
  margin-top: 8px;
}

.comment-name {
  font-weight: 800;
}

.comment-text {
  margin-top: 5px;
  white-space: pre-wrap;
}

.job {
  border: 1px solid #e5e7eb;
  border-radius: 15px;
  padding: 14px;
  margin-bottom: 11px;
}

.job-title {
  font-size: 18px;
  font-weight: 900;
}

.job-city,
.job-salary {
  margin-top: 7px;
}

.job-salary {
  color: #15803d;
}

.job-description {
  margin-top: 11px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.post-image {
  width: 100%;
  max-height: 520px;
  object-fit: contain;
  background: #f8fafc;
  border-radius: 15px;
  margin-top: 10px;
}

.badge {
  display: inline-block;
  background: #eef2ff;
  color: #4338ca;
  border-radius: 20px;
  padding: 5px 9px;
  font-size: 11px;
}

.message-card {
  padding: 11px 13px;
  border-radius: 15px;
  margin: 8px 0;
  max-width: 88%;
  box-shadow: 0 2px 8px rgba(0,0,0,.04);
}

.message-me {
  margin-right: auto;
  background: #eef2ff;
}

.message-other {
  margin-left: auto;
  background: #f8fafc;
}

.message-author {
  font-weight: 800;
  font-size: 12px;
  margin-bottom: 5px;
}

.call-box {
  background: #111827;
  color: #fff;
  border-radius: 18px;
  padding: 16px;
}

.video {
  width: 100%;
  border-radius: 14px;
  background: #000;
  max-height: 55vh;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 760px;
  height: 68px;
  background: #fff;
  border-top: 1px solid #ddd;
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 50;
  box-shadow: 0 -4px 18px rgba(0,0,0,.08);
}

.bottom-nav a {
  text-align: center;
  font-size: 11px;
  color: #475569;
  min-width: 58px;
}

.bottom-nav span {
  display: block;
  font-size: 21px;
  margin-bottom: 2px;
}

.hero {
  padding: 10px 0 14px;
}

.hero h1 {
  margin: 5px 0 8px;
  font-size: 24px;
}

.hero p {
  line-height: 1.9;
  color: #667085;
}

@media(max-width:480px) {

  .content {
    padding: 10px;
  }

  .card {
    border-radius: 15px;
  }

  .actions button {
    padding: 10px 11px;
  }

}

body.dark {
  background: #0b1020;
  color: #f8fafc;
}

body.dark .app,
body.dark .header,
body.dark .bottom-nav {
  background: #111827;
  color: #f8fafc;
}

body.dark .card {
  background: #172033;
  border-color: #2d3748;
}

body.dark input,
body.dark textarea,
body.dark select {
  background: #111827;
  color: #f8fafc;
  border-color: #374151;
}

body.dark .top-actions a {
  background: #1f2937;
  color: #f8fafc;
}

body.dark .comment,
body.dark .job,
body.dark .message-other {
  background: #1f2937;
  border-color: #374151;
}

body.dark .message-me {
  background: #312e81;
}

body.dark .small,
body.dark .email {
  color: #9ca3af;
}

</style>

</head>

<body>

<div class="app">

<header class="header">
  <div class="logo">
    MySocial
  </div>

  <div class="title">
    ${escapeHtml(title)}
  </div>
</header>

${top}

<main class="content">
${content}
</main>

</div>

${nav}

<script>

(function(){

  if (
    localStorage.getItem("mysocial-dark") === "1"
  ) {
    document.body.classList.add("dark");
  }

  window.toggleTheme = function(){

    document.body.classList.toggle("dark");

    localStorage.setItem(
      "mysocial-dark",
      document.body.classList.contains("dark")
        ? "1"
        : "0"
    );

  };

})();

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
  if (res.headersSent) return;

  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(
    page(
      title,
      content,
      user
    )
  );
}

async function ensureColumn(
  table,
  column,
  definition
) {
  if (
    !/^[a-z_][a-z0-9_]*$/i.test(table) ||
    !/^[a-z_][a-z0-9_]*$/i.test(column)
  ) {
    throw new Error(
      "Invalid schema identifier"
    );
  }

  await pool.query(
    `ALTER TABLE ${table}
     ADD COLUMN IF NOT EXISTS ${column}
     ${definition}`
  );
}

async function createTables() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT,
      avatar_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn(
    "users",
    "bio",
    "TEXT"
  );

  await ensureColumn(
    "users",
    "avatar_url",
    "TEXT"
  );

  await ensureColumn(
    "users",
    "created_at",
    "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions(
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts(
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      image_url TEXT,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn(
    "posts",
    "content",
    "TEXT"
  );

  await ensureColumn(
    "posts",
    "image_url",
    "TEXT"
  );

  await ensureColumn(
    "posts",
    "created_at",
    "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
  );

  try {

    await pool.query(`
      UPDATE posts
      SET content=text
      WHERE
        (content IS NULL OR content='')
        AND EXISTS(
          SELECT 1
          FROM information_schema.columns
          WHERE table_name='posts'
          AND column_name='text'
        )
    `);

  } catch (e) {}

  await pool.query(`
    UPDATE posts
    SET content=''
    WHERE content IS NULL
  `);

  await pool.query(`
    ALTER TABLE posts
    ALTER COLUMN content
    SET NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes(
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments(
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      user_id INTEGER NOT NULL
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
      follower_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      following_id INTEGER NOT NULL
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
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      user_id INTEGER NOT NULL
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
      blocker_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blocker_id,blocked_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports(
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL
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
    CREATE TABLE IF NOT EXISTS notifications(
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
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

  await ensureColumn(
    "notifications",
    "message",
    "TEXT"
  );

  await ensureColumn(
    "notifications",
    "is_read",
    "BOOLEAN DEFAULT FALSE"
  );

  await pool.query(`
    UPDATE notifications
    SET message=''
    WHERE message IS NULL
  `);

  await pool.query(`
    UPDATE notifications
    SET is_read=FALSE
    WHERE is_read IS NULL
  `);

  await pool.query(`
    ALTER TABLE notifications
    ALTER COLUMN message
    SET NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages(
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMP
    )
  `);

  await ensureColumn(
    "messages",
    "read_at",
    "TIMESTAMP"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs(
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
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
    CREATE TABLE IF NOT EXISTS call_signals(
      id SERIAL PRIMARY KEY,
      caller_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      call_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
      consumed BOOLEAN DEFAULT FALSE
    )
  `);

  await ensureColumn(
    "call_signals",
    "consumed",
    "BOOLEAN DEFAULT FALSE"
  );

  try {

    await pool.query(`
      DO $$
      BEGIN

        IF EXISTS(
          SELECT 1
          FROM information_schema.tables
          WHERE table_name='saved_posts'
        ) THEN

          INSERT INTO bookmarks(
            user_id,
            post_id
          )
          SELECT
            user_id,
            post_id
          FROM saved_posts
          ON CONFLICT DO NOTHING;

        END IF;

        IF EXISTS(
          SELECT 1
          FROM information_schema.tables
          WHERE table_name='blocks'
        ) THEN

          INSERT INTO blocked_users(
            blocker_id,
            blocked_id
          )
          SELECT
            blocker_id,
            blocked_id
          FROM blocks
          ON CONFLICT DO NOTHING;

        END IF;

      END
      $$
    `);

  } catch (e) {}

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
    idx_notifications_user
    ON notifications(
      user_id,
      created_at DESC
    )
  `);

  console.log(
    "Database tables checked and repaired successfully."
  );
}

async function createSession(userId) {

  const id =
    crypto
      .randomBytes(32)
      .toString("hex");

  await pool.query(
    `
      INSERT INTO sessions(
        session_id,
        user_id
      )
      VALUES($1,$2)
    `,
    [
      id,
      userId
    ]
  );

  return id;
}

async function getSession(req) {

  const sid =
    parseCookies(req).sessionId;

  if (!sid) return null;

  const r =
    await pool.query(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.bio,
          u.avatar_url
        FROM sessions s
        JOIN users u
          ON u.id=s.user_id
        WHERE s.session_id=$1
      `,
      [sid]
    );

  return r.rows[0] || null;
}

async function notify(
  userId,
  actorId,
  type,
  postId,
  message
) {

  if (
    !userId ||
    Number(userId) === Number(actorId)
  ) {
    return;
  }

  await pool.query(
    `
      INSERT INTO notifications(
        user_id,
        actor_id,
        type,
        post_id,
        message
      )
      VALUES($1,$2,$3,$4,$5)
    `,
    [
      userId,
      actorId,
      type,
      postId || null,
      message
    ]
  );
}

async function areBlocked(a,b) {

  if (
    !a ||
    !b ||
    Number(a) === Number(b)
  ) {
    return false;
  }

  const r =
    await pool.query(
      `
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
      `,
      [
        a,
        b
      ]
    );

  return r.rows.length > 0;
}

function avatarHtml(
  profile,
  large = false
) {

  const cls =
    large
      ? "avatar large"
      : "avatar";

  return `
    <div class="${cls}">
      ${
        profile &&
        profile.avatar_url
          ? `
            <img
              src="${escapeAttr(profile.avatar_url)}"
              alt="پروفایل"
            >
          `
          : escapeHtml(
              String(
                profile?.name || "?"
              )
              .charAt(0)
              .toUpperCase()
            )
      }
    </div>
  `;
}

function postCard(
  p,
  user,
  showOwner = true
) {

  const own =
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
              ${escapeHtml(p.name)}
            </div>
          </a>

          <div class="email">
            ${escapeHtml(p.email || "")}
          </div>

          <div class="small">
            ${new Date(
              p.created_at
            ).toLocaleString("fa-IR")}
          </div>

        </div>

      </div>

      <div class="post-text">
        ${escapeHtml(p.content)}
      </div>

      ${
        p.image_url
          ? `
            <img
              class="post-image"
              src="${escapeAttr(p.image_url)}"
              alt="تصویر پست"
            >
          `
          : ""
      }

      <div class="stats">

        <span>
          ❤️ ${p.like_count ?? 0}
        </span>

        <span>
          💬 ${p.comment_count ?? 0}
        </span>

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

        <a href="/bookmark?post=${p.id}">
          <button>
            ${
              p.bookmarked
                ? "🔖 حذف ذخیره"
                : "🔖 ذخیره"
            }
          </button>
        </a>

        <a href="/post?id=${p.id}">
          <button>
            💬 نظرها
          </button>
        </a>

        ${
          own && showOwner
            ? `
              <a href="/edit-post?id=${p.id}">
                <button>
                  ✏️ ویرایش
                </button>
              </a>

              <a href="/delete-post?id=${p.id}">
                <button class="danger">
                  🗑️ حذف
                </button>
              </a>
            `
            : `
              <a href="/report?post=${p.id}">
                <button class="secondary">
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

        const requestUrl =
          new URL(
            req.url,
            "http://localhost"
          );

        const path =
          requestUrl.pathname;

        const user =
          await getSession(req);

        /* =====================================================
           HOME
        ===================================================== */

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
                <div class="hero">

                  <h1>
                    MySocial 👋
                  </h1>

                  <p>
                    یک شبکه اجتماعی ساده برای
                    پست، پیام، دنبال‌کردن،
                    اعلان و کاریابی.
                  </p>

                </div>

                <div class="card menu">

                  <a href="/signup">
                    <button class="full">
                      📝 ثبت‌نام
                    </button>
                  </a>

                  <a href="/login">
                    <button class="full">
                      🔐 ورود
                    </button>
                  </a>

                </div>
              `
            );

            return;
          }

          const posts =
            await pool.query(
              `
                SELECT
                  p.id,
                  p.user_id,
                  p.content,
                  p.image_url,
                  p.created_at,
                  u.name,
                  u.email,
                  u.avatar_url,

                  (
                    SELECT COUNT(*)
                    FROM likes l
                    WHERE l.post_id=p.id
                  ) like_count,

                  (
                    SELECT COUNT(*)
                    FROM comments c
                    WHERE c.post_id=p.id
                  ) comment_count,

                  EXISTS(
                    SELECT 1
                    FROM likes l2
                    WHERE
                      l2.post_id=p.id
                      AND l2.user_id=$1
                  ) liked,

                  EXISTS(
                    SELECT 1
                    FROM bookmarks b
                    WHERE
                      b.post_id=p.id
                      AND b.user_id=$1
                  ) bookmarked

                FROM posts p

                JOIN users u
                  ON u.id=p.user_id

                WHERE NOT EXISTS(
                  SELECT 1
                  FROM blocked_users b
                  WHERE
                    (
                      b.blocker_id=$1
                      AND b.blocked_id=u.id
                    )
                    OR
                    (
                      b.blocker_id=u.id
                      AND b.blocked_id=$1
                    )
                )

                ORDER BY p.created_at DESC
                LIMIT 100
              `,
              [user.id]
            );

          let html = `
            <div class="card">

              <div class="profile-head">

                ${avatarHtml(user)}

                <div>

                  <div class="username">
                    خوش آمدی
                    ${escapeHtml(user.name)}
                    👋
                  </div>

                  <div class="email">
                    ${escapeHtml(user.email)}
                  </div>

                </div>

              </div>

            </div>

            <a href="/new-post">
              <button class="full">
                ➕ انتشار پست جدید
              </button>
            </a>

            <div class="divider"></div>
          `;

          html +=
            posts.rows.length
              ? posts.rows
                  .map(
                    p =>
                      postCard(
                        p,
                        user
                      )
                  )
                  .join("")
              : `
                <div class="card empty">
                  هنوز پستی منتشر نشده است.
                  <br>
                  اولین پست را منتشر کن! 📸
                </div>
              `;

          sendHtml(
            res,
            200,
            "خانه",
            html,
            user
          );

          return;
        }

        /* =====================================================
           SIGNUP
        ===================================================== */

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
                    📝 ثبت‌نام
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
            String(
              d.get("name") || ""
            ).trim();

          const email =
            String(
              d.get("email") || ""
            )
            .trim()
            .toLowerCase();

          const password =
            String(
              d.get("password") || ""
            );

          if (
            !name ||
            !email ||
            password.length < 6
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

            await pool.query(
              `
                INSERT INTO users(
                  name,
                  email,
                  password
                )
                VALUES($1,$2,$3)
              `,
              [
                name,
                email,
                hashPassword(password)
              ]
            );

            sendHtml(
              res,
              200,
              "ثبت‌نام موفق",
              `
                <div class="card">

                  <h2 class="success">
                    ثبت‌نام با موفقیت انجام شد ✅
                  </h2>

                  <a href="/login">
                    <button class="full">
                      🔐 ورود
                    </button>
                  </a>

                </div>
              `
            );

          } catch (e) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    این ایمیل قبلاً ثبت شده است.
                  </p>

                  <a href="/signup">
                    بازگشت
                  </a>

                </div>
              `
            );

          }

          return;
        }

        /* =====================================================
           LOGIN
        ===================================================== */

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
                    🔐 ورود
                  </button>

                </form>

                <div class="divider"></div>

                <a href="/signup">
                  حساب ندارم، ثبت‌نام می‌کنم
                </a>

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
            String(
              d.get("email") || ""
            )
            .trim()
            .toLowerCase();

          const password =
            String(
              d.get("password") || ""
            );

          const r =
            await pool.query(
              `
                SELECT id
                FROM users
                WHERE
                  email=$1
                  AND password=$2
              `,
              [
                email,
                hashPassword(password)
              ]
            );

          if (!r.rows.length) {

            sendHtml(
              res,
              401,
              "ورود ناموفق",
              `
                <div class="card">

                  <p class="error">
                    ایمیل یا رمز عبور اشتباه است.
                  </p>

                  <a href="/login">
                    تلاش دوباره
                  </a>

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
            `sessionId=${encodeURIComponent(
              sid
            )}; HttpOnly; Path=/; SameSite=Lax${
              process.env.NODE_ENV === "production"
                ? "; Secure"
                : ""
            }`
          );

          return;
        }

        /* =====================================================
           AUTH CHECK
        ===================================================== */

        if (!user) {

          redirect(
            res,
            path === "/logout"
              ? "/"
              : "/login"
          );

          return;
        }

        /* =====================================================
           NEW POST
        ===================================================== */

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
                    placeholder="چه چیزی می‌خواهی منتشر کنی؟"
                    required
                  ></textarea>

                  <label>
                    🖼️ تصویر پست، اختیاری
                  </label>

                  <input
                    type="file"
                    name="image"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                  >

                  <div class="notice">
                    حداکثر حجم تصویر: ۲ مگابایت
                  </div>

                  <button class="full">
                    📸 انتشار
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
          let imageUrl = "";

          const contentType =
            req.headers["content-type"] || "";

          if (
            contentType.includes(
              "multipart/form-data"
            )
          ) {

            const form =
              await readMultipart(req);

            content =
              String(
                form.fields.content || ""
              ).trim();

            const image =
              form.files.image;

            if (
              image &&
              image.buffer &&
              image.buffer.length
            ) {

              if (!validImage(image)) {

                sendHtml(
                  res,
                  400,
                  "خطا",
                  `
                    <div class="card">
                      <p class="error">
                        تصویر نامعتبر است
                        یا بیشتر از ۲ مگابایت است.
                      </p>
                    </div>
                  `,
                  user
                );

                return;
              }

              imageUrl =
                imageToDataUrl(image);
            }

          } else {

            const d =
              await readBody(req);

            content =
              String(
                d.get("content") || ""
              ).trim();

            imageUrl =
              String(
                d.get("image_url") || ""
              ).trim();
          }

          if (!content) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">
                  <p class="error">
                    متن پست نمی‌تواند خالی باشد.
                  </p>
                </div>
              `,
              user
            );

            return;
          }

          await pool.query(
            `
              INSERT INTO posts(
                user_id,
                content,
                image_url
              )
              VALUES($1,$2,$3)
            `,
            [
              user.id,
              content,
              imageUrl || null
            ]
          );

          redirect(res, "/");

          return;
        }

        /* =====================================================
           LIKE
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/like"
        ) {

          const postId =
            Number(
              requestUrl.searchParams.get(
                "post"
              )
            );

          if (
            Number.isInteger(postId)
          ) {

            const r =
              await pool.query(
                `
                  SELECT
                    user_id,

                    EXISTS(
                      SELECT 1
                      FROM likes
                      WHERE
                        post_id=$1
                        AND user_id=$2
                    ) liked

                  FROM posts

                  WHERE id=$1
                `,
                [
                  postId,
                  user.id
                ]
              );

            if (
              r.rows.length &&
              !await areBlocked(
                user.id,
                r.rows[0].user_id
              )
            ) {

              if (
                r.rows[0].liked
              ) {

                await pool.query(
                  `
                    DELETE FROM likes
                    WHERE
                      post_id=$1
                      AND user_id=$2
                  `,
                  [
                    postId,
                    user.id
                  ]
                );

              } else {

                await pool.query(
                  `
                    INSERT INTO likes(
                      post_id,
                      user_id
                    )
                    VALUES($1,$2)
                    ON CONFLICT DO NOTHING
                  `,
                  [
                    postId,
                    user.id
                  ]
                );

                await notify(
                  r.rows[0].user_id,
                  user.id,
                  "like",
                  postId,
                  `${user.name} پست شما را پسندید.`
                );
              }
            }
          }

          redirect(
            res,
            requestUrl.searchParams.get(
              "from"
            ) === "post"
              ? `/post?id=${postId}`
              : "/"
          );

          return;
        }

        /* =====================================================
           BOOKMARK
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/bookmark"
        ) {

          const postId =
            Number(
              requestUrl.searchParams.get(
                "post"
              )
            );

          if (
            Number.isInteger(postId)
          ) {

            const r =
              await pool.query(
                `
                  SELECT id
                  FROM bookmarks
                  WHERE
                    post_id=$1
                    AND user_id=$2
                `,
                [
                  postId,
                  user.id
                ]
              );

            if (r.rows.length) {

              await pool.query(
                `
                  DELETE FROM bookmarks
                  WHERE
                    post_id=$1
                    AND user_id=$2
                `,
                [
                  postId,
                  user.id
                ]
              );

            } else {

              await pool.query(
                `
                  INSERT INTO bookmarks(
                    post_id,
                    user_id
                  )
                  VALUES($1,$2)
                  ON CONFLICT DO NOTHING
                `,
                [
                  postId,
                  user.id
                ]
              );
            }
          }

          redirect(
            res,
            requestUrl.searchParams.get(
              "from"
            ) === "saved"
              ? "/saved"
              : `/post?id=${postId}`
          );

          return;
        }

        /* =====================================================
           POST DETAIL
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/post"
        ) {

          const postId =
            Number(
              requestUrl.searchParams.get(
                "id"
              )
            );

          const pr =
            await pool.query(
              `
                SELECT
                  p.id,
                  p.user_id,
                  p.content,
                  p.image_url,
                  p.created_at,
                  u.name,
                  u.email,
                  u.avatar_url,

                  (
                    SELECT COUNT(*)
                    FROM likes
                    WHERE post_id=p.id
                  ) like_count,

                  EXISTS(
                    SELECT 1
                    FROM likes
                    WHERE
                      post_id=p.id
                      AND user_id=$1
                  ) liked,

                  EXISTS(
                    SELECT 1
                    FROM bookmarks
                    WHERE
                      post_id=p.id
                      AND user_id=$1
                  ) bookmarked

                FROM posts p

                JOIN users u
                  ON u.id=p.user_id

                WHERE p.id=$2
              `,
              [
                user.id,
                postId
              ]
            );

          if (!pr.rows.length) {

            sendHtml(
              res,
              404,
              "پست پیدا نشد",
              `
                <div class="card empty">
                  این پست وجود ندارد
                  یا حذف شده است.
                </div>
              `,
              user
            );

            return;
          }

          const p =
            pr.rows[0];

          if (
            await areBlocked(
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

          const cr =
            await pool.query(
              `
                SELECT
                  c.id,
                  c.comment,
                  c.created_at,
                  u.id user_id,
                  u.name,
                  u.avatar_url

                FROM comments c

                JOIN users u
                  ON u.id=c.user_id

                WHERE c.post_id=$1

                ORDER BY c.created_at ASC

                LIMIT 500
              `,
              [postId]
            );

          let html = `
            <article class="card">

              <div class="profile-head">

                <a href="/profile?id=${p.user_id}">
                  ${avatarHtml(p)}
                </a>

                <div>

                  <div class="username">
                    ${escapeHtml(p.name)}
                  </div>

                  <div class="email">
                    ${escapeHtml(p.email)}
                  </div>

                  <div class="small">
                    ${new Date(
                      p.created_at
                    ).toLocaleString("fa-IR")}
                  </div>

                </div>

              </div>

              <div class="post-text">
                ${escapeHtml(p.content)}
              </div>

              ${
                p.image_url
                  ? `
                    <img
                      class="post-image"
                      src="${escapeAttr(p.image_url)}"
                      alt="تصویر"
                    >
                  `
                  : ""
              }

              <div class="stats">
                <span>
                  ❤️ ${p.like_count}
                </span>

                <span>
                  💬 ${cr.rows.length}
                </span>
              </div>

              <div class="actions">

                <a
                  href="/like?post=${p.id}&from=post"
                >
                  <button class="like">
                    ${
                      p.liked
                        ? "💔 برداشتن لایک"
                        : "❤️ لایک"
                    }
                  </button>
                </a>

                <a
                  href="/bookmark?post=${p.id}&from=saved"
                >
                  <button>
                    ${
                      p.bookmarked
                        ? "🔖 حذف ذخیره"
                        : "🔖 ذخیره"
                    }
                  </button>
                </a>

                ${
                  Number(p.user_id) ===
                  Number(user.id)

                    ? `
                      <a href="/edit-post?id=${p.id}">
                        <button>
                          ✏️ ویرایش
                        </button>
                      </a>

                      <a href="/delete-post?id=${p.id}">
                        <button class="danger">
                          🗑️ حذف
                        </button>
                      </a>
                    `

                    : `
                      <a href="/report?post=${p.id}">
                        <button class="secondary">
                          🚩 گزارش
                        </button>
                      </a>
                    `
                }

              </div>

            </article>
          `;

          html += `
            <div class="card">

              <h3>
                💬 نظرات
              </h3>

              ${
                cr.rows.length

                  ? cr.rows
                      .map(
                        c => `
                          <div class="comment">

                            <div class="profile-head">

                              ${avatarHtml(c)}

                              <div>

                                <div class="comment-name">
                                  ${escapeHtml(c.name)}
                                </div>

                                <div class="small">
                                  ${new Date(
                                    c.created_at
                                  ).toLocaleString("fa-IR")}
                                </div>

                              </div>

                            </div>

                            <div class="comment-text">
                              ${escapeHtml(c.comment)}
                            </div>

                            ${
                              Number(c.user_id) ===
                              Number(user.id)

                                ? `
                                  <div class="actions">

                                    <a
                                      href="/delete-comment?id=${c.id}&post=${p.id}"
                                    >
                                      <button class="danger">
                                        حذف نظر
                                      </button>
                                    </a>

                                  </div>
                                `
                                : ""
                            }

                          </div>
                        `
                      )
                      .join("")

                  : `
                    <div class="empty">
                      هنوز نظری ثبت نشده است.
                    </div>
                  `
              }

              <div class="divider"></div>

              <form
                method="POST"
                action="/comment"
              >

                <input
                  type="hidden"
                  name="post_id"
                  value="${p.id}"
                >

                <textarea
                  name="comment"
                  maxlength="3000"
                  placeholder="نظر خود را بنویس..."
                  required
                ></textarea>

                <button class="full">
                  📤 ارسال نظر
                </button>

              </form>

            </div>
          `;

          sendHtml(
            res,
            200,
            "پست",
            html,
            user
          );

          return;
        }

        /* =====================================================
           COMMENT
        ===================================================== */

        if (
          req.method === "POST" &&
          path === "/comment"
        ) {

          const d =
            await readBody(req);

          const postId =
            Number(
              d.get("post_id")
            );

          const comment =
            String(
              d.get("comment") || ""
            ).trim();

          if (
            !Number.isInteger(postId) ||
            !comment
          ) {

            redirect(
              res,
              "/"
            );

            return;
          }

          const p =
            await pool.query(
              `
                SELECT user_id
                FROM posts
                WHERE id=$1
              `,
              [postId]
            );

          if (
            !p.rows.length ||
            await areBlocked(
              user.id,
              p.rows[0].user_id
            )
          ) {

            sendHtml(
              res,
              403,
              "محدود",
              `
                <div class="card">
                  <p class="error">
                    امکان ارسال نظر وجود ندارد.
                  </p>
                </div>
              `,
              user
            );

            return;
          }

          await pool.query(
            `
              INSERT INTO comments(
                post_id,
                user_id,
                comment
              )
              VALUES($1,$2,$3)
            `,
            [
              postId,
              user.id,
              comment
            ]
          );

          await notify(
            p.rows[0].user_id,
            user.id,
            "comment",
            postId,
            `${user.name} روی پست شما نظر داد.`
          );

          redirect(
            res,
            `/post?id=${postId}`
          );

          return;
        }

        /* =====================================================
           DELETE COMMENT
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/delete-comment"
        ) {

          const id =
            Number(
              requestUrl.searchParams.get(
                "id"
              )
            );

          const post =
            requestUrl.searchParams.get(
              "post"
            );

          if (
            Number.isInteger(id)
          ) {

            await pool.query(
              `
                DELETE FROM comments
                WHERE
                  id=$1
                  AND user_id=$2
              `,
              [
                id,
                user.id
              ]
            );
          }

          redirect(
            res,
            post
              ? `/post?id=${post}`
              : "/"
          );

          return;
        }

        /* =====================================================
           EDIT POST
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/edit-post"
        ) {

          const id =
            Number(
              requestUrl.searchParams.get(
                "id"
              )
            );

          const r =
            await pool.query(
              `
                SELECT
                  id,
                  content,
                  image_url
                FROM posts
                WHERE
                  id=$1
                  AND user_id=$2
              `,
              [
                id,
                user.id
              ]
            );

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
                    value="${p.id}"
                  >

                  <textarea
                    name="content"
                    maxlength="5000"
                    required
                  >${escapeHtml(p.content)}</textarea>

                  <input
                    name="image_url"
                    maxlength="5000000"
                    value="${escapeAttr(
                      p.image_url || ""
                    )}"
                    placeholder="لینک تصویر، اختیاری"
                  >

                  <button class="full">
                    💾 ذخیره تغییرات
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
            String(
              d.get("content") || ""
            ).trim();

          const imageUrl =
            String(
              d.get("image_url") || ""
            ).trim();

          if (
            Number.isInteger(id) &&
            content
          ) {

            await pool.query(
              `
                UPDATE posts
                SET
                  content=$1,
                  image_url=$2
                WHERE
                  id=$3
                  AND user_id=$4
              `,
              [
                content,
                imageUrl || null,
                id,
                user.id
              ]
            );
          }

          redirect(
            res,
            `/post?id=${id}`
          );

          return;
        }

        /* =====================================================
           DELETE POST
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/delete-post"
        ) {

          const id =
            Number(
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (
            Number.isInteger(id)
          ) {

            await pool.query(
              `
                DELETE FROM posts
                WHERE
                  id=$1
                  AND user_id=$2
              `,
              [
                id,
                user.id
              ]
            );
          }

          redirect(
            res,
            "/"
          );

          return;
        }

        /* =====================================================
           PROFILE
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/profile"
        ) {

          const profileId =
            Number(
              requestUrl.searchParams.get(
                "id"
              )
            ) || user.id;

          const r =
            await pool.query(
              `
                SELECT
                  id,
                  name,
                  email,
                  bio,
                  avatar_url,
                  created_at
                FROM users
                WHERE id=$1
              `,
              [profileId]
            );

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

          const f =
            await pool.query(
              `
                SELECT COUNT(*)
                FROM follows
                WHERE following_id=$1
              `,
              [profileId]
            );

          const g =
            await pool.query(
              `
                SELECT COUNT(*)
                FROM follows
                WHERE follower_id=$1
              `,
              [profileId]
            );

          const posts =
            await pool.query(
              `
                SELECT
                  p.id,
                  p.user_id,
                  p.content,
                  p.image_url,
                  p.created_at,
                  u.name,
                  u.email,
                  u.avatar_url,

                  (
                    SELECT COUNT(*)
                    FROM likes
                    WHERE post_id=p.id
                  ) like_count,

                  (
                    SELECT COUNT(*)
                    FROM comments
                    WHERE post_id=p.id
                  ) comment_count,

                  EXISTS(
                    SELECT 1
                    FROM likes
                    WHERE
                      post_id=p.id
                      AND user_id=$2
                  ) liked,

                  EXISTS(
                    SELECT 1
                    FROM bookmarks
                    WHERE
                      post_id=p.id
                      AND user_id=$2
                  ) bookmarked

                FROM posts p

                JOIN users u
                  ON u.id=p.user_id

                WHERE p.user_id=$1

                ORDER BY p.created_at DESC

                LIMIT 100
              `,
              [
                profileId,
                user.id
              ]
            );

          let actions = "";

          if (
            Number(profileId) ===
            Number(user.id)
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

            const fl =
              await pool.query(
                `
                  SELECT 1
                  FROM follows
                  WHERE
                    follower_id=$1
                    AND following_id=$2
                `,
                [
                  user.id,
                  profileId
                ]
              );

            const bl =
              await pool.query(
                `
                  SELECT 1
                  FROM blocked_users
                  WHERE
                    blocker_id=$1
                    AND blocked_id=$2
                `,
                [
                  user.id,
                  profileId
                ]
              );

            actions = `

              <a href="/follow?user=${profileId}">
                <button class="follow">
                  ${
                    fl.rows.length
                      ? "❌ لغو دنبال کردن"
                      : "➕ دنبال کردن"
                  }
                </button>
              </a>

              <a href="/messages?user=${profileId}">
                <button>
                  💬 پیام
                </button>
              </a>

              <a href="/call?user=${profileId}&mode=audio">
                <button>
                  📞 تماس صوتی
                </button>
              </a>

              <a href="/call?user=${profileId}&mode=video">
                <button>
                  📹 تماس تصویری
                </button>
              </a>

              <a href="/block?user=${profileId}">
                <button class="danger">
                  ${
                    bl.rows.length
                      ? "🔓 رفع مسدودی"
                      : "🚫 مسدود کردن"
                  }
                </button>
              </a>

              <a href="/report?user=${profileId}">
                <button class="secondary">
                  🚩 گزارش
                </button>
              </a>
            `;
          }

          let html = `
            <div class="card">

              <div class="profile-center">

                ${avatarHtml(p,true)}

                <div
                  class="username"
                  style="margin-top:10px"
                >
                  ${escapeHtml(p.name)}
                </div>

                <div class="email">
                  ${escapeHtml(p.email)}
                </div>

                ${
                  p.bio
                    ? `
                      <div class="post-text">
                        ${escapeHtml(p.bio)}
                      </div>
                    `
                    : ""
                }

                <div
                  class="stats"
                  style="justify-content:center"
                >

                  👥 دنبال‌کننده:
                  ${f.rows[0].count}

                  <span>
                    ➡️ دنبال‌شونده:
                    ${g.rows[0].count}
                  </span>

                </div>

                <div
                  class="actions"
                  style="justify-content:center"
                >
                  ${actions}
                </div>

              </div>

            </div>
          `;

          html +=
            posts.rows.length

              ? posts.rows
                  .map(
                    p =>
                      postCard(
                        p,
                        user,
                        false
                      )
                  )
                  .join("")

              : `
                <div class="card empty">
                  هنوز پستی منتشر نشده است.
                </div>
              `;

          sendHtml(
            res,
            200,
            "پروفایل",
            html,
            user
          );

          return;
        }

        /* =====================================================
           FOLLOW
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/follow"
        ) {

          const target =
            Number(
              requestUrl.searchParams.get(
                "user"
              ) ||
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (
            Number.isInteger(target) &&
            target !== user.id
          ) {

            const exists =
              await pool.query(
                `
                  SELECT 1
                  FROM follows
                  WHERE
                    follower_id=$1
                    AND following_id=$2
                `,
                [
                  user.id,
                  target
                ]
              );

            if (
              exists.rows.length
            ) {

              await pool.query(
                `
                  DELETE FROM follows
                  WHERE
                    follower_id=$1
                    AND following_id=$2
                `,
                [
                  user.id,
                  target
                ]
              );

            } else if (
              !await areBlocked(
                user.id,
                target
              )
            ) {

              await pool.query(
                `
                  INSERT INTO follows(
                    follower_id,
                    following_id
                  )
                  VALUES($1,$2)
                  ON CONFLICT DO NOTHING
                `,
                [
                  user.id,
                  target
                ]
              );

              await notify(
                target,
                user.id,
                "follow",
                null,
                `${user.name} شما را دنبال کرد.`
              );
            }
          }

          redirect(
            res,
            `/profile?id=${target}`
          );

          return;
        }

        /* =====================================================
           BLOCK
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/block"
        ) {

          const target =
            Number(
              requestUrl.searchParams.get(
                "user"
              ) ||
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (
            Number.isInteger(target) &&
            target !== user.id
          ) {

            const exists =
              await pool.query(
                `
                  SELECT 1
                  FROM blocked_users
                  WHERE
                    blocker_id=$1
                    AND blocked_id=$2
                `,
                [
                  user.id,
                  target
                ]
              );

            if (
              exists.rows.length
            ) {

              await pool.query(
                `
                  DELETE FROM blocked_users
                  WHERE
                    blocker_id=$1
                    AND blocked_id=$2
                `,
                [
                  user.id,
                  target
                ]
              );

            } else {

              await pool.query(
                `
                  INSERT INTO blocked_users(
                    blocker_id,
                    blocked_id
                  )
                  VALUES($1,$2)
                  ON CONFLICT DO NOTHING
                `,
                [
                  user.id,
                  target
                ]
              );

              await pool.query(
                `
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
                `,
                [
                  user.id,
                  target
                ]
              );
            }
          }

          redirect(
            res,
            `/profile?id=${target}`
          );

          return;
        }

        /* =====================================================
           SEARCH
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/search"
        ) {

          const q =
            String(
              requestUrl.searchParams.get(
                "q"
              ) || ""
            ).trim();

          let usersHtml = "";
          let jobsHtml = "";
          let postsHtml = "";

          if (q) {

            const ur =
              await pool.query(
                `
                  SELECT
                    id,
                    name,
                    email,
                    bio,
                    avatar_url
                  FROM users
                  WHERE
                    (
                      name ILIKE $1
                      OR email ILIKE $1
                    )
                    AND id<>$2
                  ORDER BY name
                  LIMIT 50
                `,
                [
                  `%${q}%`,
                  user.id
                ]
              );

            usersHtml =
              ur.rows
                .map(
                  x => `
                    <div class="card">

                      <div class="profile-head">

                        <a href="/profile?id=${x.id}">
                          ${avatarHtml(x)}
                        </a>

                        <div>

                          <div class="username">
                            ${escapeHtml(x.name)}
                          </div>

                          <div class="email">
                            ${escapeHtml(x.email)}
                          </div>

                          ${
                            x.bio
                              ? `
                                <div class="small">
                                  ${escapeHtml(x.bio)}
                                </div>
                              `
                              : ""
                          }

                        </div>

                      </div>

                      <div class="actions">

                        <a href="/profile?id=${x.id}">
                          <button>
                            👤 پروفایل
                          </button>
                        </a>

                        <a href="/messages?user=${x.id}">
                          <button>
                            💬 پیام
                          </button>
                        </a>

                        <a href="/call?user=${x.id}&mode=audio">
                          <button>
                            📞 تماس
                          </button>
                        </a>

                      </div>

                    </div>
                  `
                )
                .join("");

            const jr =
              await pool.query(
                `
                  SELECT
                    j.*,
                    u.name
                  FROM jobs j
                  JOIN users u
                    ON u.id=j.user_id

                  WHERE
                    j.title ILIKE $1
                    OR j.city ILIKE $1
                    OR j.description ILIKE $1

                  ORDER BY j.created_at DESC

                  LIMIT 50
                `,
                [
                  `%${q}%`
                ]
              );

            jobsHtml =
              jr.rows
                .map(
                  j => `
                    <div class="job">

                      <div class="job-title">
                        ${escapeHtml(j.title)}
                      </div>

                      <div class="job-city">
                        📍 ${escapeHtml(j.city)}
                      </div>

                      <div class="job-salary">
                        💰 ${escapeHtml(j.salary)}
                      </div>

                      <div class="job-description">
                        ${escapeHtml(j.description)}
                      </div>

                      <div class="small">
                        ثبت‌کننده:
                        ${escapeHtml(j.name)}
                      </div>

                    </div>
                  `
                )
                .join("");

            const pr =
              await pool.query(
                `
                  SELECT
                    p.id,
                    p.user_id,
                    p.content,
                    p.image_url,
                    p.created_at,
                    u.name,
                    u.email,
                    u.avatar_url,

                    (
                      SELECT COUNT(*)
                      FROM likes
                      WHERE post_id=p.id
                    ) like_count,

                    (
                      SELECT COUNT(*)
                      FROM comments
                      WHERE post_id=p.id
                    ) comment_count,

                    EXISTS(
                      SELECT 1
                      FROM likes
                      WHERE
                        post_id=p.id
                        AND user_id=$2
                    ) liked,

                    EXISTS(
                      SELECT 1
                      FROM bookmarks
                      WHERE
                        post_id=p.id
                        AND user_id=$2
                    ) bookmarked

                  FROM posts p

                  JOIN users u
                    ON u.id=p.user_id

                  WHERE
                    p.content ILIKE $1

                    AND NOT EXISTS(
                      SELECT 1
                      FROM blocked_users b
                      WHERE
                        (
                          b.blocker_id=$2
                          AND b.blocked_id=p.user_id
                        )
                        OR
                        (
                          b.blocker_id=p.user_id
                          AND b.blocked_id=$2
                        )
                    )

                  ORDER BY p.created_at DESC

                  LIMIT 50
                `,
                [
                  `%${q}%`,
                  user.id
                ]
              );

            postsHtml =
              pr.rows
                .map(
                  p =>
                    postCard(
                      p,
                      user,
                      false
                    )
                )
                .join("");
          }

          sendHtml(
            res,
            200,
            "جستجو",
            `
              <div class="card">

                <form
                  method="GET"
                  action="/search"
                >

                  <input
                    name="q"
                    value="${escapeAttr(q)}"
                    maxlength="255"
                    placeholder="نام کاربر، پست، شغل یا شهر..."
                  >

                  <button class="full">
                    🔎 جستجو
                  </button>

                </form>

              </div>

              <h3>
                👥 کاربران
              </h3>

              ${
                usersHtml ||
                `
                  <div class="card empty">
                    نتیجه‌ای پیدا نشد.
                  </div>
                `
              }

              <div class="divider"></div>

              <h3>
                📝 پست‌ها
              </h3>

              ${
                postsHtml ||
                `
                  <div class="card empty">
                    پست مرتبطی پیدا نشد.
                  </div>
                `
              }

              <div class="divider"></div>

              <h3>
                💼 آگهی‌های کاری
              </h3>

              ${
                jobsHtml ||
                `
                  <div class="card empty">
                    آگهی مرتبطی پیدا نشد.
                  </div>
                `
              }
            `,
            user
          );

          return;
        }

        /* =====================================================
           MESSAGES LIST
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/messages" &&
          requestUrl.searchParams.has("user")
        ) {

          const id =
            Number(
              requestUrl.searchParams.get(
                "user"
              )
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
        }

        if (
          req.method === "GET" &&
          path === "/messages"
        ) {

          const contacts =
            await pool.query(
              `
                SELECT
                  u.id,
                  u.name,
                  u.email,
                  u.avatar_url,

                  (
                    SELECT m.message
                    FROM messages m
                    WHERE
                      (
                        m.sender_id=$1
                        AND m.receiver_id=u.id
                      )
                      OR
                      (
                        m.sender_id=u.id
                        AND m.receiver_id=$1
                      )
                    ORDER BY
                      m.created_at DESC
                    LIMIT 1
                  ) last_message,

                  (
                    SELECT COUNT(*)
                    FROM messages m2
                    WHERE
                      m2.sender_id=u.id
                      AND m2.receiver_id=$1
                      AND m2.read_at IS NULL
                  ) unread

                FROM users u

                WHERE
                  u.id<>$1

                  AND EXISTS(
                    SELECT 1
                    FROM messages mx
                    WHERE
                      (
                        mx.sender_id=$1
                        AND mx.receiver_id=u.id
                      )
                      OR
                      (
                        mx.sender_id=u.id
                        AND mx.receiver_id=$1
                      )
                  )

                ORDER BY
                  unread DESC,
                  u.name
              `,
              [user.id]
            );

          let html = `
            <div class="card">

              <h2>
                💬 پیام‌ها
              </h2>

              <p class="small">
                گفتگوهای خود را انتخاب کنید.
              </p>

              <a href="/search">
                <button>
                  🔎 پیدا کردن کاربر
                </button>
              </a>

            </div>
          `;

          html +=
            contacts.rows.length

              ? contacts.rows
                  .map(
                    c => `
                      <div class="card">

                        <div class="profile-head">

                          <a href="/profile?id=${c.id}">
                            ${avatarHtml(c)}
                          </a>

                          <div>

                            <div class="username">

                              ${escapeHtml(c.name)}

                              ${
                                Number(c.unread) > 0
                                  ? `
                                    <span class="badge">
                                      ${c.unread} جدید
                                    </span>
                                  `
                                  : ""
                              }

                            </div>

                            <div class="email">
                              ${escapeHtml(c.email)}
                            </div>

                            <div class="small">
                              ${escapeHtml(
                                c.last_message || ""
                              )}
                            </div>

                          </div>

                        </div>

                        <div class="actions">

                          <a href="/chat?id=${c.id}">
                            <button>
                              💬 باز کردن گفتگو
                            </button>
                          </a>

                          <a href="/call?user=${c.id}&mode=audio">
                            <button>
                              📞 تماس
                            </button>
                          </a>

                        </div>

                      </div>
                    `
                  )
                  .join("")

              : `
                <div class="card empty">
                  هنوز گفتگویی ندارید.
                </div>
              `;

          sendHtml(
            res,
            200,
            "پیام‌ها",
            html,
            user
          );

          return;
        }

        /* =====================================================
           CHAT
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/chat"
        ) {

          const id =
            Number(
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (
            !Number.isInteger(id) ||
            id === user.id
          ) {

            redirect(
              res,
              "/messages"
            );

            return;
          }

          const other =
            await pool.query(
              `
                SELECT
                  id,
                  name,
                  email,
                  avatar_url
                FROM users
                WHERE id=$1
              `,
              [id]
            );

          if (!other.rows.length) {

            redirect(
              res,
              "/messages"
            );

            return;
          }

          if (
            await areBlocked(
              user.id,
              id
            )
          ) {

            sendHtml(
              res,
              403,
              "مسدود",
              `
                <div class="card">

                  <p class="error">
                    امکان گفتگو با این کاربر وجود ندارد.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          await pool.query(
            `
              UPDATE messages
              SET read_at=CURRENT_TIMESTAMP
              WHERE
                sender_id=$1
                AND receiver_id=$2
                AND read_at IS NULL
            `,
            [
              id,
              user.id
            ]
          );

          const m =
            await pool.query(
              `
                SELECT
                  m.id,
                  m.sender_id,
                  m.message,
                  m.created_at,
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
              `,
              [
                user.id,
                id
              ]
            );

          let html = `
            <div class="card">

              <div class="profile-head">

                <a href="/profile?id=${id}">
                  ${avatarHtml(
                    other.rows[0]
                  )}
                </a>

                <div>

                  <h2 style="margin:0">
                    💬
                    ${escapeHtml(
                      other.rows[0].name
                    )}
                  </h2>

                  <div class="small">
                    ${escapeHtml(
                      other.rows[0].email
                    )}
                  </div>

                </div>

              </div>

              <div class="actions">

                <a href="/call?user=${id}&mode=audio">
                  <button>
                    📞 تماس صوتی
                  </button>
                </a>

                <a href="/call?user=${id}&mode=video">
                  <button>
                    📹 تماس تصویری
                  </button>
                </a>

              </div>

            </div>
          `;

          html +=
            m.rows
              .map(
                x => `
                  <div
                    class="message-card ${
                      Number(x.sender_id) ===
                      Number(user.id)
                        ? "message-me"
                        : "message-other"
                    }"
                  >

                    <div class="message-author">
                      ${escapeHtml(x.name)}
                    </div>

                    <div class="post-text">
                      ${escapeHtml(x.message)}
                    </div>

                    <div class="small">
                      ${new Date(
                        x.created_at
                      ).toLocaleString("fa-IR")}
                    </div>

                  </div>
                `
              )
              .join("") ||
            `
              <div class="card empty">
                هنوز پیامی وجود ندارد.
              </div>
            `;

          html += `
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
                  placeholder="پیام خود را بنویس..."
                  required
                ></textarea>

                <button class="full">
                  📤 ارسال پیام
                </button>

              </form>

            </div>
          `;

          sendHtml(
            res,
            200,
            "گفتگو",
            html,
            user
          );

          return;
        }

        /* =====================================================
           SEND MESSAGE
        ===================================================== */

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

          const message =
            String(
              d.get("message") || ""
            ).trim();

          if (
            Number.isInteger(id) &&
            id !== user.id &&
            message
          ) {

            const r =
              await pool.query(
                `
                  SELECT id
                  FROM users
                  WHERE id=$1
                `,
                [id]
              );

            if (
              r.rows.length &&
              !await areBlocked(
                user.id,
                id
              )
            ) {

              await pool.query(
                `
                  INSERT INTO messages(
                    sender_id,
                    receiver_id,
                    message
                  )
                  VALUES($1,$2,$3)
                `,
                [
                  user.id,
                  id,
                  message
                ]
              );

              await notify(
                id,
                user.id,
                "message",
                null,
                `${user.name} برای شما پیام فرستاد.`
              );
            }
          }

          redirect(
            res,
            `/chat?id=${id}`
          );

          return;
        }

        /* =====================================================
           NOTIFICATIONS
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/notifications"
        ) {

          const n =
            await pool.query(
              `
                SELECT
                  n.id,
                  n.type,
                  n.message,
                  n.is_read,
                  n.created_at,
                  u.id actor_id,
                  u.name actor_name,
                  u.avatar_url actor_avatar

                FROM notifications n

                LEFT JOIN users u
                  ON u.id=n.actor_id

                WHERE n.user_id=$1

                ORDER BY
                  n.created_at DESC

                LIMIT 100
              `,
              [user.id]
            );

          await pool.query(
            `
              UPDATE notifications
              SET is_read=TRUE
              WHERE user_id=$1
            `,
            [user.id]
          );

          let html = `
            <div class="card">

              <h2>
                🔔 اعلان‌ها
              </h2>

            </div>
          `;

          html +=
            n.rows.length

              ? n.rows
                  .map(
                    x => `
                      <div class="card">

                        <div class="profile-head">

                          ${
                            x.actor_avatar
                              ? `
                                <div class="avatar">
                                  <img
                                    src="${escapeAttr(
                                      x.actor_avatar
                                    )}"
                                    alt="پروفایل"
                                  >
                                </div>
                              `
                              : `
                                <div class="avatar">
                                  🔔
                                </div>
                              `
                          }

                          <div>

                            <div class="username">
                              ${escapeHtml(
                                x.actor_name ||
                                "سیستم"
                              )}
                            </div>

                            <div class="small">
                              ${new Date(
                                x.created_at
                              ).toLocaleString("fa-IR")}
                            </div>

                          </div>

                        </div>

                        <div class="post-text">
                          ${escapeHtml(x.message)}
                        </div>

                      </div>
                    `
                  )
                  .join("")

              : `
                <div class="card empty">
                  اعلان جدیدی ندارید.
                </div>
              `;

          sendHtml(
            res,
            200,
            "اعلان‌ها",
            html,
            user
          );

          return;
        }

        /* =====================================================
           SAVED
        ===================================================== */

        if (
          req.method === "GET" &&
          (
            path === "/saved" ||
            path === "/bookmarks"
          )
        ) {

          const r =
            await pool.query(
              `
                SELECT
                  p.id,
                  p.user_id,
                  p.content,
                  p.image_url,
                  p.created_at,
                  u.name,
                  u.email,
                  u.avatar_url,

                  (
                    SELECT COUNT(*)
                    FROM likes
                    WHERE post_id=p.id
                  ) like_count,

                  (
                    SELECT COUNT(*)
                    FROM comments
                    WHERE post_id=p.id
                  ) comment_count,

                  EXISTS(
                    SELECT 1
                    FROM likes
                    WHERE
                      post_id=p.id
                      AND user_id=$1
                  ) liked,

                  TRUE bookmarked

                FROM bookmarks b

                JOIN posts p
                  ON p.id=b.post_id

                JOIN users u
                  ON u.id=p.user_id

                WHERE b.user_id=$1

                ORDER BY
                  b.created_at DESC

                LIMIT 100
              `,
              [user.id]
            );

          sendHtml(
            res,
            200,
            "ذخیره‌ها",
            r.rows.length
              ? r.rows
                  .map(
                    p =>
                      postCard(
                        p,
                        user,
                        false
                      )
                  )
                  .join("")
              : `
                <div class="card empty">
                  هنوز پستی ذخیره نکرده‌اید.
                </div>
              `,
            user
          );

          return;
        }

        /* =====================================================
           REPORT GET
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/report"
        ) {

          const postId =
            Number(
              requestUrl.searchParams.get(
                "post"
              )
            );

          const reported =
            Number(
              requestUrl.searchParams.get(
                "user"
              )
            );

          if (
            !Number.isInteger(postId) &&
            !Number.isInteger(reported)
          ) {

            redirect(
              res,
              "/"
            );

            return;
          }

          sendHtml(
            res,
            200,
            "گزارش",
            `
              <div class="card">

                <h2>
                  🚩 گزارش
                </h2>

                <form
                  method="POST"
                  action="/report"
                >

                  <input
                    type="hidden"
                    name="post_id"
                    value="${
                      Number.isInteger(postId)
                        ? postId
                        : ""
                    }"
                  >

                  <input
                    type="hidden"
                    name="reported_user_id"
                    value="${
                      Number.isInteger(reported)
                        ? reported
                        : ""
                    }"
                  >

                  <textarea
                    name="reason"
                    maxlength="1000"
                    placeholder="دلیل گزارش را بنویس..."
                    required
                  ></textarea>

                  <button class="full danger">
                    🚩 ارسال گزارش
                  </button>

                </form>

              </div>
            `,
            user
          );

          return;
        }

        /* =====================================================
           REPORT POST
        ===================================================== */

        if (
          req.method === "POST" &&
          path === "/report"
        ) {

          const d =
            await readBody(req);

          const postId =
            Number(
              d.get("post_id")
            );

          const reported =
            Number(
              d.get("reported_user_id")
            );

          const reason =
            String(
              d.get("reason") || ""
            ).trim();

          if (
            !reason ||
            (
              !Number.isInteger(postId) &&
              !Number.isInteger(reported)
            )
          ) {

            redirect(
              res,
              "/"
            );

            return;
          }

          await pool.query(
            `
              INSERT INTO reports(
                reporter_id,
                reported_user_id,
                post_id,
                reason
              )
              VALUES($1,$2,$3,$4)
            `,
            [
              user.id,
              Number.isInteger(reported)
                ? reported
                : null,
              Number.isInteger(postId)
                ? postId
                : null,
              reason
            ]
          );

          sendHtml(
            res,
            200,
            "گزارش ثبت شد",
            `
              <div class="card">

                <h2 class="success">
                  گزارش ثبت شد ✅
                </h2>

                <p>
                  گزارش شما دریافت شد.
                </p>

                <a href="/">
                  <button class="full">
                    🏠 خانه
                  </button>
                </a>

              </div>
            `,
            user
          );

          return;
        }

        /* =====================================================
           JOBS
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/jobs"
        ) {

          const q =
            String(
              requestUrl.searchParams.get(
                "q"
              ) || ""
            ).trim();

          const r =
            q
              ? await pool.query(
                  `
                    SELECT
                      j.*,
                      u.name

                    FROM jobs j

                    JOIN users u
                      ON u.id=j.user_id

                    WHERE
                      (
                        j.title ILIKE $1
                        OR j.city ILIKE $1
                        OR j.description ILIKE $1
                      )

                      AND NOT EXISTS(
                        SELECT 1
                        FROM blocked_users b
                        WHERE
                          (
                            b.blocker_id=$2
                            AND b.blocked_id=j.user_id
                          )
                          OR
                          (
                            b.blocker_id=j.user_id
                            AND b.blocked_id=$2
                          )
                      )

                    ORDER BY
                      j.created_at DESC

                    LIMIT 100
                  `,
                  [
                    `%${q}%`,
                    user.id
                  ]
                )
              : await pool.query(
                  `
                    SELECT
                      j.*,
                      u.name

                    FROM jobs j

                    JOIN users u
                      ON u.id=j.user_id

                    WHERE NOT EXISTS(
                      SELECT 1
                      FROM blocked_users b
                      WHERE
                        (
                          b.blocker_id=$1
                          AND b.blocked_id=j.user_id
                        )
                        OR
                        (
                          b.blocker_id=j.user_id
                          AND b.blocked_id=$1
                        )
                    )

                    ORDER BY
                      j.created_at DESC

                    LIMIT 100
                  `,
                  [user.id]
                );

          let html = `
            <div class="card">

              <h2>
                💼 کاریابی
              </h2>

              <form
                method="GET"
                action="/jobs"
              >

                <input
                  name="q"
                  value="${escapeAttr(q)}"
                  placeholder="عنوان شغل، شهر یا توضیحات..."
                >

                <button class="full">
                  🔎 جستجو
                </button>

              </form>

              <a href="/new-job">
                <button class="full green">
                  ➕ ثبت آگهی کار
                </button>
              </a>

            </div>
          `;

          html +=
            r.rows.length

              ? r.rows
                  .map(
                    j => `
                      <div class="job">

                        <div class="job-title">
                          ${escapeHtml(j.title)}
                        </div>

                        <div class="job-city">
                          📍 ${escapeHtml(j.city)}
                        </div>

                        <div class="job-salary">
                          💰 ${escapeHtml(j.salary)}
                        </div>

                        <div class="job-description">
                          ${escapeHtml(
                            j.description
                          )}
                        </div>

                        <div class="small">
                          ثبت‌کننده:
                          ${escapeHtml(j.name)}
                          ·
                          ${new Date(
                            j.created_at
                          ).toLocaleString("fa-IR")}
                        </div>

                        ${
                          Number(j.user_id) ===
                          Number(user.id)

                            ? `
                              <div class="actions">

                                <a
                                  href="/delete-job?id=${j.id}"
                                >
                                  <button class="danger">
                                    🗑️ حذف آگهی
                                  </button>
                                </a>

                              </div>
                            `
                            : ""
                        }

                      </div>
                    `
                  )
                  .join("")

              : `
                <div class="card empty">
                  آگهی‌ای پیدا نشد.
                </div>
              `;

          sendHtml(
            res,
            200,
            "کاریابی",
            html,
            user
          );

          return;
        }

        /* =====================================================
           NEW JOB
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/new-job"
        ) {

          sendHtml(
            res,
            200,
            "ثبت آگهی",
            `
              <div class="card">

                <form
                  method="POST"
                  action="/new-job"
                >

                  <input
                    name="title"
                    maxlength="200"
                    placeholder="عنوان شغل"
                    required
                  >

                  <input
                    name="city"
                    maxlength="100"
                    placeholder="شهر"
                    required
                  >

                  <input
                    name="salary"
                    maxlength="200"
                    placeholder="حقوق"
                    required
                  >

                  <textarea
                    name="description"
                    maxlength="5000"
                    placeholder="توضیحات شغل..."
                    required
                  ></textarea>

                  <button class="full green">
                    📢 انتشار آگهی
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
          path === "/new-job"
        ) {

          const d =
            await readBody(req);

          const title =
            String(
              d.get("title") || ""
            ).trim();

          const city =
            String(
              d.get("city") || ""
            ).trim();

          const salary =
            String(
              d.get("salary") || ""
            ).trim();

          const description =
            String(
              d.get("description") || ""
            ).trim();

          if (
            title &&
            city &&
            salary &&
            description
          ) {

            await pool.query(
              `
                INSERT INTO jobs(
                  user_id,
                  title,
                  city,
                  salary,
                  description
                )
                VALUES($1,$2,$3,$4,$5)
              `,
              [
                user.id,
                title,
                city,
                salary,
                description
              ]
            );
          }

          redirect(
            res,
            "/jobs"
          );

          return;
        }

        /* =====================================================
           DELETE JOB
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/delete-job"
        ) {

          const id =
            Number(
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (
            Number.isInteger(id)
          ) {

            await pool.query(
              `
                DELETE FROM jobs
                WHERE
                  id=$1
                  AND user_id=$2
              `,
              [
                id,
                user.id
              ]
            );
          }

          redirect(
            res,
            "/jobs"
          );

          return;
        }

        /* =====================================================
           SETTINGS
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/settings"
        ) {

          const r =
            await pool.query(
              `
                SELECT
                  name,
                  email,
                  bio,
                  avatar_url
                FROM users
                WHERE id=$1
              `,
              [user.id]
            );

          const p =
            r.rows[0] || user;

          sendHtml(
            res,
            200,
            "تنظیمات",
            `
              <div class="card">

                <div class="profile-center">

                  ${avatarHtml(p,true)}

                  <div
                    class="username"
                    style="margin-top:8px"
                  >
                    ${escapeHtml(p.name)}
                  </div>

                  <div class="email">
                    ${escapeHtml(p.email)}
                  </div>

                </div>

                <div class="divider"></div>

                <form
                  method="POST"
                  action="/settings"
                  enctype="multipart/form-data"
                >

                  <input
                    name="name"
                    maxlength="100"
                    value="${escapeAttr(p.name)}"
                    placeholder="نام"
                    required
                  >

                  <textarea
                    name="bio"
                    maxlength="1000"
                    placeholder="درباره من"
                  >${escapeHtml(
                    p.bio || ""
                  )}</textarea>

                  <label>
                    🖼️ عکس پروفایل
                  </label>

                  <input
                    type="file"
                    name="avatar"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                  >

                  <div class="notice">
                    حداکثر حجم:
                    ۲ مگابایت
                  </div>

                  <button class="full">
                    💾 ذخیره تغییرات
                  </button>

                </form>

                <div class="actions">

                  <a href="/delete-avatar">
                    <button class="danger">
                      🗑️ حذف عکس پروفایل
                    </button>
                  </a>

                </div>

              </div>

              <div class="card menu">

                <button
                  class="secondary"
                  onclick="toggleTheme()"
                >
                  🎨 تغییر رنگ / حالت تاریک
                </button>

                <a href="/password">
                  <button>
                    🔐 تغییر رمز عبور
                  </button>
                </a>

                <a href="/notifications">
                  <button>
                    🔔 اعلان‌ها
                  </button>
                </a>

                <a href="/saved">
                  <button>
                    🔖 ذخیره‌ها
                  </button>
                </a>

                <a href="/calls">
                  <button>
                    📞 تماس‌ها
                  </button>
                </a>

              </div>
            `,
            user
          );

          return;
        }

        /* =====================================================
           SETTINGS POST
        ===================================================== */

        if (
          req.method === "POST" &&
          path === "/settings"
        ) {

          const contentType =
            req.headers["content-type"] || "";

          let name = "";
          let bio = "";
          let avatarUrl =
            user.avatar_url || "";

          if (
            contentType.includes(
              "multipart/form-data"
            )
          ) {

            const form =
              await readMultipart(req);

            name =
              String(
                form.fields.name || ""
              ).trim();

            bio =
              String(
                form.fields.bio || ""
              ).trim();

            const avatar =
              form.files.avatar;

            if (
              avatar &&
              avatar.buffer &&
              avatar.buffer.length
            ) {

              if (
                !validImage(avatar)
              ) {

                sendHtml(
                  res,
                  400,
                  "خطا",
                  `
                    <div class="card">

                      <p class="error">
                        تصویر نامعتبر است
                        یا بیشتر از ۲ مگابایت است.
                      </p>

                    </div>
                  `,
                  user
                );

                return;
              }

              avatarUrl =
                imageToDataUrl(
                  avatar
                );
            }

          } else {

            const d =
              await readBody(req);

            name =
              String(
                d.get("name") || ""
              ).trim();

            bio =
              String(
                d.get("bio") || ""
              ).trim();

            const old =
              String(
                d.get("avatar_url") || ""
              ).trim();

            if (old) {
              avatarUrl = old;
            }
          }

          if (!name) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    نام نمی‌تواند خالی باشد.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          await pool.query(
            `
              UPDATE users
              SET
                name=$1,
                bio=$2,
                avatar_url=$3
              WHERE id=$4
            `,
            [
              name,
              bio,
              avatarUrl || null,
              user.id
            ]
          );

          redirect(
            res,
            "/profile"
          );

          return;
        }

        /* =====================================================
           DELETE AVATAR
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/delete-avatar"
        ) {

          await pool.query(
            `
              UPDATE users
              SET avatar_url=NULL
              WHERE id=$1
            `,
            [user.id]
          );

          redirect(
            res,
            "/settings"
          );

          return;
        }

        /* =====================================================
           PASSWORD
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/password"
        ) {

          sendHtml(
            res,
            200,
            "تغییر رمز",
            `
              <div class="card">

                <form
                  method="POST"
                  action="/password"
                >

                  <input
                    name="old_password"
                    type="password"
                    placeholder="رمز فعلی"
                    required
                  >

                  <input
                    name="new_password"
                    type="password"
                    minlength="6"
                    placeholder="رمز جدید"
                    required
                  >

                  <input
                    name="new_password2"
                    type="password"
                    minlength="6"
                    placeholder="تکرار رمز جدید"
                    required
                  >

                  <button class="full">
                    🔐 تغییر رمز
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
          path === "/password"
        ) {

          const d =
            await readBody(req);

          const old =
            String(
              d.get("old_password") || ""
            );

          const nw =
            String(
              d.get("new_password") || ""
            );

          const nw2 =
            String(
              d.get("new_password2") || ""
            );

          const r =
            await pool.query(
              `
                SELECT password
                FROM users
                WHERE id=$1
              `,
              [user.id]
            );

          if (
            !r.rows.length ||
            hashPassword(old) !==
              r.rows[0].password ||
            nw.length < 6 ||
            nw !== nw2
          ) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    رمز فعلی اشتباه است
                    یا رمزهای جدید یکسان نیستند.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          await pool.query(
            `
              UPDATE users
              SET password=$1
              WHERE id=$2
            `,
            [
              hashPassword(nw),
              user.id
            ]
          );

          await pool.query(
            `
              DELETE FROM sessions
              WHERE user_id=$1
            `,
            [user.id]
          );

          sendHtml(
            res,
            200,
            "موفق",
            `
              <div class="card">

                <p class="success">
                  رمز تغییر کرد.
                  برای امنیت دوباره وارد شوید. ✅
                </p>

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

        /* =====================================================
           CALLS HOME
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/calls"
        ) {

          sendHtml(
            res,
            200,
            "تماس",
            `
              <div class="card">

                <h2>
                  📞 تماس صوتی و تصویری
                </h2>

                <p>
                  برای تماس، وارد پروفایل کاربر شوید
                  و تماس صوتی یا تصویری را انتخاب کنید.
                </p>

                <a href="/search">
                  <button class="full">
                    🔎 پیدا کردن کاربر
                  </button>
                </a>

              </div>

              <div class="notice">
                تماس با WebRTC انجام می‌شود.
                هر دو طرف باید آنلاین باشند
                و مرورگر اجازه دسترسی به میکروفن
                یا دوربین را داشته باشد.
              </div>
            `,
            user
          );

          return;
        }

        /* =====================================================
           CALL PAGE
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/call"
        ) {

          const otherId =
            Number(
              requestUrl.searchParams.get(
                "user"
              )
            );

          const mode =
            requestUrl.searchParams.get(
              "mode"
            ) === "video"
              ? "video"
              : "audio";

          if (
            !Number.isInteger(otherId) ||
            otherId === user.id
          ) {

            redirect(
              res,
              "/calls"
            );

            return;
          }

          const o =
            await pool.query(
              `
                SELECT
                  id,
                  name,
                  email,
                  avatar_url
                FROM users
                WHERE id=$1
              `,
              [otherId]
            );

          if (
            !o.rows.length ||
            await areBlocked(
              user.id,
              otherId
            )
          ) {

            sendHtml(
              res,
              403,
              "تماس",
              `
                <div class="card">

                  <p class="error">
                    امکان تماس با این کاربر وجود ندارد.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          const callId =
            crypto
              .randomBytes(16)
              .toString("hex");

          sendHtml(
            res,
            200,
            mode === "video"
              ? "تماس تصویری"
              : "تماس صوتی",
            `
              <div class="call-box">

                <h2>
                  📞 تماس با
                  ${escapeHtml(
                    o.rows[0].name
                  )}
                </h2>

                <p id="status">
                  در حال آماده‌سازی تماس...
                </p>

                <video
                  id="remote"
                  class="video"
                  autoplay
                  playsinline
                ></video>

                <video
                  id="local"
                  class="video"
                  autoplay
                  muted
                  playsinline
                  style="margin-top:8px"
                ></video>

                <div class="actions">

                  <button onclick="startCall()">
                    ▶️ شروع تماس
                  </button>

                  <button
                    class="danger"
                    onclick="hangup()"
                  >
                    ⛔ پایان
                  </button>

                </div>

              </div>

              <script>

              const peerId =
                ${otherId};

              const callId =
                ${JSON.stringify(callId)};

              const mode =
                ${JSON.stringify(mode)};

              let pc = null;
              let stream = null;
              let closed = false;

              async function signal(
                type,
                payload
              ) {

                await fetch(
                  "/call-signal",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type":
                        "application/x-www-form-urlencoded"
                    },
                    body:
                      new URLSearchParams({
                        receiver_id:
                          String(peerId),

                        call_id:
                          callId,

                        type:
                          type,

                        payload:
                          JSON.stringify(
                            payload || {}
                          )
                      })
                  }
                );
              }

              async function makePeer() {

                pc =
                  new RTCPeerConnection();

                if (stream) {

                  stream
                    .getTracks()
                    .forEach(
                      track =>
                        pc.addTrack(
                          track,
                          stream
                        )
                    );
                }

                pc.ontrack =
                  event => {

                    if (
                      event.streams &&
                      event.streams[0]
                    ) {

                      document
                        .getElementById(
                          "remote"
                        )
                        .srcObject =
                        event.streams[0];

                    }

                  };

                pc.onicecandidate =
                  event => {

                    if (
                      event.candidate
                    ) {

                      signal(
                        "ice",
                        event.candidate
                      );
                    }

                  };

              }

              async function startCall() {

                try {

                  stream =
                    await navigator
                      .mediaDevices
                      .getUserMedia({
                        audio: true,
                        video:
                          mode === "video"
                      });

                  document
                    .getElementById("local")
                    .srcObject =
                    stream;

                  await makePeer();

                  const offer =
                    await pc.createOffer();

                  await pc.setLocalDescription(
                    offer
                  );

                  await signal(
                    "offer",
                    offer
                  );

                  document
                    .getElementById("status")
                    .textContent =
                    "در انتظار پاسخ...";

                  poll();

                } catch (error) {

                  document
                    .getElementById("status")
                    .textContent =
                    "دسترسی به میکروفن یا دوربین ممکن نیست.";

                }

              }

              async function acceptOffer(
                offer
              ) {

                stream =
                  await navigator
                    .mediaDevices
                    .getUserMedia({
                      audio: true,
                      video:
                        mode === "video"
                    });

                document
                  .getElementById("local")
                  .srcObject =
                  stream;

                await makePeer();

                await pc.setRemoteDescription(
                  offer
                );

                const answer =
                  await pc.createAnswer();

                await pc.setLocalDescription(
                  answer
                );

                await signal(
                  "answer",
                  answer
                );

                document
                  .getElementById("status")
                  .textContent =
                  "تماس برقرار است.";
              }

              async function poll() {

                if (closed) return;

                try {

                  const response =
                    await fetch(
                      "/call-signals?call_id=" +
                      encodeURIComponent(
                        callId
                      )
                    );

                  const signals =
                    await response.json();

                  for (
                    const item of signals
                  ) {

                    const payload =
                      JSON.parse(
                        item.payload || "{}"
                      );

                    if (
                      item.type === "offer"
                    ) {

                      if (!pc) {

                        await acceptOffer(
                          payload
                        );

                      }

                    } else if (
                      item.type === "answer"
                    ) {

                      if (pc) {

                        await pc.setRemoteDescription(
                          payload
                        );

                        document
                          .getElementById(
                            "status"
                          )
                          .textContent =
                          "تماس برقرار است.";
                      }

                    } else if (
                      item.type === "ice"
                    ) {

                      if (pc) {

                        try {

                          await pc.addIceCandidate(
                            payload
                          );

                        } catch (e) {}

                      }

                    }

                  }

                  setTimeout(
                    poll,
                    1000
                  );

                } catch (e) {

                  setTimeout(
                    poll,
                    2000
                  );

                }

              }

              function hangup() {

                closed = true;

                if (stream) {

                  stream
                    .getTracks()
                    .forEach(
                      track =>
                        track.stop()
                    );
                }

                if (pc) {
                  pc.close();
                }

                location.href =
                  "/profile?id=" +
                  peerId;
              }

              poll();

              </script>
            `,
            user
          );

          return;
        }

        /* =====================================================
           CALL SIGNAL
        ===================================================== */

        if (
          req.method === "POST" &&
          path === "/call-signal"
        ) {

          const d =
            await readBody(req);

          const receiver =
            Number(
              d.get("receiver_id")
            );

          const callId =
            String(
              d.get("call_id") || ""
            ).slice(0,100);

          const type =
            String(
              d.get("type") || ""
            ).slice(0,20);

          const payload =
            String(
              d.get("payload") || ""
            );

          if (
            !Number.isInteger(receiver) ||
            receiver === user.id ||
            !callId ||
            !type ||
            payload.length > 500000
          ) {

            res.writeHead(
              400,
              {
                "Content-Type":
                  "application/json"
              }
            );

            res.end(
              JSON.stringify({
                ok: false
              })
            );

            return;
          }

          if (
            await areBlocked(
              user.id,
              receiver
            )
          ) {

            res.writeHead(
              403,
              {
                "Content-Type":
                  "application/json"
              }
            );

            res.end(
              JSON.stringify({
                ok: false
              })
            );

            return;
          }

          await pool.query(
            `
              INSERT INTO call_signals(
                caller_id,
                receiver_id,
                call_id,
                type,
                payload
              )
              VALUES($1,$2,$3,$4,$5)
            `,
            [
              user.id,
              receiver,
              callId,
              type,
              payload
            ]
          );

          await notify(
            receiver,
            user.id,
            "call",
            null,
            `${user.name} برای شما درخواست تماس فرستاد.`
          );

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json"
            }
          );

          res.end(
            JSON.stringify({
              ok: true
            })
          );

          return;
        }

        /* =====================================================
           CALL SIGNALS
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/call-signals"
        ) {

          const callId =
            String(
              requestUrl.searchParams.get(
                "call_id"
              ) || ""
            ).slice(0,100);

          const r =
            await pool.query(
              `
                SELECT
                  id,
                  type,
                  payload
                FROM call_signals
                WHERE
                  receiver_id=$1
                  AND call_id=$2
                  AND consumed=FALSE
                ORDER BY id ASC
                LIMIT 50
              `,
              [
                user.id,
                callId
              ]
            );

          if (r.rows.length) {

            await pool.query(
              `
                UPDATE call_signals
                SET consumed=TRUE
                WHERE
                  id=ANY($1::int[])
              `,
              [
                r.rows.map(
                  x => x.id
                )
              ]
            );
          }

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json",
              "Cache-Control":
                "no-store"
            }
          );

          res.end(
            JSON.stringify(
              r.rows
            )
          );

          return;
        }

        /* =====================================================
           LOGOUT
        ===================================================== */

        if (
          req.method === "GET" &&
          path === "/logout"
        ) {

          const sid =
            parseCookies(req)
              .sessionId;

          if (sid) {

            await pool.query(
              `
                DELETE FROM sessions
                WHERE session_id=$1
              `,
              [sid]
            );
          }

          redirect(
            res,
            "/",
            "sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
          );

          return;
        }

        /* =====================================================
           404
        ===================================================== */

        sendHtml(
          res,
          404,
          "صفحه پیدا نشد",
          `
            <div class="card empty">

              <h2>
                404
              </h2>

              <p>
                صفحه مورد نظر پیدا نشد.
              </p>

              <a href="/">
                <button>
                  🏠 خانه
                </button>
              </a>

            </div>
          `,
          user
        );

      } catch (error) {

        console.error(
          "REQUEST ERROR:",
          error
        );

        if (
          !res.headersSent
        ) {

          sendHtml(
            res,
            500,
            "خطای سرور",
            `
              <div class="card">

                <h2 class="error">
                  خطای داخلی سرور
                </h2>

                <p>
                  لطفاً دوباره تلاش کنید.
                </p>

                <a href="/">
                  <button>
                    بازگشت
                  </button>
                </a>

              </div>
            `
          );

        } else {

          res.end();

        }

      }

    }
  );

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

  try {

    await createTables();

    await pool.query(
      "SELECT 1"
    );

    server.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `Server running on port ${PORT}`
        );

      }
    );

  } catch (error) {

    console.error(
      "STARTUP ERROR:",
      error
    );

    process.exit(1);

  }

}

process.on(
  "SIGTERM",
  async () => {
    await pool.end();
    process.exit(0);
  }
);

process.on(
  "SIGINT",
  async () => {
    await pool.end();
    process.exit(0);
  }
);

startServer();
