const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("STARTUP ERROR: DATABASE_URL تنظیم نشده است.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

/* =========================================================
   CONFIG
========================================================= */

const MAX_BODY = 8 * 1024 * 1024;
const MAX_AVATAR = 2 * 1024 * 1024;
const MAX_POST = 10000;
const MAX_MESSAGE = 5000;
const MAX_COMMENT = 2000;
const MAX_JOB = 5000;
const SESSION_DAYS = 30;

const IMAGE_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif"
};

/* =========================================================
   HELPERS
========================================================= */

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
}

function randomToken(size = 32) {
  return crypto.randomBytes(size).toString("hex");
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

function safeInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function trimText(value, max) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index < 0) {
      continue;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

function cookieSession(sessionId) {
  return [
    `sessionId=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "Path=/",
    "Max-Age=2592000",
    "SameSite=Lax"
  ].join("; ");
}

function clearSessionCookie() {
  return [
    "sessionId=",
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax"
  ].join("; ");
}

function redirect(res, location, cookie = null) {
  const headers = {
    Location: location,
    "Cache-Control": "no-store"
  };

  if (cookie) {
    headers["Set-Cookie"] = cookie;
  }

  res.writeHead(302, headers);
  res.end();
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let finished = false;

    req.on("data", chunk => {
      if (finished) {
        return;
      }

      body += chunk.toString();

      if (Buffer.byteLength(body, "utf8") > MAX_BODY) {
        finished = true;
        reject(new Error("Request body too large"));

        try {
          req.destroy();
        } catch {}
      }
    });

    req.on("end", () => {
      if (finished) {
        return;
      }

      finished = true;

      try {
        resolve(new URLSearchParams(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", error => {
      if (!finished) {
        finished = true;
        reject(error);
      }
    });
  });
}

function parseContentDisposition(value) {
  const result = {};

  if (!value) {
    return result;
  }

  const parts = value.split(";");

  for (const part of parts) {
    const index = part.indexOf("=");

    if (index < 0) {
      continue;
    }

    const key = part.slice(0, index).trim();
    let val = part.slice(index + 1).trim();

    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }

    result[key] = val;
  }

  return result;
}

async function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

    if (!match) {
      reject(new Error("Multipart boundary missing"));
      return;
    }

    const boundary = match[1] || match[2];
    const chunks = [];
    let total = 0;

    req.on("data", chunk => {
      total += chunk.length;

      if (total > MAX_BODY) {
        reject(new Error("Multipart body too large"));

        try {
          req.destroy();
        } catch {}
        return;
      }

      chunks.push(Buffer.from(chunk));
    });

    req.on("error", reject);

    req.on("end", () => {
      try {
        const buffer = Buffer.concat(chunks);
        const delimiter = Buffer.from(`--${boundary}`);
        const fields = {};
        const files = {};

        let position = 0;

        while (position < buffer.length) {
          const start = buffer.indexOf(delimiter, position);

          if (start < 0) {
            break;
          }

          let partStart = start + delimiter.length;

          if (
            buffer[partStart] === 45 &&
            buffer[partStart + 1] === 45
          ) {
            break;
          }

          if (
            buffer[partStart] === 13 &&
            buffer[partStart + 1] === 10
          ) {
            partStart += 2;
          }

          const next = buffer.indexOf(
            delimiter,
            partStart
          );

          if (next < 0) {
            break;
          }

          let part = buffer.slice(partStart, next);

          if (
            part.length >= 2 &&
            part[part.length - 2] === 13 &&
            part[part.length - 1] === 10
          ) {
            part = part.slice(0, -2);
          }

          const headerEnd = part.indexOf(
            Buffer.from("\r\n\r\n")
          );

          if (headerEnd < 0) {
            position = next;
            continue;
          }

          const headers = part
            .slice(0, headerEnd)
            .toString("utf8");

          const content = part.slice(headerEnd + 4);

          const dispositionLine = headers
            .split(/\r\n/)
            .find(line =>
              line.toLowerCase().startsWith(
                "content-disposition:"
              )
            );

          if (!dispositionLine) {
            position = next;
            continue;
          }

          const disposition = parseContentDisposition(
            dispositionLine.slice(
              dispositionLine.indexOf(":") + 1
            )
          );

          const fieldName = disposition.name;

          if (!fieldName) {
            position = next;
            continue;
          }

          const filename = disposition.filename;

          if (filename) {
            const typeLine = headers
              .split(/\r\n/)
              .find(line =>
                line.toLowerCase().startsWith(
                  "content-type:"
                )
              );

            const mime = typeLine
              ? typeLine
                  .slice(typeLine.indexOf(":") + 1)
                  .trim()
                  .toLowerCase()
              : "";

            files[fieldName] = {
              filename,
              mime,
              buffer: content
            };
          } else {
            fields[fieldName] =
              content.toString("utf8");
          }

          position = next;
        }

        resolve({
          fields,
          files
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function validImage(file) {
  if (!file || !file.buffer) {
    return false;
  }

  if (file.buffer.length > MAX_AVATAR) {
    return false;
  }

  const mime = String(file.mime || "").toLowerCase();

  if (!Object.values(IMAGE_TYPES).includes(mime)) {
    return false;
  }

  const b = file.buffer;

  if (mime === "image/png") {
    return (
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47
    );
  }

  if (mime === "image/jpeg") {
    return (
      b.length >= 3 &&
      b[0] === 0xff &&
      b[1] === 0xd8 &&
      b[2] === 0xff
    );
  }

  if (mime === "image/gif") {
    return (
      b.length >= 6 &&
      b.toString("ascii", 0, 6) === "GIF8"
    );
  }

  if (mime === "image/webp") {
    return (
      b.length >= 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
}

function imageToDataUrl(file) {
  return `data:${file.mime};base64,${file.buffer.toString("base64")}`;
}

function initials(name) {
  const text = String(name || "?").trim();

  if (!text) {
    return "?";
  }

  return escapeHtml(text.charAt(0));
}

function avatarHtml(user, large = false) {
  const size = large ? "70px" : "52px";

  if (user && user.avatar_url) {
    return `
      <div
        class="avatar"
        style="
          width:${size};
          height:${size};
          overflow:hidden;
          padding:0;
        "
      >
        <img
          src="${escapeAttr(user.avatar_url)}"
          alt="پروفایل"
          style="
            width:100%;
            height:100%;
            object-fit:cover;
          "
        >
      </div>
    `;
  }

  return `
    <div
      class="avatar"
      style="
        width:${size};
        height:${size};
      "
    >
      ${initials(user && user.name)}
    </div>
  `;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString(
      "fa-IR"
    );
  } catch {
    return "";
  }
}

/* =========================================================
   DATABASE HELPERS
========================================================= */

async function tableExists(table) {
  const result = await pool.query(
    `
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema='public'
          AND table_name=$1
      ) exists
    `,
    [table]
  );

  return Boolean(result.rows[0]?.exists);
}

async function columnExists(table, column) {
  const result = await pool.query(
    `
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name=$1
          AND column_name=$2
      ) exists
    `,
    [table, column]
  );

  return Boolean(result.rows[0]?.exists);
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
      image_url TEXT,
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
    "TEXT"
  );

  await ensureColumn(
    "posts",
    "created_at",
    "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
  );

  if (
    await columnExists(
      "posts",
      "text"
    )
  ) {
    try {
      await pool.query(`
        UPDATE posts
        SET content=text
        WHERE
          (content IS NULL OR content='')
          AND text IS NOT NULL
      `);
    } catch (error) {
      console.error(
        "POST TEXT MIGRATION:",
        error.message
      );
    }
  }

  await pool.query(`
    UPDATE posts
    SET content=''
    WHERE content IS NULL
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

  if (
    await tableExists(
      "saved_posts"
    )
  ) {
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
    } catch (error) {
      console.error(
        "SAVED POSTS MIGRATION:",
        error.message
      );
    }
  }

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
      UNIQUE(blocker_id,blocked_id)
    )
  `);

  if (
    await tableExists(
      "blocks"
    )
  ) {
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
    } catch (error) {
      console.error(
        "BLOCK MIGRATION:",
        error.message
      );
    }
  }

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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMP NULL
    )
  `);

  await ensureColumn(
    "messages",
    "message",
    "TEXT"
  );

  await ensureColumn(
    "messages",
    "read_at",
    "TIMESTAMP NULL"
  );

  if (
    await columnExists(
      "messages",
      "content"
    )
  ) {
    try {
      await pool.query(`
        UPDATE messages
        SET message=content
        WHERE
          (message IS NULL OR message='')
          AND content IS NOT NULL
      `);
    } catch (error) {
      console.error(
        "MESSAGE CONTENT MIGRATION:",
        error.message
      );
    }
  }

  await pool.query(`
    UPDATE messages
    SET message=''
    WHERE message IS NULL
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

  if (
    await columnExists(
      "notifications",
      "read"
    )
  ) {
    try {
      await pool.query(`
        UPDATE notifications
        SET is_read=read
        WHERE is_read IS NULL
      `);
    } catch {}
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
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      salary TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS call_signals (
      id SERIAL PRIMARY KEY,
      caller_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      call_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      consumed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn(
    "call_signals",
    "consumed",
    "BOOLEAN DEFAULT FALSE"
  );

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_posts_created
    ON posts(created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_messages_pair
    ON messages(sender_id,receiver_id,created_at)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_notifications_user
    ON notifications(user_id,created_at)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_call_signals_receiver
    ON call_signals(receiver_id,call_id,consumed)
  `);

  console.log(
    "DATABASE READY"
  );
}

/* =========================================================
   SESSION
========================================================= */

async function createSession(userId) {
  const sessionId = randomToken(32);

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
  const sessionId =
    parseCookies(req).sessionId;

  if (!sessionId) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.bio,
        u.avatar_url,
        u.created_at
      FROM sessions s
      JOIN users u
        ON u.id=s.user_id
      WHERE
        s.session_id=$1
    `,
    [sessionId]
  );

  return result.rows[0] || null;
}

async function requireUser(
  req,
  res
) {
  const user =
    await getSession(req);

  if (!user) {
    redirect(
      res,
      "/login"
    );
    return null;
  }

  return user;
}

/* =========================================================
   BLOCKS / NOTIFICATIONS
========================================================= */

async function areBlocked(
  a,
  b
) {
  if (!a || !b) {
    return false;
  }

  const result =
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

  return result.rows.length > 0;
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
    userId === actorId
  ) {
    return;
  }

  try {
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
  } catch (error) {
    console.error(
      "NOTIFY ERROR:",
      error.message
    );
  }
}

/* =========================================================
   POST CARD
========================================================= */

function postCard(
  post,
  user,
  showComments = true
) {
  const liked =
    Boolean(post.liked);

  const bookmarked =
    Boolean(post.bookmarked);

  const likeCount =
    Number(post.like_count || 0);

  const commentCount =
    Number(post.comment_count || 0);

  return `
    <article class="card post-card">
      <div class="profile-head">

        <a href="/profile?id=${post.user_id}">
          ${avatarHtml(post)}
        </a>

        <div style="flex:1">

          <a href="/profile?id=${post.user_id}">
            <div class="username">
              ${escapeHtml(post.name)}
            </div>
          </a>

          <div class="email">
            ${escapeHtml(post.email)}
          </div>

          <div class="small">
            ${formatDate(post.created_at)}
          </div>

        </div>
      </div>

      ${
        post.content
          ? `
            <div class="post-text">
              ${escapeHtml(post.content)}
            </div>
          `
          : ""
      }

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
        <span>❤️ ${likeCount}</span>
        <span>💬 ${commentCount}</span>
      </div>

      <div class="actions">

        <a href="/like?post=${post.id}">
          <button class="like">
            ${liked
              ? "💔 برداشتن لایک"
              : "❤️ لایک"}
          </button>
        </a>

        <a href="/post?id=${post.id}">
          <button>
            💬 نظرها
          </button>
        </a>

        <a href="/bookmark?post=${post.id}">
          <button>
            ${
              bookmarked
                ? "🔖 ذخیره‌شده"
                : "🔖 ذخیره"
            }
          </button>
        </a>

        <a href="/report?post=${post.id}">
          <button class="danger">
            🚩 گزارش
          </button>
        </a>

        ${
          Number(post.user_id) ===
          Number(user.id)
            ? `
              <a href="/delete-post?id=${post.id}">
                <button class="danger">
                  🗑️ حذف
                </button>
              </a>
            `
            : ""
        }

      </div>

      ${
        showComments
          ? `
            <div class="divider"></div>

            <form
              method="POST"
              action="/comment"
            >
              <input
                type="hidden"
                name="post_id"
                value="${post.id}"
              >

              <input
                name="comment"
                maxlength="${MAX_COMMENT}"
                placeholder="نظر خود را بنویس..."
                required
              >

              <button class="full">
                💬 ارسال نظر
              </button>
            </form>
          `
          : ""
      }

    </article>
  `;
}

/* =========================================================
   PAGE
========================================================= */

function page(
  title,
  content,
  user
) {
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

        <a href="/calls">
          📞 تماس‌ها
        </a>

        <a href="/saved">
          🔖 ذخیره‌ها
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

  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1.0"
>

<meta
  name="theme-color"
  content="#202124"
>

<title>
  ${escapeHtml(title)}
</title>

<style>

*{
  box-sizing:border-box;
}

html{
  scroll-behavior:smooth;
}

body{
  margin:0;
  background:#eef1f5;
  color:#202124;
  font-family:
    Tahoma,
    Arial,
    sans-serif;
}

.app{
  width:100%;
  max-width:760px;
  min-height:100vh;
  margin:auto;
  background:#fff;
  padding-bottom:${user ? "90px" : "25px"};
}

.header{
  position:sticky;
  top:0;
  z-index:30;
  background:#fff;
  border-bottom:1px solid #e4e7eb;
  padding:13px 15px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}

.logo{
  font-weight:900;
  font-size:18px;
}

.title{
  font-size:16px;
  font-weight:700;
}

.content{
  padding:14px;
}

.card{
  background:#fff;
  border:1px solid #e1e5ea;
  border-radius:18px;
  padding:15px;
  margin-bottom:14px;
  box-shadow:
    0 2px 8px
    rgba(0,0,0,.04);
}

.profile-head{
  display:flex;
  align-items:center;
  gap:11px;
}

.profile-center{
  text-align:center;
}

.avatar{
  width:52px;
  height:52px;
  border-radius:50%;
  background:#202124;
  color:#fff;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:22px;
  font-weight:bold;
  flex:none;
}

.avatar img{
  display:block;
}

.username{
  font-weight:800;
  font-size:16px;
}

.email{
  color:#777;
  font-size:12px;
  margin-top:4px;
  direction:ltr;
  text-align:right;
}

.post-text{
  margin:17px 0;
  line-height:1.9;
  white-space:pre-wrap;
  word-break:break-word;
}

.stats{
  display:flex;
  gap:14px;
  color:#666;
  font-size:13px;
  flex-wrap:wrap;
}

.actions{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
  margin-top:12px;
}

button,
.btn{
  border:0;
  border-radius:11px;
  padding:11px 14px;
  background:#202124;
  color:#fff;
  cursor:pointer;
  font-size:14px;
  text-decoration:none;
  display:inline-block;
}

button:hover,
.btn:hover{
  opacity:.9;
}

.full{
  width:100%;
  margin-top:8px;
  text-align:center;
}

.like{
  background:#e91e63;
}

.follow{
  background:#1976d2;
}

.danger{
  background:#b00020;
}

.green{
  background:#087f23;
}

.secondary{
  background:#6b7280;
}

input,
textarea,
select{
  width:100%;
  padding:12px;
  margin:7px 0;
  border:1px solid #ccd2d9;
  border-radius:11px;
  font-size:16px;
  font-family:
    Tahoma,
    Arial,
    sans-serif;
  background:#fff;
}

textarea{
  min-height:120px;
  resize:vertical;
}

a{
  text-decoration:none;
  color:inherit;
}

.top-actions{
  display:flex;
  gap:7px;
  overflow:auto;
  padding:0 14px 12px;
}

.top-actions a{
  background:#f4f6f8;
  border-radius:10px;
  padding:8px 10px;
  white-space:nowrap;
  font-size:12px;
}

.menu{
  display:grid;
  gap:9px;
}

.menu a{
  display:block;
}

.empty{
  text-align:center;
  color:#777;
  padding:30px 10px;
}

.success{
  color:#087f23;
}

.error{
  color:#b00020;
}

.comment{
  background:#f5f6f8;
  border-radius:12px;
  padding:10px;
  margin-top:8px;
}

.comment-name{
  font-weight:bold;
}

.comment-text{
  margin-top:5px;
  white-space:pre-wrap;
}

.job{
  border:1px solid #e0e4e8;
  border-radius:15px;
  padding:14px;
  margin-bottom:11px;
}

.job-title{
  font-size:18px;
  font-weight:800;
}

.job-city,
.job-salary{
  margin-top:7px;
}

.job-salary{
  color:#087f23;
}

.job-description{
  margin-top:11px;
  line-height:1.8;
  white-space:pre-wrap;
}

.post-image{
  width:100%;
  max-height:520px;
  object-fit:cover;
  border-radius:14px;
  margin-top:10px;
}

.notice{
  padding:10px 12px;
  border-radius:12px;
  background:#fff8e1;
  color:#795548;
  margin-bottom:12px;
}

.small{
  font-size:12px;
  color:#777;
}

.divider{
  height:1px;
  background:#e3e6e9;
  margin:18px 0;
}

.badge{
  display:inline-block;
  background:#eef3ff;
  color:#2455c3;
  border-radius:20px;
  padding:5px 9px;
  font-size:11px;
}

.message-card{
  border:1px solid #e1e5ea;
  border-radius:15px;
  padding:12px;
  margin-bottom:9px;
}

.message-me{
  background:#eef7ff;
}

.message-other{
  background:#f7f7f7;
}

.message-author{
  font-size:12px;
  font-weight:bold;
  margin-bottom:6px;
}

.call-box{
  text-align:center;
}

.video{
  width:100%;
  max-height:430px;
  border-radius:15px;
  background:#111;
  object-fit:cover;
}

.bottom-nav{
  position:fixed;
  bottom:0;
  left:50%;
  transform:translateX(-50%);
  width:100%;
  max-width:760px;
  height:67px;
  background:#fff;
  border-top:1px solid #ddd;
  display:flex;
  justify-content:space-around;
  align-items:center;
  z-index:50;
  box-shadow:
    0 -3px 12px
    rgba(0,0,0,.05);
}

.bottom-nav a{
  text-align:center;
  font-size:11px;
  color:#444;
  min-width:55px;
}

.bottom-nav span{
  display:block;
  font-size:21px;
  margin-bottom:2px;
}

.hero{
  padding:8px 0 14px;
}

.hero h1{
  margin:5px 0 8px;
  font-size:23px;
}

.hero p{
  line-height:1.8;
  color:#666;
}

body.dark{
  background:#111;
  color:#eee;
}

body.dark .app,
body.dark .header,
body.dark .bottom-nav,
body.dark input,
body.dark textarea,
body.dark select{
  background:#181818;
  color:#eee;
}

body.dark .card{
  background:#1d1d1d;
  border-color:#333;
}

body.dark .top-actions a{
  background:#292929;
  color:#eee;
}

body.dark input,
body.dark textarea,
body.dark select{
  border-color:#444;
}

body.dark .comment,
body.dark .job,
body.dark .message-other{
  background:#242424;
  border-color:#3a3a3a;
}

body.dark .email,
body.dark .small,
body.dark .stats{
  color:#aaa;
}

@media(max-width:480px){

  .content{
    padding:10px;
  }

  .card{
    border-radius:15px;
  }

  .actions button,
  .actions .btn{
    padding:10px 11px;
  }

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

function toggleTheme(){

  document.body.classList.toggle(
    "dark"
  );

  localStorage.setItem(
    "dark",
    document.body.classList.contains(
      "dark"
    )
  );

}

if(
  localStorage.getItem("dark")
  ===
  "true"
){
  document.body.classList.add(
    "dark"
  );
}

</script>

</body>

</html>
`;
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
    "Content-Type":
      "text/html; charset=utf-8",
    "Cache-Control":
      "no-store"
  });

  res.end(
    page(
      title,
      content,
      user
    )
  );
}

/* =========================================================
   ROUTER
========================================================= */

const server =
  http.createServer(
    async (
      req,
      res
    ) => {

      try {

        const requestUrl =
          new URL(
            req.url,
            "http://localhost"
          );

        const path =
          requestUrl.pathname;

        let user =
          await getSession(req);

        /* ===================================================
           PUBLIC HOME
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
                    یک شبکه اجتماعی ساده برای
                    انتشار پست، پیام، تماس،
                    کاریابی و ارتباط با کاربران.
                  </p>

                </div>

                <div class="card menu">

                  <a href="/signup">
                    <button class="full green">
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
                      AND b.blocked_id=p.user_id
                    )
                    OR
                    (
                      b.blocker_id=p.user_id
                      AND b.blocked_id=$1
                    )
                )

                ORDER BY
                  p.created_at DESC

                LIMIT 50
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
              <button class="full green">
                ➕ انتشار پست جدید
              </button>
            </a>

            <div class="divider"></div>
          `;

          if (
            !posts.rows.length
          ) {

            html += `
              <div class="card empty">

                هنوز پستی منتشر نشده است.

                <br>

                اولین پست را منتشر کن! 📸

              </div>
            `;

          } else {

            for (
              const post
              of posts.rows
            ) {

              html +=
                postCard(
                  post,
                  user,
                  false
                );

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

          if (user) {
            redirect(
              res,
              "/"
            );
            return;
          }

          sendHtml(
            res,
            200,
            "ثبت‌نام",
            `
              <div class="card">

                <h2>
                  📝 ایجاد حساب
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
                    maxlength="200"
                    placeholder="رمز عبور"
                    required
                  >

                  <button class="full green">
                    ثبت‌نام
                  </button>

                </form>

              </div>

              <a href="/login">
                <button class="full">
                  قبلاً حساب دارم
                </button>
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
            trimText(
              data.get("name"),
              100
            );

          const email =
            trimText(
              data.get("email"),
              200
            ).toLowerCase();

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
                  hashPassword(
                    password
                  )
                ]
              );

            const sessionId =
              await createSession(
                result.rows[0].id
              );

            redirect(
              res,
              "/",
              cookieSession(
                sessionId
              )
            );

          } catch (error) {

            console.error(
              "SIGNUP ERROR:",
              error.message
            );

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    این ایمیل قبلاً ثبت شده
                    یا اطلاعات نامعتبر است.
                  </p>

                  <a href="/signup">
                    <button>
                      بازگشت
                    </button>
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

          if (user) {
            redirect(
              res,
              "/"
            );
            return;
          }

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
            trimText(
              data.get("email"),
              200
            ).toLowerCase();

          const password =
            String(
              data.get("password") || ""
            );

          const result =
            await pool.query(
              `
                SELECT
                  id
                FROM users
                WHERE
                  email=$1
                  AND password=$2
                LIMIT 1
              `,
              [
                email,
                hashPassword(
                  password
                )
              ]
            );

          if (
            !result.rows.length
          ) {

            sendHtml(
              res,
              401,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    ایمیل یا رمز عبور
                    اشتباه است.
                  </p>

                  <a href="/login">
                    <button>
                      تلاش دوباره
                    </button>
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
            cookieSession(
              sessionId
            )
          );

          return;
        }

        /* ===================================================
           AUTH CHECK
        =================================================== */

        if (!user) {

          const publicPaths = [
            "/login",
            "/signup"
          ];

          if (
            !publicPaths.includes(path)
          ) {

            redirect(
              res,
              "/login"
            );

            return;
          }

        }

        if (!user) {
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
                  ➕ انتشار پست
                </h2>

                <form
                  method="POST"
                  action="/new-post"
                  enctype="multipart/form-data"
                >

                  <textarea
                    name="content"
                    maxlength="${MAX_POST}"
                    placeholder="چه خبر؟"
                  ></textarea>

                  <label>
                    🖼️ تصویر
                  </label>

                  <input
                    type="file"
                    name="image"
                    accept="
                      image/jpeg,
                      image/png,
                      image/webp,
                      image/gif
                    "
                  >

                  <div class="notice">
                    حداکثر حجم تصویر:
                    ۲ مگابایت
                  </div>

                  <button class="full green">
                    📢 انتشار
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
          let imageUrl = null;

          if (
            contentType.includes(
              "multipart/form-data"
            )
          ) {

            const form =
              await readMultipart(req);

            content =
              trimText(
                form.fields.content,
                MAX_POST
              );

            const image =
              form.files.image;

            if (
              image &&
              image.buffer &&
              image.buffer.length
            ) {

              if (
                !validImage(image)
              ) {

                sendHtml(
                  res,
                  400,
                  "خطا",
                  `
                    <div class="card">

                      <p class="error">
                        تصویر نامعتبر است
                        یا بیشتر از ۲ مگابایت
                        است.
                      </p>

                    </div>
                  `,
                  user
                );

                return;
              }

              imageUrl =
                imageToDataUrl(
                  image
                );
            }

          } else {

            const data =
              await readBody(req);

            content =
              trimText(
                data.get("content"),
                MAX_POST
              );

          }

          if (
            !content &&
            !imageUrl
          ) {

            sendHtml(
              res,
              400,
              "خطا",
              `
                <div class="card">

                  <p class="error">
                    متن یا تصویر پست
                    لازم است.
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
           POST PAGE
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/post"
        ) {

          const postId =
            safeInt(
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (!postId) {

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

                WHERE p.id=$1
              `,
              [
                postId,
                user.id
              ]
            );

          if (
            !result.rows.length
          ) {

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
              "پست",
              `
                <div class="card">

                  <p class="error">
                    امکان مشاهده این
                    پست وجود ندارد.
                  </p>

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
                  u.id user_id,
                  u.name,
                  u.avatar_url
                FROM comments c
                JOIN users u
                  ON u.id=c.user_id
                WHERE
                  c.post_id=$1
                ORDER BY
                  c.created_at ASC
                LIMIT 200
              `,
              [postId]
            );

          let html =
            postCard(
              post,
              user,
              false
            );

          html += `
            <div class="card">

              <h3>
                💬 نظرات
              </h3>
          `;

          if (
            comments.rows.length
          ) {

            for (
              const comment
              of comments.rows
            ) {

              html += `
                <div class="comment">

                  <div class="profile-head">

                    ${avatarHtml(
                      comment
                    )}

                    <div>

                      <div class="comment-name">
                        ${escapeHtml(
                          comment.name
                        )}
                      </div>

                      <div class="small">
                        ${formatDate(
                          comment.created_at
                        )}
                      </div>

                    </div>

                  </div>

                  <div class="comment-text">
                    ${escapeHtml(
                      comment.comment
                    )}
                  </div>

                  ${
                    Number(
                      comment.user_id
                    ) ===
                    Number(user.id)
                      ? `
                        <div class="actions">
                          <a href="/delete-comment?id=${comment.id}">
                            <button class="danger">
                              🗑️ حذف
                            </button>
                          </a>
                        </div>
                      `
                      : ""
                  }

                </div>
              `;

            }

          } else {

            html += `
              <div class="empty">
                هنوز نظری ثبت نشده است.
              </div>
            `;

          }

          html += `
              <div class="divider"></div>

              <form
                method="POST"
                action="/comment"
              >

                <input
                  type="hidden"
                  name="post_id"
                  value="${postId}"
                >

                <textarea
                  name="comment"
                  maxlength="${MAX_COMMENT}"
                  placeholder="نظر خود را بنویس..."
                  required
                ></textarea>

                <button class="full">
                  💬 ارسال نظر
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

        /* ===================================================
           LIKE
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/like"
        ) {

          const postId =
            safeInt(
              requestUrl.searchParams.get(
                "post"
              )
            );

          if (postId) {

            const postResult =
              await pool.query(
                `
                  SELECT
                    id,
                    user_id
                  FROM posts
                  WHERE id=$1
                `,
                [postId]
              );

            if (
              postResult.rows.length
            ) {

              const post =
                postResult.rows[0];

              if (
                !await areBlocked(
                  user.id,
                  post.user_id
                )
              ) {

                const exists =
                  await pool.query(
                    `
                      SELECT 1
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

                if (
                  exists.rows.length
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
                    post.user_id,
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
            postId
              ? `/post?id=${postId}`
              : "/"
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
            safeInt(
              data.get("post_id")
            );

          const comment =
            trimText(
              data.get("comment"),
              MAX_COMMENT
            );

          if (
            postId &&
            comment
          ) {

            const postResult =
              await pool.query(
                `
                  SELECT
                    id,
                    user_id
                  FROM posts
                  WHERE id=$1
                `,
                [postId]
              );

            if (
              postResult.rows.length &&
              !await areBlocked(
                user.id,
                postResult.rows[0].user_id
              )
            ) {

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
                postResult.rows[0].user_id,
                user.id,
                "comment",
                postId,
                `${user.name} روی پست شما نظر گذاشت.`
              );

            }

          }

          redirect(
            res,
            postId
              ? `/post?id=${postId}`
              : "/"
          );

          return;
        }

        /* ===================================================
           DELETE COMMENT
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/delete-comment"
        ) {

          const id =
            safeInt(
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (id) {

            const result =
              await pool.query(
                `
                  DELETE FROM comments
                  WHERE
                    id=$1
                    AND user_id=$2
                  RETURNING post_id
                `,
                [
                  id,
                  user.id
                ]
              );

            if (
              result.rows.length
            ) {

              redirect(
                res,
                `/post?id=${result.rows[0].post_id}`
              );

              return;
            }

          }

          redirect(
            res,
            "/"
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

          const id =
            safeInt(
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (id) {

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
            "/profile"
          );

          return;
        }

        /* ===================================================
           BOOKMARK
        =================================================== */

        if (
          req.method === "GET" &&
          (
            path === "/bookmark" ||
            path === "/save"
          )
        ) {

          const postId =
            safeInt(
              requestUrl.searchParams.get(
                "post"
              )
            );

          if (postId) {

            const exists =
              await pool.query(
                `
                  SELECT 1
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
              exists.rows.length
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

          redirect(
            res,
            postId
              ? `/post?id=${postId}`
              : "/"
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

          const target =
            safeInt(
              requestUrl.searchParams.get(
                "user"
              ) ||
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (
            target &&
            target !== user.id &&
            !await areBlocked(
              user.id,
              target
            )
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
            target
              ? `/profile?id=${target}`
              : "/"
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

          const target =
            safeInt(
              requestUrl.searchParams.get(
                "user"
              ) ||
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (
            target &&
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
            target
              ? `/profile?id=${target}`
              : "/"
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

          const target =
            safeInt(
              requestUrl.searchParams.get(
                "id"
              )
            ) ||
            user.id;

          const profileResult =
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
              [target]
            );

          if (
            !profileResult.rows.length
          ) {

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

          const profile =
            profileResult.rows[0];

          if (
            target !== user.id &&
            await areBlocked(
              user.id,
              target
            )
          ) {

            sendHtml(
              res,
              403,
              "پروفایل",
              `
                <div class="card">

                  <p class="error">
                    این کاربر مسدود است.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          const followers =
            await pool.query(
              `
                SELECT COUNT(*)
                FROM follows
                WHERE following_id=$1
              `,
              [target]
            );

          const following =
            await pool.query(
              `
                SELECT COUNT(*)
                FROM follows
                WHERE follower_id=$1
              `,
              [target]
            );

          const isFollowing =
            target !== user.id
              ? await pool.query(
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
                )
              : {
                  rows: []
                };

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

                WHERE
                  p.user_id=$1

                ORDER BY
                  p.created_at DESC

                LIMIT 100
              `,
              [
                target,
                user.id
              ]
            );

          let html = `
            <div class="card">

              <div class="profile-center">

                ${avatarHtml(
                  profile,
                  true
                )}

                <div
                  class="username"
                  style="margin-top:8px"
                >
                  ${escapeHtml(
                    profile.name
                  )}
                </div>

                <div class="email">
                  ${escapeHtml(
                    profile.email
                  )}
                </div>

                ${
                  profile.bio
                    ? `
                      <div class="small">
                        ${escapeHtml(
                          profile.bio
                        )}
                      </div>
                    `
                    : ""
                }

              </div>

              <div class="divider"></div>

              <div class="stats">

                <span>
                  👥 دنبال‌کننده:
                  ${followers.rows[0].count}
                </span>

                <span>
                  ➡️ دنبال‌شونده:
                  ${following.rows[0].count}
                </span>

                <span>
                  📝 پست:
                  ${posts.rows.length}
                </span>

              </div>

              ${
                target !== user.id
                  ? `
                    <div class="actions">

                      <a href="/follow?user=${target}">
                        <button class="follow">
                          ${
                            isFollowing.rows.length
                              ? "❌ لغو دنبال"
                              : "➕ دنبال کردن"
                          }
                        </button>
                      </a>

                      <a href="/messages?user=${target}">
                        <button>
                          💬 پیام
                        </button>
                      </a>

                      <a href="/call?user=${target}&mode=audio">
                        <button>
                          📞 تماس
                        </button>
                      </a>

                      <a href="/call?user=${target}&mode=video">
                        <button>
                          📹 ویدیو
                        </button>
                      </a>

                      <a href="/block?user=${target}">
                        <button class="danger">
                          🚫 بلاک
                        </button>
                      </a>

                      <a href="/report?user=${target}">
                        <button class="danger">
                          🚩 گزارش
                        </button>
                      </a>

                    </div>
                  `
                  : `
                    <div class="actions">

                      <a href="/settings">
                        <button>
                          ⚙️ تنظیمات
                        </button>
                      </a>

                    </div>
                  `
              }

            </div>

            <h3>
              📝 پست‌ها
            </h3>
          `;

          if (
            posts.rows.length
          ) {

            for (
              const post
              of posts.rows
            ) {

              html +=
                postCard(
                  post,
                  user,
                  false
                );

            }

          } else {

            html += `
              <div class="card empty">
                هنوز پستی منتشر نشده است.
              </div>
            `;

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
           SEARCH
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/search"
        ) {

          const q =
            trimText(
              requestUrl.searchParams.get(
                "q"
              ),
              255
            );

          let usersHtml = "";
          let postsHtml = "";
          let jobsHtml = "";

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
              users.rows
                .map(
                  item => `
                    <div class="card">

                      <div class="profile-head">

                        <a href="/profile?id=${item.id}">
                          ${avatarHtml(item)}
                        </a>

                        <div>

                          <div class="username">
                            ${escapeHtml(
                              item.name
                            )}
                          </div>

                          <div class="email">
                            ${escapeHtml(
                              item.email
                            )}
                          </div>

                          ${
                            item.bio
                              ? `
                                <div class="small">
                                  ${escapeHtml(
                                    item.bio
                                  )}
                                </div>
                              `
                              : ""
                          }

                        </div>

                      </div>

                      <div class="actions">

                        <a href="/profile?id=${item.id}">
                          <button>
                            👤 پروفایل
                          </button>
                        </a>

                        <a href="/messages?user=${item.id}">
                          <button>
                            💬 پیام
                          </button>
                        </a>

                        <a href="/call?user=${item.id}&mode=audio">
                          <button>
                            📞 تماس
                          </button>
                        </a>

                      </div>

                    </div>
                  `
                )
                .join("");

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

                  ORDER BY
                    p.created_at DESC

                  LIMIT 50
                `,
                [
                  `%${q}%`,
                  user.id
                ]
              );

            postsHtml =
              posts.rows
                .map(
                  item =>
                    postCard(
                      item,
                      user,
                      false
                    )
                )
                .join("");

            const jobs =
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

                  ORDER BY
                    j.created_at DESC

                  LIMIT 50
                `,
                [
                  `%${q}%`,
                  user.id
                ]
              );

            jobsHtml =
              jobs.rows
                .map(
                  job => `
                    <div class="job">

                      <div class="job-title">
                        ${escapeHtml(
                          job.title
                        )}
                      </div>

                      <div class="job-city">
                        📍
                        ${escapeHtml(
                          job.city
                        )}
                      </div>

                      <div class="job-salary">
                        💰
                        ${escapeHtml(
                          job.salary
                        )}
                      </div>

                      <div class="job-description">
                        ${escapeHtml(
                          job.description
                        )}
                      </div>

                      <div class="small">
                        ثبت‌کننده:
                        ${escapeHtml(
                          job.name
                        )}
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
                    value="${escapeAttr(q)}"
                    maxlength="255"
                    placeholder="
                      نام کاربر، پست،
                      شغل یا شهر...
                    "
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

        /* ===================================================
           MESSAGES LIST
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/messages" &&
          requestUrl.searchParams.has(
            "user"
          )
        ) {

          const id =
            safeInt(
              requestUrl.searchParams.get(
                "user"
              )
            );

          if (
            id &&
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

                  AND NOT EXISTS(
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

          if (
            contacts.rows.length
          ) {

            html +=
              contacts.rows
                .map(
                  contact => `
                    <div class="card">

                      <div class="profile-head">

                        <a href="/profile?id=${contact.id}">
                          ${avatarHtml(
                            contact
                          )}
                        </a>

                        <div>

                          <div class="username">

                            ${escapeHtml(
                              contact.name
                            )}

                            ${
                              Number(
                                contact.unread
                              ) > 0
                                ? `
                                  <span class="badge">
                                    ${contact.unread}
                                    جدید
                                  </span>
                                `
                                : ""
                            }

                          </div>

                          <div class="email">
                            ${escapeHtml(
                              contact.email
                            )}
                          </div>

                          <div class="small">
                            ${escapeHtml(
                              contact.last_message ||
                              ""
                            )}
                          </div>

                        </div>

                      </div>

                      <div class="actions">

                        <a href="/chat?id=${contact.id}">
                          <button>
                            💬 باز کردن گفتگو
                          </button>
                        </a>

                        <a href="/call?user=${contact.id}&mode=audio">
                          <button>
                            📞 تماس
                          </button>
                        </a>

                      </div>

                    </div>
                  `
                )
                .join("");

          } else {

            html += `
              <div class="card empty">
                هنوز گفتگویی ندارید.
              </div>
            `;

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
           CHAT
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/chat"
        ) {

          const id =
            safeInt(
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (
            !id ||
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
                  bio,
                  avatar_url
                FROM users
                WHERE id=$1
              `,
              [id]
            );

          if (
            !other.rows.length
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
                    امکان گفتگو با این کاربر
                    وجود ندارد.
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

          const messages =
            await pool.query(
              `
                SELECT
                  m.id,
                  m.sender_id,
                  m.receiver_id,
                  m.message,
                  m.created_at,
                  m.read_at,
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

                ORDER BY
                  m.created_at ASC

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

          if (
            messages.rows.length
          ) {

            html +=
              messages.rows
                .map(
                  message => `
                    <div
                      class="
                        message-card
                        ${
                          Number(
                            message.sender_id
                          ) ===
                          Number(user.id)
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
                        ${formatDate(
                          message.created_at
                        )}
                      </div>

                    </div>
                  `
                )
                .join("");

          } else {

            html += `
              <div class="card empty">
                هنوز پیامی وجود ندارد.
              </div>
            `;

          }

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
                  maxlength="${MAX_MESSAGE}"
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

        /* ===================================================
           SEND MESSAGE
        =================================================== */

        if (
          req.method === "POST" &&
          path === "/chat"
        ) {

          const data =
            await readBody(req);

          const receiver =
            safeInt(
              data.get(
                "receiver_id"
              )
            );

          const message =
            trimText(
              data.get(
                "message"
              ),
              MAX_MESSAGE
            );

          if (
            receiver &&
            receiver !== user.id &&
            message
          ) {

            const result =
              await pool.query(
                `
                  SELECT id
                  FROM users
                  WHERE id=$1
                `,
                [receiver]
              );

            if (
              result.rows.length &&
              !await areBlocked(
                user.id,
                receiver
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
                  receiver,
                  message
                ]
              );

              await notify(
                receiver,
                user.id,
                "message",
                null,
                `${user.name} برای شما پیام فرستاد.`
              );

            }

          }

          redirect(
            res,
            receiver
              ? `/chat?id=${receiver}`
              : "/messages"
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

          const result =
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

                WHERE
                  n.user_id=$1

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

          if (
            result.rows.length
          ) {

            html +=
              result.rows
                .map(
                  item => `
                    <div class="card">

                      <div class="profile-head">

                        ${
                          item.actor_avatar
                            ? `
                              <div class="avatar">
                                <img
                                  src="${escapeAttr(
                                    item.actor_avatar
                                  )}"
                                  alt="پروفایل"
                                  style="
                                    width:100%;
                                    height:100%;
                                    object-fit:cover;
                                    border-radius:50%;
                                  "
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
                              item.actor_name ||
                              "سیستم"
                            )}
                          </div>

                          <div class="small">
                            ${formatDate(
                              item.created_at
                            )}
                          </div>

                        </div>

                      </div>

                      <div class="post-text">
                        ${escapeHtml(
                          item.message
                        )}
                      </div>

                    </div>
                  `
                )
                .join("");

          } else {

            html += `
              <div class="card empty">
                اعلان جدیدی ندارید.
              </div>
            `;

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
          (
            path === "/saved" ||
            path === "/bookmarks"
          )
        ) {

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

                WHERE
                  b.user_id=$1

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
            result.rows.length
              ? result.rows
                  .map(
                    post =>
                      postCard(
                        post,
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

        /* ===================================================
           REPORT GET
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/report"
        ) {

          const postId =
            safeInt(
              requestUrl.searchParams.get(
                "post"
              )
            );

          const reported =
            safeInt(
              requestUrl.searchParams.get(
                "user"
              )
            );

          if (
            !postId &&
            !reported
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
                      postId || ""
                    }"
                  >

                  <input
                    type="hidden"
                    name="reported_user_id"
                    value="${
                      reported || ""
                    }"
                  >

                  <textarea
                    name="reason"
                    maxlength="1000"
                    placeholder="
                      دلیل گزارش را بنویس...
                    "
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
            safeInt(
              data.get("post_id")
            );

          const reported =
            safeInt(
              data.get(
                "reported_user_id"
              )
            );

          const reason =
            trimText(
              data.get("reason"),
              1000
            );

          if (
            !reason ||
            (
              !postId &&
              !reported
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
              reported || null,
              postId || null,
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

        /* ===================================================
           JOBS
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/jobs"
        ) {

          const q =
            trimText(
              requestUrl.searchParams.get(
                "q"
              ),
              255
            );

          const result =
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
                  placeholder="
                    عنوان شغل، شهر یا توضیحات...
                  "
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

          if (
            result.rows.length
          ) {

            html +=
              result.rows
                .map(
                  job => `
                    <div class="job">

                      <div class="job-title">
                        ${escapeHtml(
                          job.title
                        )}
                      </div>

                      <div class="job-city">
                        📍
                        ${escapeHtml(
                          job.city
                        )}
                      </div>

                      <div class="job-salary">
                        💰
                        ${escapeHtml(
                          job.salary
                        )}
                      </div>

                      <div class="job-description">
                        ${escapeHtml(
                          job.description
                        )}
                      </div>

                      <div class="small">
                        ثبت‌کننده:
                        ${escapeHtml(
                          job.name
                        )}
                        ·
                        ${formatDate(
                          job.created_at
                        )}
                      </div>

                      ${
                        Number(
                          job.user_id
                        ) ===
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
                  `
                )
                .join("");

          } else {

            html += `
              <div class="card empty">
                آگهی‌ای پیدا نشد.
              </div>
            `;

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
                    maxlength="${MAX_JOB}"
                    placeholder="
                      توضیحات شغل...
                    "
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

          const data =
            await readBody(req);

          const title =
            trimText(
              data.get("title"),
              200
            );

          const city =
            trimText(
              data.get("city"),
              100
            );

          const salary =
            trimText(
              data.get("salary"),
              200
            );

          const description =
            trimText(
              data.get("description"),
              MAX_JOB
            );

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

        /* ===================================================
           DELETE JOB
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/delete-job"
        ) {

          const id =
            safeInt(
              requestUrl.searchParams.get(
                "id"
              )
            );

          if (id) {

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

        /* ===================================================
           SETTINGS
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
            result.rows[0] ||
            user;

          sendHtml(
            res,
            200,
            "تنظیمات",
            `
              <div class="card">

                <div class="profile-center">

                  ${avatarHtml(
                    profile,
                    true
                  )}

                  <div
                    class="username"
                    style="margin-top:8px"
                  >
                    ${escapeHtml(
                      profile.name
                    )}
                  </div>

                  <div class="email">
                    ${escapeHtml(
                      profile.email
                    )}
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
                    🖼️ عکس پروفایل
                  </label>

                  <input
                    type="file"
                    name="avatar"
                    accept="
                      image/jpeg,
                      image/png,
                      image/webp,
                      image/gif
                    "
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
            user.avatar_url || null;

          if (
            contentType.includes(
              "multipart/form-data"
            )
          ) {

            const form =
              await readMultipart(req);

            name =
              trimText(
                form.fields.name,
                100
              );

            bio =
              trimText(
                form.fields.bio,
                1000
              );

            const avatar =
              form.files.avatar;

            if (
              avatar &&
              avatar.buffer &&
              avatar.buffer.length
            ) {

              if (
                !validImage(
                  avatar
                )
              ) {

                sendHtml(
                  res,
                  400,
                  "خطا",
                  `
                    <div class="card">

                      <p class="error">
                        تصویر نامعتبر است
                        یا بیشتر از ۲ مگابایت
                        است.
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

            const data =
              await readBody(req);

            name =
              trimText(
                data.get("name"),
                100
              );

            bio =
              trimText(
                data.get("bio"),
                1000
              );

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
           DELETE AVATAR
        =================================================== */

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

        /* ===================================================
           PASSWORD
        =================================================== */

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
                    placeholder="
                      تکرار رمز جدید
                    "
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

          const data =
            await readBody(req);

          const old =
            String(
              data.get(
                "old_password"
              ) || ""
            );

          const nw =
            String(
              data.get(
                "new_password"
              ) || ""
            );

          const nw2 =
            String(
              data.get(
                "new_password2"
              ) || ""
            );

          const result =
            await pool.query(
              `
                SELECT password
                FROM users
                WHERE id=$1
              `,
              [user.id]
            );

          if (
            !result.rows.length ||
            hashPassword(old) !==
              result.rows[0].password ||
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
                    یا رمزهای جدید یکسان
                    نیستند.
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

        /* ===================================================
           CALLS HOME
        =================================================== */

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
                  برای تماس، وارد پروفایل
                  کاربر شوید و تماس صوتی
                  یا تصویری را انتخاب کنید.
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
                و مرورگر اجازه دسترسی به
                میکروفن یا دوربین را داشته باشد.
              </div>
            `,
            user
          );

          return;
        }

        /* ===================================================
           CALL PAGE
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/call"
        ) {

          const otherId =
            safeInt(
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
            !otherId ||
            otherId === user.id
          ) {

            redirect(
              res,
              "/calls"
            );

            return;
          }

          const result =
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
            !result.rows.length ||
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
                    امکان تماس با این کاربر
                    وجود ندارد.
                  </p>

                </div>
              `,
              user
            );

            return;
          }

          const callId =
            randomToken(16);

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
                    result.rows[0].name
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
let polling = false;

async function signal(
  type,
  payload
){

  const response =
    await fetch(
      "/call-signal",
      {
        method:"POST",

        headers:{
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

  if(
    !response.ok
  ){
    throw new Error(
      "Signal failed"
    );
  }

}

async function makePeer(){

  pc =
    new RTCPeerConnection({
      iceServers:[
        {
          urls:
            "stun:stun.l.google.com:19302"
        },
        {
          urls:
            "stun:stun1.l.google.com:19302"
        }
      ]
    });

  if(stream){

    stream
      .getTracks()
      .forEach(
        track => {
          pc.addTrack(
            track,
            stream
          );
        }
      );

  }

  pc.ontrack =
    event => {

      if(
        event.streams &&
        event.streams[0]
      ){

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

      if(
        event.candidate
      ){

        signal(
          "ice",
          event.candidate
        ).catch(
          () => {}
        );

      }

    };

}

async function getMedia(){

  stream =
    await navigator
      .mediaDevices
      .getUserMedia({
        audio:true,
        video:
          mode === "video"
      });

  document
    .getElementById(
      "local"
    )
    .srcObject =
    stream;

}

async function startCall(){

  if(pc){
    return;
  }

  try{

    document
      .getElementById(
        "status"
      )
      .textContent =
      "درخواست دسترسی به میکروفن و دوربین...";

    await getMedia();

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
      .getElementById(
        "status"
      )
      .textContent =
      "در انتظار پاسخ...";

    poll();

  }catch(error){

    document
      .getElementById(
        "status"
      )
      .textContent =
      "دسترسی به میکروفن یا دوربین ممکن نیست.";

  }

}

async function acceptOffer(
  offer
){

  try{

    await getMedia();

    await makePeer();

    await pc.setRemoteDescription(
      new RTCSessionDescription(
        offer
      )
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
      .getElementById(
        "status"
      )
      .textContent =
      "تماس برقرار است.";

  }catch(error){

    document
      .getElementById(
        "status"
      )
      .textContent =
      "برقراری تماس ممکن نشد.";

  }

}

async function poll(){

  if(
    closed ||
    polling
  ){
    return;
  }

  polling = true;

  try{

    const response =
      await fetch(
        "/call-signals?call_id=" +
        encodeURIComponent(
          callId
        ),
        {
          cache:"no-store"
        }
      );

    if(
      response.ok
    ){

      const signals =
        await response.json();

      for(
        const item
        of signals
      ){

        let payload = {};

        try{
          payload =
            JSON.parse(
              item.payload ||
              "{}"
            );
        }catch{}

        if(
          item.type === "offer"
        ){

          if(!pc){

            await acceptOffer(
              payload
            );

          }

        }else if(
          item.type === "answer"
        ){

          if(pc){

            await pc.setRemoteDescription(
              new RTCSessionDescription(
                payload
              )
            );

            document
              .getElementById(
                "status"
              )
              .textContent =
              "تماس برقرار است.";

          }

        }else if(
          item.type === "ice"
        ){

          if(pc){

            try{

              await pc.addIceCandidate(
                new RTCIceCandidate(
                  payload
                )
              );

            }catch{}

          }

        }

      }

    }

  }catch(error){

  }finally{

    polling = false;

    if(!closed){

      setTimeout(
        poll,
        1000
      );

    }

  }

}

function hangup(){

  closed = true;

  if(stream){

    stream
      .getTracks()
      .forEach(
        track => {
          try{
            track.stop();
          }catch{}
        }
      );

  }

  if(pc){

    try{
      pc.close();
    }catch{}

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

        /* ===================================================
           CALL SIGNAL
        =================================================== */

        if (
          req.method === "POST" &&
          path === "/call-signal"
        ) {

          const data =
            await readBody(req);

          const receiver =
            safeInt(
              data.get(
                "receiver_id"
              )
            );

          const callId =
            trimText(
              data.get("call_id"),
              100
            );

          const type =
            trimText(
              data.get("type"),
              20
            );

          const payload =
            String(
              data.get("payload") ||
              ""
            );

          if (
            !receiver ||
            receiver === user.id ||
            !callId ||
            !type ||
            payload.length >
              500000
          ) {

            json(
              res,
              400,
              {
                ok:false
              }
            );

            return;
          }

          if (
            await areBlocked(
              user.id,
              receiver
            )
          ) {

            json(
              res,
              403,
              {
                ok:false
              }
            );

            return;
          }

          const receiverExists =
            await pool.query(
              `
                SELECT id
                FROM users
                WHERE id=$1
              `,
              [receiver]
            );

          if (
            !receiverExists.rows.length
          ) {

            json(
              res,
              404,
              {
                ok:false
              }
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

          json(
            res,
            200,
            {
              ok:true
            }
          );

          return;
        }

        /* ===================================================
           CALL SIGNALS
        =================================================== */

        if (
          req.method === "GET" &&
          path === "/call-signals"
        ) {

          const callId =
            trimText(
              requestUrl.searchParams.get(
                "call_id"
              ),
              100
            );

          if (!callId) {

            json(
              res,
              400,
              []
            );

            return;
          }

          const result =
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

                ORDER BY
                  id ASC

                LIMIT 50
              `,
              [
                user.id,
                callId
              ]
            );

          if (
            result.rows.length
          ) {

            await pool.query(
              `
                UPDATE call_signals
                SET consumed=TRUE
                WHERE id=ANY($1::int[])
              `,
              [
                result.rows.map(
                  item =>
                    item.id
                )
              ]
            );

          }

          json(
            res,
            200,
            result.rows
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

          const sessionId =
            parseCookies(req)
              .sessionId;

          if (sessionId) {

            await pool.query(
              `
                DELETE FROM sessions
                WHERE session_id=$1
              `,
              [sessionId]
            );

          }

          redirect(
            res,
            "/",
            clearSessionCookie()
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

          try{
            res.end();
          }catch{}

        }

      }

    }
  );

/* =========================================================
   START SERVER
========================================================= */

async function startServer(){

  try{

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

  }catch(error){

    console.error(
      "STARTUP ERROR:",
      error
    );

    process.exit(1);

  }

}

/* =========================================================
   SHUTDOWN
========================================================= */

async function shutdown(
  signal
){

  console.log(
    `${signal} received`
  );

  try{

    await pool.end();

  }catch(error){

    console.error(
      "POOL CLOSE ERROR:",
      error
    );

  }

  process.exit(0);

}

process.on(
  "SIGTERM",
  () =>
    shutdown("SIGTERM")
);

process.on(
  "SIGINT",
  () =>
    shutdown("SIGINT")
);

process.on(
  "uncaughtException",
  error => {

    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );

  }
);

process.on(
  "unhandledRejection",
  error => {

    console.error(
      "UNHANDLED REJECTION:",
      error
    );

  }
);

startServer();
