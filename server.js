const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const port = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ======================================================
// ابزارهای کمکی
// ======================================================

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(password)
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

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";

  header.split(";").forEach(part => {
    const index = part.indexOf("=");

    if (index === -1) return;

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

function createSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

async function createSession(userId) {
  const sessionId = createSessionId();

  await pool.query(
    `
    INSERT INTO sessions (session_id, user_id)
    VALUES ($1, $2)
    `,
    [sessionId, userId]
  );

  return sessionId;
}

async function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.sessionId;

  if (!sessionId) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT
      users.id,
      users.name,
      users.email
    FROM sessions
    INNER JOIN users
      ON users.id = sessions.user_id
    WHERE sessions.session_id = $1
    `,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

async function deleteSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.sessionId;

  if (!sessionId) return;

  await pool.query(
    `
    DELETE FROM sessions
    WHERE session_id = $1
    `,
    [sessionId]
  );
}

function sendHtml(res, statusCode, title, content) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(html(title, content));
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 2 * 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });

    req.on("end", () => {
      resolve(new URLSearchParams(body));
    });

    req.on("error", reject);
  });
}

function formatDate(date) {
  try {
    return new Date(date).toLocaleString("fa-IR");
  } catch {
    return "";
  }
}

// ======================================================
// قالب ظاهری
// ======================================================

function html(title, content) {
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
  name="description"
  content="شبکه اجتماعی من"
>

<title>${escapeHtml(title)}</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;

  font-family:
    Arial,
    Tahoma,
    sans-serif;

  background: #f1f3f5;

  color: #222;

  padding: 15px;
}

.container {
  width: 100%;
  max-width: 650px;

  margin: 0 auto;
}

.topbar {
  background: white;

  border-radius: 18px;

  padding: 15px;

  margin-bottom: 15px;

  box-shadow:
    0 3px 15px rgba(0,0,0,0.08);

  text-align: center;
}

.topbar h1 {
  margin: 5px 0;
}

.card {
  background: white;

  border-radius: 18px;

  padding: 18px;

  margin: 15px 0;

  box-shadow:
    0 3px 15px rgba(0,0,0,0.08);
}

input,
textarea {
  width: 100%;

  padding: 13px;

  margin: 7px 0;

  border: 1px solid #ccc;

  border-radius: 10px;

  font-size: 16px;

  font-family:
    Arial,
    Tahoma,
    sans-serif;
}

textarea {
  min-height: 110px;
  resize: vertical;
}

button {
  border: none;

  border-radius: 10px;

  padding: 11px 16px;

  margin: 5px;

  font-size: 15px;

  cursor: pointer;

  background: #222;

  color: white;
}

button:hover {
  opacity: 0.88;
}

.main-button {
  display: block;

  width: 94%;

  margin: 9px auto;
}

.secondary-button {
  background: #666;
}

.danger-button {
  background: #b00020;
}

a {
  color: #222;
  text-decoration: none;
}

.divider {
  height: 1px;

  background: #ddd;

  margin: 20px 0;
}

.center {
  text-align: center;
}

.success {
  color: #087f23;
}

.error {
  color: #b00020;
}

.muted {
  color: #777;
  font-size: 13px;
}

.profile-header {
  text-align: center;
  padding: 10px;
}

.avatar {
  width: 85px;
  height: 85px;

  border-radius: 50%;

  background: #ddd;

  margin: 0 auto 10px;

  display: flex;

  align-items: center;
  justify-content: center;

  font-size: 38px;
}

.post {
  background: white;

  border-radius: 18px;

  padding: 18px;

  margin: 15px 0;

  box-shadow:
    0 3px 15px rgba(0,0,0,0.08);
}

.post-author {
  font-weight: bold;

  font-size: 17px;

  margin-bottom: 5px;
}

.post-text {
  white-space: pre-wrap;

  word-break: break-word;

  line-height: 1.8;

  margin: 15px 0;
}

.post-image {
  width: 100%;

  max-height: 500px;

  object-fit: cover;

  border-radius: 14px;

  margin-top: 10px;
}

.post-actions {
  display: flex;

  gap: 5px;

  flex-wrap: wrap;
}

.comment {
  background: #f4f4f4;

  border-radius: 12px;

  padding: 10px;

  margin: 8px 0;
}

.comment-name {
  font-weight: bold;
}

.user-card {
  background: #f7f7f7;

  border-radius: 14px;

  padding: 15px;

  margin: 10px 0;
}

.job-card {
  background: #f7f7f7;

  border-radius: 15px;

  padding: 16px;

  margin: 12px 0;
}

.job-title {
  font-size: 19px;

  font-weight: bold;
}

.job-city {
  margin-top: 7px;

  color: #555;
}

.job-salary {
  margin-top: 7px;

  font-weight: bold;
}

.message-card {
  padding: 13px;

  border-radius: 14px;

  margin: 10px 0;

  background: #f4f4f4;
}

.message-sent {
  border-right: 4px solid #555;
}

.message-received {
  border-right: 4px solid #087f23;
}

.nav-grid {
  display: grid;

  grid-template-columns:
    1fr 1fr;

  gap: 8px;
}

.nav-grid a button {
  width: 100%;
  margin: 0;
}

.small-form {
  margin-top: 10px;
}

</style>

</head>

<body>

<div class="container">

${content}

</div>

</body>

</html>
`;
}

// ======================================================
// دیتابیس
// ======================================================

async function createTables() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (

      id SERIAL PRIMARY KEY,

      name TEXT NOT NULL,

      email TEXT UNIQUE NOT NULL,

      password TEXT NOT NULL,

      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP

    )
  `);

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (

      id SERIAL PRIMARY KEY,

      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      text TEXT NOT NULL,

      image_url TEXT,

      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP

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

      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,

      comment TEXT NOT NULL,

      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP

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

      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP

    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    posts_user_id_index
    ON posts(user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    messages_sender_id_index
    ON messages(sender_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    messages_receiver_id_index
    ON messages(receiver_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    comments_post_id_index
    ON comments(post_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    jobs_city_index
    ON jobs(city)
  `);

  console.log("All database tables are ready.");
}

// ======================================================
// سرور
// ======================================================

const server = http.createServer(async (req, res) => {

  try {

    const url = new URL(
      req.url,
      "http://localhost"
    );

    const pathname = url.pathname;

    // ==================================================
    // صفحه اصلی
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/"
    ) {

      const user = await getSession(req);

      if (!user) {

        sendHtml(
          res,
          200,
          "شبکه اجتماعی",
          `

          <div class="card center">

            <h1>
              خوش آمدید 👋
            </h1>

            <p>
              شبکه اجتماعی و کاریابی
            </p>

            <div class="divider"></div>

            <a href="/signup">
              <button class="main-button">
                ثبت‌نام
              </button>
            </a>

            <a href="/login">
              <button class="main-button">
                ورود
              </button>
            </a>

          </div>

          `
        );

        return;
      }

      sendHtml(
        res,
        200,
        "صفحه اصلی",
        `

        <div class="topbar">

          <h2>
            خوش آمدی
            ${escapeHtml(user.name)}
            👋
          </h2>

          <p class="success">
            ورود موفق بود ✅
          </p>

        </div>

        <div class="card">

          <h3 class="center">
            منوی برنامه
          </h3>

          <div class="nav-grid">

            <a href="/feed">
              <button>
                صفحه اجتماعی 🏠
              </button>
            </a>

            <a href="/create-post">
              <button>
                انتشار پست ➕
              </button>
            </a>

            <a href="/users">
              <button>
                کاربران 👥
              </button>
            </a>

            <a href="/jobs">
              <button>
                جستجوی کار 🔎
              </button>
            </a>

            <a href="/create-job">
              <button>
                ثبت آگهی کار 💼
              </button>
            </a>

            <a href="/messages">
              <button>
                پیام‌ها 💬
              </button>
            </a>

            <a href="/profile">
              <button>
                پروفایل 👤
              </button>
            </a>

            <a href="/settings">
              <button>
                تنظیمات ⚙️
              </button>
            </a>

          </div>

          <div class="divider"></div>

          <a href="/logout">
            <button class="main-button danger-button">
              خروج
            </button>
          </a>

        </div>

        `
      );

      return;
    }

    // ==================================================
    // ثبت نام
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/signup"
    ) {

      sendHtml(
        res,
        200,
        "ثبت نام",
        `

        <div class="card">

          <h2 class="center">
            ثبت‌نام
          </h2>

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
              placeholder="رمز عبور"
              minlength="6"
              required
            >

            <button
              type="submit"
              class="main-button"
            >
              ثبت‌نام
            </button>

          </form>

          <a href="/">
            بازگشت
          </a>

        </div>

        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      pathname === "/signup"
    ) {

      const data = await readBody(req);

      const name =
        (data.get("name") || "").trim();

      const email =
        (data.get("email") || "")
          .trim()
          .toLowerCase();

      const password =
        data.get("password") || "";

      if (
        !name ||
        !email ||
        !password
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `
          <div class="card center">

            <h2 class="error">
              اطلاعات ناقص است
            </h2>

            <a href="/signup">
              بازگشت
            </a>

          </div>
          `
        );

        return;
      }

      if (password.length < 6) {

        sendHtml(
          res,
          400,
          "خطا",
          `
          <div class="card center">

            <h2 class="error">
              رمز عبور باید حداقل ۶ کاراکتر باشد.
            </h2>

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
          INSERT INTO users
          (name, email, password)
          VALUES ($1, $2, $3)
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
          "ثبت نام موفق",
          `
          <div class="card center">

            <h2 class="success">
              ثبت‌نام موفق شد ✅
            </h2>

            <p>
              حساب شما ساخته شد.
            </p>

            <a href="/login">
              <button>
                ورود
              </button>
            </a>

          </div>
          `
        );

      } catch (error) {

        console.error(
          "Signup error:",
          error
        );

        if (error.code === "23505") {

          sendHtml(
            res,
            400,
            "خطا",
            `
            <div class="card center">

              <h2 class="error">
                این ایمیل قبلاً ثبت شده است.
              </h2>

              <a href="/login">
                ورود
              </a>

            </div>
            `
          );

        } else {

          sendHtml(
            res,
            500,
            "خطا",
            `
            <div class="card center">

              <h2 class="error">
                خطایی در ثبت‌نام رخ داد.
              </h2>

            </div>
            `
          );
        }
      }

      return;
    }

    // ==================================================
    // ورود
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/login"
    ) {

      sendHtml(
        res,
        200,
        "ورود",
        `

        <div class="card">

          <h2 class="center">
            ورود
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

            <button
              type="submit"
              class="main-button"
            >
              ورود
            </button>

          </form>

          <a href="/">
            بازگشت
          </a>

        </div>

        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      pathname === "/login"
    ) {

      const data = await readBody(req);

      const email =
        (data.get("email") || "")
          .trim()
          .toLowerCase();

      const password =
        data.get("password") || "";

      try {

        const result =
          await pool.query(
            `
            SELECT id, name, email
            FROM users
            WHERE email = $1
              AND password = $2
            `,
            [
              email,
              hashPassword(password)
            ]
          );

        if (result.rows.length === 0) {

          sendHtml(
            res,
            401,
            "خطا",
            `
            <div class="card center">

              <h2 class="error">
                ایمیل یا رمز عبور اشتباه است.
              </h2>

              <a href="/login">
                تلاش دوباره
              </a>

            </div>
            `
          );

          return;
        }

        const user = result.rows[0];

        const sessionId =
          await createSession(user.id);

        const cookie =
          `sessionId=${encodeURIComponent(sessionId)}; ` +
          `HttpOnly; Path=/; SameSite=Lax`;

        redirect(
          res,
          "/",
          cookie
        );

      } catch (error) {

        console.error(
          "Login error:",
          error
        );

        sendHtml(
          res,
          500,
          "خطا",
          `
          <div class="card center">

            <h2 class="error">
              خطای دیتابیس
            </h2>

            <a href="/login">
              بازگشت
            </a>

          </div>
          `
        );
      }

      return;
    }

    // ==================================================
    // صفحه اجتماعی / فید
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/feed"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const postsResult =
        await pool.query(
          `
          SELECT
            posts.id,
            posts.text,
            posts.image_url,
            posts.created_at,
            users.id AS user_id,
            users.name,
            users.email,
            (
              SELECT COUNT(*)
              FROM likes
              WHERE likes.post_id = posts.id
            ) AS like_count,
            (
              SELECT COUNT(*)
              FROM comments
              WHERE comments.post_id = posts.id
            ) AS comment_count,
            EXISTS(
              SELECT 1
              FROM likes
              WHERE likes.post_id = posts.id
                AND likes.user_id = $1
            ) AS liked
          FROM posts
          INNER JOIN users
            ON users.id = posts.user_id
          ORDER BY posts.created_at DESC
          `,
          [user.id]
        );

      let postsHtml = "";

      if (postsResult.rows.length === 0) {

        postsHtml = `
        <div class="card center">

          <p>
            هنوز پستی منتشر نشده است.
          </p>

          <a href="/create-post">
            <button>
              اولین پست را منتشر کن
            </button>
          </a>

        </div>
        `;

      } else {

        for (const post of postsResult.rows) {

          const commentsResult =
            await pool.query(
              `
              SELECT
                comments.comment,
                comments.created_at,
                users.name
              FROM comments
              INNER JOIN users
                ON users.id = comments.user_id
              WHERE comments.post_id = $1
              ORDER BY comments.created_at ASC
              `,
              [post.id]
            );

          let commentsHtml = "";

          commentsResult.rows.forEach(comment => {

            commentsHtml += `
            <div class="comment">

              <div class="comment-name">
                ${escapeHtml(comment.name)}
              </div>

              <div>
                ${escapeHtml(comment.comment)}
              </div>

              <div class="muted">
                ${escapeHtml(formatDate(comment.created_at))}
              </div>

            </div>
            `;

          });

          if (!commentsHtml) {

            commentsHtml = `
            <div class="muted">
              هنوز نظری ثبت نشده است.
            </div>
            `;

          }

          const imageHtml =
            post.image_url
              ? `
                <img
                  class="post-image"
                  src="${escapeHtml(post.image_url)}"
                  alt="تصویر پست"
                >
              `
              : "";

          postsHtml += `

          <div class="post">

            <div class="post-author">

              <a href="/user?id=${post.user_id}">
                ${escapeHtml(post.name)}
              </a>

            </div>

            <div class="muted">
              ${escapeHtml(post.email)}
            </div>

            <div class="muted">
              ${escapeHtml(formatDate(post.created_at))}
            </div>

            <div class="post-text">
              ${escapeHtml(post.text)}
            </div>

            ${imageHtml}

            <div class="divider"></div>

            <div class="post-actions">

              <form
                method="POST"
                action="/like"
              >

                <input
                  type="hidden"
                  name="post_id"
                  value="${escapeHtml(post.id)}"
                >

                <button type="submit">
                  ${post.liked ? "❤️ پسندیده شد" : "🤍 لایک"}
                  (${escapeHtml(post.like_count)})
                </button>

              </form>

              <span>
                💬 ${escapeHtml(post.comment_count)}
              </span>

            </div>

            <div class="divider"></div>

            <h4>
              نظرات
            </h4>

            ${commentsHtml}

            <form
              method="POST"
              action="/comment"
              class="small-form"
            >

              <input
                type="hidden"
                name="post_id"
                value="${escapeHtml(post.id)}"
              >

              <input
                name="comment"
                placeholder="نظر خود را بنویس..."
                maxlength="1000"
                required
              >

              <button type="submit">
                ارسال نظر
              </button>

            </form>

          </div>

          `;
        }
      }

      sendHtml(
        res,
        200,
        "صفحه اجتماعی",
        `

        <div class="topbar">

          <h2>
            صفحه اجتماعی 🏠
          </h2>

          <p>
            ${escapeHtml(user.name)}
          </p>

        </div>

        <div class="card">

          <a href="/create-post">
            <button class="main-button">
              ➕ انتشار پست جدید
            </button>
          </a>

          <a href="/">
            <button class="main-button secondary-button">
              صفحه اصلی
            </button>
          </a>

        </div>

        ${postsHtml}

        `
      );

      return;
    }

    // ==================================================
    // ساخت پست
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/create-post"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "انتشار پست",
        `

        <div class="card">

          <h2 class="center">
            انتشار پست ➕
          </h2>

          <form
            method="POST"
            action="/create-post"
          >

            <textarea
              name="text"
              placeholder="چه خبر؟"
              maxlength="5000"
              required
            ></textarea>

            <input
              name="image_url"
              type="url"
              placeholder="لینک تصویر، در صورت تمایل"
              maxlength="1000"
            >

            <button
              type="submit"
              class="main-button"
            >
              انتشار پست
            </button>

          </form>

          <a href="/feed">
            بازگشت به صفحه اجتماعی
          </a>

        </div>

        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      pathname === "/create-post"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const text =
        (data.get("text") || "").trim();

      const imageUrl =
        (data.get("image_url") || "").trim();

      if (!text) {

        sendHtml(
          res,
          400,
          "خطا",
          `
          <div class="card center">

            <h2 class="error">
              متن پست خالی است.
            </h2>

            <a href="/create-post">
              بازگشت
            </a>

          </div>
          `
        );

        return;
      }

      await pool.query(
        `
        INSERT INTO posts
        (user_id, text, image_url)
        VALUES ($1, $2, $3)
        `,
        [
          user.id,
          text,
          imageUrl || null
        ]
      );

      redirect(res, "/feed");

      return;
    }

    // ==================================================
    // لایک
    // ==================================================

    if (
      req.method === "POST" &&
      pathname === "/like"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const postId =
        Number(data.get("post_id"));

      if (
        !Number.isInteger(postId) ||
        postId <= 0
      ) {
        redirect(res, "/feed");
        return;
      }

      const existing =
        await pool.query(
          `
          SELECT id
          FROM likes
          WHERE user_id = $1
            AND post_id = $2
          `,
          [
            user.id,
            postId
          ]
        );

      if (existing.rows.length > 0) {

        await pool.query(
          `
          DELETE FROM likes
          WHERE user_id = $1
            AND post_id = $2
          `,
          [
            user.id,
            postId
          ]
        );

      } else {

        await pool.query(
          `
          INSERT INTO likes
          (user_id, post_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
          `,
          [
            user.id,
            postId
          ]
        );
      }

      redirect(res, "/feed");

      return;
    }

    // ==================================================
    // کامنت
    // ==================================================

    if (
      req.method === "POST" &&
      pathname === "/comment"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const postId =
        Number(data.get("post_id"));

      const comment =
        (data.get("comment") || "").trim();

      if (
        !Number.isInteger(postId) ||
        postId <= 0 ||
        !comment
      ) {

        redirect(res, "/feed");

        return;
      }

      await pool.query(
        `
        INSERT INTO comments
        (user_id, post_id, comment)
        VALUES ($1, $2, $3)
        `,
        [
          user.id,
          postId,
          comment
        ]
      );

      redirect(res, "/feed");

      return;
    }

    // ==================================================
    // کاربران
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/users"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const search =
        (url.searchParams.get("q") || "").trim();

      let result;

      if (search) {

        result =
          await pool.query(
            `
            SELECT id, name, email
            FROM users
            WHERE id <> $1
              AND (
                name ILIKE $2
                OR email ILIKE $2
              )
            ORDER BY id ASC
            `,
            [
              user.id,
              `%${search}%`
            ]
          );

      } else {

        result =
          await pool.query(
            `
            SELECT id, name, email
            FROM users
            WHERE id <> $1
            ORDER BY id ASC
            `,
            [user.id]
          );
      }

      let usersHtml = "";

      result.rows.forEach(other => {

        usersHtml += `

        <div class="user-card">

          <strong>
            ${escapeHtml(other.name)}
          </strong>

          <div class="muted">
            ${escapeHtml(other.email)}
          </div>

          <a href="/user?id=${other.id}">
            <button>
              مشاهده پروفایل
            </button>
          </a>

          <a href="/send-message?to=${other.id}">
            <button>
              پیام 💬
            </button>
          </a>

        </div>

        `;

      });

      if (!usersHtml) {

        usersHtml = `
        <div class="card center">

          <p>
            کاربری پیدا نشد.
          </p>

        </div>
        `;

      }

      sendHtml(
        res,
        200,
        "کاربران",
        `

        <div class="card">

          <h2>
            جستجوی کاربران 👥
          </h2>

          <form method="GET" action="/users">

            <input
              name="q"
              value="${escapeHtml(search)}"
              placeholder="نام یا ایمیل..."
            >

            <button type="submit">
              جستجو
            </button>

          </form>

        </div>

        ${usersHtml}

        <div class="card center">

          <a href="/">
            صفحه اصلی
          </a>

        </div>

        `
      );

      return;
    }

    // ==================================================
    // پروفایل کاربر دیگر
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/user"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const targetId =
        Number(
          url.searchParams.get("id")
        );

      if (
        !Number.isInteger(targetId) ||
        targetId <= 0
      ) {

        redirect(res, "/users");
        return;
      }

      const targetResult =
        await pool.query(
          `
          SELECT id, name, email
          FROM users
          WHERE id = $1
          `,
          [targetId]
        );

      if (targetResult.rows.length === 0) {

        sendHtml(
          res,
          404,
          "کاربر پیدا نشد",
          `
          <div class="card center">

            <h2 class="error">
              کاربر پیدا نشد.
            </h2>

            <a href="/users">
              بازگشت
            </a>

          </div>
          `
        );

        return;
      }

      const target =
        targetResult.rows[0];

      const followResult =
        await pool.query(
          `
          SELECT id
          FROM follows
          WHERE follower_id = $1
            AND following_id = $2
          `,
          [
            user.id,
            target.id
          ]
        );

      const following =
        followResult.rows.length > 0;

      const followerCount =
        await pool.query(
          `
          SELECT COUNT(*)
          FROM follows
          WHERE following_id = $1
          `,
          [target.id]
        );

      const followingCount =
        await pool.query(
          `
          SELECT COUNT(*)
          FROM follows
          WHERE follower_id = $1
          `,
          [target.id]
        );

      sendHtml(
        res,
        200,
        "پروفایل",
        `

        <div class="card profile-header">

          <div class="avatar">
            👤
          </div>

          <h2>
            ${escapeHtml(target.name)}
          </h2>

          <p class="muted">
            ${escapeHtml(target.email)}
          </p>

          <p>
            دنبال‌کننده:
            ${escapeHtml(followerCount.rows[0].count)}
            |
            دنبال‌شونده:
            ${escapeHtml(followingCount.rows[0].count)}
          </p>

          ${
            target.id !== user.id
              ? `
                <form
                  method="POST"
                  action="/follow"
                >

                  <input
                    type="hidden"
                    name="target_id"
                    value="${target.id}"
                  >

                  <button type="submit">
                    ${
                      following
                        ? "لغو دنبال کردن"
                        : "دنبال کردن"
                    }
                  </button>

                </form>

                <a href="/send-message?to=${target.id}">
                  <button>
                    ارسال پیام 💬
                  </button>
                </a>
              `
              : ""
          }

        </div>

        <div class="card center">

          <a href="/users">
            بازگشت به کاربران
          </a>

        </div>

        `
      );

      return;
    }

    // ==================================================
    // دنبال کردن
    // ==================================================

    if (
      req.method === "POST" &&
      pathname === "/follow"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const targetId =
        Number(data.get("target_id"));

      if (
        !Number.isInteger(targetId) ||
        targetId <= 0 ||
        targetId === user.id
      ) {

        redirect(res, "/users");

        return;
      }

      const existing =
        await pool.query(
          `
          SELECT id
          FROM follows
          WHERE follower_id = $1
            AND following_id = $2
          `,
          [
            user.id,
            targetId
          ]
        );

      if (existing.rows.length > 0) {

        await pool.query(
          `
          DELETE FROM follows
          WHERE follower_id = $1
            AND following_id = $2
          `,
          [
            user.id,
            targetId
          ]
        );

      } else {

        await pool.query(
          `
          INSERT INTO follows
          (follower_id, following_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
          `,
          [
            user.id,
            targetId
          ]
        );
      }

      redirect(
        res,
        `/user?id=${encodeURIComponent(targetId)}`
      );

      return;
    }

    // ==================================================
    // جستجوی کار
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/jobs"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const search =
        (url.searchParams.get("q") || "").trim();

      let result;

      if (search) {

        result =
          await pool.query(
            `
            SELECT
              jobs.id,
              jobs.title,
              jobs.city,
              jobs.salary,
              jobs.description,
              jobs.created_at,
              users.name,
              users.email
            FROM jobs
            INNER JOIN users
              ON users.id = jobs.user_id
            WHERE
              jobs.title ILIKE $1
              OR jobs.city ILIKE $1
              OR jobs.description ILIKE $1
            ORDER BY jobs.created_at DESC
            `,
            [`%${search}%`]
          );

      } else {

        result =
          await pool.query(
            `
            SELECT
              jobs.id,
              jobs.title,
              jobs.city,
              jobs.salary,
              jobs.description,
              jobs.created_at,
              users.name,
              users.email
            FROM jobs
            INNER JOIN users
              ON users.id = jobs.user_id
            ORDER BY jobs.created_at DESC
            `
          );
      }

      let jobsHtml = "";

      result.rows.forEach(job => {

        jobsHtml += `

        <div class="job-card">

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

          <div class="post-text">
            ${escapeHtml(job.description)}
          </div>

          <div class="muted">
            ثبت توسط:
            ${escapeHtml(job.name)}
          </div>

          <div class="muted">
            ${escapeHtml(formatDate(job.created_at))}
          </div>

          <a href="/send-message?to=${job.user_id}">
            <button>
              تماس با آگهی‌دهنده 💬
            </button>
          </a>

        </div>

        `;

      });

      if (!jobsHtml) {

        jobsHtml = `
        <div class="card center">

          <p>
            آگهی کاری پیدا نشد.
          </p>

        </div>
        `;

      }

      sendHtml(
        res,
        200,
        "جستجوی کار",
        `

        <div class="card">

          <h2>
            جستجوی کار 🔎
          </h2>

          <form
            method="GET"
            action="/jobs"
          >

            <input
              name="q"
              value="${escapeHtml(search)}"
              placeholder="عنوان شغل، شهر یا توضیحات..."
            >

            <button type="submit">
              جستجو
            </button>

          </form>

          <a href="/create-job">
            <button class="main-button">
              ثبت آگهی کار ➕
            </button>
          </a>

        </div>

        ${jobsHtml}

        <div class="card center">

          <a href="/">
            صفحه اصلی
          </a>

        </div>

        `
      );

      return;
    }

    // ==================================================
    // ثبت آگهی کار
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/create-job"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "ثبت آگهی کار",
        `

        <div class="card">

          <h2>
            ثبت آگهی کار ➕
          </h2>

          <p class="muted">
            آگهی شما در بخش جستجوی کار نمایش داده می‌شود.
          </p>

          <form
            method="POST"
            action="/create-job"
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
              placeholder="حقوق یا دستمزد، مثلاً توافقی"
              maxlength="200"
              required
            >

            <textarea
              name="description"
              placeholder="توضیحات کامل درباره کار..."
              maxlength="5000"
              required
            ></textarea>

            <button
              type="submit"
              class="main-button"
            >
              ثبت آگهی
            </button>

          </form>

          <a href="/jobs">
            بازگشت به جستجوی کار
          </a>

        </div>

        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      pathname === "/create-job"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const title =
        (data.get("title") || "").trim();

      const city =
        (data.get("city") || "").trim();

      const salary =
        (data.get("salary") || "").trim();

      const description =
        (data.get("description") || "").trim();

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
          <div class="card center">

            <h2 class="error">
              همه قسمت‌ها را کامل کن.
            </h2>

            <a href="/create-job">
              بازگشت
            </a>

          </div>
          `
        );

        return;
      }

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
        VALUES
        ($1, $2, $3, $4, $5)
        `,
        [
          user.id,
          title,
          city,
          salary,
          description
        ]
      );

      redirect(res, "/jobs");

      return;
    }

    // ==================================================
    // پیام‌ها
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/messages"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const usersResult =
        await pool.query(
          `
          SELECT id, name, email
          FROM users
          WHERE id <> $1
          ORDER BY id ASC
          `,
          [user.id]
        );

      let usersHtml = "";

      usersResult.rows.forEach(other => {

        usersHtml += `

        <div class="user-card">

          <strong>
            ${escapeHtml(other.name)}
          </strong>

          <div class="muted">
            ${escapeHtml(other.email)}
          </div>

          <a href="/send-message?to=${other.id}">
            <button>
              باز کردن گفتگو 💬
            </button>
          </a>

        </div>

        `;

      });

      if (!usersHtml) {

        usersHtml = `
        <div class="card center">

          <p>
            کاربر دیگری وجود ندارد.
          </p>

        </div>
        `;

      }

      sendHtml(
        res,
        200,
        "پیام‌ها",
        `

        <div class="card">

          <h2>
            پیام‌ها 💬
          </h2>

          <h3>
            کاربران
          </h3>

          ${usersHtml}

        </div>

        <div class="card center">

          <a href="/">
            صفحه اصلی
          </a>

        </div>

        `
      );

      return;
    }

    // ==================================================
    // گفت‌وگو
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/send-message"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const receiverId =
        Number(
          url.searchParams.get("to")
        );

      if (
        !Number.isInteger(receiverId) ||
        receiverId <= 0 ||
        receiverId === user.id
      ) {

        redirect(res, "/messages");

        return;
      }

      const receiverResult =
        await pool.query(
          `
          SELECT id, name, email
          FROM users
          WHERE id = $1
          `,
          [receiverId]
        );

      if (receiverResult.rows.length === 0) {

        redirect(res, "/messages");

        return;
      }

      const receiver =
        receiverResult.rows[0];

      const messagesResult =
        await pool.query(
          `
          SELECT
            messages.message,
            messages.created_at,
            messages.sender_id,
            users.name AS sender_name
          FROM messages
          INNER JOIN users
            ON users.id = messages.sender_id
          WHERE
            (
              messages.sender_id = $1
              AND messages.receiver_id = $2
            )
            OR
            (
              messages.sender_id = $2
              AND messages.receiver_id = $1
            )
          ORDER BY messages.created_at ASC
          `,
          [
            user.id,
            receiverId
          ]
        );

      let conversationHtml = "";

      messagesResult.rows.forEach(message => {

        const className =
          message.sender_id === user.id
            ? "message-sent"
            : "message-received";

        conversationHtml += `

        <div class="message-card ${className}">

          <strong>
            ${escapeHtml(message.sender_name)}
          </strong>

          <div class="post-text">
            ${escapeHtml(message.message)}
          </div>

          <div class="muted">
            ${escapeHtml(formatDate(message.created_at))}
          </div>

        </div>

        `;

      });

      if (!conversationHtml) {

        conversationHtml = `
        <div class="card center">

          <p>
            هنوز پیامی در این گفتگو وجود ندارد.
          </p>

        </div>
        `;

      }

      sendHtml(
        res,
        200,
        "گفتگو",
        `

        <div class="card">

          <h2>
            گفت‌وگو با
            ${escapeHtml(receiver.name)}
            💬
          </h2>

          <p class="muted">
            ${escapeHtml(receiver.email)}
          </p>

        </div>

        ${conversationHtml}

        <div class="card">

          <form
            method="POST"
            action="/send-message"
          >

            <input
              type="hidden"
              name="receiver_id"
              value="${receiver.id}"
            >

            <textarea
              name="message"
              placeholder="پیام خود را بنویس..."
              maxlength="5000"
              required
            ></textarea>

            <button
              type="submit"
              class="main-button"
            >
              ارسال پیام 📤
            </button>

          </form>

          <a href="/messages">
            بازگشت به پیام‌ها
          </a>

        </div>

        `
      );

      return;
    }

    // ==================================================
    // ارسال پیام
    // ==================================================

    if (
      req.method === "POST" &&
      pathname === "/send-message"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const receiverId =
        Number(
          data.get("receiver_id")
        );

      const message =
        (data.get("message") || "").trim();

      if (
        !Number.isInteger(receiverId) ||
        receiverId <= 0 ||
        receiverId === user.id ||
        !message
      ) {

        redirect(res, "/messages");

        return;
      }

      const receiverResult =
        await pool.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
          `,
          [receiverId]
        );

      if (receiverResult.rows.length === 0) {

        redirect(res, "/messages");

        return;
      }

      await pool.query(
        `
        INSERT INTO messages
        (
          sender_id,
          receiver_id,
          message
        )
        VALUES
        ($1, $2, $3)
        `,
        [
          user.id,
          receiverId,
          message
        ]
      );

      redirect(
        res,
        `/send-message?to=${encodeURIComponent(receiverId)}`
      );

      return;
    }

    // ==================================================
    // پروفایل خود کاربر
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/profile"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const followers =
        await pool.query(
          `
          SELECT COUNT(*)
          FROM follows
          WHERE following_id = $1
          `,
          [user.id]
        );

      const following =
        await pool.query(
          `
          SELECT COUNT(*)
          FROM follows
          WHERE follower_id = $1
          `,
          [user.id]
        );

      const posts =
        await pool.query(
          `
          SELECT COUNT(*)
          FROM posts
          WHERE user_id = $1
          `,
          [user.id]
        );

      sendHtml(
        res,
        200,
        "پروفایل",
        `

        <div class="card profile-header">

          <div class="avatar">
            👤
          </div>

          <h2>
            ${escapeHtml(user.name)}
          </h2>

          <p>
            ${escapeHtml(user.email)}
          </p>

          <p>
            پست‌ها:
            ${escapeHtml(posts.rows[0].count)}
            |
            دنبال‌کننده:
            ${escapeHtml(followers.rows[0].count)}
            |
            دنبال‌شونده:
            ${escapeHtml(following.rows[0].count)}
          </p>

        </div>

        <div class="card">

          <h3>
            ویرایش پروفایل ✏️
          </h3>

          <form
            method="POST"
            action="/profile"
          >

            <input
              name="name"
              value="${escapeHtml(user.name)}"
              maxlength="100"
              required
            >

            <input
              name="email"
              type="email"
              value="${escapeHtml(user.email)}"
              maxlength="200"
              required
            >

            <button
              type="submit"
              class="main-button"
            >
              ذخیره تغییرات
            </button>

          </form>

        </div>

        <div class="card center">

          <a href="/">
            صفحه اصلی
          </a>

        </div>

        `
      );

      return;
    }

    // ==================================================
    // ذخیره پروفایل
    // ==================================================

    if (
      req.method === "POST" &&
      pathname === "/profile"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const name =
        (data.get("name") || "").trim();

      const email =
        (data.get("email") || "")
          .trim()
          .toLowerCase();

      if (!name || !email) {

        redirect(res, "/profile");

        return;
      }

      try {

        await pool.query(
          `
          UPDATE users
          SET name = $1,
              email = $2
          WHERE id = $3
          `,
          [
            name,
            email,
            user.id
          ]
        );

        sendHtml(
          res,
          200,
          "پروفایل",
          `
          <div class="card center">

            <h2 class="success">
              تغییرات ذخیره شد ✅
            </h2>

            <a href="/profile">
              مشاهده پروفایل
            </a>

          </div>
          `
        );

      } catch (error) {

        console.error(
          "Profile error:",
          error
        );

        if (error.code === "23505") {

          sendHtml(
            res,
            400,
            "خطا",
            `
            <div class="card center">

              <h2 class="error">
                این ایمیل قبلاً استفاده شده است.
              </h2>

              <a href="/profile">
                بازگشت
              </a>

            </div>
            `
          );

        } else {

          sendHtml(
            res,
            500,
            "خطا",
            `
            <div class="card center">

              <h2 class="error">
                ذخیره تغییرات انجام نشد.
              </h2>

            </div>
            `
          );
        }
      }

      return;
    }

    // ==================================================
    // تنظیمات
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/settings"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "تنظیمات",
        `

        <div class="card">

          <h2>
            تنظیمات ⚙️
          </h2>

          <div class="info-box">

            <p class="success">
              حساب شما فعال است. ✅
            </p>

            <p>
              نام:
              ${escapeHtml(user.name)}
            </p>

            <p>
              ایمیل:
              ${escapeHtml(user.email)}
            </p>

          </div>

        </div>

        <div class="card center">

          <a href="/">
            صفحه اصلی
          </a>

        </div>

        `
      );

      return;
    }

    // ==================================================
    // خروج
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/logout"
    ) {

      try {
        await deleteSession(req);
      } catch (error) {
        console.error(
          "Logout error:",
          error
        );
      }

      const cookie =
        "sessionId=; " +
        "HttpOnly; " +
        "Path=/; " +
        "Max-Age=0; " +
        "SameSite=Lax";

      redirect(
        res,
        "/",
        cookie
      );

      return;
    }

    // ==================================================
    // صفحه پیدا نشد
    // ==================================================

    sendHtml(
      res,
      404,
      "صفحه پیدا نشد",
      `

      <div class="card center">

        <h2>
          صفحه پیدا نشد
        </h2>

        <a href="/">
          <button>
            صفحه اصلی
          </button>
        </a>

      </div>

      `
    );

  } catch (error) {

    console.error(
      "Server error:",
      error
    );

    sendHtml(
      res,
      500,
      "خطای سرور",
      `

      <div class="card center">

        <h2 class="error">
          خطای سرور
        </h2>

        <p>
          مشکلی در اجرای درخواست رخ داد.
        </p>

        <a href="/">
          بازگشت به صفحه اصلی
        </a>

      </div>

      `
    );
  }

});

// ======================================================
// اجرای برنامه
// ======================================================

createTables()
  .then(() => {

    server.listen(
      port,
      "0.0.0.0",
      () => {

        console.log(
          "Server running on port " + port
        );

      }
    );

  })
  .catch(error => {

    console.error(
      "Database initialization error:",
      error
    );

    server.listen(
      port,
      "0.0.0.0",
      () => {

        console.log(
          "Server running on port " + port
        );

      }
    );

  });
