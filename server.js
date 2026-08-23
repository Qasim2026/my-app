const http = require("http");

const port = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(`
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>برنامه من</title>

  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f5f5f5;
    }

    header {
      background: white;
      padding: 18px;
      text-align: center;
      border-bottom: 1px solid #ddd;
    }

    header h1 {
      margin: 0;
      font-size: 24px;
    }

    .container {
      max-width: 600px;
      margin: 30px auto;
      padding: 15px;
    }

    .welcome {
      background: white;
      padding: 30px 20px;
      border-radius: 15px;
      text-align: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
    }

    .welcome h2 {
      margin-top: 0;
    }

    .buttons {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-top: 25px;
    }

    button {
      border: none;
      padding: 12px 22px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 16px;
    }

    .login {
      background: #222;
      color: white;
    }

    .signup {
      background: #eee;
      color: #222;
    }
  </style>
</head>

<body>

<header>
  <h1>برنامه من</h1>
</header>

<div class="container">
  <div class="welcome">
    <h2>به برنامه ما خوش آمدید 👋</h2>
    <p>این اولین نسخه پلتفرم ماست.</p>
    <p>به‌زودی امکانات بیشتری به آن اضافه می‌کنیم.</p>

    <div class="buttons">
      <button class="login">ورود</button>
      <button class="signup">ثبت‌نام</button>
    </div>
  </div>
</div>

</body>
</html>
  `);
});

server.listen(port, "0.0.0.0", () => {
  console.log("Server is running on port " + port);
});
