const http = require("http");
const url = require("url");
const crypto = require("crypto");
const util = require("util");
const { Pool } = require("pg");

const scryptAsync = util.promisify(crypto.scrypt);

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on("error", (err) => {
  console.error("POSTGRES POOL ERROR:", err);
});

function escapeHtml(value) {
  if (value == null) return "";

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function safeUrl(value) {
  if (!value || typeof value !== "string") return "";

  const v = value.trim();

  if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(v)) {
    return v;
  }

  if (/^https?:\/\//i.test(v)) {
    return v;
  }

  if (/^\//.test(v)) {
    return v;
  }

  return "";
}

function parseId(value) {
  const n = Number(value);

  if (!Number.isInteger(n) || n <= 0) {
    return null;
  }

  return n;
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";

  for (const item of header.split(";")) {
    const index = item.indexOf("=");

    if (index < 0) continue;

    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

function makeSessionCookie(token) {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.RENDER === "true";

  return [
    `session_token=${encodeURIComponent(token)}`,
    "Path=/",
    "Max-Age=2592000",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

function clearSessionCookie() {
  return [
    "session_token=",
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax"
  ].join("; ");
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

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let finished = false;

    req.on("data", (chunk) => {
      if (finished) return;

      data += chunk.toString();

      if (Buffer.byteLength(data, "utf8") > 5 * 1024 * 1024) {
        finished = true;
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (finished) return;

      try {
        const params = new URLSearchParams(data);
        const result = {};

        for (const [key, value] of params.entries()) {
          result[key] = value;
        }

        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", (error) => {
      if (!finished) {
        reject(error);
      }
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");

  const derived = await scryptAsync(
    String(password),
    salt,
    64
  );

  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string") {
    return false;
  }

  if (storedHash.startsWith("scrypt$")) {
    const parts = storedHash.split("$");

    if (parts.length !== 3) {
      return false;
    }

    try {
      const salt = parts[1];
      const expected = Buffer.from(parts[2], "hex");

      const actual = await scryptAsync(
        String(password),
        salt,
        64
      );

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

  const legacy = crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");

  return legacy === storedHash;
}

function avatar(name, image, size = 48) {
  const safeImage = safeUrl(image);
  const s = Number(size) || 48;

  if (safeImage) {
    return `
      <img
        src="${escapeAttr(safeImage)}"
        alt="پروفایل"
        style="
          width:${s}px;
          height:${s}px;
          border-radius:50%;
          object-fit:cover;
          display:block;
        "
      >
    `;
  }

  const letter = String(name || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return `
    <div
      style="
        width:${s}px;
        height:${s}px;
        border-radius:50%;
        background:#2563eb;
        color:white;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight:bold;
        font-size:${Math.max(16, s / 2)}px;
      "
    >
      ${escapeHtml(letter)}
    </div>
  `;
}

async function getUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.session_token;

  if (!token) {
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
        u.theme
      FROM sessions s
      JOIN users u
        ON u.id = s.user_id
      WHERE s.token = $1
      LIMIT 1
    `,
    [token]
  );

  return result.rows[0] || null;
}

/*
 * دیتابیس
 * این قسمت عمداً فقط CREATE TABLE نیست.
 * برای دیتابیس‌های قدیمی، ستون‌های گمشده نیز اضافه می‌شوند.
 */
async function initDatabase() {
  console.log("DATABASE: checking tables...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      theme VARCHAR(20) DEFAULT 'light',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(128) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT DEFAULT '',
      media_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, post_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(follower_id, following_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /*
   * اصلاح دیتابیس‌های قبلی
   */
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'light',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS token VARCHAR(128);
  `);

  await pool.query(`
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE posts
      ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS media_url TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE likes
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE follows
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  /*
   * این دقیقاً جلوی خطای قبلی messages.content را می‌گیرد.
   */
  await pool.query(`
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  /*
   * اگر جدول messages قدیمی بوده و content مقدار NULL دارد،
   * آن را خالی می‌کنیم تا NOT NULL مشکلی ایجاد نکند.
   */
  await pool.query(`
    UPDATE messages
    SET content = ''
    WHERE content IS NULL;
  `);

  /*
   * مقدارهای NULL در ستون‌های اصلی را اصلاح می‌کنیم.
   */
  await pool.query(`
    UPDATE users
    SET bio = ''
    WHERE bio IS NULL;

    UPDATE users
    SET avatar_url = ''
    WHERE avatar_url IS NULL;

    UPDATE users
    SET theme = 'light'
    WHERE theme IS NULL;
  `);

  /*
   * ساخت Sessionهای جدید بدون وابستگی به ساختار قدیمی.
   */
  const sessionColumns = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='sessions'
  `);

  const sessionColumnNames =
    sessionColumns.rows.map(
      (row) => row.column_name
    );

  if (
    sessionColumnNames.includes("token") &&
    sessionColumnNames.includes("user_id")
  ) {
    await pool.query(`
      UPDATE sessions
      SET token = encode(gen_random_bytes(32), 'hex')
      WHERE token IS NULL;
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_unique_idx
      ON sessions(token);
    `);
  }

  await pool.query(`
    CREATE INDEX IF NOT EXISTS posts_created_at_idx
      ON posts(created_at DESC);

    CREATE INDEX IF NOT EXISTS comments_post_id_idx
      ON comments(post_id);

    CREATE INDEX IF NOT EXISTS messages_created_at_idx
      ON messages(created_at DESC);

    CREATE INDEX IF NOT EXISTS follows_follower_idx
      ON follows(follower_id);

    CREATE INDEX IF NOT EXISTS follows_following_idx
      ON follows(following_id);
  `);

  console.log("DATABASE: tables and columns ready.");
}

function page(title, content) {
  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(title)}</title>

<style>
* {
  box-sizing:border-box;
}

body {
  margin:0;
  font-family:Tahoma,Arial,sans-serif;
  background:#f1f5f9;
  color:#0f172a;
}

a {
  color:#2563eb;
  text-decoration:none;
}

.topbar {
  background:#2563eb;
  color:white;
  position:sticky;
  top:0;
  z-index:100;
  box-shadow:0 2px 12px rgba(0,0,0,.12);
}

.topbar-inner {
  max-width:1100px;
  margin:auto;
  padding:12px 15px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}

.logo {
  color:white;
  font-weight:bold;
  font-size:20px;
}

.nav {
  display:flex;
  flex-wrap:wrap;
  gap:6px;
}

.nav a,
.nav button {
  border:0;
  color:white;
  background:rgba(255,255,255,.14);
  border-radius:8px;
  padding:8px 10px;
  font-size:13px;
}

.container {
  width:100%;
  max-width:850px;
  margin:22px auto;
  padding:0 12px;
}

.card {
  background:white;
  border-radius:15px;
  padding:17px;
  margin-bottom:15px;
  box-shadow:0 2px 12px rgba(15,23,42,.07);
}

.auth {
  max-width:430px;
  margin:60px auto;
}

input,
textarea {
  width:100%;
  padding:12px;
  border:1px solid #cbd5e1;
  border-radius:10px;
  margin:6px 0;
  font-family:inherit;
  outline:none;
}

textarea {
  min-height:110px;
  resize:vertical;
}

input:focus,
textarea:focus {
  border-color:#2563eb;
}

button,
.btn {
  border:0;
  border-radius:9px;
  padding:9px 14px;
  background:#e2e8f0;
  color:#0f172a;
  cursor:pointer;
  display:inline-block;
  margin:3px;
  font-family:inherit;
}

.blue {
  background:#2563eb !important;
  color:white !important;
}

.red {
  background:#dc2626 !important;
  color:white !important;
}

.muted {
  color:#64748b;
  font-size:12px;
}

.post-head {
  display:flex;
  justify-content:space-between;
  align-items:center;
}

.post-user {
  display:flex;
  align-items:center;
  gap:9px;
}

.post-content {
  margin:15px 0;
  line-height:2;
  word-break:break-word;
}

.post-media {
  display:block;
  width:100%;
  max-height:650px;
  object-fit:contain;
  border-radius:12px;
  margin:12px auto;
}

.actions {
  border-top:1px solid #e2e8f0;
  padding-top:9px;
}

.comment {
  background:#f8fafc;
  border-radius:10px;
  padding:9px;
  margin-top:7px;
}

.profile-row {
  display:flex;
  align-items:center;
  gap:12px;
}

.stats {
  display:flex;
  gap:25px;
  margin:15px 0;
}

.stat strong {
  display:block;
  font-size:20px;
}

.notice {
  padding:12px;
  border-radius:10px;
  background:#dbeafe;
  color:#1e40af;
  margin-bottom:12px;
}

.notice.error {
  background:#fee2e2;
  color:#991b1b;
}

.empty {
  text-align:center;
  padding:30px;
  color:#64748b;
}

@media(max-width:650px) {
  .topbar-inner {
    flex-direction:column;
    align-items:flex-start;
  }

  .nav {
    width:100%;
  }

  .container {
    margin-top:12px;
  }
}
</style>
</head>

<body>
${content}
</body>
</html>
`;
}

function nav(user) {
  return `
<header class="topbar">

  <div class="topbar-inner">

    <a class="logo" href="/">
      شبکه اجتماعی
    </a>

    <nav class="nav">

      <a href="/">
        🏠 خانه
      </a>

      <a href="/new-post">
        ➕ پست
      </a>

      <a href="/search">
        🔎 جستجو
      </a>

      <a href="/messages">
        💬 پیام‌ها
      </a>

      <a href="/profile">
        👤 پروفایل
      </a>

      <form
        method="post"
        action="/logout"
        style="display:inline"
      >
        <button type="submit">
          🚪 خروج
        </button>
      </form>

    </nav>

  </div>

</header>
`;
}

function sendPage(res, status, title, content) {
  if (res.headersSent) {
    return;
  }

  res.writeHead(status, {
    "Content-Type":
      "text/html; charset=utf-8",
    "Cache-Control":
      "no-store, no-cache, must-revalidate"
  });

  res.end(
    page(
      title,
      content
    )
  );
}

async function renderPost(post, currentUser) {
  const likeResult = await pool.query(
    `
      SELECT 1
      FROM likes
      WHERE user_id=$1
        AND post_id=$2
      LIMIT 1
    `,
    [
      currentUser.id,
      post.id
    ]
  );

  const liked =
    likeResult.rows.length > 0;

  const counts =
    await pool.query(
      `
        SELECT

          (
            SELECT COUNT(*)
            FROM likes
            WHERE post_id=$1
          ) AS likes,

          (
            SELECT COUNT(*)
            FROM comments
            WHERE post_id=$1
          ) AS comments
      `,
      [post.id]
    );

  const likes =
    Number(
      counts.rows[0].likes || 0
    );

  const commentsCount =
    Number(
      counts.rows[0].comments || 0
    );

  const comments =
    await pool.query(
      `
        SELECT
          c.id,
          c.content,
          c.created_at,
          u.id AS user_id,
          u.name,
          u.avatar_url
        FROM comments c
        JOIN users u
          ON u.id=c.user_id
        WHERE c.post_id=$1
        ORDER BY c.created_at ASC
        LIMIT 50
      `,
      [post.id]
    );

  let commentsHtml = "";

  for (const comment of comments.rows) {
    commentsHtml += `
      <div class="comment">

        <div class="profile-row">

          ${avatar(
            comment.name,
            comment.avatar_url,
            35
          )}

          <div>

            <a href="/user?id=${comment.user_id}">
              <strong>
                ${escapeHtml(comment.name)}
              </strong>
            </a>

            <div>
              ${escapeHtml(comment.content)}
            </div>

            <div class="muted">
              ${new Date(
                comment.created_at
              ).toLocaleString("fa-IR")}
            </div>

          </div>

        </div>

      </div>
    `;
  }

  let mediaHtml = "";

  const media =
    safeUrl(post.media_url);

  if (media) {
    mediaHtml = `
      <img
        class="post-media"
        src="${escapeAttr(media)}"
        alt="تصویر پست"
        loading="lazy"
      >
    `;
  }

  const content =
    escapeHtml(post.content || "")
      .replace(/\n/g, "<br>");

  return `
<article class="card">

  <div class="post-head">

    <div class="post-user">

      ${avatar(
        post.name,
        post.avatar_url,
        46
      )}

      <div>

        <a href="/user?id=${post.user_id}">
          <strong>
            ${escapeHtml(post.name)}
          </strong>
        </a>

        <div class="muted">
          ${new Date(
            post.created_at
          ).toLocaleString("fa-IR")}
        </div>

      </div>

    </div>

  </div>

  ${
    content
      ? `
        <div class="post-content">
          ${content}
        </div>
      `
      : ""
  }

  ${mediaHtml}

  <div class="actions">

    <form
      method="post"
      action="/like?id=${post.id}"
      style="display:inline"
    >

      <button
        class="${liked ? "blue" : ""}"
        type="submit"
      >
        ${liked ? "❤️" : "🤍"} ${likes}
      </button>

    </form>

    <a
      class="btn"
      href="/post?id=${post.id}"
    >
      💬 ${commentsCount}
    </a>

    ${
      Number(post.user_id) ===
      Number(currentUser.id)
        ? `
          <form
            method="post"
            action="/delete-post?id=${post.id}"
            style="display:inline"
          >

            <button
              class="red"
              type="submit"
            >
              🗑 حذف
            </button>

          </form>
        `
        : ""
    }

  </div>

  ${
    commentsHtml
      ? `
        <div style="margin-top:12px">
          ${commentsHtml}
        </div>
      `
      : ""
  }

  <form
    method="post"
    action="/comment?id=${post.id}"
    style="margin-top:10px"
  >

    <input
      type="text"
      name="content"
      maxlength="1000"
      placeholder="نظر خود را بنویس..."
      required
    >

    <button
      class="blue"
      type="submit"
    >
      ارسال نظر
    </button>

  </form>

</article>
`;
}

async function handleRequest(req, res) {
  const parsed =
    url.parse(req.url, true);

  const path =
    parsed.pathname;

  const method =
    req.method;

  try {

    /*
     * LOGIN PAGE
     */
    if (
      path === "/login" &&
      method === "GET"
    ) {
      sendPage(
        res,
        200,
        "ورود",
        `
<div class="container auth">

  <div class="card">

    <h1>🔐 ورود</h1>

    <form
      method="post"
      action="/login"
    >

      <input
        type="email"
        name="email"
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

      <button
        class="blue"
        type="submit"
      >
        ورود
      </button>

    </form>

    <p>
      حساب نداری؟
      <a href="/register">
        ثبت‌نام
      </a>
    </p>

  </div>

</div>
`
      );

      return;
    }

    /*
     * LOGIN ACTION
     */
    if (
      path === "/login" &&
      method === "POST"
    ) {
      const body =
        await parseBody(req);

      const email =
        String(body.email || "")
          .trim()
          .toLowerCase();

      const password =
        String(body.password || "");

      if (!email || !password) {
        sendPage(
          res,
          400,
          "خطا",
          `
<div class="container auth">

  <div class="card">

    <div class="notice error">
      ایمیل و رمز عبور را وارد کنید.
    </div>

    <a
      class="btn blue"
      href="/login"
    >
      بازگشت
    </a>

  </div>

</div>
`
        );

        return;
      }

      console.log(
        "LOGIN ATTEMPT:",
        email
      );

      const result =
        await pool.query(
          `
            SELECT
              id,
              name,
              email,
              password,
              bio,
              avatar_url,
              theme
            FROM users
            WHERE LOWER(email)=LOWER($1)
            LIMIT 1
          `,
          [email]
        );

      if (!result.rows.length) {
        console.log(
          "LOGIN FAILED: USER NOT FOUND"
        );

        sendPage(
          res,
          401,
          "ورود ناموفق",
          `
<div class="container auth">

  <div class="card">

    <div class="notice error">
      ایمیل یا رمز عبور اشتباه است.
    </div>

    <a
      class="btn blue"
      href="/login"
    >
      تلاش دوباره
    </a>

  </div>

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
        console.log(
          "LOGIN FAILED: WRONG PASSWORD"
        );

        sendPage(
          res,
          401,
          "ورود ناموفق",
          `
<div class="container auth">

  <div class="card">

    <div class="notice error">
      ایمیل یا رمز عبور اشتباه است.
    </div>

    <a
      class="btn blue"
      href="/login"
    >
      تلاش دوباره
    </a>

  </div>

</div>
`
        );

        return;
      }

      const token =
        crypto.randomBytes(64)
          .toString("hex");

      await pool.query(
        `
          INSERT INTO sessions(
            token,
            user_id
          )
          VALUES($1,$2)
          ON CONFLICT(token)
          DO UPDATE
          SET user_id=EXCLUDED.user_id
        `,
        [
          token,
          account.id
        ]
      );

      console.log(
        "LOGIN SUCCESS:",
        email
      );

      redirect(
        res,
        "/",
        makeSessionCookie(token)
      );

      return;
    }

    /*
     * REGISTER PAGE
     */
    if (
      path === "/register" &&
      method === "GET"
    ) {
      sendPage(
        res,
        200,
        "ثبت نام",
        `
<div class="container auth">

  <div class="card">

    <h1>📝 ثبت‌نام</h1>

    <form
      method="post"
      action="/register"
    >

      <input
        type="text"
        name="name"
        placeholder="نام"
        maxlength="100"
        required
      >

      <input
        type="email"
        name="email"
        placeholder="ایمیل"
        autocomplete="email"
        required
      >

      <input
        type="password"
        name="password"
        placeholder="رمز عبور حداقل ۶ کاراکتر"
        minlength="6"
        autocomplete="new-password"
        required
      >

      <button
        class="blue"
        type="submit"
      >
        ساخت حساب
      </button>

    </form>

    <p>
      حساب داری؟
      <a href="/login">
        ورود
      </a>
    </p>

  </div>

</div>
`
      );

      return;
    }

    /*
     * REGISTER ACTION
     */
    if (
      path === "/register" &&
      method === "POST"
    ) {
      const body =
        await parseBody(req);

      const name =
        String(body.name || "")
          .trim();

      const email =
        String(body.email || "")
          .trim()
          .toLowerCase();

      const password =
        String(body.password || "");

      if (name.length < 2) {
        sendPage(
          res,
          400,
          "خطا",
          "نام وارد شده معتبر نیست."
        );

        return;
      }

      if (password.length < 6) {
        sendPage(
          res,
          400,
          "خطا",
          "رمز عبور باید حداقل ۶ کاراکتر باشد."
        );

        return;
      }

      const existing =
        await pool.query(
          `
            SELECT id
            FROM users
            WHERE LOWER(email)=LOWER($1)
            LIMIT 1
          `,
          [email]
        );

      if (existing.rows.length) {
        sendPage(
          res,
          400,
          "خطا",
          `
<div class="container auth">

  <div class="card">

    <div class="notice error">
      این ایمیل قبلاً ثبت شده است.
    </div>

    <a
      class="btn blue"
      href="/login"
    >
      ورود
    </a>

  </div>

</div>
`
        );

        return;
      }

      const passwordHash =
        await hashPassword(
          password
        );

      const inserted =
        await pool.query(
          `
            INSERT INTO users(
              name,
              email,
              password,
              bio,
              avatar_url,
              theme
            )
            VALUES(
              $1,
              $2,
              $3,
              '',
              '',
              'light'
            )
            RETURNING id
          `,
          [
            name,
            email,
            passwordHash
          ]
        );

      const token =
        crypto.randomBytes(64)
          .toString("hex");

      await pool.query(
        `
          INSERT INTO sessions(
            token,
            user_id
          )
          VALUES($1,$2)
        `,
        [
          token,
          inserted.rows[0].id
        ]
      );

      redirect(
        res,
        "/",
        makeSessionCookie(token)
      );

      return;
    }

    /*
     * LOGOUT
     */
    if (
      path === "/logout" &&
      method === "POST"
    ) {
      const cookies =
        parseCookies(req);

      const token =
        cookies.session_token;

      if (token) {
        await pool.query(
          `
            DELETE FROM sessions
            WHERE token=$1
          `,
          [token]
        );
      }

      redirect(
        res,
        "/login",
        clearSessionCookie()
      );

      return;
    }

    /*
     * احراز هویت تمام مسیرهای بعدی
     */
    const user =
      await getUser(req);

    if (!user) {
      redirect(
        res,
        "/login"
      );

      return;
    }

    /*
     * HOME
     */
    if (
      path === "/" &&
      method === "GET"
    ) {
      const postsResult =
        await pool.query(
          `
            SELECT
              p.id,
              p.user_id,
              p.content,
              p.media_url,
              p.created_at,
              u.name,
              u.avatar_url
            FROM posts p
            JOIN users u
              ON u.id=p.user_id
            ORDER BY p.created_at DESC
            LIMIT 100
          `
        );

      let content =
        nav(user);

      content += `
<main class="container">

  <div class="card">

    <div class="profile-row">

      ${avatar(
        user.name,
        user.avatar_url,
        58
      )}

      <div>

        <h2 style="margin:0">
          خوش آمدی
          ${escapeHtml(user.name)}
          👋
        </h2>

        <div class="muted">
          شبکه اجتماعی فعال است
        </div>

      </div>

    </div>

  </div>

  <div class="card">

    <h2>
      📢 انتشار پست جدید
    </h2>

    <form
      method="post"
      action="/new-post"
    >

      <textarea
        name="content"
        maxlength="5000"
        placeholder="چه چیزی می‌خواهی منتشر کنی؟"
      ></textarea>

      <input
        type="url"
        name="media_url"
        placeholder="لینک تصویر، اختیاری"
      >

      <button
        class="blue"
        type="submit"
      >
        انتشار
      </button>

    </form>

  </div>

  <h1>
    آخرین پست‌ها
  </h1>
`;

      if (!postsResult.rows.length) {
        content += `
<div class="card empty">
  هنوز پستی منتشر نشده است.
  اولین پست را منتشر کنید.
</div>
`;
      } else {
        for (
          const post
          of postsResult.rows
        ) {
          content +=
            await renderPost(
              post,
              user
            );
        }
      }

      content += `
</main>
`;

      sendPage(
        res,
        200,
        "خانه",
        content
      );

      return;
    }

    /*
     * NEW POST PAGE
     */
    if (
      path === "/new-post" &&
      method === "GET"
    ) {
      sendPage(
        res,
        200,
        "پست جدید",
        `
${nav(user)}

<main class="container">

  <div class="card">

    <h1>
      ➕ انتشار پست
    </h1>

    <form
      method="post"
      action="/new-post"
    >

      <textarea
        name="content"
        maxlength="5000"
        placeholder="متن پست..."
      ></textarea>

      <input
        type="url"
        name="media_url"
        placeholder="لینک تصویر، اختیاری"
      >

      <button
        class="blue"
        type="submit"
      >
        انتشار
      </button>

      <a
        class="btn"
        href="/"
      >
        انصراف
      </a>

    </form>

  </div>

</main>
`
      );

      return;
    }

    /*
     * CREATE POST
     */
    if (
      path === "/new-post" &&
      method === "POST"
    ) {
      const body =
        await parseBody(req);

      const content =
        String(body.content || "")
          .trim();

      const media =
        safeUrl(
          body.media_url || ""
        );

      if (!content && !media) {
        redirect(
          res,
          "/new-post"
        );

        return;
      }

      await pool.query(
        `
          INSERT INTO posts(
            user_id,
            content,
            media_url
          )
          VALUES($1,$2,$3)
        `,
        [
          user.id,
          content,
          media
        ]
      );

      redirect(
        res,
        "/"
      );

      return;
    }

    /*
     * LIKE
     */
    if (
      path === "/like" &&
      method === "POST"
    ) {
      const postId =
        parseId(
          parsed.query.id
        );

      if (postId) {
        const existing =
          await pool.query(
            `
              SELECT 1
              FROM likes
              WHERE user_id=$1
                AND post_id=$2
              LIMIT 1
            `,
            [
              user.id,
              postId
            ]
          );

        if (existing.rows.length) {
          await pool.query(
            `
              DELETE FROM likes
              WHERE user_id=$1
                AND post_id=$2
            `,
            [
              user.id,
              postId
            ]
          );
        } else {
          await pool.query(
            `
              INSERT INTO likes(
                user_id,
                post_id
              )
              VALUES($1,$2)
              ON CONFLICT DO NOTHING
            `,
            [
              user.id,
              postId
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

    /*
     * COMMENT
     */
    if (
      path === "/comment" &&
      method === "POST"
    ) {
      const postId =
        parseId(
          parsed.query.id
        );

      const body =
        await parseBody(req);

      const content =
        String(
          body.content || ""
        ).trim();

      if (
        postId &&
        content
      ) {
        await pool.query(
          `
            INSERT INTO comments(
              user_id,
              post_id,
              content
            )
            VALUES($1,$2,$3)
          `,
          [
            user.id,
            postId,
            content
          ]
        );
      }

      redirect(
        res,
        postId
          ? `/post?id=${postId}`
          : "/"
      );

      return;
    }

    /*
     * SINGLE POST
     */
    if (
      path === "/post" &&
      method === "GET"
    ) {
      const postId =
        parseId(
          parsed.query.id
        );

      if (!postId) {
        sendPage(
          res,
          400,
          "خطا",
          "شناسه پست نامعتبر است."
        );

        return;
      }

      const result =
        await pool.query(
          `
            SELECT
              p.*,
              u.name,
              u.avatar_url
            FROM posts p
            JOIN users u
              ON u.id=p.user_id
            WHERE p.id=$1
            LIMIT 1
          `,
          [postId]
        );

      if (!result.rows.length) {
        sendPage(
          res,
          404,
          "خطا",
          "پست پیدا نشد."
        );

        return;
      }

      sendPage(
        res,
        200,
        "پست",
        `
${nav(user)}

<main class="container">

  ${await renderPost(
    result.rows[0],
    user
  )}

</main>
`
      );

      return;
    }

    /*
     * DELETE POST
     */
    if (
      path === "/delete-post" &&
      method === "POST"
    ) {
      const postId =
        parseId(
          parsed.query.id
        );

      if (postId) {
        await pool.query(
          `
            DELETE FROM posts
            WHERE id=$1
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

    /*
     * PROFILE
     */
    if (
      path === "/profile" &&
      method === "GET"
    ) {
      const statsResult =
        await pool.query(
          `
            SELECT

              (
                SELECT COUNT(*)
                FROM posts
                WHERE user_id=$1
              ) AS posts,

              (
                SELECT COUNT(*)
                FROM follows
                WHERE following_id=$1
              ) AS followers,

              (
                SELECT COUNT(*)
                FROM follows
                WHERE follower_id=$1
              ) AS following
          `,
          [user.id]
        );

      const stats =
        statsResult.rows[0];

      sendPage(
        res,
        200,
        "پروفایل",
        `
${nav(user)}

<main class="container">

  <div class="card">

    <div class="profile-row">

      ${avatar(
        user.name,
        user.avatar_url,
        100
      )}

      <div>

        <h1>
          ${escapeHtml(user.name)}
        </h1>

        <div class="muted">
          ${escapeHtml(user.email)}
        </div>

      </div>

    </div>

    <p>
      ${escapeHtml(
        user.bio ||
        "هنوز بیو نوشته نشده است."
      )}
    </p>

    <div class="stats">

      <div class="stat">
        <strong>
          ${stats.posts}
        </strong>
        پست
      </div>

      <div class="stat">
        <strong>
          ${stats.followers}
        </strong>
        دنبال‌کننده
      </div>

      <div class="stat">
        <strong>
          ${stats.following}
        </strong>
        دنبال‌شونده
      </div>

    </div>

    <a
      class="btn blue"
      href="/edit-profile"
    >
      ✏️ ویرایش پروفایل
    </a>

    <a
      class="btn"
      href="/change-password"
    >
      🔐 تغییر رمز
    </a>

  </div>

</main>
`
      );

      return;
    }

    /*
     * EDIT PROFILE PAGE
     */
    if (
      path === "/edit-profile" &&
      method === "GET"
    ) {
      sendPage(
        res,
        200,
        "ویرایش پروفایل",
        `
${nav(user)}

<main class="container">

  <div class="card">

    <h1>
      ✏️ ویرایش پروفایل
    </h1>

    <form
      method="post"
      action="/edit-profile"
    >

      <input
        type="text"
        name="name"
        value="${escapeAttr(user.name)}"
        maxlength="100"
        required
      >

      <textarea
        name="bio"
        maxlength="1000"
        placeholder="بیو"
      >${escapeHtml(
        user.bio || ""
      )}</textarea>

      <input
        type="url"
        name="avatar_url"
        value="${escapeAttr(
          user.avatar_url || ""
        )}"
        placeholder="لینک عکس پروفایل"
      >

      <button
        class="blue"
        type="submit"
      >
        ذخیره تغییرات
      </button>

    </form>

  </div>

</main>
`
      );

      return;
    }

    /*
     * EDIT PROFILE ACTION
     */
    if (
      path === "/edit-profile" &&
      method === "POST"
    ) {
      const body =
        await parseBody(req);

      const name =
        String(body.name || "")
          .trim();

      const bio =
        String(body.bio || "")
          .trim();

      const image =
        safeUrl(
          body.avatar_url || ""
        );

      if (name.length < 2) {
        sendPage(
          res,
          400,
          "خطا",
          `
<div class="container">

  <div class="card">

    <div class="notice error">
      نام معتبر نیست.
    </div>

    <a
      class="btn blue"
      href="/edit-profile"
    >
      بازگشت
    </a>

  </div>

</div>
`
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
          image,
          user.id
        ]
      );

      redirect(
        res,
        "/profile"
      );

      return;
    }

    /*
     * CHANGE PASSWORD PAGE
     */
    if (
      path === "/change-password" &&
      method === "GET"
    ) {
      sendPage(
        res,
        200,
        "تغییر رمز",
        `
${nav(user)}

<main class="container">

  <div class="card">

    <h1>
      🔐 تغییر رمز عبور
    </h1>

    <form
      method="post"
      action="/change-password"
    >

      <input
        type="password"
        name="oldPassword"
        placeholder="رمز فعلی"
        required
      >

      <input
        type="password"
        name="newPassword"
        placeholder="رمز جدید"
        minlength="6"
        required
      >

      <button
        class="blue"
        type="submit"
      >
        تغییر رمز
      </button>

    </form>

  </div>

</main>
`
      );

      return;
    }

    /*
     * CHANGE PASSWORD ACTION
     */
    if (
      path === "/change-password" &&
      method === "POST"
    ) {
      const body =
        await parseBody(req);

      const oldPassword =
        String(
          body.oldPassword || ""
        );

      const newPassword =
        String(
          body.newPassword || ""
        );

      if (newPassword.length < 6) {
        sendPage(
          res,
          400,
          "خطا",
          "رمز جدید باید حداقل ۶ کاراکتر باشد."
        );

        return;
      }

      const result =
        await pool.query(
          `
            SELECT password
            FROM users
            WHERE id=$1
            LIMIT 1
          `,
          [user.id]
        );

      if (
        !result.rows.length ||
        !(await verifyPassword(
          oldPassword,
          result.rows[0].password
        ))
      ) {
        sendPage(
          res,
          401,
          "خطا",
          `
${nav(user)}

<main class="container">

  <div class="card">

    <div class="notice error">
      رمز فعلی اشتباه است.
    </div>

    <a
      class="btn blue"
      href="/change-password"
    >
      بازگشت
    </a>

  </div>

</main>
`
        );

        return;
      }

      const newHash =
        await hashPassword(
          newPassword
        );

      await pool.query(
        `
          UPDATE users
          SET password=$1
          WHERE id=$2
        `,
        [
          newHash,
          user.id
        ]
      );

      redirect(
        res,
        "/profile"
      );

      return;
    }

    /*
     * USER PROFILE
     */
    if (
      path === "/user" &&
      method === "GET"
    ) {
      const targetId =
        parseId(
          parsed.query.id
        );

      if (!targetId) {
        sendPage(
          res,
          400,
          "خطا",
          "شناسه کاربر نامعتبر است."
        );

        return;
      }

      const targetResult =
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
            LIMIT 1
          `,
          [targetId]
        );

      if (!targetResult.rows.length) {
        sendPage(
          res,
          404,
          "خطا",
          "کاربر پیدا نشد."
        );

        return;
      }

      const target =
        targetResult.rows[0];

      const followingResult =
        await pool.query(
          `
            SELECT 1
            FROM follows
            WHERE follower_id=$1
              AND following_id=$2
            LIMIT 1
          `,
          [
            user.id,
            target.id
          ]
        );

      const following =
        followingResult.rows.length > 0;

      const postsResult =
        await pool.query(
          `
            SELECT
              p.*,
              u.name,
              u.avatar_url
            FROM posts p
            JOIN users u
              ON u.id=p.user_id
            WHERE p.user_id=$1
            ORDER BY p.created_at DESC
            LIMIT 50
          `,
          [target.id]
        );

      let content =
        nav(user);

      content += `
<main class="container">

  <div class="card">

    <div class="profile-row">

      ${avatar(
        target.name,
        target.avatar_url,
        90
      )}

      <div>

        <h1>
          ${escapeHtml(
            target.name
          )}
        </h1>

        <div class="muted">
          ${escapeHtml(
            target.email
          )}
        </div>

      </div>

    </div>

    <p>
      ${escapeHtml(
        target.bio ||
        "بیو ندارد."
      )}
    </p>
`;

      if (
        Number(target.id) !==
        Number(user.id)
      ) {
        content += `
<form
  method="post"
  action="/follow?id=${target.id}"
>

  <button
    class="${following ? "" : "blue"}"
    type="submit"
  >
    ${
      following
        ? "✓ دنبال می‌کنید"
        : "👥 دنبال کردن"
    }
  </button>

</form>
`;
      }

      content += `
  </div>

  <h2>
    پست‌های
    ${escapeHtml(
      target.name
    )}
  </h2>
`;

      if (!postsResult.rows.length) {
        content += `
<div class="card empty">
  این کاربر هنوز پستی منتشر نکرده است.
</div>
`;
      }

      for (
        const post
        of postsResult.rows
      ) {
        content +=
          await renderPost(
            post,
            user
          );
      }

      content += `
</main>
`;

      sendPage(
        res,
        200,
        target.name,
        content
      );

      return;
    }

    /*
     * FOLLOW / UNFOLLOW
     */
    if (
      path === "/follow" &&
      method === "POST"
    ) {
      const targetId =
        parseId(
          parsed.query.id
        );

      if (
        targetId &&
        targetId !== user.id
      ) {
        const exists =
          await pool.query(
            `
              SELECT 1
              FROM follows
              WHERE follower_id=$1
                AND following_id=$2
              LIMIT 1
            `,
            [
              user.id,
              targetId
            ]
          );

        if (exists.rows.length) {
          await pool.query(
            `
              DELETE FROM follows
              WHERE follower_id=$1
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
        }
      }

      redirect(
        res,
        targetId
          ? `/user?id=${targetId}`
          : "/"
      );

      return;
    }

    /*
     * SEARCH
     */
    if (
      path === "/search" &&
      method === "GET"
    ) {
      const q =
        String(
          parsed.query.q || ""
        ).trim();

      let results = [];

      if (q) {
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
                name ILIKE $1
                OR email ILIKE $1
              ORDER BY name
              LIMIT 50
            `,
            [`%${q}%`]
          );

        results =
          result.rows;
      }

      let content =
        nav(user);

      content += `
<main class="container">

  <div class="card">

    <h1>
      🔎 جستجوی کاربران
    </h1>

    <form
      method="get"
      action="/search"
    >

      <input
        type="search"
        name="q"
        value="${escapeAttr(q)}"
        placeholder="نام یا ایمیل..."
      >

      <button
        class="blue"
        type="submit"
      >
        جستجو
      </button>

    </form>

  </div>
`;

      if (
        q &&
        !results.length
      ) {
        content += `
<div class="card empty">
  کاربری پیدا نشد.
</div>
`;
      }

      for (
        const item
        of results
      ) {
        content += `
<div class="card">

  <div class="profile-row">

    ${avatar(
      item.name,
      item.avatar_url,
      55
    )}

    <div>

      <a
        href="/user?id=${item.id}"
      >
        <strong>
          ${escapeHtml(
            item.name
          )}
        </strong>
      </a>

      <div class="muted">
        ${escapeHtml(
          item.email
        )}
      </div>

      <div>
        ${escapeHtml(
          item.bio || ""
        )}
      </div>

    </div>

  </div>

</div>
`;
      }

      content += `
</main>
`;

      sendPage(
        res,
        200,
        "جستجو",
        content
      );

      return;
    }

    /*
     * MESSAGE LIST
     */
    if (
      path === "/messages" &&
      method === "GET" &&
      !parsed.query.user
    ) {
      const result =
        await pool.query(
          `
            SELECT DISTINCT ON (
              CASE
                WHEN m.sender_id=$1
                THEN m.receiver_id
                ELSE m.sender_id
              END
            )

              CASE
                WHEN m.sender_id=$1
                THEN m.receiver_id
                ELSE m.sender_id
              END AS other_id,

              m.content,
              m.created_at,

              u.name,
              u.avatar_url

            FROM messages m

            JOIN users u
              ON u.id =
                CASE
                  WHEN m.sender_id=$1
                  THEN m.receiver_id
                  ELSE m.sender_id
                END

            WHERE
              m.sender_id=$1
              OR m.receiver_id=$1

            ORDER BY

              CASE
                WHEN m.sender_id=$1
                THEN m.receiver_id
                ELSE m.sender_id
              END,

              m.created_at DESC
          `,
          [user.id]
        );

      let content =
        nav(user);

      content += `
<main class="container">

  <div class="card">

    <h1>
      💬 پیام‌ها
    </h1>

    <p class="muted">
      برای شروع گفتگو، یک کاربر را از بخش جستجو انتخاب کنید.
    </p>

  </div>
`;

      if (!result.rows.length) {
        content += `
<div class="card empty">
  هنوز پیامی ندارید.
</div>
`;
      }

      for (
        const item
        of result.rows
      ) {
        content += `
<div class="card">

  <a
    href="/messages?user=${item.other_id}"
  >

    <div class="profile-row">

      ${avatar(
        item.name,
        item.avatar_url,
        55
      )}

      <div>

        <strong>
          ${escapeHtml(
            item.name
          )}
        </strong>

        <div>
          ${escapeHtml(
            item.content
          )}
        </div>

        <div class="muted">
          ${new Date(
            item.created_at
          ).toLocaleString("fa-IR")}
        </div>

      </div>

    </div>

  </a>

</div>
`;
      }

      content += `
</main>
`;

      sendPage(
        res,
        200,
        "پیام‌ها",
        content
      );

      return;
    }

    /*
     * CHAT
     */
    if (
      path === "/messages" &&
      method === "GET" &&
      parsed.query.user
    ) {
      const otherId =
        parseId(
          parsed.query.user
        );

      if (
        !otherId ||
        otherId === user.id
      ) {
        redirect(
          res,
          "/messages"
        );

        return;
      }

      const otherResult =
        await pool.query(
          `
            SELECT
              id,
              name,
              avatar_url
            FROM users
            WHERE id=$1
            LIMIT 1
          `,
          [otherId]
        );

      if (!otherResult.rows.length) {
        sendPage(
          res,
          404,
          "خطا",
          "کاربر پیدا نشد."
        );

        return;
      }

      const other =
        otherResult.rows[0];

      const messagesResult =
        await pool.query(
          `
            SELECT
              m.*,
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
            LIMIT 200
          `,
          [
            user.id,
            otherId
          ]
        );

      let content =
        nav(user);

      content += `
<main class="container">

  <div class="card">

    <div class="profile-row">

      ${avatar(
        other.name,
        other.avatar_url,
        55
      )}

      <h2>
        ${escapeHtml(
          other.name
        )}
      </h2>

    </div>

  </div>

  <div class="card">
`;

      for (
        const message
        of messagesResult.rows
      ) {
        const mine =
          Number(
            message.sender_id
          ) ===
          Number(user.id);

        content += `
<div
  style="
    text-align:${mine ? "left" : "right"};
    margin:8px 0;
  "
>

  <span
    style="
      display:inline-block;
      max-width:80%;
      padding:10px 13px;
      border-radius:12px;
      background:${mine ? "#dbeafe" : "#f1f5f9"};
    "
  >

    ${escapeHtml(
      message.content
    )}

    <small class="muted">
      ${new Date(
        message.created_at
      ).toLocaleTimeString(
        "fa-IR",
        {
          hour:"2-digit",
          minute:"2-digit"
        }
      )}
    </small>

  </span>

</div>
`;
      }

      content += `
  </div>

  <div class="card">

    <form
      method="post"
      action="/messages?user=${otherId}"
    >

      <textarea
        name="content"
        maxlength="2000"
        placeholder="پیام..."
        required
      ></textarea>

      <button
        class="blue"
        type="submit"
      >
        ارسال پیام
      </button>

    </form>

  </div>

</main>
`;

      sendPage(
        res,
        200,
        "گفتگو",
        content
      );

      return;
    }

    /*
     * SEND MESSAGE
     */
    if (
      path === "/messages" &&
      method === "POST"
    ) {
      const otherId =
        parseId(
          parsed.query.user
        );

      const body =
        await parseBody(req);

      const content =
        String(
          body.content || ""
        ).trim();

      if (
        otherId &&
        otherId !== user.id &&
        content
      ) {
        const target =
          await pool.query(
            `
              SELECT id
              FROM users
              WHERE id=$1
              LIMIT 1
            `,
            [otherId]
          );

        if (target.rows.length) {
          await pool.query(
            `
              INSERT INTO messages(
                sender_id,
                receiver_id,
                content
              )
              VALUES($1,$2,$3)
            `,
            [
              user.id,
              otherId,
              content
            ]
          );
        }
      }

      redirect(
        res,
        otherId
          ? `/messages?user=${otherId}`
          : "/messages"
      );

      return;
    }

    /*
     * 404
     */
    sendPage(
      res,
      404,
      "صفحه پیدا نشد",
      `
${nav(user)}

<main class="container">

  <div class="card">

    <h1>
      404
    </h1>

    <p>
      صفحه موردنظر پیدا نشد.
    </p>

    <a
      class="btn blue"
      href="/"
    >
      بازگشت به خانه
    </a>

  </div>

</main>
`
    );

  } catch (error) {

    console.error(
      "REQUEST ERROR:",
      error
    );

    if (!res.headersSent) {
      sendPage(
        res,
        500,
        "خطای سرور",
        `
<div class="container">

  <div class="card">

    <h1>
      خطای سرور
    </h1>

    <div class="notice error">
      عملیات انجام نشد.
    </div>

    <a
      class="btn blue"
      href="/"
    >
      بازگشت به خانه
    </a>

  </div>

</div>
`
      );
    } else {
      res.end();
    }
  }
}

async function start() {
  try {

    console.log(
      "Connecting to PostgreSQL..."
    );

    await pool.query(
      "SELECT 1"
    );

    console.log(
      "PostgreSQL connection successful."
    );

    await initDatabase();

    const server =
      http.createServer(
        handleRequest
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

    server.on(
      "error",
      (error) => {
        console.error(
          "SERVER ERROR:",
          error
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
