const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

/* =========================
   ابزارهای اصلی
========================= */

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
}

function token() {
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
    const i = part.indexOf("=");

    if (i === -1) continue;

    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();

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
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 2 * 1024 * 1024) {
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

function sessionCookie(id) {
  return `sessionId=${encodeURIComponent(id)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`;
}

function clearCookie() {
  return "sessionId=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}

function redirect(res, location, cookie = null) {
  const headers = {
    Location: location
  };

  if (cookie) {
    headers["Set-Cookie"] = cookie;
  }

  res.writeHead(302, headers);
  res.end();
}

async function getUser(req) {
  const id = parseCookies(req).sessionId;

  if (!id) return null;

  const result = await pool.query(
    `
    SELECT u.id, u.name, u.email
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

function avatar(name) {
  const first = String(name || "?").trim().charAt(0) || "?";

  return `
    <div class="avatar">
      ${escapeHtml(first)}
    </div>
  `;
}

function buttonForm(action, text, cls = "") {
  return `
    <form method="post" action="${action}" class="inline">
      <button class="${cls}">${text}</button>
    </form>
  `;
}

/* =========================
   ظاهر سایت
========================= */

function layout(title, content, user) {

  const nav = user ? `
    <nav class="bottom-nav">

      <a href="/">
        <span>🏠</span>
        <small>خانه</small>
      </a>

      <a href="/search">
        <span>🔎</span>
        <small>جستجو</small>
      </a>

      <a href="/new-post" class="nav-plus">
        <span>＋</span>
        <small>پست</small>
      </a>

      <a href="/messages">
        <span>💬</span>
        <small>پیام</small>
      </a>

      <a href="/profile">
        <span>👤</span>
        <small>پروفایل</small>
      </a>

    </nav>
  ` : "";

  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<meta
  name="theme-color"
  content="#111827"
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
  background: #edf0f4;
  color: #18202a;
  font-family: Tahoma, Arial, sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

.app {
  width: 100%;
  max-width: 720px;
  min-height: 100vh;
  margin: auto;
  background: #f8fafc;
  padding-bottom: 95px;
}

.header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,.96);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #e5e7eb;
  padding: 16px;
  text-align: center;
  font-size: 19px;
  font-weight: bold;
}

.content {
  padding: 14px;
}

.card {
  background: white;
  border: 1px solid #e4e7eb;
  border-radius: 18px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 5px 18px rgba(0,0,0,.04);
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 52px;
  height: 52px;
  min-width: 52px;
  border-radius: 50%;
  background: #111827;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 21px;
  font-weight: bold;
}

.name {
  font-weight: bold;
  font-size: 15px;
}

.muted {
  color: #737b86;
  font-size: 12px;
}

.ltr {
  direction: ltr;
  text-align: right;
}

.text {
  margin: 15px 0;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  color: #626b75;
  font-size: 13px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 13px;
}

.inline {
  display: inline;
  margin: 0;
}

button,
.btn {
  display: inline-block;
  border: 0;
  border-radius: 12px;
  padding: 10px 14px;
  background: #111827;
  color: white;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
}

button:hover,
.btn:hover {
  opacity: .9;
}

.full {
  width: 100%;
  margin-top: 8px;
}

.blue {
  background: #2563eb;
}

.green {
  background: #15803d;
}

.pink {
  background: #db2777;
}

.purple {
  background: #7c3aed;
}

.red {
  background: #b91c1c;
}

.gray {
  background: #64748b;
}

.orange {
  background: #c2410c;
}

input,
textarea,
select {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  padding: 13px;
  margin: 6px 0;
  font-family: inherit;
  font-size: 15px;
  background: white;
  outline: none;
}

input:focus,
textarea:focus,
select:focus {
  border-color: #2563eb;
}

textarea {
  min-height: 125px;
  resize: vertical;
}

.top-grid {
  display: grid;
  grid-template-columns: repeat(2,1fr);
  gap: 9px;
  margin-top: 14px;
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

.media {
  display: block;
  width: 100%;
  max-height: 520px;
  object-fit: contain;
  border-radius: 15px;
  margin-top: 10px;
  background: #f1f5f9;
}

.comment {
  background: #f1f5f9;
  border-radius: 13px;
  padding: 11px;
  margin-top: 9px;
}

.comment-name {
  font-weight: bold;
}

.job {
  background: white;
  border: 1px solid #e1e5ea;
  border-radius: 16px;
  padding: 15px;
  margin-bottom: 12px;
}

.job-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 9px;
}

.job-line {
  margin: 6px 0;
  color: #4b5563;
}

.job-description {
  margin-top: 12px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.notice {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  padding: 13px;
  line-height: 1.8;
  margin-bottom: 12px;
}

.success {
  color: #15803d;
}

.error {
  color: #b91c1c;
}

.empty {
  text-align: center;
  color: #777;
  padding: 35px 10px;
}

.badge {
  display: inline-block;
  background: #dc2626;
  color: white;
  border-radius: 20px;
  padding: 3px 8px;
  font-size: 10px;
}

.divider {
  height: 1px;
  background: #e5e7eb;
  margin: 17px 0;
}

.bottom-nav {
  position: fixed;
  z-index: 100;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 720px;
  height: 74px;
  background: rgba(255,255,255,.98);
  border-top: 1px solid #ddd;
  display: flex;
  justify-content: space-around;
  align-items: center;
  box-shadow: 0 -5px 18px rgba(0,0,0,.06);
}

.bottom-nav a {
  min-width: 58px;
  text-align: center;
  color: #5b6470;
}

.bottom-nav span {
  display: block;
  font-size: 22px;
  line-height: 27px;
}

.bottom-nav small {
  font-size: 10px;
}

.nav-plus span {
  font-size: 29px;
  font-weight: bold;
}

@media(max-width:450px) {

  .content {
    padding: 10px;
  }

  .card {
    padding: 13px;
    border-radius: 15px;
  }

  .top-grid {
    grid-template-columns: 1fr;
  }

  .actions button,
  .actions .btn {
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

${nav}

</body>

</html>
`;
}

function sendHtml(res, status, title, content, user = null) {

  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(
    layout(title, content, user)
  );
}

/* =========================
   ساخت دیتابیس
========================= */

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
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      media_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL
        REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, post_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL
        REFERENCES posts(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(follower_id, following_id),
      CHECK(follower_id <> following_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_posts (
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL
        REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, post_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER
        REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      post_id INTEGER
        REFERENCES posts(id) ON DELETE CASCADE,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER
        REFERENCES posts(id) ON DELETE CASCADE,
      reported_user_id INTEGER
        REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(blocker_id, blocked_id),
      CHECK(blocker_id <> blocked_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      city TEXT,
      salary TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log("Database initialized.");
}

/* =========================
   برنامه
========================= */

async function app(req, res) {

  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  const path = url.pathname;
  const method = req.method;

  try {

    const user = await getUser(req);

    /* health */

    if (method === "GET" && path === "/health") {

      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
      });

      return res.end("OK");
    }

    /* =====================
       ثبت نام
    ===================== */

    if (method === "GET" && path === "/register") {

      return sendHtml(
        res,
        200,
        "ثبت‌نام",
        `
        <div class="card">

          <h2>ساخت حساب جدید</h2>

          <p class="muted">
            حساب خودت را بساز و وارد برنامه شو.
          </p>

          <form method="post" action="/register">

            <input
              name="name"
              placeholder="نام"
              maxlength="100"
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
              placeholder="رمز عبور"
              required
            >

            <button class="green full">
              ثبت‌نام
            </button>

          </form>

          <div class="divider"></div>

          <a class="btn gray full" href="/login">
            ورود به حساب
          </a>

        </div>
        `
      );
    }

    if (method === "POST" && path === "/register") {

      const b = await readBody(req);

      const name = (b.get("name") || "").trim();
      const email = (b.get("email") || "")
        .trim()
        .toLowerCase();

      const password = b.get("password") || "";

      if (
        !name ||
        !email ||
        password.length < 6
      ) {

        return sendHtml(
          res,
          400,
          "خطا",
          `
          <div class="card error">
            اطلاعات واردشده معتبر نیست.
          </div>

          <a class="btn" href="/register">
            بازگشت
          </a>
          `
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

          <a class="btn" href="/login">
            ورود
          </a>
          `
        );
      }

      const result = await pool.query(
        `
        INSERT INTO users(name,email,password)
        VALUES($1,$2,$3)
        RETURNING id
        `,
        [
          name,
          email,
          hashPassword(password)
        ]
      );

      const sid = token();

      await pool.query(
        `
        INSERT INTO sessions(session_id,user_id)
        VALUES($1,$2)
        `,
        [
          sid,
          result.rows[0].id
        ]
      );

      return redirect(
        res,
        "/",
        sessionCookie(sid)
      );
    }

    /* =====================
       ورود
    ===================== */

    if (method === "GET" && path === "/login") {

      return sendHtml(
        res,
        200,
        "ورود",
        `
        <div class="card">

          <h2>خوش آمدی 👋</h2>

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

            <button class="full">
              ورود
            </button>

          </form>

          <div class="divider"></div>

          <a class="btn gray full" href="/register">
            ساخت حساب جدید
          </a>

        </div>
        `
      );
    }

    if (method === "POST" && path === "/login") {

      const b = await readBody(req);

      const email = (b.get("email") || "")
        .trim()
        .toLowerCase();

      const password = b.get("password") || "";

      const result = await pool.query(
        `
        SELECT id
        FROM users
        WHERE email=$1 AND password=$2
        `,
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

          <a class="btn" href="/login">
            بازگشت
          </a>
          `
        );
      }

      const sid = token();

      await pool.query(
        `
        INSERT INTO sessions(session_id,user_id)
        VALUES($1,$2)
        `,
        [
          sid,
          result.rows[0].id
        ]
      );

      return redirect(
        res,
        "/",
        sessionCookie(sid)
      );
    }

    /* =====================
       نیاز به ورود
    ===================== */

    if (!user) {
      return redirect(res, "/login");
    }

    /* =====================
       خروج
    ===================== */

    if (method === "POST" && path === "/logout") {

      const sid = parseCookies(req).sessionId;

      if (sid) {

        await pool.query(
          "DELETE FROM sessions WHERE session_id=$1",
          [sid]
        );
      }

      return redirect(
        res,
        "/login",
        clearCookie()
      );
    }

    /* =====================
       خانه
    ===================== */

    if (method === "GET" && path === "/") {

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
            WHERE l.user_id=$1
              AND l.post_id=p.id
          ) AS liked,

          EXISTS(
            SELECT 1
            FROM saved_posts s
            WHERE s.user_id=$1
              AND s.post_id=p.id
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

      const unread = await pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM notifications
        WHERE user_id=$1
          AND read=false
        `,
        [user.id]
      );

      let content = `

        <div class="card">

          <div class="row">

            ${avatar(user.name)}

            <div>

              <div class="name">
                ${escapeHtml(user.name)}
              </div>

              <div class="muted ltr">
                ${escapeHtml(user.email)}
              </div>

            </div>

          </div>

          <div class="top-grid">

            <a class="btn green" href="/new-post">
              ➕ انتشار پست
            </a>

            <a class="btn orange" href="/jobs">
              💼 کاریابی
            </a>

          </div>

        </div>

      `;

      if (unread.rows[0].count > 0) {

        content += `
          <a href="/notifications" class="notice">
            🔔 شما
            <span class="badge">
              ${unread.rows[0].count}
            </span>
            اعلان خوانده‌نشده دارید.
          </a>
        `;
      }

      for (const post of posts.rows) {

        content += `

        <article class="card">

          <div class="row">

            ${avatar(post.name)}

            <div>

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
                  alt="رسانه"
                >
              </a>
              `
              : ""
          }

          <div class="stats">

            <span>
              ❤️ ${post.likes}
            </span>

            <span>
              💬 ${post.comments}
            </span>

            ${
              post.saved
                ? `<span>🔖 ذخیره شده</span>`
                : ""
            }

          </div>

          <div class="actions">

            ${buttonForm(
              `/like?id=${post.id}`,
              post.liked
                ? "💔 لغو لایک"
                : "❤️ لایک",
              "pink"
            )}

            ${buttonForm(
              `/save?id=${post.id}`,
              post.saved
                ? "🔖 حذف ذخیره"
                : "🔖 ذخیره",
              "purple"
            )}

            <a
              class="btn gray"
              href="/post?id=${post.id}"
            >
              💬 نظر
            </a>

            ${
              post.user_id === user.id
                ? `
                <a
                  class="btn"
                  href="/edit-post?id=${post.id}"
                >
                  ✏️ ویرایش
                </a>

                ${buttonForm(
                  `/delete-post?id=${post.id}`,
                  "🗑️ حذف",
                  "red"
                )}
                `
                : `
                <a
                  class="btn gray"
                  href="/report?post=${post.id}"
                >
                  🚩 گزارش
                </a>
                `
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
            اولین پست را تو منتشر کن 👋
          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "خانه",
        content,
        user
      );
    }

    /* =====================
       پست جدید
    ===================== */

    if (method === "GET" && path === "/new-post") {

      return sendHtml(
        res,
        200,
        "انتشار پست",
        `
        <div class="card">

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

      const content =
        (b.get("content") || "").trim();

      const media =
        (b.get("media_url") || "").trim() || null;

      if (!content) {
        return redirect(res, "/new-post");
      }

      await pool.query(
        `
        INSERT INTO posts(user_id,content,media_url)
        VALUES($1,$2,$3)
        `,
        [
          user.id,
          content,
          media
        ]
      );

      return redirect(res, "/");
    }

    /* =====================
       لایک
    ===================== */

    if (method === "POST" && path === "/like") {

      const id = Number(
        url.searchParams.get("id")
      );

      const post = await pool.query(
        `
        SELECT user_id
        FROM posts
        WHERE id=$1
        `,
        [id]
      );

      if (!post.rowCount) {
        return redirect(res, "/");
      }

      const existing = await pool.query(
        `
        SELECT 1
        FROM likes
        WHERE user_id=$1
          AND post_id=$2
        `,
        [
          user.id,
          id
        ]
      );

      if (existing.rowCount) {

        await pool.query(
          `
          DELETE FROM likes
          WHERE user_id=$1
            AND post_id=$2
          `,
          [
            user.id,
            id
          ]
        );

      } else {

        await pool.query(
          `
          INSERT INTO likes(user_id,post_id)
          VALUES($1,$2)
          ON CONFLICT DO NOTHING
          `,
          [
            user.id,
            id
          ]
        );

        if (post.rows[0].user_id !== user.id) {

          await pool.query(
            `
            INSERT INTO notifications
            (user_id,actor_id,type,post_id)
            VALUES($1,$2,'like',$3)
            `,
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

    /* =====================
       ذخیره
    ===================== */

    if (method === "POST" && path === "/save") {

      const id = Number(
        url.searchParams.get("id")
      );

      const existing = await pool.query(
        `
        SELECT 1
        FROM saved_posts
        WHERE user_id=$1
          AND post_id=$2
        `,
        [
          user.id,
          id
        ]
      );

      if (existing.rowCount) {

        await pool.query(
          `
          DELETE FROM saved_posts
          WHERE user_id=$1
            AND post_id=$2
          `,
          [
            user.id,
            id
          ]
        );

      } else {

        await pool.query(
          `
          INSERT INTO saved_posts(user_id,post_id)
          VALUES($1,$2)
          ON CONFLICT DO NOTHING
          `,
          [
            user.id,
            id
          ]
        );
      }

      return redirect(res, "/");
    }

    /* =====================
       صفحه پست + نظرات
    ===================== */

    if (method === "GET" && path === "/post") {

      const id = Number(
        url.searchParams.get("id")
      );

      const result = await pool.query(
        `
        SELECT
          p.*,
          u.name,

          (
            SELECT COUNT(*)
            FROM likes
            WHERE post_id=p.id
          )::int AS likes

        FROM posts p

        JOIN users u
          ON u.id=p.user_id

        WHERE p.id=$1
        `,
        [id]
      );

      if (!result.rowCount) {

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

      const post = result.rows[0];

      const comments = await pool.query(
        `
        SELECT
          c.*,
          u.name

        FROM comments c

        JOIN users u
          ON u.id=c.user_id

        WHERE c.post_id=$1

        ORDER BY c.created_at ASC
        `,
        [id]
      );

      let content = `

        <div class="card">

          <div class="row">

            ${avatar(post.name)}

            <div>

              <div class="name">
                ${escapeHtml(post.name)}
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
                >
              </a>
              `
              : ""
          }

          <div class="stats">
            ❤️ ${post.likes}
          </div>

        </div>

        <div class="card">

          <h3>💬 نظرات</h3>

          <form
            method="post"
            action="/comment?id=${id}"
          >

            <textarea
              name="content"
              maxlength="2000"
              placeholder="نظر خودت را بنویس..."
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

            <div class="comment-name">
              ${escapeHtml(comment.name)}
            </div>

            <div class="muted">
              ${new Date(
                comment.created_at
              ).toLocaleString("fa-IR")}
            </div>

            <div class="text">
              ${escapeHtml(comment.content)}
            </div>

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

      const id = Number(
        url.searchParams.get("id")
      );

      const b = await readBody(req);

      const content =
        (b.get("content") || "").trim();

      if (content) {

        const post = await pool.query(
          `
          SELECT user_id
          FROM posts
          WHERE id=$1
          `,
          [id]
        );

        if (post.rowCount) {

          await pool.query(
            `
            INSERT INTO comments
            (user_id,post_id,content)
            VALUES($1,$2,$3)
            `,
            [
              user.id,
              id,
              content
            ]
          );

          if (post.rows[0].user_id !== user.id) {

            await pool.query(
              `
              INSERT INTO notifications
              (user_id,actor_id,type,post_id)
              VALUES($1,$2,'comment',$3)
              `,
              [
                post.rows[0].user_id,
                user.id,
                id
              ]
            );
          }
        }
      }

      return redirect(
        res,
        `/post?id=${id}`
      );
    }

    /* =====================
       ویرایش پست
    ===================== */

    if (method === "GET" && path === "/edit-post") {

      const id = Number(
        url.searchParams.get("id")
      );

      const result = await pool.query(
        `
        SELECT *
        FROM posts
        WHERE id=$1
          AND user_id=$2
        `,
        [
          id,
          user.id
        ]
      );

      if (!result.rowCount) {
        return redirect(res, "/");
      }

      const post = result.rows[0];

      return sendHtml(
        res,
        200,
        "ویرایش پست",
        `
        <div class="card">

          <form
            method="post"
            action="/edit-post?id=${id}"
          >

            <textarea
              name="content"
              required
            >${escapeHtml(post.content)}</textarea>

            <input
              name="media_url"
              type="url"
              value="${escapeHtml(
                post.media_url || ""
              )}"
              placeholder="لینک رسانه"
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

      const id = Number(
        url.searchParams.get("id")
      );

      const b = await readBody(req);

      const content =
        (b.get("content") || "").trim();

      const media =
        (b.get("media_url") || "").trim() || null;

      if (content) {

        await pool.query(
          `
          UPDATE posts
          SET content=$1,
              media_url=$2
          WHERE id=$3
            AND user_id=$4
          `,
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

    /* =====================
       حذف پست
    ===================== */

    if (method === "POST" && path === "/delete-post") {

      const id = Number(
        url.searchParams.get("id")
      );

      await pool.query(
        `
        DELETE FROM posts
        WHERE id=$1
          AND user_id=$2
        `,
        [
          id,
          user.id
        ]
      );

      return redirect(res, "/");
    }

    /* =====================
       جستجو
    ===================== */

    if (method === "GET" && path === "/search") {

      const q =
        (url.searchParams.get("q") || "").trim();

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

        const result = await pool.query(
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

        for (const person of result.rows) {

          content += `
            <div class="card">

              <div class="row">

                ${avatar(person.name)}

                <div>

                  <div class="name">
                    <a href="/user?id=${person.id}">
                      ${escapeHtml(person.name)}
                    </a>
                  </div>

                  <div class="muted ltr">
                    ${escapeHtml(person.email)}
                  </div>

                </div>

              </div>

            </div>
          `;
        }

        if (!result.rowCount) {

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

    /* =====================
       پروفایل کاربر
    ===================== */

    if (method === "GET" && path === "/user") {

      const id = Number(
        url.searchParams.get("id")
      );

      const person = await pool.query(
        `
        SELECT id,name,email,created_at
        FROM users
        WHERE id=$1
        `,
        [id]
      );

      if (!person.rowCount) {

        return sendHtml(
          res,
          404,
          "کاربر",
          `
          <div class="card empty">
            کاربر پیدا نشد.
          </div>
          `,
          user
        );
      }

      const target = person.rows[0];

      const following = await pool.query(
        `
        SELECT 1
        FROM follows
        WHERE follower_id=$1
          AND following_id=$2
        `,
        [
          user.id,
          id
        ]
      );

      const followers = await pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM follows
        WHERE following_id=$1
        `,
        [id]
      );

      const targetPosts = await pool.query(
        `
        SELECT *
        FROM posts
        WHERE user_id=$1
        ORDER BY created_at DESC
        LIMIT 30
        `,
        [id]
      );

      let content = `

        <div class="card">

          <div class="row">

            ${avatar(target.name)}

            <div>

              <h2>
                ${escapeHtml(target.name)}
              </h2>

              <div class="muted ltr">
                ${escapeHtml(target.email)}
              </div>

            </div>

          </div>

          <div class="stats" style="margin-top:15px">

            <span>
              👥 ${followers.rows[0].count}
              دنبال‌کننده
            </span>

          </div>

          ${
            id !== user.id
              ? `
              <div class="actions">

                ${buttonForm(
                  `/follow?id=${id}`,
                  following.rowCount
                    ? "➖ لغو دنبال"
                    : "➕ دنبال کردن",
                  "blue"
                )}

                <a
                  class="btn"
                  href="/messages?user=${id}"
                >
                  💬 پیام
                </a>

                <a
                  class="btn gray"
                  href="/report?user=${id}"
                >
                  🚩 گزارش
                </a>

                ${buttonForm(
                  `/block?id=${id}`,
                  "🚫 مسدود کردن",
                  "red"
                )}

              </div>
              `
              : ""
          }

        </div>

      `;

      for (const post of targetPosts.rows) {

        content += `
          <div class="card">

            <div class="muted">
              ${new Date(
                post.created_at
              ).toLocaleString("fa-IR")}
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
              💬 مشاهده پست
            </a>

          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "پروفایل",
        content,
        user
      );
    }

    /* =====================
       دنبال کردن
    ===================== */

    if (method === "POST" && path === "/follow") {

      const id = Number(
        url.searchParams.get("id")
      );

      if (id !== user.id) {

        const existing = await pool.query(
          `
          SELECT 1
          FROM follows
          WHERE follower_id=$1
            AND following_id=$2
          `,
          [
            user.id,
            id
          ]
        );

        if (existing.rowCount) {

          await pool.query(
            `
            DELETE FROM follows
            WHERE follower_id=$1
              AND following_id=$2
            `,
            [
              user.id,
              id
            ]
          );

        } else {

          await pool.query(
            `
            INSERT INTO follows
            (follower_id,following_id)
            VALUES($1,$2)
            ON CONFLICT DO NOTHING
            `,
            [
              user.id,
              id
            ]
          );

          await pool.query(
            `
            INSERT INTO notifications
            (user_id,actor_id,type)
            VALUES($1,$2,'follow')
            `,
            [
              id,
              user.id
            ]
          );
        }
      }

      return redirect(
        res,
        `/user?id=${id}`
      );
    }

    /* =====================
       مسدود کردن
    ===================== */

    if (method === "POST" && path === "/block") {

      const id = Number(
        url.searchParams.get("id")
      );

      if (id !== user.id) {

        await pool.query(
          `
          INSERT INTO blocks
          (blocker_id,blocked_id)
          VALUES($1,$2)
          ON CONFLICT DO NOTHING
          `,
          [
            user.id,
            id
          ]
        );

        await pool.query(
          `
          DELETE FROM follows
          WHERE
            (follower_id=$1 AND following_id=$2)
            OR
            (follower_id=$2 AND following_id=$1)
          `,
          [
            user.id,
            id
          ]
        );
      }

      return redirect(res, "/");
    }

    /* =====================
       پروفایل من
    ===================== */

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
        )::int AS following,

        (
          SELECT COUNT(*)
          FROM saved_posts
          WHERE user_id=$1
        )::int AS saved
        `,
        [user.id]
      );

      const s = stats.rows[0];

      return sendHtml(
        res,
        200,
        "پروفایل من",
        `
        <div class="card">

          <div class="row">

            ${avatar(user.name)}

            <div>

              <h2>
                ${escapeHtml(user.name)}
              </h2>

              <div class="muted ltr">
                ${escapeHtml(user.email)}
              </div>

            </div>

          </div>

          <div class="stats" style="margin-top:18px">

            <span>
              📝 پست: ${s.posts}
            </span>

            <span>
              👥 دنبال‌کننده: ${s.followers}
            </span>

            <span>
              ➕ دنبال‌شده: ${s.following}
            </span>

            <span>
              🔖 ذخیره: ${s.saved}
            </span>

          </div>

        </div>

        <div class="card menu">

          <a class="btn" href="/edit-profile">
            ✏️ ویرایش پروفایل
          </a>

          <a class="btn purple" href="/saved">
            🔖 ذخیره‌شده‌ها
          </a>

          <a class="btn" href="/notifications">
            🔔 اعلان‌ها
          </a>

          <a class="btn orange" href="/jobs">
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

    /* =====================
       ویرایش پروفایل
    ===================== */

    if (
      method === "GET" &&
      path === "/edit-profile"
    ) {

      return sendHtml(
        res,
        200,
        "ویرایش پروفایل",
        `
        <div class="card">

          <form
            method="post"
            action="/edit-profile"
          >

            <input
              name="name"
              value="${escapeHtml(user.name)}"
              maxlength="100"
              required
            >

            <button class="blue">
              💾 ذخیره
            </button>

          </form>

        </div>
        `,
        user
      );
    }

    if (
      method === "POST" &&
      path === "/edit-profile"
    ) {

      const b = await readBody(req);

      const name =
        (b.get("name") || "").trim();

      if (name) {

        await pool.query(
          `
          UPDATE users
          SET name=$1
          WHERE id=$2
          `,
          [
            name,
            user.id
          ]
        );
      }

      return redirect(
        res,
        "/profile"
      );
    }

    /* =====================
       ذخیره‌شده‌ها
    ===================== */

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

              ${avatar(post.name)}

              <b>
                ${escapeHtml(post.name)}
              </b>

            </div>

            <div class="text">
              ${escapeHtml(post.content)}
            </div>

            <a
              class="btn gray"
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

    /* =====================
       اعلان‌ها
    ===================== */

    if (
      method === "GET" &&
      path === "/notifications"
    ) {

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
        `
        UPDATE notifications
        SET read=true
        WHERE user_id=$1
        `,
        [user.id]
      );

      let content = "";

      for (const n of result.rows) {

        let text = "یک اعلان جدید.";

        if (n.type === "like") {
          text = "پست شما را پسندید.";
        }

        if (n.type === "comment") {
          text = "روی پست شما نظر داد.";
        }

        if (n.type === "follow") {
          text = "شما را دنبال کرد.";
        }

        if (n.type === "message") {
          text = "برای شما پیام فرستاد.";
        }

        content += `
          <div class="card">

            🔔

            <b>
              ${escapeHtml(
                n.actor || "کاربر"
              )}
            </b>

            ${text}

            <div class="muted">
              ${new Date(
                n.created_at
              ).toLocaleString("fa-IR")}
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

    /* =====================
       تغییر رمز
    ===================== */

    if (
      method === "GET" &&
      path === "/change-password"
    ) {

      return sendHtml(
        res,
        200,
        "تغییر رمز",
        `
        <div class="card">

          <form
            method="post"
            action="/change-password"
          >

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
              placeholder="رمز جدید"
              required
            >

            <button class="blue">
              🔐 تغییر رمز
            </button>

          </form>

        </div>
        `,
        user
      );
    }

    if (
      method === "POST" &&
      path === "/change-password"
    ) {

      const b = await readBody(req);

      const oldPassword =
        b.get("old") || "";

      const newPassword =
        b.get("new") || "";

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

      const check = await pool.query(
        `
        SELECT id
        FROM users
        WHERE id=$1
          AND password=$2
        `,
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

      await pool.query(
        `
        UPDATE users
        SET password=$1
        WHERE id=$2
        `,
        [
          hashPassword(newPassword),
          user.id
        ]
      );

      return redirect(
        res,
        "/profile"
      );
    }

    /* =====================
       پیام‌ها
    ===================== */

    if (
      method === "GET" &&
      path === "/messages"
    ) {

      const otherId = Number(
        url.searchParams.get("user") || 0
      );

      if (!otherId) {

        const people = await pool.query(
          `
          SELECT id,name,email
          FROM users
          WHERE id<>$1
          ORDER BY name
          LIMIT 30
          `,
          [user.id]
        );

        let content = `
          <div class="card">

            <h3>💬 پیام‌ها</h3>

            <p class="muted">
              برای شروع یک گفتگو، کاربر را انتخاب کن.
            </p>

          </div>
        `;

        for (const person of people.rows) {

          content += `
            <div class="card">

              <div class="row">

                ${avatar(person.name)}

                <div>

                  <b>
                    ${escapeHtml(person.name)}
                  </b>

                  <div class="muted ltr">
                    ${escapeHtml(person.email)}
                  </div>

                </div>

              </div>

              <div style="margin-top:12px">

                <a
                  class="btn blue"
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
        `
        SELECT id,name,email
        FROM users
        WHERE id=$1
        `,
        [otherId]
      );

      if (!target.rowCount) {
        return redirect(res, "/messages");
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
        [
          user.id,
          otherId
        ]
      );

      let content = `

        <div class="card">

          <div class="row">

            ${avatar(target.rows[0].name)}

            <div>

              <b>
                ${escapeHtml(
                  target.rows[0].name
                )}
              </b>

              <div class="muted ltr">
                ${escapeHtml(
                  target.rows[0].email
                )}
              </div>

            </div>

          </div>

          <div class="divider"></div>

          <form
            method="post"
            action="/messages?user=${otherId}"
          >

            <textarea
              name="content"
              maxlength="3000"
              placeholder="پیام خودت را بنویس..."
              required
            ></textarea>

            <button class="blue">
              📤 ارسال پیام
            </button>

          </form>

        </div>

      `;

      for (const m of messages.rows) {

        content += `
          <div class="card">

            <b>
              ${escapeHtml(m.name)}
            </b>

            <div class="text">
              ${escapeHtml(m.content)}
            </div>

            <div class="muted">
              ${new Date(
                m.created_at
              ).toLocaleString("fa-IR")}
            </div>

          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "گفتگو",
        content,
        user
      );
    }

    if (
      method === "POST" &&
      path === "/messages"
    ) {

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

        const target = await pool.query(
          `
          SELECT id
          FROM users
          WHERE id=$1
          `,
          [otherId]
        );

        if (target.rowCount) {

          await pool.query(
            `
            INSERT INTO messages
            (sender_id,receiver_id,content)
            VALUES($1,$2,$3)
            `,
            [
              user.id,
              otherId,
              content
            ]
          );

          await pool.query(
            `
            INSERT INTO notifications
            (user_id,actor_id,type)
            VALUES($1,$2,'message')
            `,
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

    /* =====================
       گزارش
    ===================== */

    if (
      method === "GET" &&
      path === "/report"
    ) {

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

          <form
            method="post"
            action="/report"
          >

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
              placeholder="دلیل گزارش را بنویس..."
              required
            ></textarea>

            <button class="red">
              ارسال گزارش
            </button>

          </form>

        </div>
        `,
        user
      );
    }

    if (
      method === "POST" &&
      path === "/report"
    ) {

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

    /* =====================
       کاریابی
    ===================== */

    if (
      method === "GET" &&
      path === "/jobs"
    ) {

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

          <h2>💼 کاریابی</h2>

          <p class="muted">
            آگهی‌های کاری و فرصت‌های شغلی
          </p>

          <a
            class="btn green"
            href="/new-job"
          >
            ➕ ثبت آگهی شغلی
          </a>

        </div>

      `;

      for (const job of jobs.rows) {

        content += `

          <div class="job">

            <div class="job-title">
              ${escapeHtml(job.title)}
            </div>

            <div class="job-line">
              👤 ${escapeHtml(job.name)}
            </div>

            <div class="job-line">
              📍 ${escapeHtml(job.city || "نامشخص")}
            </div>

            <div class="job-line success">
              💰 ${escapeHtml(
                job.salary || "توافقی"
              )}
            </div>

            <div class="job-description">
              ${escapeHtml(
                job.description || ""
              )}
            </div>

            <div class="muted" style="margin-top:12px">
              ${new Date(
                job.created_at
              ).toLocaleString("fa-IR")}
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

    if (
      method === "GET" &&
      path === "/new-job"
    ) {

      return sendHtml(
        res,
        200,
        "ثبت آگهی شغلی",
        `
        <div class="card">

          <form
            method="post"
            action="/new-job"
          >

            <input
              name="title"
              placeholder="عنوان شغل"
              maxlength="200"
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
              maxlength="5000"
              placeholder="توضیحات آگهی..."
              required
            ></textarea>

            <button class="green">
              🚀 انتشار آگهی
            </button>

          </form>

        </div>
        `,
        user
      );
    }

    if (
      method === "POST" &&
      path === "/new-job"
    ) {

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

      return redirect(
        res,
        "/jobs"
      );
    }

    /* =====================
       صفحه پیدا نشد
    ===================== */

    return sendHtml(
      res,
      404,
      "صفحه پیدا نشد",
      `
      <div class="card empty">

        <h2>صفحه پیدا نشد 😕</h2>

        <p>
          آدرس واردشده وجود ندارد.
        </p>

        <a
          class="btn"
          href="/"
        >
          🏠 بازگشت به خانه
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

    if (!res.headersSent) {

      return sendHtml(
        res,
        500,
        "خطای سرور",
        `
        <div class="card">

          <h2 class="error">
            خطایی رخ داد.
          </h2>

          <p class="muted">
            Logs رندر را بررسی کنید.
          </p>

          <a
            class="btn"
            href="/"
          >
            بازگشت
          </a>

        </div>
        `,
        user
      );
    }

    res.end();
  }
}

/* =========================
   اجرای سرور
========================= */

async function start() {

  try {

    await pool.query("SELECT NOW()");

    console.log(
      "Database connection successful."
    );

    await initDatabase();

    const server =
      http.createServer(app);

    server.on(
      "clientError",
      (error, socket) => {

        console.error(
          "CLIENT ERROR:",
          error.message
        );

        try {

          socket.end(
            "HTTP/1.1 400 Bad Request\r\n\r\n"
          );

        } catch {}
      }
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

start();
