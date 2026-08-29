const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 10000;

if (!process.env.DATABASE_URL) {
  console.error("STARTUP ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
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
    const i = part.indexOf("=");

    if (i < 0) return;

    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();

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

<html lang="fa" dir="rtl">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

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
  font-size: 19px;
}

.title {
  font-size: 17px;
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
  font-size: 22px;
  font-weight: bold;
  flex: none;
  overflow: hidden;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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
}

.post-text {
  margin: 17px 0;
  line-height: 1.9;
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

.comment-text {
  margin-top: 5px;
  white-space: pre-wrap;
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
  max-height: 420px;
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

.profile-cover {
  height: 105px;
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    #6c5ce7,
    #00b894,
    #0984e3
  );
  margin: -2px -2px 0;
}

.profile-avatar-wrap {
  display: flex;
  justify-content: center;
  margin-top: -36px;
}

.avatar.large {
  width: 92px;
  height: 92px;
  border: 4px solid #fff;
  font-size: 34px;
  overflow: hidden;
}

.message-card {
  padding: 11px 13px;
  border-radius: 15px;
  margin: 8px 0;
  max-width: 88%;
  line-height: 1.8;
  word-break: break-word;
}

.message-me {
  margin-right: auto;
  background: #e9e4ff;
  border: 1px solid #d7cffc;
}

.message-other {
  margin-left: auto;
  background: #eef7ff;
  border: 1px solid #d4e8ff;
}

.message-author {
  font-weight: 800;
  font-size: 12px;
  margin-bottom: 4px;
}

.chat-box {
  max-height: 55vh;
  overflow: auto;
  padding: 4px;
}

.danger-outline {
  background: #fff;
  color: #b00020;
  border: 1px solid #b00020;
}

@media(max-width:480px) {

  .header {
    padding: 11px;
  }

  .logo {
    font-size: 16px;
  }

  .title {
    font-size: 14px;
  }

  .top-actions {
    padding-left: 10px;
    padding-right: 10px;
  }

  .message-card {
    max-width: 94%;
  }

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
body.dark .job {
  background: #242424;
  border-color: #3a3a3a;
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
    📱 برنامه اجتماعی
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

async function ensureColumn(
  table,
  column,
  definition
) {
  await pool.query(
    `ALTER TABLE ${table}
     ADD COLUMN IF NOT EXISTS ${column} ${definition}`
  );
}

async function createTables() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
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
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      content TEXT,
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

  try {

    await pool.query(`
      DO $$
      BEGIN

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name='posts'
          AND column_name='text'
        ) THEN

          UPDATE posts
          SET content = text
          WHERE content IS NULL
          OR content = '';

        END IF;

      END $$;
    `);

  } catch (e) {

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
    ALTER COLUMN content SET NOT NULL
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
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn(
    "comments",
    "comment",
    "TEXT"
  );

  try {

    await pool.query(`
      DO $$
      BEGIN

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name='comments'
          AND column_name='text'
        ) THEN

          UPDATE comments
          SET comment = text
          WHERE comment IS NULL
          OR comment = '';

        END IF;

      END $$;
    `);

  } catch (e) {

    console.log(
      "Old comments.text migration skipped."
    );

  }

  await pool.query(`
    UPDATE comments
    SET comment=''
    WHERE comment IS NULL
  `);

  await pool.query(`
    ALTER TABLE comments
    ALTER COLUMN comment SET NOT NULL
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
    CREATE TABLE IF NOT EXISTS jobs (
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
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn(
    "messages",
    "message",
    "TEXT"
  );

  try {

    await pool.query(`
      DO $$
      BEGIN

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name='messages'
          AND column_name='text'
        ) THEN

          UPDATE messages
          SET message = text
          WHERE message IS NULL
          OR message = '';

        END IF;

      END $$;
    `);

  } catch (e) {

    console.log(
      "Old messages.text migration skipped."
    );

  }

  await pool.query(`
    UPDATE messages
    SET message=''
    WHERE message IS NULL
  `);

  await pool.query(`
    ALTER TABLE messages
    ALTER COLUMN message SET NOT NULL
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
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,
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
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
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

  try {

    await pool.query(`
      DO $$
      BEGIN

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name='notifications'
          AND column_name='read'
        ) THEN

          UPDATE notifications
          SET is_read = read
          WHERE is_read IS NULL;

        END IF;

      END $$;
    `);

  } catch (e) {

    console.log(
      "Old notifications migration skipped."
    );

  }

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
    ALTER COLUMN message SET NOT NULL
  `);

  try {

    await pool.query(`
      DO $$
      BEGIN

        IF EXISTS (
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

        IF EXISTS (
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

      END $$;
    `);

  } catch (e) {

    console.log(
      "Legacy bookmark/block migration skipped."
    );

  }

  console.log(
    "Database tables checked and repaired successfully."
  );
}

async function createSession(userId) {

  const id =
    crypto.randomBytes(32).toString("hex");

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

  if (!sid) {
    return null;
  }

  const r =
    await pool.query(
      `
        SELECT
          users.id,
          users.name,
          users.email,
          users.bio,
          users.avatar_url

        FROM sessions

        JOIN users
          ON users.id=sessions.user_id

        WHERE sessions.session_id=$1
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

async function areBlocked(a, b) {

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

const server =
  http.createServer(
    async (req, res) => {

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
                    یک جای مرتب برای ارتباط 👋
                  </h1>

                  <p>
                    پست منتشر کن،
                    کاربران را پیدا کن،
                    پیام بده و آگهی کاری ببین.
                  </p>

                </div>

                <div class="card menu">

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

          const posts =
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
                  FROM blocked_users bu

                  WHERE
                    (
                      bu.blocker_id=$1
                      AND bu.blocked_id=u.id
                    )

                    OR

                    (
                      bu.blocker_id=u.id
                      AND bu.blocked_id=$1
                    )
                )

                ORDER BY p.created_at DESC

                LIMIT 50
              `,
              [user.id]
            );

          let html = `
            <div class="card">

              <div class="profile-head">

                <div class="avatar">

                  ${
                    user.avatar_url
                      ? `
                        <img
                          src="${escapeHtml(user.avatar_url)}"
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

            for (const p of posts.rows) {

              html += `
                <article class="card">

                  <div class="profile-head">

                    <div class="avatar">

                      ${
                        p.avatar_url
                          ? `
                            <img
                              src="${escapeHtml(
                                p.avatar_url
                              )}"
                              alt="پروفایل"
                            >
                          `
                          : escapeHtml(
                              p.name.charAt(0)
                            )
                      }

                    </div>

                    <div>

                      <div class="username">
                        ${escapeHtml(p.name)}
                      </div>

                      <div class="email">
                        ${escapeHtml(p.email)}
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
                          src="${escapeHtml(
                            p.image_url
                          )}"
                          alt="تصویر پست"
                        >
                      `
                      : ""
                  }

                  <div class="stats">

                    <span>
                      ❤️ ${p.like_count}
                    </span>

                    <span>
                      💬 ${p.comment_count}
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

                    <a href="/post?id=${p.id}">
                      <button>
                        💬 نظرها
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
                    placeholder="نام"
                    maxlength="100"
                    required
                  >

                  <input
                    name="email"
                    type="email"
                    placeholder="ایمیل"
                    maxlength="200"
                    required
                  >

                  <input
                    name="password"
                    type="password"
                    placeholder="رمز عبور، حداقل ۶ کاراکتر"
                    minlength="6"
                    required
                  >

                  <button class="full">
                    ثبت‌نام
                  </button>

                </form>

              </div>

              <a href="/">
                بازگشت
              </a>
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
            ).trim().toLowerCase();

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
                    نام، ایمیل و رمز حداقل
                    ۶ کاراکتری لازم است.
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
                    ثبت‌نام موفق شد ✅
                  </h2>

                  <a href="/login">

                    <button class="full">
                      ورود
                    </button>

                  </a>

                </div>
              `
            );

          } catch (e) {

            console.error(
              "SIGNUP ERROR:",
              e
            );

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
            String(
              d.get("email") || ""
            ).trim().toLowerCase();

          const password =
            String(
              d.get("password") || ""
            );

          const r =
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
            )}; HttpOnly; Path=/; SameSite=Lax`
          );

          return;
        }

        if (!user) {

          if (
            path === "/logout"
          ) {

            redirect(
              res,
              "/"
            );

          } else {

            redirect(
              res,
              "/login"
            );

          }

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

          const d =
            await readBody(req);

          const content =
            String(
              d.get("content") || ""
            ).trim();

          const imageUrl =
            String(
              d.get("image_url") || ""
            ).trim();

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

        if (
          req.method === "GET" &&
          path === "/like"
        ) {

          const postId =
            Number(
              url.searchParams.get("post")
            );

          if (
            Number.isInteger(postId)
          ) {

            const x =
              await pool.query(
                `
                  SELECT
                    p.user_id,

                    EXISTS(
                      SELECT 1
                      FROM likes
                      WHERE
                        post_id=$1
                        AND user_id=$2
                    ) AS liked

                  FROM posts p

                  WHERE p.id=$1
                `,
                [
                  postId,
                  user.id
                ]
              );

            if (x.rows.length) {

              if (
                x.rows[0].liked
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
                  x.rows[0].user_id,
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

        if (
          req.method === "GET" &&
          path === "/bookmark"
        ) {

          const postId =
            Number(
              url.searchParams.get("post")
            );

          if (
            Number.isInteger(postId)
          ) {

            const x =
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

            if (x.rows.length) {

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
            url.searchParams.get("from") === "saved"
              ? "/bookmarks"
              : "/"
          );

          return;
        }

        if (
          req.method === "GET" &&
          path === "/post"
        ) {

          const postId =
            Number(
              url.searchParams.get("id")
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

          const pr =
            await pool.query(
              `
                SELECT
                  p.id,
                  p.content,
                  p.image_url,
                  p.user_id,
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

          if (
            !pr.rows.length
          ) {

            sendHtml(
              res,
              404,
              "پست پیدا نشد",
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
              [postId]
            );

          let html = `
            <article class="card">

              <div class="profile-head">

                <a href="/user?id=${p.user_id}">

                  <div class="avatar">

                    ${
                      p.avatar_url
                        ? `
                          <img
                            src="${escapeHtml(
                              p.avatar_url
                            )}"
                            alt="پروفایل"
                          >
                        `
                        : escapeHtml(
                            p.name.charAt(0)
                          )
                    }

                  </div>

                </a>

                <div>

                  <a href="/user?id=${p.user_id}">

                    <div class="username">
                      ${escapeHtml(p.name)}
                    </div>

                  </a>

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
                      src="${escapeHtml(
                        p.image_url
                      )}"
                      alt="تصویر پست"
                    >
                  `
                  : ""
              }

              <div class="stats">

                <span>
                  ❤️ ${p.like_count}
                </span>

                <span>
                  💬 ${p.comment_count}
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

                <a
                  href="/bookmark?post=${p.id}"
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
                  Number(p.user_id) !== Number(user.id)
                    ? `
                      <a
                        href="/report?post=${p.id}"
                      >
                        <button class="danger">
                          🚩 گزارش
                        </button>
                      </a>
                    `
                    : `
                      <a
                        href="/edit-post?id=${p.id}"
                      >
                        <button>
                          ✏️ ویرایش
                        </button>
                      </a>

                      <a
                        href="/delete-post?id=${p.id}"
                      >
                        <button class="danger">
                          🗑️ حذف پست
                        </button>
                      </a>
                    `
                }

                <a href="/">
                  <button>
                    🏠 خانه
                  </button>
                </a>

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
                  value="${p.id}"
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
            !cr.rows.length
          ) {

            html += `
              <div class="card empty">
                هنوز نظری ثبت نشده است.
              </div>
            `;

          } else {

            for (
              const c of cr.rows
            ) {

              html += `
                <div class="card">

                  <div class="profile-head">

                    <a
                      href="/user?id=${c.user_id}"
                    >

                      <div class="avatar">

                        ${
                          c.avatar_url
                            ? `
                              <img
                                src="${escapeHtml(
                                  c.avatar_url
                                )}"
                                alt="پروفایل"
                              >
                            `
                            : escapeHtml(
                                c.name.charAt(0)
                              )
                        }

                      </div>

                    </a>

                    <div>

                      <a
                        href="/user?id=${c.user_id}"
                      >

                        <div class="username">
                          ${escapeHtml(c.name)}
                        </div>

                      </a>

                      <div class="small">
                        ${new Date(
                          c.created_at
                        ).toLocaleString("fa-IR")}
                      </div>

                    </div>

                  </div>

                  <div class="comment-text post-text">
                    ${escapeHtml(c.comment)}
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
              [postId]
            );

          if (
            !post.rows.length
          ) {

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

        if (
          req.method === "GET" &&
          path === "/edit-post"
        ) {

          const id =
            Number(
              url.searchParams.get("id")
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

          if (
            !r.rows.length
          ) {

            sendHtml(
              res,
              404,
              "پست پیدا نشد",
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
                  >${escapeHtml(
                    p.content
                  )}</textarea>

                  <input
                    name="image_url"
                    type="url"
                    maxlength="2000"
                    value="${escapeHtml(
                      p.image_url || ""
                    )}"
                    placeholder="لینک عکس (اختیاری)"
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

        if (
          req.method === "GET" &&
          path === "/delete-post"
        ) {

          const id =
            Number(
              url.searchParams.get("id")
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

        if (
          req.method === "GET" &&
          path === "/search"
        ) {

          const q =
            String(
              url.searchParams.get("q") || ""
            ).trim();

          let usersHtml = "";
          let jobsHtml = "";

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
                    name ILIKE $1
                    OR email ILIKE $1

                  ORDER BY name

                  LIMIT 30
                `,
                [`%${q}%`]
              );

            usersHtml =
              ur.rows
                .map(
                  p => `
                    <div class="card">

                      <div class="profile-head">

                        <div class="avatar">

                          ${
                            p.avatar_url
                              ? `
                                <img
                                  src="${escapeHtml(
                                    p.avatar_url
                                  )}"
                                  alt="پروفایل"
                                >
                              `
                              : escapeHtml(
                                  p.name.charAt(0)
                                )
                          }

                        </div>

                        <div>

                          <div class="username">
                            ${escapeHtml(p.name)}
                          </div>

                          <div class="email">
                            ${escapeHtml(p.email)}
                          </div>

                          ${
                            p.bio
                              ? `
                                <div class="small">
                                  ${escapeHtml(p.bio)}
                                </div>
                              `
                              : ""
                          }

                        </div>

                      </div>

                      <div class="actions">

                        <a
                          href="/user?id=${p.id}"
                        >
                          <button>
                            👤 پروفایل
                          </button>
                        </a>

                        ${
                          Number(p.id) !== Number(user.id)
                            ? `
                              <a
                                href="/chat?id=${p.id}"
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
                [`%${q}%`]
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
                    value="${escapeHtml(q)}"
                    placeholder="نام کاربر، شغل یا موضوع..."
                  >

                  <button class="full">
                    🔎 جستجو
                  </button>

                </form>

              </div>

              <h3>
                کاربران 👥
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
                آگهی‌های کاری 💼
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

        if (
          req.method === "GET" &&
          path === "/user"
        ) {

          const id =
            Number(
              url.searchParams.get("id")
            );

          const r =
            await pool.query(
              `
                SELECT
                  id,
                  name,
                  email,
                  bio,
                  avatar_url

                FROM users

                WHERE id=$1
              `,
              [id]
            );

          if (
            !r.rows.length
          ) {

            sendHtml(
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

            return;
          }

          const p =
            r.rows[0];

          if (
            Number(p.id) !== Number(user.id) &&
            await areBlocked(
              user.id,
              p.id
            )
          ) {

            sendHtml(
              res,
              403,
              "مسدود",
              `
                <div class="card">

                  <p class="error">
                    دسترسی به این کاربر ممکن نیست.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          const f =
            await pool.query(
              `
                SELECT COUNT(*)
                FROM follows
                WHERE following_id=$1
              `,
              [id]
            );

          const g =
            await pool.query(
              `
                SELECT COUNT(*)
                FROM follows
                WHERE follower_id=$1
              `,
              [id]
            );

          let follow = "";

          if (
            Number(id) !== Number(user.id)
          ) {

            const c =
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
                  id
                ]
              );

            follow = `
              <a href="/follow?id=${id}">
                <button class="follow">
                  ${
                    c.rows.length
                      ? "❌ لغو دنبال کردن"
                      : "➕ دنبال کردن"
                  }
                </button>
              </a>

              <a href="/chat?id=${id}">
                <button>
                  💬 پیام
                </button>
              </a>

              <a href="/block?id=${id}">
                <button class="danger">
                  🚫 مسدود کردن
                </button>
              </a>

              <a href="/report?user=${id}">
                <button>
                  🚩 گزارش
                </button>
              </a>
            `;
          }

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
              [id]
            );

          let postsHtml = "";

          if (!posts.rows.length) {

            postsHtml = `
              <div class="card empty">
                هنوز پستی منتشر نشده است.
              </div>
            `;

          } else {

            for (
              const post of posts.rows
            ) {

              postsHtml += `
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
                          src="${escapeHtml(
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
                        💬 مشاهده
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
            "پروفایل کاربر",
            `
              <div class="card">

                <div class="profile-cover"></div>

                <div class="profile-avatar-wrap">

                  <div class="avatar large">

                    ${
                      p.avatar_url
                        ? `
                          <img
                            src="${escapeHtml(
                              p.avatar_url
                            )}"
                            alt="پروفایل"
                          >
                        `
                        : escapeHtml(
                            p.name.charAt(0)
                          )
                    }

                  </div>

                </div>

                <div
                  style="
                    text-align:center;
                    margin-top:10px
                  "
                >

                  <div class="username">
                    ${escapeHtml(p.name)}
                  </div>

                  <div class="email">
                    ${escapeHtml(p.email)}
                  </div>

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

                <div class="stats">

                  <span>
                    👥 دنبال‌کننده:
                    ${f.rows[0].count}
                  </span>

                  <span>
                    ➡️ دنبال‌شونده:
                    ${g.rows[0].count}
                  </span>

                </div>

                <div class="actions">
                  ${follow}
                </div>

              </div>

              ${postsHtml}
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
              url.searchParams.get("id")
            );

          if (
            Number.isInteger(id) &&
            id !== user.id
          ) {

            if (
              await areBlocked(
                user.id,
                id
              )
            ) {

              redirect(
                res,
                `/user?id=${id}`
              );

              return;
            }

            const c =
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
                  id
                ]
              );

            if (
              c.rows.length
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
                  id
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
                  id
                ]
              );

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
            `/user?id=${id}`
          );

          return;
        }

        if (
          req.method === "GET" &&
          path === "/jobs"
        ) {

          const q =
            String(
              url.searchParams.get("q") || ""
            ).trim();

          let r;

          if (q) {

            r =
              await pool.query(
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

                  ORDER BY j.created_at DESC

                  LIMIT 100
                `,
                [
                  `%${q}%`,
                  user.id
                ]
              );

          } else {

            r =
              await pool.query(
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

                  ORDER BY j.created_at DESC

                  LIMIT 100
                `,
                [user.id]
              );
          }

          let jobs = "";

          for (
            const j of r.rows
          ) {

            jobs += `
              <div class="job">

                <div class="job-title">
                  ${escapeHtml(j.title)}
                </div>

                <div class="job-city">
                  📍 شهر:
                  ${escapeHtml(j.city)}
                </div>

                <div class="job-salary">
                  💰 حقوق:
                  ${escapeHtml(j.salary)}
                </div>

                <div class="job-description">
                  ${escapeHtml(j.description)}
                </div>

                <div class="small">
                  منتشرکننده:
                  ${escapeHtml(j.name)}
                </div>

                <div class="small">
                  ${new Date(
                    j.created_at
                  ).toLocaleString("fa-IR")}
                </div>

                ${
                  Number(j.user_id) === Number(user.id)
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
            `;
          }

          if (!jobs) {

            jobs = `
              <div class="card empty">
                هنوز آگهی کاری ثبت نشده است.
              </div>
            `;
          }

          sendHtml(
            res,
            200,
            "کاریابی",
            `
              <div class="card">

                <form
                  method="GET"
                  action="/jobs"
                >

                  <input
                    name="q"
                    value="${escapeHtml(q)}"
                    placeholder="نام شغل یا شهر..."
                  >

                  <button class="full">
                    🔎 جستجو
                  </button>

                </form>

              </div>

              <a href="/new-job">

                <button class="full green">
                  ➕ ثبت آگهی کار
                </button>

              </a>

              <div class="divider"></div>

              ${jobs}
            `,
            user
          );

          return;
        }

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

                <form
                  method="POST"
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
                    maxlength="100"
                    required
                  >

                  <input
                    name="salary"
                    placeholder="حقوق یا دستمزد"
                    maxlength="200"
                    required
                  >

                  <textarea
                    name="description"
                    placeholder="توضیحات کامل..."
                    maxlength="5000"
                    required
                  ></textarea>

                  <button class="full green">
                    📢 ثبت آگهی
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

        if (
          req.method === "GET" &&
          path === "/messages"
        ) {

          const contacts =
            await pool.query(
              `
                SELECT DISTINCT
                  u.id,
                  u.name,
                  u.email,
                  u.avatar_url

                FROM users u

                WHERE
                  u.id IN(

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
              const c of contacts.rows
            ) {

              html += `
                <div class="card">

                  <div class="profile-head">

                    <div class="avatar">

                      ${
                        c.avatar_url
                          ? `
                            <img
                              src="${escapeHtml(
                                c.avatar_url
                              )}"
                              alt="پروفایل"
                            >
                          `
                          : escapeHtml(
                              c.name.charAt(0)
                            )
                      }

                    </div>

                    <div>

                      <div class="username">
                        ${escapeHtml(c.name)}
                      </div>

                      <div class="email">
                        ${escapeHtml(c.email)}
                      </div>

                    </div>

                  </div>

                  <div class="actions">

                    <a
                      href="/chat?id=${c.id}"
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

        if (
          req.method === "GET" &&
          path === "/chat"
        ) {

          const id =
            Number(
              url.searchParams.get("id")
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
                    امکان مشاهده این گفتگو وجود ندارد.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          const rr =
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

          if (
            !rr.rows.length
          ) {

            sendHtml(
              res,
              404,
              "خطا",
              `
                <div class="card empty">
                  کاربر پیدا نشد.
                </div>
              `,
              user
            );

            return;
          }

          const m =
            await pool.query(
              `
                SELECT
                  m.id,
                  m.message,
                  m.created_at,
                  m.sender_id,
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

                LIMIT 500
              `,
              [
                user.id,
                id
              ]
            );

          let messages = "";

          if (
            !m.rows.length
          ) {

            messages = `
              <div class="card empty">
                هنوز پیامی وجود ندارد.
              </div>
            `;

          } else {

            for (
              const x of m.rows
            ) {

              const mine =
                Number(x.sender_id) ===
                Number(user.id);

              messages += `
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
              `;
            }
          }

          sendHtml(
            res,
            200,
            `گفتگو با ${rr.rows[0].name}`,
            `
              <div class="card">

                <div class="profile-head">

                  <div class="avatar">

                    ${
                      rr.rows[0].avatar_url
                        ? `
                          <img
                            src="${escapeHtml(
                              rr.rows[0].avatar_url
                            )}"
                            alt="پروفایل"
                          >
                        `
                        : escapeHtml(
                            rr.rows[0].name.charAt(0)
                          )
                    }

                  </div>

                  <div>

                    <div class="username">
                      ${escapeHtml(
                        rr.rows[0].name
                      )}
                    </div>

                    <div class="email">
                      ${escapeHtml(
                        rr.rows[0].email
                      )}
                    </div>

                  </div>

                </div>

              </div>

              <div class="card chat-box">

                ${messages}

              </div>

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
                    maxlength="3000"
                    placeholder="پیام خود را بنویس..."
                    required
                  ></textarea>

                  <button class="full">
                    📤 ارسال پیام
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
            !Number.isInteger(id) ||
            id === user.id ||
            !message
          ) {

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
                    امکان ارسال پیام به این کاربر وجود ندارد.
                  </p>

                </div>
              `,
              user
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
              [id]
            );

          if (
            !receiver.rows.length
          ) {

            redirect(
              res,
              "/messages"
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

          redirect(
            res,
            `/chat?id=${id}`
          );

          return;
        }

        if (
          req.method === "GET" &&
          path === "/profile"
        ) {

          const profileId =
            Number(
              url.searchParams.get("id")
            ) || user.id;

          const r =
            await pool.query(
              `
                SELECT
                  id,
                  name,
                  email,
                  bio,
                  avatar_url

                FROM users

                WHERE id=$1
              `,
              [profileId]
            );

          if (
            !r.rows.length
          ) {

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
            r.rows[0];

          if (
            Number(profileId) !== Number(user.id) &&
            await areBlocked(
              user.id,
              profileId
            )
          ) {

            sendHtml(
              res,
              403,
              "مسدود",
              `
                <div class="card">

                  <p class="error">
                    دسترسی به این پروفایل ممکن نیست.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          const followerCount =
            await pool.query(
              `
                SELECT COUNT(*)
                FROM follows
                WHERE following_id=$1
              `,
              [profileId]
            );

          const followingCount =
            await pool.query(
              `
                SELECT COUNT(*)
                FROM follows
                WHERE follower_id=$1
              `,
              [profileId]
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
              [profileId]
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
                          src="${escapeHtml(
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
                  margin-top:10px
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
                Number(profileId) === Number(user.id)
                  ? `
                    <div class="actions">

                      <a href="/profile/edit">
                        <button>
                          ⚙️ ویرایش پروفایل
                        </button>
                      </a>

                      <a href="/bookmarks">
                        <button>
                          🔖 ذخیره‌ها
                        </button>
                      </a>

                    </div>
                  `
                  : `
                    <div class="actions">

                      <a href="/follow?id=${profileId}">
                        <button class="follow">
                          ${
                            isFollowing.rows.length
                              ? "❌ لغو دنبال کردن"
                              : "➕ دنبال کردن"
                          }
                        </button>
                      </a>

                      <a href="/chat?id=${profileId}">
                        <button>
                          💬 پیام
                        </button>
                      </a>

                      <a href="/block?id=${profileId}">
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
              const p of posts.rows
            ) {

              html += `
                <article class="card">

                  <div class="small">
                    ${new Date(
                      p.created_at
                    ).toLocaleString("fa-IR")}
                  </div>

                  <div class="post-text">
                    ${escapeHtml(p.content)}
                  </div>

                  ${
                    p.image_url
                      ? `
                        <img
                          class="post-image"
                          src="${escapeHtml(
                            p.image_url
                          )}"
                          alt="تصویر"
                        >
                      `
                      : ""
                  }

                  <div class="actions">

                    <a href="/post?id=${p.id}">
                      <button>
                        💬 مشاهده پست
                      </button>
                    </a>

                    ${
                      Number(profileId) === Number(user.id)
                        ? `
                          <a
                            href="/delete-post?id=${p.id}"
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

        if (
          req.method === "GET" &&
          path === "/bookmarks"
        ) {

          const r =
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
              [user.id]
            );

          let html = `
            <div class="card">

              <h2>
                🔖 پست‌های ذخیره‌شده
              </h2>

            </div>
          `;

          if (
            !r.rows.length
          ) {

            html += `
              <div class="card empty">
                هنوز پستی ذخیره نکرده‌اید.
              </div>
            `;

          } else {

            for (
              const p of r.rows
            ) {

              html += `
                <article class="card">

                  <div class="profile-head">

                    <div class="avatar">

                      ${
                        p.avatar_url
                          ? `
                            <img
                              src="${escapeHtml(
                                p.avatar_url
                              )}"
                              alt="پروفایل"
                            >
                          `
                          : escapeHtml(
                              p.name.charAt(0)
                            )
                      }

                    </div>

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
                          src="${escapeHtml(
                            p.image_url
                          )}"
                          alt="تصویر"
                        >
                      `
                      : ""
                  }

                  <div class="actions">

                    <a
                      href="/post?id=${p.id}"
                    >
                      <button>
                        مشاهده پست
                      </button>
                    </a>

                    <a
                      href="/bookmark?post=${p.id}&from=saved"
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

        if (
          req.method === "GET" &&
          path === "/block"
        ) {

          const id =
            Number(
              url.searchParams.get("id")
            );

          if (
            !Number.isInteger(id) ||
            id === user.id
          ) {

            redirect(
              res,
              "/profile"
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
              [id]
            );

          if (
            !target.rows.length
          ) {

            redirect(
              res,
              "/profile"
            );

            return;
          }

          const q =
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
                id
              ]
            );

          if (
            q.rows.length
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
                id
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

          redirect(
            res,
            `/profile?id=${id}`
          );

          return;
        }

        if (
          req.method === "GET" &&
          path === "/report"
        ) {

          const postId =
            Number(
              url.searchParams.get("post")
            );

          const userId =
            Number(
              url.searchParams.get("user")
            );

          if (
            !Number.isInteger(postId) &&
            !Number.isInteger(userId)
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
                      Number.isInteger(userId)
                        ? userId
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
              !Number.isInteger(reportedUserId)
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
              Number.isInteger(reportedUserId)
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
                  n.post_id,
                  u.name AS actor_name,
                  u.avatar_url AS actor_avatar

                FROM notifications n

                LEFT JOIN users u
                  ON u.id=n.actor_id

                WHERE n.user_id=$1

                ORDER BY n.created_at DESC

                LIMIT 100
              `,
              [user.id]
            );

          await pool.query(
            `
              UPDATE notifications

              SET is_read=TRUE

              WHERE
                user_id=$1
                AND is_read=FALSE
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
              const n of notifications.rows
            ) {

              html += `
                <div class="card">

                  <div class="profile-head">

                    <div class="avatar">

                      ${
                        n.actor_avatar
                          ? `
                            <img
                              src="${escapeHtml(
                                n.actor_avatar
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
                          n.actor_name || "سیستم"
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
                    ${escapeHtml(n.message)}
                  </div>

                  ${
                    n.post_id
                      ? `
                        <a
                          href="/post?id=${n.post_id}"
                        >
                          <button>
                            مشاهده پست
                          </button>
                        </a>
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
            "اعلان‌ها",
            html,
            user
          );

          return;
        }

        if (
          req.method === "GET" &&
          path === "/profile/edit"
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
            "ویرایش پروفایل",
            `
              <div class="card">

                <div
                  style="
                    text-align:center;
                    margin-bottom:15px;
                  "
                >

                  <div
                    class="avatar large"
                    style="margin:auto"
                  >

                    ${
                      p.avatar_url
                        ? `
                          <img
                            src="${escapeHtml(
                              p.avatar_url
                            )}"
                            alt="پروفایل"
                          >
                        `
                        : escapeHtml(
                            p.name.charAt(0)
                          )
                    }

                  </div>

                </div>

                <form
                  method="POST"
                  action="/profile/edit"
                >

                  <input
                    name="name"
                    value="${escapeHtml(p.name)}"
                    maxlength="100"
                    placeholder="نام"
                    required
                  >

                  <input
                    name="email"
                    type="email"
                    value="${escapeHtml(p.email)}"
                    maxlength="200"
                    placeholder="ایمیل"
                    required
                  >

                  <textarea
                    name="bio"
                    maxlength="1000"
                    placeholder="درباره من"
                  >${escapeHtml(
                    p.bio || ""
                  )}</textarea>

                  <input
                    name="avatar_url"
                    type="url"
                    maxlength="2000"
                    value="${escapeHtml(
                      p.avatar_url || ""
                    )}"
                    placeholder="لینک عکس پروفایل (اختیاری)"
                  >

                  <button class="full">
                    💾 ذخیره تغییرات
                  </button>

                </form>

                ${
                  p.avatar_url
                    ? `
                      <form
                        method="POST"
                        action="/profile/avatar/delete"
                      >

                        <button
                          class="full danger-outline"
                        >
                          🖼️ حذف عکس پروفایل
                        </button>

                      </form>
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
          req.method === "POST" &&
          path === "/profile/edit"
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
            ).trim().toLowerCase();

          const bio =
            String(
              d.get("bio") || ""
            ).trim();

          const avatarUrl =
            String(
              d.get("avatar_url") || ""
            ).trim();

          if (
            !name ||
            !email
          ) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    نام و ایمیل الزامی است.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          try {

            await pool.query(
              `
                UPDATE users

                SET
                  name=$1,
                  email=$2,
                  bio=$3,
                  avatar_url=$4

                WHERE id=$5
              `,
              [
                name,
                email,
                bio,
                avatarUrl,
                user.id
              ]
            );

            redirect(
              res,
              "/profile"
            );

          } catch (e) {

            console.error(
              "PROFILE UPDATE ERROR:",
              e
            );

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    ایمیل واردشده قبلاً استفاده شده است.
                  </p>

                </div>
              `,
              user
            );
          }

          return;
        }

        if (
          req.method === "POST" &&
          path === "/profile/avatar/delete"
        ) {

          await pool.query(
            `
              UPDATE users

              SET avatar_url=''

              WHERE id=$1
            `,
            [user.id]
          );

          redirect(
            res,
            "/profile/edit"
          );

          return;
        }

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

          const oldPassword =
            String(
              d.get("old_password") || ""
            );

          const newPassword =
            String(
              d.get("new_password") || ""
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
            hashPassword(oldPassword) !==
              r.rows[0].password ||
            newPassword.length < 6
          ) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    رمز فعلی اشتباه است
                    یا رمز جدید کوتاه است.
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

                <p class="success">
                  رمز عبور با موفقیت تغییر کرد ✅
                </p>

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

        if (
          req.method === "GET" &&
          path === "/delete-job"
        ) {

          const jobId =
            Number(
              url.searchParams.get("id")
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

        if (
          req.method === "GET" &&
          path === "/settings"
        ) {

          sendHtml(
            res,
            200,
            "تنظیمات",
            `
              <div class="card">

                <h3>
                  حساب کاربری ⚙️
                </h3>

                <p class="success">
                  حساب فعال است ✅
                </p>

                <p class="small">
                  ایمیل:
                  ${escapeHtml(user.email)}
                </p>

              </div>

              <div class="card">

                <h3>
                  امکانات
                </h3>

                <div class="menu">

                  <a href="/notifications">
                    🔔 اعلان‌ها
                  </a>

                  <a href="/bookmarks">
                    🔖 پست‌های ذخیره‌شده
                  </a>

                  <a href="/profile/edit">
                    ✏️ ویرایش پروفایل
                  </a>

                  <a href="/password">
                    🔐 تغییر رمز عبور
                  </a>

                  <button
                    class="theme-btn"
                    onclick="toggleTheme()"
                  >
                    🌙 تغییر حالت نمایش
                  </button>

                </div>

              </div>
            `,
            user
          );

          return;
        }

        if (
          req.method === "GET" &&
          path === "/logout"
        ) {

          const sid =
            parseCookies(req).sessionId;

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
            null
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
