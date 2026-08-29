const http = require("http");
const crypto = require("crypto");
const util = require("util");
const { Pool } = require("pg");

const scryptAsync = util.promisify(crypto.scrypt);

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

/* =========================================================
   PASSWORD
========================================================= */

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
}

async function hashPasswordScrypt(password) {
  const salt = crypto.randomBytes(16).toString("hex");

  const derivedKey = await scryptAsync(
    String(password),
    salt,
    64
  );

  return `scrypt$${salt}$${Buffer.from(derivedKey).toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const value = String(stored || "");
  const plain = String(password || "");

  if (/^[a-f0-9]{64}$/i.test(value)) {
    const hash = hashPassword(plain);

    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(value, "hex")
    );
  }

  if (value.startsWith("scrypt$")) {
    const parts = value.split("$");

    if (parts.length !== 3) {
      return false;
    }

    const salt = parts[1];
    const expectedHex = parts[2];

    try {
      const derivedKey = await scryptAsync(
        plain,
        salt,
        64
      );

      const actual = Buffer.from(derivedKey);
      const expected = Buffer.from(expectedHex, "hex");

      if (actual.length !== expected.length) {
        return false;
      }

      return crypto.timingSafeEqual(
        actual,
        expected
      );
    } catch {
      return false;
    }
  }

  if (value.includes(":")) {
    const parts = value.split(":");

    if (parts.length === 2) {
      const salt = parts[0];
      const expectedHex = parts[1];

      try {
        const derivedKey = await scryptAsync(
          plain,
          salt,
          64
        );

        const actual = Buffer.from(derivedKey);
        const expected = Buffer.from(expectedHex, "hex");

        if (actual.length === expected.length) {
          return crypto.timingSafeEqual(
            actual,
            expected
          );
        }
      } catch {
        return false;
      }
    }
  }

  return false;
}

/* =========================================================
   HELPERS
========================================================= */

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

function sendJson(res, status, data) {
  if (res.headersSent) {
    return;
  }

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(data));
}

function sendHtml(
  res,
  status,
  title,
  content,
  user = null
) {
  if (res.headersSent) {
    return;
  }

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

function readBody(req, maxSize = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let finished = false;

    req.on("data", chunk => {
      if (finished) {
        return;
      }

      body += chunk.toString();

      if (Buffer.byteLength(body, "utf8") > maxSize) {
        finished = true;

        reject(
          new Error("Request body too large")
        );

        try {
          req.destroy();
        } catch {}
      }
    });

    req.on("end", () => {
      if (!finished) {
        resolve(
          new URLSearchParams(body)
        );
      }
    });

    req.on("error", reject);
  });
}

/* =========================================================
   MULTIPART IMAGE UPLOAD
========================================================= */

function readMultipart(req, maxSize = 3 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", chunk => {
      total += chunk.length;

      if (total > maxSize) {
        reject(
          new Error("فایل بیش از حد بزرگ است.")
        );

        try {
          req.destroy();
        } catch {}

        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType =
          req.headers["content-type"] || "";

        const match =
          contentType.match(
            /boundary=(?:"([^"]+)"|([^;]+))/i
          );

        if (!match) {
          throw new Error(
            "Multipart boundary not found"
          );
        }

        const boundary =
          match[1] || match[2];

        const delimiter =
          Buffer.from("--" + boundary);

        const parts = [];

        let start = 0;

        while (true) {
          const index =
            buffer.indexOf(
              delimiter,
              start
            );

          if (index === -1) {
            break;
          }

          if (index > start) {
            parts.push(
              buffer.slice(
                start,
                index
              )
            );
          }

          start =
            index +
            delimiter.length;
        }

        const fields = {};
        const files = {};

        for (let part of parts) {
          if (!part.length) {
            continue;
          }

          while (
            part.length &&
            (
              part[0] === 13 ||
              part[0] === 10
            )
          ) {
            part = part.slice(1);
          }

          if (!part.length) {
            continue;
          }

          const headerEnd =
            part.indexOf(
              Buffer.from("\r\n\r\n")
            );

          if (headerEnd === -1) {
            continue;
          }

          const headerText =
            part
              .slice(0, headerEnd)
              .toString("utf8");

          let data =
            part.slice(
              headerEnd + 4
            );

          while (
            data.length >= 2 &&
            data[data.length - 2] === 13 &&
            data[data.length - 1] === 10
          ) {
            data = data.slice(
              0,
              data.length - 2
            );
          }

          const dispositionMatch =
            headerText.match(
              /name="([^"]+)"/i
            );

          if (!dispositionMatch) {
            continue;
          }

          const fieldName =
            dispositionMatch[1];

          const fileMatch =
            headerText.match(
              /filename="([^"]*)"/i
            );

          if (fileMatch) {
            const filename =
              fileMatch[1];

            const typeMatch =
              headerText.match(
                /Content-Type:\s*([^\r\n]+)/i
              );

            const mime =
              typeMatch
                ? typeMatch[1].trim()
                : "application/octet-stream";

            files[fieldName] = {
              filename,
              mime,
              buffer: data
            };
          } else {
            fields[fieldName] =
              data.toString("utf8");
          }
        }

        resolve({
          fields,
          files
        });
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function imageToDataUrl(file) {
  if (!file || !file.buffer || !file.buffer.length) {
    return "";
  }

  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowed.includes(file.mime)) {
    throw new Error(
      "فرمت تصویر مجاز نیست."
    );
  }

  if (file.buffer.length > 2 * 1024 * 1024) {
    throw new Error(
      "حجم تصویر باید کمتر از ۲ مگابایت باشد."
    );
  }

  return `data:${file.mime};base64,${file.buffer.toString("base64")}`;
}

/* =========================================================
   PAGE
========================================================= */

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
        <a href="/jobs">💼 کاریابی</a>
        <a href="/saved">🔖 ذخیره‌ها</a>
        <a href="/notifications">🔔 اعلان‌ها</a>
        <a href="/settings">⚙️ تنظیمات</a>
        <a href="/logout">🚪 خروج</a>
      </div>
    `
    : "";

  const avatar = user && user.avatar_url
    ? `
      <img
        src="${escapeAttr(user.avatar_url)}"
        alt="پروفایل"
      >
    `
    : user
      ? escapeHtml(
          user.name
            ? user.name.charAt(0)
            : "👤"
        )
      : "";

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<meta
  name="theme-color"
  content="#6c5ce7"
>

<title>${escapeHtml(title)} - MySocial</title>

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

  background:
    linear-gradient(
      135deg,
      #f5f7ff,
      #eef3ff
    );

  color: #202124;

  padding-bottom: 90px;
}

a {
  color: inherit;
  text-decoration: none;
}

header {
  position: sticky;
  top: 0;
  z-index: 50;

  background:
    rgba(255,255,255,.96);

  backdrop-filter:
    blur(12px);

  border-bottom:
    1px solid #e4e7f0;

  box-shadow:
    0 4px 20px rgba(60,60,120,.08);
}

.header-inner {
  max-width: 820px;
  margin: auto;
  padding: 13px 14px;
}

.brand {
  font-size: 24px;
  font-weight: 900;
  color: #5b4bdb;
  margin-bottom: 10px;
}

.top-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.top-actions a {
  background:
    #f0efff;

  color:
    #5144b8;

  padding:
    8px 11px;

  border-radius:
    12px;

  font-size:
    12px;

  font-weight:
    bold;

  transition:
    .2s;
}

.top-actions a:hover {
  background:
    #dedbff;

  transform:
    translateY(-1px);
}

main {
  width: 100%;
  max-width: 820px;
  margin: 20px auto;
  padding: 0 12px;
}

.card {
  background:
    rgba(255,255,255,.98);

  border:
    1px solid #e1e4ef;

  border-radius:
    18px;

  padding:
    17px;

  margin-bottom:
    14px;

  box-shadow:
    0 7px 25px rgba(52,60,100,.07);
}

.card h2,
.card h3 {
  margin-top: 0;
}

.profile-head {
  display:
    flex;

  align-items:
    center;

  gap:
    12px;
}

.avatar {
  width:
    52px;

  height:
    52px;

  border-radius:
    50%;

  background:
    linear-gradient(
      135deg,
      #6c5ce7,
      #00b894
    );

  color:
    white;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  font-weight:
    bold;

  font-size:
    20px;

  overflow:
    hidden;

  flex-shrink:
    0;

  box-shadow:
    0 4px 12px
    rgba(80,70,180,.25);
}

.avatar img {
  width:
    100%;

  height:
    100%;

  object-fit:
    cover;
}

.avatar.large {
  width:
    92px;

  height:
    92px;

  font-size:
    34px;
}

.username {
  font-weight:
    bold;

  font-size:
    16px;
}

.email,
.small {
  color:
    #777;

  font-size:
    12px;

  margin-top:
    4px;
}

.post-text {
  white-space:
    pre-wrap;

  line-height:
    1.9;

  margin-top:
    15px;

  overflow-wrap:
    anywhere;
}

.post-image {
  width:
    100%;

  max-height:
    650px;

  object-fit:
    cover;

  border-radius:
    14px;

  margin-top:
    14px;

  display:
    block;
}

.stats {
  display:
    flex;

  flex-wrap:
    wrap;

  gap:
    16px;

  color:
    #666;

  font-size:
    13px;

  margin-top:
    14px;
}

.actions {
  display:
    flex;

  flex-wrap:
    wrap;

  gap:
    8px;

  margin-top:
    14px;
}

button {
  border:
    0;

  border-radius:
    12px;

  padding:
    10px 14px;

  cursor:
    pointer;

  background:
    #ecebff;

  color:
    #4539a8;

  font-size:
    14px;

  font-family:
    inherit;

  font-weight:
    bold;

  transition:
    .2s;
}

button:hover {
  transform:
    translateY(-1px);

  filter:
    brightness(.97);
}

button.full {
  width:
    100%;
}

button.danger {
  background:
    #ffe2e6;

  color:
    #c62828;
}

button.follow {
  background:
    #ddf7ef;

  color:
    #08795e;
}

form {
  display:
    flex;

  flex-direction:
    column;

  gap:
    12px;
}

input,
textarea {
  width:
    100%;

  border:
    1px solid #d8dbe7;

  border-radius:
    12px;

  padding:
    12px;

  font-family:
    inherit;

  font-size:
    14px;

  background:
    #fbfcff;

  color:
    #222;

  outline:
    none;
}

input:focus,
textarea:focus {
  border-color:
    #6c5ce7;

  box-shadow:
    0 0 0 3px
    rgba(108,92,231,.12);
}

textarea {
  min-height:
    120px;

  resize:
    vertical;
}

input[type="file"] {
  padding:
    9px;

  background:
    #f5f4ff;
}

.error {
  color:
    #c62828;

  font-weight:
    bold;
}

.success {
  color:
    #16845e;

  font-weight:
    bold;
}

.empty {
  text-align:
    center;

  color:
    #777;
}

.notice {
  padding:
    12px;

  border-radius:
    12px;

  background:
    #f4f3ff;

  color:
    #4f46a5;

  margin-top:
    10px;
}

.comment-text {
  white-space:
    pre-wrap;

  line-height:
    1.8;

  margin-top:
    10px;
}

.job-title {
  font-size:
    18px;

  font-weight:
    bold;
}

.job-city,
.job-salary {
  margin-top:
    8px;

  color:
    #555;
}

.job-description {
  white-space:
    pre-wrap;

  line-height:
    1.8;

  margin-top:
    12px;
}

.message-card {
  border-radius:
    16px;

  padding:
    12px;

  margin-bottom:
    9px;

  max-width:
    86%;
}

.message-me {
  background:
    #e8e5ff;

  color:
    #30267e;

  margin-right:
    auto;
}

.message-other {
  background:
    #eef2f5;

  margin-left:
    auto;
}

.message-author {
  font-size:
    12px;

  font-weight:
    bold;

  margin-bottom:
    5px;
}

.bottom-nav {
  position:
    fixed;

  bottom:
    0;

  left:
    0;

  right:
    0;

  z-index:
    100;

  background:
    rgba(255,255,255,.97);

  backdrop-filter:
    blur(12px);

  border-top:
    1px solid #ddd;

  display:
    flex;

  justify-content:
    center;

  gap:
    5px;

  padding:
    7px;
}

.bottom-nav a {
  flex:
    1;

  max-width:
    150px;

  text-align:
    center;

  font-size:
    11px;

  padding:
    7px 3px;

  border-radius:
    12px;

  color:
    #555;
}

.bottom-nav a:hover {
  background:
    #f0efff;

  color:
    #5144b8;
}

.bottom-nav span {
  display:
    block;

  font-size:
    19px;

  margin-bottom:
    2px;
}

.profile-cover {
  height:
    110px;

  border-radius:
    16px;

  background:
    linear-gradient(
      135deg,
      #6c5ce7,
      #00b894
    );

  margin:
    -2px -2px 15px;
}

.profile-avatar-wrap {
  margin-top:
    -55px;

  position:
    relative;

  z-index:
    2;
}

.badge {
  display:
    inline-block;

  background:
    #eeeaff;

  color:
    #5548c5;

  padding:
    5px 9px;

  border-radius:
    20px;

  font-size:
    11px;

  font-weight:
    bold;
}

@media (max-width: 600px) {

  main {
    margin-top:
      12px;
  }

  .card {
    border-radius:
      14px;

    padding:
      14px;
  }

  .top-actions {
    gap:
      5px;
  }

  .top-actions a {
    font-size:
      10px;

    padding:
      7px 8px;
  }

  button {
    font-size:
      13px;

    padding:
      9px 11px;
  }

  .message-card {
    max-width:
      92%;
  }
}

</style>
</head>

<body>

<header>
  <div class="header-inner">

    <div class="brand">
      MySocial 📱
    </div>

    ${topMenu}

  </div>
</header>

<main>

${content}

</main>

${nav}

</body>
</html>`;
}

/* =========================================================
   DATABASE
========================================================= */

async function createTables() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(128) UNIQUE NOT NULL,
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
      content TEXT NOT NULL,
      image_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      UNIQUE(user_id, post_id)
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
      UNIQUE(follower_id, following_id)
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      UNIQUE(post_id, user_id)
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
    CREATE TABLE IF NOT EXISTS blocked_users (
      id SERIAL PRIMARY KEY,
      blocker_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blocker_id, blocked_id)
    )
  `);

  /* =======================================================
     MIGRATIONS
  ======================================================= */

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''
  `);

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT ''
  `);

  await pool.query(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS message TEXT
  `);

  /*
   * نسخه‌های قدیمی ممکن است ستون content داشته باشند.
   * اطلاعات قدیمی را به message منتقل می‌کنیم.
   */

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='messages'
        AND column_name='content'
      )
      THEN
        UPDATE messages
        SET message = content
        WHERE message IS NULL;
      END IF;
    END
    $$;
  `);

  console.log(
    "Database tables and migrations checked successfully."
  );
}

/* =========================================================
   SESSION
========================================================= */

async function createSession(userId) {

  const sessionId =
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
      [sessionId]
    );

  return result.rows[0] || null;
}

async function destroySession(req) {

  const cookies =
    parseCookies(req);

  if (!cookies.sessionId) {
    return;
  }

  await pool.query(
    `
      DELETE FROM sessions
      WHERE session_id=$1
    `,
    [cookies.sessionId]
  );
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
    userId === actorId
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

        /* ===================================================
           HEALTH
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/health"
        ) {

          sendJson(
            res,
            200,
            {
              ok: true,
              service: "MySocial"
            }
          );

          return;
        }

        /* ===================================================
           LOGIN PAGE
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/login"
        ) {

          if (user) {
            redirect(res, "/");
            return;
          }

          sendHtml(
            res,
            200,
            "ورود",
            `
              <div class="card">

                <h2>
                  🔐 ورود به MySocial
                </h2>

                <form
                  method="POST"
                  action="/login"
                >

                  <input
                    type="email"
                    name="email"
                    maxlength="255"
                    placeholder="ایمیل"
                    autocomplete="email"
                    required
                  >

                  <input
                    type="password"
                    name="password"
                    placeholder="رمز عبور"
                    autocomplete="current-password"
                    required
                  >

                  <button class="full">
                    ورود
                  </button>

                </form>

                <p>
                  حساب نداری؟
                  <a href="/register">
                    <b>ثبت‌نام</b>
                  </a>
                </p>

              </div>
            `
          );

          return;
        }

        /* ===================================================
           LOGIN POST
        =================================================== */

        if (
          req.method === "POST" &&
          path === "/login"
        ) {

          const data =
            await readBody(req);

          const email =
            (data.get("email") || "")
              .trim()
              .toLowerCase();

          const password =
            data.get("password") || "";

          if (
            !email ||
            !password
          ) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">
                  <p class="error">
                    ایمیل و رمز عبور را وارد کنید.
                  </p>

                  <a href="/login">
                    بازگشت
                  </a>
                </div>
              `
            );

            return;
          }

          const result =
            await pool.query(
              `
                SELECT
                  id,
                  password
                FROM users
                WHERE LOWER(email)=LOWER($1)
                LIMIT 1
              `,
              [email]
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

          const account =
            result.rows[0];

          const valid =
            await verifyPassword(
              password,
              account.password
            );

          if (!valid) {

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

          if (
            /^[a-f0-9]{64}$/i.test(
              account.password
            )
          ) {

            try {

              const newHash =
                await hashPasswordScrypt(
                  password
                );

              await pool.query(
                `
                  UPDATE users
                  SET password=$1
                  WHERE id=$2
                `,
                [
                  newHash,
                  account.id
                ]
              );

            } catch (error) {

              console.error(
                "PASSWORD MIGRATION ERROR:",
                error
              );
            }
          }

          const sessionId =
            await createSession(
              account.id
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

        /* ===================================================
           REGISTER
        =================================================== */

        if (
          req.method === "GET" &&
          (
            path === "/register" ||
            path === "/signup"
          )
        ) {

          if (user) {
            redirect(res, "/");
            return;
          }

          sendHtml(
            res,
            200,
            "ثبت‌نام",
            `
              <div class="card">

                <h2>
                  📝 ساخت حساب
                </h2>

                <form
                  method="POST"
                  action="/register"
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
                    maxlength="255"
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

                <p>
                  قبلاً حساب ساخته‌ای؟
                  <a href="/login">
                    <b>ورود</b>
                  </a>
                </p>

              </div>
            `
          );

          return;
        }

        if (
          req.method === "POST" &&
          (
            path === "/register" ||
            path === "/signup"
          )
        ) {

          const data =
            await readBody(req);

          const name =
            (data.get("name") || "")
              .trim();

          const email =
            (data.get("email") || "")
              .trim()
              .toLowerCase();

          const password =
            data.get("password") || "";

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

                  <a href="/register">
                    بازگشت
                  </a>
                </div>
              `
            );

            return;
          }

          try {

            const passwordHash =
              await hashPasswordScrypt(
                password
              );

            const result =
              await pool.query(
                `
                  INSERT INTO users(
                    name,
                    email,
                    password
                  )
                  VALUES($1,$2,$3)
                  RETURNING id
                `,
                [
                  name,
                  email,
                  passwordHash
                ]
              );

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

          } catch (error) {

            if (
              error.code === "23505"
            ) {

              sendHtml(
                res,
                409,
                "خطا",
                `
                  <div class="card">

                    <p class="error">
                      این ایمیل قبلاً ثبت شده است.
                    </p>

                    <a href="/login">
                      ورود به حساب
                    </a>

                  </div>
                `
              );

            } else {
              throw error;
            }
          }

          return;
        }

        /* ===================================================
           LOGOUT
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/logout"
        ) {

          await destroySession(req);

          redirect(
            res,
            "/login",
            "sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
          );

          return;
        }

        /* ===================================================
           AUTH
        =================================================== */

        if (!user) {

          redirect(
            res,
            "/login"
          );

          return;
        }

        /* ===================================================
           HOME
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/"
        ) {

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
                    FROM likes ml
                    WHERE
                      ml.post_id=p.id
                      AND ml.user_id=$1
                  ) AS liked,

                  EXISTS(
                    SELECT 1
                    FROM bookmarks mb
                    WHERE
                      mb.post_id=p.id
                      AND mb.user_id=$1
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
                  <h2 style="margin:0">
                    سلام ${escapeHtml(user.name)} 👋
                  </h2>

                  <div class="small">
                    به MySocial خوش آمدی
                  </div>
                </div>

              </div>

              <div class="actions">

                <a href="/new-post">
                  <button>
                    ➕ انتشار پست
                  </button>
                </a>

                <a href="/search">
                  <button>
                    🔎 جستجو
                  </button>
                </a>

                <a href="/saved">
                  <button>
                    🔖 ذخیره‌ها
                  </button>
                </a>

              </div>

            </div>
          `;

          if (!posts.rows.length) {

            html += `
              <div class="card empty">
                هنوز پستی برای نمایش وجود ندارد.
              </div>
            `;

          } else {

            for (const p of posts.rows) {

              html += `
                <article class="card">

                  <div class="profile-head">

                    <a href="/profile?id=${p.user_id}">

                      <div class="avatar">

                        ${
                          p.avatar_url
                            ? `
                              <img
                                src="${escapeAttr(p.avatar_url)}"
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

                      <a href="/profile?id=${p.user_id}">
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
                          src="${escapeAttr(p.image_url)}"
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
                      <button>
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
                        💬 نظرات
                      </button>
                    </a>

                    <a href="/report?post=${p.id}&user=${p.user_id}">
                      <button class="danger">
                        🚩 گزارش
                      </button>
                    </a>

                    ${
                      p.user_id === user.id
                        ? `
                          <a href="/delete-post?id=${p.id}">
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
            "خانه",
            html,
            user
          );

          return;
        }

        /* ===================================================
           NEW POST
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/new-post"
        ) {

          sendHtml(
            res,
            200,
            "پست جدید",
            `
              <div class="card">

                <h2>
                  ➕ انتشار پست جدید
                </h2>

                <form
                  method="POST"
                  action="/new-post"
                  enctype="multipart/form-data"
                >

                  <textarea
                    name="content"
                    maxlength="10000"
                    placeholder="چه چیزی می‌خواهی منتشر کنی؟"
                    required
                  ></textarea>

                  <input
                    type="file"
                    name="image"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                  >

                  <button class="full">
                    📤 انتشار پست
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

          const contentType =
            req.headers["content-type"] || "";

          let content = "";
          let imageUrl = "";

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

            if (form.files.image) {
              imageUrl =
                imageToDataUrl(
                  form.files.image
                );
            }

          } else {

            const data =
              await readBody(req);

            content =
              (data.get("content") || "")
                .trim();

            imageUrl =
              (data.get("image_url") || "")
                .trim();
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

          const result =
            await pool.query(
              `
                INSERT INTO posts(
                  user_id,
                  content,
                  image_url
                )
                VALUES($1,$2,$3)
                RETURNING id
              `,
              [
                user.id,
                content,
                imageUrl
              ]
            );

          redirect(
            res,
            `/post?id=${result.rows[0].id}`
          );

          return;
        }

        /* ===================================================
           LIKE
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/like"
        ) {

          const postId =
            Number(
              url.searchParams.get("post")
            );

          if (Number.isInteger(postId)) {

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

              if (x.rows[0].liked) {

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

        /* ===================================================
           BOOKMARK
        =================================================== */

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

            if (existing.rows.length) {

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
            "/"
          );

          return;
        }

        /* ===================================================
           POST DETAIL
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/post"
        ) {

          const postId =
            Number(
              url.searchParams.get("id")
            );

          if (!Number.isInteger(postId)) {
            redirect(res, "/");
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
                    FROM likes ml
                    WHERE
                      ml.post_id=p.id
                      AND ml.user_id=$1
                  ) AS liked,

                  EXISTS(
                    SELECT 1
                    FROM bookmarks mb
                    WHERE
                      mb.post_id=p.id
                      AND mb.user_id=$1
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
                  این پست وجود ندارد یا حذف شده است.
                </div>
              `,
              user
            );

            return;
          }

          const post =
            result.rows[0];

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
              `,
              [postId]
            );

          let html = `
            <article class="card">

              <div class="profile-head">

                <a href="/profile?id=${post.user_id}">

                  <div class="avatar">

                    ${
                      post.avatar_url
                        ? `
                          <img
                            src="${escapeAttr(post.avatar_url)}"
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

                  <a href="/profile?id=${post.user_id}">
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
                      src="${escapeAttr(post.image_url)}"
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

                <a href="/like?post=${post.id}">
                  <button>
                    ${
                      post.liked
                        ? "💔 برداشتن لایک"
                        : "❤️ لایک"
                    }
                  </button>
                </a>

                <a href="/bookmark?post=${post.id}">
                  <button>
                    ${
                      post.bookmarked
                        ? "🔖 حذف ذخیره"
                        : "🔖 ذخیره"
                    }
                  </button>
                </a>

                <a href="/report?post=${post.id}&user=${post.user_id}">
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
                  post.user_id === user.id
                    ? `
                      <a href="/delete-post?id=${post.id}">
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

          if (!comments.rows.length) {

            html += `
              <div class="card empty">
                هنوز نظری ثبت نشده است.
              </div>
            `;

          } else {

            for (const c of comments.rows) {

              html += `
                <div class="card">

                  <div class="profile-head">

                    <a href="/profile?id=${c.user_id}">

                      <div class="avatar">

                        ${
                          c.avatar_url
                            ? `
                              <img
                                src="${escapeAttr(c.avatar_url)}"
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

                      <a href="/profile?id=${c.user_id}">
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

                  <div class="comment-text">
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

        /* ===================================================
           COMMENT
        =================================================== */

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
            (data.get("comment") || "")
              .trim();

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

        /* ===================================================
           PROFILE
        =================================================== */

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
                          src="${escapeAttr(profile.avatar_url)}"
                          alt="تصویر پروفایل"
                        >
                      `
                      : escapeHtml(
                          profile.name.charAt(0)
                        )
                  }

                </div>

              </div>

              <div style="margin-top:12px">

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
                profileId === user.id
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

                      <a href="/follow?user=${profileId}">
                        <button class="follow">
                          ${
                            isFollowing.rows.length
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

                      <a href="/block?user=${profileId}">
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

          if (!posts.rows.length) {

            html += `
              <div class="card empty">
                هنوز پستی منتشر نشده است.
              </div>
            `;

          } else {

            for (const p of posts.rows) {

              html += `
                <div class="card">

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
                          src="${escapeAttr(p.image_url)}"
                          alt="تصویر پست"
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
                      profileId === user.id
                        ? `
                          <a href="/delete-post?id=${p.id}">
                            <button class="danger">
                              🗑️ حذف
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

          sendHtml(
            res,
            200,
            "پروفایل",
            html,
            user
          );

          return;
        }

        /* ===================================================
           FOLLOW
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/follow"
        ) {

          const targetId =
            Number(
              url.searchParams.get("user")
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
              [targetId]
            );

          if (!target.rows.length) {
            redirect(res, "/");
            return;
          }

          const blocked =
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
              `,
              [
                user.id,
                targetId
              ]
            );

          if (blocked.rows.length) {

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

          if (existing.rows.length) {

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

        /* ===================================================
           SEARCH
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/search"
        ) {

          const q =
            (url.searchParams.get("q") || "")
              .trim();

          let html = `
            <div class="card">

              <h2>
                🔎 جستجوی کاربران
              </h2>

              <form
                method="GET"
                action="/search"
              >

                <input
                  name="q"
                  value="${escapeAttr(q)}"
                  maxlength="255"
                  placeholder="نام یا ایمیل..."
                >

                <button class="full">
                  جستجو
                </button>

              </form>

            </div>
          `;

          if (q) {

            const results =
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

            if (!results.rows.length) {

              html += `
                <div class="card empty">
                  نتیجه‌ای پیدا نشد.
                </div>
              `;

            } else {

              for (const u of results.rows) {

                html += `
                  <div class="card">

                    <div class="profile-head">

                      <div class="avatar">

                        ${
                          u.avatar_url
                            ? `
                              <img
                                src="${escapeAttr(u.avatar_url)}"
                                alt="تصویر"
                              >
                            `
                            : escapeHtml(
                                u.name.charAt(0)
                              )
                        }

                      </div>

                      <div>

                        <div class="username">
                          ${escapeHtml(u.name)}
                        </div>

                        <div class="email">
                          ${escapeHtml(u.email)}
                        </div>

                        ${
                          u.bio
                            ? `
                              <div class="small">
                                ${escapeHtml(u.bio)}
                              </div>
                            `
                            : ""
                        }

                      </div>

                    </div>

                    <div class="actions">

                      <a href="/profile?id=${u.id}">
                        <button>
                          👤 مشاهده پروفایل
                        </button>
                      </a>

                      ${
                        u.id !== user.id
                          ? `
                            <a href="/messages?user=${u.id}">
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

        /* ===================================================
           MESSAGES
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/messages"
        ) {

          const otherId =
            Number(
              url.searchParams.get("user")
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
                [otherId]
              );

            if (!other.rows.length) {
              redirect(
                res,
                "/messages"
              );
              return;
            }

            const blocked =
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
                `,
                [
                  user.id,
                  otherId
                ]
              );

            if (blocked.rows.length) {

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

            /*
             * این کوئری عمداً فقط از m.message استفاده می‌کند.
             * migration بالا ستون message را برای دیتابیس‌های
             * قدیمی هم ایجاد می‌کند.
             */

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

                  LIMIT 200
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

            if (!messages.rows.length) {

              html += `
                <div class="card empty">
                  هنوز پیامی وجود ندارد.
                </div>
              `;

            } else {

              for (const m of messages.rows) {

                const mine =
                  Number(m.sender_id) ===
                  Number(user.id);

                html += `
                  <div class="
                    message-card
                    ${
                      mine
                        ? "message-me"
                        : "message-other"
                    }
                  ">

                    <div class="message-author">
                      ${escapeHtml(m.name)}
                    </div>

                    <div class="post-text">
                      ${escapeHtml(
                        m.message || ""
                      )}
                    </div>

                    <div class="small">
                      ${new Date(
                        m.created_at
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

          /*
           * لیست گفتگوها
           */

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
                  🔎 پیدا کردن کاربر برای پیام
                </button>
              </a>

            </div>
          `;

          if (!contacts.rows.length) {

            html += `
              <div class="card empty">
                هنوز گفتگویی ندارید.
              </div>
            `;

          } else {

            for (const c of contacts.rows) {

              html += `
                <div class="card">

                  <div class="profile-head">

                    <div class="avatar">

                      ${
                        c.avatar_url
                          ? `
                            <img
                              src="${escapeAttr(c.avatar_url)}"
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

                    <a href="/messages?user=${c.id}">
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

        /* ===================================================
           SEND MESSAGE
        =================================================== */

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
            (data.get("message") || "")
              .trim();

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
              [receiverId]
            );

          if (!receiver.rows.length) {

            redirect(
              res,
              "/messages"
            );

            return;
          }

          const blocked =
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
              `,
              [
                user.id,
                receiverId
              ]
            );

          if (blocked.rows.length) {

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

        /* ===================================================
           NOTIFICATIONS
        =================================================== */

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

          if (!notifications.rows.length) {

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
                              src="${escapeAttr(n.actor_avatar)}"
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

        /* ===================================================
           SAVED
        =================================================== */

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
              [user.id]
            );

          let html = `
            <div class="card">

              <h2>
                🔖 پست‌های ذخیره‌شده
              </h2>

            </div>
          `;

          if (!saved.rows.length) {

            html += `
              <div class="card empty">
                هنوز پستی ذخیره نکرده‌اید.
              </div>
            `;

          } else {

            for (
              const p of saved.rows
            ) {

              html += `
                <article class="card">

                  <div class="profile-head">

                    <div class="avatar">

                      ${
                        p.avatar_url
                          ? `
                            <img
                              src="${escapeAttr(p.avatar_url)}"
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
                          src="${escapeAttr(p.image_url)}"
                          alt="تصویر"
                        >
                      `
                      : ""
                  }

                  <div class="actions">

                    <a href="/post?id=${p.id}">
                      <button>
                        مشاهده پست
                      </button>
                    </a>

                    <a href="/bookmark?post=${p.id}">
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

        /* ===================================================
           REPORT GET
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/report"
        ) {

          const postId =
            Number(
              url.searchParams.get("post")
            );

          const reportedUserId =
            Number(
              url.searchParams.get("user")
            );

          if (
            !Number.isInteger(postId) &&
            !Number.isInteger(
              reportedUserId
            )
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

                  <button
                    class="full danger"
                  >
                    ارسال گزارش
                  </button>

                </form>

              </div>
            `,
            user
          );

          return;
        }

        /* ===================================================
           REPORT POST
        =================================================== */

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
            (data.get("reason") || "")
              .trim();

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

        /* ===================================================
           BLOCK
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/block"
        ) {

          const targetId =
            Number(
              url.searchParams.get("user")
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
              [targetId]
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

          if (existing.rows.length) {

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

        /* ===================================================
           JOBS
        =================================================== */

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

                ORDER BY j.created_at DESC

                LIMIT 100
              `
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

          if (!jobs.rows.length) {

            html += `
              <div class="card empty">
                هنوز آگهی کاری ثبت نشده است.
              </div>
            `;

          } else {

            for (
              const j of jobs.rows
            ) {

              html += `
                <div class="card">

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
                    j.user_id === user.id
                      ? `
                        <div class="actions">

                          <a href="/delete-job?id=${j.id}">
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

        /* ===================================================
           NEW JOB
        =================================================== */

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

                  <button class="full">
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

          const data =
            await readBody(req);

          const title =
            (data.get("title") || "")
              .trim();

          const city =
            (data.get("city") || "")
              .trim();

          const salary =
            (data.get("salary") || "")
              .trim();

          const description =
            (data.get("description") || "")
              .trim();

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

        /* ===================================================
           SETTINGS GET
        =================================================== */

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

          const profile =
            r.rows[0] || user;

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
                  enctype="multipart/form-data"
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

                  <label>
                    📷 انتخاب عکس پروفایل
                  </label>

                  <input
                    type="file"
                    name="avatar"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                  >

                  <div class="notice">
                    حداکثر حجم تصویر: ۲ مگابایت
                  </div>

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

        /* ===================================================
           SETTINGS POST
        =================================================== */

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

            if (
              form.files.avatar &&
              form.files.avatar.buffer.length
            ) {

              avatarUrl =
                imageToDataUrl(
                  form.files.avatar
                );
            }

          } else {

            const data =
              await readBody(req);

            name =
              (data.get("name") || "")
                .trim();

            bio =
              (data.get("bio") || "")
                .trim();

            const oldAvatar =
              (data.get("avatar_url") || "")
                .trim();

            if (oldAvatar) {
              avatarUrl = oldAvatar;
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

        /* ===================================================
           DELETE POST
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/delete-post"
        ) {

          const postId =
            Number(
              url.searchParams.get("id")
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

        /* ===================================================
           DELETE JOB
        =================================================== */

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

        /* ===================================================
           404
        =================================================== */

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

        if (!res.headersSent) {

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
   START
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
