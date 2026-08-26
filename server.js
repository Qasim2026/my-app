const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const port = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===============================
// ابزارها
// ===============================

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
    SELECT users.id, users.name, users.email
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.session_id = $1
    `,
    [sessionId]
  );

  return result.rows.length ? result.rows[0] : null;
}

async function deleteSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.sessionId;

  if (!sessionId) return;

  await pool.query(
    `DELETE FROM sessions WHERE session_id = $1`,
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

// ===============================
// قالب HTML
// ===============================

function html(title, content) {
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
  min-height: 100vh;
  font-family: Arial, Tahoma, sans-serif;
  background: #f2f4f7;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.phone {
  width: 100%;
  max-width: 420px;
  min-height: 650px;
  background: white;
  border-radius: 28px;
  padding: 30px 22px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.15);
  text-align: center;
}

h1,h2,h3 {
  margin-top: 10px;
}

p {
  line-height: 1.8;
}

input,
textarea {
  width: 100%;
  padding: 13px;
  margin: 7px 0;
  border: 1px solid #ccc;
  border-radius: 10px;
  font-size: 16px;
  font-family: Arial,Tahoma,sans-serif;
}

textarea {
  min-height: 100px;
  resize: vertical;
}

button {
  border: none;
  border-radius: 10px;
  padding: 12px 18px;
  margin: 6px;
  font-size: 15px;
  cursor: pointer;
  background: #222;
  color: white;
}

.main-button {
  width: 90%;
  margin: 10px auto;
  display: block;
}

.menu-button {
  display: block;
  width: 90%;
  margin: 10px auto;
}

a {
  color: #222;
  text-decoration: none;
}

.divider {
  height: 1px;
  background: #ddd;
  margin: 25px 0;
}

.welcome {
  margin-top: 70px;
}

.profile-box,
.info-box,
.user-card {
  background: #f7f7f7;
  border-radius: 15px;
  padding: 18px;
  margin: 15px 0;
  text-align: right;
}

.logout {
  background: #b00020;
}

.success {
  color: #087f23;
}

.error {
  color: #b00020;
}

.small-text {
  font-size: 13px;
  color: #666;
}

.chat {
  text-align: right;
  max-height: 420px;
  overflow-y: auto;
  padding: 5px;
}

.message {
  padding: 12px;
  margin: 10px 0;
  border-radius: 15px;
  max-width: 85%;
  word-break: break-word;
}

.message.mine {
  background: #222;
  color: white;
  margin-right: auto;
  margin-left: 0;
}

.message.theirs {
  background: #eeeeee;
  color: #111;
  margin-left: auto;
  margin-right: 0;
}

.message-time {
  font-size: 11px;
  opacity: 0.7;
  margin-top: 5px;
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

// ===============================
// ساخت جداول
// ===============================

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
    CREATE INDEX IF NOT EXISTS sessions_user_id_index
    ON sessions(user_id)
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
    CREATE INDEX IF NOT EXISTS messages_sender_id_index
    ON messages(sender_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS messages_receiver_id_index
    ON messages(receiver_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS messages_created_at_index
    ON messages(created_at)
  `);

  console.log("Database tables are ready.");
}

// ===============================
// سرور
// ===============================

const server = http.createServer(async (req, res) => {

  try {

    // =============================
    // صفحه اصلی
    // =============================

    if (req.method === "GET" && req.url === "/") {

      const user = await getSession(req);

      if (!user) {

        sendHtml(
          res,
          200,
          "صفحه اصلی",
          `
          <div class="welcome">

            <h1>خوش آمدید 👋</h1>

            <p>
              به برنامه ما خوش آمدید.
            </p>

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
        <div class="welcome">

          <h2>
            خوش آمدی ${escapeHtml(user.name)} 👋
          </h2>

          <p class="success">
            ورود موفق بود ✅
          </p>

          <div class="divider"></div>

          <h3>
            صفحه اصلی برنامه
          </h3>

          <p>
            به برنامه خوش آمدی.
          </p>

          <a href="/profile">
            <button class="menu-button">
              پروفایل 👤
            </button>
          </a>

          <a href="/messages">
            <button class="menu-button">
              پیام‌ها 💬
            </button>
          </a>

          <a href="/settings">
            <button class="menu-button">
              تنظیمات ⚙️
            </button>
          </a>

          <a href="/logout">
            <button class="menu-button logout">
              خروج
            </button>
          </a>

        </div>
        `
      );

      return;
    }

    // =============================
    // ثبت نام
    // =============================

    if (req.method === "GET" && req.url === "/signup") {

      sendHtml(
        res,
        200,
        "ثبت‌نام",
        `
        <h2>ثبت‌نام</h2>

        <div class="divider"></div>

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

          <button type="submit" class="main-button">
            ثبت‌نام
          </button>

        </form>

        <a href="/">
          بازگشت
        </a>
        `
      );

      return;
    }

    if (req.method === "POST" && req.url === "/signup") {

      const data = await readBody(req);

      const name = (data.get("name") || "").trim();

      const email =
        (data.get("email") || "")
          .trim()
          .toLowerCase();

      const password = data.get("password") || "";

      if (!name || !email || !password) {

        sendHtml(
          res,
          400,
          "خطا",
          `
          <h2 class="error">
            اطلاعات ناقص است
          </h2>

          <a href="/signup">
            بازگشت
          </a>
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
          <h2 class="error">
            رمز عبور کوتاه است
          </h2>

          <p>
            رمز عبور باید حداقل ۶ کاراکتر باشد.
          </p>

          <a href="/signup">
            بازگشت
          </a>
          `
        );

        return;
      }

      try {

        await pool.query(
          `
          INSERT INTO users
          (name,email,password)
          VALUES ($1,$2,$3)
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
          <h2 class="success">
            ثبت‌نام موفق شد ✅
          </h2>

          <p>
            حساب شما ساخته شد.
          </p>

          <a href="/login">
            <button class="main-button">
              ورود
            </button>
          </a>
          `
        );

      } catch (error) {

        if (error.code === "23505") {

          sendHtml(
            res,
            400,
            "خطا",
            `
            <h2 class="error">
              این ایمیل قبلاً ثبت شده است.
            </h2>

            <a href="/login">
              ورود
            </a>
            `
          );

        } else {

          console.error(error);

          sendHtml(
            res,
            500,
            "خطا",
            `
            <h2 class="error">
              خطایی در ثبت‌نام رخ داد.
            </h2>
            `
          );
        }
      }

      return;
    }

    // =============================
    // ورود
    // =============================

    if (req.method === "GET" && req.url === "/login") {

      sendHtml(
        res,
        200,
        "ورود",
        `
        <h2>ورود</h2>

        <div class="divider"></div>

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

          <button type="submit" class="main-button">
            ورود
          </button>

        </form>

        <a href="/">
          بازگشت
        </a>
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
        SELECT id,name,email
        FROM users
        WHERE email=$1
        AND password=$2
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
          <h2 class="error">
            ورود انجام نشد
          </h2>

          <p>
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

      redirect(res, "/", cookie);

      return;
    }

    // =============================
    // پروفایل
    // =============================

    if (req.method === "GET" && req.url === "/profile") {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      sendHtml(
        res,
        200,
        "پروفایل",
        `
        <h2>پروفایل 👤</h2>

        <div class="divider"></div>

        <div class="profile-box">

          <p>
            <strong>نام:</strong>
            ${escapeHtml(user.name)}
          </p>

          <p>
            <strong>ایمیل:</strong>
            ${escapeHtml(user.email)}
          </p>

          <p>
            <strong>شناسه کاربر:</strong>
            ${escapeHtml(user.id)}
          </p>

        </div>

        <a href="/">
          <button class="main-button">
            صفحه اصلی
          </button>
        </a>
        `
      );

      return;
    }

    // =============================
    // پیام‌ها
    // =============================

    if (req.method === "GET" && req.url === "/messages") {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const usersResult = await pool.query(
        `
        SELECT id,name,email
        FROM users
        WHERE id <> $1
        ORDER BY id ASC
        `,
        [user.id]
      );

      let usersHtml = "";

      if (usersResult.rows.length === 0) {

        usersHtml = `
        <div class="info-box">
          فعلاً کاربر دیگری وجود ندارد.
        </div>
        `;

      } else {

        usersResult.rows.forEach(other => {

          usersHtml += `
          <div class="user-card">

            <strong>
              ${escapeHtml(other.name)}
            </strong>

            <p class="small-text">
              ${escapeHtml(other.email)}
            </p>

            <a href="/chat?with=${other.id}">
              <button class="main-button">
                باز کردن گفت‌وگو 💬
              </button>
            </a>

          </div>
          `;

        });
      }

      sendHtml(
        res,
        200,
        "پیام‌ها",
        `
        <h2>پیام‌ها 💬</h2>

        <div class="divider"></div>

        <h3>
          کاربران
        </h3>

        ${usersHtml}

        <div class="divider"></div>

        <a href="/">
          <button class="main-button">
            صفحه اصلی
          </button>
        </a>
        `
      );

      return;
    }

    // =============================
    // گفت‌وگوی دو نفره
    // =============================

    if (
      req.method === "GET" &&
      req.url.startsWith("/chat")
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const url = new URL(
        req.url,
        "http://localhost"
      );

      const otherId =
        Number(url.searchParams.get("with"));

      if (
        !Number.isInteger(otherId) ||
        otherId <= 0 ||
        otherId === user.id
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `
          <h2 class="error">
            کاربر معتبر نیست.
          </h2>

          <a href="/messages">
            بازگشت به پیام‌ها
          </a>
          `
        );

        return;
      }

      const otherResult = await pool.query(
        `
        SELECT id,name,email
        FROM users
        WHERE id=$1
        `,
        [otherId]
      );

      if (otherResult.rows.length === 0) {

        sendHtml(
          res,
          404,
          "خطا",
          `
          <h2 class="error">
            کاربر پیدا نشد.
          </h2>

          <a href="/messages">
            بازگشت
          </a>
          `
        );

        return;
      }

      const other = otherResult.rows[0];

      const messagesResult = await pool.query(
        `
        SELECT
          id,
          sender_id,
          receiver_id,
          message,
          created_at
        FROM messages
        WHERE
          (sender_id=$1 AND receiver_id=$2)
          OR
          (sender_id=$2 AND receiver_id=$1)
        ORDER BY created_at ASC
        `,
        [user.id, otherId]
      );

      let chatHtml = "";

      if (messagesResult.rows.length === 0) {

        chatHtml = `
        <div class="info-box">
          هنوز پیامی بین شما وجود ندارد.
        </div>
        `;

      } else {

        messagesResult.rows.forEach(msg => {

          const mine =
            msg.sender_id === user.id;

          const date =
            new Date(
              msg.created_at
            ).toLocaleString("fa-IR");

          chatHtml += `
          <div class="message ${mine ? "mine" : "theirs"}">

            <div>
              ${escapeHtml(msg.message)}
            </div>

            <div class="message-time">
              ${escapeHtml(date)}
            </div>

          </div>
          `;

        });
      }

      sendHtml(
        res,
        200,
        "گفت‌وگو",
        `
        <h2>
          گفت‌وگو با ${escapeHtml(other.name)} 💬
        </h2>

        <p class="small-text">
          ${escapeHtml(other.email)}
        </p>

        <div class="divider"></div>

        <div class="chat">

          ${chatHtml}

        </div>

        <div class="divider"></div>

        <form
          method="POST"
          action="/chat"
        >

          <input
            type="hidden"
            name="receiver_id"
            value="${other.id}"
          >

          <textarea
            name="message"
            maxlength="5000"
            placeholder="پیام خود را بنویس..."
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
        `
      );

      return;
    }

    // =============================
    // ارسال پیام از داخل گفت‌وگو
    // =============================

    if (
      req.method === "POST" &&
      req.url === "/chat"
    ) {

      const user = await getSession(req);

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
        !Number.isInteger(receiverId) ||
        receiverId <= 0 ||
        receiverId === user.id ||
        !message
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `
          <h2 class="error">
            اطلاعات پیام معتبر نیست.
          </h2>

          <a href="/messages">
            بازگشت
          </a>
          `
        );

        return;
      }

      if (message.length > 5000) {

        sendHtml(
          res,
          400,
          "خطا",
          `
          <h2 class="error">
            پیام بیش از حد طولانی است.
          </h2>

          <a href="/messages">
            بازگشت
          </a>
          `
        );

        return;
      }

      const receiverResult = await pool.query(
        `
        SELECT id
        FROM users
        WHERE id=$1
        `,
        [receiverId]
      );

      if (receiverResult.rows.length === 0) {

        sendHtml(
          res,
          404,
          "خطا",
          `
          <h2 class="error">
            کاربر پیدا نشد.
          </h2>

          <a href="/messages">
            بازگشت
          </a>
          `
        );

        return;
      }

      await pool.query(
        `
        INSERT INTO messages
        (sender_id,receiver_id,message)
        VALUES ($1,$2,$3)
        `,
        [
          user.id,
          receiverId,
          message
        ]
      );

      redirect(
        res,
        `/chat?with=${receiverId}`
      );

      return;
    }

    // =============================
    // تنظیمات
    // =============================

    if (req.method === "GET" && req.url === "/settings") {

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
        <h2>تنظیمات ⚙️</h2>

        <div class="divider"></div>

        <div class="info-box">

          <p>
            تنظیمات برنامه
          </p>

          <p class="small-text">
            حساب شما فعال است.
          </p>

          <p class="small-text">
            ${escapeHtml(user.email)}
          </p>

        </div>

        <a href="/">
          <button class="main-button">
            صفحه اصلی
          </button>
        </a>
        `
      );

      return;
    }

    // =============================
    // خروج
    // =============================

    if (req.method === "GET" && req.url === "/logout") {

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

    // =============================
    // 404
    // =============================

    sendHtml(
      res,
      404,
      "یافت نشد",
      `
      <h2>
        صفحه پیدا نشد
      </h2>

      <a href="/">
        بازگشت به صفحه اصلی
      </a>
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
      <h2 class="error">
        خطای سرور
      </h2>

      <p>
        مشکلی در اجرای درخواست رخ داد.
      </p>

      <a href="/">
        بازگشت
      </a>
      `
    );
  }
});

// ===============================
// شروع برنامه
// ===============================

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
