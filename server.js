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
// صفحه اصلی HTML
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

.small {
  color: #777;
  font-size: 13px;
}

.divider {
  height: 1px;
  background: #ddd;
  margin: 20px 0;
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
// ساخت و اصلاح دیتابیس
// ======================================================

async function createTables() {

  // ------------------------------
  // users
  // ------------------------------

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  // ------------------------------
  // sessions
  // ------------------------------

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ------------------------------
  // posts
  // ------------------------------

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

  // ==================================================
  // تعمیر جدول قدیمی posts
  // ==================================================

  // اگر content وجود نداشته باشد، اضافه می‌شود
  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS content TEXT
  `);

  // اگر created_at وجود نداشته باشد
  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
  `);

  // اگر user_id وجود نداشته باشد
  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS user_id INTEGER
  `);

  // اگر جدول قدیمی ستون text داشته باشد،
  // اطلاعات آن به content منتقل می‌شود.
  const oldTextColumn = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'text'
  `);

  if (oldTextColumn.rows.length > 0) {

    await pool.query(`
      UPDATE posts
      SET content = text
      WHERE content IS NULL
        AND text IS NOT NULL
    `);

    console.log("Old posts.text data copied to posts.content.");
  }

  // برای پست‌های بدون content مقدار خالی می‌گذاریم
  await pool.query(`
    UPDATE posts
    SET content = ''
    WHERE content IS NULL
  `);

  // ------------------------------
  // likes
  // ------------------------------

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

  // ------------------------------
  // comments
  // ------------------------------

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

  // ------------------------------
  // follows
  // ------------------------------

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

  // ------------------------------
  // jobs
  // ------------------------------

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

  // ------------------------------
  // messages
  // ------------------------------

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

  console.log("Database tables checked and repaired successfully.");
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
    // خانه
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
              برنامه اجتماعی شما
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
          </div>
        `;

      } else {

        posts.rows.forEach(post => {

          postsHtml += `
          <div class="card">

            <div class="profile-head">

              <div class="avatar">
                ${escapeHtml(
                  String(post.name || "?").charAt(0)
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
                String(user.name || "?").charAt(0)
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
    // پست جدید
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
          `<p class="error">
            متن پست خالی است.
          </p>`
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
    // نمایش پست
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

      if (!Number.isInteger(postId)) {
        redirect(res, "/");
        return;
      }

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

      if (!commentsHtml) {

        commentsHtml = `
        <div class="empty">
          هنوز نظری ثبت نشده است.
        </div>
        `;
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
                String(post.name || "?").charAt(0)
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
    // نظر
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
                String(user.name || "?").charAt(0)
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

        <a href="/new-post">
          <button class="full">
            ➕ پست جدید
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

      const usersResult =
        await pool.query(
          `
          SELECT id, name, email
          FROM users
          WHERE name ILIKE $1
             OR email ILIKE $1
          ORDER BY id ASC
          LIMIT 30
          `,
          [`%${q}%`]
        );

      let html = "";

      usersResult.rows.forEach(person => {

        html += `
        <div class="card">

          <div class="username">
            ${escapeHtml(person.name)}
          </div>

          <div class="email">
            ${escapeHtml(person.email)}
          </div>

          <a href="/user?id=${person.id}">
            <button class="full">
              مشاهده پروفایل
            </button>
          </a>

        </div>
        `;
      });

      if (!html) {
        html = `
        <div class="empty">
          کاربری پیدا نشد.
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
              placeholder="نام یا ایمیل..."
            >

            <button class="full">
              جستجو
            </button>

          </form>

        </div>

        ${html}
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
            بازگشت
          </button>
        </a>

      </div>
      `
    );
  }

});

// ======================================================
// اجرای سرور
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
