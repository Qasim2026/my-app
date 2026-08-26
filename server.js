const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const port = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ==================================================
// ابزارهای کمکی
// ==================================================

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
    SELECT users.id, users.name, users.email
    FROM sessions
    INNER JOIN users
      ON users.id = sessions.user_id
    WHERE sessions.session_id = $1
    `,
    [sessionId]
  );

  if (result.rows.length === 0) return null;

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

function sendHtml(res, statusCode, title, content) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(html(title, content));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 1024 * 1024) {
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

// ==================================================
// قالب ظاهری
// ==================================================

function html(title, content) {
  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width, initial-scale=1.0">

<meta name="description"
      content="شبکه اجتماعی و کاریابی">

<title>${escapeHtml(title)}</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #f2f4f7;
  font-family: Arial, Tahoma, sans-serif;
  color: #111;
}

.phone {
  width: 100%;
  max-width: 520px;
  min-height: 100vh;
  margin: auto;
  background: #fff;
  box-shadow: 0 0 25px rgba(0,0,0,.08);
  padding-bottom: 90px;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  border-bottom: 1px solid #ddd;
  padding: 16px;
  text-align: center;
}

.topbar h2 {
  margin: 0;
}

.content {
  padding: 15px;
}

.card {
  background: #fff;
  border: 1px solid #e1e1e1;
  border-radius: 16px;
  margin-bottom: 15px;
  overflow: hidden;
}

.card-padding {
  padding: 15px;
}

.post-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
}

.avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #222;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.post-name {
  font-weight: bold;
}

.post-email {
  color: #777;
  font-size: 12px;
}

.post-image {
  width: 100%;
  max-height: 500px;
  object-fit: cover;
  display: block;
}

.post-text {
  padding: 15px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.8;
}

.actions {
  display: flex;
  gap: 8px;
  padding: 0 15px 15px;
  flex-wrap: wrap;
}

.actions button {
  flex: 1;
}

button {
  border: none;
  border-radius: 10px;
  padding: 11px 15px;
  background: #222;
  color: white;
  font-size: 14px;
  cursor: pointer;
}

button:hover {
  opacity: .9;
}

.red {
  background: #b00020;
}

.green {
  background: #087f23;
}

.blue {
  background: #2457d6;
}

input,
textarea,
select {
  width: 100%;
  padding: 13px;
  margin: 7px 0;
  border: 1px solid #ccc;
  border-radius: 10px;
  font-size: 16px;
  font-family: Arial, Tahoma, sans-serif;
}

textarea {
  min-height: 130px;
  resize: vertical;
}

.main-button {
  width: 100%;
  margin: 7px 0;
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

.job-card {
  background: #f7f7f7;
  border-radius: 15px;
  padding: 15px;
  margin: 12px 0;
}

.job-title {
  font-size: 18px;
  font-weight: bold;
}

.job-city {
  color: #555;
  margin-top: 7px;
}

.job-salary {
  font-weight: bold;
  margin-top: 7px;
}

.user-card {
  background: #f7f7f7;
  padding: 15px;
  border-radius: 15px;
  margin: 12px 0;
}

.comment {
  background: #f5f5f5;
  border-radius: 12px;
  padding: 10px;
  margin-top: 8px;
}

.comment-name {
  font-weight: bold;
}

.message {
  padding: 12px;
  border-radius: 12px;
  margin: 8px 0;
}

.sent {
  background: #eeeeee;
}

.received {
  background: #e8f5e9;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 520px;
  background: white;
  border-top: 1px solid #ddd;
  display: flex;
  justify-content: space-around;
  padding: 9px 4px;
  z-index: 20;
}

.bottom-nav a {
  text-decoration: none;
  color: #222;
  font-size: 12px;
  text-align: center;
}

.bottom-nav span {
  display: block;
  font-size: 21px;
}

.back {
  display: block;
  text-align: center;
  margin-top: 15px;
  color: #222;
  font-weight: bold;
}

.empty {
  text-align: center;
  color: #777;
  padding: 30px 10px;
}

</style>

</head>

<body>

<div class="phone">

${content}

</div>

</body>

</html>
`;
}

// ==================================================
// نوار پایین برنامه
// ==================================================

function bottomNav() {
  return `
  <div class="bottom-nav">

    <a href="/">
      <span>🏠</span>
      خانه
    </a>

    <a href="/search">
      <span>🔎</span>
      جستجو
    </a>

    <a href="/create-post">
      <span>➕</span>
      انتشار
    </a>

    <a href="/messages">
      <span>💬</span>
      پیام
    </a>

    <a href="/profile">
      <span>👤</span>
      پروفایل
    </a>

  </div>
  `;
}

// ==================================================
// ساخت جداول
// ==================================================

async function createTables() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      text TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
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
      UNIQUE(follower_id, following_id),
      CHECK(follower_id <> following_id)
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

  console.log("All database tables are ready.");
}

// ==================================================
// سرور
// ==================================================

const server = http.createServer(async (req, res) => {

  try {

    const user = await getSession(req);

    // ==================================================
    // صفحه اصلی
    // ==================================================

    if (req.method === "GET" && req.url === "/") {

      if (!user) {

        sendHtml(
          res,
          200,
          "شبکه اجتماعی",
          `
          <div class="content center">

            <div style="padding-top:100px">

              <h1>
                شبکه اجتماعی ما 🌐
              </h1>

              <p>
                شبکه اجتماعی + کاریابی
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

          </div>
          `
        );

        return;
      }

      const postsResult = await pool.query(`
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
          ) AS comment_count
        FROM posts
        INNER JOIN users
          ON users.id = posts.user_id
        ORDER BY posts.created_at DESC
        LIMIT 50
      `);

      let postsHtml = "";

      if (postsResult.rows.length === 0) {

        postsHtml = `
          <div class="empty">
            هنوز پستی منتشر نشده است.
            <br><br>
            اولین پست را تو منتشر کن! 📸
          </div>
        `;

      } else {

        for (const post of postsResult.rows) {

          const date =
            new Date(post.created_at)
              .toLocaleString("fa-IR");

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
            <div class="card">

              <div class="post-header">

                <div class="avatar">
                  ${escapeHtml(
                    (post.name || "?").charAt(0)
                  )}
                </div>

                <div>

                  <div class="post-name">
                    ${escapeHtml(post.name)}
                  </div>

                  <div class="post-email">
                    ${escapeHtml(post.email)}
                  </div>

                </div>

              </div>

              ${imageHtml}

              <div class="post-text">
                ${escapeHtml(post.text)}
              </div>

              <div class="actions">

                <form method="POST"
                      action="/like"
                      style="flex:1">

                  <input
                    type="hidden"
                    name="post_id"
                    value="${post.id}"
                  >

                  <button
                    type="submit"
                    class="main-button"
                  >
                    ❤️ ${post.like_count}
                  </button>

                </form>

                <a
                  href="/post?id=${post.id}"
                  style="flex:1"
                >
                  <button
                    type="button"
                    class="main-button"
                  >
                    💬 ${post.comment_count}
                  </button>
                </a>

              </div>

              <div
                class="muted"
                style="padding:0 15px 15px"
              >
                ${escapeHtml(date)}
              </div>

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
          <h2>صفحه اجتماعی 🏠</h2>
        </div>

        <div class="content">

          <div class="card card-padding center">

            <h3>
              خوش آمدی ${escapeHtml(user.name)} 👋
            </h3>

            <a href="/create-post">
              <button class="blue">
                ➕ انتشار پست جدید
              </button>
            </a>

          </div>

          ${postsHtml}

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    // ==================================================
    // ثبت نام
    // ==================================================

    if (req.method === "GET" && req.url === "/signup") {

      sendHtml(
        res,
        200,
        "ثبت‌نام",
        `
        <div class="content">

          <h2 class="center">
            ثبت‌نام
          </h2>

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

            <button
              type="submit"
              class="main-button"
            >
              ثبت‌نام
            </button>

          </form>

          <a class="back" href="/login">
            قبلاً حساب ساخته‌ام
          </a>

        </div>
        `
      );

      return;
    }

    if (req.method === "POST" && req.url === "/signup") {

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
          `
          <div class="content center">

            <h2 class="error">
              اطلاعات ناقص است.
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
          <div class="content center">

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
          "ثبت‌نام موفق",
          `
          <div class="content center">

            <h2 class="success">
              ثبت‌نام موفق شد ✅
            </h2>

            <a href="/login">
              <button>
                ورود به حساب
              </button>
            </a>

          </div>
          `
        );

      } catch (error) {

        console.error(error);

        if (error.code === "23505") {

          sendHtml(
            res,
            400,
            "خطا",
            `
            <div class="content center">

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
            <div class="content center">

              <h2 class="error">
                خطا در ثبت‌نام
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

    if (req.method === "GET" && req.url === "/login") {

      sendHtml(
        res,
        200,
        "ورود",
        `
        <div class="content">

          <h2 class="center">
            ورود
          </h2>

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

            <button
              type="submit"
              class="main-button"
            >
              ورود
            </button>

          </form>

          <a class="back" href="/signup">
            ساخت حساب جدید
          </a>

        </div>
        `
      );

      return;
    }

    if (req.method === "POST" && req.url === "/login") {

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
          "ورود",
          `
          <div class="content center">

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

      const sessionId =
        await createSession(result.rows[0].id);

      const cookie =
        `sessionId=${encodeURIComponent(sessionId)}; ` +
        `HttpOnly; Path=/; SameSite=Lax`;

      redirect(res, "/", cookie);

      return;
    }

    // ==================================================
    // انتشار پست
    // ==================================================

    if (
      req.method === "GET" &&
      req.url === "/create-post"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "انتشار پست",
        `
        <div class="topbar">
          <h2>انتشار پست ➕</h2>
        </div>

        <div class="content">

          <div class="card card-padding">

            <form
              method="POST"
              action="/create-post"
            >

              <textarea
                name="text"
                maxlength="5000"
                placeholder="چه چیزی می‌خواهی منتشر کنی؟"
                required
              ></textarea>

              <input
                name="image_url"
                type="url"
                placeholder="لینک تصویر، در صورت تمایل"
              >

              <button
                type="submit"
                class="main-button blue"
              >
                انتشار پست 📤
              </button>

            </form>

          </div>

          <a class="back" href="/">
            بازگشت به صفحه اجتماعی
          </a>

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      req.url === "/create-post"
    ) {

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
          <div class="content center">

            <h2 class="error">
              متن پست نمی‌تواند خالی باشد.
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

      redirect(res, "/");

      return;
    }

    // ==================================================
    // لایک
    // ==================================================

    if (
      req.method === "POST" &&
      req.url === "/like"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const postId =
        Number(data.get("post_id"));

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
    // نمایش پست و کامنت‌ها
    // ==================================================

    if (
      req.method === "GET" &&
      req.url.startsWith("/post")
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const url =
        new URL(req.url, "http://localhost");

      const postId =
        Number(url.searchParams.get("id"));

      const postResult =
        await pool.query(
          `
          SELECT
            posts.*,
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
          "پست",
          `
          <div class="content center">
            <h2>پست پیدا نشد.</h2>
            <a href="/">بازگشت</a>
          </div>
          `
        );

        return;
      }

      const post = postResult.rows[0];

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
          [postId]
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

          </div>
        `;
      });

      if (!commentsHtml) {
        commentsHtml = `
          <div class="empty">
            هنوز کامنتی وجود ندارد.
          </div>
        `;
      }

      sendHtml(
        res,
        200,
        "پست",
        `
        <div class="topbar">
          <h2>پست 💬</h2>
        </div>

        <div class="content">

          <div class="card">

            <div class="post-header">

              <div class="avatar">
                ${escapeHtml(
                  post.name.charAt(0)
                )}
              </div>

              <div>
                <div class="post-name">
                  ${escapeHtml(post.name)}
                </div>
                <div class="post-email">
                  ${escapeHtml(post.email)}
                </div>
              </div>

            </div>

            ${
              post.image_url
                ? `
                  <img
                    class="post-image"
                    src="${escapeHtml(post.image_url)}"
                    alt="تصویر"
                  >
                `
                : ""
            }

            <div class="post-text">
              ${escapeHtml(post.text)}
            </div>

          </div>

          <div class="card card-padding">

            <h3>
              نظرات 💬
            </h3>

            ${commentsHtml}

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

              <textarea
                name="comment"
                maxlength="2000"
                placeholder="نظر خود را بنویس..."
                required
              ></textarea>

              <button
                type="submit"
                class="main-button"
              >
                ارسال نظر
              </button>

            </form>

          </div>

          <a class="back" href="/">
            بازگشت
          </a>

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    // ==================================================
    // ثبت کامنت
    // ==================================================

    if (
      req.method === "POST" &&
      req.url === "/comment"
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
          [
            postId,
            user.id,
            comment
          ]
        );
      }

      redirect(
        res,
        `/post?id=${encodeURIComponent(postId)}`
      );

      return;
    }

    // ==================================================
    // کاربران
    // ==================================================

    if (
      req.method === "GET" &&
      req.url === "/users"
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
          ORDER BY id DESC
          `,
          [user.id]
        );

      let usersHtml = "";

      usersResult.rows.forEach(other => {

        usersHtml += `
          <div class="user-card">

            <div class="post-header">

              <div class="avatar">
                ${escapeHtml(
                  other.name.charAt(0)
                )}
              </div>

              <div>

                <div class="post-name">
                  ${escapeHtml(other.name)}
                </div>

                <div class="post-email">
                  ${escapeHtml(other.email)}
                </div>

              </div>

            </div>

            <a href="/user?id=${other.id}">
              <button class="main-button">
                مشاهده پروفایل
              </button>
            </a>

          </div>
        `;
      });

      if (!usersHtml) {
        usersHtml = `
          <div class="empty">
            کاربر دیگری وجود ندارد.
          </div>
        `;
      }

      sendHtml(
        res,
        200,
        "کاربران",
        `
        <div class="topbar">
          <h2>کاربران 👥</h2>
        </div>

        <div class="content">

          ${usersHtml}

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    // ==================================================
    // پروفایل کاربر
    // ==================================================

    if (
      req.method === "GET" &&
      req.url.startsWith("/user?")
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const url =
        new URL(req.url, "http://localhost");

      const userId =
        Number(url.searchParams.get("id"));

      const targetResult =
        await pool.query(
          `
          SELECT id, name, email
          FROM users
          WHERE id = $1
          `,
          [userId]
        );

      if (targetResult.rows.length === 0) {

        sendHtml(
          res,
          404,
          "کاربر",
          `
          <div class="content center">
            <h2>کاربر پیدا نشد.</h2>
            <a href="/users">بازگشت</a>
          </div>
          `
        );

        return;
      }

      const target = targetResult.rows[0];

      const followerResult =
        await pool.query(
          `
          SELECT COUNT(*) AS count
          FROM follows
          WHERE following_id = $1
          `,
          [target.id]
        );

      const followingResult =
        await pool.query(
          `
          SELECT COUNT(*) AS count
          FROM follows
          WHERE follower_id = $1
          `,
          [target.id]
        );

      const isFollowingResult =
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

      const postsResult =
        await pool.query(
          `
          SELECT *
          FROM posts
          WHERE user_id = $1
          ORDER BY created_at DESC
          `,
          [target.id]
        );

      let postsHtml = "";

      postsResult.rows.forEach(post => {

        postsHtml += `
          <div class="card">

            ${
              post.image_url
                ? `
                  <img
                    class="post-image"
                    src="${escapeHtml(post.image_url)}"
                    alt="تصویر"
                  >
                `
                : ""
            }

            <div class="post-text">
              ${escapeHtml(post.text)}
            </div>

            <a href="/post?id=${post.id}">
              <button class="main-button">
                💬 مشاهده
              </button>
            </a>

          </div>
        `;
      });

      sendHtml(
        res,
        200,
        "پروفایل کاربر",
        `
        <div class="topbar">
          <h2>پروفایل 👤</h2>
        </div>

        <div class="content">

          <div class="card card-padding center">

            <div
              class="avatar"
              style="
                margin:auto;
                width:70px;
                height:70px;
                font-size:25px;
              "
            >
              ${escapeHtml(
                target.name.charAt(0)
              )}
            </div>

            <h2>
              ${escapeHtml(target.name)}
            </h2>

            <p class="muted">
              ${escapeHtml(target.email)}
            </p>

            <p>
              دنبال‌کننده:
              ${followerResult.rows[0].count}
            </p>

            <p>
              دنبال‌شونده:
              ${followingResult.rows[0].count}
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
                      name="user_id"
                      value="${target.id}"
                    >

                    <button
                      type="submit"
                      class="${
                        isFollowingResult.rows.length
                          ? "red"
                          : "blue"
                      }"
                    >
                      ${
                        isFollowingResult.rows.length
                          ? "لغو دنبال کردن"
                          : "دنبال کردن"
                      }
                    </button>

                  </form>
                `
                : ""
            }

          </div>

          <h3>
            پست‌ها
          </h3>

          ${postsHtml || `
            <div class="empty">
              هنوز پستی منتشر نشده است.
            </div>
          `}

          <a class="back" href="/users">
            بازگشت به کاربران
          </a>

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    // ==================================================
    // دنبال کردن
    // ==================================================

    if (
      req.method === "POST" &&
      req.url === "/follow"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const targetId =
        Number(data.get("user_id"));

      if (
        !Number.isInteger(targetId) ||
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

      if (existing.rows.length) {

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
    // جستجو
    // ==================================================

    if (
      req.method === "GET" &&
      req.url.startsWith("/search")
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const url =
        new URL(req.url, "http://localhost");

      const q =
        (url.searchParams.get("q") || "")
          .trim();

      let usersHtml = "";
      let jobsHtml = "";
      let postsHtml = "";

      if (q) {

        const usersResult =
          await pool.query(
            `
            SELECT id, name, email
            FROM users
            WHERE
              name ILIKE $1
              OR email ILIKE $1
            ORDER BY id DESC
            LIMIT 20
            `,
            [`%${q}%`]
          );

        usersResult.rows.forEach(item => {

          usersHtml += `
            <div class="user-card">

              <strong>
                ${escapeHtml(item.name)}
              </strong>

              <div class="muted">
                ${escapeHtml(item.email)}
              </div>

              <a href="/user?id=${item.id}">
                <button>
                  پروفایل
                </button>
              </a>

            </div>
          `;
        });

        const jobsResult =
          await pool.query(
            `
            SELECT
              jobs.*,
              users.name AS owner_name
            FROM jobs
            INNER JOIN users
              ON users.id = jobs.user_id
            WHERE
              jobs.title ILIKE $1
              OR jobs.city ILIKE $1
              OR jobs.description ILIKE $1
            ORDER BY jobs.created_at DESC
            LIMIT 30
            `,
            [`%${q}%`]
          );

        jobsResult.rows.forEach(job => {

          jobsHtml += `
            <div class="job-card">

              <div class="job-title">
                ${escapeHtml(job.title)}
              </div>

              <div class="job-city">
                📍 ${escapeHtml(job.city)}
              </div>

              <div class="job-salary">
                💰 ${escapeHtml(job.salary)}
              </div>

              <p>
                ${escapeHtml(job.description)}
              </p>

              <div class="muted">
                آگهی‌دهنده:
                ${escapeHtml(job.owner_name)}
              </div>

            </div>
          `;
        });

        const postsResult =
          await pool.query(
            `
            SELECT
              posts.id,
              posts.text,
              posts.image_url,
              users.name
            FROM posts
            INNER JOIN users
              ON users.id = posts.user_id
            WHERE
              posts.text ILIKE $1
              OR users.name ILIKE $1
            ORDER BY posts.created_at DESC
            LIMIT 30
            `,
            [`%${q}%`]
          );

        postsResult.rows.forEach(post => {

          postsHtml += `
            <div class="card">

              <div class="post-header">

                <div class="avatar">
                  ${escapeHtml(
                    post.name.charAt(0)
                  )}
                </div>

                <strong>
                  ${escapeHtml(post.name)}
                </strong>

              </div>

              <div class="post-text">
                ${escapeHtml(post.text)}
              </div>

              <a href="/post?id=${post.id}">
                <button class="main-button">
                  مشاهده پست
                </button>
              </a>

            </div>
          `;
        });
      }

      sendHtml(
        res,
        200,
        "جستجو",
        `
        <div class="topbar">
          <h2>جستجو 🔎</h2>
        </div>

        <div class="content">

          <form method="GET" action="/search">

            <input
              name="q"
              value="${escapeHtml(q)}"
              placeholder="نام کاربر، شغل یا موضوع..."
              required
            >

            <button
              type="submit"
              class="main-button blue"
            >
              جستجو 🔎
            </button>

          </form>

          ${
            q
              ? `
                <div class="divider"></div>

                <h3>👥 کاربران</h3>

                ${
                  usersHtml ||
                  `<div class="empty">کاربری پیدا نشد.</div>`
                }

                <div class="divider"></div>

                <h3>💼 فرصت‌های شغلی</h3>

                ${
                  jobsHtml ||
                  `<div class="empty">آگهی کاری پیدا نشد.</div>`
                }

                <div class="divider"></div>

                <h3>📱 پست‌ها</h3>

                ${
                  postsHtml ||
                  `<div class="empty">پستی پیدا نشد.</div>`
                }
              `
              : `
                <div class="empty">
                  نام کاربر، شغل یا موضوع موردنظر را جستجو کن.
                </div>
              `
          }

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    // ==================================================
    // ثبت آگهی کار
    // ==================================================

    if (
      req.method === "GET" &&
      req.url === "/create-job"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "ثبت آگهی کار",
        `
        <div class="topbar">
          <h2>ثبت آگهی کار 💼</h2>
        </div>

        <div class="content">

          <div class="card card-padding">

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
                class="main-button green"
              >
                ثبت آگهی 💼
              </button>

            </form>

          </div>

          <a class="back" href="/jobs">
            مشاهده آگهی‌های کار
          </a>

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      req.url === "/create-job"
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
          <div class="content center">

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
    // آگهی‌های کار
    // ==================================================

    if (
      req.method === "GET" &&
      req.url === "/jobs"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const jobsResult =
        await pool.query(
          `
          SELECT
            jobs.*,
            users.name AS owner_name,
            users.email AS owner_email
          FROM jobs
          INNER JOIN users
            ON users.id = jobs.user_id
          ORDER BY jobs.created_at DESC
          LIMIT 100
          `
        );

      let jobsHtml = "";

      jobsResult.rows.forEach(job => {

        jobsHtml += `
          <div class="job-card">

            <div class="job-title">
              ${escapeHtml(job.title)}
            </div>

            <div class="job-city">
              📍 ${escapeHtml(job.city)}
            </div>

            <div class="job-salary">
              💰 ${escapeHtml(job.salary)}
            </div>

            <p>
              ${escapeHtml(job.description)}
            </p>

            <div class="muted">
              منتشرکننده:
              ${escapeHtml(job.owner_name)}
            </div>

            ${
              job.user_id !== user.id
                ? `
                  <a href="/send-message?to=${job.user_id}">
                    <button class="main-button blue">
                      💬 تماس با آگهی‌دهنده
                    </button>
                  </a>
                `
                : `
                  <div class="muted">
                    این آگهی توسط شما ثبت شده است.
                  </div>
                `
            }

          </div>
        `;
      });

      sendHtml(
        res,
        200,
        "جستجوی کار",
        `
        <div class="topbar">
          <h2>جستجوی کار 🔎</h2>
        </div>

        <div class="content">

          <a href="/create-job">
            <button class="main-button green">
              ➕ ثبت آگهی کار
            </button>
          </a>

          <form method="GET" action="/search">

            <input
              name="q"
              placeholder="جستجوی شغل یا شهر..."
              required
            >

            <button
              type="submit"
              class="main-button"
            >
              جستجو
            </button>

          </form>

          <div class="divider"></div>

          ${
            jobsHtml ||
            `
            <div class="empty">
              هنوز آگهی کاری ثبت نشده است.
            </div>
            `
          }

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    // ==================================================
    // پیام‌ها
    // ==================================================

    if (
      req.method === "GET" &&
      req.url === "/messages"
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

      usersResult.rows.forEach(other => {

        usersHtml += `
          <div class="user-card">

            <strong>
              ${escapeHtml(other.name)}
            </strong>

            <div class="muted">
              ${escapeHtml(other.email)}
            </div>

            <a
              href="/send-message?to=${other.id}"
            >
              <button class="main-button">
                باز کردن گفتگو 💬
              </button>
            </a>

          </div>
        `;
      });

      sendHtml(
        res,
        200,
        "پیام‌ها",
        `
        <div class="topbar">
          <h2>پیام‌ها 💬</h2>
        </div>

        <div class="content">

          <h3>
            کاربران
          </h3>

          ${
            usersHtml ||
            `
            <div class="empty">
              کاربر دیگری وجود ندارد.
            </div>
            `
          }

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    // ==================================================
    // گفت‌وگو
    // ==================================================

    if (
      req.method === "GET" &&
      req.url.startsWith("/send-message")
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const url =
        new URL(req.url, "http://localhost");

      const receiverId =
        Number(url.searchParams.get("to"));

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
            messages.id,
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

        const cls =
          message.sender_id === user.id
            ? "sent"
            : "received";

        conversationHtml += `
          <div class="message ${cls}">

            <strong>
              ${escapeHtml(message.sender_name)}
            </strong>

            <div>
              ${escapeHtml(message.message)}
            </div>

            <div class="muted">
              ${escapeHtml(
                new Date(
                  message.created_at
                ).toLocaleString("fa-IR")
              )}
            </div>

          </div>
        `;
      });

      if (!conversationHtml) {
        conversationHtml = `
          <div class="empty">
            هنوز پیامی در این گفتگو وجود ندارد.
          </div>
        `;
      }

      sendHtml(
        res,
        200,
        "گفت‌وگو",
        `
        <div class="topbar">
          <h2>
            گفت‌وگو با
            ${escapeHtml(receiver.name)}
            💬
          </h2>
        </div>

        <div class="content">

          ${conversationHtml}

          <div class="card card-padding">

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
                maxlength="5000"
                placeholder="پیام خود را بنویس..."
                required
              ></textarea>

              <button
                type="submit"
                class="main-button blue"
              >
                ارسال پیام 📤
              </button>

            </form>

          </div>

          <a class="back" href="/messages">
            بازگشت به پیام‌ها
          </a>

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    // ==================================================
    // ارسال پیام
    // ==================================================

    if (
      req.method === "POST" &&
      req.url === "/send-message"
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
        receiverId > 0 &&
        receiverId !== user.id &&
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
          VALUES
          ($1, $2, $3)
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
        `/send-message?to=${encodeURIComponent(receiverId)}`
      );

      return;
    }

    // ==================================================
    // پروفایل خود کاربر
    // ==================================================

    if (
      req.method === "GET" &&
      req.url === "/profile"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const followerResult =
        await pool.query(
          `
          SELECT COUNT(*) AS count
          FROM follows
          WHERE following_id = $1
          `,
          [user.id]
        );

      const followingResult =
        await pool.query(
          `
          SELECT COUNT(*) AS count
          FROM follows
          WHERE follower_id = $1
          `,
          [user.id]
        );

      const postsResult =
        await pool.query(
          `
          SELECT *
          FROM posts
          WHERE user_id = $1
          ORDER BY created_at DESC
          `,
          [user.id]
        );

      let postsHtml = "";

      postsResult.rows.forEach(post => {

        postsHtml += `
          <div class="card">

            ${
              post.image_url
                ? `
                  <img
                    class="post-image"
                    src="${escapeHtml(post.image_url)}"
                    alt="تصویر"
                  >
                `
                : ""
            }

            <div class="post-text">
              ${escapeHtml(post.text)}
            </div>

            <a href="/post?id=${post.id}">
              <button class="main-button">
                💬 مشاهده پست
              </button>
            </a>

          </div>
        `;
      });

      sendHtml(
        res,
        200,
        "پروفایل",
        `
        <div class="topbar">
          <h2>پروفایل 👤</h2>
        </div>

        <div class="content">

          <div class="card card-padding center">

            <div
              class="avatar"
              style="
                margin:auto;
                width:75px;
                height:75px;
                font-size:28px;
              "
            >
              ${escapeHtml(
                user.name.charAt(0)
              )}
            </div>

            <h2>
              ${escapeHtml(user.name)}
            </h2>

            <p class="muted">
              ${escapeHtml(user.email)}
            </p>

            <p>
              دنبال‌کننده:
              ${followerResult.rows[0].count}
            </p>

            <p>
              دنبال‌شونده:
              ${followingResult.rows[0].count}
            </p>

            <a href="/edit-profile">
              <button>
                ویرایش پروفایل ✏️
              </button>
            </a>

          </div>

          <h3>
            پست‌های من 📱
          </h3>

          ${
            postsHtml ||
            `
            <div class="empty">
              هنوز پستی منتشر نکرده‌ای.
            </div>
            `
          }

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    // ==================================================
    // ویرایش پروفایل
    // ==================================================

    if (
      req.method === "GET" &&
      req.url === "/edit-profile"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "ویرایش پروفایل",
        `
        <div class="content">

          <h2 class="center">
            ویرایش پروفایل ✏️
          </h2>

          <form
            method="POST"
            action="/edit-profile"
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

          <a class="back" href="/profile">
            بازگشت
          </a>

        </div>
        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      req.url === "/edit-profile"
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

        redirect(res, "/edit-profile");
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
          <div class="content center">

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

        console.error(error);

        sendHtml(
          res,
          400,
          "خطا",
          `
          <div class="content center">

            <h2 class="error">
              این ایمیل قبلاً استفاده شده است.
            </h2>

            <a href="/edit-profile">
              بازگشت
            </a>

          </div>
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
      req.url === "/settings"
    ) {

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "تنظیمات",
        `
        <div class="topbar">
          <h2>تنظیمات ⚙️</h2>
        </div>

        <div class="content">

          <div class="card card-padding">

            <h3>
              حساب شما فعال است ✅
            </h3>

            <p class="muted">
              ${escapeHtml(user.email)}
            </p>

          </div>

          <a href="/edit-profile">
            <button class="main-button">
              ویرایش حساب
            </button>
          </a>

          <a href="/logout">
            <button class="main-button red">
              خروج
            </button>
          </a>

        </div>

        ${bottomNav()}
        `
      );

      return;
    }

    // ==================================================
    // خروج
    // ==================================================

    if (
      req.method === "GET" &&
      req.url === "/logout"
    ) {

      await deleteSession(req);

      const cookie =
        "sessionId=; " +
        "HttpOnly; " +
        "Path=/; " +
        "Max-Age=0; " +
        "SameSite=Lax";

      redirect(res, "/", cookie);

      return;
    }

    // ==================================================
    // صفحه پیدا نشد
    // ==================================================

    sendHtml(
      res,
      404,
      "یافت نشد",
      `
      <div class="content center">

        <h2>
          صفحه پیدا نشد
        </h2>

        <a href="/">
          بازگشت به صفحه اصلی
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
      <div class="content center">

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

// ==================================================
// شروع برنامه
// ==================================================

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
