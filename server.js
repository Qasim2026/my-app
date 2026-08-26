const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it in Render > Environment.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
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
  const result = {};
  const header = req.headers.cookie || "";

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }

  return result;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;

      if (data.length > 2 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(new URLSearchParams(data)));
    req.on("error", reject);
  });
}

function setSessionCookie(sessionId) {
  return `sessionId=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`;
}

function clearSessionCookie() {
  return "sessionId=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}

function redirect(res, location, cookie) {
  const headers = { Location: location };

  if (cookie) {
    headers["Set-Cookie"] = cookie;
  }

  res.writeHead(302, headers);
  res.end();
}

async function getSession(req) {
  const sessionId = parseCookies(req).sessionId;

  if (!sessionId) return null;

  const result = await pool.query(
    `SELECT u.id, u.name, u.email
     FROM sessions s
     JOIN users u ON u.id=s.user_id
     WHERE s.session_id=$1`,
    [sessionId]
  );

  return result.rows[0] || null;
}

function avatar(name, size = 50) {
  const first = String(name || "?").trim().slice(0, 1) || "?";

  return `
    <div class="avatar" style="width:${size}px;height:${size}px;min-width:${size}px">
      ${escapeHtml(first)}
    </div>
  `;
}

function formButton(action, text, className = "") {
  return `
    <form method="post" action="${action}" class="inline-form">
      <button class="${className}">${text}</button>
    </form>
  `;
}

function layout(title, content, user) {
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

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: #edf1f5;
  color: #202124;
  font-family: Tahoma, Arial, sans-serif;
}

a {
  color: #1976d2;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.app {
  width: 100%;
  max-width: 760px;
  min-height: 100vh;
  margin: auto;
  background: #f7f8fa;
  padding-bottom: 92px;
}

.header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,.97);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #e0e4e8;
  padding: 15px 16px;
  text-align: center;
  font-size: 19px;
  font-weight: bold;
}

.content {
  padding: 15px;
}

.card {
  background: #fff;
  border: 1px solid #e1e5e9;
  border-radius: 18px;
  padding: 15px;
  margin-bottom: 14px;
  box-shadow: 0 4px 16px rgba(0,0,0,.045);
}

.row {
  display: flex;
  align-items: center;
  gap: 11px;
}

.avatar {
  border-radius: 50%;
  background: #202124;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 20px;
  font-weight: bold;
  overflow: hidden;
}

.name {
  font-weight: bold;
}

.muted {
  color: #777;
  font-size: 12px;
}

.ltr {
  direction: ltr;
  text-align: right;
}

.text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.9;
  margin: 14px 0;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  color: #666;
  font-size: 13px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}

.inline-form {
  display: inline;
  margin: 0;
}

button,
.btn {
  border: none;
  border-radius: 11px;
  padding: 10px 13px;
  background: #202124;
  color: #fff;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  display: inline-block;
  font-family: inherit;
}

button:hover,
.btn:hover {
  opacity: .9;
  text-decoration: none;
}

.full {
  width: 100%;
  margin-top: 8px;
}

.green {
  background: #16803c;
}

.blue {
  background: #1976d2;
}

.purple {
  background: #6a4c93;
}

.red {
  background: #b00020;
}

.gray {
  background: #687078;
}

.pink {
  background: #e91e63;
}

.orange {
  background: #ef6c00;
}

input,
textarea,
select {
  width: 100%;
  padding: 13px;
  margin: 6px 0;
  border: 1px solid #ccd2d8;
  border-radius: 11px;
  font: inherit;
  background: #fff;
  outline: none;
}

input:focus,
textarea:focus,
select:focus {
  border-color: #1976d2;
}

textarea {
  min-height: 120px;
  resize: vertical;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 760px;
  height: 72px;
  background: rgba(255,255,255,.98);
  border-top: 1px solid #ddd;
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 100;
  box-shadow: 0 -4px 15px rgba(0,0,0,.05);
}

.bottom-nav a {
  text-decoration: none;
  color: #555;
  text-align: center;
  font-size: 11px;
  min-width: 55px;
}

.bottom-nav a:hover {
  color: #1976d2;
}

.bottom-nav span {
  display: block;
  font-size: 21px;
  line-height: 29px;
}

.media {
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: 500px;
  object-fit: contain;
  border-radius: 14px;
  margin-top: 10px;
  background: #f1f3f5;
}

.comment {
  background: #f3f5f7;
  border-radius: 13px;
  padding: 11px;
  margin-top: 9px;
}

.job {
  border: 1px solid #e0e4e8;
  border-radius: 16px;
  padding: 15px;
  margin-bottom: 12px;
  background: #fff;
  box-shadow: 0 3px 12px rgba(0,0,0,.035);
}

.job h3 {
  margin-top: 0;
  margin-bottom: 10px;
}

.success {
  color: #087f23;
}

.error {
  color: #b00020;
}

.notice {
  background: #f0f7ff;
  border: 1px solid #d6e9ff;
  border-radius: 13px;
  padding: 12px;
  line-height: 1.8;
}

.warning {
  background: #fff8e6;
  border: 1px solid #ffe3a1;
  border-radius: 13px;
  padding: 12px;
  line-height: 1.8;
}

.top-grid {
  display: grid;
  grid-template-columns: repeat(2,1fr);
  gap: 9px;
  margin-top: 13px;
}

.menu {
  display: grid;
  gap: 9px;
}

.menu .btn,
.menu button {
  width: 100%;
  text-align: center;
}

.stat-box {
  flex: 1;
  min-width: 90px;
  text-align: center;
  background: #f5f7f9;
  border-radius: 13px;
  padding: 11px 7px;
}

.stat-number {
  font-size: 19px;
  font-weight: bold;
}

.stat-label {
  font-size: 11px;
  color: #777;
  margin-top: 3px;
}

.profile-actions {
  display: grid;
  grid-template-columns: repeat(2,1fr);
  gap: 8px;
  margin-top: 14px;
}

.empty {
  text-align: center;
  padding: 25px 10px;
  color: #777;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 20px;
  background: #e91e63;
  color: white;
  font-size: 10px;
  margin-right: 4px;
}

.message-me {
  background: #e8f3ff;
  border-radius: 15px;
  padding: 12px;
  margin: 7px 0;
}

.message-other {
  background: #f1f3f5;
  border-radius: 15px;
  padding: 12px;
  margin: 7px 0;
}

.post-header {
  margin-bottom: 3px;
}

.post-actions {
  border-top: 1px solid #eee;
  margin-top: 12px;
  padding-top: 10px;
}

.small-btn {
  padding: 8px 10px;
  font-size: 12px;
}

@media (max-width: 520px) {

  .content {
    padding: 10px;
  }

  .card {
    padding: 12px;
    border-radius: 15px;
  }

  .top-grid,
  .profile-actions {
    grid-template-columns: 1fr;
  }

  .actions {
    gap: 6px;
  }

  button,
  .btn {
    padding: 9px 10px;
    font-size: 13px;
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

${nav}

</body>
</html>
`;
}

function sendHtml(res, status, title, content, user = null) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(layout(title, content, user));
}

async function initDatabase() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      media_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, post_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(follower_id, following_id),
      CHECK(follower_id <> following_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_posts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, post_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(blocker_id, blocked_id),
      CHECK(blocker_id <> blocked_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      city TEXT,
      salary TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log("Database initialized successfully.");
}

async function unreadCounts(userId) {

  const notifications = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE user_id=$1 AND read=false`,
    [userId]
  );

  const messages = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM messages
     WHERE receiver_id=$1`,
    [userId]
  );

  return {
    notifications: notifications.rows[0].count,
    messages: messages.rows[0].count
  };
}

async function app(req, res) {

  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  const path = url.pathname;
  const method = req.method;

  try {

    const user = await getSession(req);

    if (method === "GET" && path === "/health") {
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
      });

      return res.end("OK");
    }

    if (method === "GET" && path === "/login") {

      return sendHtml(
        res,
        200,
        "ورود",
        `
        <div class="card">

          <div style="text-align:center;font-size:45px">
            👋
          </div>

          <h2 style="text-align:center">
            خوش آمدی
          </h2>

          <form method="post" action="/login">

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

            <button class="blue full">
              ورود
            </button>

          </form>

          <div style="text-align:center;margin-top:15px">
            حساب نداری؟
            <a href="/register">ساخت حساب جدید</a>
          </div>

        </div>
        `,
        null
      );
    }

    if (method === "GET" && path === "/register") {

      return sendHtml(
        res,
        200,
        "ثبت‌نام",
        `
        <div class="card">

          <div style="text-align:center;font-size:45px">
            👤
          </div>

          <h2 style="text-align:center">
            ساخت حساب جدید
          </h2>

          <form method="post" action="/register">

            <input
              name="name"
              placeholder="نام"
              required
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
              minlength="6"
              placeholder="رمز عبور، حداقل ۶ کاراکتر"
              required
            >

            <button class="green full">
              ثبت‌نام
            </button>

          </form>

          <div style="text-align:center;margin-top:15px">
            حساب داری؟
            <a href="/login">ورود</a>
          </div>

        </div>
        `,
        null
      );
    }

    if (method === "POST" && path === "/register") {

      const b = await readBody(req);

      const name = (b.get("name") || "").trim();
      const email = (b.get("email") || "").trim().toLowerCase();
      const password = b.get("password") || "";

      if (!name || !email || password.length < 6) {
        return sendHtml(
          res,
          400,
          "خطا",
          `
          <div class="card error">
            اطلاعات واردشده معتبر نیست.
          </div>
          <a class="btn" href="/register">بازگشت</a>
          `,
          null
        );
      }

      const exists = await pool.query(
        "SELECT id FROM users WHERE email=$1",
        [email]
      );

      if (exists.rowCount) {
        return sendHtml(
          res,
          400,
          "خطا",
          `
          <div class="card error">
            این ایمیل قبلاً ثبت شده است.
          </div>
          <a class="btn" href="/register">بازگشت</a>
          `,
          null
        );
      }

      const result = await pool.query(
        `INSERT INTO users(name,email,password)
         VALUES($1,$2,$3)
         RETURNING id`,
        [
          name,
          email,
          hashPassword(password)
        ]
      );

      const sessionId = createToken();

      await pool.query(
        `INSERT INTO sessions(session_id,user_id)
         VALUES($1,$2)`,
        [
          sessionId,
          result.rows[0].id
        ]
      );

      return redirect(
        res,
        "/",
        setSessionCookie(sessionId)
      );
    }

    if (method === "POST" && path === "/login") {

      const b = await readBody(req);

      const email = (b.get("email") || "")
        .trim()
        .toLowerCase();

      const password = b.get("password") || "";

      const result = await pool.query(
        `SELECT id
         FROM users
         WHERE email=$1 AND password=$2`,
        [
          email,
          hashPassword(password)
        ]
      );

      if (!result.rowCount) {
        return sendHtml(
          res,
          401,
          "خطا",
          `
          <div class="card error">
            ایمیل یا رمز عبور اشتباه است.
          </div>
          <a class="btn" href="/login">بازگشت</a>
          `,
          null
        );
      }

      const sessionId = createToken();

      await pool.query(
        `INSERT INTO sessions(session_id,user_id)
         VALUES($1,$2)`,
        [
          sessionId,
          result.rows[0].id
        ]
      );

      return redirect(
        res,
        "/",
        setSessionCookie(sessionId)
      );
    }

    if (!user) {
      return redirect(res, "/login");
    }

    if (method === "POST" && path === "/logout") {

      const sessionId = parseCookies(req).sessionId;

      if (sessionId) {
        await pool.query(
          "DELETE FROM sessions WHERE session_id=$1",
          [sessionId]
        );
      }

      return redirect(
        res,
        "/login",
        clearSessionCookie()
      );
    }

    if (method === "GET" && path === "/") {

      const counts = await unreadCounts(user.id);

      const posts = await pool.query(
        `
        SELECT
          p.*,
          u.name,

          (
            SELECT COUNT(*)
            FROM likes l
            WHERE l.post_id=p.id
          )::int AS likes,

          (
            SELECT COUNT(*)
            FROM comments c
            WHERE c.post_id=p.id
          )::int AS comments,

          EXISTS(
            SELECT 1
            FROM likes l
            WHERE l.post_id=p.id
            AND l.user_id=$1
          ) AS liked,

          EXISTS(
            SELECT 1
            FROM saved_posts s
            WHERE s.post_id=p.id
            AND s.user_id=$1
          ) AS saved

        FROM posts p

        JOIN users u
          ON u.id=p.user_id

        WHERE NOT EXISTS(
          SELECT 1
          FROM blocks b
          WHERE b.blocker_id=$1
          AND b.blocked_id=p.user_id
        )

        ORDER BY p.created_at DESC
        LIMIT 50
        `,
        [user.id]
      );

      let content = `
        <div class="card">

          <div class="row">

            ${avatar(user.name, 56)}

            <div style="flex:1">

              <div class="name">
                ${escapeHtml(user.name)}
              </div>

              <div class="muted ltr">
                ${escapeHtml(user.email)}
              </div>

            </div>

          </div>

          <div class="top-grid">

            <a class="btn blue" href="/new-post">
              ➕ انتشار پست
            </a>

            <a class="btn green" href="/jobs">
              💼 کاریابی
            </a>

          </div>

        </div>
      `;

      for (const post of posts.rows) {

        content += `
          <article class="card">

            <div class="row post-header">

              ${avatar(post.name, 46)}

              <div style="flex:1">

                <div class="name">
                  <a href="/user?id=${post.user_id}">
                    ${escapeHtml(post.name)}
                  </a>
                </div>

                <div class="muted">
                  ${new Date(post.created_at).toLocaleString("fa-IR")}
                </div>

              </div>

            </div>

            <div class="text">
              ${escapeHtml(post.content)}
            </div>

            ${
              post.media_url
                ? `
                  <a
                    href="${escapeHtml(post.media_url)}"
                    target="_blank"
                    rel="noopener"
                  >
                    <img
                      class="media"
                      src="${escapeHtml(post.media_url)}"
                      alt="رسانه پست"
                    >
                  </a>
                `
                : ""
            }

            <div class="stats">

              <span>❤️ ${post.likes}</span>
              <span>💬 ${post.comments}</span>

            </div>

            <div class="actions post-actions">

              ${formButton(
                `/like?id=${post.id}`,
                post.liked ? "💔 لغو لایک" : "❤️ لایک",
                "pink small-btn"
              )}

              ${formButton(
                `/save?id=${post.id}`,
                post.saved ? "🔖 حذف ذخیره" : "🔖 ذخیره",
                "purple small-btn"
              )}

              <a
                class="btn gray small-btn"
                href="/post?id=${post.id}"
              >
                💬 نظر
              </a>

              ${
                post.user_id === user.id
                  ? `
                    <a
                      class="btn small-btn"
                      href="/edit-post?id=${post.id}"
                    >
                      ✏️ ویرایش
                    </a>

                    ${formButton(
                      `/delete-post?id=${post.id}`,
                      "🗑️ حذف",
                      "red small-btn"
                    )}
                  `
                  : ""
              }

              ${
                post.user_id !== user.id
                  ? `
                    <a
                      class="btn gray small-btn"
                      href="/report?post=${post.id}"
                    >
                      🚩 گزارش
                    </a>
                  `
                  : ""
              }

            </div>

          </article>
        `;
      }

      if (!posts.rowCount) {
        content += `
          <div class="card empty">
            هنوز پستی منتشر نشده است.
            <br><br>
            اولین پست را خودت منتشر کن.
          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        `خانه ${counts.notifications ? "🔔" : ""}`,
        content,
        user
      );
    }

    if (method === "GET" && path === "/new-post") {

      return sendHtml(
        res,
        200,
        "پست جدید",
        `
        <div class="card">

          <h3>
            ✍️ انتشار پست جدید
          </h3>

          <form method="post" action="/new-post">

            <textarea
              name="content"
              maxlength="5000"
              placeholder="چه خبر؟ چیزی برای اشتراک‌گذاری بنویس..."
              required
            ></textarea>

            <input
              name="media_url"
              type="url"
              placeholder="لینک عکس یا ویدیو، اختیاری"
            >

            <button class="green full">
              🚀 انتشار پست
            </button>

          </form>

        </div>
        `,
        user
      );
    }

    if (method === "POST" && path === "/new-post") {

      const b = await readBody(req);

      const content = (b.get("content") || "").trim();
      const media = (b.get("media_url") || "").trim() || null;

      if (!content) {
        return redirect(res, "/new-post");
      }

      await pool.query(
        `INSERT INTO posts(user_id,content,media_url)
         VALUES($1,$2,$3)`,
        [
          user.id,
          content,
          media
        ]
      );

      return redirect(res, "/");
    }

    if (method === "POST" && path === "/like") {

      const id = Number(url.searchParams.get("id"));

      if (!Number.isInteger(id) || id <= 0) {
        return redirect(res, "/");
      }

      const post = await pool.query(
        "SELECT user_id FROM posts WHERE id=$1",
        [id]
      );

      if (!post.rowCount) {
        return redirect(res, "/");
      }

      const existing = await pool.query(
        `SELECT 1 FROM likes
         WHERE user_id=$1 AND post_id=$2`,
        [user.id, id]
      );

      if (existing.rowCount) {

        await pool.query(
          `DELETE FROM likes
           WHERE user_id=$1 AND post_id=$2`,
          [user.id, id]
        );

      } else {

        await pool.query(
          `INSERT INTO likes(user_id,post_id)
           VALUES($1,$2)
           ON CONFLICT DO NOTHING`,
          [user.id, id]
        );

        if (post.rows[0].user_id !== user.id) {

          await pool.query(
            `INSERT INTO notifications
             (user_id,actor_id,type,post_id)
             VALUES($1,$2,'like',$3)`,
            [
              post.rows[0].user_id,
              user.id,
              id
            ]
          );
        }
      }

      return redirect(res, "/");
    }

    if (method === "POST" && path === "/save") {

      const id = Number(url.searchParams.get("id"));

      if (!Number.isInteger(id) || id <= 0) {
        return redirect(res, "/");
      }

      const existing = await pool.query(
        `SELECT 1 FROM saved_posts
         WHERE user_id=$1 AND post_id=$2`,
        [user.id, id]
      );

      if (existing.rowCount) {

        await pool.query(
          `DELETE FROM saved_posts
           WHERE user_id=$1 AND post_id=$2`,
          [user.id, id]
        );

      } else {

        await pool.query(
          `INSERT INTO saved_posts(user_id,post_id)
           VALUES($1,$2)
           ON CONFLICT DO NOTHING`,
          [user.id, id]
        );
      }

      return redirect(res, "/");
    }

    if (method === "GET" && path === "/post") {

      const id = Number(url.searchParams.get("id"));

      const post = await pool.query(
        `
        SELECT
          p.*,
          u.name,

          (
            SELECT COUNT(*)
            FROM likes l
            WHERE l.post_id=p.id
          )::int AS likes,

          (
            SELECT COUNT(*)
            FROM comments c
            WHERE c.post_id=p.id
          )::int AS comments

        FROM posts p
        JOIN users u ON u.id=p.user_id
        WHERE p.id=$1
        `,
        [id]
      );

      if (!post.rowCount) {
        return sendHtml(
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
      }

      const p = post.rows[0];

      const comments = await pool.query(
        `
        SELECT c.*,u.name
        FROM comments c
        JOIN users u ON u.id=c.user_id
        WHERE c.post_id=$1
        ORDER BY c.created_at ASC
        `,
        [id]
      );

      let content = `
        <div class="card">

          <div class="row">

            ${avatar(p.name, 50)}

            <div>
              <b>${escapeHtml(p.name)}</b>

              <div class="muted">
                ${new Date(p.created_at).toLocaleString("fa-IR")}
              </div>
            </div>

          </div>

          <div class="text">
            ${escapeHtml(p.content)}
          </div>

          ${
            p.media_url
              ? `
                <img
                  class="media"
                  src="${escapeHtml(p.media_url)}"
                  alt="رسانه"
                >
              `
              : ""
          }

          <div class="stats">
            ❤️ ${p.likes}
            <span>💬 ${p.comments}</span>
          </div>

        </div>

        <div class="card">

          <h3>💬 نظرها</h3>

          <form method="post" action="/comment?id=${id}">

            <textarea
              name="content"
              maxlength="2000"
              placeholder="نظر بنویس..."
              required
            ></textarea>

            <button class="blue">
              ارسال نظر
            </button>

          </form>

        </div>
      `;

      for (const comment of comments.rows) {

        content += `
          <div class="comment">

            <div class="row">

              ${avatar(comment.name, 36)}

              <div>
                <b>${escapeHtml(comment.name)}</b>

                <div class="muted">
                  ${new Date(comment.created_at).toLocaleString("fa-IR")}
                </div>
              </div>

            </div>

            <div class="text">
              ${escapeHtml(comment.content)}
            </div>

          </div>
        `;
      }

      if (!comments.rowCount) {
        content += `
          <div class="card empty">
            هنوز نظری ثبت نشده است.
          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "پست",
        content,
        user
      );
    }

    if (method === "POST" && path === "/comment") {

      const id = Number(url.searchParams.get("id"));
      const b = await readBody(req);
      const comment = (b.get("content") || "").trim();

      if (comment) {

        const post = await pool.query(
          "SELECT user_id FROM posts WHERE id=$1",
          [id]
        );

        if (post.rowCount) {

          await pool.query(
            `INSERT INTO comments(user_id,post_id,content)
             VALUES($1,$2,$3)`,
            [user.id, id, comment]
          );

          if (post.rows[0].user_id !== user.id) {

            await pool.query(
              `INSERT INTO notifications
               (user_id,actor_id,type,post_id)
               VALUES($1,$2,'comment',$3)`,
              [
                post.rows[0].user_id,
                user.id,
                id
              ]
            );
          }
        }
      }

      return redirect(res, `/post?id=${id}`);
    }

    if (method === "GET" && path === "/edit-post") {

      const id = Number(url.searchParams.get("id"));

      const result = await pool.query(
        `SELECT *
         FROM posts
         WHERE id=$1 AND user_id=$2`,
        [id, user.id]
      );

      if (!result.rowCount) {
        return redirect(res, "/");
      }

      const p = result.rows[0];

      return sendHtml(
        res,
        200,
        "ویرایش پست",
        `
        <div class="card">

          <h3>✏️ ویرایش پست</h3>

          <form method="post" action="/edit-post?id=${id}">

            <textarea
              name="content"
              required
            >${escapeHtml(p.content)}</textarea>

            <input
              name="media_url"
              type="url"
              value="${escapeHtml(p.media_url || "")}"
              placeholder="لینک عکس یا ویدیو"
            >

            <button class="blue">
              💾 ذخیره تغییرات
            </button>

          </form>

        </div>
        `,
        user
      );
    }

    if (method === "POST" && path === "/edit-post") {

      const id = Number(url.searchParams.get("id"));
      const b = await readBody(req);

      const content = (b.get("content") || "").trim();
      const media = (b.get("media_url") || "").trim() || null;

      if (content) {

        await pool.query(
          `UPDATE posts
           SET content=$1,media_url=$2
           WHERE id=$3 AND user_id=$4`,
          [
            content,
            media,
            id,
            user.id
          ]
        );
      }

      return redirect(res, "/");
    }

    if (method === "POST" && path === "/delete-post") {

      const id = Number(url.searchParams.get("id"));

      await pool.query(
        `DELETE FROM posts
         WHERE id=$1 AND user_id=$2`,
        [id, user.id]
      );

      return redirect(res, "/");
    }

    if (method === "GET" && path === "/search") {

      const q = (url.searchParams.get("q") || "").trim();

      let content = `
        <div class="card">

          <h3>🔎 جستجوی کاربران</h3>

          <form method="get" action="/search">

            <input
              name="q"
              value="${escapeHtml(q)}"
              placeholder="نام یا ایمیل..."
            >

            <button class="blue">
              جستجو
            </button>

          </form>

        </div>
      `;

      if (q) {

        const results = await pool.query(
          `
          SELECT id,name,email
          FROM users
          WHERE name ILIKE $1
             OR email ILIKE $1
          ORDER BY name
          LIMIT 30
          `,
          [`%${q}%`]
        );

        for (const person of results.rows) {

          content += `
            <div class="card">

              <div class="row">

                ${avatar(person.name, 48)}

                <div style="flex:1">

                  <b>
                    <a href="/user?id=${person.id}">
                      ${escapeHtml(person.name)}
                    </a>
                  </b>

                  <div class="muted ltr">
                    ${escapeHtml(person.email)}
                  </div>

                </div>

                <a
                  class="btn small-btn"
                  href="/user?id=${person.id}"
                >
                  مشاهده
                </a>

              </div>

            </div>
          `;
        }

        if (!results.rowCount) {
          content += `
            <div class="card empty">
              نتیجه‌ای پیدا نشد.
            </div>
          `;
        }
      }

      return sendHtml(
        res,
        200,
        "جستجو",
        content,
        user
      );
    }

    if (method === "GET" && path === "/user") {

      const id = Number(url.searchParams.get("id"));

      const person = await pool.query(
        `SELECT id,name,email,created_at
         FROM users
         WHERE id=$1`,
        [id]
      );

      if (!person.rowCount) {
        return sendHtml(
          res,
          404,
          "کاربر",
          `<div class="card empty">کاربر پیدا نشد.</div>`,
          user
        );
      }

      const target = person.rows[0];

      const following = await pool.query(
        `SELECT 1
         FROM follows
         WHERE follower_id=$1
         AND following_id=$2`,
        [user.id, id]
      );

      const blocked = await pool.query(
        `SELECT 1
         FROM blocks
         WHERE blocker_id=$1
         AND blocked_id=$2`,
        [user.id, id]
      );

      const posts = await pool.query(
        `SELECT *
         FROM posts
         WHERE user_id=$1
         ORDER BY created_at DESC
         LIMIT 20`,
        [id]
      );

      let content = `
        <div class="card">

          <div class="row">

            ${avatar(target.name, 70)}

            <div style="flex:1">

              <h2 style="margin:0">
                ${escapeHtml(target.name)}
              </h2>

              <div class="muted ltr">
                ${escapeHtml(target.email)}
              </div>

              <div class="muted">
                عضو از ${new Date(target.created_at).toLocaleDateString("fa-IR")}
              </div>

            </div>

          </div>

          ${
            id !== user.id
              ? `
                <div class="profile-actions">

                  ${formButton(
                    `/follow?id=${id}`,
                    following.rowCount
                      ? "➖ لغو دنبال"
                      : "➕ دنبال کردن",
                    following.rowCount ? "gray" : "blue"
                  )}

                  <a
                    class="btn"
                    href="/messages?user=${id}"
                  >
                    💬 پیام
                  </a>

                  ${
                    blocked.rowCount
                      ? `
                        <span class="warning">
                          این کاربر مسدود شده است.
                        </span>
                      `
                      : formButton(
                          `/block?id=${id}`,
                          "🚫 مسدود کردن",
                          "red"
                        )
                  }

                  <a
                    class="btn gray"
                    href="/report?user=${id}"
                  >
                    🚩 گزارش
                  </a>

                </div>
              `
              : ""
          }

        </div>
      `;

      for (const post of posts.rows) {

        content += `
          <div class="card">

            <div class="muted">
              ${new Date(post.created_at).toLocaleString("fa-IR")}
            </div>

            <div class="text">
              ${escapeHtml(post.content)}
            </div>

            ${
              post.media_url
                ? `
                  <img
                    class="media"
                    src="${escapeHtml(post.media_url)}"
                  >
                `
                : ""
            }

            <a
              class="btn gray"
              href="/post?id=${post.id}"
            >
              مشاهده پست
            </a>

          </div>
        `;
      }

      if (!posts.rowCount) {
        content += `
          <div class="card empty">
            این کاربر هنوز پستی منتشر نکرده است.
          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "پروفایل کاربر",
        content,
        user
      );
    }

    if (method === "POST" && path === "/follow") {

      const id = Number(url.searchParams.get("id"));

      if (id !== user.id) {

        const existing = await pool.query(
          `SELECT 1
           FROM follows
           WHERE follower_id=$1
           AND following_id=$2`,
          [user.id, id]
        );

        if (existing.rowCount) {

          await pool.query(
            `DELETE FROM follows
             WHERE follower_id=$1
             AND following_id=$2`,
            [user.id, id]
          );

        } else {

          await pool.query(
            `INSERT INTO follows(follower_id,following_id)
             VALUES($1,$2)
             ON CONFLICT DO NOTHING`,
            [user.id, id]
          );

          await pool.query(
            `INSERT INTO notifications
             (user_id,actor_id,type)
             VALUES($1,$2,'follow')`,
            [id, user.id]
          );
        }
      }

      return redirect(res, `/user?id=${id}`);
    }

    if (method === "POST" && path === "/block") {

      const id = Number(url.searchParams.get("id"));

      if (id !== user.id) {

        await pool.query(
          `INSERT INTO blocks(blocker_id,blocked_id)
           VALUES($1,$2)
           ON CONFLICT DO NOTHING`,
          [user.id, id]
        );

        await pool.query(
          `DELETE FROM follows
           WHERE follower_id=$1
           AND following_id=$2`,
          [user.id, id]
        );

        await pool.query(
          `DELETE FROM follows
           WHERE follower_id=$1
           AND following_id=$2`,
          [id, user.id]
        );
      }

      return redirect(res, "/");
    }

    if (method === "GET" && path === "/profile") {

      const stats = await pool.query(
        `
        SELECT

          (
            SELECT COUNT(*)
            FROM posts
            WHERE user_id=$1
          )::int AS posts,

          (
            SELECT COUNT(*)
            FROM follows
            WHERE following_id=$1
          )::int AS followers,

          (
            SELECT COUNT(*)
            FROM follows
            WHERE follower_id=$1
          )::int AS following
        `,
        [user.id]
      );

      const counts = await unreadCounts(user.id);
      const s = stats.rows[0];

      return sendHtml(
        res,
        200,
        "پروفایل من",
        `
        <div class="card">

          <div class="row">

            ${avatar(user.name, 72)}

            <div style="flex:1">

              <h2 style="margin:0">
                ${escapeHtml(user.name)}
              </h2>

              <div class="muted ltr">
                ${escapeHtml(user.email)}
              </div>

            </div>

          </div>

          <div
            style="
              display:flex;
              gap:8px;
              margin-top:15px;
              flex-wrap:wrap
            "
          >

            <div class="stat-box">
              <div class="stat-number">${s.posts}</div>
              <div class="stat-label">پست</div>
            </div>

            <div class="stat-box">
              <div class="stat-number">${s.followers}</div>
              <div class="stat-label">دنبال‌کننده</div>
            </div>

            <div class="stat-box">
              <div class="stat-number">${s.following}</div>
              <div class="stat-label">دنبال‌شده</div>
            </div>

          </div>

        </div>

        <div class="card menu">

          <a class="btn blue" href="/edit-profile">
            ✏️ ویرایش پروفایل
          </a>

          <a class="btn purple" href="/saved">
            🔖 ذخیره‌شده‌ها
          </a>

          <a class="btn" href="/notifications">
            🔔 اعلان‌ها
            ${
              counts.notifications
                ? `<span class="badge">${counts.notifications}</span>`
                : ""
            }
          </a>

          <a class="btn gray" href="/messages">
            💬 پیام‌ها
            ${
              counts.messages
                ? `<span class="badge">${counts.messages}</span>`
                : ""
            }
          </a>

          <a class="btn green" href="/jobs">
            💼 کاریابی
          </a>

          <a class="btn" href="/change-password">
            🔐 تغییر رمز
          </a>

          <form method="post" action="/logout">
            <button class="red">
              🚪 خروج از حساب
            </button>
          </form>

        </div>
        `,
        user
      );
    }

    if (method === "GET" && path === "/edit-profile") {

      return sendHtml(
        res,
        200,
        "ویرایش پروفایل",
        `
        <div class="card">

          <h3>✏️ ویرایش پروفایل</h3>

          <form method="post" action="/edit-profile">

            <input
              name="name"
              value="${escapeHtml(user.name)}"
              placeholder="نام"
              required
            >

            <button class="blue">
              💾 ذخیره تغییرات
            </button>

          </form>

        </div>
        `,
        user
      );
    }

    if (method === "POST" && path === "/edit-profile") {

      const b = await readBody(req);
      const name = (b.get("name") || "").trim();

      if (name) {

        await pool.query(
          `UPDATE users
           SET name=$1
           WHERE id=$2`,
          [name, user.id]
        );
      }

      return redirect(res, "/profile");
    }

    if (method === "GET" && path === "/change-password") {

      return sendHtml(
        res,
        200,
        "تغییر رمز",
        `
        <div class="card">

          <h3>🔐 تغییر رمز عبور</h3>

          <form method="post" action="/change-password">

            <input
              name="old"
              type="password"
              placeholder="رمز فعلی"
              required
            >

            <input
              name="new"
              type="password"
              minlength="6"
              placeholder="رمز جدید، حداقل ۶ کاراکتر"
              required
            >

            <button class="blue">
              تغییر رمز
            </button>

          </form>

        </div>
        `,
        user
      );
    }

    if (method === "POST" && path === "/change-password") {

      const b = await readBody(req);

      const oldPassword = b.get("old") || "";
      const newPassword = b.get("new") || "";

      const check = await pool.query(
        `SELECT id
         FROM users
         WHERE id=$1 AND password=$2`,
        [
          user.id,
          hashPassword(oldPassword)
        ]
      );

      if (!check.rowCount) {

        return sendHtml(
          res,
          400,
          "خطا",
          `
          <div class="card error">
            رمز فعلی اشتباه است.
          </div>
          `,
          user
        );
      }

      if (newPassword.length < 6) {

        return sendHtml(
          res,
          400,
          "خطا",
          `
          <div class="card error">
            رمز جدید باید حداقل ۶ کاراکتر باشد.
          </div>
          `,
          user
        );
      }

      await pool.query(
        `UPDATE users
         SET password=$1
         WHERE id=$2`,
        [
          hashPassword(newPassword),
          user.id
        ]
      );

      return redirect(res, "/profile");
    }

    if (method === "GET" && path === "/saved") {

      const result = await pool.query(
        `
        SELECT
          p.*,
          u.name

        FROM saved_posts s

        JOIN posts p
          ON p.id=s.post_id

        JOIN users u
          ON u.id=p.user_id

        WHERE s.user_id=$1

        ORDER BY p.created_at DESC
        `,
        [user.id]
      );

      let content = "";

      for (const post of result.rows) {

        content += `
          <div class="card">

            <div class="row">

              ${avatar(post.name, 45)}

              <div>
                <b>${escapeHtml(post.name)}</b>

                <div class="muted">
                  ${new Date(post.created_at).toLocaleString("fa-IR")}
                </div>
              </div>

            </div>

            <div class="text">
              ${escapeHtml(post.content)}
            </div>

            ${
              post.media_url
                ? `
                  <img
                    class="media"
                    src="${escapeHtml(post.media_url)}"
                  >
                `
                : ""
            }

            <a
              class="btn blue"
              href="/post?id=${post.id}"
            >
              مشاهده پست
            </a>

          </div>
        `;
      }

      if (!result.rowCount) {
        content = `
          <div class="card empty">
            🔖 هنوز پستی ذخیره نکرده‌ای.
          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "ذخیره‌شده‌ها",
        content,
        user
      );
    }

    if (method === "GET" && path === "/notifications") {

      const result = await pool.query(
        `
        SELECT
          n.*,
          a.name AS actor

        FROM notifications n

        LEFT JOIN users a
          ON a.id=n.actor_id

        WHERE n.user_id=$1

        ORDER BY n.created_at DESC

        LIMIT 50
        `,
        [user.id]
      );

      await pool.query(
        `UPDATE notifications
         SET read=true
         WHERE user_id=$1`,
        [user.id]
      );

      let content = "";

      for (const notification of result.rows) {

        let text = "یک اعلان جدید داری.";

        if (notification.type === "like") {
          text = "پست شما را پسندید.";
        }

        if (notification.type === "comment") {
          text = "روی پست شما نظر داد.";
        }

        if (notification.type === "follow") {
          text = "شما را دنبال کرد.";
        }

        if (notification.type === "message") {
          text = "برای شما پیام فرستاد.";
        }

        content += `
          <div class="card">

            <div class="row">

              ${avatar(notification.actor || "کاربر", 42)}

              <div>

                <b>
                  ${escapeHtml(notification.actor || "کاربر")}
                </b>

                <div style="margin-top:5px">
                  ${text}
                </div>

                <div class="muted">
                  ${new Date(notification.created_at).toLocaleString("fa-IR")}
                </div>

              </div>

            </div>

          </div>
        `;
      }

      if (!result.rowCount) {
        content = `
          <div class="card empty">
            🔔 اعلانی ندارید.
          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "اعلان‌ها",
        content,
        user
      );
    }

    if (method === "GET" && path === "/messages") {

      const otherId = Number(
        url.searchParams.get("user") || 0
      );

      if (!otherId) {

        const people = await pool.query(
          `
          SELECT
            u.id,
            u.name,
            u.email,

            (
              SELECT COUNT(*)
              FROM messages m
              WHERE m.sender_id=u.id
              AND m.receiver_id=$1
            )::int AS message_count

          FROM users u

          WHERE u.id<>$1

          AND NOT EXISTS(
            SELECT 1
            FROM blocks b
            WHERE b.blocker_id=$1
            AND b.blocked_id=u.id
          )

          ORDER BY u.name
          LIMIT 30
          `,
          [user.id]
        );

        let content = `
          <div class="card">

            <h3>💬 پیام‌ها</h3>

            <div class="notice">
              برای شروع گفتگو، یک کاربر را انتخاب کن.
            </div>

          </div>
        `;

        for (const person of people.rows) {

          content += `
            <div class="card">

              <div class="row">

                ${avatar(person.name, 48)}

                <div style="flex:1">

                  <b>
                    ${escapeHtml(person.name)}
                  </b>

                  <div class="muted ltr">
                    ${escapeHtml(person.email)}
                  </div>

                </div>

                <a
                  class="btn blue small-btn"
                  href="/messages?user=${person.id}"
                >
                  💬 گفتگو
                </a>

              </div>

            </div>
          `;
        }

        return sendHtml(
          res,
          200,
          "پیام‌ها",
          content,
          user
        );
      }

      const target = await pool.query(
        `SELECT id,name
         FROM users
         WHERE id=$1`,
        [otherId]
      );

      if (!target.rowCount) {
        return redirect(res, "/messages");
      }

      const isBlocked = await pool.query(
        `
        SELECT 1
        FROM blocks
        WHERE
          (blocker_id=$1 AND blocked_id=$2)
          OR
          (blocker_id=$2 AND blocked_id=$1)
        `,
        [user.id, otherId]
      );

      if (isBlocked.rowCount) {

        return sendHtml(
          res,
          403,
          "پیام",
          `
          <div class="card warning">
            امکان گفتگو با این کاربر وجود ندارد.
          </div>
          `,
          user
        );
      }

      const messages = await pool.query(
        `
        SELECT
          m.*,
          u.name

        FROM messages m

        JOIN users u
          ON u.id=m.sender_id

        WHERE
          (m.sender_id=$1 AND m.receiver_id=$2)
          OR
          (m.sender_id=$2 AND m.receiver_id=$1)

        ORDER BY m.created_at ASC
        `,
        [user.id, otherId]
      );

      let content = `
        <div class="card">

          <div class="row">

            ${avatar(target.rows[0].name, 50)}

            <div>
              <h3 style="margin:0">
                ${escapeHtml(target.rows[0].name)}
              </h3>

              <div class="muted">
                گفتگوی خصوصی
              </div>
            </div>

          </div>

        </div>
      `;

      for (const message of messages.rows) {

        const mine = message.sender_id === user.id;

        content += `
          <div class="${mine ? "message-me" : "message-other"}">

            <b>
              ${mine ? "شما" : escapeHtml(message.name)}
            </b>

            <div class="text">
              ${escapeHtml(message.content)}
            </div>

            <div class="muted">
              ${new Date(message.created_at).toLocaleString("fa-IR")}
            </div>

          </div>
        `;
      }

      content += `
        <div class="card">

          <form
            method="post"
            action="/messages?user=${otherId}"
          >

            <textarea
              name="content"
              maxlength="3000"
              placeholder="پیام خود را بنویس..."
              required
            ></textarea>

            <button class="blue full">
              📤 ارسال پیام
            </button>

          </form>

        </div>
      `;

      return sendHtml(
        res,
        200,
        "پیام",
        content,
        user
      );
    }

    if (method === "POST" && path === "/messages") {

      const otherId = Number(
        url.searchParams.get("user")
      );

      const b = await readBody(req);

      const content =
        (b.get("content") || "").trim();

      if (
        content &&
        otherId &&
        otherId !== user.id
      ) {

        const blocked = await pool.query(
          `
          SELECT 1
          FROM blocks
          WHERE
            (blocker_id=$1 AND blocked_id=$2)
            OR
            (blocker_id=$2 AND blocked_id=$1)
          `,
          [user.id, otherId]
        );

        if (!blocked.rowCount) {

          await pool.query(
            `INSERT INTO messages
             (sender_id,receiver_id,content)
             VALUES($1,$2,$3)`,
            [
              user.id,
              otherId,
              content
            ]
          );

          await pool.query(
            `INSERT INTO notifications
             (user_id,actor_id,type)
             VALUES($1,$2,'message')`,
            [
              otherId,
              user.id
            ]
          );
        }
      }

      return redirect(
        res,
        `/messages?user=${otherId}`
      );
    }

    if (method === "GET" && path === "/report") {

      const postId = Number(
        url.searchParams.get("post") || 0
      );

      const reportedUser = Number(
        url.searchParams.get("user") || 0
      );

      return sendHtml(
        res,
        200,
        "گزارش",
        `
        <div class="card">

          <h3>🚩 گزارش</h3>

          <div class="notice">
            دلیل گزارش را بنویس.
          </div>

          <form method="post" action="/report">

            <input
              type="hidden"
              name="post"
              value="${postId}"
            >

            <input
              type="hidden"
              name="user"
              value="${reportedUser}"
            >

            <textarea
              name="reason"
              maxlength="1000"
              placeholder="دلیل گزارش..."
              required
            ></textarea>

            <button class="red">
              🚩 ارسال گزارش
            </button>

          </form>

        </div>
        `,
        user
      );
    }

    if (method === "POST" && path === "/report") {

      const b = await readBody(req);

      const postId =
        Number(b.get("post") || 0) || null;

      const reportedUser =
        Number(b.get("user") || 0) || null;

      const reason =
        (b.get("reason") || "").trim();

      if (reason) {

        await pool.query(
          `
          INSERT INTO reports
          (reporter_id,post_id,reported_user_id,reason)
          VALUES($1,$2,$3,$4)
          `,
          [
            user.id,
            postId,
            reportedUser,
            reason
          ]
        );
      }

      return redirect(res, "/");
    }

    if (method === "GET" && path === "/jobs") {

      const jobs = await pool.query(
        `
        SELECT
          j.*,
          u.name

        FROM jobs j

        JOIN users u
          ON u.id=j.user_id

        ORDER BY j.created_at DESC

        LIMIT 50
        `
      );

      let content = `
        <div class="card">

          <div class="row">

            <div style="flex:1">
              <h2 style="margin:0">
                💼 کاریابی
              </h2>

              <div class="muted">
                آگهی‌های شغلی کاربران
              </div>
            </div>

            <a
              class="btn green"
              href="/new-job"
            >
              ➕ ثبت آگهی
            </a>

          </div>

        </div>
      `;

      for (const job of jobs.rows) {

        content += `
          <div class="job">

            <h3>
              ${escapeHtml(job.title)}
            </h3>

            <div class="muted">
              👤 منتشرکننده:
              ${escapeHtml(job.name)}
            </div>

            <div style="margin-top:9px">
              📍 ${escapeHtml(job.city || "نامشخص")}
            </div>

            <div class="success" style="margin-top:7px">
              💰 ${escapeHtml(job.salary || "توافقی")}
            </div>

            <div class="text">
              ${escapeHtml(job.description || "")}
            </div>

            <div class="muted">
              ${new Date(job.created_at).toLocaleString("fa-IR")}
            </div>

          </div>
        `;
      }

      if (!jobs.rowCount) {

        content += `
          <div class="card empty">
            هنوز آگهی شغلی ثبت نشده است.
          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "کاریابی",
        content,
        user
      );
    }

    if (method === "GET" && path === "/new-job") {

      return sendHtml(
        res,
        200,
        "آگهی شغلی جدید",
        `
        <div class="card">

          <h3>
            💼 ثبت آگهی شغلی
          </h3>

          <form method="post" action="/new-job">

            <input
              name="title"
              placeholder="عنوان شغل"
              required
            >

            <input
              name="city"
              placeholder="شهر"
            >

            <input
              name="salary"
              placeholder="حقوق"
            >

            <textarea
              name="description"
              placeholder="توضیحات کامل آگهی..."
              required
            ></textarea>

            <button class="green full">
              🚀 انتشار آگهی
            </button>

          </form>

        </div>
        `,
        user
      );
    }

    if (method === "POST" && path === "/new-job") {

      const b = await readBody(req);

      const title =
        (b.get("title") || "").trim();

      const city =
        (b.get("city") || "").trim();

      const salary =
        (b.get("salary") || "").trim();

      const description =
        (b.get("description") || "").trim();

      if (title && description) {

        await pool.query(
          `
          INSERT INTO jobs
          (user_id,title,city,salary,description)
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

      return redirect(res, "/jobs");
    }

    return sendHtml(
      res,
      404,
      "صفحه پیدا نشد",
      `
      <div class="card empty">

        <div style="font-size:45px">
          🔍
        </div>

        <h3>
          صفحه موردنظر پیدا نشد
        </h3>

        <a class="btn blue" href="/">
          🏠 بازگشت به خانه
        </a>

      </div>
      `,
      user
    );

  } catch (error) {

    console.error("REQUEST ERROR:", error);

    if (!res.headersSent) {

      return sendHtml(
        res,
        500,
        "خطای سرور",
        `
        <div class="card">

          <div class="error">
            خطایی در اجرای درخواست رخ داد.
          </div>

          <div class="muted">
            Logs رندر را برای جزئیات بررسی کنید.
          </div>

          <br>

          <a class="btn blue" href="/">
            بازگشت به خانه
          </a>

        </div>
        `,
        user
      );
    }

    res.end();
  }
}

async function start() {

  try {

    await pool.query("SELECT NOW()");

    console.log("Database connection successful.");

    await initDatabase();

    const server = http.createServer(app);

    server.on("clientError", (error, socket) => {

      console.error(
        "CLIENT ERROR:",
        error.message
      );

      try {
        socket.end(
          "HTTP/1.1 400 Bad Request\r\n\r\n"
        );
      } catch {}
    });

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
      error.message
    );

    process.exit(1);
  }
}

start();
