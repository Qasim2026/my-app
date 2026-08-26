"use strict";

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
  idleTimeoutMillis: 30000,
  max: 10
});

/* =========================================================
   ابزارهای عمومی
========================================================= */

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
}

function randomToken() {
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

function escapeAttr(value) {
  return escapeHtml(value);
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";

  for (const item of header.split(";")) {
    const i = item.indexOf("=");

    if (i < 0) continue;

    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let finished = false;

    req.on("data", chunk => {
      data += chunk;

      if (data.length > 3 * 1024 * 1024 && !finished) {
        finished = true;
        reject(new Error("Request too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (finished) return;

      finished = true;

      try {
        resolve(new URLSearchParams(data));
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", err => {
      if (!finished) {
        finished = true;
        reject(err);
      }
    });
  });
}

function sessionCookie(id) {
  return [
    `sessionId=${encodeURIComponent(id)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=2592000"
  ].join("; ");
}

function clearCookie() {
  return [
    "sessionId=",
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
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

function safeInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString("fa-IR");
  } catch {
    return "";
  }
}

function mediaHtml(url) {
  if (!url) return "";

  const safe = escapeAttr(url);

  const lower = String(url).toLowerCase();

  if (
    lower.includes(".mp4") ||
    lower.includes(".webm") ||
    lower.includes(".ogg")
  ) {
    return `
      <video class="media" controls preload="metadata">
        <source src="${safe}">
      </video>
    `;
  }

  return `
    <img
      class="media"
      src="${safe}"
      alt="رسانه پست"
      loading="lazy"
      onerror="this.style.display='none'"
    >
  `;
}

function avatar(name, image = null, size = 48) {
  const safeSize = Math.max(32, Math.min(Number(size) || 48, 120));

  if (image) {
    return `
      <img
        src="${escapeAttr(image)}"
        class="avatar-img"
        style="width:${safeSize}px;height:${safeSize}px"
        alt="پروفایل"
        loading="lazy"
        onerror="this.style.display='none'"
      >
    `;
  }

  const first =
    String(name || "?")
      .trim()
      .slice(0, 1) || "?";

  return `
    <div
      class="avatar"
      style="width:${safeSize}px;height:${safeSize}px"
    >
      ${escapeHtml(first)}
    </div>
  `;
}

function button(action, text, cls = "") {
  return `
    <form method="post" action="${escapeAttr(action)}" class="inline">
      <button class="${escapeAttr(cls)}" type="submit">
        ${escapeHtml(text)}
      </button>
    </form>
  `;
}

function formInput(name, placeholder, type = "text", value = "") {
  return `
    <input
      name="${escapeAttr(name)}"
      type="${escapeAttr(type)}"
      placeholder="${escapeAttr(placeholder)}"
      value="${escapeAttr(value)}"
      required
    >
  `;
}

/* =========================================================
   Session
========================================================= */

async function getUser(req) {
  const sessionId = parseCookies(req).sessionId;

  if (!sessionId) return null;

  const result = await pool.query(
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.bio,
        u.avatar_url
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_id = $1
        AND s.created_at > NOW() - INTERVAL '30 days'
    `,
    [sessionId]
  );

  if (!result.rowCount) return null;

  return result.rows[0];
}

/* =========================================================
   قالب اصلی
========================================================= */

function layout(title, content, user, unread = 0) {
  const nav = user
    ? `
      <nav class="bottom-nav">
        <a href="/">🏠<span>خانه</span></a>
        <a href="/search">🔎<span>جستجو</span></a>
        <a href="/new-post">➕<span>پست</span></a>
        <a href="/messages">
          💬
          ${unread > 0 ? `<b class="badge">${unread}</b>` : ""}
          <span>پیام</span>
        </a>
        <a href="/profile">👤<span>پروفایل</span></a>
      </nav>
    `
    : "";

  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
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
      font-family:
        Tahoma,
        Arial,
        sans-serif;
      background: #f4f6f8;
      color: #202124;
      line-height: 1.8;
      padding-bottom: 85px;
    }

    a {
      color: #2563eb;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(255,255,255,.96);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid #e5e7eb;
      padding: 12px 15px;
    }

    .topbar-inner {
      max-width: 760px;
      margin: auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .brand {
      font-weight: 900;
      font-size: 19px;
      color: #111827;
    }

    .page {
      width: min(760px, 100%);
      margin: 0 auto;
      padding: 16px 12px 30px;
    }

    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      padding: 16px;
      margin-bottom: 14px;
      box-shadow: 0 4px 15px rgba(0,0,0,.04);
    }

    .post {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      padding: 16px;
      margin-bottom: 14px;
      overflow: hidden;
    }

    .user-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .user-info {
      min-width: 0;
      flex: 1;
    }

    .user-name {
      font-weight: 800;
      color: #111827;
    }

    .muted {
      color: #6b7280;
      font-size: 13px;
    }

    .text {
      white-space: pre-wrap;
      word-break: break-word;
      margin-top: 12px;
    }

    .avatar,
    .avatar-img {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #2563eb;
      color: white;
      font-weight: bold;
      overflow: hidden;
    }

    .avatar-img {
      object-fit: cover;
      display: block;
    }

    .media {
      display: block;
      width: 100%;
      max-height: 560px;
      object-fit: cover;
      border-radius: 14px;
      margin-top: 12px;
      background: #eee;
    }

    input,
    textarea,
    select {
      display: block;
      width: 100%;
      border: 1px solid #d1d5db;
      border-radius: 12px;
      padding: 12px 13px;
      margin: 9px 0;
      font: inherit;
      background: white;
      color: #111827;
      outline: none;
    }

    textarea {
      min-height: 130px;
      resize: vertical;
    }

    input:focus,
    textarea:focus,
    select:focus {
      border-color: #2563eb;
    }

    button,
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      border: 0;
      border-radius: 11px;
      padding: 9px 13px;
      margin: 4px 2px;
      background: #111827;
      color: white;
      font: inherit;
      cursor: pointer;
      text-decoration: none;
    }

    button:hover,
    .btn:hover {
      opacity: .9;
      text-decoration: none;
    }

    .inline {
      display: inline;
    }

    .full {
      width: 100%;
      margin: 8px 0;
    }

    .blue {
      background: #2563eb;
    }

    .green {
      background: #16a34a;
    }

    .red {
      background: #dc2626;
    }

    .purple {
      background: #7c3aed;
    }

    .pink {
      background: #db2777;
    }

    .gray {
      background: #6b7280;
    }

    .orange {
      background: #ea580c;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(3,1fr);
      gap: 8px;
      text-align: center;
      margin: 18px 0;
    }

    .stat {
      background: #f8fafc;
      border-radius: 13px;
      padding: 10px 5px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 12px;
    }

    .post-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin-top: 10px;
      border-top: 1px solid #f0f0f0;
      padding-top: 10px;
    }

    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 50;
      height: 68px;
      background: rgba(255,255,255,.98);
      border-top: 1px solid #ddd;
      display: flex;
      justify-content: center;
      gap: 0;
      box-shadow: 0 -3px 15px rgba(0,0,0,.06);
    }

    .bottom-nav a {
      position: relative;
      width: min(20%, 150px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #374151;
      font-size: 19px;
    }

    .bottom-nav span {
      font-size: 11px;
      line-height: 1.3;
    }

    .badge {
      position: absolute;
      top: 4px;
      right: calc(50% - 18px);
      background: #dc2626;
      color: white;
      border-radius: 99px;
      min-width: 18px;
      padding: 1px 5px;
      font-size: 10px;
      text-align: center;
    }

    .profile-head {
      text-align: center;
    }

    .profile-head .avatar,
    .profile-head .avatar-img {
      margin: auto;
    }

    .job {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 17px;
      padding: 15px;
      margin: 12px 0;
    }

    .success {
      color: #15803d;
      font-weight: bold;
    }

    .danger-box {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fecaca;
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
    }

    .success-box {
      background: #f0fdf4;
      color: #166534;
      border: 1px solid #bbf7d0;
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
    }

    .chat {
      max-width: 82%;
      padding: 10px 13px;
      border-radius: 15px;
      margin: 8px 0;
      word-break: break-word;
    }

    .chat.me {
      background: #dbeafe;
      margin-right: auto;
    }

    .chat.other {
      background: #f3f4f6;
      margin-left: auto;
    }

    .comment {
      border-top: 1px solid #eee;
      padding: 12px 0;
    }

    .tag {
      color: #2563eb;
      font-weight: bold;
    }

    .empty {
      text-align: center;
      padding: 30px 10px;
      color: #6b7280;
    }

    .hero {
      padding: 24px 10px;
      text-align: center;
    }

    .hero h1 {
      margin-bottom: 5px;
    }

    .notice {
      font-size: 13px;
      color: #6b7280;
      background: #f9fafb;
      border-radius: 10px;
      padding: 9px;
      margin-top: 10px;
    }

    @media (max-width: 520px) {
      .page {
        padding: 10px 8px 25px;
      }

      .card,
      .post,
      .job {
        border-radius: 15px;
      }

      button,
      .btn {
        padding: 8px 10px;
        font-size: 13px;
      }

      .stats {
        gap: 5px;
      }
    }

    body.dark {
      background: #0f172a;
      color: #e5e7eb;
    }

    body.dark .topbar,
    body.dark .bottom-nav,
    body.dark .card,
    body.dark .post,
    body.dark .job {
      background: #111827;
      border-color: #263244;
      color: #e5e7eb;
    }

    body.dark .brand,
    body.dark .user-name {
      color: #f9fafb;
    }

    body.dark input,
    body.dark textarea,
    body.dark select {
      background: #0f172a;
      color: #f9fafb;
      border-color: #334155;
    }

    body.dark .stat,
    body.dark .notice {
      background: #1e293b;
    }

    body.dark .bottom-nav a {
      color: #e5e7eb;
    }

    body.dark .chat.other {
      background: #1e293b;
    }

    body.dark .chat.me {
      background: #1d4ed8;
      color: white;
    }
  </style>
</head>

<body>

  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/">
        🌐 شبکه اجتماعی
      </a>

      ${
        user
          ? `
            <div>
              <a class="btn gray" href="/notifications">
                🔔
                ${unread ? unread : ""}
              </a>
              <a class="btn purple" href="/profile">
                👤
              </a>
            </div>
          `
          : ""
      }
    </div>
  </header>

  <main class="page">
    ${content}
  </main>

  ${nav}

  <script>
    (function () {
      const saved = localStorage.getItem("theme");

      if (saved === "dark") {
        document.body.classList.add("dark");
      }
    })();

    function toggleTheme() {
      document.body.classList.toggle("dark");

      localStorage.setItem(
        "theme",
        document.body.classList.contains("dark")
          ? "dark"
          : "light"
      );
    }
  </script>

</body>
</html>
`;
}

async function sendHtml(res, status, title, content, user = null) {
  let unread = 0;

  if (user) {
    const result = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM notifications
        WHERE user_id=$1
          AND read=false
      `,
      [user.id]
    );

    unread = result.rows[0].count;
  }

  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(
    layout(
      title,
      content,
      user,
      unread
    )
  );
}

/* =========================================================
   دیتابیس
========================================================= */

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      media_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(user_id, post_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      following_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(follower_id, following_id),
      CHECK(follower_id <> following_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_posts (
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(user_id, post_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      content TEXT NOT NULL,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      actor_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      type TEXT NOT NULL,
      post_id INTEGER
        REFERENCES posts(id)
        ON DELETE CASCADE,
      job_id INTEGER,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      post_id INTEGER
        REFERENCES posts(id)
        ON DELETE CASCADE,
      reported_user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      job_id INTEGER,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(blocker_id, blocked_id),
      CHECK(blocker_id <> blocked_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      title TEXT NOT NULL,
      city TEXT,
      salary TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_posts_created
    ON posts(created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_receiver
    ON messages(receiver_id, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id, read, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_jobs_created
    ON jobs(created_at DESC)
  `);

  console.log("Database initialized successfully.");
}

/* =========================================================
   برنامه
========================================================= */

async function app(req, res) {
  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  const path = url.pathname;
  const method = req.method;

  try {
    const user = await getUser(req);

    /* =====================================================
       Health
    ===================================================== */

    if (method === "GET" && path === "/health") {
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
      });

      return res.end("OK");
    }

    /* =====================================================
       Login
    ===================================================== */

    if (method === "GET" && path === "/login") {
      return sendHtml(
        res,
        200,
        "ورود",
        `
          <div class="hero">
            <h1>👋 خوش آمدی</h1>
            <p class="muted">
              وارد حساب کاربری خودت شو.
            </p>
          </div>

          <div class="card">
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
                🔐 ورود
              </button>
            </form>

            <div class="notice">
              حساب نداری؟
              <a href="/register">ساخت حساب جدید</a>
            </div>
          </div>
        `,
        null
      );
    }

    if (method === "POST" && path === "/login") {
      const b = await readBody(req);

      const email =
        (b.get("email") || "")
          .trim()
          .toLowerCase();

      const password = b.get("password") || "";

      const result = await pool.query(
        `
          SELECT id
          FROM users
          WHERE email=$1
            AND password=$2
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
            <div class="card">
              <div class="danger-box">
                ایمیل یا رمز عبور اشتباه است.
              </div>

              <a class="btn gray" href="/login">
                بازگشت
              </a>
            </div>
          `,
          null
        );
      }

      const sessionId = randomToken();

      await pool.query(
        `
          INSERT INTO sessions
          (session_id,user_id)
          VALUES($1,$2)
        `,
        [
          sessionId,
          result.rows[0].id
        ]
      );

      return redirect(
        res,
        "/",
        sessionCookie(sessionId)
      );
    }

    /* =====================================================
       Register
    ===================================================== */

    if (method === "GET" && path === "/register") {
      return sendHtml(
        res,
        200,
        "ثبت‌نام",
        `
          <div class="hero">
            <h1>✨ ساخت حساب</h1>
            <p class="muted">
              حساب خودت را ایجاد کن.
            </p>
          </div>

          <div class="card">
            <form method="post" action="/register">

              <input
                name="name"
                placeholder="نام"
                maxlength="80"
                required
              >

              <input
                name="email"
                type="email"
                placeholder="ایمیل"
                maxlength="160"
                required
              >

              <input
                name="password"
                type="password"
                placeholder="رمز عبور حداقل ۶ کاراکتر"
                required
              >

              <button class="green full">
                🚀 ثبت‌نام
              </button>

            </form>

            <div class="notice">
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

      const name =
        (b.get("name") || "").trim();

      const email =
        (b.get("email") || "")
          .trim()
          .toLowerCase();

      const password =
        b.get("password") || "";

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
            <div class="card">
              <div class="danger-box">
                نام، ایمیل و رمز عبور معتبر وارد کن.
                رمز باید حداقل ۶ کاراکتر باشد.
              </div>
              <a class="btn gray" href="/register">
                بازگشت
              </a>
            </div>
          `,
          null
        );
      }

      const exists = await pool.query(
        `
          SELECT id
          FROM users
          WHERE email=$1
        `,
        [email]
      );

      if (exists.rowCount) {
        return sendHtml(
          res,
          400,
          "خطا",
          `
            <div class="card">
              <div class="danger-box">
                این ایمیل قبلاً ثبت شده است.
              </div>

              <a class="btn blue" href="/login">
                ورود
              </a>
            </div>
          `,
          null
        );
      }

      const result = await pool.query(
        `
          INSERT INTO users
          (name,email,password)
          VALUES($1,$2,$3)
          RETURNING id
        `,
        [
          name,
          email,
          hashPassword(password)
        ]
      );

      const sessionId = randomToken();

      await pool.query(
        `
          INSERT INTO sessions
          (session_id,user_id)
          VALUES($1,$2)
        `,
        [
          sessionId,
          result.rows[0].id
        ]
      );

      return redirect(
        res,
        "/",
        sessionCookie(sessionId)
      );
    }

    /* =====================================================
       صفحات نیازمند ورود
    ===================================================== */

    if (!user) {
      return redirect(res, "/login");
    }

    /* =====================================================
       Logout
    ===================================================== */

    if (method === "POST" && path === "/logout") {
      const sid = parseCookies(req).sessionId;

      if (sid) {
        await pool.query(
          `
            DELETE FROM sessions
            WHERE session_id=$1
          `,
          [sid]
        );
      }

      return redirect(
        res,
        "/login",
        clearCookie()
      );
    }

    /* =====================================================
       Home
    ===================================================== */

    if (method === "GET" && path === "/") {
      const posts = await pool.query(
        `
          SELECT
            p.*,
            u.name,
            u.avatar_url,

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
          JOIN users u ON u.id=p.user_id

          WHERE NOT EXISTS(
            SELECT 1
            FROM blocks b
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
          LIMIT 50
        `,
        [user.id]
      );

      let content = `
        <div class="card">
          <div class="user-row">
            ${avatar(
              user.name,
              user.avatar_url
            )}

            <div class="user-info">
              <div class="user-name">
                ${escapeHtml(user.name)}
              </div>

              <div class="muted">
                ${escapeHtml(user.email)}
              </div>
            </div>
          </div>

          <div class="actions">
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
        let text = escapeHtml(post.content);

        text = text.replace(
          /(^|\\s)(#[\\p{L}\\p{N}_]+)/gu,
          '$1<a class="tag" href="/hashtag?tag=$2">$2</a>'
        );

        content += `
          <article class="post">

            <div class="user-row">
              ${avatar(
                post.name,
                post.avatar_url
              )}

              <div class="user-info">
                <a
                  class="user-name"
                  href="/user?id=${post.user_id}"
                >
                  ${escapeHtml(post.name)}
                </a>

                <div class="muted">
                  ${formatDate(post.created_at)}
                </div>
              </div>
            </div>

            <div class="text">
              ${text}
            </div>

            ${mediaHtml(post.media_url)}

            <div class="post-actions">

              ${button(
                `/like?id=${post.id}`,
                post.liked
                  ? "💔 لغو لایک"
                  : "❤️ لایک",
                "pink"
              )}

              <a
                class="btn gray"
                href="/post?id=${post.id}"
              >
                💬 ${post.comments}
              </a>

              ${button(
                `/save?id=${post.id}`,
                post.saved
                  ? "🔖 حذف ذخیره"
                  : "🔖 ذخیره",
                "purple"
              )}

              <span class="btn">
                ❤️ ${post.likes}
              </span>

              ${
                post.user_id === user.id
                  ? `
                    <a
                      class="btn blue"
                      href="/edit-post?id=${post.id}"
                    >
                      ✏️ ویرایش
                    </a>

                    ${button(
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

    /* =====================================================
       New Post
    ===================================================== */

    if (method === "GET" && path === "/new-post") {
      return sendHtml(
        res,
        200,
        "پست جدید",
        `
          <div class="card">
            <h2>🚀 انتشار پست</h2>

            <form method="post" action="/new-post">

              <textarea
                name="content"
                maxlength="10000"
                placeholder="چه خبر؟"
                required
              ></textarea>

              <input
                name="media_url"
                type="url"
                placeholder="لینک عکس یا ویدیو، اختیاری"
              >

              <button class="green full">
                🚀 انتشار
              </button>
            </form>

            <div class="notice">
              برای هشتگ می‌توانی مثل
              #خبر یا #فوتبال بنویسی.
            </div>
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
        (b.get("media_url") || "").trim()
        || null;

      if (content) {
        await pool.query(
          `
            INSERT INTO posts
            (user_id,content,media_url)
            VALUES($1,$2,$3)
          `,
          [
            user.id,
            content,
            media
          ]
        );
      }

      return redirect(res, "/");
    }

    /* =====================================================
       Like
    ===================================================== */

    if (method === "POST" && path === "/like") {
      const id = safeInt(
        url.searchParams.get("id")
      );

      if (!id) {
        return redirect(res, "/");
      }

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
            INSERT INTO likes
            (user_id,post_id)
            VALUES($1,$2)
            ON CONFLICT DO NOTHING
          `,
          [
            user.id,
            id
          ]
        );

        const owner =
          post.rows[0].user_id;

        if (owner !== user.id) {
          await pool.query(
            `
              INSERT INTO notifications
              (user_id,actor_id,type,post_id)
              VALUES($1,$2,'like',$3)
            `,
            [
              owner,
              user.id,
              id
            ]
          );
        }
      }

      return redirect(
        res,
        req.headers.referer || "/"
      );
    }

    /* =====================================================
       Save
    ===================================================== */

    if (method === "POST" && path === "/save") {
      const id = safeInt(
        url.searchParams.get("id")
      );

      if (!id) {
        return redirect(res, "/");
      }

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
            INSERT INTO saved_posts
            (user_id,post_id)
            VALUES($1,$2)
            ON CONFLICT DO NOTHING
          `,
          [
            user.id,
            id
          ]
        );
      }

      return redirect(
        res,
        req.headers.referer || "/"
      );
    }

    /* =====================================================
       Post + Comments
    ===================================================== */

    if (method === "GET" && path === "/post") {
      const id = safeInt(
        url.searchParams.get("id")
      );

      if (!id) {
        return redirect(res, "/");
      }

      const result = await pool.query(
        `
          SELECT
            p.*,
            u.name,
            u.avatar_url,

            (
              SELECT COUNT(*)
              FROM likes
              WHERE post_id=p.id
            )::int AS likes

          FROM posts p
          JOIN users u ON u.id=p.user_id
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

      const p = result.rows[0];

      const comments = await pool.query(
        `
          SELECT
            c.*,
            u.name,
            u.avatar_url
          FROM comments c
          JOIN users u ON u.id=c.user_id
          WHERE c.post_id=$1
          ORDER BY c.created_at ASC
        `,
        [id]
      );

      let content = `
        <article class="post">

          <div class="user-row">
            ${avatar(
              p.name,
              p.avatar_url
            )}

            <div class="user-info">
              <a
                class="user-name"
                href="/user?id=${p.user_id}"
              >
                ${escapeHtml(p.name)}
              </a>

              <div class="muted">
                ${formatDate(p.created_at)}
              </div>
            </div>
          </div>

          <div class="text">
            ${escapeHtml(p.content)}
          </div>

          ${mediaHtml(p.media_url)}

          <div class="notice">
            ❤️ ${p.likes} لایک
          </div>

          <a class="btn gray" href="/">
            بازگشت
          </a>
        </article>

        <div class="card">
          <h3>💬 نظرات</h3>

          <form
            method="post"
            action="/comment?id=${id}"
          >
            <textarea
              name="content"
              maxlength="3000"
              placeholder="نظر خودت را بنویس..."
              required
            ></textarea>

            <button class="blue full">
              💬 ارسال نظر
            </button>
          </form>
        </div>
      `;

      for (const c of comments.rows) {
        content += `
          <div class="card comment">

            <div class="user-row">
              ${avatar(
                c.name,
                c.avatar_url,
                40
              )}

              <div class="user-info">
                <a
                  class="user-name"
                  href="/user?id=${c.user_id}"
                >
                  ${escapeHtml(c.name)}
                </a>

                <div class="muted">
                  ${formatDate(c.created_at)}
                </div>
              </div>
            </div>

            <div class="text">
              ${escapeHtml(c.content)}
            </div>

            ${
              c.user_id === user.id ||
              p.user_id === user.id
                ? button(
                    `/delete-comment?id=${c.id}`,
                    "🗑️ حذف",
                    "red"
                  )
                : ""
            }

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
      const id = safeInt(
        url.searchParams.get("id")
      );

      const b = await readBody(req);

      const content =
        (b.get("content") || "").trim();

      if (id && content) {
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

          const owner =
            post.rows[0].user_id;

          if (owner !== user.id) {
            await pool.query(
              `
                INSERT INTO notifications
                (user_id,actor_id,type,post_id)
                VALUES($1,$2,'comment',$3)
              `,
              [
                owner,
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

    /* =====================================================
       Delete Comment
    ===================================================== */

    if (
      method === "POST" &&
      path === "/delete-comment"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      );

      const comment = await pool.query(
        `
          SELECT
            c.user_id,
            p.user_id AS post_owner
          FROM comments c
          JOIN posts p ON p.id=c.post_id
          WHERE c.id=$1
        `,
        [id]
      );

      if (comment.rowCount) {
        const c = comment.rows[0];

        if (
          c.user_id === user.id ||
          c.post_owner === user.id
        ) {
          await pool.query(
            `
              DELETE FROM comments
              WHERE id=$1
            `,
            [id]
          );
        }
      }

      return redirect(
        res,
        req.headers.referer || "/"
      );
    }

    /* =====================================================
       Edit Post
    ===================================================== */

    if (
      method === "GET" &&
      path === "/edit-post"
    ) {
      const id = safeInt(
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

      const p = result.rows[0];

      return sendHtml(
        res,
        200,
        "ویرایش پست",
        `
          <div class="card">
            <h2>✏️ ویرایش پست</h2>

            <form
              method="post"
              action="/edit-post?id=${id}"
            >
              <textarea
                name="content"
                required
              >${escapeHtml(p.content)}</textarea>

              <input
                name="media_url"
                type="url"
                value="${escapeAttr(
                  p.media_url || ""
                )}"
                placeholder="لینک عکس یا ویدیو"
              >

              <button class="blue full">
                💾 ذخیره تغییرات
              </button>
            </form>
          </div>
        `,
        user
      );
    }

    if (
      method === "POST" &&
      path === "/edit-post"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      );

      const b = await readBody(req);

      const content =
        (b.get("content") || "").trim();

      const media =
        (b.get("media_url") || "").trim()
        || null;

      if (content) {
        await pool.query(
          `
            UPDATE posts
            SET
              content=$1,
              media_url=$2,
              updated_at=NOW()
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

    /* =====================================================
       Delete Post
    ===================================================== */

    if (
      method === "POST" &&
      path === "/delete-post"
    ) {
      const id = safeInt(
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

    /* =====================================================
       Search
    ===================================================== */

    if (
      method === "GET" &&
      path === "/search"
    ) {
      const q =
        (url.searchParams.get("q") || "")
          .trim();

      let content = `
        <div class="card">
          <h2>🔎 جستجو</h2>

          <form method="get" action="/search">
            <input
              name="q"
              value="${escapeAttr(q)}"
              placeholder="نام کاربر یا متن پست..."
            >

            <button class="blue full">
              🔎 جستجو
            </button>
          </form>
        </div>
      `;

      if (q) {
        const users = await pool.query(
          `
            SELECT
              id,
              name,
              email,
              avatar_url
            FROM users
            WHERE
              name ILIKE $1
              OR email ILIKE $1
            ORDER BY name
            LIMIT 30
          `,
          [`%${q}%`]
        );

        if (users.rowCount) {
          content += `
            <div class="card">
              <h3>👤 کاربران</h3>
          `;

          for (const p of users.rows) {
            content += `
              <div class="user-row" style="margin:10px 0">
                ${avatar(
                  p.name,
                  p.avatar_url
                )}

                <div class="user-info">
                  <a
                    class="user-name"
                    href="/user?id=${p.id}"
                  >
                    ${escapeHtml(p.name)}
                  </a>

                  <div class="muted">
                    ${escapeHtml(p.email)}
                  </div>
                </div>
              </div>
            `;
          }

          content += `</div>`;
        }

        const posts = await pool.query(
          `
            SELECT
              p.id,
              p.user_id,
              p.content,
              p.created_at,
              u.name,
              u.avatar_url
            FROM posts p
            JOIN users u ON u.id=p.user_id
            WHERE p.content ILIKE $1
            ORDER BY p.created_at DESC
            LIMIT 30
          `,
          [`%${q}%`]
        );

        if (posts.rowCount) {
          content += `
            <div class="card">
              <h3>📝 پست‌ها</h3>
          `;

          for (const p of posts.rows) {
            content += `
              <div class="post">
                <div class="user-row">
                  ${avatar(
                    p.name,
                    p.avatar_url,
                    40
                  )}

                  <div class="user-info">
                    <a
                      class="user-name"
                      href="/user?id=${p.user_id}"
                    >
                      ${escapeHtml(p.name)}
                    </a>

                    <div class="muted">
                      ${formatDate(p.created_at)}
                    </div>
                  </div>
                </div>

                <div class="text">
                  ${escapeHtml(p.content)}
                </div>

                <a
                  class="btn blue"
                  href="/post?id=${p.id}"
                >
                  مشاهده پست
                </a>
              </div>
            `;
          }

          content += `</div>`;
        }

        if (
          !users.rowCount &&
          !posts.rowCount
        ) {
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

    /* =====================================================
       Hashtag
    ===================================================== */

    if (
      method === "GET" &&
      path === "/hashtag"
    ) {
      let tag =
        (url.searchParams.get("tag") || "")
          .trim();

      tag = tag.replace(/^#/, "");

      if (!tag) {
        return redirect(
          res,
          "/search"
        );
      }

      const posts = await pool.query(
        `
          SELECT
            p.*,
            u.name,
            u.avatar_url
          FROM posts p
          JOIN users u ON u.id=p.user_id
          WHERE p.content ILIKE $1
          ORDER BY p.created_at DESC
          LIMIT 50
        `,
        [`%#${tag}%`]
      );

      let content = `
        <div class="card">
          <h2>#${escapeHtml(tag)}</h2>
          <div class="muted">
            پست‌های مرتبط با این هشتگ
          </div>
        </div>
      `;

      for (const p of posts.rows) {
        content += `
          <div class="post">

            <div class="user-row">
              ${avatar(
                p.name,
                p.avatar_url
              )}

              <div class="user-info">
                <a
                  class="user-name"
                  href="/user?id=${p.user_id}"
                >
                  ${escapeHtml(p.name)}
                </a>

                <div class="muted">
                  ${formatDate(p.created_at)}
                </div>
              </div>
            </div>

            <div class="text">
              ${escapeHtml(p.content)}
            </div>

            ${mediaHtml(p.media_url)}

            <a
              class="btn blue"
              href="/post?id=${p.id}"
            >
              مشاهده
            </a>
          </div>
        `;
      }

      if (!posts.rowCount) {
        content += `
          <div class="card empty">
            پستی با این هشتگ پیدا نشد.
          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "هشتگ",
        content,
        user
      );
    }

    /* =====================================================
       User Profile
    ===================================================== */

    if (
      method === "GET" &&
      path === "/user"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      );

      if (!id) {
        return redirect(res, "/");
      }

      const person = await pool.query(
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

      const blocked = await pool.query(
        `
          SELECT 1
          FROM blocks
          WHERE blocker_id=$1
            AND blocked_id=$2
        `,
        [
          user.id,
          id
        ]
      );

      const counts = await pool.query(
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
        [id]
      );

      const posts = await pool.query(
        `
          SELECT *
          FROM posts
          WHERE user_id=$1
          ORDER BY created_at DESC
          LIMIT 30
        `,
        [id]
      );

      const s = counts.rows[0];

      let content = `
        <div class="card profile-head">

          ${avatar(
            target.name,
            target.avatar_url,
            90
          )}

          <h2>
            ${escapeHtml(target.name)}
          </h2>

          <div class="muted">
            ${escapeHtml(target.email)}
          </div>

          ${
            target.bio
              ? `
                <div class="text">
                  ${escapeHtml(target.bio)}
                </div>
              `
              : ""
          }

          <div class="stats">
            <div class="stat">
              <b>${s.posts}</b>
              <div class="muted">پست</div>
            </div>

            <a
              class="stat"
              href="/followers?id=${id}"
            >
              <b>${s.followers}</b>
              <div class="muted">دنبال‌کننده</div>
            </a>

            <a
              class="stat"
              href="/following?id=${id}"
            >
              <b>${s.following}</b>
              <div class="muted">دنبال‌شده</div>
            </a>
          </div>

          ${
            id !== user.id
              ? `
                <div class="actions">

                  ${button(
                    `/follow?id=${id}`,
                    following.rowCount
                      ? "➖ لغو دنبال"
                      : "➕ دنبال کردن",
                    "blue"
                  )}

                  ${
                    blocked.rowCount
                      ? button(
                          `/unblock?id=${id}`,
                          "🔓 رفع مسدودی",
                          "green"
                        )
                      : button(
                          `/block?id=${id}`,
                          "🚫 مسدود کردن",
                          "red"
                        )
                  }

                  ${
                    !blocked.rowCount
                      ? `
                        <a
                          class="btn"
                          href="/messages?user=${id}"
                        >
                          💬 پیام
                        </a>
                      `
                      : ""
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

      for (const p of posts.rows) {
        content += `
          <div class="post">
            <div class="muted">
              ${formatDate(p.created_at)}
            </div>

            <div class="text">
              ${escapeHtml(p.content)}
            </div>

            ${mediaHtml(p.media_url)}

            <a
              class="btn blue"
              href="/post?id=${p.id}"
            >
              مشاهده پست
            </a>
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

    /* =====================================================
       Follow
    ===================================================== */

    if (
      method === "POST" &&
      path === "/follow"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      );

      if (
        id &&
        id !== user.id
      ) {
        const exists = await pool.query(
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

        if (exists.rowCount) {
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

    /* =====================================================
       Followers
    ===================================================== */

    if (
      method === "GET" &&
      path === "/followers"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      ) || user.id;

      const result = await pool.query(
        `
          SELECT
            u.id,
            u.name,
            u.email,
            u.avatar_url
          FROM follows f
          JOIN users u
            ON u.id=f.follower_id
          WHERE f.following_id=$1
          ORDER BY u.name
        `,
        [id]
      );

      let content = `
        <div class="card">
          <h2>👥 دنبال‌کننده‌ها</h2>
        </div>
      `;

      for (const p of result.rows) {
        content += `
          <div class="card">
            <div class="user-row">
              ${avatar(
                p.name,
                p.avatar_url
              )}

              <div class="user-info">
                <a
                  class="user-name"
                  href="/user?id=${p.id}"
                >
                  ${escapeHtml(p.name)}
                </a>

                <div class="muted">
                  ${escapeHtml(p.email)}
                </div>
              </div>
            </div>
          </div>
        `;
      }

      if (!result.rowCount) {
        content += `
          <div class="card empty">
            هنوز دنبال‌کننده‌ای وجود ندارد.
          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "دنبال‌کننده‌ها",
        content,
        user
      );
    }

    /* =====================================================
       Following
    ===================================================== */

    if (
      method === "GET" &&
      path === "/following"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      ) || user.id;

      const result = await pool.query(
        `
          SELECT
            u.id,
            u.name,
            u.email,
            u.avatar_url
          FROM follows f
          JOIN users u
            ON u.id=f.following_id
          WHERE f.follower_id=$1
          ORDER BY u.name
        `,
        [id]
      );

      let content = `
        <div class="card">
          <h2>👤 دنبال‌شده‌ها</h2>
        </div>
      `;

      for (const p of result.rows) {
        content += `
          <div class="card">
            <div class="user-row">
              ${avatar(
                p.name,
                p.avatar_url
              )}

              <div class="user-info">
                <a
                  class="user-name"
                  href="/user?id=${p.id}"
                >
                  ${escapeHtml(p.name)}
                </a>

                <div class="muted">
                  ${escapeHtml(p.email)}
                </div>
              </div>
            </div>
          </div>
        `;
      }

      if (!result.rowCount) {
        content += `
          <div class="card empty">
            هنوز کسی را دنبال نمی‌کنی.
          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "دنبال‌شده‌ها",
        content,
        user
      );
    }

    /* =====================================================
       Block
    ===================================================== */

    if (
      method === "POST" &&
      path === "/block"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      );

      if (
        id &&
        id !== user.id
      ) {
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
            id
          ]
        );
      }

      return redirect(res, "/");
    }

    /* =====================================================
       Unblock
    ===================================================== */

    if (
      method === "POST" &&
      path === "/unblock"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      );

      if (
        id &&
        id !== user.id
      ) {
        await pool.query(
          `
            DELETE FROM blocks
            WHERE blocker_id=$1
              AND blocked_id=$2
          `,
          [
            user.id,
            id
          ]
        );
      }

      return redirect(
        res,
        `/user?id=${id}`
      );
    }

    /* =====================================================
       My Profile
    ===================================================== */

    if (
      method === "GET" &&
      path === "/profile"
    ) {
      const result = await pool.query(
        `
          SELECT
            u.*,

            (
              SELECT COUNT(*)
              FROM posts
              WHERE user_id=u.id
            )::int AS posts,

            (
              SELECT COUNT(*)
              FROM follows
              WHERE following_id=u.id
            )::int AS followers,

            (
              SELECT COUNT(*)
              FROM follows
              WHERE follower_id=u.id
            )::int AS following,

            (
              SELECT COUNT(*)
              FROM likes l
              JOIN posts p
                ON p.id=l.post_id
              WHERE p.user_id=u.id
            )::int AS total_likes

          FROM users u
          WHERE u.id=$1
        `,
        [user.id]
      );

      const s = result.rows[0];

      return sendHtml(
        res,
        200,
        "پروفایل من",
        `
          <div class="card profile-head">

            ${avatar(
              s.name,
              s.avatar_url,
              100
            )}

            <h2>
              ${escapeHtml(s.name)}
            </h2>

            <div class="muted">
              ${escapeHtml(s.email)}
            </div>

            ${
              s.bio
                ? `
                  <div class="text">
                    ${escapeHtml(s.bio)}
                  </div>
                `
                : `
                  <div class="muted">
                    هنوز بیویی ثبت نشده است.
                  </div>
                `
            }

            <div class="stats">
              <div class="stat">
                <b>${s.posts}</b>
                <div class="muted">پست</div>
              </div>

              <a
                class="stat"
                href="/followers?id=${user.id}"
              >
                <b>${s.followers}</b>
                <div class="muted">دنبال‌کننده</div>
              </a>

              <a
                class="stat"
                href="/following?id=${user.id}"
              >
                <b>${s.following}</b>
                <div class="muted">دنبال‌شده</div>
              </a>
            </div>

            <div class="notice">
              ❤️ مجموع لایک پست‌ها:
              <b>${s.total_likes}</b>
            </div>

          </div>

          <div class="card">
            <h3>⚙️ تنظیمات</h3>

            <a
              class="btn blue"
              href="/edit-profile"
            >
              ✏️ ویرایش پروفایل
            </a>

            <a
              class="btn purple"
              href="/saved"
            >
              🔖 ذخیره‌شده‌ها
            </a>

            <a
              class="btn"
              href="/notifications"
            >
              🔔 اعلان‌ها
            </a>

            <a
              class="btn"
              href="/messages"
            >
              💬 پیام‌ها
            </a>

            <a
              class="btn green"
              href="/jobs"
            >
              💼 کاریابی
            </a>

            <a
              class="btn orange"
              href="/change-password"
            >
              🔐 تغییر رمز
            </a>

            <button
              class="gray"
              type="button"
              onclick="toggleTheme()"
            >
              🌙 حالت شب / روشن
            </button>

            <form
              method="post"
              action="/logout"
              style="margin-top:10px"
            >
              <button class="red full">
                🚪 خروج از حساب
              </button>
            </form>
          </div>
        `,
        user
      );
    }

    /* =====================================================
       Edit Profile
    ===================================================== */

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
            <h2>✏️ ویرایش پروفایل</h2>

            <form
              method="post"
              action="/edit-profile"
            >

              <label>نام</label>

              <input
                name="name"
                value="${escapeAttr(user.name)}"
                maxlength="80"
                required
              >

              <label>بیو</label>

              <textarea
                name="bio"
                maxlength="1000"
                placeholder="درباره خودت..."
              >${escapeHtml(
                user.bio || ""
              )}</textarea>

              <label>
                لینک عکس پروفایل
              </label>

              <input
                name="avatar_url"
                type="url"
                value="${escapeAttr(
                  user.avatar_url || ""
                )}"
                placeholder="https://..."
              >

              <button class="blue full">
                💾 ذخیره تغییرات
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

      const bio =
        (b.get("bio") || "").trim();

      const avatarUrl =
        (b.get("avatar_url") || "").trim()
        || null;

      if (name) {
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
            avatarUrl,
            user.id
          ]
        );
      }

      return redirect(
        res,
        "/profile"
      );
    }

    /* =====================================================
       Saved
    ===================================================== */

    if (
      method === "GET" &&
      path === "/saved"
    ) {
      const result = await pool.query(
        `
          SELECT
            p.*,
            u.name,
            u.avatar_url
          FROM saved_posts s
          JOIN posts p
            ON p.id=s.post_id
          JOIN users u
            ON u.id=p.user_id
          WHERE s.user_id=$1
          ORDER BY s.created_at DESC
        `,
        [user.id]
      );

      let content = `
        <div class="card">
          <h2>🔖 ذخیره‌شده‌ها</h2>
        </div>
      `;

      for (const p of result.rows) {
        content += `
          <div class="post">

            <div class="user-row">
              ${avatar(
                p.name,
                p.avatar_url
              )}

              <div class="user-info">
                <a
                  class="user-name"
                  href="/user?id=${p.user_id}"
                >
                  ${escapeHtml(p.name)}
                </a>
              </div>
            </div>

            <div class="text">
              ${escapeHtml(p.content)}
            </div>

            ${mediaHtml(p.media_url)}

            <a
              class="btn blue"
              href="/post?id=${p.id}"
            >
              مشاهده پست
            </a>

            ${button(
              `/save?id=${p.id}`,
              "🔖 حذف ذخیره",
              "purple"
            )}

          </div>
        `;
      }

      if (!result.rowCount) {
        content += `
          <div class="card empty">
            هنوز پستی ذخیره نکرده‌ای.
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

    /* =====================================================
       Notifications
    ===================================================== */

    if (
      method === "GET" &&
      path === "/notifications"
    ) {
      const result = await pool.query(
        `
          SELECT
            n.*,
            a.name AS actor,
            a.avatar_url
          FROM notifications n
          LEFT JOIN users a
            ON a.id=n.actor_id
          WHERE n.user_id=$1
          ORDER BY n.created_at DESC
          LIMIT 100
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

      let content = `
        <div class="card">
          <h2>🔔 اعلان‌ها</h2>

          <form
            method="post"
            action="/notifications/read"
          >
            <button class="gray">
              ✓ همه خوانده‌شده
            </button>
          </form>
        </div>
      `;

      for (const n of result.rows) {
        let text =
          "یک اعلان جدید داری.";

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
            <div class="user-row">

              ${avatar(
                n.actor || "کاربر",
                n.avatar_url,
                40
              )}

              <div class="user-info">

                <b>
                  ${escapeHtml(
                    n.actor || "کاربر"
                  )}
                </b>

                ${escapeHtml(text)}

                <div class="muted">
                  ${formatDate(
                    n.created_at
                  )}
                </div>

              </div>
            </div>
          </div>
        `;
      }

      if (!result.rowCount) {
        content += `
          <div class="card empty">
            اعلانی ندارید.
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

    if (
      method === "POST" &&
      path === "/notifications/read"
    ) {
      await pool.query(
        `
          UPDATE notifications
          SET read=true
          WHERE user_id=$1
        `,
        [user.id]
      );

      return redirect(
        res,
        "/notifications"
      );
    }

    /* =====================================================
       Messages List / Conversation
    ===================================================== */

    if (
      method === "GET" &&
      path === "/messages"
    ) {
      const otherId = safeInt(
        url.searchParams.get("user")
      );

      if (!otherId) {
        const chats = await pool.query(
          `
            WITH ranked AS (
              SELECT
                m.*,
                CASE
                  WHEN m.sender_id=$1
                  THEN m.receiver_id
                  ELSE m.sender_id
                END AS other_id,

                ROW_NUMBER() OVER (
                  PARTITION BY
                    CASE
                      WHEN m.sender_id=$1
                      THEN m.receiver_id
                      ELSE m.sender_id
                    END
                  ORDER BY m.created_at DESC
                ) AS rn

              FROM messages m

              WHERE
                m.sender_id=$1
                OR m.receiver_id=$1
            )

            SELECT
              r.*,
              u.name,
              u.avatar_url

            FROM ranked r

            JOIN users u
              ON u.id=r.other_id

            WHERE r.rn=1

            ORDER BY r.created_at DESC
          `,
          [user.id]
        );

        const users = await pool.query(
          `
            SELECT
              id,
              name,
              email,
              avatar_url
            FROM users
            WHERE id <> $1
            ORDER BY name
            LIMIT 50
          `,
          [user.id]
        );

        let content = `
          <div class="card">
            <h2>💬 پیام‌ها</h2>

            <h3>🔎 شروع گفت‌وگوی جدید</h3>

            <form method="get" action="/messages">
              <select
                name="user"
                required
              >
                <option value="">
                  انتخاب کاربر
                </option>

                ${users.rows
                  .map(
                    u => `
                      <option value="${u.id}">
                        ${escapeHtml(u.name)}
                        -
                        ${escapeHtml(u.email)}
                      </option>
                    `
                  )
                  .join("")}
              </select>

              <button class="blue full">
                💬 شروع گفتگو
              </button>
            </form>
          </div>
        `;

        for (const c of chats.rows) {
          content += `
            <a
              href="/messages?user=${c.other_id}"
              class="card"
              style="display:block;color:inherit"
            >
              <div class="user-row">

                ${avatar(
                  c.name,
                  c.avatar_url
                )}

                <div class="user-info">
                  <b>
                    ${escapeHtml(c.name)}
                  </b>

                  <div class="muted">
                    ${escapeHtml(
                      String(
                        c.content || ""
                      ).slice(0, 100)
                    )}
                  </div>

                  <div class="muted">
                    ${formatDate(
                      c.created_at
                    )}
                  </div>
                </div>

              </div>
            </a>
          `;
        }

        if (!chats.rowCount) {
          content += `
            <div class="card empty">
              هنوز گفت‌وگویی ندارید.
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

      if (otherId === user.id) {
        return redirect(
          res,
          "/messages"
        );
      }

      const target = await pool.query(
        `
          SELECT
            id,
            name,
            avatar_url
          FROM users
          WHERE id=$1
        `,
        [otherId]
      );

      if (!target.rowCount) {
        return redirect(
          res,
          "/messages"
        );
      }

      const blocked = await pool.query(
        `
          SELECT 1
          FROM blocks
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
        `,
        [
          user.id,
          otherId
        ]
      );

      const messages = await pool.query(
        `
          SELECT
            m.*,
            u.name,
            u.avatar_url
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
        `,
        [
          user.id,
          otherId
        ]
      );

      await pool.query(
        `
          UPDATE messages
          SET read=true
          WHERE
            receiver_id=$1
            AND sender_id=$2
        `,
        [
          user.id,
          otherId
        ]
      );

      let content = `
        <div class="card">
          <div class="user-row">

            ${avatar(
              target.rows[0].name,
              target.rows[0].avatar_url
            )}

            <div class="user-info">
              <h3>
                ${escapeHtml(
                  target.rows[0].name
                )}
              </h3>
            </div>

          </div>
        </div>
      `;

      if (blocked.rowCount) {
        content += `
          <div class="danger-box">
            این گفتگو به دلیل مسدود بودن
            امکان ارسال پیام جدید ندارد.
          </div>
        `;
      }

      for (const m of messages.rows) {
        content += `
          <div
            class="chat ${
              m.sender_id === user.id
                ? "me"
                : "other"
            }"
          >
            <b>
              ${escapeHtml(m.name)}
            </b>

            <div class="text">
              ${escapeHtml(m.content)}
            </div>

            <div class="muted">
              ${formatDate(
                m.created_at
              )}
            </div>
          </div>
        `;
      }

      if (!blocked.rowCount) {
        content += `
          <div class="card">

            <form
              method="post"
              action="/messages?user=${otherId}"
            >

              <textarea
                name="content"
                maxlength="5000"
                placeholder="پیام..."
                required
              ></textarea>

              <button class="blue full">
                📤 ارسال پیام
              </button>

            </form>

          </div>
        `;
      }

      return sendHtml(
        res,
        200,
        "گفت‌وگو",
        content,
        user
      );
    }

    /* =====================================================
       Send Message
    ===================================================== */

    if (
      method === "POST" &&
      path === "/messages"
    ) {
      const otherId = safeInt(
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
              (
                blocker_id=$1
                AND blocked_id=$2
              )
              OR
              (
                blocker_id=$2
                AND blocked_id=$1
              )
          `,
          [
            user.id,
            otherId
          ]
        );

        if (!blocked.rowCount) {
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
      }

      return redirect(
        res,
        `/messages?user=${otherId}`
      );
    }

    /* =====================================================
       Change Password
    ===================================================== */

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
            <h2>🔐 تغییر رمز</h2>

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
                placeholder="رمز جدید"
                required
              >

              <button class="orange full">
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
            <div class="card">
              <div class="danger-box">
                رمز جدید باید حداقل ۶ کاراکتر باشد.
              </div>
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
            <div class="card">
              <div class="danger-box">
                رمز فعلی اشتباه است.
              </div>
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

      /*
        همه Sessionهای قبلی حذف می‌شوند
        و کاربر با Session فعلی دوباره وارد می‌شود.
      */

      const sid =
        parseCookies(req).sessionId;

      await pool.query(
        `
          DELETE FROM sessions
          WHERE user_id=$1
            AND session_id<>$2
        `,
        [
          user.id,
          sid || ""
        ]
      );

      return redirect(
        res,
        "/profile"
      );
    }

    /* =====================================================
       Reports
    ===================================================== */

    if (
      method === "GET" &&
      path === "/report"
    ) {
      const postId = safeInt(
        url.searchParams.get("post")
      );

      const reportedUser = safeInt(
        url.searchParams.get("user")
      );

      const jobId = safeInt(
        url.searchParams.get("job")
      );

      return sendHtml(
        res,
        200,
        "گزارش",
        `
          <div class="card">
            <h2>🚩 گزارش</h2>

            <form
              method="post"
              action="/report"
            >

              <input
                type="hidden"
                name="post"
                value="${postId || ""}"
              >

              <input
                type="hidden"
                name="user"
                value="${reportedUser || ""}"
              >

              <input
                type="hidden"
                name="job"
                value="${jobId || ""}"
              >

              <textarea
                name="reason"
                maxlength="2000"
                placeholder="دلیل گزارش را بنویس..."
                required
              ></textarea>

              <button class="red full">
                🚩 ارسال گزارش
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
        safeInt(b.get("post")) || null;

      const reportedUser =
        safeInt(b.get("user")) || null;

      const jobId =
        safeInt(b.get("job")) || null;

      const reason =
        (b.get("reason") || "").trim();

      if (reason) {
        await pool.query(
          `
            INSERT INTO reports
            (
              reporter_id,
              post_id,
              reported_user_id,
              job_id,
              reason
            )
            VALUES($1,$2,$3,$4,$5)
          `,
          [
            user.id,
            postId,
            reportedUser,
            jobId,
            reason
          ]
        );
      }

      return sendHtml(
        res,
        200,
        "گزارش ثبت شد",
        `
          <div class="card">
            <div class="success-box">
              گزارش شما با موفقیت ثبت شد.
            </div>

            <a class="btn blue" href="/">
              🏠 بازگشت به خانه
            </a>
          </div>
        `,
        user
      );
    }

    /* =====================================================
       JOBS
    ===================================================== */

    if (
      method === "GET" &&
      path === "/jobs"
    ) {
      const q =
        (url.searchParams.get("q") || "")
          .trim();

      const city =
        (url.searchParams.get("city") || "")
          .trim();

      const minSalary =
        (url.searchParams.get("minSalary") || "")
          .trim();

      let jobs;

      if (q || city || minSalary) {
        jobs = await pool.query(
          `
            SELECT
              j.*,
              u.name,
              u.avatar_url
            FROM jobs j
            JOIN users u
              ON u.id=j.user_id

            WHERE
              (
                $1=''
                OR j.title ILIKE '%' || $1 || '%'
                OR COALESCE(j.description,'')
                   ILIKE '%' || $1 || '%'
              )

              AND
              (
                $2=''
                OR COALESCE(j.city,'')
                   ILIKE '%' || $2 || '%'
              )

            ORDER BY j.created_at DESC
            LIMIT 100
          `,
          [
            q,
            city
          ]
        );
      } else {
        jobs = await pool.query(
          `
            SELECT
              j.*,
              u.name,
              u.avatar_url
            FROM jobs j
            JOIN users u
              ON u.id=j.user_id
            ORDER BY j.created_at DESC
            LIMIT 100
          `
        );
      }

      let content = `
        <div class="card">

          <h2>💼 کاریابی</h2>

          <a
            class="btn green"
            href="/new-job"
          >
            ➕ ثبت آگهی شغلی
          </a>

          <form
            method="get"
            action="/jobs"
          >

            <input
              name="q"
              value="${escapeAttr(q)}"
              placeholder="عنوان یا توضیحات شغل"
            >

            <input
              name="city"
              value="${escapeAttr(city)}"
              placeholder="شهر"
            >

            <button class="blue full">
              🔎 جستجو
            </button>

          </form>

        </div>
      `;

      for (const j of jobs.rows) {
        content += `
          <div class="job">

            <h3>
              ${escapeHtml(j.title)}
            </h3>

            <div>
              👤 ${escapeHtml(j.name)}
            </div>

            <div>
              📍 ${escapeHtml(
                j.city || "نامشخص"
              )}
            </div>

            <div class="success">
              💰 ${escapeHtml(
                j.salary || "توافقی"
              )}
            </div>

            <div class="text">
              ${escapeHtml(
                String(
                  j.description || ""
                ).slice(0, 500)
              )}
            </div>

            <div class="muted">
              ${formatDate(j.created_at)}
            </div>

            <a
              class="btn blue"
              href="/job?id=${j.id}"
            >
              مشاهده جزئیات
            </a>

          </div>
        `;
      }

      if (!jobs.rowCount) {
        content += `
          <div class="card empty">
            آگهی‌ای پیدا نشد.
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

    /* =====================================================
       New Job
    ===================================================== */

    if (
      method === "GET" &&
      path === "/new-job"
    ) {
      return sendHtml(
        res,
        200,
        "آگهی شغلی جدید",
        `
          <div class="card">

            <h2>🚀 ثبت آگهی شغلی</h2>

            <form
              method="post"
              action="/new-job"
            >

              <input
                name="title"
                placeholder="عنوان شغل"
                maxlength="150"
                required
              >

              <input
                name="city"
                placeholder="شهر"
                maxlength="100"
              >

              <input
                name="salary"
                placeholder="حقوق"
                maxlength="100"
              >

              <textarea
                name="description"
                maxlength="10000"
                placeholder="توضیحات کامل آگهی"
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
            (
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
            city || null,
            salary || null,
            description
          ]
        );
      }

      return redirect(
        res,
        "/jobs"
      );
    }

    /* =====================================================
       Job Details
    ===================================================== */

    if (
      method === "GET" &&
      path === "/job"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      );

      const result = await pool.query(
        `
          SELECT
            j.*,
            u.name,
            u.email,
            u.avatar_url
          FROM jobs j
          JOIN users u
            ON u.id=j.user_id
          WHERE j.id=$1
        `,
        [id]
      );

      if (!result.rowCount) {
        return sendHtml(
          res,
          404,
          "آگهی",
          `
            <div class="card empty">
              آگهی پیدا نشد.
            </div>
          `,
          user
        );
      }

      const j = result.rows[0];

      return sendHtml(
        res,
        200,
        "جزئیات آگهی",
        `
          <div class="job">

            <h2>
              ${escapeHtml(j.title)}
            </h2>

            <div class="muted">
              منتشرکننده:
              ${escapeHtml(j.name)}
            </div>

            <hr>

            <div>
              📍 شهر:
              ${escapeHtml(
                j.city || "نامشخص"
              )}
            </div>

            <div class="success">
              💰 حقوق:
              ${escapeHtml(
                j.salary || "توافقی"
              )}
            </div>

            <div class="text">
              ${escapeHtml(
                j.description || ""
              )}
            </div>

            <div class="muted">
              ${formatDate(j.created_at)}
            </div>

            ${
              j.user_id !== user.id
                ? `
                  <a
                    class="btn blue"
                    href="/messages?user=${j.user_id}"
                  >
                    💬 پیام به آگهی‌دهنده
                  </a>

                  <a
                    class="btn red"
                    href="/report?job=${j.id}"
                  >
                    🚩 گزارش آگهی
                  </a>
                `
                : `
                  <a
                    class="btn blue"
                    href="/edit-job?id=${j.id}"
                  >
                    ✏️ ویرایش آگهی
                  </a>

                  ${button(
                    `/delete-job?id=${j.id}`,
                    "🗑️ حذف آگهی",
                    "red"
                  )}
                `
            }

          </div>
        `,
        user
      );
    }

    /* =====================================================
       Edit Job
    ===================================================== */

    if (
      method === "GET" &&
      path === "/edit-job"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      );

      const result = await pool.query(
        `
          SELECT *
          FROM jobs
          WHERE id=$1
            AND user_id=$2
        `,
        [
          id,
          user.id
        ]
      );

      if (!result.rowCount) {
        return redirect(
          res,
          "/jobs"
        );
      }

      const j = result.rows[0];

      return sendHtml(
        res,
        200,
        "ویرایش آگهی",
        `
          <div class="card">

            <h2>✏️ ویرایش آگهی</h2>

            <form
              method="post"
              action="/edit-job?id=${id}"
            >

              <input
                name="title"
                value="${escapeAttr(j.title)}"
                required
              >

              <input
                name="city"
                value="${escapeAttr(
                  j.city || ""
                )}"
                placeholder="شهر"
              >

              <input
                name="salary"
                value="${escapeAttr(
                  j.salary || ""
                )}"
                placeholder="حقوق"
              >

              <textarea
                name="description"
                required
              >${escapeHtml(
                j.description || ""
              )}</textarea>

              <button class="blue full">
                💾 ذخیره تغییرات
              </button>

            </form>

          </div>
        `,
        user
      );
    }

    if (
      method === "POST" &&
      path === "/edit-job"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      );

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
            UPDATE jobs
            SET
              title=$1,
              city=$2,
              salary=$3,
              description=$4,
              updated_at=NOW()
            WHERE id=$5
              AND user_id=$6
          `,
          [
            title,
            city || null,
            salary || null,
            description,
            id,
            user.id
          ]
        );
      }

      return redirect(
        res,
        `/job?id=${id}`
      );
    }

    /* =====================================================
       Delete Job
    ===================================================== */

    if (
      method === "POST" &&
      path === "/delete-job"
    ) {
      const id = safeInt(
        url.searchParams.get("id")
      );

      await pool.query(
        `
          DELETE FROM jobs
          WHERE id=$1
            AND user_id=$2
        `,
        [
          id,
          user.id
        ]
      );

      return redirect(
        res,
        "/jobs"
      );
    }

    /* =====================================================
       404
    ===================================================== */

    return sendHtml(
      res,
      404,
      "صفحه پیدا نشد",
      `
        <div class="card empty">
          <h2>404</h2>
          <p>
            این صفحه وجود ندارد.
          </p>

          <a
            class="btn blue"
            href="/"
          >
            🏠 بازگشت به خانه
          </a>
        </div>
      `,
      user
    );

  } catch (error) {
    console.error("Application error:", error);

    try {
      return sendHtml(
        res,
        500,
        "خطای سرور",
        `
          <div class="card">
            <div class="danger-box">
              خطایی در پردازش درخواست رخ داد.
            </div>

            <a
              class="btn blue"
              href="/"
            >
              🏠 بازگشت به خانه
            </a>
          </div>
        `,
        user || null
      );
    } catch {
      res.writeHead(500, {
        "Content-Type":
          "text/plain; charset=utf-8"
      });

      res.end("Internal Server Error");
    }
  }
}

/* =========================================================
   شروع سرور
========================================================= */

async function start() {
  try {
    await initDatabase();

    const server = http.createServer(app);

    server.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Server running on port ${PORT}`
      );
    });

    process.on("SIGTERM", async () => {
      console.log("SIGTERM received.");

      server.close(async () => {
        await pool.end();
        process.exit(0);
      });
    });

    process.on("SIGINT", async () => {
      console.log("SIGINT received.");

      server.close(async () => {
        await pool.end();
        process.exit(0);
      });
    });

  } catch (error) {
    console.error(
      "Failed to start server:",
      error
    );

    await pool.end();

    process.exit(1);
  }
}

start();
