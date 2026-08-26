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

function html(title, content) {
  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, sans-serif;
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

    h1, h2, h3 {
      margin-top: 10px;
    }

    input {
      width: 100%;
      padding: 13px;
      margin: 7px 0;
      border: 1px solid #ccc;
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

    .main-button {
      width: 90%;
      margin: 10px auto;
      display: block;
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
      margin-top: 80px;
    }

    .menu-button {
      display: block;
      width: 90%;
      margin: 10px auto;
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

async function createTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);
}

const server = http.createServer(async (req, res) => {
  try {

    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });

      res.end(html("صفحه اصلی", `
        <div class="welcome">
          <h1>خوش آمدید 👋</h1>

          <p>به برنامه ما خوش آمدید.</p>

          <a href="/signup">
            <button class="main-button">ثبت‌نام</button>
          </a>

          <a href="/login">
            <button class="main-button">ورود</button>
          </a>
        </div>
      `));

      return;
    }

    if (req.method === "GET" && req.url === "/signup") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });

      res.end(html("ثبت‌نام", `
        <h2>ثبت‌نام</h2>

        <form method="POST" action="/signup">

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
            placeholder="رمز عبور"
            required
          >

          <button type="submit" class="main-button">
            ثبت‌نام
          </button>

        </form>

        <br>

        <a href="/">بازگشت</a>
      `));

      return;
    }

    if (req.method === "POST" && req.url === "/signup") {
      let body = "";

      req.on("data", chunk => {
        body += chunk;
      });

      req.on("end", async () => {
        const data = new URLSearchParams(body);

        const name = data.get("name");
        const email = data.get("email");
        const password = data.get("password");

        try {
          const hashedPassword = hashPassword(password);

          await pool.query(
            `INSERT INTO users (name, email, password)
             VALUES ($1, $2, $3)`,
            [name, email, hashedPassword]
          );

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8"
          });

          res.end(html("ثبت‌نام موفق", `
            <h2>ثبت‌نام موفق شد ✅</h2>

            <p>حساب شما ساخته شد.</p>

            <a href="/login">
              <button class="main-button">ورود</button>
            </a>
          `));

        } catch (error) {
          console.error(error);

          res.writeHead(400, {
            "Content-Type": "text/html; charset=utf-8"
          });

          res.end(html("خطا", `
            <h2>ثبت‌نام انجام نشد.</h2>

            <p>ممکن است این ایمیل قبلاً ثبت شده باشد.</p>

            <a href="/signup">بازگشت</a>
          `));
        }
      });

      return;
    }

    if (req.method === "GET" && req.url === "/login") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });

      res.end(html("ورود", `
        <h2>ورود</h2>

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

        <br>

        <a href="/">بازگشت</a>
      `));

      return;
    }

    if (req.method === "POST" && req.url === "/login") {
      let body = "";

      req.on("data", chunk => {
        body += chunk;
      });

      req.on("end", async () => {
        const data = new URLSearchParams(body);

        const email = data.get("email");
        const password = data.get("password");

        try {
          const hashedPassword = hashPassword(password);

          const result = await pool.query(
            `SELECT id, name, email FROM users
             WHERE email = $1 AND password = $2`,
            [email, hashedPassword]
          );

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8"
          });

          if (result.rows.length > 0) {

            const user = result.rows[0];

            res.end(html("صفحه اصلی", `
              <h2>خوش آمدی ${user.name} 👋</h2>

              <p>ورود موفق بود ✅</p>

              <div class="divider"></div>

              <h3>صفحه اصلی برنامه</h3>

              <p>به برنامه خوش آمدی.</p>

              <a href="/profile">
                <button class="menu-button">پروفایل</button>
              </a>

              <a href="/messages">
                <button class="menu-button">پیام‌ها</button>
              </a>

              <a href="/settings">
                <button class="menu-button">تنظیمات</button>
              </a>

              <br>

              <a href="/">بازگشت به صفحه اصلی</a>
            `));

          } else {

            res.end(html("خطا", `
              <h2>ایمیل یا رمز عبور اشتباه است.</h2>

              <a href="/login">
                تلاش دوباره
              </a>
            `));
          }

        } catch (error) {
          console.error(error);

          res.writeHead(500, {
            "Content-Type": "text/html; charset=utf-8"
          });

          res.end(html("خطا", `
            <h2>خطای اتصال به دیتابیس</h2>
          `));
        }
      });

      return;
    }

    if (req.method === "GET" && req.url === "/profile") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });

      res.end(html("پروفایل", `
        <h2>پروفایل 👤</h2>

        <div class="divider"></div>

        <p>صفحه پروفایل شما</p>

        <p>اطلاعات پروفایل در این قسمت قرار می‌گیرد.</p>

        <a href="/">
          <button class="main-button">صفحه اصلی</button>
        </a>
      `));

      return;
    }

    if (req.method === "GET" && req.url === "/messages") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });

      res.end(html("پیام‌ها", `
        <h2>پیام‌ها 💬</h2>

        <div class="divider"></div>

        <p>هنوز پیامی ندارید.</p>

        <a href="/">
          <button class="main-button">صفحه اصلی</button>
        </a>
      `));

      return;
    }

    if (req.method === "GET" && req.url === "/settings") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });

      res.end(html("تنظیمات", `
        <h2>تنظیمات ⚙️</h2>

        <div class="divider"></div>

        <p>تنظیمات برنامه</p>

        <a href="/">
          <button class="main-button">صفحه اصلی</button>
        </a>
      `));

      return;
    }

    res.writeHead(404, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(html("یافت نشد", `
      <h2>صفحه پیدا نشد</h2>

      <a href="/">بازگشت</a>
    `));

  } catch (error) {
    console.error(error);

    res.writeHead(500, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end("خطای سرور");
  }
});

createTable()
  .then(() => {
    server.listen(port, "0.0.0.0", () => {
      console.log("Server running on port " + port);
    });
  })
  .catch(error => {
    console.error("Database error:", error);

    server.listen(port, "0.0.0.0", () => {
      console.log("Server running on port " + port);
    });
  });
