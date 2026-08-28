const http = require("http");
const url = require("url");
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
  ssl: { rejectUnauthorized: false }
});

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function safeUrl(value) {
  if (!value || typeof value !== "string") return "";

  const s = value.trim();

  if (s.startsWith("data:image/")) return s;

  if (/^https?:\/\//i.test(s)) return s;

  if (s.startsWith("/")) return s;

  return "";
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(String(password), salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;

  if (storedHash.startsWith("scrypt$")) {
    const parts = storedHash.split("$");

    if (parts.length !== 3) return false;

    const salt = parts[1];
    const expected = parts[2];

    const actual = await scryptAsync(String(password), salt, 64);
    const expectedBuffer = Buffer.from(expected, "hex");

    if (actual.length !== expectedBuffer.length) return false;

    return crypto.timingSafeEqual(actual, expectedBuffer);
  }

  const legacy = crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");

  return legacy === storedHash;
}

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseCookies(req) {
  const result = {};

  const header = req.headers.cookie || "";

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    result[key] = decodeURIComponent(value);
  }

  return result;
}

function makeSessionCookie(token, maxAge = 2592000) {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.RENDER === "true";

  return [
    `session_token=${token}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

function clearSessionCookie() {
  return "session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
}

function avatar(name, image, size = 50) {
  const img = safeUrl(image);
  const s = Number(size) || 50;

  if (img) {
    return `
      <img
        src="${escapeAttr(img)}"
        class="avatar"
        style="width:${s}px;height:${s}px;"
        alt="پروفایل"
      >
    `;
  }

  const letter = escapeHtml(
    String(name || "?").trim().charAt(0).toUpperCase()
  );

  return `
    <div
      class="avatar avatar-letter"
      style="width:${s}px;height:${s}px;"
    >${letter}</div>
  `;
}

function postTextHtml(text) {
  if (!text) return "";

  return escapeHtml(text)
    .replace(/\n/g, "<br>")
    .replace(
      /(^|\s)#([\u0600-\u06FF\w]+)/g,
      '$1<a href="/search?q=%23$2">#$2</a>'
    );
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;

      if (data.length > 5 * 1024 * 1024) {
        reject(new Error("حجم درخواست زیاد است."));
        req.destroy();
      }
    });

    req.on("end", () => {
      const params = new URLSearchParams(data);
      const body = {};

      for (const [key, value] of params.entries()) {
        body[key] = value;
      }

      resolve(body);
    });

    req.on("error", reject);
  });
}

async function getUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.session_token;

  if (!token) return null;

  const { rows } = await pool.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.bio,
      u.avatar_url,
      u.theme
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = $1
    `,
    [token]
  );

  return rows[0] || null;
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

function sendHtml(res, status, title, content) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(`
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
  font-family:
    Tahoma,
    Arial,
    sans-serif;
  background: #f1f5f9;
  color: #0f172a;
}

a {
  color: #2563eb;
  text-decoration: none;
}

button,
input,
textarea {
  font-family: inherit;
}

button {
  cursor: pointer;
}

.topbar {
  background: #2563eb;
  color: white;
  position: sticky;
  top: 0;
  z-index: 20;
  box-shadow: 0 2px 10px rgba(0,0,0,.12);
}

.topbar-inner {
  max-width: 1050px;
  margin: auto;
  padding: 13px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.logo {
  color: white;
  font-size: 21px;
  font-weight: bold;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
}

.nav a,
.nav button {
  color: white;
  background: rgba(255,255,255,.14);
  border: 0;
  padding: 8px 11px;
  border-radius: 9px;
  font-size: 13px;
}

.container {
  max-width: 850px;
  margin: 22px auto;
  padding: 0 12px;
}

.card {
  background: white;
  border-radius: 15px;
  padding: 17px;
  margin-bottom: 15px;
  box-shadow: 0 2px 12px rgba(15,23,42,.07);
}

.auth {
  max-width: 430px;
  margin: 60px auto;
}

h1 {
  font-size: 24px;
  margin-top: 5px;
}

h2 {
  font-size: 20px;
}

input,
textarea {
  width: 100%;
  padding: 12px;
  margin: 7px 0;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  outline: none;
  background: white;
}

input:focus,
textarea:focus {
  border-color: #2563eb;
}

textarea {
  min-height: 110px;
  resize: vertical;
}

.btn,
button.btn {
  display: inline-block;
  border: 0;
  border-radius: 9px;
  padding: 9px 14px;
  background: #e2e8f0;
  color: #0f172a;
  margin: 4px;
}

.blue {
  background: #2563eb !important;
  color: white !important;
}

.green {
  background: #16a34a !important;
  color: white !important;
}

.red {
  background: #dc2626 !important;
  color: white !important;
}

.muted {
  color: #64748b;
  font-size: 13px;
}

.avatar {
  border-radius: 50%;
  object-fit: cover;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}

.avatar-letter {
  background: #2563eb;
  color: white;
  font-weight: bold;
}

.profile-row,
.post-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.post-head {
  justify-content: space-between;
}

.post-user {
  display: flex;
  align-items: center;
  gap: 9px;
}

.post-content {
  margin: 15px 0;
  line-height: 1.9;
  word-break: break-word;
}

.post-media {
  max-width: 100%;
  max-height: 600px;
  display: block;
  margin: 12px auto;
  border-radius: 12px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-top: 1px solid #e2e8f0;
  padding-top: 10px;
}

.inline {
  display: inline;
}

.comment {
  background: #f8fafc;
  border-radius: 10px;
  padding: 9px;
  margin-top: 7px;
}

.search-box {
  display: flex;
  gap: 7px;
}

.search-box input {
  margin: 0;
}

.notice {
  padding: 12px;
  border-radius: 10px;
  background: #dbeafe;
  color: #1e40af;
  margin-bottom: 12px;
}

.danger {
  background: #fee2e2;
  color: #991b1b;
}

.stats {
  display: flex;
  gap: 20px;
  margin: 14px 0;
}

.stat strong {
  display: block;
  font-size: 18px;
}

@media (max-width: 600px) {
  .topbar-inner {
    align-items: flex-start;
    flex-direction: column;
  }

  .nav {
    width: 100%;
  }

  .container {
    margin-top: 12px;
  }
}
</style>
</head>

<body>

${content}

</body>
</html>
  `);
}

async function initDatabase() {
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

    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(128) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT DEFAULT '',
      media_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS posts_created_idx
      ON posts(created_at DESC);

    CREATE INDEX IF NOT EXISTS comments_post_idx
      ON comments(post_id);

    CREATE INDEX IF NOT EXISTS messages_users_idx
      ON messages(sender_id, receiver_id, created_at);
  `);
}

function nav(user) {
  return `
  <header class="topbar">
    <div class="topbar-inner">
      <a class="logo" href="/">شبکه اجتماعی</a>

      <nav class="nav">
        <a href="/">🏠 خانه</a>
        <a href="/new-post">➕ پست</a>
        <a href="/search">🔎 جستجو</a>
        <a href="/messages">💬 پیام‌ها</a>
        <a href="/profile">👤 پروفایل</a>

        <form method="post" action="/logout" class="inline">
          <button type="submit">🚪 خروج</button>
        </form>
      </nav>
    </div>
  </header>
  `;
}

async function renderPost(p, user) {
  const { rows: likeRows } = await pool.query(
    "SELECT 1 FROM likes WHERE user_id=$1 AND post_id=$2",
    [user.id, p.id]
  );

  const liked = likeRows.length > 0;

  const { rows: countRows } = await pool.query(
    `
    SELECT
      (SELECT COUNT(*) FROM likes WHERE post_id=$1) AS likes,
      (SELECT COUNT(*) FROM comments WHERE post_id=$1) AS comments
    `,
    [p.id]
  );

  const likes = Number(countRows[0].likes || 0);
  const comments = Number(countRows[0].comments || 0);

  const { rows: commentRows } = await pool.query(
    `
    SELECT c.*, u.name, u.avatar_url
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.post_id=$1
    ORDER BY c.created_at ASC
    LIMIT 30
    `,
    [p.id]
  );

  let commentsHtml = "";

  for (const c of commentRows) {
    commentsHtml += `
      <div class="comment">
        <strong>${escapeHtml(c.name)}</strong>
        <div>${escapeHtml(c.content)}</div>
        <div class="muted">
          ${new Date(c.created_at).toLocaleString("fa-IR")}
        </div>
      </div>
    `;
  }

  let media = "";

  const mediaUrl = safeUrl(p.media_url);

  if (mediaUrl) {
    if (/^data:image\//i.test(mediaUrl) || /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(mediaUrl)) {
      media = `
        <img
          class="post-media"
          src="${escapeAttr(mediaUrl)}"
          alt="تصویر پست"
          loading="lazy"
        >
      `;
    }
  }

  return `
  <article class="card">

    <div class="post-head">
      <div class="post-user">
        ${avatar(p.name, p.avatar_url, 45)}

        <div>
          <a href="/user?id=${p.user_id}">
            <strong>${escapeHtml(p.name)}</strong>
          </a>

          <div class="muted">
            ${new Date(p.created_at).toLocaleString("fa-IR")}
          </div>
        </div>
      </div>
    </div>

    <div class="post-content">
      ${postTextHtml(p.content)}
    </div>

    ${media}

    <div class="actions">

      <form method="post" action="/like?id=${p.id}" class="inline">
        <button class="btn ${liked ? "blue" : ""}">
          ${liked ? "❤️" : "🤍"} ${likes}
        </button>
      </form>

      <a class="btn" href="/post?id=${p.id}">
        💬 ${comments}
      </a>

      ${
        Number(p.user_id) === Number(user.id)
          ? `
            <form method="post" action="/delete-post?id=${p.id}" class="inline">
              <button class="btn red">🗑 حذف</button>
            </form>
          `
          : ""
      }

    </div>

    ${
      comments > 0
        ? `
          <div style="margin-top:12px;">
            ${commentsHtml}
          </div>
        `
        : ""
    }

    <form method="post" action="/comment?id=${p.id}" style="margin-top:10px;">
      <input
        type="text"
        name="content"
        placeholder="نظر خود را بنویس..."
        maxlength="1000"
        required
      >
      <button class="btn blue" type="submit">ارسال نظر</button>
    </form>

  </article>
  `;
}

async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;
  const method = req.method;

  try {

    // صفحه ورود
    if (path === "/login" && method === "GET") {
      sendHtml(
        res,
        200,
        "ورود",
        `
        <div class="container auth">

          <div class="card">
            <h1>🔐 ورود</h1>

            <form method="post" action="/login">
              <input
                type="email"
                name="email"
                placeholder="ایمیل"
                required
              >

              <input
                type="password"
                name="password"
                placeholder="رمز عبور"
                required
              >

              <button class="btn blue" type="submit">
                ورود
              </button>
            </form>

            <p>
              حساب نداری؟
              <a href="/register">ثبت‌نام کن</a>
            </p>
          </div>

        </div>
        `
      );

      return;
    }

    // ورود
    if (path === "/login" && method === "POST") {
      const body = await parseBody(req);

      const email = String(body.email || "")
        .trim()
        .toLowerCase();

      const password = String(body.password || "");

      const { rows } = await pool.query(
        "SELECT * FROM users WHERE email=$1",
        [email]
      );

      if (
        rows.length === 0 ||
        !(await verifyPassword(password, rows[0].password))
      ) {
        sendHtml(
          res,
          401,
          "خطا",
          `
          <div class="container auth">
            <div class="card">
              <div class="notice danger">
                ایمیل یا رمز عبور اشتباه است.
              </div>
              <a class="btn blue" href="/login">بازگشت</a>
            </div>
          </div>
          `
        );

        return;
      }

      const token = crypto.randomBytes(64).toString("hex");

      await pool.query(
        "INSERT INTO sessions(token,user_id) VALUES($1,$2)",
        [token, rows[0].id]
      );

      redirect(res, "/", makeSessionCookie(token));
      return;
    }

    // ثبت نام
    if (path === "/register" && method === "GET") {
      sendHtml(
        res,
        200,
        "ثبت نام",
        `
        <div class="container auth">

          <div class="card">
            <h1>📝 ثبت‌نام</h1>

            <form method="post" action="/register">

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
                required
              >

              <input
                type="password"
                name="password"
                placeholder="رمز عبور حداقل ۶ کاراکتر"
                minlength="6"
                required
              >

              <button class="btn blue" type="submit">
                ساخت حساب
              </button>

            </form>

            <p>
              حساب داری؟
              <a href="/login">ورود</a>
            </p>
          </div>

        </div>
        `
      );

      return;
    }

    if (path === "/register" && method === "POST") {
      const body = await parseBody(req);

      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (name.length < 2) {
        sendHtml(res, 400, "خطا", "نام معتبر نیست.");
        return;
      }

      if (password.length < 6) {
        sendHtml(
          res,
          400,
          "خطا",
          "رمز عبور باید حداقل ۶ کاراکتر باشد."
        );
        return;
      }

      const existing = await pool.query(
        "SELECT id FROM users WHERE email=$1",
        [email]
      );

      if (existing.rows.length > 0) {
        sendHtml(
          res,
          400,
          "خطا",
          `
          <div class="container auth">
            <div class="card">
              <div class="notice danger">
                این ایمیل قبلاً ثبت شده است.
              </div>
              <a href="/login" class="btn blue">ورود</a>
            </div>
          </div>
          `
        );

        return;
      }

      const passwordHash = await hashPassword(password);

      const { rows } = await pool.query(
        `
        INSERT INTO users(name,email,password)
        VALUES($1,$2,$3)
        RETURNING id
        `,
        [name, email, passwordHash]
      );

      const token = crypto.randomBytes(64).toString("hex");

      await pool.query(
        "INSERT INTO sessions(token,user_id) VALUES($1,$2)",
        [token, rows[0].id]
      );

      redirect(res, "/", makeSessionCookie(token));
      return;
    }

    // خروج
    if (path === "/logout" && method === "POST") {
      const cookies = parseCookies(req);
      const token = cookies.session_token;

      if (token) {
        await pool.query(
          "DELETE FROM sessions WHERE token=$1",
          [token]
        );
      }

      redirect(res, "/login", clearSessionCookie());
      return;
    }

    // تمام مسیرهای بعدی نیاز به ورود دارند
    const user = await getUser(req);

    if (!user) {
      redirect(res, "/login");
      return;
    }

    // صفحه اصلی
    if (path === "/" && method === "GET") {
      const { rows: posts } = await pool.query(
        `
        SELECT
          p.*,
          u.name,
          u.avatar_url
        FROM posts p
        JOIN users u ON u.id=p.user_id
        ORDER BY p.created_at DESC
        LIMIT 100
        `
      );

      let html = nav(user);

      html += `
      <main class="container">

        <div class="card">
          <div class="profile-row">
            ${avatar(user.name, user.avatar_url, 55)}

            <div>
              <h2 style="margin:0;">
                خوش آمدی ${escapeHtml(user.name)} 👋
              </h2>

              <div class="muted">
                به شبکه اجتماعی خوش آمدی
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>📢 انتشار پست</h2>

          <form method="post" action="/new-post">
            <textarea
              name="content"
              maxlength="5000"
              placeholder="چه چیزی می‌خواهی منتشر کنی؟"
              required
            ></textarea>

            <input
              type="url"
              name="media_url"
              placeholder="لینک تصویر (اختیاری)"
            >

            <button class="btn blue" type="submit">
              انتشار
            </button>
          </form>
        </div>

        <h1>آخرین پست‌ها</h1>
      `;

      if (posts.length === 0) {
        html += `
          <div class="card">
            هنوز پستی منتشر نشده است.
            اولین پست را تو منتشر کن.
          </div>
        `;
      } else {
        for (const p of posts) {
          html += await renderPost(p, user);
        }
      }

      html += `
      </main>
      `;

      sendHtml(res, 200, "خانه", html);
      return;
    }

    // پست جدید
    if (path === "/new-post" && method === "GET") {
      sendHtml(
        res,
        200,
        "پست جدید",
        `
        ${nav(user)}

        <main class="container">

          <div class="card">
            <h1>➕ پست جدید</h1>

            <form method="post" action="/new-post">

              <textarea
                name="content"
                maxlength="5000"
                placeholder="متن پست..."
                required
              ></textarea>

              <input
                type="url"
                name="media_url"
                placeholder="لینک تصویر اختیاری"
              >

              <button class="btn blue" type="submit">
                انتشار پست
              </button>

              <a href="/" class="btn">
                انصراف
              </a>

            </form>
          </div>

        </main>
        `
      );

      return;
    }

    // ثبت پست
    if (path === "/new-post" && method === "POST") {
      const body = await parseBody(req);

      const content = String(body.content || "").trim();
      const media = safeUrl(body.media_url || "");

      if (!content && !media) {
        redirect(res, "/new-post");
        return;
      }

      await pool.query(
        `
        INSERT INTO posts(user_id,content,media_url)
        VALUES($1,$2,$3)
        `,
        [user.id, content, media]
      );

      redirect(res, "/");
      return;
    }

    // لایک
    if (path === "/like" && method === "POST") {
      const postId = parseId(parsed.query.id);

      if (postId) {
        const existing = await pool.query(
          `
          SELECT 1
          FROM likes
          WHERE user_id=$1 AND post_id=$2
          `,
          [user.id, postId]
        );

        if (existing.rows.length > 0) {
          await pool.query(
            `
            DELETE FROM likes
            WHERE user_id=$1 AND post_id=$2
            `,
            [user.id, postId]
          );
        } else {
          await pool.query(
            `
            INSERT INTO likes(user_id,post_id)
            VALUES($1,$2)
            ON CONFLICT DO NOTHING
            `,
            [user.id, postId]
          );
        }
      }

      redirect(res, "/");
      return;
    }

    // کامنت
    if (path === "/comment" && method === "POST") {
      const postId = parseId(parsed.query.id);
      const body = await parseBody(req);
      const content = String(body.content || "").trim();

      if (postId && content) {
        await pool.query(
          `
          INSERT INTO comments(user_id,post_id,content)
          VALUES($1,$2,$3)
          `,
          [user.id, postId, content]
        );
      }

      redirect(
        res,
        postId ? `/post?id=${postId}` : "/"
      );

      return;
    }

    // نمایش یک پست
    if (path === "/post" && method === "GET") {
      const postId = parseId(parsed.query.id);

      if (!postId) {
        sendHtml(res, 400, "خطا", "شناسه پست نامعتبر است.");
        return;
      }

      const { rows } = await pool.query(
        `
        SELECT
          p.*,
          u.name,
          u.avatar_url
        FROM posts p
        JOIN users u ON u.id=p.user_id
        WHERE p.id=$1
        `,
        [postId]
      );

      if (rows.length === 0) {
        sendHtml(res, 404, "خطا", "پست پیدا نشد.");
        return;
      }

      sendHtml(
        res,
        200,
        "پست",
        `
        ${nav(user)}

        <main class="container">
          ${await renderPost(rows[0], user)}
        </main>
        `
      );

      return;
    }

    // حذف پست
    if (path === "/delete-post" && method === "POST") {
      const postId = parseId(parsed.query.id);

      if (postId) {
        await pool.query(
          `
          DELETE FROM posts
          WHERE id=$1 AND user_id=$2
          `,
          [postId, user.id]
        );
      }

      redirect(res, "/");
      return;
    }

    // پروفایل من
    if (path === "/profile" && method === "GET") {
      const { rows: stats } = await pool.query(
        `
        SELECT
          (SELECT COUNT(*) FROM posts WHERE user_id=$1) AS posts,
          (SELECT COUNT(*) FROM follows WHERE following_id=$1) AS followers,
          (SELECT COUNT(*) FROM follows WHERE follower_id=$1) AS following
        `,
        [user.id]
      );

      const s = stats[0];

      sendHtml(
        res,
        200,
        "پروفایل",
        `
        ${nav(user)}

        <main class="container">

          <div class="card">

            <div class="profile-row">
              ${avatar(user.name, user.avatar_url, 100)}

              <div>
                <h1>${escapeHtml(user.name)}</h1>
                <div class="muted">
                  ${escapeHtml(user.email)}
                </div>
              </div>
            </div>

            <p>
              ${escapeHtml(user.bio || "هنوز بیو نوشته نشده است.")}
            </p>

            <div class="stats">

              <div class="stat">
                <strong>${s.posts}</strong>
                <span>پست</span>
              </div>

              <div class="stat">
                <strong>${s.followers}</strong>
                <span>دنبال‌کننده</span>
              </div>

              <div class="stat">
                <strong>${s.following}</strong>
                <span>دنبال‌شونده</span>
              </div>

            </div>

            <a class="btn blue" href="/edit-profile">
              ✏️ ویرایش پروفایل
            </a>

            <a class="btn" href="/change-password">
              🔐 تغییر رمز
            </a>

          </div>

        </main>
        `
      );

      return;
    }

    // ویرایش پروفایل
    if (path === "/edit-profile" && method === "GET") {
      sendHtml(
        res,
        200,
        "ویرایش پروفایل",
        `
        ${nav(user)}

        <main class="container">

          <div class="card">
            <h1>✏️ ویرایش پروفایل</h1>

            <form method="post" action="/edit-profile">

              <input
                type="text"
                name="name"
                value="${escapeAttr(user.name)}"
                placeholder="نام"
                required
              >

              <textarea
                name="bio"
                maxlength="1000"
                placeholder="بیو">${escapeHtml(user.bio || "")}</textarea>

              <input
                type="url"
                name="avatar_url"
                value="${escapeAttr(user.avatar_url || "")}"
                placeholder="لینک عکس پروفایل"
              >

              <button class="btn blue" type="submit">
                ذخیره تغییرات
              </button>

            </form>
          </div>

        </main>
        `
      );

      return;
    }

    if (path === "/edit-profile" && method === "POST") {
      const body = await parseBody(req);

      const name = String(body.name || "").trim();
      const bio = String(body.bio || "").trim();
      const image = safeUrl(body.avatar_url || "");

      if (name.length < 2) {
        sendHtml(res, 400, "خطا", "نام معتبر نیست.");
        return;
      }

      await pool.query(
        `
        UPDATE users
        SET name=$1,bio=$2,avatar_url=$3
        WHERE id=$4
        `,
        [name, bio, image, user.id]
      );

      redirect(res, "/profile");
      return;
    }

    // تغییر رمز
    if (path === "/change-password" && method === "GET") {
      sendHtml(
        res,
        200,
        "تغییر رمز",
        `
        ${nav(user)}

        <main class="container">

          <div class="card">
            <h1>🔐 تغییر رمز عبور</h1>

            <form method="post" action="/change-password">

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

              <button class="btn blue" type="submit">
                تغییر رمز
              </button>

            </form>
          </div>

        </main>
        `
      );

      return;
    }

    if (path === "/change-password" && method === "POST") {
      const body = await parseBody(req);

      const oldPassword = String(body.oldPassword || "");
      const newPassword = String(body.newPassword || "");

      if (newPassword.length < 6) {
        sendHtml(
          res,
          400,
          "خطا",
          "رمز جدید باید حداقل ۶ کاراکتر باشد."
        );

        return;
      }

      const { rows } = await pool.query(
        "SELECT password FROM users WHERE id=$1",
        [user.id]
      );

      if (
        rows.length === 0 ||
        !(await verifyPassword(oldPassword, rows[0].password))
      ) {
        sendHtml(
          res,
          401,
          "خطا",
          `
          <div class="container">
            <div class="card">
              <div class="notice danger">
                رمز فعلی اشتباه است.
              </div>
              <a class="btn blue" href="/change-password">
                بازگشت
              </a>
            </div>
          </div>
          `
        );

        return;
      }

      const newHash = await hashPassword(newPassword);

      await pool.query(
        "UPDATE users SET password=$1 WHERE id=$2",
        [newHash, user.id]
      );

      redirect(res, "/profile");
      return;
    }

    // پروفایل کاربر دیگر
    if (path === "/user" && method === "GET") {
      const targetId = parseId(parsed.query.id);

      if (!targetId) {
        sendHtml(res, 400, "خطا", "شناسه کاربر نامعتبر است.");
        return;
      }

      const { rows } = await pool.query(
        `
        SELECT id,name,email,bio,avatar_url
        FROM users
        WHERE id=$1
        `,
        [targetId]
      );

      if (rows.length === 0) {
        sendHtml(res, 404, "خطا", "کاربر پیدا نشد.");
        return;
      }

      const target = rows[0];

      const following = await pool.query(
        `
        SELECT 1
        FROM follows
        WHERE follower_id=$1 AND following_id=$2
        `,
        [user.id, target.id]
      );

      const isFollowing = following.rows.length > 0;

      const { rows: targetPosts } = await pool.query(
        `
        SELECT p.*,u.name,u.avatar_url
        FROM posts p
        JOIN users u ON u.id=p.user_id
        WHERE p.user_id=$1
        ORDER BY p.created_at DESC
        LIMIT 50
        `,
        [target.id]
      );

      let html = `
      ${nav(user)}

      <main class="container">

        <div class="card">

          <div class="profile-row">
            ${avatar(target.name, target.avatar_url, 90)}

            <div>
              <h1>${escapeHtml(target.name)}</h1>

              <div class="muted">
                ${escapeHtml(target.email)}
              </div>
            </div>
          </div>

          <p>
            ${escapeHtml(target.bio || "بیو ندارد.")}
          </p>
      `;

      if (target.id !== user.id) {
        html += `
          <form method="post" action="/follow?id=${target.id}">
            <button class="btn ${isFollowing ? "" : "blue"}">
              ${isFollowing ? "✓ دنبال می‌کنید" : "👥 دنبال کردن"}
            </button>
          </form>
        `;
      }

      html += `
        </div>

        <h2>پست‌های ${escapeHtml(target.name)}</h2>
      `;

      for (const p of targetPosts) {
        html += await renderPost(p, user);
      }

      html += `
      </main>
      `;

      sendHtml(res, 200, target.name, html);
      return;
    }

    // دنبال کردن / لغو دنبال کردن
    if (path === "/follow" && method === "POST") {
      const targetId = parseId(parsed.query.id);

      if (targetId && targetId !== user.id) {
        const existing = await pool.query(
          `
          SELECT 1
          FROM follows
          WHERE follower_id=$1 AND following_id=$2
          `,
          [user.id, targetId]
        );

        if (existing.rows.length > 0) {
          await pool.query(
            `
            DELETE FROM follows
            WHERE follower_id=$1 AND following_id=$2
            `,
            [user.id, targetId]
          );
        } else {
          await pool.query(
            `
            INSERT INTO follows(follower_id,following_id)
            VALUES($1,$2)
            ON CONFLICT DO NOTHING
            `,
            [user.id, targetId]
          );
        }
      }

      redirect(res, `/user?id=${targetId}`);
      return;
    }

    // جستجو
    if (path === "/search" && method === "GET") {
      const q = String(parsed.query.q || "").trim();

      let results = [];

      if (q) {
        const { rows } = await pool.query(
          `
          SELECT id,name,email,bio,avatar_url
          FROM users
          WHERE
            name ILIKE $1
            OR email ILIKE $1
          ORDER BY name ASC
          LIMIT 50
          `,
          [`%${q}%`]
        );

        results = rows;
      }

      let html = `
      ${nav(user)}

      <main class="container">

        <div class="card">
          <h1>🔎 جستجوی کاربران</h1>

          <form method="get" action="/search" class="search-box">
            <input
              type="search"
              name="q"
              value="${escapeAttr(q)}"
              placeholder="نام یا ایمیل..."
            >

            <button class="btn blue" type="submit">
              جستجو
            </button>
          </form>
        </div>
      `;

      if (q && results.length === 0) {
        html += `
          <div class="card">
            کاربری پیدا نشد.
          </div>
        `;
      }

      for (const r of results) {
        html += `
          <div class="card">

            <div class="profile-row">
              ${avatar(r.name, r.avatar_url, 55)}

              <div>
                <a href="/user?id=${r.id}">
                  <strong>${escapeHtml(r.name)}</strong>
                </a>

                <div class="muted">
                  ${escapeHtml(r.email)}
                </div>

                <div>
                  ${escapeHtml(r.bio || "")}
                </div>
              </div>
            </div>

          </div>
        `;
      }

      html += `
      </main>
      `;

      sendHtml(res, 200, "جستجو", html);
      return;
    }

    // لیست پیام‌ها
    if (path === "/messages" && method === "GET" && !parsed.query.user) {
      const { rows } = await pool.query(
        `
        SELECT DISTINCT ON (
          CASE
            WHEN m.sender_id=$1 THEN m.receiver_id
            ELSE m.sender_id
          END
        )
          CASE
            WHEN m.sender_id=$1 THEN m.receiver_id
            ELSE m.sender_id
          END AS other_id,
          m.content,
          m.created_at,
          u.name,
          u.avatar_url

        FROM messages m

        JOIN users u ON u.id =
          CASE
            WHEN m.sender_id=$1 THEN m.receiver_id
            ELSE m.sender_id
          END

        WHERE m.sender_id=$1 OR m.receiver_id=$1

        ORDER BY
          CASE
            WHEN m.sender_id=$1 THEN m.receiver_id
            ELSE m.sender_id
          END,
          m.created_at DESC
        `,
        [user.id]
      );

      let html = `
      ${nav(user)}

      <main class="container">

        <div class="card">
          <h1>💬 پیام‌ها</h1>
          <p class="muted">
            برای شروع گفتگو یک کاربر را از جستجو انتخاب کن.
          </p>
        </div>
      `;

      for (const c of rows) {
        html += `
          <div class="card">

            <a href="/messages?user=${c.other_id}">

              <div class="profile-row">

                ${avatar(c.name, c.avatar_url, 55)}

                <div>
                  <strong>${escapeHtml(c.name)}</strong>

                  <div>
                    ${escapeHtml(c.content)}
                  </div>

                  <div class="muted">
                    ${new Date(c.created_at).toLocaleString("fa-IR")}
                  </div>
                </div>

              </div>

            </a>

          </div>
        `;
      }

      html += `</main>`;

      sendHtml(res, 200, "پیام‌ها", html);
      return;
    }

    // صفحه گفتگو
    if (path === "/messages" && method === "GET" && parsed.query.user) {
      const otherId = parseId(parsed.query.user);

      if (!otherId || otherId === user.id) {
        redirect(res, "/messages");
        return;
      }

      const { rows: people } = await pool.query(
        `
        SELECT id,name,avatar_url
        FROM users
        WHERE id=$1
        `,
        [otherId]
      );

      if (people.length === 0) {
        sendHtml(res, 404, "خطا", "کاربر پیدا نشد.");
        return;
      }

      const other = people[0];

      const { rows: messages } = await pool.query(
        `
        SELECT
          m.*,
          u.name
        FROM messages m
        JOIN users u ON u.id=m.sender_id
        WHERE
          (m.sender_id=$1 AND m.receiver_id=$2)
          OR
          (m.sender_id=$2 AND m.receiver_id=$1)
        ORDER BY m.created_at ASC
        LIMIT 200
        `,
        [user.id, otherId]
      );

      let html = `
      ${nav(user)}

      <main class="container">

        <div class="card">
          <div class="profile-row">
            ${avatar(other.name, other.avatar_url, 55)}

            <div>
              <h2>${escapeHtml(other.name)}</h2>
            </div>
          </div>
        </div>

        <div class="card">
      `;

      for (const m of messages) {
        const mine = Number(m.sender_id) === Number(user.id);

        html += `
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
              ${escapeHtml(m.content)}
              <small class="muted">
                ${new Date(m.created_at).toLocaleTimeString("fa-IR", {
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </small>
            </span>
          </div>
        `;
      }

      html += `
        </div>

        <div class="card">

          <form method="post" action="/messages?user=${otherId}">

            <textarea
              name="content"
              maxlength="2000"
              placeholder="پیام..."
              required
              style="min-height:80px;"
            ></textarea>

            <button class="btn blue" type="submit">
              ارسال پیام
            </button>

          </form>

        </div>

      </main>
      `;

      sendHtml(res, 200, "گفتگو", html);
      return;
    }

    // ارسال پیام
    if (path === "/messages" && method === "POST") {
      const otherId = parseId(parsed.query.user);
      const body = await parseBody(req);
      const content = String(body.content || "").trim();

      if (
        otherId &&
        otherId !== user.id &&
        content
      ) {
        await pool.query(
          `
          INSERT INTO messages(sender_id,receiver_id,content)
          VALUES($1,$2,$3)
          `,
          [user.id, otherId, content]
        );
      }

      redirect(
        res,
        otherId ? `/messages?user=${otherId}` : "/messages"
      );

      return;
    }

    // مسیر ناشناخته
    sendHtml(
      res,
      404,
      "صفحه پیدا نشد",
      `
      ${nav(user)}

      <main class="container">
        <div class="card">
          <h1>404</h1>
          <p>این صفحه وجود ندارد.</p>
          <a class="btn blue" href="/">بازگشت به خانه</a>
        </div>
      </main>
      `
    );

  } catch (error) {
    console.error("REQUEST ERROR:", error);

    if (!res.headersSent) {
      sendHtml(
        res,
        500,
        "خطای سرور",
        `
        <div class="container">
          <div class="card">
            <h1>خطای سرور</h1>

            <div class="notice danger">
              یک خطای داخلی رخ داد.
            </div>

            <a class="btn blue" href="/">
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
    console.log("در حال اتصال به PostgreSQL...");

    await pool.query("SELECT 1");

    console.log("اتصال به PostgreSQL موفق بود.");

    await initDatabase();

    console.log("جداول دیتابیس آماده هستند.");

    const server = http.createServer(handleRequest);

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`شبکه اجتماعی روی پورت ${PORT} فعال شد.`);
    });

    server.on("error", error => {
      console.error("SERVER ERROR:", error);
    });

  } catch (error) {
    console.error("STARTUP ERROR:", error);
    process.exit(1);
  }
}

start();
