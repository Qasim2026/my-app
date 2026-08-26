server.js کامل اصلاح‌شده

const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ======================================================
// ابزارها
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

  if (!sessionId) return null;

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

function sendHtml(res, status, title, content) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(page(title, content));
}

// ======================================================
// قالب اصلی
// ======================================================

function page(title, content) {
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

body {
  margin: 0;
  background: #f2f3f5;
  font-family: Arial, Tahoma, sans-serif;
  color: #222;
}

.app {
  width: 100%;
  max-width: 650px;
  min-height: 100vh;
  margin: auto;
  background: #fff;
  padding-bottom: 90px;
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  border-bottom: 1px solid #ddd;
  padding: 15px;
  text-align: center;
  font-size: 20px;
  font-weight: bold;
}

.content {
  padding: 15px;
}

.card {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 15px;
  padding: 15px;
  margin-bottom: 15px;
}

.profile-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #222;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 23px;
  font-weight: bold;
}

.username {
  font-weight: bold;
  font-size: 17px;
}

.email {
  color: #777;
  font-size: 12px;
  margin-top: 4px;
}

.post-text {
  margin: 18px 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.8;
}

.stats {
  display: flex;
  gap: 20px;
  color: #555;
  font-size: 14px;
}

button {
  border: none;
  border-radius: 10px;
  padding: 11px 16px;
  background: #222;
  color: white;
  cursor: pointer;
  font-size: 15px;
}

button:hover {
  opacity: .9;
}

.full {
  width: 100%;
  margin-top: 8px;
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

input,
textarea,
select {
  width: 100%;
  padding: 12px;
  margin: 7px 0;
  border: 1px solid #ccc;
  border-radius: 10px;
  font-size: 16px;
  font-family: Arial, Tahoma, sans-serif;
}

textarea {
  min-height: 120px;
  resize: vertical;
}

a {
  text-decoration: none;
  color: inherit;
}

.menu {
  display: grid;
  gap: 10px;
}

.menu a {
  display: block;
}

.menu button {
  width: 100%;
}

.empty {
  text-align: center;
  color: #777;
  padding: 35px 10px;
}

.success {
  color: #087f23;
}

.error {
  color: #b00020;
}

.comment {
  background: #f5f5f5;
  border-radius: 10px;
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
  border: 1px solid #ddd;
  border-radius: 14px;
  padding: 15px;
  margin-bottom: 12px;
}

.job-title {
  font-size: 19px;
  font-weight: bold;
}

.job-city {
  color: #555;
  margin-top: 7px;
}

.job-salary {
  color: #087f23;
  margin-top: 7px;
}

.job-description {
  margin-top: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 650px;
  height: 68px;
  background: #fff;
  border-top: 1px solid #ddd;
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 20;
}

.bottom-nav a {
  text-align: center;
  font-size: 12px;
}

.bottom-nav span {
  display: block;
  font-size: 22px;
}

.divider {
  height: 1px;
  background: #ddd;
  margin: 20px 0;
}

.small {
  color: #777;
  font-size: 13px;
}

</style>

</head>

<body>

<div class="app">

<div class="header">
${escapeHtml(title)}
</div>

<div class="content">
${content}
</div>

</div>

</body>

</html>
`;
}

// ======================================================
// جداول دیتابیس
// ======================================================

async function createTables() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ====================================================
  // اصلاح جدول posts موجود
  // ====================================================

  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS content TEXT
  `);

  // اگر پست‌های قدیمی وجود داشته باشند و content خالی باشد
  await pool.query(`
    UPDATE posts
    SET content = ''
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
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
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

    const path = url.pathname;

    const user = await getSession(req);

    // ==================================================
    // صفحه اصلی
    // ==================================================

    if (req.method === "GET" && path === "/") {

      if (!user) {

        sendHtml(
          res,
          200,
          "برنامه اجتماعی",
          `
          <div class="card" style="text-align:center">

            <h1>خوش آمدید 👋</h1>

            <p>
              یک برنامه اجتماعی برای ارتباط با کاربران،
              انتشار پست، دنبال کردن کاربران و پیام‌رسانی.
            </p>

            <div class="menu">

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

          </div>
          `
        );

        return;
      }

      const posts = await pool.query(`
        SELECT
          posts.id,
          posts.content,
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
          ) AS comment_count

        FROM posts

        INNER JOIN users
          ON users.id = posts.user_id

        ORDER BY posts.created_at DESC

        LIMIT 50
      `);

      let postsHtml = "";

      if (posts.rows.length === 0) {

        postsHtml = `
          <div class="card empty">
            هنوز پستی منتشر نشده است.
            <br>
            اولین پست را تو منتشر کن! 📸
          </div>
        `;

      } else {

        posts.rows.forEach(post => {

          postsHtml += `
          <div class="card">

            <div class="profile-head">

              <div class="avatar">
                ${escapeHtml(
                  post.name.charAt(0)
                )}
              </div>

              <div>

                <div class="username">
                  ${escapeHtml(post.name)}
                </div>

                <div class="email">
                  ${escapeHtml(post.email)}
                </div>

              </div>

            </div>

            <div class="post-text">
              ${escapeHtml(post.content)}
            </div>

            <div class="stats">
              ❤️ ${post.like_count}
              &nbsp;&nbsp;
              💬 ${post.comment_count}
            </div>

            <div style="margin-top:12px">

              <a href="/like?post=${post.id}">
                <button class="like">
                  ❤️ لایک
                </button>
              </a>

              <a href="/post?id=${post.id}">
                <button>
                  💬 نظرها
                </button>
              </a>

            </div>

          </div>
          `;
        });
      }

      sendHtml(
        res,
        200,
        "صفحه اجتماعی 🏠",
        `

        <div class="card">

          <div class="profile-head">

            <div class="avatar">
              ${escapeHtml(
                user.name.charAt(0)
              )}
            </div>

            <div>

              <div class="username">
                خوش آمدی ${escapeHtml(user.name)} 👋
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

        ${postsHtml}

        `
      );

      return;
    }

    // ==================================================
    // ثبت نام
    // ==================================================

    if (req.method === "GET" && path === "/signup") {

      sendHtml(
        res,
        200,
        "ثبت‌نام",
        `

        <div class="card">

          <form method="POST" action="/signup">

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

    if (req.method === "POST" && path === "/signup") {

      const data = await readBody(req);

      const name =
        (data.get("name") || "").trim();

      const email =
        (data.get("email") || "")
          .trim()
          .toLowerCase();

      const password =
        data.get("password") || "";

      if (!name || !email || !password) {

        sendHtml(
          res,
          400,
          "خطا",
          `<p class="error">
            همه قسمت‌ها را کامل کن.
          </p>`
        );

        return;
      }

      if (password.length < 6) {

        sendHtml(
          res,
          400,
          "خطا",
          `<p class="error">
            رمز عبور باید حداقل ۶ کاراکتر باشد.
          </p>`
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

        console.error(error);

        sendHtml(
          res,
          400,
          "خطا",
          `
          <p class="error">
            این ایمیل قبلاً ثبت شده است.
          </p>

          <a href="/signup">
            بازگشت
          </a>
          `
        );
      }

      return;
    }

    // ==================================================
    // ورود
    // ==================================================

    if (req.method === "GET" && path === "/login") {

      sendHtml(
        res,
        200,
        "ورود",
        `

        <div class="card">

          <form method="POST" action="/login">

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

    if (req.method === "POST" && path === "/login") {

      const data = await readBody(req);

      const email =
        (data.get("email") || "")
          .trim()
          .toLowerCase();

      const password =
        data.get("password") || "";

      const result = await pool.query(
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
          <p class="error">
            ایمیل یا رمز عبور اشتباه است.
          </p>

          <a href="/login">
            تلاش دوباره
          </a>
          `
        );

        return;
      }

      const sessionId =
        await createSession(result.rows[0].id);

      const cookie =
        `sessionId=${encodeURIComponent(sessionId)}; ` +
        `HttpOnly; Path=/; SameSite=Lax`;

      redirect(
        res,
        "/",
        cookie
      );

      return;
    }

    // ==================================================
    // انتشار پست
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/new-post"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "انتشار پست ➕",
        `

        <div class="card">

          <form method="POST" action="/new-post">

            <textarea
              name="content"
              maxlength="5000"
              placeholder="چه چیزی می‌خواهی منتشر کنی؟"
              required
            ></textarea>

            <button class="full">
              انتشار پست 📸
            </button>

          </form>

        </div>

        <a href="/">
          بازگشت به خانه
        </a>

        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/new-post"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const content =
        (data.get("content") || "").trim();

      if (!content) {

        sendHtml(
          res,
          400,
          "خطا",
          `<p class="error">متن پست خالی است.</p>`
        );

        return;
      }

      await pool.query(
        `
        INSERT INTO posts
        (user_id, content)
        VALUES ($1, $2)
        `,
        [user.id, content]
      );

      redirect(res, "/");

      return;
    }

    // ==================================================
    // لایک
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/like"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const postId =
        Number(url.searchParams.get("post"));

      if (!Number.isInteger(postId)) {
        redirect(res, "/");
        return;
      }

      const existing =
        await pool.query(
          `
          SELECT id
          FROM likes
          WHERE post_id = $1
          AND user_id = $2
          `,
          [postId, user.id]
        );

      if (existing.rows.length > 0) {

        await pool.query(
          `
          DELETE FROM likes
          WHERE post_id = $1
          AND user_id = $2
          `,
          [postId, user.id]
        );

      } else {

        await pool.query(
          `
          INSERT INTO likes
          (post_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
          `,
          [postId, user.id]
        );
      }

      redirect(res, "/");

      return;
    }

    // ==================================================
    // نمایش پست و نظرات
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/post"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const postId =
        Number(url.searchParams.get("id"));

      const postResult =
        await pool.query(
          `
          SELECT
            posts.id,
            posts.content,
            users.name,
            users.email
          FROM posts
          INNER JOIN users
            ON users.id = posts.user_id
          WHERE posts.id = $1
          `,
          [postId]
        );

      if (postResult.rows.length === 0) {

        sendHtml(
          res,
          404,
          "پست پیدا نشد",
          `<p>این پست وجود ندارد.</p>`
        );

        return;
      }

      const post = postResult.rows[0];

      const commentsResult =
        await pool.query(
          `
          SELECT
            comments.comment,
            users.name
          FROM comments
          INNER JOIN users
            ON users.id = comments.user_id
          WHERE comments.post_id = $1
          ORDER BY comments.created_at ASC
          `,
          [postId]
        );

      let commentsHtml = "";

      if (commentsResult.rows.length === 0) {

        commentsHtml = `
          <div class="empty">
            هنوز نظری ثبت نشده است.
          </div>
        `;

      } else {

        commentsResult.rows.forEach(comment => {

          commentsHtml += `
            <div class="comment">

              <div class="comment-name">
                ${escapeHtml(comment.name)}
              </div>

              <div class="comment-text">
                ${escapeHtml(comment.comment)}
              </div>

            </div>
          `;
        });
      }

      sendHtml(
        res,
        200,
        "پست 💬",
        `

        <div class="card">

          <div class="profile-head">

            <div class="avatar">
              ${escapeHtml(
                post.name.charAt(0)
              )}
            </div>

            <div>

              <div class="username">
                ${escapeHtml(post.name)}
              </div>

              <div class="email">
                ${escapeHtml(post.email)}
              </div>

            </div>

          </div>

          <div class="post-text">
            ${escapeHtml(post.content)}
          </div>

        </div>

        <div class="card">

          <h3>
            نظرات 💬
          </h3>

          ${commentsHtml}

          <div class="divider"></div>

          <form method="POST" action="/comment">

            <input
              type="hidden"
              name="post_id"
              value="${post.id}"
            >

            <textarea
              name="comment"
              maxlength="2000"
              placeholder="نظر خود را بنویس..."
              required
            ></textarea>

            <button class="full">
              ارسال نظر
            </button>

          </form>

        </div>

        <a href="/">
          بازگشت به خانه
        </a>

        `
      );

      return;
    }

    // ==================================================
    // ثبت نظر
    // ==================================================

    if (
      req.method === "POST" &&
      path === "/comment"
    ) {

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
        Number.isInteger(postId) &&
        comment
      ) {

        await pool.query(
          `
          INSERT INTO comments
          (post_id, user_id, comment)
          VALUES ($1, $2, $3)
          `,
          [postId, user.id, comment]
        );

      }

      redirect(
        res,
        `/post?id=${postId}`
      );

      return;
    }

    // ==================================================
    // جستجو
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/search"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const q =
        (url.searchParams.get("q") || "").trim();

      let usersHtml = "";
      let jobsHtml = "";

      if (q) {

        const usersResult =
          await pool.query(
            `
            SELECT id, name, email
            FROM users
            WHERE
              name ILIKE $1
              OR email ILIKE $1
            ORDER BY id ASC
            LIMIT 30
            `,
            [`%${q}%`]
          );

        usersResult.rows.forEach(person => {

          usersHtml += `
          <div class="card">

            <div class="profile-head">

              <div class="avatar">
                ${escapeHtml(
                  person.name.charAt(0)
                )}
              </div>

              <div>

                <div class="username">
                  ${escapeHtml(person.name)}
                </div>

                <div class="email">
                  ${escapeHtml(person.email)}
                </div>

              </div>

            </div>

            <a href="/user?id=${person.id}">
              <button class="full">
                مشاهده پروفایل
              </button>
            </a>

          </div>
          `;
        });

        const jobsResult =
          await pool.query(
            `
            SELECT
              jobs.id,
              jobs.title,
              jobs.city,
              jobs.salary,
              jobs.description,
              users.name
            FROM jobs
            INNER JOIN users
              ON users.id = jobs.user_id
            WHERE
              jobs.title ILIKE $1
              OR jobs.city ILIKE $1
              OR jobs.description ILIKE $1
            ORDER BY jobs.created_at DESC
            LIMIT 50
            `,
            [`%${q}%`]
          );

        jobsResult.rows.forEach(job => {

          jobsHtml += `
          <div class="job">

            <div class="job-title">
              ${escapeHtml(job.title)}
            </div>

            <div class="job-city">
              📍 ${escapeHtml(job.city)}
            </div>

            <div class="job-salary">
              💰 ${escapeHtml(job.salary)}
            </div>

            <div class="job-description">
              ${escapeHtml(job.description)}
            </div>

            <div class="small">
              ثبت‌کننده: ${escapeHtml(job.name)}
            </div>

          </div>
          `;
        });
      }

      if (!usersHtml) {
        usersHtml = `
          <div class="empty">
            کاربری پیدا نشد.
          </div>
        `;
      }

      if (!jobsHtml) {
        jobsHtml = `
          <div class="empty">
            آگهی کاری پیدا نشد.
          </div>
        `;
      }

      sendHtml(
        res,
        200,
        "جستجو 🔎",
        `

        <div class="card">

          <form method="GET" action="/search">

            <input
              name="q"
              value="${escapeHtml(q)}"
              placeholder="نام کاربر، شغل یا موضوع..."
            >

            <button class="full">
              جستجو 🔎
            </button>

          </form>

        </div>

        <h3>
          کاربران 👥
        </h3>

        ${usersHtml}

        <div class="divider"></div>

        <h3>
          آگهی‌های کاری 💼
        </h3>

        ${jobsHtml}

        `
      );

      return;
    }

    // ==================================================
    // کاربر
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/user"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const userId =
        Number(url.searchParams.get("id"));

      const result =
        await pool.query(
          `
          SELECT id, name, email
          FROM users
          WHERE id = $1
          `,
          [userId]
        );

      if (result.rows.length === 0) {

        sendHtml(
          res,
          404,
          "کاربر",
          `<p>کاربر پیدا نشد.</p>`
        );

        return;
      }

      const person = result.rows[0];

      const followers =
        await pool.query(
          `
          SELECT COUNT(*)
          FROM follows
          WHERE following_id = $1
          `,
          [person.id]
        );

      const following =
        await pool.query(
          `
          SELECT COUNT(*)
          FROM follows
          WHERE follower_id = $1
          `,
          [person.id]
        );

      let followButton = "";

      if (person.id !== user.id) {

        const check =
          await pool.query(
            `
            SELECT id
            FROM follows
            WHERE follower_id = $1
            AND following_id = $2
            `,
            [user.id, person.id]
          );

        if (check.rows.length > 0) {

          followButton = `
            <a href="/follow?id=${person.id}">
              <button class="follow">
                ✓ دنبال می‌کنید
              </button>
            </a>
          `;

        } else {

          followButton = `
            <a href="/follow?id=${person.id}">
              <button class="follow">
                + دنبال کردن
              </button>
            </a>
          `;
        }
      }

      sendHtml(
        res,
        200,
        "پروفایل کاربر 👤",
        `

        <div class="card">

          <div class="profile-head">

            <div class="avatar">
              ${escapeHtml(
                person.name.charAt(0)
              )}
            </div>

            <div>

              <div class="username">
                ${escapeHtml(person.name)}
              </div>

              <div class="email">
                ${escapeHtml(person.email)}
              </div>

            </div>

          </div>

          <div class="divider"></div>

          <div class="stats">

            دنبال‌کننده:
            ${followers.rows[0].count}

            &nbsp;&nbsp;

            دنبال‌شونده:
            ${following.rows[0].count}

          </div>

          ${followButton}

        </div>

        `
      );

      return;
    }

    // ==================================================
    // دنبال کردن
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/follow"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const followingId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(followingId) ||
        followingId === user.id
      ) {
        redirect(res, "/");
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
          [user.id, followingId]
        );

      if (existing.rows.length > 0) {

        await pool.query(
          `
          DELETE FROM follows
          WHERE follower_id = $1
          AND following_id = $2
          `,
          [user.id, followingId]
        );

      } else {

        await pool.query(
          `
          INSERT INTO follows
          (follower_id, following_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
          `,
          [user.id, followingId]
        );
      }

      redirect(
        res,
        `/user?id=${followingId}`
      );

      return;
    }

    // ==================================================
    // جستجوی کار
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/jobs"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const q =
        (url.searchParams.get("q") || "").trim();

      let result;

      if (q) {

        result = await pool.query(
          `
          SELECT
            jobs.id,
            jobs.title,
            jobs.city,
            jobs.salary,
            jobs.description,
            users.name
          FROM jobs
          INNER JOIN users
            ON users.id = jobs.user_id
          WHERE
            jobs.title ILIKE $1
            OR jobs.city ILIKE $1
            OR jobs.description ILIKE $1
          ORDER BY jobs.created_at DESC
          `,
          [`%${q}%`]
        );

      } else {

        result = await pool.query(
          `
          SELECT
            jobs.id,
            jobs.title,
            jobs.city,
            jobs.salary,
            jobs.description,
            users.name
          FROM jobs
          INNER JOIN users
            ON users.id = jobs.user_id
          ORDER BY jobs.created_at DESC
          LIMIT 100
          `
        );
      }

      let jobsHtml = "";

      result.rows.forEach(job => {

        jobsHtml += `
        <div class="job">

          <div class="job-title">
            ${escapeHtml(job.title)}
          </div>

          <div class="job-city">
            📍 ${escapeHtml(job.city)}
          </div>

          <div class="job-salary">
            💰 ${escapeHtml(job.salary)}
          </div>

          <div class="job-description">
            ${escapeHtml(job.description)}
          </div>

          <div class="small">
            ثبت‌کننده:
            ${escapeHtml(job.name)}
          </div>

        </div>
        `;
      });

      if (!jobsHtml) {

        jobsHtml = `
        <div class="empty">
          هنوز آگهی کاری ثبت نشده است.
        </div>
        `;
      }

      sendHtml(
        res,
        200,
        "جستجوی کار 🔎",
        `

        <div class="card">

          <form method="GET" action="/jobs">

            <input
              name="q"
              value="${escapeHtml(q)}"
              placeholder="نام شغل یا شهر..."
            >

            <button class="full">
              جستجوی کار 🔎
            </button>

          </form>

        </div>

        <a href="/new-job">
          <button class="full">
            ➕ ثبت آگهی کار
          </button>
        </a>

        <div class="divider"></div>

        ${jobsHtml}

        `
      );

      return;
    }

    // ==================================================
    // ثبت آگهی کار
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/new-job"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "ثبت آگهی کار 💼",
        `

        <div class="card">

          <form method="POST" action="/new-job">

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

            <button class="full">
              ثبت آگهی
            </button>

          </form>

        </div>

        <a href="/jobs">
          بازگشت به جستجوی کار
        </a>

        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/new-job"
    ) {

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
          <p class="error">
            همه قسمت‌ها را کامل کن.
          </p>
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
        VALUES ($1, $2, $3, $4, $5)
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
      path === "/messages"
    ) {

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

      usersResult.rows.forEach(person => {

        usersHtml += `
        <div class="card">

          <div class="username">
            ${escapeHtml(person.name)}
          </div>

          <div class="email">
            ${escapeHtml(person.email)}
          </div>

          <a href="/chat?id=${person.id}">
            <button class="full">
              💬 باز کردن گفتگو
            </button>
          </a>

        </div>
        `;
      });

      if (!usersHtml) {

        usersHtml = `
        <div class="empty">
          هنوز کاربر دیگری وجود ندارد.
        </div>
        `;
      }

      sendHtml(
        res,
        200,
        "پیام‌ها 💬",
        usersHtml
      );

      return;
    }

    // ==================================================
    // گفت‌وگو
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/chat"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const receiverId =
        Number(url.searchParams.get("id"));

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

        sendHtml(
          res,
          404,
          "خطا",
          `<p>کاربر پیدا نشد.</p>`
        );

        return;
      }

      const receiver =
        receiverResult.rows[0];

      const messagesResult =
        await pool.query(
          `
          SELECT
            messages.message,
            messages.sender_id,
            messages.created_at,
            users.name
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
          [user.id, receiverId]
        );

      let messagesHtml = "";

      messagesResult.rows.forEach(message => {

        messagesHtml += `
        <div class="comment">

          <div class="comment-name">
            ${escapeHtml(message.name)}
          </div>

          <div class="comment-text">
            ${escapeHtml(message.message)}
          </div>

        </div>
        `;
      });

      if (!messagesHtml) {

        messagesHtml = `
        <div class="empty">
          هنوز پیامی در این گفتگو وجود ندارد.
        </div>
        `;
      }

      sendHtml(
        res,
        200,
        `گفت‌وگو با ${escapeHtml(receiver.name)} 💬`,
        `

        ${messagesHtml}

        <div class="divider"></div>

        <form method="POST" action="/chat">

          <input
            type="hidden"
            name="receiver_id"
            value="${receiver.id}"
          >

          <textarea
            name="message"
            maxlength="5000"
            placeholder="پیام خود را بنویس..."
            required
          ></textarea>

          <button class="full">
            ارسال پیام 📤
          </button>

        </form>

        <a href="/messages">
          بازگشت به پیام‌ها
        </a>

        `
      );

      return;
    }

    // ==================================================
    // ارسال پیام
    // ==================================================

    if (
      req.method === "POST" &&
      path === "/chat"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const receiverId =
        Number(data.get("receiver_id"));

      const message =
        (data.get("message") || "").trim();

      if (
        Number.isInteger(receiverId) &&
        message
      ) {

        await pool.query(
          `
          INSERT INTO messages
          (
            sender_id,
            receiver_id,
            message
          )
          VALUES ($1, $2, $3)
          `,
          [
            user.id,
            receiverId,
            message
          ]
        );
      }

      redirect(
        res,
        `/chat?id=${receiverId}`
      );

      return;
    }

    // ==================================================
    // پروفایل
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/profile"
    ) {

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
          SELECT id, content
          FROM posts
          WHERE user_id = $1
          ORDER BY created_at DESC
          `,
          [user.id]
        );

      let postsHtml = "";

      posts.rows.forEach(post => {

        postsHtml += `
        <div class="card">

          <div class="post-text">
            ${escapeHtml(post.content)}
          </div>

          <a href="/post?id=${post.id}">
            <button>
              💬 مشاهده
            </button>
          </a>

        </div>
        `;
      });

      if (!postsHtml) {

        postsHtml = `
        <div class="empty">
          هنوز پستی منتشر نکرده‌اید.
        </div>
        `;
      }

      sendHtml(
        res,
        200,
        "پروفایل 👤",
        `

        <div class="card">

          <div class="profile-head">

            <div class="avatar">
              ${escapeHtml(
                user.name.charAt(0)
              )}
            </div>

            <div>

              <div class="username">
                ${escapeHtml(user.name)}
              </div>

              <div class="email">
                ${escapeHtml(user.email)}
              </div>

            </div>

          </div>

          <div class="divider"></div>

          <div class="stats">

            دنبال‌کننده:
            ${followers.rows[0].count}

            &nbsp;&nbsp;

            دنبال‌شونده:
            ${following.rows[0].count}

          </div>

        </div>

        <a href="/profile/edit">
          <button class="full">
            ✏️ ویرایش پروفایل
          </button>
        </a>

        <h3>
          پست‌های من 📱
        </h3>

        ${postsHtml}

        `
      );

      return;
    }

    // ==================================================
    // ویرایش پروفایل
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/profile/edit"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "ویرایش پروفایل ✏️",
        `

        <div class="card">

          <form method="POST" action="/profile/edit">

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

            <button class="full">
              ذخیره تغییرات
            </button>

          </form>

        </div>

        <a href="/profile">
          بازگشت به پروفایل
        </a>

        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/profile/edit"
    ) {

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

        sendHtml(
          res,
          400,
          "خطا",
          `<p class="error">
            نام و ایمیل الزامی است.
          </p>`
        );

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
          <p class="success">
            تغییرات ذخیره شد ✅
          </p>

          <a href="/profile">
            <button class="full">
              مشاهده پروفایل
            </button>
          </a>
          `
        );

      } catch (error) {

        console.error(error);

        sendHtml(
          res,
          400,
          "خطا",
          `
          <p class="error">
            این ایمیل قبلاً استفاده شده است.
          </p>
          `
        );
      }

      return;
    }

    // ==================================================
    // تنظیمات
    // ==================================================

    if (
      req.method === "GET" &&
      path === "/settings"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "تنظیمات ⚙️",
        `

        <div class="card">

          <h3>
            تنظیمات برنامه
          </h3>

          <p class="success">
            حساب شما فعال است. ✅
          </p>

          <p class="small">
            حساب فعلی:
            ${escapeHtml(user.email)}
          </p>

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
      path === "/logout"
    ) {

      await deleteSession(req);

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
      <div class="card empty">

        <h2>
          صفحه پیدا نشد
        </h2>

        <a href="/">
          <button>
            🏠 صفحه اصلی
          </button>
        </a>

      </div>
      `
    );

  } catch (error) {

    console.error(
      "SERVER ERROR:",
      error
    );

    sendHtml(
      res,
      500,
      "خطای سرور",
      `
      <div class="card">

        <h2 class="error">
          خطای سرور
        </h2>

        <p>
          مشکلی در اجرای درخواست رخ داد.
        </p>

        <a href="/">
          <button class="full">
            بازگشت به صفحه اصلی
          </button>
        </a>

      </div>
      `
    );
  }

});

// ======================================================
// اجرای برنامه
// ======================================================

async function startServer() {

  try {

    await createTables();

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
