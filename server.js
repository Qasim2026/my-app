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
  return String(value || "")
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

    cookies[key] = decodeURIComponent(value);
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

      // جلوگیری از درخواست‌های بسیار بزرگ
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

    input {
      width: 100%;

      padding: 13px;

      margin: 7px 0;

      border:
        1px solid #ccc;

      border-radius: 10px;

      font-size: 16px;
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

      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP

    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    sessions_user_id_index
    ON sessions(user_id)
  `);
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

      const user = await getSession(req);

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

      const data = await readBody(req);

      const name = (data.get("name") || "").trim();

      const email = (data.get("email") || "")
        .trim()
        .toLowerCase();

      const password = data.get("password") || "";

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

      const data = await readBody(req);

      const email = (data.get("email") || "")
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
    // پیام‌ها
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

      sendHtml(
        res,
        200,
        "پیام‌ها",
        `

        <h2>
          پیام‌ها 💬
        </h2>

        <div class="divider"></div>

        <div class="info-box">

          <p>
            هنوز پیامی ندارید.
          </p>

          <p class="small-text">
            بخش پیام‌ها آماده است و
            می‌توانیم در مرحله بعد
            سیستم ارسال و دریافت پیام
            را به آن اضافه کنیم.
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

    // اگر ساخت جدول خطا داد،
    // سرور را متوقف نمی‌کنیم تا
    // خطا در لاگ Render مشخص باشد.

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
