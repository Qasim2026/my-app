const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 10000;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";

  header.split(";").forEach(part => {
    const index = part.indexOf("=");

    if (index === -1) return;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  });

  return cookies;
}

function createSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

async function createSession(userId) {
  const sessionId = createSessionId();

  await pool.query(
    `INSERT INTO sessions (session_id, user_id)
     VALUES ($1, $2)`,
    [sessionId, userId]
  );

  return sessionId;
}

async function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.sessionId;

  if (!sessionId) return null;

  const result = await pool.query(
    `SELECT users.id, users.name, users.email
     FROM sessions
     INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.session_id = $1`,
    [sessionId]
  );

  return result.rows[0] || null;
}

async function deleteSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.sessionId;

  if (!sessionId) return;

  await pool.query(
    `DELETE FROM sessions WHERE session_id = $1`,
    [sessionId]
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      resolve(new URLSearchParams(body));
    });

    req.on("error", reject);
  });
}

function redirect(res, location, cookie) {
  const headers = { Location: location };

  if (cookie) {
    headers["Set-Cookie"] = cookie;
  }

  res.writeHead(302, headers);
  res.end();
}

function page(title, content, user = null) {
  const bottomNav = user
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
          <span class="plus">＋</span>
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

  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>${escapeHtml(title)}</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #eef1f5;
  color: #202124;
  font-family: Tahoma, Arial, sans-serif;
}

.app {
  width: 100%;
  max-width: 680px;
  min-height: 100vh;
  margin: auto;
  background: #f8f9fb;
  padding-bottom: 90px;
}

.header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,.96);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #e3e6ea;
  padding: 16px;
  text-align: center;
  font-size: 19px;
  font-weight: bold;
}

.content {
  padding: 14px;
}

.card {
  background: #fff;
  border: 1px solid #e1e5ea;
  border-radius: 18px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 3px 12px rgba(0,0,0,.035);
}

.profile-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 52px;
  height: 52px;
  min-width: 52px;
  border-radius: 50%;
  background: #222;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 22px;
  font-weight: bold;
}

.username {
  font-weight: bold;
  font-size: 16px;
}

.email {
  color: #777;
  font-size: 12px;
  margin-top: 4px;
  direction: ltr;
  text-align: right;
}

.post-text {
  margin: 18px 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.9;
  font-size: 16px;
}

.stats {
  display: flex;
  gap: 18px;
  color: #666;
  font-size: 14px;
  align-items: center;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  flex-wrap: wrap;
}

button {
  border: none;
  border-radius: 12px;
  padding: 11px 15px;
  background: #202124;
  color: white;
  cursor: pointer;
  font-size: 14px;
}

button:hover {
  opacity: .9;
}

.full {
  width: 100%;
  margin-top: 8px;
}

.like {
  background: #e91e63;
}

.follow {
  background: #1976d2;
}

.save {
  background: #6a4c93;
}

.danger {
  background: #b00020;
}

.secondary {
  background: #687078;
}

input,
textarea,
select {
  width: 100%;
  padding: 13px;
  margin: 7px 0;
  border: 1px solid #ccd2d8;
  border-radius: 12px;
  font-size: 16px;
  font-family: Tahoma, Arial, sans-serif;
  background: #fff;
}

textarea {
  min-height: 120px;
  resize: vertical;
}

a {
  text-decoration: none;
  color: inherit;
}

.menu {
  display: grid;
  gap: 10px;
}

.empty {
  text-align: center;
  color: #777;
  padding: 35px 10px;
}

.success {
  color: #087f23;
}

.error {
  color: #b00020;
}

.comment {
  background: #f3f5f7;
  border-radius: 12px;
  padding: 11px;
  margin-top: 9px;
}

.comment-name {
  font-weight: bold;
}

.comment-text {
  margin-top: 5px;
  white-space: pre-wrap;
  line-height: 1.7;
}

.job {
  border: 1px solid #ddd;
  border-radius: 15px;
  padding: 15px;
  margin-bottom: 12px;
  background: #fff;
}

.job-title {
  font-size: 18px;
  font-weight: bold;
}

.job-city {
  color: #555;
  margin-top: 7px;
}

.job-salary {
  color: #087f23;
  margin-top: 7px;
}

.job-description {
  margin-top: 12px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.small {
  color: #777;
  font-size: 12px;
}

.divider {
  height: 1px;
  background: #e0e0e0;
  margin: 18px 0;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 680px;
  height: 72px;
  background: rgba(255,255,255,.98);
  border-top: 1px solid #ddd;
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 100;
  box-shadow: 0 -4px 15px rgba(0,0,0,.06);
}

.bottom-nav a {
  text-align: center;
  font-size: 11px;
  color: #555;
  min-width: 55px;
}

.bottom-nav span {
  display: block;
  font-size: 22px;
  line-height: 30px;
}

.bottom-nav .plus {
  font-size: 30px;
  font-weight: bold;
}

.badge {
  display: inline-block;
  background: #e91e63;
  color: white;
  border-radius: 20px;
  padding: 4px 9px;
  font-size: 11px;
}

.top-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 9px;
  margin-top: 12px;
}

.notice {
  background: #f0f7ff;
  border: 1px solid #d6e9ff;
  border-radius: 14px;
  padding: 12px;
  line-height: 1.7;
}

@media (max-width: 420px) {
  .content {
    padding: 10px;
  }

  .card {
    padding: 13px;
    border-radius: 15px;
  }

  .actions button {
    flex: 1;
  }
}
</style>
</head>

<body>

<div class="app">

  <div class="header">
    ${escapeHtml(title)}
  </div>

  <main class="content">
    ${content}
  </main>

</div>

${bottomNav}

</body>
</html>
`;
}

function sendHtml(res, status, title, content, user = null) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(page(title, content, user));
}
