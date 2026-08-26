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
   ابزارهای عمومی
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

    req.on("data", chunk => {
      data += chunk;

      if (data.length > 3 * 1024 * 1024) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      resolve(new URLSearchParams(data));
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
  const headers = { Location: location };

  if (cookie) {
    headers["Set-Cookie"] = cookie;
  }

  res.writeHead(302, headers);
  res.end();
}

async function getUser(req) {
  const sessionId = parseCookies(req).sessionId;

  if (!sessionId) return null;

  const result = await pool.query(
    `
    SELECT u.id, u.name, u.email
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_id = $1
    `,
    [sessionId]
  );

  return result.rows[0] || null;
}

function avatar(name, image = null, size = 48) {
  if (image) {
    return `
      <img
        src="${escapeHtml(image)}"
        class="avatar-img"
        style="width:${size}px;height:${size}px"
        alt="پروفایل"
      >
    `;
  }

  const first = String(name || "?").trim().slice(0, 1) || "?";

  return `
    <div
      class="avatar"
      style="width:${size}px;height:${size}px"
    >
      ${escapeHtml(first)}
    </div>
  `;
}

function button(action, text, cls = "") {
  return `
    <form method="post" action="${action}" class="inline">
      <button class="${cls}">${text}</button>
    </form>
  `;
}

/* =========================
   قالب اصلی
========================= */

function layout(title, content, user, unread = 0) {
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

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>${escapeHtml(title)}</title>

<style>

* {
  box-sizing: border-box;
}

:root {
  --bg:#eef1f5;
  --app:#f8f9fb;
  --card:#ffffff;
  --text:#202124;
  --muted:#73777d;
  --border:#e0e4e8;
  --main:#202124;
  --blue:#1976d2;
  --green:#16803c;
  --red:#b00020;
  --purple:#6a4c93;
  --pink:#e91e63;
}

body.dark {
  --bg:#111315;
  --app:#17191c;
  --card:#202327;
  --text:#f1f3f4;
  --muted:#aeb4ba;
  --border:#363a40;
  --main:#f1f3f4;
}

body {
  margin:0;
  background:var(--bg);
  color:var(--text);
  font-family:
    Tahoma,
    Arial,
    sans-serif;
  transition:.2s;
}

.app {
  width:100%;
  max-width:720px;
  min-height:100vh;
  margin:auto;
  background:var(--app);
  padding-bottom:90px;
}

.header {
  position:sticky;
  top:0;
  z-index:50;
  background:var(--card);
  border-bottom:1px solid var(--border);
  padding:15px;
  text-align:center;
  font-size:19px;
  font-weight:bold;
}

.content {
  padding:14px;
}

.card {
  background:var(--card);
  border:1px solid var(--border);
  border-radius:18px;
  padding:15px;
  margin-bottom:14px;
  box-shadow:0 3px 12px rgba(0,0,0,.04);
}

.row {
  display:flex;
  align-items:center;
  gap:11px;
}

.avatar {
  min-width:48px;
  border-radius:50%;
  background:var(--main);
  color:var(--app);
  display:flex;
  justify-content:center;
  align-items:center;
  font-size:20px;
  font-weight:bold;
}

.avatar-img {
  object-fit:cover;
  border-radius:50%;
  display:block;
}

.name {
  font-weight:bold;
}

.muted {
  color:var(--muted);
  font-size:12px;
}

.text {
  white-space:pre-wrap;
  word-break:break-word;
  line-height:1.9;
  margin:14px 0;
}

.ltr {
  direction:ltr;
  text-align:right;
}

.stats {
  display:flex;
  flex-wrap:wrap;
  gap:15px;
  color:var(--muted);
  font-size:13px;
}

.actions {
  display:flex;
  flex-wrap:wrap;
  gap:7px;
  margin-top:12px;
}

.inline {
  display:inline;
  margin:0;
}

button,
.btn {
  border:0;
  border-radius:11px;
  padding:10px 13px;
  background:var(--main);
  color:var(--app);
  font-size:14px;
  text-decoration:none;
  cursor:pointer;
  display:inline-block;
}

button:hover,
.btn:hover {
  opacity:.88;
}

input,
textarea,
select {
  width:100%;
  padding:13px;
  margin:6px 0;
  border:1px solid var(--border);
  border-radius:11px;
  font:inherit;
  background:var(--card);
  color:var(--text);
}

textarea {
  min-height:120px;
  resize:vertical;
}

.full {
  width:100%;
  margin-top:7px;
}

.green {
  background:var(--green);
  color:white;
}

.blue {
  background:var(--blue);
  color:white;
}

.red {
  background:var(--red);
  color:white;
}

.purple {
  background:var(--purple);
  color:white;
}

.pink {
  background:var(--pink);
  color:white;
}

.gray {
  background:#687078;
  color:white;
}

.bottom-nav {
  position:fixed;
  bottom:0;
  left:50%;
  transform:translateX(-50%);
  width:100%;
  max-width:720px;
  height:72px;
  background:var(--card);
  border-top:1px solid var(--border);
  display:flex;
  justify-content:space-around;
  align-items:center;
  z-index:100;
}

.bottom-nav a {
  text-decoration:none;
  color:var(--text);
  text-align:center;
  font-size:11px;
}

.bottom-nav span {
  display:block;
  font-size:21px;
  line-height:29px;
}

.media {
  width:100%;
  max-height:500px;
  object-fit:cover;
  border-radius:14px;
  margin-top:8px;
}

.job {
  background:var(--card);
  border:1px solid var(--border);
  border-radius:15px;
  padding:15px;
  margin-bottom:12px;
}

.job h3 {
  margin-top:0;
}

.success {
  color:var(--green);
}

.error {
  color:var(--red);
}

.notice {
  background:rgba(25,118,210,.08);
  border:1px solid rgba(25,118,210,.2);
  border-radius:13px;
  padding:12px;
  line-height:1.8;
  margin-bottom:12px;
}

.top-grid {
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:8px;
  margin-top:12px;
}

.profile-head {
  text-align:center;
}

.profile-big {
  width:90px;
  height:90px;
  border-radius:50%;
  object-fit:cover;
  margin:auto;
}

.profile-avatar {
  width:90px;
  height:90px;
  border-radius:50%;
  background:var(--main);
  color:var(--app);
  display:flex;
  align-items:center;
  justify-content:center;
  margin:auto;
  font-size:35px;
  font-weight:bold;
}

.profile-stats {
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:7px;
  margin-top:16px;
}

.profile-stat {
  background:rgba(127,127,127,.08);
  border-radius:12px;
  padding:12px 5px;
  text-align:center;
}

.unread {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:21px;
  height:21px;
  padding:0 5px;
  border-radius:20px;
  background:var(--red);
  color:white;
  font-size:11px;
}

.chat {
  padding:12px;
  border-radius:15px;
  margin:8px 0;
  background:rgba(127,127,127,.08);
}

.chat.me {
  border-right:4px solid var(--blue);
}

.chat.other {
  border-right:4px solid var(--green);
}

@media(max-width:430px) {

  .content {
    padding:10px;
  }

  .card {
    padding:12px;
    border-radius:15px;
  }

  .top-grid {
    grid-template-columns:1fr;
  }

  .profile-stats {
    grid-template-columns:1fr 1fr 1fr;
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

<script>

(function(){

  const saved =
    localStorage.getItem("theme");

  if(saved === "dark"){
    document.body.classList.add("dark");
  }

})();

</script>

</body>
</html>
`;
}

async function sendHtml(
  res,
  status,
  title,
  content,
  user = null
) {

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
    "Content-Type":
      "text/html; charset=utf-8"
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

/* =========================
   دیتابیس
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
      created_at TIMESTAMPTZ DEFAULT NOW()
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
      PRIMARY KEY(user_id,post_id)
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
      PRIMARY KEY(follower_id,following_id),
      CHECK(follower_id<>following_id)
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
      PRIMARY KEY(user_id,post_id)
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
      PRIMARY KEY(blocker_id,blocked_id),
      CHECK(blocker_id<>blocked_id)
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* امکانات جدید */

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT
  `);

  console.log("Database initialized.");
}

/* =========================
   برنامه
========================= */

async function app(req,res) {

  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  const path = url.pathname;
  const method = req.method;

  try {

    const user = await getUser(req);

    /* سلامت */

    if (
      method === "GET" &&
      path === "/health"
    ) {

      res.writeHead(200,{
        "Content-Type":
          "text/plain; charset=utf-8"
      });

      return res.end("OK");
    }

    /* =====================
       ورود
    ===================== */

    if (
      method === "GET" &&
      path === "/login"
    ) {

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

          <p>
            حساب نداری؟
            <a href="/register">
              ساخت حساب جدید
            </a>
          </p>

        </div>
        `,
        null
      );
    }

    if (
      method === "POST" &&
      path === "/login"
    ) {

      const b = await readBody(req);

      const email =
        (b.get("email") || "")
          .trim()
          .toLowerCase();

      const password =
        b.get("password") || "";

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
          <div class="card error">
            ایمیل یا رمز عبور اشتباه است.
          </div>

          <a class="btn" href="/login">
            بازگشت
          </a>
          `,
          null
        );
      }

      const sessionId = token();

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

    /* =====================
       ثبت نام
    ===================== */

    if (
      method === "GET" &&
      path === "/register"
    ) {

      return sendHtml(
        res,
        200,
        "ثبت‌نام",
        `
        <div class="card">

          <h2>ساخت حساب جدید</h2>

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

          <p>
            حساب داری؟
            <a href="/login">
              ورود
            </a>
          </p>

        </div>
        `,
        null
      );
    }

    if (
      method === "POST" &&
      path === "/register"
    ) {

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
          <div class="card error">
            اطلاعات واردشده معتبر نیست.
          </div>
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

          <a class="btn" href="/login">
            ورود
          </a>
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

      const sessionId = token();

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

    if (!user) {
      return redirect(res,"/login");
    }

    /* =====================
       خروج
    ===================== */

    if (
      method === "POST" &&
      path === "/logout"
    ) {

      const sid =
        parseCookies(req).sessionId;

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

    if (
      method === "GET" &&
      path === "/"
    ) {

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

            ${avatar(
              user.name,
              user.avatar_url
            )}

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

            <a
              class="btn"
              href="/new-post"
            >
              ➕ انتشار پست
            </a>

            <a
              class="btn gray"
              href="/jobs"
            >
              💼 کاریابی
            </a>

          </div>

        </div>
      `;

      for (const post of posts.rows) {

        const linkedText =
          escapeHtml(post.content)
            .replace(
              /(^|\\s)(#[\\p{L}\\p{N}_]+)/gu,
              '$1<a href="/hashtag?tag=$2">$2</a>'
            );

        content += `
          <article class="card">

            <div class="row">

              ${avatar(
                post.name,
                post.avatar_url
              )}

              <div>

                <div class="name">
                  <a
                    href="/user?id=${post.user_id}"
                  >
                    ${escapeHtml(post.name)}
                  </a>
                </div>

                <div class="muted">
                  ${new Date(
                    post.created_at
                  ).toLocaleString("fa-IR")}
                </div>

              </div>

            </div>

            <div class="text">
              ${linkedText}
            </div>

            ${
              post.media_url
              ? `
                <img
                  class="media"
                  src="${escapeHtml(post.media_url)}"
                  alt="رسانه پست"
                >
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

            </div>

            <div class="actions">

              ${button(
                `/like?id=${post.id}`,
                post.liked
                  ? "💔 لغو لایک"
                  : "❤️ لایک",
                "pink"
              )}

              ${button(
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

                  ${button(
                    `/delete-post?id=${post.id}`,
                    "🗑️ حذف",
                    "red"
                  )}
                `
                : ""
              }

              <a
                class="btn gray"
                href="/report?post=${post.id}"
              >
                🚩 گزارش
              </a>

            </div>

          </article>
        `;
      }

      if (!posts.rowCount) {

        content += `
          <div class="card muted">
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

    /* =====================
       پست جدید
    ===================== */

    if (
      method === "GET" &&
      path === "/new-post"
    ) {

      return sendHtml(
        res,
        200,
        "پست جدید",
        `
        <div class="card">

          <form method="post" action="/new-post">

            <textarea
              name="content"
              maxlength="5000"
              placeholder="چه خبر؟ می‌توانی از #هشتگ هم استفاده کنی"
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

    if (
      method === "POST" &&
      path === "/new-post"
    ) {

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

      return redirect(res,"/");
    }

    /* =====================
       لایک
    ===================== */

    if (
      method === "POST" &&
      path === "/like"
    ) {

      const id =
        Number(url.searchParams.get("id"));

      if (!Number.isInteger(id)) {
        return redirect(res,"/");
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
        return redirect(res,"/");
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

        if (
          post.rows[0].user_id !== user.id
        ) {

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

      return redirect(
        res,
        req.headers.referer || "/"
      );
    }

    /* =====================
       ذخیره
    ===================== */

    if (
      method === "POST" &&
      path === "/save"
    ) {

      const id =
        Number(url.searchParams.get("id"));

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

    /* =====================
       پست و نظرات
    ===================== */

    if (
      method === "GET" &&
      path === "/post"
    ) {

      const id =
        Number(url.searchParams.get("id"));

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
          `<div class="card">
            پست پیدا نشد.
          </div>`,
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

            ${avatar(
              p.name,
              p.avatar_url
            )}

            <div>

              <b>
                ${escapeHtml(p.name)}
              </b>

              <div class="muted">
                ${new Date(
                  p.created_at
                ).toLocaleString("fa-IR")}
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
              >
            `
            : ""
          }

          <div class="stats">
            ❤️ ${p.likes}
          </div>

        </div>

        <div class="card">

          <form
            method="post"
            action="/comment?id=${id}"
          >

            <textarea
              name="content"
              maxlength="2000"
              placeholder="نظر بنویس..."
              required
            ></textarea>

            <button class="blue">
              💬 ارسال نظر
            </button>

          </form>

        </div>
      `;

      for (const c of comments.rows) {

        content += `
          <div class="card">

            <div class="row">

              ${avatar(
                c.name,
                c.avatar_url,
                40
              )}

              <b>
                ${escapeHtml(c.name)}
              </b>

            </div>

            <div class="text">
              ${escapeHtml(c.content)}
            </div>

            <div class="muted">
              ${new Date(
                c.created_at
              ).toLocaleString("fa-IR")}
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

    if (
      method === "POST" &&
      path === "/comment"
    ) {

      const id =
        Number(url.searchParams.get("id"));

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

          if (
            post.rows[0].user_id !== user.id
          ) {

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

    if (
      method === "GET" &&
      path === "/edit-post"
    ) {

      const id =
        Number(url.searchParams.get("id"));

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
        return redirect(res,"/");
      }

      const p = result.rows[0];

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
            >${escapeHtml(p.content)}</textarea>

            <input
              name="media_url"
              type="url"
              value="${escapeHtml(
                p.media_url || ""
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

    if (
      method === "POST" &&
      path === "/edit-post"
    ) {

      const id =
        Number(url.searchParams.get("id"));

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

      return redirect(res,"/");
    }

    /* =====================
       حذف پست
    ===================== */

    if (
      method === "POST" &&
      path === "/delete-post"
    ) {

      const id =
        Number(url.searchParams.get("id"));

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

      return redirect(res,"/");
    }

    /* =====================
       جستجو
    ===================== */

    if (
      method === "GET" &&
      path === "/search"
    ) {

      const q =
        (url.searchParams.get("q") || "")
          .trim();

      let content = `
        <div class="card">

          <h3>🔎 جستجو</h3>

          <form method="get" action="/search">

            <input
              name="q"
              value="${escapeHtml(q)}"
              placeholder="نام، ایمیل یا متن پست"
            >

            <button class="blue">
              جستجو
            </button>

          </form>

        </div>
      `;

      if (q) {

        const users = await pool.query(
          `
          SELECT id,name,email,avatar_url
          FROM users
          WHERE name ILIKE $1
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
              <div
                class="row"
                style="margin:10px 0"
              >

                ${avatar(
                  p.name,
                  p.avatar_url
                )}

                <div>

                  <a
                    href="/user?id=${p.id}"
                  >
                    <b>
                      ${escapeHtml(p.name)}
                    </b>
                  </a>

                  <div class="muted ltr">
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
            p.content,
            p.created_at,
            u.name,
            u.avatar_url

          FROM posts p

          JOIN users u
          ON u.id=p.user_id

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
              <div class="card">

                <div class="row">

                  ${avatar(
                    p.name,
                    p.avatar_url,
                    40
                  )}

                  <b>
                    ${escapeHtml(p.name)}
                  </b>

                </div>

                <div class="text">
                  ${escapeHtml(p.content)}
                </div>

                <a
                  class="btn gray"
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
            <div class="card muted">
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
       هشتگ
    ===================== */

    if (
      method === "GET" &&
      path === "/hashtag"
    ) {

      let tag =
        (url.searchParams.get("tag") || "")
          .trim();

      tag = tag.replace(/^#/,"");

      if (!tag) {
        return redirect(res,"/search");
      }

      const posts = await pool.query(
        `
        SELECT
          p.*,
          u.name,
          u.avatar_url

        FROM posts p

        JOIN users u
        ON u.id=p.user_id

        WHERE p.content ILIKE $1

        ORDER BY p.created_at DESC

        LIMIT 50
        `,
        [`%#${tag}%`]
      );

      let content = `
        <div class="card">
          <h2>
            #${escapeHtml(tag)}
          </h2>
          <div class="muted">
            پست‌های مرتبط با این هشتگ
          </div>
        </div>
      `;

      for (const p of posts.rows) {

        content += `
          <div class="card">

            <div class="row">

              ${avatar(
                p.name,
                p.avatar_url
              )}

              <b>
                ${escapeHtml(p.name)}
              </b>

            </div>

            <div class="text">
              ${escapeHtml(p.content)}
            </div>

            <a
              class="btn gray"
              href="/post?id=${p.id}"
            >
              مشاهده
            </a>

          </div>
        `;
      }

      if (!posts.rowCount) {

        content += `
          <div class="card muted">
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

    /* =====================
       پروفایل کاربر
    ===================== */

    if (
      method === "GET" &&
      path === "/user"
    ) {

      const id =
        Number(url.searchParams.get("id"));

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
          `<div class="card">
            کاربر پیدا نشد.
          </div>`,
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

      const counts = await pool.query(
        `
        SELECT

        (
          SELECT COUNT(*)
          FROM posts
          WHERE user_id=$1
        )::int posts,

        (
          SELECT COUNT(*)
          FROM follows
          WHERE following_id=$1
        )::int followers,

        (
          SELECT COUNT(*)
          FROM follows
          WHERE follower_id=$1
        )::int following

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

      let profileImage = target.avatar_url
        ? `
          <img
            src="${escapeHtml(target.avatar_url)}"
            class="profile-big"
          >
        `
        : `
          <div class="profile-avatar">
            ${escapeHtml(
              target.name
                .slice(0,1)
            )}
          </div>
        `;

      let content = `
        <div class="card profile-head">

          ${profileImage}

          <h2>
            ${escapeHtml(target.name)}
          </h2>

          <div class="muted ltr">
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

          <div class="profile-stats">

            <div class="profile-stat">
              <b>${s.posts}</b>
              <br>
              <small>پست</small>
            </div>

            <a
              class="profile-stat"
              href="/followers?id=${id}"
            >
              <b>${s.followers}</b>
              <br>
              <small>دنبال‌کننده</small>
            </a>

            <a
              class="profile-stat"
              href="/following?id=${id}"
            >
              <b>${s.following}</b>
              <br>
              <small>دنبال‌شده</small>
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

                <a
                  class="btn"
                  href="/messages?user=${id}"
                >
                  💬 پیام
                </a>

                ${button(
                  `/block?id=${id}`,
                  "🚫 مسدود کردن",
                  "red"
                )}

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
          <div class="card">

            <div class="text">
              ${escapeHtml(p.content)}
            </div>

            ${
              p.media_url
              ? `
                <img
                  class="media"
                  src="${escapeHtml(p.media_url)}"
                >
              `
              : ""
            }

            <a
              class="btn gray"
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
        "پروفایل",
        content,
        user
      );
    }

    /* =====================
       دنبال کردن
    ===================== */

    if (
      method === "POST" &&
      path === "/follow"
    ) {

      const id =
        Number(url.searchParams.get("id"));

      if (
        Number.isInteger(id) &&
        id !== user.id
      ) {

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
       دنبال‌کننده‌ها
    ===================== */

    if (
      method === "GET" &&
      path === "/followers"
    ) {

      const id =
        Number(url.searchParams.get("id"));

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

      let content = "";

      for (const p of result.rows) {

        content += `
          <div class="card row">

            ${avatar(
              p.name,
              p.avatar_url
            )}

            <div>

              <a
                href="/user?id=${p.id}"
              >
                <b>
                  ${escapeHtml(p.name)}
                </b>
              </a>

              <div class="muted ltr">
                ${escapeHtml(p.email)}
              </div>

            </div>

          </div>
        `;
      }

      if (!result.rowCount) {

        content = `
          <div class="card muted">
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

    /* =====================
       دنبال‌شده‌ها
    ===================== */

    if (
      method === "GET" &&
      path === "/following"
    ) {

      const id =
        Number(url.searchParams.get("id"));

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

      let content = "";

      for (const p of result.rows) {

        content += `
          <div class="card row">

            ${avatar(
              p.name,
              p.avatar_url
            )}

            <div>

              <a
                href="/user?id=${p.id}"
              >
                <b>
                  ${escapeHtml(p.name)}
                </b>
              </a>

              <div class="muted ltr">
                ${escapeHtml(p.email)}
              </div>

            </div>

          </div>
        `;
      }

      if (!result.rowCount) {

        content = `
          <div class="card muted">
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

    /* =====================
       مسدود کردن
    ===================== */

    if (
      method === "POST" &&
      path === "/block"
    ) {

      const id =
        Number(url.searchParams.get("id"));

      if (
        Number.isInteger(id) &&
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
      }

      return redirect(res,"/");
    }

    /* =====================
       پروفایل من
    ===================== */

    if (
      method === "GET" &&
      path === "/profile"
    ) {

      const result = await pool.query(
        `
        SELECT
          u.name,
          u.email,
          u.bio,
          u.avatar_url,

          (
            SELECT COUNT(*)
            FROM posts
            WHERE user_id=u.id
          )::int posts,

          (
            SELECT COUNT(*)
            FROM follows
            WHERE following_id=u.id
          )::int followers,

          (
            SELECT COUNT(*)
            FROM follows
            WHERE follower_id=u.id
          )::int following,

          (
            SELECT COUNT(*)
            FROM likes l
            JOIN posts p
            ON p.id=l.post_id
            WHERE p.user_id=u.id
          )::int total_likes

        FROM users u
        WHERE u.id=$1
        `,
        [user.id]
      );

      const s = result.rows[0];

      const image = s.avatar_url
        ? `
          <img
            src="${escapeHtml(s.avatar_url)}"
            class="profile-big"
          >
        `
        : `
          <div class="profile-avatar">
            ${escapeHtml(
              s.name.slice(0,1)
            )}
          </div>
        `;

      return sendHtml(
        res,
        200,
        "پروفایل من",
        `
        <div class="card profile-head">

          ${image}

          <h2>
            ${escapeHtml(s.name)}
          </h2>

          <div class="muted ltr">
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

          <div class="profile-stats">

            <div class="profile-stat">
              <b>${s.posts}</b>
              <br>
              پست
            </div>

            <a
              class="profile-stat"
              href="/followers?id=${user.id}"
            >
              <b>${s.followers}</b>
              <br>
              دنبال‌کننده
            </a>

            <a
              class="profile-stat"
              href="/following?id=${user.id}"
            >
              <b>${s.following}</b>
              <br>
              دنبال‌شده
            </a>

          </div>

          <div class="notice">
            ❤️ مجموع لایک پست‌ها:
            <b>${s.total_likes}</b>
          </div>

        </div>

        <div class="card">

          <div class="menu">

            <a
              class="btn"
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
              class="btn gray"
              href="/jobs"
            >
              💼 کاریابی
            </a>

            <a
              class="btn"
              href="/change-password"
            >
              🔐 تغییر رمز
            </a>

            <button
              class="btn"
              onclick="
                localStorage.setItem(
                  'theme',
                  document.body.classList.toggle('dark')
                    ? 'dark'
                    : 'light'
                )
              "
            >
              🌙 حالت شب / روشن
            </button>

            <form
              method="post"
              action="/logout"
            >
              <button class="red full">
                🚪 خروج از حساب
              </button>
            </form>

          </div>

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

      const result = await pool.query(
        `
        SELECT name,bio,avatar_url
        FROM users
        WHERE id=$1
        `,
        [user.id]
      );

      const p = result.rows[0];

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

            <label>نام</label>

            <input
              name="name"
              value="${escapeHtml(p.name)}"
              required
            >

            <label>بیو</label>

            <textarea
              name="bio"
              maxlength="500"
              placeholder="خودت را کوتاه معرفی کن..."
            >${escapeHtml(
              p.bio || ""
            )}</textarea>

            <label>
              لینک عکس پروفایل
            </label>

            <input
              name="avatar_url"
              type="url"
              value="${escapeHtml(
                p.avatar_url || ""
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
          SET name=$1,
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

    /* =====================
       ذخیره‌شده‌ها
    ===================== */

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

        ORDER BY p.created_at DESC
        `,
        [user.id]
      );

      let content = "";

      for (const p of result.rows) {

        content += `
          <div class="card">

            <div class="row">

              ${avatar(
                p.name,
                p.avatar_url
              )}

              <b>
                ${escapeHtml(p.name)}
              </b>

            </div>

            <div class="text">
              ${escapeHtml(p.content)}
            </div>

            <a
              class="btn"
              href="/post?id=${p.id}"
            >
              مشاهده پست
            </a>

          </div>
        `;
      }

      if (!result.rowCount) {

        content = `
          <div class="card muted">
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
          a.name actor,
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

      let content = "";

      for (const n of result.rows) {

        let text =
          "یک اعلان جدید داری.";

        if (n.type === "like") {
          text =
            "پست شما را پسندید.";
        }

        if (n.type === "comment") {
          text =
            "روی پست شما نظر داد.";
        }

        if (n.type === "follow") {
          text =
            "شما را دنبال کرد.";
        }

        if (n.type === "message") {
          text =
            "برای شما پیام فرستاد.";
        }

        content += `
          <div class="card">

            <div class="row">

              ${avatar(
                n.actor || "کاربر",
                n.avatar_url,
                40
              )}

              <div>

                <b>
                  ${escapeHtml(
                    n.actor || "کاربر"
                  )}
                </b>

                <div>
                  ${text}
                </div>

                <div class="muted">
                  ${new Date(
                    n.created_at
                  ).toLocaleString("fa-IR")}
                </div>

              </div>

            </div>

          </div>
        `;
      }

      if (!result.rowCount) {

        content = `
          <div class="card muted">
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

    /* =====================
       پیام‌ها
    ===================== */

    if (
      method === "GET" &&
      path === "/messages"
    ) {

      const otherId =
        Number(
          url.searchParams.get("user") || 0
        );

      if (!otherId) {

        const chats = await pool.query(
          `
          SELECT
            x.id,
            x.name,
            x.avatar_url,
            x.last_message,
            x.last_time

          FROM (
            SELECT
              u.id,
              u.name,
              u.avatar_url,
              m.content AS last_message,
              m.created_at AS last_time,
              ROW_NUMBER() OVER(
                PARTITION BY u.id
                ORDER BY m.created_at DESC
              ) rn

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
          ) x

          WHERE x.rn=1

          ORDER BY x.last_time DESC
          `,
          [user.id]
        );

        let content = `
          <div class="card">

            <a
              class="btn blue"
              href="/search"
            >
              🔎 پیدا کردن کاربر برای پیام
            </a>

          </div>
        `;

        for (const c of chats.rows) {

          content += `
            <a
              href="/messages?user=${c.id}"
              style="text-decoration:none;color:inherit"
            >

              <div class="card row">

                ${avatar(
                  c.name,
                  c.avatar_url
                )}

                <div>

                  <b>
                    ${escapeHtml(c.name)}
                  </b>

                  <div class="muted">
                    ${escapeHtml(
                      String(
                        c.last_message || ""
                      ).slice(0,80)
                    )}
                  </div>

                  <div class="muted">
                    ${new Date(
                      c.last_time
                    ).toLocaleString("fa-IR")}
                  </div>

                </div>

              </div>

            </a>
          `;
        }

        if (!chats.rowCount) {

          content += `
            <div class="card muted">
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
        return redirect(res,"/messages");
      }

      const target = await pool.query(
        `
        SELECT id,name,avatar_url
        FROM users
        WHERE id=$1
        `,
        [otherId]
      );

      if (!target.rowCount) {
        return redirect(res,"/messages");
      }

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

      let content = `
        <div class="card">

          <div class="row">

            ${avatar(
              target.rows[0].name,
              target.rows[0].avatar_url
            )}

            <h3>
              ${escapeHtml(
                target.rows[0].name
              )}
            </h3>

          </div>

        </div>

        <div class="card">

          <form
            method="post"
            action="/messages?user=${otherId}"
          >

            <textarea
              name="content"
              maxlength="3000"
              placeholder="پیام..."
              required
            ></textarea>

            <button class="blue full">
              📤 ارسال پیام
            </button>

          </form>

        </div>
      `;

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
        "گفت‌وگو",
        content,
        user
      );
    }

    if (
      method === "POST" &&
      path === "/messages"
    ) {

      const otherId =
        Number(
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

      return redirect(
        res,
        `/messages?user=${otherId}`
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

            <button class="blue full">
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
       گزارش
    ===================== */

    if (
      method === "GET" &&
      path === "/report"
    ) {

      const postId =
        Number(
          url.searchParams.get("post") || 0
        );

      const reportedUser =
        Number(
          url.searchParams.get("user") || 0
        );

      return sendHtml(
        res,
        200,
        "گزارش",
        `
        <div class="card">

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
        Number(b.get("post") || 0)
        || null;

      const reportedUser =
        Number(b.get("user") || 0)
        || null;

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

      return redirect(res,"/");
    }

    /* =====================
       کاریابی
    ===================== */

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

      const jobs = await pool.query(
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
            OR j.title ILIKE '%'||$1||'%'
            OR j.description ILIKE '%'||$1||'%'
          )

          AND

          (
            $2=''
            OR j.city ILIKE '%'||$2||'%'
          )

        ORDER BY j.created_at DESC

        LIMIT 100
        `,
        [
          q,
          city
        ]
      );

      let content = `
        <div class="card">

          <h3>💼 کاریابی</h3>

          <form method="get" action="/jobs">

            <input
              name="q"
              value="${escapeHtml(q)}"
              placeholder="عنوان شغل"
            >

            <input
              name="city"
              value="${escapeHtml(city)}"
              placeholder="شهر"
            >

            <button class="blue">
              🔎 جستجوی شغل
            </button>

          </form>

        </div>

        <div class="card">

          <a
            class="btn green"
            href="/new-job"
          >
            ➕ ثبت آگهی شغلی
          </a>

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
              📍 ${escapeHtml(j.city || "نامشخص")}
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
                ).slice(0,500)
              )}
            </div>

            <div class="muted">
              ${new Date(
                j.created_at
              ).toLocaleString("fa-IR")}
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
          <div class="card muted">
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

    /* =====================
       جزئیات شغل
    ===================== */

    if (
      method === "GET" &&
      path === "/job"
    ) {

      const id =
        Number(url.searchParams.get("id"));

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
          <div class="card">
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
              j.description || ""
            )}
          </div>

          <div class="muted">
            تاریخ انتشار:
            ${new Date(
              j.created_at
            ).toLocaleString("fa-IR")}
          </div>

          <a
            class="btn blue"
            href="/messages?user=${j.user_id}"
          >
            💬 پیام به آگهی‌دهنده
          </a>

        </div>
        `,
        user
      );
    }

    /* =====================
       آگهی جدید
    ===================== */

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

          <form
            method="post"
            action="/new-job"
          >

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
       404
    ===================== */

    return sendHtml(
      res,
      404,
      "صفحه پیدا نشد",
      `
      <div class="card">

        <h2>صفحه پیدا نشد</h2>

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

  } catch(error) {

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

          <div class="error">
            خطایی در اجرای درخواست رخ داد.
          </div>

          <div class="muted">
            جزئیات خطا در Render Logs ثبت شده است.
          </div>

        </div>
        `,
        user
      );
    }

    res.end();
  }
}

/* =========================
   شروع سرور
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
      (error,socket) => {

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

  } catch(error) {

    console.error(
      "STARTUP ERROR:",
      error.message
    );

    process.exit(1);
  }
}

start();
