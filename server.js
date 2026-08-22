const http = require("http");

const port = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>My App</title>
      </head>
      <body>
        <h1>به برنامه ما خوش آمدید</h1>
        <p>نسخه اولیه برنامه با موفقیت اجرا شده است.</p>
      </body>
    </html>
  `);
});

server.listen(port, "0.0.0.0", () => {
  console.log("Server is running on port " + port);
});
