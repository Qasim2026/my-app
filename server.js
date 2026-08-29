const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 10000;
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

/* =========================================================
   SECURITY / HELPERS
========================================================= */

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
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

  header.split(";").forEach(part => {
    const index = part.indexOf("=");

    if (index < 0) {
      return;
    }

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

function sendHtml(res, status, title, content, user = null) {
  if (res.headersSent) {
    return;
  }

  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });

  res.end(
    page(
      title,
      content,
      user
    )
  );
}

function page(title, content, user) {
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

  const topMenu = user
    ? `
      <div class="top-actions">

        <a href="/notifications">
          🔔 اعلان‌ها
        </a>

        <a href="/jobs">
          💼 کاریابی
        </a>

        <a href="/settings">
          ⚙️ تنظیمات
        </a>

        <a href="/logout">
          🚪 خروج
        </a>

      </div>
    `
    : "";

  return `<!DOCTYPE html>

<html
  lang="fa"
  dir="rtl"
>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<meta
  name="theme-color"
  content="#202124"
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
  background: #eef1f5;
  color: #202124;
  font-family: Tahoma, Arial, sans-serif;
}

.app {
  width: 100%;
  max-width: 720px;
  min-height: 100vh;
  margin: auto;
  background: #fff;
  padding-bottom: ${user ? "90px" : "25px"};
}

.header {
  position: sticky;
  top: 0;
  z-index: 30;
  background: #fff;
  border-bottom: 1px solid #e4e7eb;
  padding: 13px 15px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.logo {
  font-weight: 800;
  font-size: 18px;
}

.title {
  font-size: 16px;
  font-weight: 700;
}

.content {
  padding: 14px;
}

.card {
  background: #fff;
  border: 1px solid #e1e5ea;
  border-radius: 18px;
  padding: 15px;
  margin-bottom: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,.04);
}

.profile-head {
  display: flex;
  align-items: center;
  gap: 11px;
}

.avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #202124;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 21px;
  font-weight: bold;
  flex: none;
  overflow: hidden;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar.large {
  width: 100px;
  height: 100px;
  font-size: 36px;
  margin: auto;
}

.profile-cover {
  height: 110px;
  border-radius: 15px;
  background: linear-gradient(
    135deg,
    #202124,
    #555
  );
}

.profile-avatar-wrap {
  margin-top: -50px;
  position: relative;
  z-index: 2;
}

.username {
  font-weight: 800;
  font-size: 16px;
}

.email {
  color: #777;
  font-size: 12px;
  margin-top: 4px;
  direction: ltr;
  text-align: right;
  word-break: break-all;
}

.post-text {
  margin: 17px 0;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-text {
  margin-top: 7px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.stats {
  display: flex;
  gap: 14px;
  color: #666;
  font-size: 13px;
  flex-wrap: wrap;
}

.actions {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 12px;
}

button,
.btn {
  border: 0;
  border-radius: 11px;
  padding: 11px 14px;
  background: #202124;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  text-decoration: none;
  display: inline-block;
}

button:hover,
.btn:hover {
  opacity: .9;
}

.full {
  width: 100%;
  margin-top: 8px;
  text-align: center;
}

.like {
  background: #e91e63;
}

.follow {
  background: #1976d2;
}

.danger {
  background: #b00020;
}

.green {
  background: #087f23;
}

input,
textarea {
  width: 100%;
  padding: 12px;
  margin: 7px 0;
  border: 1px solid #ccd2d9;
  border-radius: 11px;
  font-size: 16px;
  font-family: Tahoma, Arial, sans-serif;
  background: #fff;
}

textarea {
  min-height: 120px;
  resize: vertical;
}

input[type="file"] {
  padding: 9px;
}

a {
  text-decoration: none;
  color: inherit;
}

.top-actions {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 0 14px 12px;
}

.top-actions a {
  background: #f4f6f8;
  border-radius: 10px;
  padding: 8px 10px;
  white-space: nowrap;
  font-size: 12px;
}

.menu {
  display: grid;
  gap: 9px;
}

.menu a {
  display: block;
}

.empty {
  text-align: center;
  color: #777;
  padding: 30px 10px;
}

.success {
  color: #087f23;
}

.error {
  color: #b00020;
}

.comment {
  background: #f5f6f8;
  border-radius: 12px;
  padding: 10px;
  margin-top: 8px;
}

.comment-name {
  font-weight: bold;
}

.job {
  border: 1px solid #e0e4e8;
  border-radius: 15px;
  padding: 14px;
  margin-bottom: 11px;
}

.job-title {
  font-size: 18px;
  font-weight: 800;
}

.job-city,
.job-salary {
  margin-top: 7px;
}

.job-salary {
  color: #087f23;
}

.job-description {
  margin-top: 11px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.post-image {
  width: 100%;
  max-height: 500px;
  object-fit: cover;
  border-radius: 14px;
  margin-top: 10px;
}

.notice {
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff8e1;
  color: #795548;
  margin-bottom: 12px;
}

.theme-btn {
  background: #f4f6f8;
  color: #202124;
}

.small {
  font-size: 12px;
  color: #777;
}

.divider {
  height: 1px;
  background: #e3e6e9;
  margin: 18px 0;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 720px;
  height: 67px;
  background: #fff;
  border-top: 1px solid #ddd;
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 50;
  box-shadow: 0 -3px 12px rgba(0,0,0,.05);
}

.bottom-nav a {
  text-align: center;
  font-size: 11px;
  color: #444;
  min-width: 55px;
}

.bottom-nav span {
  display: block;
  font-size: 21px;
  margin-bottom: 2px;
}

.hero {
  padding: 8px 0 14px;
}

.hero h1 {
  margin: 5px 0 8px;
  font-size: 23px;
}

.hero p {
  line-height: 1.8;
  color: #666;
}

.badge {
  display: inline-block;
  background: #eef3ff;
  color: #2455c3;
  border-radius: 20px;
  padding: 5px 9px;
  font-size: 11px;
}

.message-card {
  border-radius: 15px;
  padding: 12px;
  margin-bottom: 9px;
  max-width: 88%;
}

.message-me {
  margin-right: auto;
  background: #202124;
  color: #fff;
}

.message-other {
  margin-left: auto;
  background: #f2f3f5;
  color: #202124;
}

.message-author {
  font-weight: 800;
  font-size: 12px;
  margin-bottom: 5px;
}

@media(max-width:480px) {

  .content {
    padding: 10px;
  }

  .card {
    border-radius: 15px;
  }

  .actions button,
  .actions .btn {
    padding: 10px 11px;
  }

}

body.dark {
  background: #111;
  color: #eee;
}

body.dark .app,
body.dark .header,
body.dark .bottom-nav,
body.dark input,
body.dark textarea {
  background: #181818;
  color: #eee;
}

body.dark .card {
  background: #1d1d1d;
  border-color: #333;
}

body.dark .top-actions a {
  background: #292929;
  color: #eee;
}

body.dark input,
body.dark textarea {
  border-color: #444;
}

body.dark .comment,
body.dark .job,
body.dark .message-other {
  background: #242424;
  border-color: #3a3a3a;
  color: #eee;
}

body.dark .email,
body.dark .small,
body.dark .stats {
  color: #aaa;
}

</style>

</head>

<body>

<div class="app">

<header class="header">

  <div class="logo">
    📱 MySocial
  </div>

  <div class="title">
    ${escapeHtml(title)}
  </div>

</header>

${topMenu}

<main class="content">

${content}

</main>

</div>

${nav}

<script>

function toggleTheme() {

  document.body.classList.toggle("dark");

  localStorage.setItem(
    "dark",
    document.body.classList.contains("dark")
  );

}

if (
  localStorage.getItem("dark") === "true"
) {
  document.body.classList.add("dark");
}

</script>

</body>

</html>`;
}

/* =========================================================
   DATABASE HELPERS
========================================================= */

async function ensureColumn(
  table,
  column,
  definition
) {
  await pool.query(
    `ALTER TABLE ${table}
     ADD COLUMN IF NOT EXISTS ${column}
     ${definition}`
  );
}

async function createTables() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn(
    "users",
    "bio",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "users",
    "avatar_url",
    "TEXT DEFAULT ''"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      content TEXT,
      image_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    "TEXT DEFAULT ''"
  );

  try {

    await pool.query(`
      UPDATE posts
      SET content = text
      WHERE
        (content IS NULL OR content = '')
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name='posts'
          AND column_name='text'
        )
    `);

  } catch (error) {

    console.log(
      "Old posts.text migration skipped."
    );

  }

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
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      UNIQUE(post_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      id SERIAL PRIMARY KEY,
      follower_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      following_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      UNIQUE(follower_id,following_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_users (
      id SERIAL PRIMARY KEY,
      blocker_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      UNIQUE(blocker_id,blocked_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      salary TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log(
    "Database tables checked successfully."
  );
}

/* =========================================================
   SESSION
========================================================= */

async function createSession(userId) {

  const sessionId =
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
      sessionId,
      userId
    ]
  );

  return sessionId;
}

async function getSession(req) {

  const cookies =
    parseCookies(req);

  const sessionId =
    cookies.sessionId;

  if (!sessionId) {
    return null;
  }

  const result =
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
      [
        sessionId
      ]
    );

  return result.rows[0] || null;
}

/* =========================================================
   BLOCK CHECK
========================================================= */

async function areBlocked(
  userA,
  userB
) {

  if (
    !Number.isInteger(Number(userA)) ||
    !Number.isInteger(Number(userB))
  ) {
    return false;
  }

  if (
    Number(userA) === Number(userB)
  ) {
    return false;
  }

  const result =
    await pool.query(
      `
        SELECT id
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
        userA,
        userB
      ]
    );

  return result.rows.length > 0;
}

/* =========================================================
   NOTIFICATION
========================================================= */

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

/* =========================================================
   SERVER
========================================================= */

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

        /* =================================================
           HOME
        ================================================= */

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
                    به MySocial خوش آمدید 👋
                  </h1>

                  <p>
                    یک شبکه اجتماعی ساده برای
                    انتشار پست، دنبال کردن کاربران،
                    پیام‌رسانی و کاریابی.
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
                  ) AS like_count,

                  (
                    SELECT COUNT(*)
                    FROM comments c
                    WHERE c.post_id=p.id
                  ) AS comment_count,

                  EXISTS(
                    SELECT 1
                    FROM likes l2
                    WHERE
                      l2.post_id=p.id
                      AND l2.user_id=$1
                  ) AS liked,

                  EXISTS(
                    SELECT 1
                    FROM bookmarks b
                    WHERE
                      b.post_id=p.id
                      AND b.user_id=$1
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

                LIMIT 100
              `,
              [
                user.id
              ]
            );

          let html = `
            <div class="card">

              <div class="profile-head">

                <div class="avatar">

                  ${
                    user.avatar_url
                      ? `
                        <img
                          src="${escapeAttr(user.avatar_url)}"
                          alt="پروفایل"
                        >
                      `
                      : escapeHtml(
                          user.name.charAt(0)
                        )
                  }

                </div>

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

          if (!posts.rows.length) {

            html += `
              <div class="card empty">

                هنوز پستی منتشر نشده است.

                <br>

                اولین پست را منتشر کن! 📸

              </div>
            `;

          } else {

            for (
              const post of posts.rows
            ) {

              html += `
                <article class="card">

                  <div class="profile-head">

                    <a
                      href="/profile?id=${post.user_id}"
                    >

                      <div class="avatar">

                        ${
                          post.avatar_url
                            ? `
                              <img
                                src="${escapeAttr(
                                  post.avatar_url
                                )}"
                                alt="پروفایل"
                              >
                            `
                            : escapeHtml(
                                post.name.charAt(0)
                              )
                        }

                      </div>

                    </a>

                    <div>

                      <a
                        href="/profile?id=${post.user_id}"
                      >

                        <div class="username">
                          ${escapeHtml(post.name)}
                        </div>

                      </a>

                      <div class="email">
                        ${escapeHtml(post.email)}
                      </div>

                      <div class="small">
                        ${new Date(
                          post.created_at
                        ).toLocaleString("fa-IR")}
                      </div>

                    </div>

                  </div>

                  <div class="post-text">
                    ${escapeHtml(post.content)}
                  </div>

                  ${
                    post.image_url
                      ? `
                        <img
                          class="post-image"
                          src="${escapeAttr(
                            post.image_url
                          )}"
                          alt="تصویر پست"
                        >
                      `
                      : ""
                  }

                  <div class="stats">

                    <span>
                      ❤️ ${post.like_count}
                    </span>

                    <span>
                      💬 ${post.comment_count}
                    </span>

                  </div>

                  <div class="actions">

                    <a
                      href="/like?post=${post.id}"
                    >

                      <button class="like">
                        ${
                          post.liked
                            ? "💔 برداشتن لایک"
                            : "❤️ لایک"
                        }
                      </button>

                    </a>

                    <a
                      href="/post?id=${post.id}"
                    >

                      <button>
                        💬 نظرات
                      </button>

                    </a>

                    <a
                      href="/bookmark?post=${post.id}"
                    >

                      <button>
                        ${
                          post.bookmarked
                            ? "🔖 حذف ذخیره"
                            : "🔖 ذخیره"
                        }
                      </button>

                    </a>

                    <a
                      href="/report?post=${post.id}&user=${post.user_id}"
                    >

                      <button class="danger">
                        🚩 گزارش
                      </button>

                    </a>

                  </div>

                </article>
              `;
            }

          }

          sendHtml(
            res,
            200,
            "خانه",
            html,
            user
          );

          return;
        }

        /* =================================================
           SIGNUP GET
        ================================================= */

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

                <h2>
                  📝 ثبت‌نام
                </h2>

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

              <a href="/">
                🏠 بازگشت
              </a>
            `
          );

          return;
        }

        /* =================================================
           SIGNUP POST
        ================================================= */

        if (
          req.method === "POST" &&
          path === "/signup"
        ) {

          const data =
            await readBody(req);

          const name =
            String(
              data.get("name") || ""
            ).trim();

          const email =
            String(
              data.get("email") || ""
            )
              .trim()
              .toLowerCase();

          const password =
            String(
              data.get("password") || ""
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
                    نام، ایمیل و رمز حداقل ۶ کاراکتری لازم است.
                  </p>

                  <a href="/signup">
                    بازگشت
                  </a>

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

          } catch (error) {

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

        /* =================================================
           LOGIN GET
        ================================================= */

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

                <h2>
                  🔐 ورود
                </h2>

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

              <a href="/signup">
                📝 ساخت حساب جدید
              </a>
            `
          );

          return;
        }

        /* =================================================
           LOGIN POST
        ================================================= */

        if (
          req.method === "POST" &&
          path === "/login"
        ) {

          const data =
            await readBody(req);

          const email =
            String(
              data.get("email") || ""
            )
              .trim()
              .toLowerCase();

          const password =
            String(
              data.get("password") || ""
            );

          const result =
            await pool.query(
              `
                SELECT
                  id,
                  name,
                  email
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

          if (!result.rows.length) {

            sendHtml(
              res,
              401,
              "خطا",
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

          const sessionId =
            await createSession(
              result.rows[0].id
            );

          redirect(
            res,
            "/",
            `sessionId=${encodeURIComponent(
              sessionId
            )}; HttpOnly; Path=/; SameSite=Lax`
          );

          return;
        }

        /* =================================================
           PROTECTED ROUTES
        ================================================= */

        if (!user) {

          redirect(
            res,
            "/login"
          );

          return;
        }

        /* =================================================
           NEW POST GET
        ================================================= */

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

                <h2>
                  ➕ انتشار پست جدید
                </h2>

                <form
                  method="POST"
                  action="/new-post"
                >

                  <textarea
                    name="content"
                    maxlength="5000"
                    placeholder="چه چیزی می‌خواهی منتشر کنی؟"
                    required
                  ></textarea>

                  <input
                    name="image_url"
                    type="url"
                    maxlength="2000"
                    placeholder="لینک تصویر (اختیاری)"
                  >

                  <button class="full">
                    📢 انتشار
                  </button>

                </form>

              </div>
            `,
            user
          );

          return;
        }

        /* =================================================
           NEW POST POST
        ================================================= */

        if (
          req.method === "POST" &&
          path === "/new-post"
        ) {

          const data =
            await readBody(req);

          const content =
            String(
              data.get("content") || ""
            ).trim();

          const imageUrl =
            String(
              data.get("image_url") || ""
            ).trim();

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

          redirect(
            res,
            "/"
          );

          return;
        }

        /* =================================================
           LIKE
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/like"
        ) {

          const postId =
            Number(
              requestUrl.searchParams.get("post")
            );

          if (
            Number.isInteger(postId)
          ) {

            const post =
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
                    ) AS liked

                  FROM posts

                  WHERE id=$1
                `,
                [
                  postId,
                  user.id
                ]
              );

            if (post.rows.length) {

              if (
                post.rows[0].liked
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
                  post.rows[0].user_id,
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
            "/"
          );

          return;
        }

        /* =================================================
           BOOKMARK
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/bookmark"
        ) {

          const postId =
            Number(
              requestUrl.searchParams.get("post")
            );

          if (
            Number.isInteger(postId)
          ) {

            const post =
              await pool.query(
                `
                  SELECT user_id
                  FROM posts
                  WHERE id=$1
                `,
                [
                  postId
                ]
              );

            if (post.rows.length) {

              const existing =
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

              if (
                existing.rows.length
              ) {

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

          }

          redirect(
            res,
            requestUrl.searchParams.get("from") === "saved"
              ? "/saved"
              : "/"
          );

          return;
        }

        /* =================================================
           POST DETAIL
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/post"
        ) {

          const postId =
            Number(
              requestUrl.searchParams.get("id")
            );

          if (
            !Number.isInteger(postId)
          ) {

            redirect(
              res,
              "/"
            );

            return;
          }

          const result =
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
                  ) AS like_count,

                  (
                    SELECT COUNT(*)
                    FROM comments c
                    WHERE c.post_id=p.id
                  ) AS comment_count,

                  EXISTS(
                    SELECT 1
                    FROM likes l
                    WHERE
                      l.post_id=p.id
                      AND l.user_id=$1
                  ) AS liked,

                  EXISTS(
                    SELECT 1
                    FROM bookmarks b
                    WHERE
                      b.post_id=p.id
                      AND b.user_id=$1
                  ) AS bookmarked

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

          if (!result.rows.length) {

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

          const post =
            result.rows[0];

          if (
            await areBlocked(
              user.id,
              post.user_id
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

          const comments =
            await pool.query(
              `
                SELECT

                  c.id,
                  c.comment,
                  c.created_at,

                  u.id AS user_id,
                  u.name,
                  u.email,
                  u.avatar_url

                FROM comments c

                JOIN users u
                  ON u.id=c.user_id

                WHERE c.post_id=$1

                ORDER BY c.created_at ASC

                LIMIT 500
              `,
              [
                postId
              ]
            );

          let html = `
            <article class="card">

              <div class="profile-head">

                <a
                  href="/profile?id=${post.user_id}"
                >

                  <div class="avatar">

                    ${
                      post.avatar_url
                        ? `
                          <img
                            src="${escapeAttr(
                              post.avatar_url
                            )}"
                            alt="پروفایل"
                          >
                        `
                        : escapeHtml(
                            post.name.charAt(0)
                          )
                    }

                  </div>

                </a>

                <div>

                  <a
                    href="/profile?id=${post.user_id}"
                  >

                    <div class="username">
                      ${escapeHtml(post.name)}
                    </div>

                  </a>

                  <div class="email">
                    ${escapeHtml(post.email)}
                  </div>

                  <div class="small">
                    ${new Date(
                      post.created_at
                    ).toLocaleString("fa-IR")}
                  </div>

                </div>

              </div>

              <div class="post-text">
                ${escapeHtml(post.content)}
              </div>

              ${
                post.image_url
                  ? `
                    <img
                      class="post-image"
                      src="${escapeAttr(
                        post.image_url
                      )}"
                      alt="تصویر پست"
                    >
                  `
                  : ""
              }

              <div class="stats">

                <span>
                  ❤️ ${post.like_count}
                </span>

                <span>
                  💬 ${post.comment_count}
                </span>

              </div>

              <div class="actions">

                <a
                  href="/like?post=${post.id}"
                >

                  <button class="like">
                    ${
                      post.liked
                        ? "💔 برداشتن لایک"
                        : "❤️ لایک"
                    }
                  </button>

                </a>

                <a
                  href="/bookmark?post=${post.id}"
                >

                  <button>
                    ${
                      post.bookmarked
                        ? "🔖 حذف ذخیره"
                        : "🔖 ذخیره"
                    }
                  </button>

                </a>

                <a
                  href="/report?post=${post.id}&user=${post.user_id}"
                >

                  <button class="danger">
                    🚩 گزارش
                  </button>

                </a>

                <a href="/">

                  <button>
                    🏠 خانه
                  </button>

                </a>

                ${
                  Number(post.user_id) ===
                  Number(user.id)
                    ? `
                      <a
                        href="/delete-post?id=${post.id}"
                      >

                        <button class="danger">
                          🗑️ حذف پست
                        </button>

                      </a>
                    `
                    : ""
                }

              </div>

            </article>

            <div class="card">

              <h3>
                💬 ارسال نظر
              </h3>

              <form
                method="POST"
                action="/comment"
              >

                <input
                  type="hidden"
                  name="post_id"
                  value="${post.id}"
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
          `;

          if (
            !comments.rows.length
          ) {

            html += `
              <div class="card empty">
                هنوز نظری ثبت نشده است.
              </div>
            `;

          } else {

            for (
              const comment of comments.rows
            ) {

              html += `
                <div class="card">

                  <div class="profile-head">

                    <a
                      href="/profile?id=${comment.user_id}"
                    >

                      <div class="avatar">

                        ${
                          comment.avatar_url
                            ? `
                              <img
                                src="${escapeAttr(
                                  comment.avatar_url
                                )}"
                                alt="پروفایل"
                              >
                            `
                            : escapeHtml(
                                comment.name.charAt(0)
                              )
                        }

                      </div>

                    </a>

                    <div>

                      <a
                        href="/profile?id=${comment.user_id}"
                      >

                        <div class="username">
                          ${escapeHtml(
                            comment.name
                          )}
                        </div>

                      </a>

                      <div class="small">
                        ${new Date(
                          comment.created_at
                        ).toLocaleString("fa-IR")}
                      </div>

                    </div>

                  </div>

                  <div class="comment-text">
                    ${escapeHtml(
                      comment.comment
                    )}
                  </div>

                </div>
              `;
            }

          }

          sendHtml(
            res,
            200,
            "پست",
            html,
            user
          );

          return;
        }

        /* =================================================
           COMMENT
        ================================================= */

        if (
          req.method === "POST" &&
          path === "/comment"
        ) {

          const data =
            await readBody(req);

          const postId =
            Number(
              data.get("post_id")
            );

          const comment =
            String(
              data.get("comment") || ""
            ).trim();

          if (
            !Number.isInteger(postId) ||
            !comment
          ) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    اطلاعات نظر معتبر نیست.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          const post =
            await pool.query(
              `
                SELECT user_id
                FROM posts
                WHERE id=$1
              `,
              [
                postId
              ]
            );

          if (!post.rows.length) {

            sendHtml(
              res,
              404,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    پست پیدا نشد.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          if (
            await areBlocked(
              user.id,
              post.rows[0].user_id
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
            post.rows[0].user_id,
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

        /* =================================================
           PROFILE
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/profile"
        ) {

          const profileId =
            Number(
              requestUrl.searchParams.get("id")
            ) || user.id;

          const result =
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
              [
                profileId
              ]
            );

          if (!result.rows.length) {

            sendHtml(
              res,
              404,
              "کاربر پیدا نشد",
              `
                <div class="card">

                  <p class="error">
                    کاربر پیدا نشد.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          const profile =
            result.rows[0];

          const followerCount =
            await pool.query(
              `
                SELECT COUNT(*)
                FROM follows
                WHERE following_id=$1
              `,
              [
                profileId
              ]
            );

          const followingCount =
            await pool.query(
              `
                SELECT COUNT(*)
                FROM follows
                WHERE follower_id=$1
              `,
              [
                profileId
              ]
            );

          const isFollowing =
            await pool.query(
              `
                SELECT id
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

          const isBlocked =
            await pool.query(
              `
                SELECT id
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

          const posts =
            await pool.query(
              `
                SELECT

                  id,
                  content,
                  image_url,
                  created_at

                FROM posts

                WHERE user_id=$1

                ORDER BY created_at DESC

                LIMIT 100
              `,
              [
                profileId
              ]
            );

          let html = `
            <div class="card">

              <div class="profile-cover"></div>

              <div class="profile-avatar-wrap">

                <div class="avatar large">

                  ${
                    profile.avatar_url
                      ? `
                        <img
                          src="${escapeAttr(
                            profile.avatar_url
                          )}"
                          alt="پروفایل"
                        >
                      `
                      : escapeHtml(
                          profile.name.charAt(0)
                        )
                  }

                </div>

              </div>

              <div
                style="
                  text-align:center;
                  margin-top:10px;
                "
              >

                <div class="username">
                  ${escapeHtml(profile.name)}
                </div>

                <div class="email">
                  ${escapeHtml(profile.email)}
                </div>

              </div>

              ${
                profile.bio
                  ? `
                    <div class="post-text">
                      ${escapeHtml(profile.bio)}
                    </div>
                  `
                  : ""
              }

              <div class="stats">

                <span>
                  👥 دنبال‌کننده:
                  ${followerCount.rows[0].count}
                </span>

                <span>
                  ➡️ دنبال‌شونده:
                  ${followingCount.rows[0].count}
                </span>

              </div>

              ${
                Number(profileId) ===
                Number(user.id)

                  ? `
                    <div class="actions">

                      <a href="/settings">

                        <button>
                          ⚙️ ویرایش پروفایل
                        </button>

                      </a>

                    </div>
                  `

                  : `
                    <div class="actions">

                      <a
                        href="/follow?user=${profileId}"
                      >

                        <button class="follow">

                          ${
                            isFollowing.rows.length
                              ? "❌ لغو دنبال کردن"
                              : "➕ دنبال کردن"
                          }

                        </button>

                      </a>

                      <a
                        href="/messages?user=${profileId}"
                      >

                        <button>
                          💬 پیام
                        </button>

                      </a>

                      <a
                        href="/block?user=${profileId}"
                      >

                        <button class="danger">

                          ${
                            isBlocked.rows.length
                              ? "🔓 رفع مسدودی"
                              : "🚫 مسدود کردن"
                          }

                        </button>

                      </a>

                    </div>
                  `
              }

            </div>
          `;

          if (
            !posts.rows.length
          ) {

            html += `
              <div class="card empty">
                هنوز پستی منتشر نشده است.
              </div>
            `;

          } else {

            for (
              const post of posts.rows
            ) {

              html += `
                <article class="card">

                  <div class="small">
                    ${new Date(
                      post.created_at
                    ).toLocaleString("fa-IR")}
                  </div>

                  <div class="post-text">
                    ${escapeHtml(
                      post.content
                    )}
                  </div>

                  ${
                    post.image_url
                      ? `
                        <img
                          class="post-image"
                          src="${escapeAttr(
                            post.image_url
                          )}"
                          alt="تصویر"
                        >
                      `
                      : ""
                  }

                  <div class="actions">

                    <a
                      href="/post?id=${post.id}"
                    >

                      <button>
                        💬 مشاهده پست
                      </button>

                    </a>

                    ${
                      Number(profileId) ===
                      Number(user.id)

                        ? `
                          <a
                            href="/delete-post?id=${post.id}"
                          >

                            <button class="danger">
                              🗑️ حذف
                            </button>

                          </a>
                        `
                        : ""
                    }

                  </div>

                </article>
              `;
            }

          }

          sendHtml(
            res,
            200,
            "پروفایل",
            html,
            user
          );

          return;
        }

        /* =================================================
           FOLLOW
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/follow"
        ) {

          const targetId =
            Number(
              requestUrl.searchParams.get("user")
            );

          if (
            !Number.isInteger(targetId) ||
            targetId === user.id
          ) {

            redirect(
              res,
              "/"
            );

            return;
          }

          const target =
            await pool.query(
              `
                SELECT id
                FROM users
                WHERE id=$1
              `,
              [
                targetId
              ]
            );

          if (!target.rows.length) {

            redirect(
              res,
              "/"
            );

            return;
          }

          if (
            await areBlocked(
              user.id,
              targetId
            )
          ) {

            redirect(
              res,
              `/profile?id=${targetId}`
            );

            return;
          }

          const existing =
            await pool.query(
              `
                SELECT id
                FROM follows
                WHERE
                  follower_id=$1
                  AND following_id=$2
              `,
              [
                user.id,
                targetId
              ]
            );

          if (
            existing.rows.length
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
                targetId
              ]
            );

          } else {

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
                targetId
              ]
            );

            await notify(
              targetId,
              user.id,
              "follow",
              null,
              `${user.name} شما را دنبال کرد.`
            );

          }

          redirect(
            res,
            `/profile?id=${targetId}`
          );

          return;
        }

        /* =================================================
           SEARCH
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/search"
        ) {

          const q =
            String(
              requestUrl.searchParams.get("q") || ""
            ).trim();

          let html = `
            <div class="card">

              <h2>
                🔎 جستجو
              </h2>

              <form
                method="GET"
                action="/search"
              >

                <input
                  name="q"
                  value="${escapeAttr(q)}"
                  maxlength="255"
                  placeholder="نام، ایمیل، شغل..."
                >

                <button class="full">
                  جستجو
                </button>

              </form>

            </div>
          `;

          if (q) {

            const users =
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
                    name ILIKE $1
                    OR email ILIKE $1

                  ORDER BY name

                  LIMIT 50
                `,
                [
                  `%${q}%`
                ]
              );

            html += `
              <h3>
                👥 کاربران
              </h3>
            `;

            if (!users.rows.length) {

              html += `
                <div class="card empty">
                  کاربری پیدا نشد.
                </div>
              `;

            } else {

              for (
                const found of users.rows
              ) {

                html += `
                  <div class="card">

                    <div class="profile-head">

                      <a
                        href="/profile?id=${found.id}"
                      >

                        <div class="avatar">

                          ${
                            found.avatar_url
                              ? `
                                <img
                                  src="${escapeAttr(
                                    found.avatar_url
                                  )}"
                                  alt="تصویر"
                                >
                              `
                              : escapeHtml(
                                  found.name.charAt(0)
                                )
                          }

                        </div>

                      </a>

                      <div>

                        <div class="username">
                          ${escapeHtml(
                            found.name
                          )}
                        </div>

                        <div class="email">
                          ${escapeHtml(
                            found.email
                          )}
                        </div>

                        ${
                          found.bio
                            ? `
                              <div class="small">
                                ${escapeHtml(
                                  found.bio
                                )}
                              </div>
                            `
                            : ""
                        }

                      </div>

                    </div>

                    <div class="actions">

                      <a
                        href="/profile?id=${found.id}"
                      >

                        <button>
                          👤 پروفایل
                        </button>

                      </a>

                      ${
                        Number(found.id) !==
                        Number(user.id)

                          ? `
                            <a
                              href="/messages?user=${found.id}"
                            >

                              <button>
                                💬 پیام
                              </button>

                            </a>
                          `
                          : ""
                      }

                    </div>

                  </div>
                `;
              }

            }

          }

          sendHtml(
            res,
            200,
            "جستجو",
            html,
            user
          );

          return;
        }

        /* =================================================
           MESSAGES
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/messages"
        ) {

          const otherId =
            Number(
              requestUrl.searchParams.get("user")
            );

          if (
            Number.isInteger(otherId) &&
            otherId !== user.id
          ) {

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
                [
                  otherId
                ]
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
                otherId
              )
            ) {

              sendHtml(
                res,
                403,
                "مسدود",
                `
                  <div class="card">

                    <p class="error">
                      امکان ارسال پیام به این کاربر وجود ندارد.
                    </p>

                  </div>
                `,
                user
              );

              return;
            }

            const messages =
              await pool.query(
                `
                  SELECT

                    m.id,
                    m.sender_id,
                    m.receiver_id,
                    m.message,
                    m.created_at,

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

                  LIMIT 300
                `,
                [
                  user.id,
                  otherId
                ]
              );

            let html = `
              <div class="card">

                <div class="profile-head">

                  <div class="avatar">

                    ${
                      other.rows[0].avatar_url
                        ? `
                          <img
                            src="${escapeAttr(
                              other.rows[0].avatar_url
                            )}"
                            alt="پروفایل"
                          >
                        `
                        : escapeHtml(
                            other.rows[0].name.charAt(0)
                          )
                    }

                  </div>

                  <div>

                    <h2 style="margin:0">

                      💬 گفتگو با

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

              </div>
            `;

            if (
              !messages.rows.length
            ) {

              html += `
                <div class="card empty">
                  هنوز پیامی وجود ندارد.
                </div>
              `;

            } else {

              for (
                const message of messages.rows
              ) {

                const mine =
                  Number(message.sender_id) ===
                  Number(user.id);

                html += `
                  <div
                    class="
                      message-card
                      ${
                        mine
                          ? "message-me"
                          : "message-other"
                      }
                    "
                  >

                    <div class="message-author">
                      ${escapeHtml(
                        message.name
                      )}
                    </div>

                    <div class="post-text">
                      ${escapeHtml(
                        message.message
                      )}
                    </div>

                    <div class="small">
                      ${new Date(
                        message.created_at
                      ).toLocaleString("fa-IR")}
                    </div>

                  </div>
                `;
              }

            }

            html += `
              <div class="card">

                <form
                  method="POST"
                  action="/messages"
                >

                  <input
                    type="hidden"
                    name="receiver_id"
                    value="${otherId}"
                  >

                  <textarea
                    name="message"
                    maxlength="3000"
                    placeholder="پیام خود را بنویسید..."
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

          const contacts =
            await pool.query(
              `
                SELECT DISTINCT

                  u.id,
                  u.name,
                  u.email,
                  u.avatar_url

                FROM users u

                WHERE u.id IN(

                  SELECT receiver_id
                  FROM messages
                  WHERE sender_id=$1

                  UNION

                  SELECT sender_id
                  FROM messages
                  WHERE receiver_id=$1

                )

                ORDER BY u.name
              `,
              [
                user.id
              ]
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

          if (
            !contacts.rows.length
          ) {

            html += `
              <div class="card empty">
                هنوز گفتگویی ندارید.
              </div>
            `;

          } else {

            for (
              const contact of contacts.rows
            ) {

              html += `
                <div class="card">

                  <div class="profile-head">

                    <div class="avatar">

                      ${
                        contact.avatar_url
                          ? `
                            <img
                              src="${escapeAttr(
                                contact.avatar_url
                              )}"
                              alt="پروفایل"
                            >
                          `
                          : escapeHtml(
                              contact.name.charAt(0)
                            )
                      }

                    </div>

                    <div>

                      <div class="username">
                        ${escapeHtml(
                          contact.name
                        )}
                      </div>

                      <div class="email">
                        ${escapeHtml(
                          contact.email
                        )}
                      </div>

                    </div>

                  </div>

                  <div class="actions">

                    <a
                      href="/messages?user=${contact.id}"
                    >

                      <button>
                        💬 باز کردن گفتگو
                      </button>

                    </a>

                  </div>

                </div>
              `;
            }

          }

          sendHtml(
            res,
            200,
            "پیام‌ها",
            html,
            user
          );

          return;
        }

        /* =================================================
           SEND MESSAGE
        ================================================= */

        if (
          req.method === "POST" &&
          path === "/messages"
        ) {

          const data =
            await readBody(req);

          const receiverId =
            Number(
              data.get("receiver_id")
            );

          const message =
            String(
              data.get("message") || ""
            ).trim();

          if (
            !Number.isInteger(receiverId) ||
            receiverId === user.id ||
            !message
          ) {

            redirect(
              res,
              "/messages"
            );

            return;
          }

          const receiver =
            await pool.query(
              `
                SELECT id
                FROM users
                WHERE id=$1
              `,
              [
                receiverId
              ]
            );

          if (!receiver.rows.length) {

            redirect(
              res,
              "/messages"
            );

            return;
          }

          if (
            await areBlocked(
              user.id,
              receiverId
            )
          ) {

            sendHtml(
              res,
              403,
              "مسدود",
              `
                <div class="card">

                  <p class="error">
                    امکان ارسال پیام به این کاربر وجود ندارد.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

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
              receiverId,
              message
            ]
          );

          await notify(
            receiverId,
            user.id,
            "message",
            null,
            `${user.name} برای شما پیام فرستاد.`
          );

          redirect(
            res,
            `/messages?user=${receiverId}`
          );

          return;
        }

        /* =================================================
           NOTIFICATIONS
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/notifications"
        ) {

          const notifications =
            await pool.query(
              `
                SELECT

                  n.id,
                  n.type,
                  n.message,
                  n.is_read,
                  n.created_at,

                  u.name AS actor_name,
                  u.avatar_url AS actor_avatar

                FROM notifications n

                LEFT JOIN users u
                  ON u.id=n.actor_id

                WHERE n.user_id=$1

                ORDER BY n.created_at DESC

                LIMIT 100
              `,
              [
                user.id
              ]
            );

          await pool.query(
            `
              UPDATE notifications

              SET is_read=TRUE

              WHERE user_id=$1
            `,
            [
              user.id
            ]
          );

          let html = `
            <div class="card">

              <h2>
                🔔 اعلان‌ها
              </h2>

            </div>
          `;

          if (
            !notifications.rows.length
          ) {

            html += `
              <div class="card empty">
                اعلان جدیدی ندارید.
              </div>
            `;

          } else {

            for (
              const notification
              of notifications.rows
            ) {

              html += `
                <div class="card">

                  <div class="profile-head">

                    <div class="avatar">

                      ${
                        notification.actor_avatar
                          ? `
                            <img
                              src="${escapeAttr(
                                notification.actor_avatar
                              )}"
                              alt="پروفایل"
                            >
                          `
                          : "🔔"
                      }

                    </div>

                    <div>

                      <div class="username">

                        ${escapeHtml(
                          notification.actor_name ||
                          "سیستم"
                        )}

                      </div>

                      <div class="small">

                        ${new Date(
                          notification.created_at
                        ).toLocaleString("fa-IR")}

                      </div>

                    </div>

                  </div>

                  <div class="post-text">

                    ${escapeHtml(
                      notification.message
                    )}

                  </div>

                </div>
              `;
            }

          }

          sendHtml(
            res,
            200,
            "اعلان‌ها",
            html,
            user
          );

          return;
        }

        /* =================================================
           SAVED
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/saved"
        ) {

          const saved =
            await pool.query(
              `
                SELECT

                  p.id,
                  p.content,
                  p.image_url,
                  p.created_at,

                  u.id AS user_id,
                  u.name,
                  u.email,
                  u.avatar_url

                FROM bookmarks b

                JOIN posts p
                  ON p.id=b.post_id

                JOIN users u
                  ON u.id=p.user_id

                WHERE b.user_id=$1

                ORDER BY b.created_at DESC

                LIMIT 100
              `,
              [
                user.id
              ]
            );

          let html = `
            <div class="card">

              <h2>
                🔖 پست‌های ذخیره‌شده
              </h2>

            </div>
          `;

          if (
            !saved.rows.length
          ) {

            html += `
              <div class="card empty">

                هنوز پستی ذخیره نکرده‌اید.

              </div>
            `;

          } else {

            for (
              const post of saved.rows
            ) {

              html += `
                <article class="card">

                  <div class="profile-head">

                    <div class="avatar">

                      ${
                        post.avatar_url
                          ? `
                            <img
                              src="${escapeAttr(
                                post.avatar_url
                              )}"
                              alt="پروفایل"
                            >
                          `
                          : escapeHtml(
                              post.name.charAt(0)
                            )
                      }

                    </div>

                    <div>

                      <div class="username">
                        ${escapeHtml(post.name)}
                      </div>

                      <div class="email">
                        ${escapeHtml(post.email)}
                      </div>

                      <div class="small">
                        ${new Date(
                          post.created_at
                        ).toLocaleString("fa-IR")}
                      </div>

                    </div>

                  </div>

                  <div class="post-text">
                    ${escapeHtml(post.content)}
                  </div>

                  ${
                    post.image_url
                      ? `
                        <img
                          class="post-image"
                          src="${escapeAttr(
                            post.image_url
                          )}"
                          alt="تصویر"
                        >
                      `
                      : ""
                  }

                  <div class="actions">

                    <a
                      href="/post?id=${post.id}"
                    >

                      <button>
                        مشاهده پست
                      </button>

                    </a>

                    <a
                      href="/bookmark?post=${post.id}&from=saved"
                    >

                      <button class="danger">
                        ❌ حذف از ذخیره‌ها
                      </button>

                    </a>

                  </div>

                </article>
              `;
            }

          }

          sendHtml(
            res,
            200,
            "ذخیره‌ها",
            html,
            user
          );

          return;
        }

        /* =================================================
           REPORT GET
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/report"
        ) {

          const postId =
            Number(
              requestUrl.searchParams.get("post")
            );

          const reportedUserId =
            Number(
              requestUrl.searchParams.get("user")
            );

          if (
            !Number.isInteger(postId) &&
            !Number.isInteger(reportedUserId)
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
                  🚩 گزارش محتوا
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
                      Number.isInteger(
                        reportedUserId
                      )
                        ? reportedUserId
                        : ""
                    }"
                  >

                  <textarea
                    name="reason"
                    maxlength="1000"
                    placeholder="دلیل گزارش..."
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

        /* =================================================
           REPORT POST
        ================================================= */

        if (
          req.method === "POST" &&
          path === "/report"
        ) {

          const data =
            await readBody(req);

          const postId =
            Number(
              data.get("post_id")
            );

          const reportedUserId =
            Number(
              data.get("reported_user_id")
            );

          const reason =
            String(
              data.get("reason") || ""
            ).trim();

          if (
            !reason ||
            (
              !Number.isInteger(postId) &&
              !Number.isInteger(
                reportedUserId
              )
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
              Number.isInteger(
                reportedUserId
              )
                ? reportedUserId
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
                  گزارش شما ثبت شد ✅
                </h2>

                <a href="/">
                  بازگشت به خانه
                </a>

              </div>
            `,
            user
          );

          return;
        }

        /* =================================================
           BLOCK
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/block"
        ) {

          const targetId =
            Number(
              requestUrl.searchParams.get("user")
            );

          if (
            !Number.isInteger(targetId) ||
            targetId === user.id
          ) {

            redirect(
              res,
              "/"
            );

            return;
          }

          const target =
            await pool.query(
              `
                SELECT id
                FROM users
                WHERE id=$1
              `,
              [
                targetId
              ]
            );

          if (!target.rows.length) {

            redirect(
              res,
              "/"
            );

            return;
          }

          const existing =
            await pool.query(
              `
                SELECT id
                FROM blocked_users

                WHERE
                  blocker_id=$1
                  AND blocked_id=$2
              `,
              [
                user.id,
                targetId
              ]
            );

          if (
            existing.rows.length
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
                targetId
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
                targetId
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
                targetId
              ]
            );

          }

          redirect(
            res,
            `/profile?id=${targetId}`
          );

          return;
        }

        /* =================================================
           JOBS
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/jobs"
        ) {

          const jobs =
            await pool.query(
              `
                SELECT

                  j.id,
                  j.user_id,
                  j.title,
                  j.city,
                  j.salary,
                  j.description,
                  j.created_at,

                  u.name,
                  u.email

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

                ORDER BY j.created_at DESC

                LIMIT 100
              `,
              [
                user.id
              ]
            );

          let html = `
            <div class="card">

              <h2>
                💼 کاریابی
              </h2>

              <a href="/new-job">

                <button>
                  ➕ ثبت آگهی کار
                </button>

              </a>

            </div>
          `;

          if (
            !jobs.rows.length
          ) {

            html += `
              <div class="card empty">
                هنوز آگهی کاری ثبت نشده است.
              </div>
            `;

          } else {

            for (
              const job of jobs.rows
            ) {

              html += `
                <div class="card">

                  <div class="job-title">
                    ${escapeHtml(job.title)}
                  </div>

                  <div class="job-city">
                    📍 شهر:
                    ${escapeHtml(job.city)}
                  </div>

                  <div class="job-salary">
                    💰 حقوق:
                    ${escapeHtml(job.salary)}
                  </div>

                  <div class="job-description">
                    ${escapeHtml(
                      job.description
                    )}
                  </div>

                  <div class="small">
                    منتشرکننده:
                    ${escapeHtml(job.name)}
                  </div>

                  <div class="small">
                    ${new Date(
                      job.created_at
                    ).toLocaleString("fa-IR")}
                  </div>

                  ${
                    Number(job.user_id) ===
                    Number(user.id)

                      ? `
                        <div class="actions">

                          <a
                            href="/delete-job?id=${job.id}"
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
              `;
            }

          }

          sendHtml(
            res,
            200,
            "کاریابی",
            html,
            user
          );

          return;
        }

        /* =================================================
           NEW JOB GET
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/new-job"
        ) {

          sendHtml(
            res,
            200,
            "ثبت آگهی کار",
            `
              <div class="card">

                <h2>
                  ➕ ثبت آگهی کار
                </h2>

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
                    maxlength="100"
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

        /* =================================================
           NEW JOB POST
        ================================================= */

        if (
          req.method === "POST" &&
          path === "/new-job"
        ) {

          const data =
            await readBody(req);

          const title =
            String(
              data.get("title") || ""
            ).trim();

          const city =
            String(
              data.get("city") || ""
            ).trim();

          const salary =
            String(
              data.get("salary") || ""
            ).trim();

          const description =
            String(
              data.get("description") || ""
            ).trim();

          if (
            !title ||
            !city ||
            !salary ||
            !description
          ) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    همه فیلدها را کامل کنید.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

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

          redirect(
            res,
            "/jobs"
          );

          return;
        }

        /* =================================================
           SETTINGS
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/settings"
        ) {

          const result =
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
              [
                user.id
              ]
            );

          const profile =
            result.rows[0] || user;

          sendHtml(
            res,
            200,
            "تنظیمات",
            `
              <div class="card">

                <h2>
                  ⚙️ تنظیمات پروفایل
                </h2>

                <div
                  style="
                    display:flex;
                    justify-content:center;
                    margin-bottom:15px;
                  "
                >

                  <div class="avatar large">

                    ${
                      profile.avatar_url
                        ? `
                          <img
                            src="${escapeAttr(
                              profile.avatar_url
                            )}"
                            alt="پروفایل"
                          >
                        `
                        : escapeHtml(
                            profile.name.charAt(0)
                          )
                    }

                  </div>

                </div>

                <form
                  method="POST"
                  action="/settings"
                >

                  <input
                    name="name"
                    maxlength="100"
                    value="${escapeAttr(
                      profile.name
                    )}"
                    placeholder="نام"
                    required
                  >

                  <textarea
                    name="bio"
                    maxlength="1000"
                    placeholder="درباره من"
                  >${escapeHtml(
                    profile.bio || ""
                  )}</textarea>

                  <input
                    name="avatar_url"
                    type="url"
                    maxlength="2000"
                    value="${escapeAttr(
                      profile.avatar_url || ""
                    )}"
                    placeholder="لینک عکس پروفایل"
                  >

                  <button class="full">
                    💾 ذخیره تغییرات
                  </button>

                </form>

              </div>

              <div class="card">

                <h3>
                  🔐 امنیت
                </h3>

                <a href="/password">

                  <button>
                    تغییر رمز عبور
                  </button>

                </a>

              </div>

              <div class="card">

                <button
                  class="theme-btn full"
                  onclick="toggleTheme()"
                >
                  🌙 تغییر حالت نمایش
                </button>

              </div>
            `,
            user
          );

          return;
        }

        /* =================================================
           SETTINGS POST
        ================================================= */

        if (
          req.method === "POST" &&
          path === "/settings"
        ) {

          const data =
            await readBody(req);

          const name =
            String(
              data.get("name") || ""
            ).trim();

          const bio =
            String(
              data.get("bio") || ""
            ).trim();

          const avatarUrl =
            String(
              data.get("avatar_url") || ""
            ).trim();

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
              avatarUrl,
              user.id
            ]
          );

          redirect(
            res,
            "/profile"
          );

          return;
        }

        /* =================================================
           PASSWORD GET
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/password"
        ) {

          sendHtml(
            res,
            200,
            "تغییر رمز عبور",
            `
              <div class="card">

                <h2>
                  🔐 تغییر رمز عبور
                </h2>

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
                    placeholder="رمز جدید، حداقل ۶ کاراکتر"
                    required
                  >

                  <button class="full">
                    تغییر رمز
                  </button>

                </form>

              </div>
            `,
            user
          );

          return;
        }

        /* =================================================
           PASSWORD POST
        ================================================= */

        if (
          req.method === "POST" &&
          path === "/password"
        ) {

          const data =
            await readBody(req);

          const oldPassword =
            String(
              data.get("old_password") || ""
            );

          const newPassword =
            String(
              data.get("new_password") || ""
            );

          if (
            newPassword.length < 6
          ) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    رمز جدید باید حداقل ۶ کاراکتر باشد.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          const result =
            await pool.query(
              `
                SELECT password
                FROM users
                WHERE id=$1
              `,
              [
                user.id
              ]
            );

          if (
            !result.rows.length ||
            hashPassword(oldPassword) !==
            result.rows[0].password
          ) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    رمز فعلی اشتباه است.
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
              hashPassword(newPassword),
              user.id
            ]
          );

          sendHtml(
            res,
            200,
            "موفق",
            `
              <div class="card">

                <h2 class="success">
                  رمز عبور تغییر کرد ✅
                </h2>

                <a href="/settings">

                  <button class="full">
                    بازگشت
                  </button>

                </a>

              </div>
            `,
            user
          );

          return;
        }

        /* =================================================
           DELETE POST
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/delete-post"
        ) {

          const postId =
            Number(
              requestUrl.searchParams.get("id")
            );

          if (
            Number.isInteger(postId)
          ) {

            await pool.query(
              `
                DELETE FROM posts

                WHERE
                  id=$1
                  AND user_id=$2
              `,
              [
                postId,
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

        /* =================================================
           DELETE JOB
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/delete-job"
        ) {

          const jobId =
            Number(
              requestUrl.searchParams.get("id")
            );

          if (
            Number.isInteger(jobId)
          ) {

            await pool.query(
              `
                DELETE FROM jobs

                WHERE
                  id=$1
                  AND user_id=$2
              `,
              [
                jobId,
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

        /* =================================================
           LOGOUT
        ================================================= */

        if (
          req.method === "GET" &&
          path === "/logout"
        ) {

          const sessionId =
            parseCookies(req).sessionId;

          if (sessionId) {

            await pool.query(
              `
                DELETE FROM sessions

                WHERE session_id=$1
              `,
              [
                sessionId
              ]
            );

          }

          redirect(
            res,
            "/",
            "sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
          );

          return;
        }

        /* =================================================
           404
        ================================================= */

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
                  🏠 بازگشت به خانه
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
                  بازگشت
                </a>

              </div>
            `,
            user
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

startServer();
