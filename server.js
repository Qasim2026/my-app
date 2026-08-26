const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const port = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===============================
// ابزارهای کمکی
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

    if (index === -1) {
      return;
    }

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
    INSERT INTO sessions
    (session_id, user_id)
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

  if (!sessionId) {
    return;
  }

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
    "Location": location
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

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <meta
    name="description"
    content="برنامه اجتماعی من"
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

      box-shadow:
        0 8px 30px rgba(0,0,0,0.15);

      text-align: center;
    }

    h1,
    h2,
    h3 {
      margin-top: 10px;
    }

    p {
      line-height: 1.8;
    }

    input,
    textarea,
    select {
      width: 100%;

      padding: 13px;

      margin: 7px 0;

      border:
        1px solid #ccc;

      border-radius: 10px;

      font-size: 16px;

      font-family:
        Arial,
        Tahoma,
        sans-serif;
    }

    textarea {
      min-height: 120px;
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

    button:hover {
      opacity: 0.9;
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

    .profile-box {
      background: #f7f7f7;

      border-radius: 15px;

      padding: 20px;

      margin: 20px 0;

      text-align: right;
    }

    .profile-box p {
      margin: 12px 0;
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

    .info-box {
      background: #f7f7f7;

      border-radius: 15px;

      padding: 18px;

      margin: 20px 0;
    }

    .small-text {
      font-size: 13px;

      color: #666;
    }

    .user-card {
      background: #f7f7f7;

      border-radius: 15px;

      padding: 15px;

      margin: 12px 0;

      text-align: right;
    }

    .user-card-name {
      font-weight: bold;

      font-size: 17px;

      margin-bottom: 5px;
    }

    .user-card-email {
      font-size: 13px;

      color: #666;

      margin-bottom: 10px;
    }

    .message-card {
      background: #f7f7f7;

      border-radius: 15px;

      padding: 15px;

      margin: 12px 0;

      text-align: right;
    }

    .message-card.sent {
      border-right: 4px solid #555;
    }

    .message-card.received {
      border-right: 4px solid #087f23;
    }

    .message-text {
      white-space: pre-wrap;

      word-break: break-word;

      margin: 10px 0;
    }

    .message-meta {
      font-size: 12px;

      color: #666;
    }

    .tab-button {
      width: 45%;
    }

    .back-link {
      display: inline-block;

      margin-top: 15px;

      font-weight: bold;
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
// ساخت جدول‌های دیتابیس
// ===============================

async function createTables() {

  // کاربران
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (

      id SERIAL PRIMARY KEY,

      name TEXT NOT NULL,

      email TEXT UNIQUE NOT NULL,

      password TEXT NOT NULL

    )
  `);

  // نشست‌های ورود
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

  // ایندکس نشست‌ها
  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    sessions_user_id_index
    ON sessions(user_id)
  `);

  // پیام‌ها
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

  // ایندکس پیام‌های فرستنده
  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    messages_sender_id_index
    ON messages(sender_id)
  `);

  // ایندکس پیام‌های گیرنده
  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    messages_receiver_id_index
    ON messages(receiver_id)
  `);

  // ایندکس زمان پیام
  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    messages_created_at_index
    ON messages(created_at)
  `);

  console.log("Database tables are ready.");
}

// ===============================
// سرور
// ===============================

const server = http.createServer(async (req, res) => {

  try {

    // ==================================
    // صفحه اصلی
    // ==================================

    if (
      req.method === "GET" &&
      req.url === "/"
    ) {

      const user =
        await getSession(req);

      if (user) {

        sendHtml(
          res,
          200,
          "صفحه اصلی",
          `

          <div class="welcome">

            <h2>
              خوش آمدی
              ${escapeHtml(user.name)}
              👋
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

      } else {

        sendHtml(
          res,
          200,
          "صفحه اصلی",
          `

          <div class="welcome">

            <h1>
              خوش آمدید 👋
            </h1>

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
      }

      return;
    }

    // ==================================
    // صفحه ثبت‌نام
    // ==================================

    if (
      req.method === "GET" &&
      req.url === "/signup"
    ) {

      sendHtml(
        res,
        200,
        "ثبت‌نام",
        `

        <h2>
          ثبت‌نام
        </h2>

        <div class="divider"></div>

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

        <br>

        <a href="/">
          بازگشت
        </a>

        `
      );

      return;
    }

    // ==================================
    // انجام ثبت‌نام
    // ==================================

    if (
      req.method === "POST" &&
      req.url === "/signup"
    ) {

      const data =
        await readBody(req);

      const name =
        (data.get("name") || "")
          .trim();

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

          <h2 class="error">
            اطلاعات ناقص است
          </h2>

          <p>
            همه قسمت‌ها را کامل کن.
          </p>

          <a href="/signup">
            بازگشت به ثبت‌نام
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

        const hashedPassword =
          hashPassword(password);

        await pool.query(
          `
          INSERT INTO users
          (
            name,
            email,
            password
          )
          VALUES
          (
            $1,
            $2,
            $3
          )
          `,
          [
            name,
            email,
            hashedPassword
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

        console.error(
          "Signup error:",
          error
        );

        if (
          error.code === "23505"
        ) {

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

            <br><br>

            <a href="/signup">
              ثبت‌نام با ایمیل دیگر
            </a>

            `
          );

        } else {

          sendHtml(
            res,
            500,
            "خطا",
            `

            <h2 class="error">
              خطایی در ثبت‌نام رخ داد.
            </h2>

            <a href="/signup">
              بازگشت
            </a>

            `
          );
        }
      }

      return;
    }

    // ==================================
    // صفحه ورود
    // ==================================

    if (
      req.method === "GET" &&
      req.url === "/login"
    ) {

      sendHtml(
        res,
        200,
        "ورود",
        `

        <h2>
          ورود
        </h2>

        <div class="divider"></div>

        <form
          method="POST"
          action="/login"
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
            required
          >

          <button
            type="submit"
            class="main-button"
          >
            ورود
          </button>

        </form>

        <br>

        <a href="/">
          بازگشت
        </a>

        `
      );

      return;
    }

    // ==================================
    // انجام ورود
    // ==================================

    if (
      req.method === "POST" &&
      req.url === "/login"
    ) {

      const data =
        await readBody(req);

      const email =
        (data.get("email") || "")
          .trim()
          .toLowerCase();

      const password =
        data.get("password") || "";

      try {

        const hashedPassword =
          hashPassword(password);

        const result =
          await pool.query(
            `
            SELECT
              id,
              name,
              email
            FROM users
            WHERE
              email = $1
              AND password = $2
            `,
            [
              email,
              hashedPassword
            ]
          );

        if (
          result.rows.length === 0
        ) {

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

        const user =
          result.rows[0];

        const sessionId =
          await createSession(user.id);

        const cookie =
          `sessionId=${encodeURIComponent(sessionId)}; ` +
          `HttpOnly; ` +
          `Path=/; ` +
          `SameSite=Lax`;

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

          <h2 class="error">
            خطای اتصال به دیتابیس
          </h2>

          <p>
            لطفاً دوباره تلاش کن.
          </p>

          <a href="/login">
            بازگشت
          </a>

          `
        );
      }

      return;
    }

    // ==================================
    // پروفایل
    // ==================================

    if (
      req.method === "GET" &&
      req.url === "/profile"
    ) {

      const user =
        await getSession(req);

      if (!user) {

        redirect(
          res,
          "/login"
        );

        return;
      }

      sendHtml(
        res,
        200,
        "پروفایل",
        `

        <h2>
          پروفایل 👤
        </h2>

        <div class="divider"></div>

        <div class="profile-box">

          <p>
            <strong>
              نام:
            </strong>

            ${escapeHtml(user.name)}
          </p>

          <p>
            <strong>
              ایمیل:
            </strong>

            ${escapeHtml(user.email)}
          </p>

          <p>
            <strong>
              شناسه کاربر:
            </strong>

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

    // ==================================
    // صفحه پیام‌ها
    // ==================================

    if (
      req.method === "GET" &&
      req.url === "/messages"
    ) {

      const user =
        await getSession(req);

      if (!user) {

        redirect(
          res,
          "/login"
        );

        return;
      }

      try {

        // کاربران دیگر
        const usersResult =
          await pool.query(
            `
            SELECT
              id,
              name,
              email
            FROM users
            WHERE id <> $1
            ORDER BY id ASC
            `,
            [user.id]
          );

        // پیام‌های دریافتی
        const receivedResult =
          await pool.query(
            `
            SELECT
              messages.id,
              messages.message,
              messages.created_at,
              users.name AS sender_name,
              users.email AS sender_email
            FROM messages
            INNER JOIN users
              ON users.id = messages.sender_id
            WHERE messages.receiver_id = $1
            ORDER BY messages.created_at DESC
            `,
            [user.id]
          );

        // پیام‌های ارسالی
        const sentResult =
          await pool.query(
            `
            SELECT
              messages.id,
              messages.message,
              messages.created_at,
              users.name AS receiver_name,
              users.email AS receiver_email
            FROM messages
            INNER JOIN users
              ON users.id = messages.receiver_id
            WHERE messages.sender_id = $1
            ORDER BY messages.created_at DESC
            `,
            [user.id]
          );

        let usersHtml = "";

        if (
          usersResult.rows.length === 0
        ) {

          usersHtml = `
            <div class="info-box">
              <p>
                فعلاً کاربر دیگری برای ارسال پیام وجود ندارد.
              </p>
            </div>
          `;

        } else {

          usersResult.rows.forEach(otherUser => {

            usersHtml += `

              <div class="user-card">

                <div class="user-card-name">
                  ${escapeHtml(otherUser.name)}
                </div>

                <div class="user-card-email">
                  ${escapeHtml(otherUser.email)}
                </div>

                <a href="/send-message?to=${encodeURIComponent(otherUser.id)}">
                  <button class="main-button">
                    ارسال پیام
                  </button>
                </a>

              </div>

            `;
          });
        }

        let receivedHtml = "";

        if (
          receivedResult.rows.length === 0
        ) {

          receivedHtml = `
            <div class="info-box">
              <p>
                هنوز پیام دریافتی ندارید.
              </p>
            </div>
          `;

        } else {

          receivedResult.rows.forEach(message => {

            const date =
              new Date(
                message.created_at
              ).toLocaleString(
                "fa-IR"
              );

            receivedHtml += `

              <div class="message-card received">

                <strong>
                  از:
                  ${escapeHtml(message.sender_name)}
                </strong>

                <div class="message-text">
                  ${escapeHtml(message.message)}
                </div>

                <div class="message-meta">
                  ${escapeHtml(date)}
                </div>

              </div>

            `;
          });
        }

        let sentHtml = "";

        if (
          sentResult.rows.length === 0
        ) {

          sentHtml = `
            <div class="info-box">
              <p>
                هنوز پیامی ارسال نکرده‌اید.
              </p>
            </div>
          `;

        } else {

          sentResult.rows.forEach(message => {

            const date =
              new Date(
                message.created_at
              ).toLocaleString(
                "fa-IR"
              );

            sentHtml += `

              <div class="message-card sent">

                <strong>
                  به:
                  ${escapeHtml(message.receiver_name)}
                </strong>

                <div class="message-text">
                  ${escapeHtml(message.message)}
                </div>

                <div class="message-meta">
                  ${escapeHtml(date)}
                </div>

              </div>

            `;
          });
        }

        sendHtml(
          res,
          200,
          "پیام‌ها",
          `

          <h2>
            پیام‌ها 💬
          </h2>

          <div class="divider"></div>

          <h3>
            ارسال پیام
          </h3>

          <p class="small-text">
            یکی از کاربران را انتخاب کن.
          </p>

          ${usersHtml}

          <div class="divider"></div>

          <h3>
            پیام‌های دریافتی 📥
          </h3>

          ${receivedHtml}

          <div class="divider"></div>

          <h3>
            پیام‌های ارسالی 📤
          </h3>

          ${sentHtml}

          <div class="divider"></div>

          <a href="/">
            <button class="main-button">
              صفحه اصلی
            </button>
          </a>

          `
        );

      } catch (error) {

        console.error(
          "Messages page error:",
          error
        );

        sendHtml(
          res,
          500,
          "خطا",
          `

          <h2 class="error">
            خطا در نمایش پیام‌ها
          </h2>

          <p>
            لطفاً دوباره تلاش کن.
          </p>

          <a href="/">
            صفحه اصلی
          </a>

          `
        );
      }

      return;
    }

    // ==================================
    // صفحه ارسال پیام
    // ==================================

    if (
      req.method === "GET" &&
      req.url.startsWith("/send-message")
    ) {

      const user =
        await getSession(req);

      if (!user) {

        redirect(
          res,
          "/login"
        );

        return;
      }

      const url =
        new URL(
          req.url,
          "http://localhost"
        );

      const receiverId =
        Number(
          url.searchParams.get("to")
        );

      if (
        !Number.isInteger(receiverId) ||
        receiverId <= 0
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `

          <h2 class="error">
            گیرنده معتبر نیست.
          </h2>

          <a href="/messages">
            بازگشت به پیام‌ها
          </a>

          `
        );

        return;
      }

      if (
        receiverId === user.id
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `

          <h2 class="error">
            نمی‌توانی برای خودت پیام بفرستی.
          </h2>

          <a href="/messages">
            بازگشت به پیام‌ها
          </a>

          `
        );

        return;
      }

      const receiverResult =
        await pool.query(
          `
          SELECT
            id,
            name,
            email
          FROM users
          WHERE id = $1
          `,
          [receiverId]
        );

      if (
        receiverResult.rows.length === 0
      ) {

        sendHtml(
          res,
          404,
          "خطا",
          `

          <h2 class="error">
            کاربر پیدا نشد.
          </h2>

          <a href="/messages">
            بازگشت به پیام‌ها
          </a>

          `
        );

        return;
      }

      const receiver =
        receiverResult.rows[0];

      sendHtml(
        res,
        200,
        "ارسال پیام",
        `

        <h2>
          ارسال پیام 💬
        </h2>

        <div class="divider"></div>

        <div class="info-box">

          <p>
            <strong>
              گیرنده:
            </strong>
          </p>

          <p>
            ${escapeHtml(receiver.name)}
          </p>

          <p class="small-text">
            ${escapeHtml(receiver.email)}
          </p>

        </div>

        <form
          method="POST"
          action="/send-message"
        >

          <input
            type="hidden"
            name="receiver_id"
            value="${escapeHtml(receiver.id)}"
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

        <a
          href="/messages"
          class="back-link"
        >
          بازگشت به پیام‌ها
        </a>

        `
      );

      return;
    }

    // ==================================
    // انجام ارسال پیام
    // ==================================

    if (
      req.method === "POST" &&
      req.url === "/send-message"
    ) {

      const user =
        await getSession(req);

      if (!user) {

        redirect(
          res,
          "/login"
        );

        return;
      }

      const data =
        await readBody(req);

      const receiverId =
        Number(
          data.get("receiver_id")
        );

      const message =
        (data.get("message") || "")
          .trim();

      if (
        !Number.isInteger(receiverId) ||
        receiverId <= 0
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `

          <h2 class="error">
            گیرنده معتبر نیست.
          </h2>

          <a href="/messages">
            بازگشت
          </a>

          `
        );

        return;
      }

      if (
        receiverId === user.id
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `

          <h2 class="error">
            نمی‌توانی برای خودت پیام بفرستی.
          </h2>

          <a href="/messages">
            بازگشت
          </a>

          `
        );

        return;
      }

      if (!message) {

        sendHtml(
          res,
          400,
          "خطا",
          `

          <h2 class="error">
            پیام خالی است.
          </h2>

          <a href="/messages">
            بازگشت
          </a>

          `
        );

        return;
      }

      if (
        message.length > 5000
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `

          <h2 class="error">
            پیام بیش از حد طولانی است.
          </h2>

          <p>
            حداکثر ۵۰۰۰ کاراکتر مجاز است.
          </p>

          <a href="/messages">
            بازگشت
          </a>

          `
        );

        return;
      }

      try {

        const receiverResult =
          await pool.query(
            `
            SELECT id
            FROM users
            WHERE id = $1
            `,
            [receiverId]
          );

        if (
          receiverResult.rows.length === 0
        ) {

          sendHtml(
            res,
            404,
            "خطا",
            `

            <h2 class="error">
              کاربر گیرنده پیدا نشد.
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
          (
            sender_id,
            receiver_id,
            message
          )
          VALUES
          (
            $1,
            $2,
            $3
          )
          `,
          [
            user.id,
            receiverId,
            message
          ]
        );

        sendHtml(
          res,
          200,
          "پیام ارسال شد",
          `

          <h2 class="success">
            پیام ارسال شد ✅
          </h2>

          <p>
            پیام شما با موفقیت ذخیره شد.
          </p>

          <a href="/messages">
            <button class="main-button">
              بازگشت به پیام‌ها
            </button>
          </a>

          `
        );

      } catch (error) {

        console.error(
          "Send message error:",
          error
        );

        sendHtml(
          res,
          500,
          "خطا",
          `

          <h2 class="error">
            ارسال پیام انجام نشد.
          </h2>

          <p>
            لطفاً دوباره تلاش کن.
          </p>

          <a href="/messages">
            بازگشت
          </a>

          `
        );
      }

      return;
    }

    // ==================================
    // تنظیمات
    // ==================================

    if (
      req.method === "GET" &&
      req.url === "/settings"
    ) {

      const user =
        await getSession(req);

      if (!user) {

        redirect(
          res,
          "/login"
        );

        return;
      }

      sendHtml(
        res,
        200,
        "تنظیمات",
        `

        <h2>
          تنظیمات ⚙️
        </h2>

        <div class="divider"></div>

        <div class="info-box">

          <p>
            تنظیمات برنامه
          </p>

          <p class="small-text">
            حساب شما فعال است.
          </p>

          <p class="small-text">
            شما با حساب
            ${escapeHtml(user.email)}
            وارد شده‌اید.
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

    // ==================================
    // خروج
    // ==================================

    if (
      req.method === "GET" &&
      req.url === "/logout"
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

    // ==================================
    // صفحه پیدا نشد
    // ==================================

    sendHtml(
      res,
      404,
      "یافت نشد",
      `

      <h2>
        صفحه پیدا نشد
      </h2>

      <p>
        این صفحه در برنامه وجود ندارد.
      </p>

      <a href="/">
        <button class="main-button">
          صفحه اصلی
        </button>
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
        بازگشت به صفحه اصلی
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
          "Server running on port " +
          port
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
          "Server running on port " +
          port
        );

      }
    );

  });
