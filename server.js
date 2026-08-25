const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const port = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(password)
    .digest("hex");
}

function html(title, content) {
  return `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
    </head>
    <body>
      ${content}
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
        <h1>خوش آمدید</h1>
        <a href="/signup">
          <button>ثبت‌نام</button>
        </a>
        <br><br>
        <a href="/login">
          <button>ورود</button>
        </a>
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
          <input name="name" placeholder="نام" required>
          <br>
          <input name="email" type="email" placeholder="ایمیل" required>
          <br>
          <input name="password" type="password" placeholder="رمز عبور" required>
          <br>
          <button type="submit">ثبت‌نام</button>
        </form>

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

          res.end(html("موفق", `
            <h2>ثبت‌نام موفق شد ✅</h2>
            <p>حساب شما ساخته شد.</p>
            <a href="/login">
              <button>ورود</button>
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
          <input name="email" type="email" placeholder="ایمیل" required>
          <br>
          <input name="password" type="password" placeholder="رمز عبور" required>
          <br>
          <button type="submit">ورود</button>
        </form>

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
            `SELECT name FROM users
             WHERE email = $1 AND password = $2`,
            [email, hashedPassword]
          );

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8"
          });

          if (result.rows.length > 0) {
            res.end(html("خوش آمدید", `
              <h2>خوش آمدی ${result.rows[0].name} 👋</h2>
              <p>ورود موفق بود.</p>
            `));
          } else {
            res.end(html("خطا", `
              <h2>ایمیل یا رمز عبور اشتباه است.</h2>
              <a href="/login">تلاش دوباره</a>
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
