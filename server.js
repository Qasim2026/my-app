
const http = require("http");
const url = require("url");
const crypto = require("crypto");
const util = require("util");
const { Pool } = require("pg");

const scryptAsync = util.promisify(crypto.scrypt);

const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("خطا: DATABASE_URL تنظیم نشده است.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  return escapeHtml(str);
}

// اصلاحیه: تابع safeUrl برای پذیرش تصویر Base64
function safeUrl(u) {
  if (!u || typeof u !== "string") return "";
  const trimmed = u.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (/^(https?:\/\/|\/)/i.test(trimmed)) {
    return trimmed;
  }
  return "";
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(String(password), salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string") return false;

  if (storedHash.startsWith("scrypt$")) {
    const parts = storedHash.split("$");
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expected = parts[2];
    const actualBuf = await scryptAsync(String(password), salt, 64);
    const expectedBuf = Buffer.from(expected, "hex");
    if (actualBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  }

  const legacyHash = crypto.createHash("sha256").update(String(password)).digest("hex");
  return legacyHash === storedHash;
}

function makeSessionCookie(token, maxAge = 2592000) {
  const isSecure = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
  const secureFlag = isSecure ? "; Secure" : "";
  return `session_token=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureFlag}`;
}

function avatar(name, image = null, size = 48) {
  const numericSize = parseInt(size, 10) || 48;
  const safeImg = safeUrl(image);

  if (safeImg) {
    return `
      <img
        src="${escapeAttr(safeImg)}"
        class="avatar-img"
        style="width:${numericSize}px;height:${numericSize}px;border-radius:50%;object-fit:cover;"
        alt="پروفایل"
        loading="lazy"
      >
    `;
  }

  const first = String(name || "?").trim().charAt(0).toUpperCase();
  return `
    <div
      class="avatar"
      style="width:${numericSize}px;height:${numericSize}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#2563eb;color:#fff;font-weight:bold;"
    >
      ${escapeHtml(first)}
    </div>
  `;
}

function button(action, text, cls = "") {
  return `
    <form method="post" action="${escapeAttr(action)}" class="inline" style="display:inline-block;">
      <button class="${escapeAttr(cls)}">${escapeHtml(text)}</button>
    </form>
  `;
}

function postTextHtml(text) {
  if (!text) return "";
  const escaped = escapeHtml(text);
  const withHashtags = escaped.replace(/#([\w\u0600-\u06FF]+)/g, '<a href="/hashtag?tag=$1" class="hashtag">#$1</a>');
  return withHashtags.replace(/\n/g, "<br>");
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 4 * 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      const parsed = new URLSearchParams(data);
      const obj = {};
      for (const [key, value] of parsed.entries()) {
        obj[key] = value;
      }
      resolve(obj);
    });
    req.on("error", err => reject(err));
  });
}
  
function sendHtml(res, status, title, content) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Tahoma, sans-serif; background: #f3f4f6; margin: 0; padding: 0; }
    .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 10px; }
    .btn { padding: 10px 15px; border-radius: 5px; text-decoration: none; display: inline-block; }
    .blue { background: #2563eb; color: white; }
    .muted { color: #6b7280; font-size: 0.9em; }
    .inline { display: inline-block; }
  </style>
</head>
<body>
  ${content}
</body>
</html>`);
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(150) UNIQUE, password TEXT, bio TEXT, avatar_url TEXT, theme VARCHAR(10) DEFAULT 'light');
    CREATE TABLE IF NOT EXISTS sessions (token VARCHAR(128) PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, content TEXT, media_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS likes (user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY(user_id, post_id));
    CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, sender_id INTEGER REFERENCES users(id), receiver_id INTEGER REFERENCES users(id), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  `);
}

// مسیرهای احراز هویت
async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;
  const method = req.method;

  if (path === "/login" && method === "GET") {
    sendHtml(res, 200, "ورود", `<form method="post" class="card">
      <input type="email" name="email" placeholder="ایمیل" required>
      <input type="password" name="password" placeholder="رمز" required>
      <button type="submit">ورود</button>
    </form>`);
  } 
  else if (path === "/login" && method === "POST") {
    const body = await parseBody(req);
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [body.email.toLowerCase()]);
    if (rows.length > 0 && await verifyPassword(body.password, rows[0].password)) {
      const token = crypto.randomBytes(64).toString("hex");
      await pool.query("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, rows[0].id]);
      res.writeHead(302, { "Set-Cookie": makeSessionCookie(token), "Location": "/" });
      res.end();
    } else {
      res.end("خطای ورود");
    }
  }
  
  // شروع مسیر صفحه اصلی
  else if (path === "/" && method === "GET") {
    const user = await getUser(req); // این تابع در بخش بعدی تعریف می‌شود
    if (!user) { res.writeHead(302, { "Location": "/login" }); return res.end(); }
    
    const { rows: posts } = await pool.query("SELECT p.*, u.name, u.avatar_url FROM posts p JOIN users u ON p.user_id = u.id ORDER BY created_at DESC");
    let html = `<h1>خوش آمدی ${escapeHtml(user.name)}</h1>`;
    for (const p of posts) {
      html += `<div class="card"><strong>${escapeHtml(p.name)}</strong><p>${postTextHtml(p.content)}</p></div>`;
    }
    sendHtml(res, 200, "خانه", html);
  }
}

// ثبت پست جدید
if (path === "/new-post" && method === "GET") {
  sendHtml(res, 200, "پست جدید", `<form method="post" class="card">
    <textarea name="content" placeholder="چیزی بنویس..." required></textarea>
    <input type="text" name="media_url" placeholder="لینک تصویر (اختیاری)">
    <button type="submit">انتشار</button>
  </form>`);
}
else if (path === "/new-post" && method === "POST") {
  const body = await parseBody(req);
  const user = await getUser(req);
  if (user) {
    await pool.query("INSERT INTO posts (user_id, content, media_url) VALUES ($1, $2, $3)", 
      [user.id, body.content, safeUrl(body.media_url)]);
    res.writeHead(302, { "Location": "/" });
    res.end();
  }
}

// لایک کردن پست
else if (path === "/like" && method === "POST") {
  const user = await getUser(req);
  const postId = parseId(parsed.query.id);
  if (user && postId) {
    // ابتدا چک می‌کنیم لایک شده یا نه
    const { rowCount } = await pool.query("SELECT 1 FROM likes WHERE user_id=$1 AND post_id=$2", [user.id, postId]);
    if (rowCount > 0) {
      await pool.query("DELETE FROM likes WHERE user_id=$1 AND post_id=$2", [user.id, postId]);
    } else {
      await pool.query("INSERT INTO likes (user_id, post_id) VALUES ($1, $2)", [user.id, postId]);
    }
  }
  res.writeHead(302, { "Location": "/" });
  res.end();
}

// ثبت کامنت
else if (path === "/comment" && method === "POST") {
  const user = await getUser(req);
  const postId = parseId(parsed.query.id);
  const body = await parseBody(req);
  if (user && postId && body.content) {
    await pool.query("INSERT INTO comments (user_id, post_id, content) VALUES ($1, $2, $3)", 
      [user.id, postId, body.content]);
  }
  res.writeHead(302, { "Location": `/post?id=${postId}` });
  res.end();
}
  
// صفحه پروفایل عمومی (دیگران)
else if (path === "/user" && method === "GET") {
  const targetId = parseId(parsed.query.id);
  const user = await getUser(req);
  if (!user) { res.writeHead(302, { "Location": "/login" }); return res.end(); }

  const { rows } = await pool.query("SELECT id, name, email, bio, avatar_url FROM users WHERE id=$1", [targetId]);
  if (rows.length === 0) { res.end("کاربر یافت نشد"); return; }
  
  const target = rows[0];
  let html = `<h1>پروفایل ${escapeHtml(target.name)}</h1>
              <div class="card">${avatar(target.name, target.avatar_url, 100)}
              <p>${escapeHtml(target.bio || "بیو ندارم")}</p>`;
  
  // دکمه دنبال کردن
  html += button(`/follow?id=${targetId}`, "دنبال کردن", "blue");
  html += `</div>`;
  sendHtml(res, 200, target.name, html);
}

// دنبال کردن
else if (path === "/follow" && method === "POST") {
  const user = await getUser(req);
  const targetId = parseId(parsed.query.id);
  if (user && targetId && user.id !== targetId) {
    await pool.query("INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", 
      [user.id, targetId]);
  }
  res.writeHead(302, { "Location": `/user?id=${targetId}` });
  res.end();
}

// پروفایل کاربر فعلی (همان صفحه تنظیمات)
else if (path === "/profile" && method === "GET") {
  const user = await getUser(req);
  if (!user) { res.writeHead(302, { "Location": "/login" }); return res.end(); }
  
  sendHtml(res, 200, "پروفایل من", `
    <div class="card">
      ${avatar(user.name, user.avatar_url, 100)}
      <h2>${escapeHtml(user.name)}</h2>
      <p>${escapeHtml(user.bio || "هنوز بیو ننوشتی")}</p>
      <a href="/edit-profile" class="btn blue">✏️ ویرایش پروفایل</a>
      <a href="/messages" class="btn">💬 پیام‌ها</a>
    </div>
  `);
}
  
// لیست پیام‌ها (اصلاح شده)
else if (path === "/messages" && !parsed.query.user) {
  const user = await getUser(req);
  if (!user) { res.writeHead(302, { "Location": "/login" }); return res.end(); }

  // کوئری اصلاح شده که خطای ۵۰۰ نمی‌دهد
  const query = `
    SELECT u.id, u.name, u.avatar_url, m.content AS last_message, m.created_at AS last_time
    FROM (
      SELECT DISTINCT ON (CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END)
        CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_id,
        content, created_at
      FROM messages WHERE sender_id = $1 OR receiver_id = $1
      ORDER BY CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END, created_at DESC
    ) m
    JOIN users u ON u.id = m.other_id
    ORDER BY m.created_at DESC;
  `;
  const { rows } = await pool.query(query, [user.id]);
  
  let html = `<h1>پیام‌ها</h1>`;
  for (const c of rows) {
    html += `<div class="card"><a href="/messages?user=${c.id}"><strong>${escapeHtml(c.name)}</strong><p>${escapeHtml(c.last_message)}</p></a></div>`;
  }
  sendHtml(res, 200, "پیام‌ها", html);
}

// ویرایش پروفایل
else if (path === "/edit-profile" && method === "GET") {
  const user = await getUser(req);
  if (!user) { res.writeHead(302, { "Location": "/login" }); return res.end(); }
  
  sendHtml(res, 200, "ویرایش پروفایل", `<form method="post" class="card">
    <input type="text" name="name" value="${escapeAttr(user.name)}" required>
    <textarea name="bio">${escapeHtml(user.bio || "")}</textarea>
    <input type="text" name="avatar_url" value="${escapeAttr(user.avatar_url || "")}" placeholder="لینک عکس پروفایل">
    <button type="submit">ذخیره</button>
  </form>`);
    }
// تغییر رمز عبور
else if (path === "/change-password" && method === "POST") {
  const user = await getUser(req);
  if (!user) { res.writeHead(302, { "Location": "/login" }); return res.end(); }

  const body = await readBody(req);
  const { oldPassword, newPassword } = body;

  if (newPassword.length < 6) {
    return sendHtml(res, 400, "خطا", "رمز عبور جدید باید حداقل ۶ کاراکتر باشد.");
  }

  const { rows } = await pool.query("SELECT password FROM users WHERE id = $1", [user.id]);
  const userPassword = rows[0].password;

  if (await verifyPassword(oldPassword, userPassword)) {
    const hash = await hashPassword(newPassword);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hash, user.id]);
    res.writeHead(302, { "Location": "/profile?msg=success" });
    return res.end();
  } else {
    return sendHtml(res, 401, "خطا", "رمز عبور فعلی اشتباه است.");
  }
}

// خروج از حساب کاربری
else if (path === "/logout") {
  const user = await getUser(req);
  if (user) {
    await pool.query("DELETE FROM sessions WHERE session_id = $1", [user.sessionId]);
  }
  res.writeHead(302, { "Location": "/login" });
  return res.end();
}

// مسیر پیش‌فرض (اگر هیچ‌کدام نبود)
else {
  res.writeHead(404);
  res.end("صفحه مورد نظر یافت نشد.");
}

// بستن اتصال
res.end();
