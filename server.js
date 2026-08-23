const http = require("http");

const port = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8"
  });

  let page;

  if (req.url === "/login") {
    page = `
      <h2>ورود</h2>
      <form>
        <input type="email" placeholder="ایمیل" required>
        <br><br>
        <input type="password" placeholder="رمز عبور" required>
        <br><br>
        <button type="submit">ورود</button>
      </form>
      <br>
      <a href="/">بازگشت</a>
    `;
  } else if (req.url === "/signup") {
    page = `
      <h2>ثبت‌نام</h2>
      <form>
        <input type="text" placeholder="نام" required>
        <br><br>
        <input type="email" placeholder="ایمیل" required>
        <br><br>
        <input type="password" placeholder="رمز عبور" required>
        <br><br>
        <button type="submit">ثبت‌نام</button>
      </form>
      <br>
      <a href="/">بازگشت</a>
    `;
  } else {
    page = `
      <h2>به برنامه ما خوش آمدید 👋</h2>
      <p>این اولین نسخه پلتفرم ماست.</p>
      <p>به‌زودی امکانات بیشتری اضافه می‌کنیم.</p>
      <br>
      <a href="/login"><button>ورود</button></a>
      <a href="/signup"><button>ثبت‌نام</button></a>
    `;
  }

  res.end(`
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>برنامه من</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          background: #f5f5f5;
          padding: 40px;
        }
        input {
          padding: 12px;
          width: 250px;
          max-width: 90%;
        }
        button {
          padding: 12px 25px;
          margin: 5px;
          cursor: pointer;
        }
        a {
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      ${page}
    </body>
    </html>
  `);
});

server.listen(port, "0.0.0.0", () => {
  console.log("Server is running on port " + port);
});
