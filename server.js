const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 10000;

if (!process.env.DATABASE_URL) {
  console.error("STARTUP ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
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
    const i = part.indexOf("=");
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  });
  return cookies;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(new URLSearchParams(body)));
    req.on("error", reject);
  });
}

function redirect(res, location, cookie) {
  const headers = { Location: location };
  if (cookie) headers["Set-Cookie"] = cookie;
  res.writeHead(302, headers);
  res.end();
}

function sendHtml(res, status, title, content, user = null) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(page(title, content, user));
}

function page(title, content, user) {
  const nav = user ? `
    <nav class="bottom-nav">
      <a href="/"><span>🏠</span>خانه</a>
      <a href="/search"><span>🔎</span>جستجو</a>
      <a href="/new-post"><span>➕</span>پست</a>
      <a href="/messages"><span>💬</span>پیام</a>
      <a href="/profile"><span>👤</span>پروفایل</a>
    </nav>
  ` : "";

  const topMenu = user ? `
    <div class="top-actions">
      <a href="/notifications">🔔 اعلان‌ها</a>
      <a href="/jobs">💼 کاریابی</a>
      <a href="/settings">⚙️ تنظیمات</a>
      <a href="/logout">🚪 خروج</a>
    </div>
  ` : "";

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#eef1f5;color:#202124;font-family:Tahoma,Arial,sans-serif}
.app{width:100%;max-width:720px;min-height:100vh;margin:auto;background:#fff;padding-bottom:${user ? "90px" : "25px"}}
.header{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid #e4e7eb;padding:13px 15px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.logo{font-weight:800;font-size:19px}
.title{font-size:17px;font-weight:700}
.content{padding:14px}
.card{background:#fff;border:1px solid #e1e5ea;border-radius:18px;padding:15px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.04)}
.profile-head{display:flex;align-items:center;gap:11px}
.avatar{width:52px;height:52px;border-radius:50%;background:#202124;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:bold;flex:none}
.username{font-weight:800;font-size:16px}
.email{color:#777;font-size:12px;margin-top:4px;direction:ltr;text-align:right}
.post-text{margin:17px 0;line-height:1.9;white-space:pre-wrap;word-break:break-word}
.stats{display:flex;gap:14px;color:#666;font-size:13px;flex-wrap:wrap}
.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
button,.btn{border:0;border-radius:11px;padding:11px 14px;background:#202124;color:#fff;cursor:pointer;font-size:14px;text-decoration:none;display:inline-block}
button:hover,.btn:hover{opacity:.9}
.full{width:100%;margin-top:8px;text-align:center}
.like{background:#e91e63}.follow{background:#1976d2}.danger{background:#b00020}.green{background:#087f23}
input,textarea{width:100%;padding:12px;margin:7px 0;border:1px solid #ccd2d9;border-radius:11px;font-size:16px;font-family:Tahoma,Arial,sans-serif;background:#fff}
textarea{min-height:120px;resize:vertical}
a{text-decoration:none;color:inherit}
.top-actions{display:flex;gap:7px;overflow:auto;padding:0 14px 12px}
.top-actions a{background:#f4f6f8;border-radius:10px;padding:8px 10px;white-space:nowrap;font-size:12px}
.menu{display:grid;gap:9px}.menu a{display:block}
.empty{text-align:center;color:#777;padding:30px 10px}
.success{color:#087f23}.error{color:#b00020}
.comment{background:#f5f6f8;border-radius:12px;padding:10px;margin-top:8px}
.comment-name{font-weight:bold}.comment-text{margin-top:5px;white-space:pre-wrap}
.job{border:1px solid #e0e4e8;border-radius:15px;padding:14px;margin-bottom:11px}
.job-title{font-size:18px;font-weight:800}.job-city,.job-salary{margin-top:7px}.job-salary{color:#087f23}
.job-description{margin-top:11px;line-height:1.8;white-space:pre-wrap}
.post-image{width:100%;max-height:420px;object-fit:cover;border-radius:14px;margin-top:10px}
.notice{padding:10px 12px;border-radius:12px;background:#fff8e1;color:#795548;margin-bottom:12px}
.theme-btn{background:#f4f6f8;color:#202124}
.small{font-size:12px;color:#777}.divider{height:1px;background:#e3e6e9;margin:18px 0}
.bottom-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:720px;height:67px;background:#fff;border-top:1px solid #ddd;display:flex;justify-content:space-around;align-items:center;z-index:50;box-shadow:0 -3px 12px rgba(0,0,0,.05)}
.bottom-nav a{text-align:center;font-size:11px;color:#444;min-width:55px}.bottom-nav span{display:block;font-size:21px;margin-bottom:2px}
.hero{padding:8px 0 14px}.hero h1{margin:5px 0 8px;font-size:23px}.hero p{line-height:1.8;color:#666}
.badge{display:inline-block;background:#eef3ff;color:#2455c3;border-radius:20px;padding:5px 9px;font-size:11px}
@media(max-width:480px){.content{padding:10px}.card{border-radius:15px}.actions button,.actions .btn{padding:10px 11px}}
body.dark{background:#111;color:#eee}
body.dark .app,body.dark .header,body.dark .bottom-nav,body.dark input,body.dark textarea{background:#181818;color:#eee}
body.dark .card{background:#1d1d1d;border-color:#333}
body.dark .top-actions a{background:#292929;color:#eee}
body.dark input,body.dark textarea{border-color:#444}
body.dark .comment,body.dark .job{background:#242424;border-color:#3a3a3a}
body.dark .email,body.dark .small,body.dark .stats{color:#aaa}
</style>
</head>
<body>
<div class="app">
<header class="header">
  <div class="logo">📱 برنامه اجتماعی</div>
  <div class="title">${escapeHtml(title)}</div>
</header>
${topMenu}
<main class="content">${content}</main>
</div>
${nav}
<script>
function toggleTheme(){
  document.body.classList.toggle("dark");
  localStorage.setItem("dark",document.body.classList.contains("dark"));
}
if(localStorage.getItem("dark")==="true")
  document.body.classList.add("dark");
</script>
</body>
</html>`;
}

async function ensureColumn(table, column, definition) {
  await pool.query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`
  );
}

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
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("posts", "content", "TEXT");
  await ensureColumn("posts", "image_url", "TEXT");

  try {
    await pool.query(`
      UPDATE posts
      SET content = text
      WHERE (content IS NULL OR content = '')
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name='posts'
          AND column_name='text'
        )
    `);
    console.log("Old posts.text data copied to posts.content.");
  } catch (e) {
    console.log("Old posts.text migration skipped.");
  }

  await pool.query(`UPDATE posts SET content = '' WHERE content IS NULL`);
  await pool.query(`ALTER TABLE posts ALTER COLUMN content SET NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(post_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      id SERIAL PRIMARY KEY,
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(follower_id,following_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      salary TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);await pool.query(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_users (
      id SERIAL PRIMARY KEY,
      blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(blocker_id,blocked_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Database tables checked and repaired successfully.");
}

async function createSession(userId) {
  const id = crypto.randomBytes(32).toString("hex");

  await pool.query(
    `INSERT INTO sessions(session_id,user_id) VALUES($1,$2)`,
    [id, userId]
  );

  return id;
}

async function getSession(req) {
  const sid = parseCookies(req).sessionId;

  if (!sid) return null;

  const r = await pool.query(`
    SELECT users.id,users.name,users.email
    FROM sessions
    JOIN users ON users.id=sessions.user_id
    WHERE sessions.session_id=$1
  `, [sid]);

  return r.rows[0] || null;
}

async function notify(userId, actorId, type, postId, message) {
  if (!userId || userId === actorId) return;

  await pool.query(`
    INSERT INTO notifications(
      user_id,
      actor_id,
      type,
      post_id,
      message
    )
    VALUES($1,$2,$3,$4,$5)
  `, [
    userId,
    actorId,
    type,
    postId || null,
    message
  ]);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    const user = await getSession(req);

    if (req.method === "GET" && path === "/") {
      if (!user) {
        sendHtml(res, 200, "خوش آمدید", `
          <div class="hero">
            <h1>یک جای مرتب برای ارتباط 👋</h1>
            <p>
              پست منتشر کن، کاربران را پیدا کن،
              پیام بده و آگهی کاری ببین.
            </p>
          </div>

          <div class="card menu">
            <a href="/signup">
              <button class="full">ثبت‌نام</button>
            </a>

            <a href="/login">
              <button class="full">ورود</button>
            </a>
          </div>
        `);

        return;
      }

      const posts = await pool.query(`
        SELECT
          p.id,
          p.content,
          p.image_url,
          p.created_at,
          u.id user_id,
          u.name,
          u.email,

          (
            SELECT COUNT(*)
            FROM likes l
            WHERE l.post_id=p.id
          ) like_count,

          (
            SELECT COUNT(*)
            FROM comments c
            WHERE c.post_id=p.id
          ) comment_count,

          EXISTS(
            SELECT 1
            FROM likes l2
            WHERE l2.post_id=p.id
            AND l2.user_id=$1
          ) liked,

          EXISTS(
            SELECT 1
            FROM bookmarks b
            WHERE b.post_id=p.id
            AND b.user_id=$1
          ) bookmarked

        FROM posts p
        JOIN users u ON u.id=p.user_id

        WHERE NOT EXISTS (
          SELECT 1
          FROM blocked_users bu
          WHERE bu.blocker_id=$1
          AND bu.blocked_id=u.id
        )

        ORDER BY p.created_at DESC
        LIMIT 50
      `, [user.id]);

      let html = `
        <div class="card">
          <div class="profile-head">
            <div class="avatar">
              ${escapeHtml(user.name.charAt(0))}
            </div>

            <div>
              <div class="username">
                خوش آمدی ${escapeHtml(user.name)} 👋
              </div>

              <div class="email">
                ${escapeHtml(user.email)}
              </div>
            </div>
          </div>
        </div>

        <a href="/new-post">
          <button class="full">
            ➕ انتشار پست جدید
          </button>
        </a>

        <div class="divider"></div>
      `;

      if (!posts.rows.length) {
        html += `
          <div class="card empty">
            هنوز پستی منتشر نشده است.<br>
            اولین پست را منتشر کن! 📸
          </div>
        `;
      } else {
        for (const p of posts.rows) {
          html += `
            <article class="card">

              <div class="profile-head">
                <div class="avatar">
                  ${escapeHtml(p.name.charAt(0))}
                </div>

                <div>
                  <div class="username">
                    ${escapeHtml(p.name)}
                  </div>

                  <div class="email">
                    ${escapeHtml(p.email)}
                  </div>
                </div>
              </div>

              <div class="post-text">
                ${escapeHtml(p.content)}
              </div>

              ${
                p.image_url
                  ? `<img class="post-image" src="${escapeHtml(p.image_url)}" alt="تصویر پست">`
                  : ""
              }

              <div class="stats">
                <span>❤️ ${p.like_count}</span>
                <span>💬 ${p.comment_count}</span>
              </div>

              <div class="actions">

                <a href="/like?post=${p.id}">
                  <button class="like">
                    ${p.liked ? "💔 برداشتن لایک" : "❤️ لایک"}
                  </button>
                </a>

                <a href="/post?id=${p.id}">
                  <button>
                    💬 نظرها
                  </button>
                </a>

                <a href="/bookmark?post=${p.id}">
                  <button>
                    ${p.bookmarked ? "🔖 ذخیره‌شده" : "🔖 ذخیره"}
                  </button>
                </a>

                <a href="/post?id=${p.id}">
                  <button>
                    🔗 اشتراک
                  </button>
                </a>

              </div>
            </article>
          `;
        }
      }

      sendHtml(res, 200, "خانه", html, user);
      return;
    }

    if (req.method === "GET" && path === "/signup") {
      sendHtml(res, 200, "ثبت‌نام", `
        <div class="card">
          <form method="POST" action="/signup">

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
              placeholder="رمز عبور، حداقل ۶ کاراکتر"
              minlength="6"
              required
            >

            <button class="full">
              ثبت‌نام
            </button>

          </form>
        </div>

        <a href="/">
          بازگشت
        </a>
      `);

      return;
    }

    if (req.method === "POST" && path === "/signup") {
      const d = await readBody(req);

      const name = (d.get("name") || "").trim();
      const email = (d.get("email") || "").trim().toLowerCase();
      const password = d.get("password") || "";

      if (!name || !email || password.length < 6) {
        sendHtml(
          res,
          400,
          "خطا",
          `<p class="error">
            نام، ایمیل و رمز حداقل ۶ کاراکتری لازم است.
          </p>`
        );

        return;
      }

      try {
        await pool.query(
          `INSERT INTO users(name,email,password)
           VALUES($1,$2,$3)`,
          [
            name,
            email,
            hashPassword(password)
          ]
        );

        sendHtml(res, 200, "ثبت‌نام موفق", `
          <div class="card">
            <h2 class="success">
              ثبت‌نام موفق شد ✅
            </h2>

            <a href="/login">
              <button class="full">
                ورود
              </button>
            </a>
          </div>
        `);
      } catch (e) {
        sendHtml(res, 400, "خطا", `
          <p class="error">
            این ایمیل قبلاً ثبت شده است.
          </p>

          <a href="/signup">
            بازگشت
          </a>
        `);
      }

      return;
    }

    if (req.method === "GET" && path === "/login") {
      sendHtml(res, 200, "ورود", `
        <div class="card">
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

            <button class="full">
              ورود
            </button>

          </form>
        </div>
      `);

      return;
    }

    if (req.method === "POST" && path === "/login") {
      const d = await readBody(req);

      const email = (d.get("email") || "")
        .trim()
        .toLowerCase();

      const password = d.get("password") || "";

      const r = await pool.query(
        `SELECT id,name,email
         FROM users
         WHERE email=$1
         AND password=$2`,
        [
          email,
          hashPassword(password)
        ]
      );

      if (!r.rows.length) {
        sendHtml(res, 401, "خطا", `
          <p class="error">
            ایمیل یا رمز عبور اشتباه است.
          </p>

          <a href="/login">
            تلاش دوباره
          </a>
        `);

        return;
      }

      const sid = await createSession(r.rows[0].id);

      redirect(
        res,
        "/",
        `sessionId=${encodeURIComponent(sid)}; HttpOnly; Path=/; SameSite=Lax`
      );

      return;
    }

    if (!user) {
      if (["/logout"].includes(path)) {
        redirect(res, "/");
      } else {
        redirect(res, "/login");
      }

      return;
}if (req.method === "GET" && path === "/logout") {
      const sid = parseCookies(req).sessionId;

      if (sid) {
        await pool.query(
          `DELETE FROM sessions WHERE session_id=$1`,
          [sid]
        );
      }

      redirect(
        res,
        "/login",
        "sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
      );

      return;
    }

    if (req.method === "GET" && path === "/new-post") {
      sendHtml(res, 200, "پست جدید", `
        <div class="card">
          <form method="POST" action="/new-post">

            <textarea
              name="content"
              maxlength="5000"
              placeholder="چه چیزی می‌خواهی منتشر کنی؟"
              required
            ></textarea>

            <input
              name="image_url"
              type="url"
              placeholder="لینک تصویر (اختیاری)"
            >

            <button class="full">
              📤 انتشار پست
            </button>

          </form>
        </div>

        <a href="/">
          بازگشت به خانه
        </a>
      `, user);

      return;
    }

    if (req.method === "POST" && path === "/new-post") {
      const d = await readBody(req);

      const content = (d.get("content") || "").trim();
      const imageUrl = (d.get("image_url") || "").trim();

      if (!content) {
        sendHtml(res, 400, "خطا", `
          <div class="card">
            <p class="error">
              متن پست نمی‌تواند خالی باشد.
            </p>
          </div>
        `, user);

        return;
      }

      await pool.query(
        `INSERT INTO posts(user_id,content,image_url)
         VALUES($1,$2,$3)`,
        [
          user.id,
          content,
          imageUrl || null
        ]
      );

      redirect(res, "/");
      return;
    }

    if (req.method === "GET" && path === "/like") {
      const postId = Number(url.searchParams.get("post"));

      if (!Number.isInteger(postId)) {
        redirect(res, "/");
        return;
      }

      const exists = await pool.query(
        `SELECT id
         FROM likes
         WHERE post_id=$1
         AND user_id=$2`,
        [
          postId,
          user.id
        ]
      );

      if (exists.rows.length) {
        await pool.query(
          `DELETE FROM likes
           WHERE post_id=$1
           AND user_id=$2`,
          [
            postId,
            user.id
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO likes(post_id,user_id)
           VALUES($1,$2)
           ON CONFLICT DO NOTHING`,
          [
            postId,
            user.id
          ]
        );

        const owner = await pool.query(
          `SELECT user_id
           FROM posts
           WHERE id=$1`,
          [postId]
        );

        if (owner.rows.length) {
          await notify(
            owner.rows[0].user_id,
            user.id,
            "like",
            postId,
            `${user.name} پست شما را پسندید ❤️`
          );
        }
      }

      redirect(res, "/");
      return;
    }

    if (req.method === "GET" && path === "/bookmark") {
      const postId = Number(url.searchParams.get("post"));

      if (!Number.isInteger(postId)) {
        redirect(res, "/");
        return;
      }

      const exists = await pool.query(
        `SELECT id
         FROM bookmarks
         WHERE post_id=$1
         AND user_id=$2`,
        [
          postId,
          user.id
        ]
      );

      if (exists.rows.length) {
        await pool.query(
          `DELETE FROM bookmarks
           WHERE post_id=$1
           AND user_id=$2`,
          [
            postId,
            user.id
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO bookmarks(post_id,user_id)
           VALUES($1,$2)
           ON CONFLICT DO NOTHING`,
          [
            postId,
            user.id
          ]
        );
      }

      redirect(res, "/");
      return;
    }

    if (req.method === "GET" && path === "/post") {
      const postId = Number(url.searchParams.get("id"));

      if (!Number.isInteger(postId)) {
        redirect(res, "/");
        return;
      }

      const postResult = await pool.query(`
        SELECT
          p.id,
          p.content,
          p.image_url,
          p.created_at,
          u.id user_id,
          u.name,
          u.email,

          (
            SELECT COUNT(*)
            FROM likes l
            WHERE l.post_id=p.id
          ) like_count,

          (
            SELECT COUNT(*)
            FROM comments c
            WHERE c.post_id=p.id
          ) comment_count

        FROM posts p
        JOIN users u ON u.id=p.user_id
        WHERE p.id=$1
      `, [postId]);

      if (!postResult.rows.length) {
        sendHtml(res, 404, "پست پیدا نشد", `
          <div class="card empty">
            این پست وجود ندارد.
          </div>
        `, user);

        return;
      }

      const post = postResult.rows[0];

      const comments = await pool.query(`
        SELECT
          c.id,
          c.comment,
          c.created_at,
          u.name
        FROM comments c
        JOIN users u ON u.id=c.user_id
        WHERE c.post_id=$1
        ORDER BY c.created_at ASC
      `, [postId]);

      let html = `
        <article class="card">

          <div class="profile-head">
            <div class="avatar">
              ${escapeHtml(post.name.charAt(0))}
            </div>

            <div>
              <div class="username">
                ${escapeHtml(post.name)}
              </div>

              <div class="email">
                ${escapeHtml(post.email)}
              </div>
            </div>
          </div>

          <div class="post-text">
            ${escapeHtml(post.content)}
          </div>

          ${
            post.image_url
              ? `
                <img
                  class="post-image"
                  src="${escapeHtml(post.image_url)}"
                  alt="تصویر پست"
                >
              `
              : ""
          }

          <div class="stats">
            <span>❤️ ${post.like_count}</span>
            <span>💬 ${post.comment_count}</span>
          </div>

        </article>

        <div class="card">
          <h3>💬 نظرها</h3>

          <form method="POST" action="/comment">
            <input
              type="hidden"
              name="post_id"
              value="${post.id}"
            >

            <textarea
              name="comment"
              maxlength="2000"
              placeholder="نظر خود را بنویس..."
              required
            ></textarea>

            <button class="full">
              ارسال نظر
            </button>
          </form>
        </div>
      `;

      if (!comments.rows.length) {
        html += `
          <div class="card empty">
            هنوز نظری ثبت نشده است.
          </div>
        `;
      } else {
        for (const c of comments.rows) {
          html += `
            <div class="card comment">
              <div class="comment-name">
                ${escapeHtml(c.name)}
              </div>

              <div class="comment-text">
                ${escapeHtml(c.comment)}
              </div>

              <div class="small">
                ${new Date(c.created_at).toLocaleString("fa-IR")}
              </div>
            </div>
          `;
        }
      }

      sendHtml(res, 200, "پست", html, user);
      return;
    }

    if (req.method === "POST" && path === "/comment") {
      const d = await readBody(req);

      const postId = Number(d.get("post_id"));
      const comment = (d.get("comment") || "").trim();

      if (
        !Number.isInteger(postId) ||
        !comment
      ) {
        redirect(res, "/");
        return;
      }

      await pool.query(
        `INSERT INTO comments(post_id,user_id,comment)
         VALUES($1,$2,$3)`,
        [
          postId,
          user.id,
          comment
        ]
      );

      const owner = await pool.query(
        `SELECT user_id
         FROM posts
         WHERE id=$1`,
        [postId]
      );

      if (owner.rows.length) {
        await notify(
          owner.rows[0].user_id,
          user.id,
          "comment",
          postId,
          `${user.name} روی پست شما نظر گذاشت 💬`
        );
      }

      redirect(
        res,
        `/post?id=${postId}`
      );

      return;
    }

    if (req.method === "GET" && path === "/search") {
      const q = (url.searchParams.get("q") || "").trim();

      let users = [];

      if (q) {
        const r = await pool.query(`
          SELECT id,name,email
          FROM users
          WHERE name ILIKE $1
             OR email ILIKE $1
          ORDER BY name
          LIMIT 30
        `, [`%${q}%`]);

        users = r.rows;
      }

      let html = `
        <div class="card">
          <form method="GET" action="/search">

            <input
              name="q"
              value="${escapeHtml(q)}"
              placeholder="جستجوی نام یا ایمیل..."
            >

            <button class="full">
              🔎 جستجو
            </button>

          </form>
        </div>
      `;

      if (q && !users.length) {
        html += `
          <div class="card empty">
            کاربری پیدا نشد.
          </div>
        `;
      }

      for (const u of users) {
        if (u.id === user.id) continue;

        const following = await pool.query(
          `SELECT id
           FROM follows
           WHERE follower_id=$1
           AND following_id=$2`,
          [
            user.id,
            u.id
          ]
        );

        html += `
          <div class="card">

            <div class="profile-head">
              <div class="avatar">
                ${escapeHtml(u.name.charAt(0))}
              </div>

              <div>
                <div class="username">
                  ${escapeHtml(u.name)}
                </div>

                <div class="email">
                  ${escapeHtml(u.email)}
                </div>
              </div>
            </div>

            <div class="actions">
              <a href="/profile?id=${u.id}">
                <button>
                  👤 پروفایل
                </button>
              </a>

              <a href="/follow?id=${u.id}">
                <button class="follow">
                  ${
                    following.rows.length
                      ? "➖ لغو دنبال‌کردن"
                      : "➕ دنبال‌کردن"
                  }
                </button>
              </a>

              <a href="/messages?user=${u.id}">
                <button>
                  💬 پیام
                </button>
              </a>
            </div>

          </div>
        `;
      }

      sendHtml(res, 200, "جستجو", html, user);
      return;
    }

    if (req.method === "GET" && path === "/follow") {
      const targetId = Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(targetId) ||
        targetId === user.id
      ) {
        redirect(res, "/");
        return;
      }

      const target = await pool.query(
        `SELECT id,name
         FROM users
         WHERE id=$1`,
        [targetId]
      );

      if (!target.rows.length) {
        redirect(res, "/search");
        return;
      }

      const exists = await pool.query(
        `SELECT id
         FROM follows
         WHERE follower_id=$1
         AND following_id=$2`,
        [
          user.id,
          targetId
        ]
      );

      if (exists.rows.length) {
        await pool.query(
          `DELETE FROM follows
           WHERE follower_id=$1
           AND following_id=$2`,
          [
            user.id,
            targetId
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO follows(
             follower_id,
             following_id
           )
           VALUES($1,$2)
           ON CONFLICT DO NOTHING`,
          [
            user.id,
            targetId
          ]
        );

        await notify(
          targetId,
          user.id,
          "follow",
          null,
          `${user.name} شما را دنبال کرد 👤`
        );
      }

      redirect(
        res,
        `/profile?id=${targetId}`
      );

      return;
}if (if (req.method === "GET" && path === "/profile") {
      const profileId = Number(
        url.searchParams.get("id") || user.id
      );

      if (!Number.isInteger(profileId)) {
        redirect(res, "/profile");
        return;
      }

      const profileResult = await pool.query(`
        SELECT id,name,email
        FROM users
        WHERE id=$1
      `, [profileId]);

      if (!profileResult.rows.length) {
        sendHtml(res, 404, "پروفایل", `
          <div class="card empty">
            کاربر پیدا نشد.
          </div>
        `, user);

        return;
      }

      const profile = profileResult.rows[0];

      const followers = await pool.query(
        `SELECT COUNT(*) count
         FROM follows
         WHERE following_id=$1`,
        [profileId]
      );

      const following = await pool.query(
        `SELECT COUNT(*) count
         FROM follows
         WHERE follower_id=$1`,
        [profileId]
      );

      const posts = await pool.query(`
        SELECT
          p.id,
          p.content,
          p.image_url,
          p.created_at,

          (
            SELECT COUNT(*)
            FROM likes l
            WHERE l.post_id=p.id
          ) like_count,

          (
            SELECT COUNT(*)
            FROM comments c
            WHERE c.post_id=p.id
          ) comment_count

        FROM posts p
        WHERE p.user_id=$1
        ORDER BY p.created_at DESC
        LIMIT 50
      `, [profileId]);

      let isFollowing = false;

      if (profileId !== user.id) {
        const f = await pool.query(
          `SELECT id
           FROM follows
           WHERE follower_id=$1
           AND following_id=$2`,
          [
            user.id,
            profileId
          ]
        );

        isFollowing = f.rows.length > 0;
      }

      let html = `
        <div class="card">

          <div class="profile-head">
            <div class="avatar">
              ${escapeHtml(profile.name.charAt(0))}
            </div>

            <div>
              <div class="username">
                ${escapeHtml(profile.name)}
              </div>

              <div class="email">
                ${escapeHtml(profile.email)}
              </div>
            </div>
          </div>

          <div class="stats" style="margin-top:15px">
            <span>
              👥 دنبال‌کننده:
              ${followers.rows[0].count}
            </span>

            <span>
              ➕ دنبال‌شده:
              ${following.rows[0].count}
            </span>

            <span>
              📝 پست:
              ${posts.rows.length}
            </span>
          </div>

          ${
            profileId !== user.id
              ? `
                <div class="actions">
                  <a href="/follow?id=${profile.id}">
                    <button class="follow">
                      ${
                        isFollowing
                          ? "➖ لغو دنبال‌کردن"
                          : "➕ دنبال‌کردن"
                      }
                    </button>
                  </a>

                  <a href="/messages?user=${profile.id}">
                    <button>
                      💬 پیام
                    </button>
                  </a>

                  <a href="/block?id=${profile.id}">
                    <button class="danger">
                      🚫 مسدودسازی
                    </button>
                  </a>
                </div>
              `
              : `
                <div class="actions">
                  <a href="/settings">
                    <button>
                      ⚙️ تنظیمات حساب
                    </button>
                  </a>
                </div>
              `
          }

        </div>
      `;

      if (!posts.rows.length) {
        html += `
          <div class="card empty">
            این کاربر هنوز پستی منتشر نکرده است.
          </div>
        `;
      } else {
        for (const p of posts.rows) {
          html += `
            <article class="card">

              <div class="post-text">
                ${escapeHtml(p.content)}
              </div>

              ${
                p.image_url
                  ? `
                    <img
                      class="post-image"
                      src="${escapeHtml(p.image_url)}"
                      alt="تصویر پست"
                    >
                  `
                  : ""
              }

              <div class="stats">
                <span>❤️ ${p.like_count}</span>
                <span>💬 ${p.comment_count}</span>
              </div>

              <div class="actions">
                <a href="/post?id=${p.id}">
                  <button>
                    👁️ مشاهده
                  </button>
                </a>

                <a href="/like?post=${p.id}">
                  <button class="like">
                    ❤️ لایک
                  </button>
                </a>
              </div>

            </article>
          `;
        }
      }

      sendHtml(
        res,
        200,
        `پروفایل ${profile.name}`,
        html,
        user
      );

      return;
    }

    if (req.method === "GET" && path === "/block") {
      const targetId = Number(
        url.searchParams.get("id")
      );

      if (
        !Number.isInteger(targetId) ||
        targetId === user.id
      ) {
        redirect(res, "/");
        return;
      }

      const target = await pool.query(
        `SELECT id,name
         FROM users
         WHERE id=$1`,
        [targetId]
      );

      if (!target.rows.length) {
        redirect(res, "/");
        return;
      }

      await pool.query(
        `INSERT INTO blocked_users(
           blocker_id,
           blocked_id
         )
         VALUES($1,$2)
         ON CONFLICT DO NOTHING`,
        [
          user.id,
          targetId
        ]
      );

      await pool.query(
        `DELETE FROM follows
         WHERE
           (follower_id=$1 AND following_id=$2)
           OR
           (follower_id=$2 AND following_id=$1)`,
        [
          user.id,
          targetId
        ]
      );

      redirect(res, "/");
      return;
    }

    if (req.method === "GET" && path === "/unblock") {
      const targetId = Number(
        url.searchParams.get("id")
      );

      if (!Number.isInteger(targetId)) {
        redirect(res, "/settings");
        return;
      }

      await pool.query(
        `DELETE FROM blocked_users
         WHERE blocker_id=$1
         AND blocked_id=$2`,
        [
          user.id,
          targetId
        ]
      );

      redirect(res, "/settings");
      return;
    }

    if (req.method === "GET" && path === "/saved") {
      const saved = await pool.query(`
        SELECT
          p.id,
          p.content,
          p.image_url,
          p.created_at,
          u.name,
          u.email,

          (
            SELECT COUNT(*)
            FROM likes l
            WHERE l.post_id=p.id
          ) like_count

        FROM bookmarks b
        JOIN posts p
          ON p.id=b.post_id
        JOIN users u
          ON u.id=p.user_id

        WHERE b.user_id=$1

        ORDER BY b.created_at DESC
      `, [user.id]);

      let html = "";

      if (!saved.rows.length) {
        html = `
          <div class="card empty">
            هنوز پست ذخیره‌شده‌ای نداری.
          </div>
        `;
      } else {
        for (const p of saved.rows) {
          html += `
            <article class="card">

              <div class="profile-head">
                <div class="avatar">
                  ${escapeHtml(p.name.charAt(0))}
                </div>

                <div>
                  <div class="username">
                    ${escapeHtml(p.name)}
                  </div>

                  <div class="email">
                    ${escapeHtml(p.email)}
                  </div>
                </div>
              </div>

              <div class="post-text">
                ${escapeHtml(p.content)}
              </div>

              ${
                p.image_url
                  ? `
                    <img
                      class="post-image"
                      src="${escapeHtml(p.image_url)}"
                      alt="تصویر پست"
                    >
                  `
                  : ""
              }

              <div class="stats">
                <span>❤️ ${p.like_count}</span>
              </div>

              <div class="actions">
                <a href="/post?id=${p.id}">
                  <button>
                    مشاهده پست
                  </button>
                </a>

                <a href="/bookmark?post=${p.id}">
                  <button>
                    🔖 حذف از ذخیره‌ها
                  </button>
                </a>
              </div>

            </article>
          `;
        }
      }

      sendHtml(
        res,
        200,
        "ذخیره‌شده‌ها",
        html,
        user
      );

      return;
    }

    if (req.method === "GET" && path === "/messages") {
      const targetId = Number(
        url.searchParams.get("user")
      );

      if (
        Number.isInteger(targetId) &&
        targetId !== user.id
      ) {
        const target = await pool.query(
          `SELECT id,name,email
           FROM users
           WHERE id=$1`,
          [targetId]
        );

        if (!target.rows.length) {
          redirect(res, "/messages");
          return;
        }

        const other = target.rows[0];

        const messages = await pool.query(`
          SELECT
            m.id,
            m.sender_id,
            m.receiver_id,
            m.message,
            m.created_at,
            u.name sender_name

          FROM messages m
          JOIN users u
            ON u.id=m.sender_id

          WHERE
            (m.sender_id=$1 AND m.receiver_id=$2)
            OR
            (m.sender_id=$2 AND m.receiver_id=$1)

          ORDER BY m.created_at ASC
        `, [
          user.id,
          targetId
        ]);

        let chat = `
          <div class="card">
            <div class="profile-head">
              <div class="avatar">
                ${escapeHtml(other.name.charAt(0))}
              </div>

              <div>
                <div class="username">
                  ${escapeHtml(other.name)}
                </div>

                <div class="email">
                  ${escapeHtml(other.email)}
                </div>
              </div>
            </div>
          </div>
        `;

        if (!messages.rows.length) {
          chat += `
            <div class="card empty">
              هنوز پیامی بین شما ارسال نشده است.
            </div>
          `;
        } else {
          for (const m of messages.rows) {
            const mine = m.sender_id === user.id;

            chat += `
              <div class="card"
                style="margin-right:${mine ? "25%" : "0"};
                       margin-left:${mine ? "0" : "25%"}">

                <div class="small">
                  ${escapeHtml(m.sender_name)}
                </div>

                <div class="post-text">
                  ${escapeHtml(m.message)}
                </div>

                <div class="small">
                  ${new Date(
                    m.created_at
                  ).toLocaleString("fa-IR")}
                </div>

              </div>
            `;
          }
        }

        chat += `
          <div class="card">

            <form method="POST" action="/messages">

              <input
                type="hidden"
                name="receiver_id"
                value="${other.id}"
              >

              <textarea
                name="message"
                maxlength="3000"
                placeholder="پیام خود را بنویس..."
                required
              ></textarea>

              <button class="full">
                📤 ارسال پیام
              </button>

            </form>

          </div>

          <a href="/messages">
            بازگشت به پیام‌ها
          </a>
        `;

        sendHtml(
          res,
          200,
          `پیام به ${other.name}`,
          chat,
          user
        );

        return;
      }

      const contacts = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.email,
          MAX(m.created_at) last_message

        FROM users u

        JOIN messages m
          ON (
            (m.sender_id=u.id AND m.receiver_id=$1)
            OR
            (m.receiver_id=u.id AND m.sender_id=$1)
          )

        WHERE u.id<>$1

        GROUP BY u.id,u.name,u.email

        ORDER BY last_message DESC
      `, [user.id]);

      let html = `
        <div class="card">
          <h3>💬 پیام‌ها</h3>
        </div>
      `;

      if (!contacts.rows.length) {
        html += `
          <div class="card empty">
            هنوز گفتگویی نداری.
          </div>
        `;
      } else {
        for (const c of contacts.rows) {
          html += `
            <a href="/messages?user=${c.id}">
              <div class="card">

                <div class="profile-head">

                  <div class="avatar">
                    ${escapeHtml(c.name.charAt(0))}
                  </div>

                  <div>
                    <div class="username">
                      ${escapeHtml(c.name)}
                    </div>

                    <div class="email">
                      ${escapeHtml(c.email)}
                    </div>
                  </div>

                </div>

              </div>
            </a>
          `;
        }
      }

      html += `
        <div class="card">
          <a href="/search">
            <button class="full">
              🔎 پیدا کردن کاربر برای پیام
            </button>
          </a>
        </div>
      `;

      sendHtml(
        res,
        200,
        "پیام‌ها",
        html,
        user
      );

      return;
    }

    if (req.method === "POST" && path === "/messages") {
      const d = await readBody(req);

      const receiverId = Number(
        d.get("receiver_id")
      );

      const message = (
        d.get("message") || ""
      ).trim();

      if (
        !Number.isInteger(receiverId) ||
        receiverId === user.id ||
        !message
      ) {
        redirect(res, "/messages");
        return;
      }

      const receiver = await pool.query(
        `SELECT id
         FROM users
         WHERE id=$1`,
        [receiverId]
      );

      if (!receiver.rows.length) {
        redirect(res, "/messages");
        return;
      }

      const blocked = await pool.query(
        `SELECT id
         FROM blocked_users
         WHERE
           (blocker_id=$1 AND blocked_id=$2)
           OR
           (blocker_id=$2 AND blocked_id=$1)`,
        [
          user.id,
          receiverId
        ]
      );

      if (blocked.rows.length) {
        sendHtml(res, 403, "پیام", `
          <div class="card">
            <p class="error">
              ارسال پیام به این کاربر امکان‌پذیر نیست.
            </p>
          </div>
        `, user);

        return;
      }

      await pool.query(`
        INSERT INTO messages(
          sender_id,
          receiver_id,
          message
        )
        VALUES($1,$2,$3)
      `, [
        user.id,
        receiverId,
        message
      ]);

      await notify(
        receiverId,
        user.id,
        "message",
        null,
        `${user.name} برای شما پیام فرستاد 💬`
      );

      redirect(
        res,
        `/messages?user=${receiverId}`
      );

      return;
                                     }req.method === "GET" && path === "/notifications") {
      const notifications = await pool.query(`
        SELECT
          n.id,
          n.message,
          n.type,
          n.is_read,
          n.created_at,
          u.name actor_name
        FROM notifications n
        LEFT JOIN users u
          ON u.id=n.actor_id
        WHERE n.user_id=$1
        ORDER BY n.created_at DESC
        LIMIT 100
      `, [user.id]);

      await pool.query(`
        UPDATE notifications
        SET is_read=TRUE
        WHERE user_id=$1
      `, [user.id]);

      let html = "";

      if (!notifications.rows.length) {
        html = `
          <div class="card empty">
            اعلان جدیدی نداری 🔔
          </div>
        `;
      } else {
        for (const n of notifications.rows) {
          html += `
            <div class="card">
              <div>
                ${escapeHtml(n.message)}
              </div>

              <div class="small" style="margin-top:8px">
                ${new Date(n.created_at).toLocaleString("fa-IR")}
              </div>
            </div>
          `;
        }
      }

      sendHtml(
        res,
        200,
        "اعلان‌ها",
        html,
        user
      );

      return;
    }

    if (req.method === "GET" && path === "/jobs") {
      const jobs = await pool.query(`
        SELECT
          j.id,
          j.title,
          j.city,
          j.salary,
          j.description,
          j.created_at,
          u.name,
          u.email
        FROM jobs j
        JOIN users u
          ON u.id=j.user_id
        ORDER BY j.created_at DESC
        LIMIT 100
      `);

      let html = `
        <div class="card">
          <h3>💼 کاریابی</h3>

          <p class="small">
            آگهی‌های کاری منتشرشده توسط کاربران
          </p>

          <a href="/new-job">
            <button class="full">
              ➕ ثبت آگهی کاری
            </button>
          </a>
        </div>
      `;

      if (!jobs.rows.length) {
        html += `
          <div class="card empty">
            هنوز آگهی کاری ثبت نشده است.
          </div>
        `;
      } else {
        for (const j of jobs.rows) {
          html += `
            <div class="job">

              <div class="job-title">
                ${escapeHtml(j.title)}
              </div>

              <div class="job-city">
                📍 ${escapeHtml(j.city)}
              </div>

              <div class="job-salary">
                💰 ${escapeHtml(j.salary)}
              </div>

              <div class="job-description">
                ${escapeHtml(j.description)}
              </div>

              <div class="small" style="margin-top:10px">
                منتشرکننده:
                ${escapeHtml(j.name)}
              </div>

              <div class="actions">
                <a href="/messages?user=${j.user_id || ""}">
                  <button>
                    💬 تماس
                  </button>
                </a>
              </div>

            </div>
          `;
        }
      }

      sendHtml(
        res,
        200,
        "کاریابی",
        html,
        user
      );

      return;
    }

    if (req.method === "GET" && path === "/new-job") {
      sendHtml(res, 200, "ثبت آگهی کاری", `
        <div class="card">

          <form method="POST" action="/new-job">

            <input
              name="title"
              maxlength="200"
              placeholder="عنوان شغل"
              required
            >

            <input
              name="city"
              maxlength="100"
              placeholder="شهر / محل کار"
              required
            >

            <input
              name="salary"
              maxlength="100"
              placeholder="حقوق"
              required
            >

            <textarea
              name="description"
              maxlength="3000"
              placeholder="توضیحات شغل"
              required
            ></textarea>

            <button class="full">
              📤 انتشار آگهی
            </button>

          </form>

        </div>

        <a href="/jobs">
          بازگشت به کاریابی
        </a>
      `, user);

      return;
    }

    if (req.method === "POST" && path === "/new-job") {
      const d = await readBody(req);

      const title = (
        d.get("title") || ""
      ).trim();

      const city = (
        d.get("city") || ""
      ).trim();

      const salary = (
        d.get("salary") || ""
      ).trim();

      const description = (
        d.get("description") || ""
      ).trim();

      if (
        !title ||
        !city ||
        !salary ||
        !description
      ) {
        sendHtml(res, 400, "خطا", `
          <div class="card">
            <p class="error">
              همه فیلدها باید تکمیل شوند.
            </p>
          </div>
        `, user);

        return;
      }

      await pool.query(`
        INSERT INTO jobs(
          user_id,
          title,
          city,
          salary,
          description
        )
        VALUES($1,$2,$3,$4,$5)
      `, [
        user.id,
        title,
        city,
        salary,
        description
      ]);

      redirect(res, "/jobs");
      return;
    }

    if (req.method === "GET" && path === "/settings") {
      const blocked = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.email
        FROM blocked_users b
        JOIN users u
          ON u.id=b.blocked_id
        WHERE b.blocker_id=$1
        ORDER BY u.name
      `, [user.id]);

      let html = `
        <div class="card">
          <h3>⚙️ تنظیمات</h3>

          <button
            class="theme-btn full"
            onclick="toggleTheme()"
          >
            🌓 تغییر حالت روشن / تاریک
          </button>
        </div>

        <div class="card">
          <h3>🔐 تغییر رمز عبور</h3>

          <form method="POST" action="/change-password">

            <input
              name="old_password"
              type="password"
              placeholder="رمز فعلی"
              required
            >

            <input
              name="new_password"
              type="password"
              minlength="6"
              placeholder="رمز جدید"
              required
            >

            <button class="full">
              تغییر رمز
            </button>

          </form>
        </div>

        <div class="card">
          <h3>🔖 ذخیره‌شده‌ها</h3>

          <a href="/saved">
            <button class="full">
              مشاهده پست‌های ذخیره‌شده
            </button>
          </a>
        </div>

        <div class="card">
          <h3>🚫 کاربران مسدودشده</h3>
      `;

      if (!blocked.rows.length) {
        html += `
          <p class="empty">
            کاربری مسدود نشده است.
          </p>
        `;
      } else {
        for (const b of blocked.rows) {
          html += `
            <div class="comment">

              <div class="comment-name">
                ${escapeHtml(b.name)}
              </div>

              <div class="email">
                ${escapeHtml(b.email)}
              </div>

              <div class="actions">
                <a href="/unblock?id=${b.id}">
                  <button>
                    رفع مسدودی
                  </button>
                </a>
              </div>

            </div>
          `;
        }
      }

      html += `
        </div>
      `;

      sendHtml(
        res,
        200,
        "تنظیمات",
        html,
        user
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/change-password"
    ) {
      const d = await readBody(req);

      const oldPassword =
        d.get("old_password") || "";

      const newPassword =
        d.get("new_password") || "";

      if (newPassword.length < 6) {
        sendHtml(res, 400, "خطا", `
          <div class="card">
            <p class="error">
              رمز جدید باید حداقل ۶ کاراکتر باشد.
            </p>
          </div>
        `, user);

        return;
      }

      const check = await pool.query(`
        SELECT id
        FROM users
        WHERE id=$1
        AND password=$2
      `, [
        user.id,
        hashPassword(oldPassword)
      ]);

      if (!check.rows.length) {
        sendHtml(res, 400, "خطا", `
          <div class="card">
            <p class="error">
              رمز فعلی اشتباه است.
            </p>
          </div>
        `, user);

        return;
      }

      await pool.query(`
        UPDATE users
        SET password=$1
        WHERE id=$2
      `, [
        hashPassword(newPassword),
        user.id
      ]);

      sendHtml(res, 200, "موفق", `
        <div class="card">
          <p class="success">
            رمز عبور با موفقیت تغییر کرد ✅
          </p>

          <a href="/">
            <button class="full">
              بازگشت به خانه
            </button>
          </a>
        </div>
      `, user);

      return;
    }

    if (
      req.method === "POST" &&
      path === "/report"
    ) {
      const d = await readBody(req);

      const reportedUserId =
        Number(d.get("user_id")) || null;

      const postId =
        Number(d.get("post_id")) || null;

      const reason =
        (d.get("reason") || "").trim();

      if (!reason) {
        redirect(res, "/");
        return;
      }

      await pool.query(`
        INSERT INTO reports(
          reporter_id,
          reported_user_id,
          post_id,
          reason
        )
        VALUES($1,$2,$3,$4)
      `, [
        user.id,
        reportedUserId,
        postId,
        reason
      ]);

      sendHtml(res, 200, "گزارش", `
        <div class="card">
          <p class="success">
            گزارش شما ثبت شد. ممنون که به بهتر شدن
            محیط برنامه کمک می‌کنی. ✅
          </p>

          <a href="/">
            <button class="full">
              بازگشت
            </button>
          </a>
        </div>
      `, user);

      return;
    }

    if (req.method === "GET" && path === "/report") {
      const postId =
        Number(url.searchParams.get("post")) || "";

      const userId =
        Number(url.searchParams.get("user")) || "";

      sendHtml(res, 200, "گزارش", `
        <div class="card">

          <form method="POST" action="/report">

            <input
              type="hidden"
              name="post_id"
              value="${escapeHtml(postId)}"
            >

            <input
              type="hidden"
              name="user_id"
              value="${escapeHtml(userId)}"
            >

            <textarea
              name="reason"
              maxlength="1000"
              placeholder="دلیل گزارش را بنویس..."
              required
            ></textarea>

            <button class="danger full">
              🚩 ثبت گزارش
            </button>

          </form>

        </div>
      `, user);

      return;
    }

    sendHtml(res, 404, "پیدا نشد", `
      <div class="card empty">
        صفحه موردنظر پیدا نشد.
      </div>

      <a href="/">
        بازگشت به خانه
      </a>
    `, user);

  } catch (error) {
    console.error("REQUEST ERROR:", error);

    if (!res.headersSent) {
      sendHtml(res, 500, "خطای سرور", `
        <div class="card">
          <p class="error">
            خطایی در پردازش درخواست رخ داد.
          </p>

          <p class="small">
            لطفاً دوباره تلاش کنید.
          </p>

          <a href="/">
            <button class="full">
              بازگشت به خانه
            </button>
          </a>
        </div>
      `);
    }
  }
});

async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("Database connection successful.");

    await createTables();

    server.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Server running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "STARTUP DATABASE ERROR:",
      error
    );

    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  console.log("SIGTERM received.");

  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT received.");

  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});

startServer();
