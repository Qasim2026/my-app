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

function formatDate(date) {
  return new Date(date).toLocaleString("fa-IR");
}

// ==================================================
// قالب اصلی سایت
// ==================================================

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
  content="برنامه اجتماعی و جستجوی کار"
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

  padding: 15px;
}

.phone {
  width: 100%;
  max-width: 460px;
  min-height: 650px;

  background: white;

  border-radius: 28px;

  padding: 25px 20px;

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

  border: 1px solid #ccc;

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

.green-button {
  background: #087f23;
}

.blue-button {
  background: #145dbf;
}

.red-button,
.logout {
  background: #b00020;
}

a {
  color: #222;
  text-decoration: none;
}

.divider {
  height: 1px;

  background: #ddd;

  margin: 22px 0;
}

.welcome {
  margin-top: 50px;
}

.profile-box,
.info-box,
.user-card,
.message-card,
.job-card {
  background: #f7f7f7;

  border-radius: 15px;

  padding: 17px;

  margin: 15px 0;

  text-align: right;
}

.profile-box p {
  margin: 12px 0;
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

.user-card-name,
.job-title {
  font-weight: bold;
  font-size: 18px;
  margin-bottom: 7px;
}

.user-card-email {
  font-size: 13px;
  color: #666;
  margin-bottom: 10px;
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

.job-card {
  border-right: 4px solid #145dbf;
}

.job-location {
  font-size: 14px;
  color: #555;
  margin: 5px 0;
}

.job-description {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.8;
  margin-top: 12px;
}

.job-salary {
  font-weight: bold;
  margin-top: 8px;
}

.search-box {
  background: #f7f7f7;
  padding: 15px;
  border-radius: 15px;
  margin-bottom: 15px;
}

.badge {
  display: inline-block;
  background: #e8eef8;
  padding: 5px 9px;
  border-radius: 8px;
  font-size: 12px;
  margin: 3px;
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

// ==================================================
// ساخت دیتابیس
// ==================================================

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
    messages_created_at_index
    ON messages(created_at)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (

      id SERIAL PRIMARY KEY,

      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      title TEXT NOT NULL,

      city TEXT NOT NULL,

      description TEXT NOT NULL,

      salary TEXT,

      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP

    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    jobs_user_id_index
    ON jobs(user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    jobs_city_index
    ON jobs(city)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    jobs_created_at_index
    ON jobs(created_at)
  `);

  console.log("Database tables are ready.");
}

// ==================================================
// سرور
// ==================================================

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

            <a href="/jobs">
              <button class="menu-button blue-button">
                جستجوی کار 🔎
              </button>
            </a>

            <a href="/create-job">
              <button class="menu-button green-button">
                ثبت آگهی کار ➕
              </button>
            </a>

            <a href="/messages">
              <button class="menu-button">
                پیام‌ها 💬
              </button>
            </a>

            <a href="/profile">
              <button class="menu-button">
                پروفایل 👤
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
              برنامه اجتماعی و جستجوی کار
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

        <a href="/">
          بازگشت
        </a>

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

      if (!name || !email || !password) {

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

        <a href="/">
          بازگشت
        </a>

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

        const user = result.rows[0];

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

          <a href="/login">
            بازگشت
          </a>
          `
        );
      }

      return;
    }

    // ==================================================
    // پروفایل
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
            <strong>نام فعلی:</strong>
            ${escapeHtml(user.name)}
          </p>

          <p>
            <strong>ایمیل فعلی:</strong>
            ${escapeHtml(user.email)}
          </p>

          <p>
            <strong>شناسه کاربر:</strong>
            ${escapeHtml(user.id)}
          </p>

        </div>

        <div class="divider"></div>

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
            placeholder="نام جدید"
            maxlength="100"
            required
          >

          <input
            name="email"
            type="email"
            value="${escapeHtml(user.email)}"
            placeholder="ایمیل جدید"
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

        <a href="/">
          <button class="main-button">
            صفحه اصلی
          </button>
        </a>

        `
      );

      return;
    }

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

        sendHtml(
          res,
          400,
          "خطا",
          `
          <h2 class="error">
            نام و ایمیل الزامی است.
          </h2>

          <a href="/profile">
            بازگشت
          </a>
          `
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
          <h2 class="success">
            تغییرات ذخیره شد ✅
          </h2>

          <p>
            نام و ایمیل پروفایل شما به‌روزرسانی شد.
          </p>

          <a href="/profile">
            <button class="main-button">
              مشاهده پروفایل
            </button>
          </a>
          `
        );

      } catch (error) {

        console.error(
          "Profile update error:",
          error
        );

        if (error.code === "23505") {

          sendHtml(
            res,
            400,
            "خطا",
            `
            <h2 class="error">
              این ایمیل قبلاً استفاده شده است.
            </h2>

            <a href="/profile">
              بازگشت
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
              تغییرات ذخیره نشد.
            </h2>

            <a href="/profile">
              بازگشت
            </a>
            `
          );
        }
      }

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

      const keyword =
        (url.searchParams.get("keyword") || "").trim();

      const city =
        (url.searchParams.get("city") || "").trim();

      let query = `
        SELECT
          jobs.id,
          jobs.title,
          jobs.city,
          jobs.description,
          jobs.salary,
          jobs.created_at,
          users.name AS owner_name,
          users.email AS owner_email
        FROM jobs
        INNER JOIN users
          ON users.id = jobs.user_id
        WHERE 1=1
      `;

      const values = [];
      let number = 1;

      if (keyword) {

        query += `
          AND (
            jobs.title ILIKE $${number}
            OR jobs.description ILIKE $${number}
          )
        `;

        values.push(`%${keyword}%`);
        number++;
      }

      if (city) {

        query += `
          AND jobs.city ILIKE $${number}
        `;

        values.push(`%${city}%`);
        number++;
      }

      query += `
        ORDER BY jobs.created_at DESC
      `;

      const result =
        await pool.query(
          query,
          values
        );

      let jobsHtml = "";

      if (result.rows.length === 0) {

        jobsHtml = `
        <div class="info-box">

          <p>
            آگهی کاری پیدا نشد.
          </p>

        </div>
        `;

      } else {

        result.rows.forEach(job => {

          jobsHtml += `

          <div class="job-card">

            <div class="job-title">
              ${escapeHtml(job.title)}
            </div>

            <div class="job-location">
              📍 ${escapeHtml(job.city)}
            </div>

            ${
              job.salary
                ? `
                <div class="job-salary">
                  💰 ${escapeHtml(job.salary)}
                </div>
                `
                : ""
            }

            <p>
              ${escapeHtml(
                job.description.length > 180
                  ? job.description.substring(0, 180) + "..."
                  : job.description
              )}
            </p>

            <a href="/job?id=${job.id}">
              <button class="blue-button">
                مشاهده آگهی
              </button>
            </a>

          </div>

          `;
        });
      }

      sendHtml(
        res,
        200,
        "جستجوی کار",
        `

        <h2>
          جستجوی کار 🔎
        </h2>

        <div class="divider"></div>

        <div class="search-box">

          <form
            method="GET"
            action="/jobs"
          >

            <input
              name="keyword"
              value="${escapeHtml(keyword)}"
              placeholder="مثلاً گچکار، راننده، فروشنده..."
            >

            <input
              name="city"
              value="${escapeHtml(city)}"
              placeholder="شهر"
            >

            <button
              type="submit"
              class="main-button blue-button"
            >
              جستجو 🔎
            </button>

          </form>

        </div>

        <a href="/create-job">
          <button class="main-button green-button">
            ثبت آگهی کار ➕
          </button>
        </a>

        <div class="divider"></div>

        ${jobsHtml}

        <a
          href="/"
          class="back-link"
        >
          بازگشت به صفحه اصلی
        </a>

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

        <h2>
          ثبت آگهی کار ➕
        </h2>

        <p class="small-text">
          آگهی شما در بخش جستجوی کار نمایش داده می‌شود.
        </p>

        <div class="divider"></div>

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
          >

          <textarea
            name="description"
            placeholder="توضیحات کامل درباره کار..."
            maxlength="5000"
            required
          ></textarea>

          <button
            type="submit"
            class="main-button green-button"
          >
            ثبت آگهی
          </button>

        </form>

        <a
          href="/jobs"
          class="back-link"
        >
          بازگشت به جستجوی کار
        </a>

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

      if (!title || !city || !description) {

        sendHtml(
          res,
          400,
          "خطا",
          `
          <h2 class="error">
            اطلاعات آگهی کامل نیست.
          </h2>

          <a href="/create-job">
            بازگشت
          </a>
          `
        );

        return;
      }

      if (
        title.length > 200 ||
        city.length > 100 ||
        salary.length > 200 ||
        description.length > 5000
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `
          <h2 class="error">
            یکی از قسمت‌ها بیش از حد طولانی است.
          </h2>

          <a href="/create-job">
            بازگشت
          </a>
          `
        );

        return;
      }

      try {

        await pool.query(
          `
          INSERT INTO jobs
          (
            user_id,
            title,
            city,
            description,
            salary
          )
          VALUES
          ($1, $2, $3, $4, $5)
          `,
          [
            user.id,
            title,
            city,
            description,
            salary || null
          ]
        );

        sendHtml(
          res,
          200,
          "آگهی ثبت شد",
          `
          <h2 class="success">
            آگهی با موفقیت ثبت شد ✅
          </h2>

          <p>
            آگهی شما در بخش جستجوی کار قرار گرفت.
          </p>

          <a href="/jobs">
            <button class="main-button blue-button">
              مشاهده آگهی‌ها
            </button>
          </a>

          <a href="/">
            صفحه اصلی
          </a>
          `
        );

      } catch (error) {

        console.error(
          "Create job error:",
          error
        );

        sendHtml(
          res,
          500,
          "خطا",
          `
          <h2 class="error">
            ثبت آگهی انجام نشد.
          </h2>

          <a href="/create-job">
            بازگشت
          </a>
          `
        );
      }

      return;
    }

    // ==================================================
    // جزئیات آگهی
    // ==================================================

    if (
      req.method === "GET" &&
      pathname === "/job"
    ) {

      const user = await getSession(req);

      if (!user) {
        redirect(res, "/login");
        return;
      }

      const jobId =
        Number(
          url.searchParams.get("id")
        );

      if (
        !Number.isInteger(jobId) ||
        jobId <= 0
      ) {

        sendHtml(
          res,
          400,
          "خطا",
          `
          <h2 class="error">
            آگهی معتبر نیست.
          </h2>

          <a href="/jobs">
            بازگشت
          </a>
          `
        );

        return;
      }

      const result =
        await pool.query(
          `
          SELECT
            jobs.id,
            jobs.user_id,
            jobs.title,
            jobs.city,
            jobs.description,
            jobs.salary,
            jobs.created_at,
            users.name AS owner_name,
            users.email AS owner_email
          FROM jobs
          INNER JOIN users
            ON users.id = jobs.user_id
          WHERE jobs.id = $1
          `,
          [jobId]
        );

      if (result.rows.length === 0) {

        sendHtml(
          res,
          404,
          "آگهی پیدا نشد",
          `
          <h2 class="error">
            آگهی پیدا نشد.
          </h2>

          <a href="/jobs">
            بازگشت به جستجوی کار
          </a>
          `
        );

        return;
      }

      const job = result.rows[0];

      let contactHtml = "";

      if (job.user_id === user.id) {

        contactHtml = `
        <div class="info-box">
          <p>
            این آگهی را خودت ثبت کرده‌ای.
          </p>
        </div>
        `;

      } else {

        contactHtml = `
        <a href="/send-message?to=${job.user_id}">
          <button class="main-button blue-button">
            پیام به صاحب آگهی 💬
          </button>
        </a>
        `;
      }

      sendHtml(
        res,
        200,
        "جزئیات آگهی",
        `

        <h2>
          ${escapeHtml(job.title)}
        </h2>

        <div class="job-card">

          <div class="badge">
            📍 ${escapeHtml(job.city)}
          </div>

          ${
            job.salary
              ? `
              <div class="job-salary">
                💰 ${escapeHtml(job.salary)}
              </div>
              `
              : ""
          }

          <div class="divider"></div>

          <h3>
            توضیحات کار
          </h3>

          <div class="job-description">
            ${escapeHtml(job.description)}
          </div>

          <div class="divider"></div>

          <h3>
            ثبت‌کننده آگهی
          </h3>

          <p>
            ${escapeHtml(job.owner_name)}
          </p>

          <p class="small-text">
            ${escapeHtml(job.owner_email)}
          </p>

          <p class="small-text">
            تاریخ ثبت:
            ${escapeHtml(formatDate(job.created_at))}
          </p>

        </div>

        ${contactHtml}

        <a
          href="/jobs"
          class="back-link"
        >
          بازگشت به جستجوی کار
        </a>

        `
      );

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

      const receivedResult =
        await pool.query(
          `
          SELECT
            messages.id,
            messages.message,
            messages.created_at,
            users.name AS sender_name
          FROM messages
          INNER JOIN users
            ON users.id = messages.sender_id
          WHERE messages.receiver_id = $1
          ORDER BY messages.created_at DESC
          `,
          [user.id]
        );

      const sentResult =
        await pool.query(
          `
          SELECT
            messages.id,
            messages.message,
            messages.created_at,
            users.name AS receiver_name
          FROM messages
          INNER JOIN users
            ON users.id = messages.receiver_id
          WHERE messages.sender_id = $1
          ORDER BY messages.created_at DESC
          `,
          [user.id]
        );

      let usersHtml = "";

      if (usersResult.rows.length === 0) {

        usersHtml = `
        <div class="info-box">
          <p>
            فعلاً کاربر دیگری وجود ندارد.
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

            <a
              href="/send-message?to=${otherUser.id}"
            >
              <button class="main-button">
                باز کردن گفتگو
              </button>
            </a>

          </div>

          `;
        });
      }

      let receivedHtml = "";

      if (receivedResult.rows.length === 0) {

        receivedHtml = `
        <div class="info-box">
          <p>
            هنوز پیام دریافتی ندارید.
          </p>
        </div>
        `;

      } else {

        receivedResult.rows.forEach(message => {

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
              ${escapeHtml(
                formatDate(message.created_at)
              )}
            </div>

          </div>

          `;
        });
      }

      let sentHtml = "";

      if (sentResult.rows.length === 0) {

        sentHtml = `
        <div class="info-box">
          <p>
            هنوز پیامی ارسال نکرده‌اید.
          </p>
        </div>
        `;

      } else {

        sentResult.rows.forEach(message => {

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
              ${escapeHtml(
                formatDate(message.created_at)
              )}
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
          کاربران
        </h3>

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

      if (messagesResult.rows.length === 0) {

        conversationHtml = `
        <div class="info-box">
          <p>
            هنوز پیامی در این گفتگو وجود ندارد.
          </p>
        </div>
        `;

      } else {

        messagesResult.rows.forEach(message => {

          const className =
            message.sender_id === user.id
              ? "sent"
              : "received";

          conversationHtml += `

          <div class="message-card ${className}">

            <strong>
              ${escapeHtml(message.sender_name)}
            </strong>

            <div class="message-text">
              ${escapeHtml(message.message)}
            </div>

            <div class="message-meta">
              ${escapeHtml(
                formatDate(message.created_at)
              )}
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
          گفت‌وگو با
          ${escapeHtml(receiver.name)}
          💬
        </h2>

        <p class="small-text">
          ${escapeHtml(receiver.email)}
        </p>

        <div class="divider"></div>

        ${conversationHtml}

        <div class="divider"></div>

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

      try {

        const receiver =
          await pool.query(
            `
            SELECT id
            FROM users
            WHERE id = $1
            `,
            [receiverId]
          );

        if (receiver.rows.length === 0) {

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
          `/send-message?to=${receiverId}`
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

          <a href="/messages">
            بازگشت
          </a>
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
