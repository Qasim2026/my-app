const http = require("http");
const url = require("url");
const crypto = require("crypto");
const util = require("util");
const { Pool } = require("pg");

const scryptAsync = util.promisify(crypto.scrypt);

// ==========================================
// 1. تنظیمات پایگاه داده و پورت
// ==========================================
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

// ==========================================
// 2. توابع امنیتی، پاک‌سازی و سشن
// ==========================================
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

function safeUrl(u) {
  if (!u || typeof u !== "string") return "";
  const trimmed = u.trim();
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

  // پشتیبانی از کاربران ثبت‌نام‌شده قبلی
  const legacyHash = crypto.createHash("sha256").update(String(password)).digest("hex");
  return legacyHash === storedHash;
}

function makeSessionCookie(token, maxAge = 2592000) {
  const isSecure = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
  const secureFlag = isSecure ? "; Secure" : "";
  return `session_token=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureFlag}`;
}

// ==========================================
// 3. توابع کمکی ساخت اجزای قالب (UI Helpers)
// ==========================================
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

// ==========================================
// 4. دریافت بدنه درخواست (Request Body Parser)
// ==========================================
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 4 * 1024 * 1024) { // محدودیت ۴ مگابایت
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

// ==========================================
// 5. ایجاد خودکار جداول دیتابیس (Migration)
// ==========================================
async function initDb() {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(128) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      media_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS saved_posts (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(query);
  console.log("پایگاه داده با موفقیت مقداردهی شد.");
}

// ==========================================
// 6. اجرای سرور (Server Runner)
// ==========================================
initDb().then(() => {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // مسیر بررسی وضعیت سرور
    if (pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "ok", time: new Date() }));
    }

    // پاسخ ساده به صفحه اصلی برای اطمینان از بالا بودن سرور
    if (pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`
        <!DOCTYPE html>
        <html lang="fa" dir="rtl">
        <head><meta charset="utf-8"><title>شبکه اجتماعی</title></head>
        <body style="font-family:Tahoma,sans-serif;padding:30px;background:#f3f4f6;text-align:center;">
          <h1>شبکه اجتماعی فعال است ✅</h1>
          <p>سرور روی رندر با اتصال ایمن دیتابیس آماده خدمت‌رسانی است.</p>
        </body>
        </html>
      `);
    }

    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("صفحه پیدا نشد.");
  });

  server.listen(PORT, () => {
    console.log(`سرور با موفقیت روی پورت ${PORT} شروع به کار کرد.`);
  });
}).catch(err => {
  console.error("خطا در اتصال به دیتابیس:", err);
});
