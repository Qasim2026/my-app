const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const port = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
    const i = part.indexOf("=");
    if (i === -1) return;

    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();

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
    "INSERT INTO sessions (session_id, user_id) VALUES ($1, $2)",
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
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.session_id = $1
    `,
    [sessionId]
  );

  return result.rows[0] || null;
}

async function deleteSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.sessionId;

  if (sessionId) {
    await pool.query(
      "DELETE FROM sessions WHERE session_id = $1",
      [sessionId]
    );
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(new Error("Request too large"));
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
  const headers = { Location: location };

  if (cookie) {
    headers["Set-Cookie"] = cookie;
  }

  res.writeHead(302, headers);
  res.end();
}

function page(title, content) {
  return `
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
  background: #f2f4f7;
  font-family: Arial, Tahoma, sans-serif;
  color: #222;
  padding-bottom: 90px;
}

.container {
  width: 100%;
  max-width: 600px;
  margin: auto;
  background: white;
  min-height: 100vh;
  padding: 20px;
}

h1, h2, h3 {
  margin-top: 8px;
}

input, textarea, select {
  width: 100%;
  padding: 13px;
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

button {
  border: 0;
  border-radius: 10px;
  padding: 12px 18px;
  margin: 5px 0;
  font-size: 15px;
  cursor: pointer;
  background: #222;
  color: white;
}

.full {
  width: 100%;
}

.blue {
  background: #1877f2;
}

.green {
  background: #16833b;
}

.red {
  background: #b00020;
}

.gray {
  background: #777;
}

.card {
  background: #f7f7f7;
  border-radius: 15px;
  padding: 16px;
  margin: 15px 0;
}

.post {
  background: white;
  border: 1px solid #ddd;
  border-radius: 15px;
  padding: 15px;
  margin: 15px 0;
}

.post-header {
  font-weight: bold;
  margin-bottom: 10px;
}

.post-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.8;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.actions form {
  flex: 1;
}

.actions button {
  width: 100%;
}

.job {
  border: 1px solid #ddd;
  border-radius: 15px;
  padding: 16px;
  margin: 15px 0;
}

.job-title {
  font-size: 20px;
  font-weight: bold;
}

.job-city {
  color: #555;
  margin-top: 8px;
}

.job-salary {
  font-weight: bold;
  margin-top: 8px;
}

.job-description {
  white-space: pre-wrap;
  line-height: 1.8;
  margin-top: 10px;
}

.comment {
  background: #f5f5f5;
  border-radius: 10px;
  padding: 10px;
  margin: 8px 0;
}

.message {
  padding: 12px;
  border-radius: 12px;
  margin: 8px 0;
}

.sent {
  background: #e8f1ff;
}

.received {
  background: #eaf7ed;
}

.success {
  color: #087f23;
}

.error {
  color: #b00020;
}

.center {
  text-align: center;
}

.divider {
  height: 1px;
  background: #ddd;
  margin: 22px 0;
}

.small {
  font-size: 13px;
  color: #666;
}

.nav {
  position: fixed;
  bottom: 0;
  right: 0;
  left: 0;
  max-width: 600px;
  margin: auto;
  background: white;
  border-top: 1px solid #ddd;
  display: flex;
  justify-content: space-around;
  padding: 8px 3px;
  z-index: 100;
}

.nav a {
  text-decoration: none;
  color: #222;
  font-size: 12px;
  text-align: center;
}

.nav span {
  display: block;
  font-size: 23px;
}

.top-button {
  display: block;
  width: 100%;
  margin: 10px 0;
}

a {
  color: #222;
  text-decoration: none;
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

function send(res, status, title, content) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(page(title, content));
}

function nav() {
  return `
  <div class="nav">
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
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(post_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      id SERIAL PRIMARY KEY,
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(follower_id, following_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      salary TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("All database tables are ready.");
}

const server = http.createServer(async (req, res) => {
  try {

    /* =========================
       صفحه اصلی
    ========================= */

    if (req.method === "GET" && req.url === "/") {
      const user = await getSession(req);

      if (!user) {
        send(
          res,
          200,
          "خوش آمدید",
          `
          <div class="center" style="margin-top:100px">
            <h1>خوش آمدید 👋</h1>
            <p>به برنامه اجتماعی ما خوش آمدید.</p>

            <a href="/signup">
              <button class="full">ثبت‌نام</button>
            </a>

            <a href="/login">
              <button class="full">ورود</button>
            </a>
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
          users.name,
          users.email,
          COUNT(DISTINCT likes.id) AS like_count,
          COUNT(DISTINCT comments.id) AS comment_count
        FROM posts
        JOIN users ON users.id = posts.user_id
        LEFT JOIN likes ON likes.post_id = posts.id
        LEFT JOIN comments ON comments.post_id = posts.id
        GROUP BY posts.id, users.id
        ORDER BY posts.created_at DESC
      `);

      let postsHtml = "";

      if (posts.rows.length === 0) {
        postsHtml = `
        <div class="card center">
          هنوز پستی منتشر نشده است.
          <br><br>
          اولین پست را تو منتشر کن! 📸
        </div>
        `;
      } else {
        posts.rows.forEach(post => {
          postsHtml += `
          <div class="post">

            <div class="post-header">
              ${escapeHtml(post.name)}
              <div class="small">
                ${escapeHtml(post.email)}
              </div>
            </div>

            <div class="post-text">
              ${escapeHtml(post.content)}
            </div>

            <div class="actions">

              <form method="POST" action="/like">
                <input type="hidden" name="post_id" value="${post.id}">
                <button class="blue" type="submit">
                  ❤️ ${post.like_count}
                </button>
              </form>

              <a href="/comments?post=${post.id}" style="flex:1">
                <button class="full gray">
                  💬 ${post.comment_count}
                </button>
              </a>

            </div>

          </div>
          `;
        });
      }

      send(
        res,
        200,
        "صفحه اجتماعی",
        `
        <h2>خوش آمدی ${escapeHtml(user.name)} 👋</h2>

        ${postsHtml}

        ${nav()}
        `
      );

      return;
    }

    /* =========================
       ثبت نام
    ========================= */

    if (req.method === "GET" && req.url === "/signup") {
      send(
        res,
        200,
        "ثبت نام",
        `
        <h2>ثبت‌نام</h2>

        <form method="POST" action="/signup">
          <input name="name" placeholder="نام" maxlength="100" required>
          <input name="email" type="email" placeholder="ایمیل" maxlength="200" required>
          <input name="password" type="password" placeholder="رمز عبور" minlength="6" required>

          <button class="full" type="submit">
            ثبت‌نام
          </button>
        </form>

        <a href="/">بازگشت</a>
        `
      );

      return;
    }

    if (req.method === "POST" && req.url === "/signup") {
      const data = await readBody(req);

      const name = (data.get("name") || "").trim();
      const email = (data.get("email") || "").trim().toLowerCase();
      const password = data.get("password") || "";

      if (!name || !email || password.length < 6) {
        send(
          res,
          400,
          "خطا",
          `
          <h2 class="error">اطلاعات ثبت‌نام صحیح نیست.</h2>
          <a href="/signup">بازگشت</a>
          `
        );

        return;
      }

      try {
        await pool.query(
          `
          INSERT INTO users(name, email, password)
          VALUES($1, $2, $3)
          `,
          [name, email, hashPassword(password)]
        );

        send(
          res,
          200,
          "ثبت نام موفق",
          `
          <h2 class="success">ثبت‌نام موفق شد ✅</h2>
          <p>حساب شما ساخته شد.</p>

          <a href="/login">
            <button class="full">ورود</button>
          </a>
          `
        );
      } catch (error) {
        if (error.code === "23505") {
          send(
            res,
            400,
            "خطا",
            `
            <h2 class="error">
              این ایمیل قبلاً ثبت شده است.
            </h2>
            <a href="/login">ورود</a>
            `
          );
        } else {
          throw error;
        }
      }

      return;
    }

    /* =========================
       ورود
    ========================= */

    if (req.method === "GET" && req.url === "/login") {
      send(
        res,
        200,
        "ورود",
        `
        <h2>ورود</h2>

        <form method="POST" action="/login">
          <input name="email" type="email" placeholder="ایمیل" required>
          <input name="password" type="password" placeholder="رمز عبور" required>

          <button class="full" type="submit">
            ورود
          </button>
        </form>

        <a href="/">بازگشت</a>
        `
      );

      return;
    }

    if (req.method === "POST" && req.url === "/login") {
      const data = await readBody(req);

      const email = (data.get("email") || "").trim().toLowerCase();
      const password = data.get("password") || "";

      const result = await pool.query(
        `
        SELECT id, name, email
        FROM users
        WHERE email = $1 AND password = $2
        `,
        [email, hashPassword(password)]
      );

      if (result.rows.length === 0) {
        send(
          res,
          401,
          "خطا",
          `
          <h2 class="error">ایمیل یا رمز عبور اشتباه است.</h2>
          <a href="/login">تلاش دوباره</a>
          `
        );

        return;
      }

      const sessionId = await createSession(result.rows[0].id);

      redirect(
        res,
        "/",
        `sessionId=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax`
      );

      return;
    }

    /* =========================
       انتشار پست
    ========================= */

    if (req.method === "GET" && req.url === "/create-post") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      send(
        res,
        200,
        "انتشار پست",
        `
        <h2>انتشار پست جدید ➕</h2>

        <form method="POST" action="/create-post">
          <textarea
            name="content"
            maxlength="5000"
            placeholder="چه چیزی می‌خواهی منتشر کنی؟"
            required
          ></textarea>

          <button class="full blue" type="submit">
            انتشار پست
          </button>
        </form>

        <a href="/">بازگشت</a>

        ${nav()}
        `
      );

      return;
    }

    if (req.method === "POST" && req.url === "/create-post") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);
      const content = (data.get("content") || "").trim();

      if (!content) {
        send(
          res,
          400,
          "خطا",
          `
          <h2 class="error">متن پست خالی است.</h2>
          <a href="/create-post">بازگشت</a>
          `
        );

        return;
      }

      await pool.query(
        `
        INSERT INTO posts(user_id, content)
        VALUES($1, $2)
        `,
        [user.id, content]
      );

      redirect(res, "/");
      return;
    }

    /* =========================
       لایک
    ========================= */

    if (req.method === "POST" && req.url === "/like") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);
      const postId = Number(data.get("post_id"));

      if (Number.isInteger(postId) && postId > 0) {
        await pool.query(
          `
          INSERT INTO likes(post_id, user_id)
          VALUES($1, $2)
          ON CONFLICT(post_id, user_id) DO NOTHING
          `,
          [postId, user.id]
        );
      }

      redirect(res, "/");
      return;
    }

    /* =========================
       کامنت
    ========================= */

    if (req.method === "GET" && req.url.startsWith("/comments")) {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const url = new URL(req.url, "http://localhost");
      const postId = Number(url.searchParams.get("post"));

      const postResult = await pool.query(
        `
        SELECT posts.id, posts.content, users.name
        FROM posts
        JOIN users ON users.id = posts.user_id
        WHERE posts.id = $1
        `,
        [postId]
      );

      if (postResult.rows.length === 0) {
        send(
          res,
          404,
          "خطا",
          `<h2>پست پیدا نشد.</h2>`
        );
        return;
      }

      const comments = await pool.query(
        `
        SELECT comments.comment, comments.created_at, users.name
        FROM comments
        JOIN users ON users.id = comments.user_id
        WHERE comments.post_id = $1
        ORDER BY comments.created_at ASC
        `,
        [postId]
      );

      let commentsHtml = "";

      comments.rows.forEach(comment => {
        commentsHtml += `
        <div class="comment">
          <strong>${escapeHtml(comment.name)}</strong>
          <div>${escapeHtml(comment.comment)}</div>
        </div>
        `;
      });

      if (!commentsHtml) {
        commentsHtml = `
        <div class="card">
          هنوز نظری ثبت نشده است.
        </div>
        `;
      }

      send(
        res,
        200,
        "نظرات",
        `
        <div class="post">
          <strong>${escapeHtml(postResult.rows[0].name)}</strong>
          <div class="post-text">
            ${escapeHtml(postResult.rows[0].content)}
          </div>
        </div>

        <h3>نظرات 💬</h3>

        ${commentsHtml}

        <form method="POST" action="/comments">
          <input type="hidden" name="post_id" value="${postId}">

          <textarea
            name="comment"
            maxlength="1000"
            placeholder="نظر خود را بنویس..."
            required
          ></textarea>

          <button class="full" type="submit">
            ارسال نظر
          </button>
        </form>

        <a href="/">بازگشت</a>

        ${nav()}
        `
      );

      return;
    }

    if (req.method === "POST" && req.url === "/comments") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);
      const postId = Number(data.get("post_id"));
      const comment = (data.get("comment") || "").trim();

      if (
        Number.isInteger(postId) &&
        postId > 0 &&
        comment
      ) {
        await pool.query(
          `
          INSERT INTO comments(post_id, user_id, comment)
          VALUES($1, $2, $3)
          `,
          [postId, user.id, comment]
        );
      }

      redirect(res, `/comments?post=${postId}`);
      return;
    }

    /* =========================
       کاربران
    ========================= */

    if (req.method === "GET" && req.url === "/users") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const result = await pool.query(`
        SELECT
          users.id,
          users.name,
          users.email,
          (
            SELECT COUNT(*)
            FROM follows
            WHERE following_id = users.id
          ) AS followers,
          (
            SELECT COUNT(*)
            FROM follows
            WHERE follower_id = users.id
          ) AS following
        FROM users
        WHERE users.id <> $1
        ORDER BY users.id ASC
      `, [user.id]);

      let htmlUsers = "";

      result.rows.forEach(other => {
        htmlUsers += `
        <div class="card">

          <h3>${escapeHtml(other.name)}</h3>

          <div class="small">
            ${escapeHtml(other.email)}
          </div>

          <p>
            دنبال‌کننده: ${other.followers}
            <br>
            دنبال‌شونده: ${other.following}
          </p>

          <form method="POST" action="/follow">
            <input type="hidden" name="user_id" value="${other.id}">
            <button class="green full" type="submit">
              👥 دنبال کردن
            </button>
          </form>

          <a href="/send-message?to=${other.id}">
            <button class="blue full">
              💬 پیام
            </button>
          </a>

        </div>
        `;
      });

      if (!htmlUsers) {
        htmlUsers = `
        <div class="card">
          کاربر دیگری وجود ندارد.
        </div>
        `;
      }

      send(
        res,
        200,
        "کاربران",
        `
        <h2>کاربران 👥</h2>
        ${htmlUsers}

        <a href="/">بازگشت</a>

        ${nav()}
        `
      );

      return;
    }

    /* =========================
       دنبال کردن
    ========================= */

    if (req.method === "POST" && req.url === "/follow") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);
      const targetId = Number(data.get("user_id"));

      if (
        Number.isInteger(targetId) &&
        targetId > 0 &&
        targetId !== user.id
      ) {
        await pool.query(
          `
          INSERT INTO follows(follower_id, following_id)
          VALUES($1, $2)
          ON CONFLICT(follower_id, following_id) DO NOTHING
          `,
          [user.id, targetId]
        );
      }

      redirect(res, "/users");
      return;
    }

    /* =========================
       جستجو
    ========================= */

    if (req.method === "GET" && req.url === "/search") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      send(
        res,
        200,
        "جستجو",
        `
        <h2>جستجو 🔎</h2>

        <form method="GET" action="/search-results">
          <input
            name="q"
            placeholder="نام کاربر، شغل یا موضوع..."
            maxlength="200"
            required
          >

          <select name="type">
            <option value="all">همه</option>
            <option value="users">کاربران</option>
            <option value="posts">پست‌ها</option>
            <option value="jobs">کارها</option>
          </select>

          <button class="full blue">
            جستجو 🔎
          </button>
        </form>

        <a href="/users">
          <button class="full">
            👥 مشاهده همه کاربران
          </button>
        </a>

        <a href="/jobs">
          <button class="full green">
            💼 مشاهده آگهی‌های کار
          </button>
        </a>

        ${nav()}
        `
      );

      return;
    }

    /* =========================
       نتیجه جستجو
    ========================= */

    if (req.method === "GET" && req.url.startsWith("/search-results")) {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const url = new URL(req.url, "http://localhost");
      const q = (url.searchParams.get("q") || "").trim();
      const type = url.searchParams.get("type") || "all";

      const like = `%${q}%`;

      let resultHtml = "";

      if (type === "all" || type === "users") {
        const users = await pool.query(
          `
          SELECT id, name, email
          FROM users
          WHERE id <> $1
            AND (name ILIKE $2 OR email ILIKE $2)
          ORDER BY id DESC
          LIMIT 30
          `,
          [user.id, like]
        );

        users.rows.forEach(row => {
          resultHtml += `
          <div class="card">
            <h3>👤 ${escapeHtml(row.name)}</h3>
            <div class="small">${escapeHtml(row.email)}</div>

            <form method="POST" action="/follow">
              <input type="hidden" name="user_id" value="${row.id}">
              <button class="green full">
                دنبال کردن
              </button>
            </form>
          </div>
          `;
        });
      }

      if (type === "all" || type === "posts") {
        const posts = await pool.query(
          `
          SELECT posts.id, posts.content, users.name
          FROM posts
          JOIN users ON users.id = posts.user_id
          WHERE posts.content ILIKE $1
             OR users.name ILIKE $1
          ORDER BY posts.created_at DESC
          LIMIT 30
          `,
          [like]
        );

        posts.rows.forEach(row => {
          resultHtml += `
          <div class="post">
            <strong>${escapeHtml(row.name)}</strong>

            <div class="post-text">
              ${escapeHtml(row.content)}
            </div>

            <a href="/comments?post=${row.id}">
              💬 مشاهده نظرات
            </a>
          </div>
          `;
        });
      }

      if (type === "all" || type === "jobs") {
        const jobs = await pool.query(
          `
          SELECT jobs.*, users.name
          FROM jobs
          JOIN users ON users.id = jobs.user_id
          WHERE jobs.title ILIKE $1
             OR jobs.city ILIKE $1
             OR jobs.salary ILIKE $1
             OR jobs.description ILIKE $1
          ORDER BY jobs.created_at DESC
          LIMIT 30
          `,
          [like]
        );

        jobs.rows.forEach(job => {
          resultHtml += `
          <div class="job">
            <div class="job-title">
              💼 ${escapeHtml(job.title)}
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

            <p class="small">
              ثبت شده توسط ${escapeHtml(job.name)}
            </p>

            <a href="/send-message?to=${job.user_id}">
              <button class="blue full">
                💬 تماس با آگهی‌دهنده
              </button>
            </a>
          </div>
          `;
        });
      }

      if (!resultHtml) {
        resultHtml = `
        <div class="card center">
          نتیجه‌ای پیدا نشد.
        </div>
        `;
      }

      send(
        res,
        200,
        "نتایج جستجو",
        `
        <h2>نتایج جستجو 🔎</h2>

        <p>
          نتیجه برای:
          <strong>${escapeHtml(q)}</strong>
        </p>

        ${resultHtml}

        <a href="/search">
          <button class="full">جستجوی دوباره</button>
        </a>

        ${nav()}
        `
      );

      return;
    }

    /* =========================
       آگهی‌های کار
    ========================= */

    if (req.method === "GET" && req.url === "/jobs") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const result = await pool.query(`
        SELECT jobs.*, users.name
        FROM jobs
        JOIN users ON users.id = jobs.user_id
        ORDER BY jobs.created_at DESC
        LIMIT 100
      `);

      let jobsHtml = "";

      result.rows.forEach(job => {
        jobsHtml += `
        <div class="job">

          <div class="job-title">
            ${escapeHtml(job.title)}
          </div>

          <div class="job-city">
            📍 شهر: ${escapeHtml(job.city)}
          </div>

          <div class="job-salary">
            💰 حقوق: ${escapeHtml(job.salary)}
          </div>

          <div class="job-description">
            ${escapeHtml(job.description)}
          </div>

          <p class="small">
            آگهی‌دهنده: ${escapeHtml(job.name)}
          </p>

          <a href="/send-message?to=${job.user_id}">
            <button class="blue full">
              💬 پیام به آگهی‌دهنده
            </button>
          </a>

        </div>
        `;
      });

      if (!jobsHtml) {
        jobsHtml = `
        <div class="card center">
          هنوز آگهی کاری ثبت نشده است.
        </div>
        `;
      }

      send(
        res,
        200,
        "جستجوی کار",
        `
        <h2>جستجوی کار 🔎</h2>

        <a href="/create-job">
          <button class="green full">
            ➕ ثبت آگهی کار
          </button>
        </a>

        ${jobsHtml}

        ${nav()}
        `
      );

      return;
    }

    /* =========================
       ثبت آگهی کار
    ========================= */

    if (req.method === "GET" && req.url === "/create-job") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      send(
        res,
        200,
        "ثبت آگهی کار",
        `
        <h2>ثبت آگهی کار 💼</h2>

        <p class="small">
          آگهی شما در بخش جستجوی کار نمایش داده می‌شود.
        </p>

        <form method="POST" action="/create-job">

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

          <button class="green full">
            ثبت آگهی
          </button>

        </form>

        <a href="/jobs">
          بازگشت به جستجوی کار
        </a>

        ${nav()}
        `
      );

      return;
    }

    if (req.method === "POST" && req.url === "/create-job") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const title = (data.get("title") || "").trim();
      const city = (data.get("city") || "").trim();
      const salary = (data.get("salary") || "").trim();
      const description = (data.get("description") || "").trim();

      if (!title || !city || !salary || !description) {
        send(
          res,
          400,
          "خطا",
          `
          <h2 class="error">
            همه قسمت‌ها را کامل کن.
          </h2>

          <a href="/create-job">بازگشت</a>
          `
        );

        return;
      }

      await pool.query(
        `
        INSERT INTO jobs
        (user_id, title, city, salary, description)
        VALUES($1, $2, $3, $4, $5)
        `,
        [user.id, title, city, salary, description]
      );

      redirect(res, "/jobs");
      return;
    }

    /* =========================
       پیام‌ها
    ========================= */

    if (req.method === "GET" && req.url === "/messages") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const users = await pool.query(
        `
        SELECT id, name, email
        FROM users
        WHERE id <> $1
        ORDER BY id ASC
        `,
        [user.id]
      );

      let usersHtml = "";

      users.rows.forEach(other => {
        usersHtml += `
        <div class="card">

          <h3>${escapeHtml(other.name)}</h3>

          <div class="small">
            ${escapeHtml(other.email)}
          </div>

          <a href="/send-message?to=${other.id}">
            <button class="blue full">
              💬 باز کردن گفتگو
            </button>
          </a>

        </div>
        `;
      });

      if (!usersHtml) {
        usersHtml = `
        <div class="card">
          کاربر دیگری وجود ندارد.
        </div>
        `;
      }

      send(
        res,
        200,
        "پیام‌ها",
        `
        <h2>پیام‌ها 💬</h2>

        ${usersHtml}

        ${nav()}
        `
      );

      return;
    }

    /* =========================
       گفت‌وگو
    ========================= */

    if (req.method === "GET" && req.url.startsWith("/send-message")) {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const url = new URL(req.url, "http://localhost");
      const receiverId = Number(url.searchParams.get("to"));

      if (!Number.isInteger(receiverId) || receiverId <= 0) {
        send(res, 400, "خطا", `<h2>گیرنده معتبر نیست.</h2>`);
        return;
      }

      const receiver = await pool.query(
        `
        SELECT id, name, email
        FROM users
        WHERE id = $1
        `,
        [receiverId]
      );

      if (receiver.rows.length === 0) {
        send(res, 404, "خطا", `<h2>کاربر پیدا نشد.</h2>`);
        return;
      }

      const messages = await pool.query(
        `
        SELECT
          messages.message,
          messages.created_at,
          messages.sender_id,
          users.name
        FROM messages
        JOIN users ON users.id = messages.sender_id
        WHERE
          (messages.sender_id = $1 AND messages.receiver_id = $2)
          OR
          (messages.sender_id = $2 AND messages.receiver_id = $1)
        ORDER BY messages.created_at ASC
        `,
        [user.id, receiverId]
      );

      let messagesHtml = "";

      messages.rows.forEach(message => {
        const cls =
          message.sender_id === user.id
            ? "message sent"
            : "message received";

        messagesHtml += `
        <div class="${cls}">
          <strong>${escapeHtml(message.name)}</strong>
          <div>
            ${escapeHtml(message.message)}
          </div>
        </div>
        `;
      });

      if (!messagesHtml) {
        messagesHtml = `
        <div class="card">
          هنوز پیامی در این گفتگو وجود ندارد.
        </div>
        `;
      }

      send(
        res,
        200,
        "گفتگو",
        `
        <h2>
          گفت‌وگو با ${escapeHtml(receiver.rows[0].name)} 💬
        </h2>

        <div class="small">
          ${escapeHtml(receiver.rows[0].email)}
        </div>

        <div class="divider"></div>

        ${messagesHtml}

        <form method="POST" action="/send-message">

          <input
            type="hidden"
            name="receiver_id"
            value="${receiverId}"
          >

          <textarea
            name="message"
            maxlength="5000"
            placeholder="پیام خود را بنویس..."
            required
          ></textarea>

          <button class="blue full">
            ارسال پیام 📤
          </button>

        </form>

        <a href="/messages">
          بازگشت به پیام‌ها
        </a>

        ${nav()}
        `
      );

      return;
    }

    if (req.method === "POST" && req.url === "/send-message") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const receiverId = Number(data.get("receiver_id"));
      const message = (data.get("message") || "").trim();

      if (
        Number.isInteger(receiverId) &&
        receiverId > 0 &&
        receiverId !== user.id &&
        message
      ) {
        const receiver = await pool.query(
          "SELECT id FROM users WHERE id = $1",
          [receiverId]
        );

        if (receiver.rows.length > 0) {
          await pool.query(
            `
            INSERT INTO messages
            (sender_id, receiver_id, message)
            VALUES($1, $2, $3)
            `,
            [user.id, receiverId, message]
          );
        }
      }

      redirect(
        res,
        `/send-message?to=${encodeURIComponent(receiverId)}`
      );

      return;
    }

    /* =========================
       پروفایل
    ========================= */

    if (req.method === "GET" && req.url === "/profile") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const followers = await pool.query(
        `
        SELECT COUNT(*) AS count
        FROM follows
        WHERE following_id = $1
        `,
        [user.id]
      );

      const following = await pool.query(
        `
        SELECT COUNT(*) AS count
        FROM follows
        WHERE follower_id = $1
        `,
        [user.id]
      );

      const posts = await pool.query(
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
        <div class="post">
          <div class="post-text">
            ${escapeHtml(post.content)}
          </div>
        </div>
        `;
      });

      if (!postsHtml) {
        postsHtml = `
        <div class="card">
          هنوز پستی منتشر نکرده‌اید.
        </div>
        `;
      }

      send(
        res,
        200,
        "پروفایل",
        `
        <h2>پروفایل 👤</h2>

        <div class="card">
          <h2>${escapeHtml(user.name)}</h2>

          <div class="small">
            ${escapeHtml(user.email)}
          </div>

          <p>
            دنبال‌کننده:
            ${followers.rows[0].count}
          </p>

          <p>
            دنبال‌شونده:
            ${following.rows[0].count}
          </p>
        </div>

        <a href="/edit-profile">
          <button class="full">
            ویرایش پروفایل ✏️
          </button>
        </a>

        <h3>پست‌های من 📱</h3>

        ${postsHtml}

        ${nav()}
        `
      );

      return;
    }

    /* =========================
       ویرایش پروفایل
    ========================= */

    if (req.method === "GET" && req.url === "/edit-profile") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      send(
        res,
        200,
        "ویرایش پروفایل",
        `
        <h2>ویرایش پروفایل ✏️</h2>

        <form method="POST" action="/edit-profile">

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

          <button class="full blue">
            ذخیره تغییرات
          </button>

        </form>

        <a href="/profile">بازگشت به پروفایل</a>
        `
      );

      return;
    }

    if (req.method === "POST" && req.url === "/edit-profile") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const data = await readBody(req);

      const name = (data.get("name") || "").trim();
      const email = (data.get("email") || "").trim().toLowerCase();

      if (!name || !email) {
        send(
          res,
          400,
          "خطا",
          `
          <h2 class="error">نام و ایمیل الزامی است.</h2>
          <a href="/edit-profile">بازگشت</a>
          `
        );

        return;
      }

      try {
        await pool.query(
          `
          UPDATE users
          SET name = $1, email = $2
          WHERE id = $3
          `,
          [name, email, user.id]
        );

        send(
          res,
          200,
          "موفق",
          `
          <h2 class="success">
            تغییرات ذخیره شد ✅
          </h2>

          <a href="/profile">
            <button class="full">
              مشاهده پروفایل
            </button>
          </a>
          `
        );
      } catch (error) {
        if (error.code === "23505") {
          send(
            res,
            400,
            "خطا",
            `
            <h2 class="error">
              این ایمیل قبلاً استفاده شده است.
            </h2>

            <a href="/edit-profile">بازگشت</a>
            `
          );
        } else {
          throw error;
        }
      }

      return;
    }

    /* =========================
       تنظیمات
    ========================= */

    if (req.method === "GET" && req.url === "/settings") {
      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      send(
        res,
        200,
        "تنظیمات",
        `
        <h2>تنظیمات ⚙️</h2>

        <div class="card">
          <p>حساب شما فعال است. ✅</p>

          <p class="small">
            شما با حساب
            ${escapeHtml(user.email)}
            وارد شده‌اید.
          </p>
        </div>

        ${nav()}
        `
      );

      return;
    }

    /* =========================
       خروج
    ========================= */

    if (req.method === "GET" && req.url === "/logout") {
      await deleteSession(req);

      redirect(
        res,
        "/",
        "sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
      );

      return;
    }

    /* =========================
       صفحه پیدا نشد
    ========================= */

    send(
      res,
      404,
      "یافت نشد",
      `
      <h2>صفحه پیدا نشد.</h2>

      <a href="/">
        <button class="full">
          صفحه اصلی
        </button>
      </a>
      `
    );

  } catch (error) {

    console.error("SERVER ERROR:", error);

    send(
      res,
      500,
      "خطای سرور",
      `
      <h2 class="error">
        خطای سرور
      </h2>

      <p>
        مشکلی در اجرای درخواست رخ داد.
      </p>

      <a href="/">
        بازگشت به صفحه اصلی
      </a>
      `
    );
  }
});

createTables()
  .then(() => {
    server.listen(port, "0.0.0.0", () => {
      console.log("Server running on port " + port);
    });
  })
  .catch(error => {
    console.error("Database initialization error:", error);

    server.listen(port, "0.0.0.0", () => {
      console.log("Server running on port " + port);
    });
  });
