const http = require("http");
const crypto = require("crypto");
const util = require("util");
const { Pool } = require("pg");

const scryptAsync = util.promisify(crypto.scrypt);

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("خطا: DATABASE_URL تنظیم نشده است.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

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
  const raw = req.headers.cookie || "";

  raw.split(";").forEach(part => {
    const index = part.indexOf("=");

    if (index === -1) return;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (key) {
      cookies[key] = decodeURIComponent(value);
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

function sendHtml(res, status, title, body, user = null) {
  const nav = user
    ? `
      <nav class="nav">

        <a href="/">
          🏠 خانه
        </a>

        <a href="/search">
          🔎 جستجو
        </a>

        <a href="/messages">
          💬 پیام‌ها
        </a>

        <a href="/notifications">
          🔔 اعلان‌ها
        </a>

        <a href="/saved">
          🔖 ذخیره‌ها
        </a>

        <a href="/jobs">
          💼 کاریابی
        </a>

        <a href="/profile">
          👤 پروفایل
        </a>

        <a href="/settings">
          ⚙️ تنظیمات
        </a>

        <a href="/logout">
          🚪 خروج
        </a>

      </nav>
    `
    : "";

  const html = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>${escapeHtml(title)} - MySocial</title>

  <style>

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #f3f4f6;
      color: #172033;
      font-family:
        Tahoma,
        Arial,
        sans-serif;
      line-height: 1.8;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .container {
      width: min(900px, calc(100% - 24px));
      margin: 20px auto 50px;
    }

    .top {
      background: #111827;
      color: white;
      padding: 16px;
      border-radius: 18px;
      margin-bottom: 15px;
    }

    .brand {
      font-size: 25px;
      font-weight: 900;
    }

    .brand-small {
      font-size: 13px;
      opacity: .75;
    }

    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }

    .nav a {
      background: #263247;
      padding: 7px 11px;
      border-radius: 10px;
      font-size: 13px;
    }

    .card {
      background: white;
      border-radius: 18px;
      padding: 18px;
      margin: 12px 0;
      box-shadow:
        0 3px 15px rgba(0,0,0,.06);
    }

    .hero {
      background: white;
      border-radius: 20px;
      padding: 28px 20px;
      margin-bottom: 15px;
      text-align: center;
    }

    .hero h1 {
      margin-top: 0;
    }

    input,
    textarea,
    select {
      width: 100%;
      border: 1px solid #d6dbe5;
      border-radius: 12px;
      padding: 12px;
      margin: 6px 0 12px;
      font: inherit;
      background: white;
    }

    textarea {
      min-height: 130px;
      resize: vertical;
    }

    button {
      border: 0;
      border-radius: 11px;
      padding: 10px 15px;
      cursor: pointer;
      background: #e8edf5;
      color: #111827;
      font: inherit;
      font-weight: 700;
    }

    button:hover {
      opacity: .88;
    }

    .full {
      width: 100%;
      background: #111827;
      color: white;
      margin-top: 5px;
    }

    .danger {
      background: #b42318;
      color: white;
    }

    .follow {
      background: #166534;
      color: white;
    }

    .like {
      background: #fee2e2;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 13px;
    }

    .profile-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #111827;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      font-weight: 900;
      flex-shrink: 0;
    }

    .avatar.large {
      width: 100px;
      height: 100px;
      font-size: 35px;
      margin: auto;
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .username {
      font-weight: 900;
      font-size: 17px;
    }

    .email {
      color: #64748b;
      font-size: 13px;
      direction: ltr;
      text-align: right;
    }

    .small {
      color: #64748b;
      font-size: 12px;
    }

    .post-text {
      white-space: pre-wrap;
      word-break: break-word;
      margin-top: 15px;
    }

    .post-image {
      width: 100%;
      max-height: 650px;
      object-fit: contain;
      border-radius: 14px;
      margin-top: 15px;
      background: #f1f5f9;
    }

    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin-top: 15px;
      color: #475569;
      font-size: 14px;
    }

    .divider {
      height: 1px;
      background: #dce1e8;
      margin: 18px 0;
    }

    .empty {
      text-align: center;
      color: #64748b;
    }

    .error {
      color: #b42318;
      font-weight: 700;
    }

    .success {
      color: #15803d;
    }

    .notice {
      background: #f1f5f9;
      border-radius: 10px;
      padding: 10px;
      font-size: 13px;
      margin-bottom: 10px;
    }

    .message-card {
      max-width: 78%;
      padding: 13px;
      margin: 9px 0;
      border-radius: 15px;
    }

    .message-me {
      margin-right: auto;
      background: #dbeafe;
    }

    .message-other {
      margin-left: auto;
      background: #ffffff;
      box-shadow: 0 2px 10px rgba(0,0,0,.06);
    }

    .message-author {
      font-size: 12px;
      font-weight: 900;
    }

    .profile-cover {
      height: 130px;
      border-radius: 15px;
      background:
        linear-gradient(
          135deg,
          #111827,
          #475569
        );
    }

    .profile-avatar-wrap {
      margin-top: -50px;
      position: relative;
    }

    .job-title {
      font-size: 20px;
      font-weight: 900;
    }

    .job-city,
    .job-salary,
    .job-description {
      margin-top: 8px;
    }

    .footer {
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
      margin-top: 30px;
    }

    @media(max-width:600px) {

      .container {
        width: calc(100% - 14px);
        margin-top: 8px;
      }

      .card {
        padding: 14px;
        border-radius: 15px;
      }

      .actions button {
        font-size: 13px;
      }

      .message-card {
        max-width: 90%;
      }

    }

  </style>

</head>

<body>

  <div class="container">

    <div class="top">

      <div class="brand">
        MySocial 🌐
      </div>

      <div class="brand-small">
        شبکه اجتماعی ساده و سریع
      </div>

      ${nav}

    </div>

    ${body}

    <div class="footer">
      MySocial
    </div>

  </div>

</body>
</html>
  `;

  res.writeHead(
    status,
    {
      "Content-Type":
        "text/html; charset=utf-8"
    }
  );

  res.end(html);
}

function readBody(req) {
  return new Promise((resolve, reject) => {

    let body = "";
    let size = 0;

    req.on("data", chunk => {

      size += chunk.length;

      if (size > 2 * 1024 * 1024) {
        reject(
          new Error("Request body too large")
        );
        req.destroy();
        return;
      }

      body += chunk.toString();
    });

    req.on("end", () => {

      try {

        const contentType =
          req.headers["content-type"] || "";

        if (
          contentType.includes(
            "application/x-www-form-urlencoded"
          )
        ) {

          resolve(
            new URLSearchParams(body)
          );

          return;
        }

        resolve(
          new URLSearchParams(body)
        );

      } catch (e) {
        reject(e);
      }

    });

    req.on("error", reject);

  });
}

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
}

function imageToDataUrl(file) {

  if (!file || !file.buffer) {
    return "";
  }

  const mime =
    file.mimeType ||
    "image/jpeg";

  return `data:${mime};base64,${file.buffer.toString("base64")}`;
}

async function readMultipart(req) {

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const buffer =
    Buffer.concat(chunks);

  const contentType =
    req.headers["content-type"] || "";

  const match =
    contentType.match(
      /boundary="?([^";]+)"?/
    );

  if (!match) {
    throw new Error("Multipart boundary missing");
  }

  const boundary =
    Buffer.from("--" + match[1]);

  const fields = {};
  const files = {};

  let start = 0;

  while (true) {

    const index =
      buffer.indexOf(boundary, start);

    if (index === -1) break;

    start =
      index + boundary.length;

    if (
      buffer[start] === 45 &&
      buffer[start + 1] === 45
    ) {
      break;
    }

    if (
      buffer[start] === 13 &&
      buffer[start + 1] === 10
    ) {
      start += 2;
    }

    const next =
      buffer.indexOf(
        boundary,
        start
      );

    if (next === -1) break;

    let part =
      buffer.slice(
        start,
        next
      );

    if (
      part[part.length - 2] === 13 &&
      part[part.length - 1] === 10
    ) {
      part =
        part.slice(
          0,
          part.length - 2
        );
    }

    const separator =
      part.indexOf(
        Buffer.from("\r\n\r\n")
      );

    if (separator === -1) continue;

    const header =
      part
        .slice(0, separator)
        .toString();

    const data =
      part.slice(separator + 4);

    const nameMatch =
      header.match(
        /name="([^"]+)"/i
      );

    if (!nameMatch) continue;

    const fieldName =
      nameMatch[1];

    const fileMatch =
      header.match(
        /filename="([^"]*)"/i
      );

    if (fileMatch) {

      const filename =
        fileMatch[1];

      const mimeMatch =
        header.match(
          /Content-Type:\s*([^\r\n]+)/i
        );

      files[fieldName] = {
        filename,
        mimeType:
          mimeMatch
            ? mimeMatch[1].trim()
            : "application/octet-stream",
        buffer: data
      };

    } else {

      fields[fieldName] =
        data.toString("utf8");

    }

    start = next;
  }

  return {
    fields,
    files
  };
}

/* =========================================================
   DATABASE HELPERS
========================================================= */

async function ensureColumn(
  table,
  column,
  definition
) {

  await pool.query(`
    ALTER TABLE ${table}
    ADD COLUMN IF NOT EXISTS
    ${column} ${definition}
  `);

}

async function createTables() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(200) NOT NULL UNIQUE,
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
      session_id VARCHAR(128) PRIMARY KEY,
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
      image_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn(
    "posts",
    "image_url",
    "TEXT"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower_id, following_id)
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
    CREATE TABLE IF NOT EXISTS saved_posts (
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocks (
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
      message TEXT NOT NULL DEFAULT '',
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn(
    "notifications",
    "message",
    "TEXT DEFAULT ''"
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
    SET DEFAULT ''
  `);

  await pool.query(`
    ALTER TABLE notifications
    ALTER COLUMN message
    SET NOT NULL
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
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      city VARCHAR(100) NOT NULL,
      salary VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {

    await pool.query(`
      INSERT INTO bookmarks(
        user_id,
        post_id
      )
      SELECT
        user_id,
        post_id
      FROM saved_posts
      ON CONFLICT DO NOTHING
    `);

  } catch (e) {

    console.log(
      "Legacy saved_posts migration skipped."
    );

  }

  try {

    await pool.query(`
      INSERT INTO blocked_users(
        blocker_id,
        blocked_id
      )
      SELECT
        blocker_id,
        blocked_id
      FROM blocks
      ON CONFLICT DO NOTHING
    `);

  } catch (e) {

    console.log(
      "Legacy blocks migration skipped."
    );

  }

  console.log(
    "Database tables checked successfully."
  );
}

/* =========================================================
   SESSION
========================================================= */

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
      [sid]
    );

  return result.rows[0] || null;
}

/* =========================================================
   NOTIFICATIONS
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
      actorId || null,
      type,
      postId || null,
      message
    ]
  );
}

async function areBlocked(
  userA,
  userB
) {

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
   SERVER
========================================================= */

const server =
  http.createServer(
    async (req, res) => {

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

        /* ===================================================
           HOME
        =================================================== */

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
                    پست منتشر کن، کاربران را پیدا کن،
                    پیام بده، دنبال کن و آگهی کاری ببین.
                  </p>

                </div>

                <div class="card">

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
                          src="${escapeAttr(
                            user.avatar_url
                          )}"
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

                    <a href="/profile?id=${p.user_id}">

                      <div class="avatar">

                        ${
                          p.avatar_url
                            ? `
                              <img
                                src="${escapeAttr(
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
                          src="${escapeAttr(
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

                    <a href="/report?post=${p.id}&user=${p.user_id}">
                      <button class="danger">
                        🚩 گزارش
                      </button>
                    </a>

                    ${
                      Number(p.user_id) === Number(user.id)
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
           SIGNUP
        =================================================== */

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

          const data =
            await readBody(req);

          const name =
            String(
              data.get("name") || ""
            ).trim();

          const email =
            String(
              data.get("email") || ""
            ).trim()
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

          } catch (error) {

            console.error(
              "SIGNUP ERROR:",
              error
            );

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    این ایمیل قبلاً ثبت شده است
                    یا اطلاعات واردشده معتبر نیست.
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

        /* ===================================================
           LOGIN
        =================================================== */

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
            `
          );

          return;
        }

        if (
          req.method === "POST" &&
          path === "/login"
        ) {

          const data =
            await readBody(req);

          const email =
            String(
              data.get("email") || ""
            ).trim()
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
                  email,
                  bio,
                  avatar_url
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

          const sid =
            await createSession(
              result.rows[0].id
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

        /* ===================================================
           AUTH
        =================================================== */

        if (!user) {

          if (
            req.method === "GET" &&
            path === "/logout"
          ) {

            redirect(res, "/");

          } else {

            redirect(res, "/login");

          }

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
            "انتشار پست",
            `
              <div class="card">

                <h2>
                  ➕ انتشار پست
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
                    maxlength="2000"
                    placeholder="لینک تصویر، اختیاری"
                  >

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

        /* ===================================================
           LIKE
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/like"
        ) {

          const postId =
            Number(
              requestUrl.searchParams.get("post")
            );

          if (Number.isInteger(postId)) {

            const post =
              await pool.query(
                `
                  SELECT user_id
                  FROM posts
                  WHERE id=$1
                `,
                [postId]
              );

            if (post.rows.length) {

              const blocked =
                await areBlocked(
                  user.id,
                  post.rows[0].user_id
                );

              if (!blocked) {

                const existing =
                  await pool.query(
                    `
                      SELECT id
                      FROM likes
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
              requestUrl.searchParams.get("post")
            );

          if (Number.isInteger(postId)) {

            const post =
              await pool.query(
                `
                  SELECT user_id
                  FROM posts
                  WHERE id=$1
                `,
                [postId]
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

          }

          redirect(
            res,
            requestUrl.searchParams.get("from") === "saved"
              ? "/saved"
              : "/"
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
              requestUrl.searchParams.get("id")
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
                  این پست وجود ندارد یا حذف شده است.
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
                  Number(post.user_id) === Number(user.id)
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
                                src="${escapeAttr(
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

        /* ===================================================
           PROFILE
        =================================================== */

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
              [profileId]
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

              <div style="text-align:center;margin-top:10px">

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
                          src="${escapeAttr(
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
              requestUrl.searchParams.get("user")
            );

          if (
            !Number.isInteger(targetId) ||
            targetId === user.id
          ) {

            redirect(res, "/");
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
            String(
              requestUrl.searchParams.get("q") || ""
            ).trim();

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

                      <a href="/profile?id=${u.id}">

                        <div class="avatar">

                          ${
                            u.avatar_url
                              ? `
                                <img
                                  src="${escapeAttr(
                                    u.avatar_url
                                  )}"
                                  alt="تصویر"
                                >
                              `
                              : escapeHtml(
                                  u.name.charAt(0)
                                )
                          }

                        </div>

                      </a>

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
                          👤 پروفایل
                        </button>
                      </a>

                      ${
                        Number(u.id) !== Number(user.id)
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
                [otherId]
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
                        m.message
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
                  🔎 پیدا کردن کاربر
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
                              src="${escapeAttr(
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
              [receiverId]
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

            for (const n of notifications.rows) {

              html += `
                <div class="card">

                  <div class="profile-head">

                    <div class="avatar">

                      ${
                        n.actor_avatar
                          ? `
                            <img
                              src="${escapeAttr(
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

            for (const p of saved.rows) {

              html += `
                <article class="card">

                  <div class="profile-head">

                    <div class="avatar">

                      ${
                        p.avatar_url
                          ? `
                            <img
                              src="${escapeAttr(
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
                          src="${escapeAttr(
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
                        مشاهده پست
                      </button>
                    </a>

                    <a href="/bookmark?post=${p.id}&from=saved">
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
                      Number.isInteger(reportedUserId)
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

        /* ===================================================
           BLOCK
        =================================================== */

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

            for (const j of jobs.rows) {

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
                    Number(j.user_id) === Number(user.id)
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

        /* ===================================================
           SETTINGS GET
        =================================================== */

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
              [user.id]
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

                <div style="
                  display:flex;
                  justify-content:center;
                  margin-bottom:15px;
                ">

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

            const avatar =
              form.files.avatar;

            if (
              avatar &&
              avatar.buffer &&
              avatar.buffer.length
            ) {

              if (
                avatar.buffer.length >
                2 * 1024 * 1024
              ) {

                sendHtml(
                  res,
                  400,
                  "خطا",
                  `
                    <div class="card">
                      <p class="error">
                        حجم تصویر بیشتر از ۲ مگابایت است.
                      </p>
                    </div>
                  `,
                  user
                );

                return;
              }

              const allowed =
                [
                  "image/jpeg",
                  "image/png",
                  "image/webp",
                  "image/gif"
                ];

              if (
                allowed.includes(
                  avatar.mimeType
                )
              ) {

                avatarUrl =
                  imageToDataUrl(
                    avatar
                  );

              }

            }

          } else {

            const data =
              await readBody(req);

            name =
              String(
                data.get("name") || ""
              ).trim();

            bio =
              String(
                data.get("bio") || ""
              ).trim();

            const oldAvatar =
              String(
                data.get("avatar_url") || ""
              ).trim();

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
              requestUrl.searchParams.get("id")
            );

          if (Number.isInteger(postId)) {

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
              requestUrl.searchParams.get("id")
            );

          if (Number.isInteger(jobId)) {

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
           LOGOUT
        =================================================== */

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

          res.writeHead(
            302,
            {
              "Set-Cookie":
                "sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax",
              Location: "/"
            }
          );

          res.end();

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
