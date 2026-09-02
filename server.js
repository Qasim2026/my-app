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

    req.on("end", () => {
      resolve(new URLSearchParams(body));
    });

    req.on("error", reject);
  });
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
      <a href="/account">📱 امکانات</a>
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
*{
  box-sizing:border-box
}

body{
  margin:0;
  background:#eef1f5;
  color:#202124;
  font-family:Tahoma,Arial,sans-serif
}

.app{
  width:100%;
  max-width:720px;
  min-height:100vh;
  margin:auto;
  background:#fff;
  padding-bottom:${user ? "90px" : "25px"}
}

.header{
  position:sticky;
  top:0;
  z-index:30;
  background:#fff;
  border-bottom:1px solid #e4e7eb;
  padding:13px 15px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px
}

.logo{
  font-weight:800;
  font-size:19px
}

.title{
  font-size:17px;
  font-weight:700
}

.content{
  padding:14px
}

.card{
  background:#fff;
  border:1px solid #e1e5ea;
  border-radius:18px;
  padding:15px;
  margin-bottom:14px;
  box-shadow:0 2px 8px rgba(0,0,0,.04)
}

.profile-head{
  display:flex;
  align-items:center;
  gap:11px
}

.avatar{
  width:52px;
  height:52px;
  border-radius:50%;
  background:#202124;
  color:#fff;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:22px;
  font-weight:bold;
  flex:none
}

.username{
  font-weight:800;
  font-size:16px
}

.email{
  color:#777;
  font-size:12px;
  margin-top:4px;
  direction:ltr;
  text-align:right
}

.post-text{
  margin:17px 0;
  line-height:1.9;
  white-space:pre-wrap;
  word-break:break-word
}

.stats{
  display:flex;
  gap:14px;
  color:#666;
  font-size:13px;
  flex-wrap:wrap
}

.actions{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
  margin-top:12px
}

button,
.btn{
  border:0;
  border-radius:11px;
  padding:11px 14px;
  background:#202124;
  color:#fff;
  cursor:pointer;
  font-size:14px;
  text-decoration:none;
  display:inline-block
}

button:hover,
.btn:hover{
  opacity:.9
}

.full{
  width:100%;
  margin-top:8px;
  text-align:center
}

.like{
  background:#e91e63
}

.follow{
  background:#1976d2
}

.danger{
  background:#b00020
}

.green{
  background:#087f23
}

input,
textarea,
select{
  width:100%;
  padding:12px;
  margin:7px 0;
  border:1px solid #ccd2d9;
  border-radius:11px;
  font-size:16px;
  font-family:Tahoma,Arial,sans-serif;
  background:#fff
}

textarea{
  min-height:120px;
  resize:vertical
}

a{
  text-decoration:none;
  color:inherit
}

.top-actions{
  display:flex;
  gap:7px;
  overflow:auto;
  padding:0 14px 12px
}

.top-actions a{
  background:#f4f6f8;
  border-radius:10px;
  padding:8px 10px;
  white-space:nowrap;
  font-size:12px
}

.menu{
  display:grid;
  gap:9px
}

.menu a{
  display:block
}

.empty{
  text-align:center;
  color:#777;
  padding:30px 10px
}

.success{
  color:#087f23
}

.error{
  color:#b00020
}

.comment{
  background:#f5f6f8;
  border-radius:12px;
  padding:10px;
  margin-top:8px
}

.comment-name{
  font-weight:bold
}

.comment-text{
  margin-top:5px;
  white-space:pre-wrap
}

.job{
  border:1px solid #e0e4e8;
  border-radius:15px;
  padding:14px;
  margin-bottom:11px
}

.job-title{
  font-size:18px;
  font-weight:800
}

.job-city,
.job-salary{
  margin-top:7px
}

.job-salary{
  color:#087f23
}

.job-description{
  margin-top:11px;
  line-height:1.8;
  white-space:pre-wrap
}

.post-image{
  width:100%;
  max-height:420px;
  object-fit:cover;
  border-radius:14px;
  margin-top:10px
}

.notice{
  padding:10px 12px;
  border-radius:12px;
  background:#fff8e1;
  color:#795548;
  margin-bottom:12px
}

.theme-btn{
  background:#f4f6f8;
  color:#202124
}

.small{
  font-size:12px;
  color:#777
}

.divider{
  height:1px;
  background:#e3e6e9;
  margin:18px 0
}

.bottom-nav{
  position:fixed;
  bottom:0;
  left:50%;
  transform:translateX(-50%);
  width:100%;
  max-width:720px;
  height:67px;
  background:#fff;
  border-top:1px solid #ddd;
  display:flex;
  justify-content:space-around;
  align-items:center;
  z-index:50;
  box-shadow:0 -3px 12px rgba(0,0,0,.05)
}

.bottom-nav a{
  text-align:center;
  font-size:11px;
  color:#444;
  min-width:55px
}

.bottom-nav span{
  display:block;
  font-size:21px;
  margin-bottom:2px
}

.hero{
  padding:8px 0 14px
}

.hero h1{
  margin:5px 0 8px;
  font-size:23px
}

.hero p{
  line-height:1.8;
  color:#666
}

.badge{
  display:inline-block;
  background:#eef3ff;
  color:#2455c3;
  border-radius:20px;
  padding:5px 9px;
  font-size:11px
}

@media(max-width:480px){
  .content{
    padding:10px
  }

  .card{
    border-radius:15px
  }

  .actions button,
  .actions .btn{
    padding:10px 11px
  }
}

body.dark{
  background:#111;
  color:#eee
}

body.dark .app,
body.dark .header,
body.dark .bottom-nav,
body.dark input,
body.dark textarea,
body.dark select{
  background:#181818;
  color:#eee
}

body.dark .card{
  background:#1d1d1d;
  border-color:#333
}

body.dark .top-actions a{
  background:#292929;
  color:#eee
}

body.dark input,
body.dark textarea,
body.dark select{
  border-color:#444
}

body.dark .comment,
body.dark .job{
  background:#242424;
  border-color:#3a3a3a
}

body.dark .email,
body.dark .small,
body.dark .stats{
  color:#aaa
}
</style>
</head>

<body>

<div class="app">

<header class="header">
  <div class="logo">📱 MySocial</div>
  <div class="title">${escapeHtml(title)}</div>
</header>

${topMenu}

<main class="content">
${content}
</main>

</div>

${nav}

<script>
function toggleTheme(){
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "dark",
    document.body.classList.contains("dark")
  );
}

if(localStorage.getItem("dark")==="true"){
  document.body.classList.add("dark");
}
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
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("posts","content","TEXT");
  await ensureColumn("posts","image_url","TEXT");
  await ensureColumn(
    "posts",
    "media_type",
    "TEXT DEFAULT 'image'"
  );
  await ensureColumn("posts","location","TEXT");
  await ensureColumn(
    "posts",
    "archived",
    "BOOLEAN DEFAULT FALSE"
  );
  await ensureColumn(
    "posts",
    "pinned",
    "BOOLEAN DEFAULT FALSE"
  );

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
  } catch(e) {
    console.log("Old posts.text migration skipped.");
  }

  await pool.query(`
    UPDATE posts
    SET content=''
    WHERE content IS NULL
  `);

  await pool.query(`
    ALTER TABLE posts
    ALTER COLUMN content SET NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL
        REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(post_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL
        REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      id SERIAL PRIMARY KEY,
      follower_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(follower_id,following_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
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
      sender_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL
        REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_users (
      id SERIAL PRIMARY KEY,
      blocker_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(blocker_id,blocked_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      reported_user_id INTEGER
        REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER
        REFERENCES posts(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER
        REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      post_id INTEGER
        REFERENCES posts(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn(
    "notifications",
    "message",
    "TEXT"
  );

  await ensureColumn(
    "notifications",
    "is_read",
    "BOOLEAN DEFAULT FALSE"
  );

  try {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name='notifications'
          AND column_name='read'
        )
        THEN
          UPDATE notifications
          SET is_read = read
          WHERE is_read IS NULL;
        END IF;
      END
      $$;
    `);
  } catch(e) {
    console.log(
      "Old notifications migration skipped."
    );
  }

  await pool.query(`
    UPDATE notifications
    SET message=''
    WHERE message IS NULL
  `);

  await pool.query(`
    UPDATE notifications
    SET is_read=FALSE
    WHERE is_read IS NULL
  `);

  await pool.query(`
    ALTER TABLE notifications
    ALTER COLUMN message SET NOT NULL
  `);

  try {
    await pool.query(`
      DO $$
      BEGIN

        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name='saved_posts'
        )
        THEN
          INSERT INTO bookmarks(user_id,post_id)
          SELECT user_id,post_id
          FROM saved_posts
          ON CONFLICT DO NOTHING;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name='blocks'
        )
        THEN
          INSERT INTO blocked_users(blocker_id,blocked_id)
          SELECT blocker_id,blocked_id
          FROM blocks
          ON CONFLICT DO NOTHING;
        END IF;

      END
      $$;
    `);
  } catch(e) {
    console.log(
      "Legacy bookmark/block migration skipped."
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      media_url TEXT,
      text TEXT DEFAULT '',
      media_type TEXT DEFAULT 'image',
      expires_at TIMESTAMP NOT NULL
        DEFAULT (
          CURRENT_TIMESTAMP + INTERVAL '24 hours'
        ),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS story_views (
      story_id INTEGER NOT NULL
        REFERENCES stories(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(story_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS story_reactions (
      story_id INTEGER NOT NULL
        REFERENCES stories(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      reaction TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(story_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS highlights (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      cover_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS highlight_items (
      highlight_id INTEGER NOT NULL
        REFERENCES highlights(id) ON DELETE CASCADE,
      story_id INTEGER NOT NULL
        REFERENCES stories(id) ON DELETE CASCADE,
      PRIMARY KEY(highlight_id,story_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reels (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      media_url TEXT NOT NULL,
      caption TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reel_likes (
      reel_id INTEGER NOT NULL
        REFERENCES reels(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(reel_id,user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reel_comments (
      id SERIAL PRIMARY KEY,
      reel_id INTEGER NOT NULL
        REFERENCES reels(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reel_views (
      id SERIAL PRIMARY KEY,
      reel_id INTEGER NOT NULL
        REFERENCES reels(id) ON DELETE CASCADE,
      user_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_views (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL
        REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shares (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER
        REFERENCES posts(id) ON DELETE CASCADE,
      reel_id INTEGER
        REFERENCES reels(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK(
        (post_id IS NOT NULL)
        OR
        (reel_id IS NOT NULL)
      )
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hashtags (
      id SERIAL PRIMARY KEY,
      tag TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hashtag_posts (
      hashtag_id INTEGER NOT NULL
        REFERENCES hashtags(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL
        REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY(hashtag_id,post_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hashtag_reels (
      hashtag_id INTEGER NOT NULL
        REFERENCES hashtags(id) ON DELETE CASCADE,
      reel_id INTEGER NOT NULL
        REFERENCES reels(id) ON DELETE CASCADE,
      PRIMARY KEY(hashtag_id,reel_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id,name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS collection_items (
      collection_id INTEGER NOT NULL
        REFERENCES collections(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL
        REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY(collection_id,post_id)
    )
  `);

  await pool.query(     if(
        req.method==="GET" &&
        path==="/logout"
      ) {

        const sid =
          parseCookies(req).sessionId;

        if(sid) {
          await pool.query(
            `
            DELETE FROM sessions
            WHERE session_id=$1
            `,
            [sid]
          );
        }

        redirect(
          res,
          "/",
          "sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
        );

        return;
      }

      if(
        req.method==="GET" &&
        path==="/new-post"
      ) {

        sendHtml(
          res,
          200,
          "پست جدید",
          `
          <div class="card">

            <form
              method="POST"
              action="/new-post"
            >

              <textarea
                name="content"
                maxlength="5000"
                placeholder="چه چیزی می‌خواهی منتشر کنی؟"
                required
              ></textarea>

              <input
                name="image_url"
                type="url"
                placeholder="لینک تصویر، اختیاری"
              >

              <input
                name="location"
                maxlength="200"
                placeholder="موقعیت، اختیاری"
              >

              <button class="full">
                📤 انتشار
              </button>

            </form>

          </div>
          `,
          user
        );

        return;
      }

      if(
        req.method==="POST" &&
        path==="/new-post"
      ) {

        const d = await readBody(req);

        const content =
          (d.get("content") || "").trim();

        const imageUrl =
          (d.get("image_url") || "").trim();

        const location =
          (d.get("location") || "").trim();

        if(!content) {

          sendHtml(
            res,
            400,
            "خطا",
            `
            <p class="error">
              متن پست نمی‌تواند خالی باشد.
            </p>
            `,
            user
          );

          return;
        }

        const r =
          await pool.query(
            `
            INSERT INTO posts
              (user_id,content,image_url,location)
            VALUES
              ($1,$2,$3,$4)
            RETURNING id
            `,
            [
              user.id,
              content,
              imageUrl || null,
              location || null
            ]
          );

        const postId =
          r.rows[0].id;

        /*
         * ثبت هشتگ‌های پست
         */
        const tags =
          content.match(/#[\p{L}\p{N}_]+/gu) || [];

        for(const rawTag of tags) {

          const tag =
            rawTag
              .slice(1)
              .toLowerCase()
              .slice(0,100);

          if(!tag) continue;

          const tagResult =
            await pool.query(
              `
              INSERT INTO hashtags(tag)
              VALUES($1)
              ON CONFLICT(tag)
              DO UPDATE SET tag=EXCLUDED.tag
              RETURNING id
              `,
              [tag]
            );

          await pool.query(
            `
            INSERT INTO hashtag_posts
              (hashtag_id,post_id)
            VALUES
              ($1,$2)
            ON CONFLICT DO NOTHING
            `,
            [
              tagResult.rows[0].id,
              postId
            ]
          );
        }

        redirect(res,"/");
        return;
      }

      if(
        req.method==="GET" &&
        path==="/post"
      ) {

        const id =
          Number(url.searchParams.get("id"));

        if(!Number.isInteger(id) || id <= 0) {

          sendHtml(
            res,
            400,
            "خطا",
            `<p class="error">شناسه پست نامعتبر است.</p>`,
            user
          );

          return;
        }

        const postResult =
          await pool.query(
            `
            SELECT
              p.id,
              p.content,
              p.image_url,
              p.location,
              p.created_at,
              u.id AS user_id,
              u.name,
              u.email,

              (
                SELECT COUNT(*)
                FROM likes l
                WHERE l.post_id=p.id
              ) AS like_count,

              EXISTS(
                SELECT 1
                FROM likes l2
                WHERE l2.post_id=p.id
                AND l2.user_id=$2
              ) AS liked,

              EXISTS(
                SELECT 1
                FROM bookmarks b
                WHERE b.post_id=p.id
                AND b.user_id=$2
              ) AS bookmarked

            FROM posts p
            JOIN users u
              ON u.id=p.user_id

            WHERE p.id=$1
            `,
            [id,user.id]
          );

        if(!postResult.rows.length) {

          sendHtml(
            res,
            404,
            "پست پیدا نشد",
            `
            <div class="card empty">
              این پست وجود ندارد یا حذف شده است.
            </div>
            `,
            user
          );

          return;
        }

        const p =
          postResult.rows[0];

        const comments =
          await pool.query(
            `
            SELECT
              c.id,
              c.comment,
              c.created_at,
              u.id AS user_id,
              u.name
            FROM comments c
            JOIN users u
              ON u.id=c.user_id
            WHERE c.post_id=$1
            ORDER BY c.created_at ASC
            LIMIT 200
            `,
            [id]
          );

        /*
         * ثبت بازدید
         */
        await pool.query(
          `
          INSERT INTO post_views
            (post_id,user_id)
          VALUES
            ($1,$2)
          `,
          [id,user.id]
        );

        let html = `
          <article class="card">

            <div class="profile-head">

              <div class="avatar">
                ${escapeHtml(
                  p.name.charAt(0)
                )}
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
                    alt="post image"
                  >
                `
                : ""
            }

            ${
              p.location
                ? `
                  <div class="small">
                    📍 ${escapeHtml(p.location)}
                  </div>
                `
                : ""
            }

            <div class="stats">
              ❤️ ${p.like_count}
            </div>

            <div class="actions">

              <a href="/like?post=${p.id}">
                <button class="like">
                  ${
                    p.liked
                      ? "💔 برداشتن لایک"
                      : "❤️ لایک"
                  }
                </button>
              </a>

              <a href="/bookmark?post=${p.id}">
                <button>
                  ${
                    p.bookmarked
                      ? "🔖 ذخیره‌شده"
                      : "🔖 ذخیره"
                  }
                </button>
              </a>

              <a href="/share?post=${p.id}">
                <button>
                  🔗 اشتراک
                </button>
              </a>

              <a href="/report?post=${p.id}">
                <button class="danger">
                  🚩 گزارش
                </button>
              </a>

            </div>

          </article>

          <div class="card">

            <h3>
              💬 نظرها
            </h3>

            <form
              method="POST"
              action="/comment"
            >

              <input
                type="hidden"
                name="post_id"
                value="${p.id}"
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

        if(!comments.rows.length) {

          html += `
            <div class="card empty">
              هنوز نظری ثبت نشده است.
            </div>
          `;

        } else {

          for(const c of comments.rows) {

            html += `
              <div class="comment">

                <div class="comment-name">
                  ${escapeHtml(c.name)}
                </div>

                <div class="comment-text">
                  ${escapeHtml(c.comment)}
                </div>

              </div>
            `;
          }
        }

        sendHtml(
          res,
          200,
          "پست",
          html,
          user
        );

        return;
      }

      if(
        req.method==="GET" &&
        path==="/like"
      ) {

        const postId =
          Number(url.searchParams.get("post"));

        if(
          !Number.isInteger(postId) ||
          postId <= 0
        ) {
          redirect(res,"/");
          return;
        }

        const exists =
          await pool.query(
            `
            SELECT 1
            FROM likes
            WHERE post_id=$1
            AND user_id=$2
            `,
            [postId,user.id]
          );

        if(exists.rows.length) {

          await pool.query(
            `
            DELETE FROM likes
            WHERE post_id=$1
            AND user_id=$2
            `,
            [postId,user.id]
          );

        } else {

          await pool.query(
            `
            INSERT INTO likes
              (post_id,user_id)
            VALUES
              ($1,$2)
            ON CONFLICT DO NOTHING
            `,
            [postId,user.id]
          );

          const owner =
            await pool.query(
              `
              SELECT user_id
              FROM posts
              WHERE id=$1
              `,
              [postId]
            );

          if(owner.rows.length) {

            await notify(
              owner.rows[0].user_id,
              user.id,
              "like",
              postId,
              `${user.name} پست شما را پسندید.`
            );
          }
        }

        redirect(
          res,
          `/post?id=${postId}`
        );

        return;
      }

      if(
        req.method==="GET" &&
        path==="/bookmark"
      ) {

        const postId =
          Number(url.searchParams.get("post"));

        if(
          !Number.isInteger(postId) ||
          postId <= 0
        ) {
          redirect(res,"/");
          return;
        }

        const exists =
          await pool.query(
            `
            SELECT 1
            FROM bookmarks
            WHERE post_id=$1
            AND user_id=$2
            `,
            [postId,user.id]
          );

        if(exists.rows.length) {

          await pool.query(
            `
            DELETE FROM bookmarks
            WHERE post_id=$1
            AND user_id=$2
            `,
            [postId,user.id]
          );

        } else {

          await pool.query(
            `
            INSERT INTO bookmarks
              (post_id,user_id)
            VALUES
              ($1,$2)
            ON CONFLICT DO NOTHING
            `,
            [postId,user.id]
          );
        }

        redirect(
          res,
          `/post?id=${postId}`
        );

        return;
      }

      if(
        req.method==="POST" &&
        path==="/comment"
      ) {

        const d = await readBody(req);

        const postId =
          Number(d.get("post_id"));

        const comment =
          (d.get("comment") || "").trim();

        if(
          !Number.isInteger(postId) ||
          postId <= 0 ||
          !comment
        ) {

          sendHtml(
            res,
            400,
            "خطا",
            `<p class="error">اطلاعات نظر نامعتبر است.</p>`,
            user
          );

          return;
        }

        const post =
          await pool.query(
            `
            SELECT user_id
            FROM posts
            WHERE id=$1
            `,
            [postId]
          );

        if(!post.rows.length) {

          sendHtml(
            res,
            404,
            "خطا",
            `<p class="error">پست پیدا نشد.</p>`,
            user
          );

          return;
        }

        await pool.query(
          `
          INSERT INTO comments
            (post_id,user_id,comment)
          VALUES
            ($1,$2,$3)
          `,
          [
            postId,
            user.id,
            comment
          ]
        );

        await notify(
          post.rows[0].user_id,
          user.id,
          "comment",
          postId,
          `${user.name} روی پست شما نظر گذاشت.`
        );

        redirect(
          res,
          `/post?id=${postId}`
        );

        return;
      }

      if(
        req.method==="GET" &&
        path==="/share"
      ) {

        const postId =
          Number(url.searchParams.get("post"));

        if(
          !Number.isInteger(postId) ||
          postId <= 0
        ) {
          redirect(res,"/");
          return;
        }

        const post =
          await pool.query(
            `
            SELECT id,user_id
            FROM posts
            WHERE id=$1
            `,
            [postId]
          );

        if(!post.rows.length) {

          sendHtml(
            res,
            404,
            "خطا",
            `<p class="error">پست پیدا نشد.</p>`,
            user
          );

          return;
        }

        await pool.query(
          `
          INSERT INTO shares
            (user_id,post_id)
          VALUES
            ($1,$2)
          `,
          [user.id,postId]
        );

        await notify(
          post.rows[0].user_id,
          user.id,
          "share",
          postId,
          `${user.name} پست شما را به اشتراک گذاشت.`
        );

        sendHtml(
          res,
          200,
          "اشتراک‌گذاری",
          `
          <div class="card">

            <h2>
              🔗 اشتراک‌گذاری ثبت شد
            </h2>

            <p>
              این اشتراک‌گذاری در حساب شما ثبت شد.
            </p>

            <a href="/post?id=${postId}">
              <button class="full">
                بازگشت به پست
              </button>
            </a>

          </div>
          `,
          user
        );

        return;
      }

      if(
        req.method==="GET" &&
        path==="/search"
      ) {

        const q =
          (url.searchParams.get("q") || "")
            .trim()
            .slice(0,100);

        let html = `
          <div class="card">

            <form method="GET" action="/search">

              <input
                name="q"
                value="${escapeHtml(q)}"
                placeholder="جستجوی کاربر یا هشتگ..."
              >

              <button class="full">
                🔎 جستجو
              </button>

            </form>

          </div>
        `;

        if(q) {

          const users =
            await pool.query(
              `
              SELECT
                id,
                name,
                email
              FROM users
              WHERE
                name ILIKE $1
                OR email ILIKE $1
              ORDER BY name
              LIMIT 30
              `,
              [`%${q}%`]
            );

          const cleanTag =
            q.startsWith("#")
              ? q.slice(1)
              : q;

          const hashtags =
            await pool.query(
              `
              SELECT
                h.id,
                h.tag,
                COUNT(hp.post_id) AS post_count
              FROM hashtags h
              LEFT JOIN hashtag_posts hp
                ON hp.hashtag_id=h.id
              WHERE h.tag ILIKE $1
              GROUP BY h.id,h.tag
              ORDER BY post_count DESC
              LIMIT 30
              `,
              [`%${cleanTag}%`]
            );

          html += `
            <div class="card">

              <h3>
                👤 کاربران
              </h3>
          `;

          if(!users.rows.length) {

            html += `
              <div class="empty">
                کاربری پیدا نشد.
              </div>
            `;

          } else {

            for(const u of users.rows) {

              html += `
                <div class="comment">

                  <a href="/profile?id=${u.id}">
                    <b>
                      ${escapeHtml(u.name)}
                    </b>
                  </a>

                  <div class="small">
                    ${escapeHtml(u.email)}
                  </div>

                </div>
              `;
            }
          }

          html += `
            </div>

            <div class="card">

              <h3>
                #️⃣ هشتگ‌ها
              </h3>
          `;

          if(!hashtags.rows.length) {

            html += `
              <div class="empty">
                هشتگی پیدا نشد.
              </div>
            `;

          } else {

            for(const h of hashtags.rows) {

              html += `
                <div class="comment">

                  <a href="/hashtag?tag=${encodeURIComponent(h.tag)}">
                    <b>
                      #${escapeHtml(h.tag)}
                    </b>
                  </a>

                  <div class="small">
                    ${h.post_count} پست
                  </div>

                </div>
              `;
            }
          }

          html += `
            </div>
          `;
        }

        sendHtml(
          res,
          200,
          "جستجو",
          html,
          user
        );

        return;
      }

      if(
        req.method==="GET" &&
        path==="/hashtag"
      ) {

        const tag =
          (url.searchParams.get("tag") || "")
            .trim()
            .replace(/^#/,"")
            .toLowerCase()
            .slice(0,100);

        if(!tag) {

          redirect(res,"/search");
          return;
        }

        const posts =
          await pool.query(
            `
            SELECT
              p.id,
              p.content,
              p.image_url,
              p.created_at,
              u.name
            FROM hashtag_posts hp
            JOIN hashtags h
              ON h.id=hp.hashtag_id
            JOIN posts p
              ON p.id=hp.post_id
            JOIN users u
              ON u.id=p.user_id
            WHERE h.tag=$1
            ORDER BY p.created_at DESC
            LIMIT 100
            `,
            [tag]
          );

        let html = `
          <div class="card">

            <h2>
              #${escapeHtml(tag)}
            </h2>

            <div class="small">
              ${posts.rows.length} نتیجه
            </div>

          </div>
        `;

        for(const p of posts.rows) {

          html += `
            <article class="card">

              <div class="username">
                ${escapeHtml(p.name)}
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
                    >
                  `
                  : ""
              }

              <a href="/post?id=${p.id}">
                <button class="full">
                  مشاهده پست
                </button>
              </a>

            </article>
          `;
        }

        sendHtml(
          res,
          200,
          `#${tag}`,
          html,
          user
        );

        return;
      }    if (req.method === "GET" && path === "/stories") {
      await pool.query(`DELETE FROM stories WHERE expires_at < CURRENT_TIMESTAMP`);

      const r = await pool.query(`
        SELECT
          s.*,
          u.name,
          u.email,
          (SELECT COUNT(*) FROM story_views v WHERE v.story_id=s.id)::int AS view_count,
          EXISTS(
            SELECT 1 FROM story_views v2
            WHERE v2.story_id=s.id AND v2.user_id=$1
          ) AS viewed
        FROM stories s
        JOIN users u ON u.id=s.user_id
        WHERE s.expires_at>CURRENT_TIMESTAMP
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$1 AND b.blocked_id=s.user_id)
              OR
              (b.blocker_id=s.user_id AND b.blocked_id=$1)
          )
        ORDER BY s.created_at DESC
        LIMIT 100
      `,[user.id]);

      let html = `
        <div class="card">
          <h2>📖 استوری‌ها</h2>

          <form method="POST" action="/stories">
            <input
              name="media_url"
              maxlength="2000"
              placeholder="لینک عکس یا ویدئو"
            >

            <select name="media_type">
              <option value="image">عکس</option>
              <option value="video">ویدئو</option>
            </select>

            <textarea
              name="text"
              maxlength="1000"
              placeholder="متن استوری"
            ></textarea>

            <button class="full green">
              ➕ انتشار استوری
            </button>
          </form>
        </div>
      `;

      if (!r.rows.length) {
        html += `
          <div class="card empty">
            هنوز استوری فعالی وجود ندارد.
          </div>
        `;
      } else {
        for (const s of r.rows) {
          const media =
            s.media_type === "video"
              ? `
                <video
                  class="post-image"
                  controls
                  src="${escapeHtml(s.media_url || "")}"
                ></video>
              `
              : s.media_url
                ? `
                  <img
                    class="post-image"
                    src="${escapeHtml(s.media_url)}"
                    alt="story"
                  >
                `
                : "";

          html += `
            <article class="card">
              <div class="profile-head">
                <div class="avatar">
                  ${escapeHtml((s.name || "?").charAt(0))}
                </div>

                <div>
                  <div class="username">
                    ${escapeHtml(s.name)}
                  </div>

                  <div class="small">
                    ${s.viewed ? "👁️ دیده شده" : "🟢 جدید"}
                    · 👁️ ${s.view_count}
                  </div>
                </div>
              </div>

              ${media}

              ${
                s.text
                  ? `<div class="post-text">${escapeHtml(s.text)}</div>`
                  : ""
              }

              <div class="actions">
                ${
                  s.viewed
                    ? `<span class="small">این استوری را دیده‌ای</span>`
                    : `<a href="/story-view?id=${s.id}">
                         <button>👁️ مشاهده</button>
                       </a>`
                }

                <a href="/story-react?id=${s.id}&reaction=❤️">
                  <button>❤️</button>
                </a>

                <a href="/story-react?id=${s.id}&reaction=🔥">
                  <button>🔥</button>
                </a>
              </div>
            </article>
          `;
        }
      }

      sendHtml(res,200,"استوری‌ها",html,user);
      return;
    }

    if (req.method === "POST" && path === "/stories") {
      const d = await readBody(req);

      const mediaUrl =
        (d.get("media_url") || "").trim();

      const mediaType =
        (d.get("media_type") || "image").trim();

      const text =
        (d.get("text") || "").trim();

      if (!mediaUrl && !text) {
        sendHtml(
          res,
          400,
          "خطا",
          `<div class="card error">
             استوری باید حداقل یک عکس، ویدئو یا متن داشته باشد.
           </div>`,
          user
        );
        return;
      }

      const allowedTypes = ["image","video"];

      const finalMediaType =
        allowedTypes.includes(mediaType)
          ? mediaType
          : "image";

      await pool.query(`
        INSERT INTO stories(
          user_id,
          media_url,
          media_type,
          text,
          expires_at
        )
        VALUES(
          $1,
          $2,
          $3,
          $4,
          CURRENT_TIMESTAMP + INTERVAL '24 hours'
        )
      `,[
        user.id,
        mediaUrl || null,
        finalMediaType,
        text || null
      ]);

      redirect(res,"/stories");
      return;
    }

    if (req.method === "GET" && path === "/story-view") {
      const storyId =
        Number(url.searchParams.get("id"));

      if (Number.isInteger(storyId)) {
        const r = await pool.query(`
          SELECT id,user_id
          FROM stories
          WHERE id=$1
            AND expires_at>CURRENT_TIMESTAMP
        `,[storyId]);

        if (r.rows.length) {
          await pool.query(`
            INSERT INTO story_views(story_id,user_id)
            VALUES($1,$2)
            ON CONFLICT(story_id,user_id) DO NOTHING
          `,[storyId,user.id]);

          if (r.rows[0].user_id !== user.id) {
            await notify(
              r.rows[0].user_id,
              user.id,
              "story_view",
              null,
              `${user.name} استوری شما را مشاهده کرد.`
            );
          }
        }
      }

      redirect(res,"/stories");
      return;
    }

    if (req.method === "GET" && path === "/story-react") {
      const storyId =
        Number(url.searchParams.get("id"));

      const reaction =
        (url.searchParams.get("reaction") || "❤️").slice(0,20);

      if (Number.isInteger(storyId)) {
        const r = await pool.query(`
          SELECT id,user_id
          FROM stories
          WHERE id=$1
            AND expires_at>CURRENT_TIMESTAMP
        `,[storyId]);

        if (r.rows.length) {
          await pool.query(`
            INSERT INTO story_reactions(
              story_id,
              user_id,
              reaction
            )
            VALUES($1,$2,$3)
            ON CONFLICT(story_id,user_id)
            DO UPDATE SET reaction=EXCLUDED.reaction
          `,[
            storyId,
            user.id,
            reaction
          ]);

          if (r.rows[0].user_id !== user.id) {
            await notify(
              r.rows[0].user_id,
              user.id,
              "story_reaction",
              null,
              `${user.name} به استوری شما ${reaction} واکنش نشان داد.`
            );
          }
        }
      }

      redirect(res,"/stories");
      return;
    }

    if (req.method === "GET" && path === "/highlights") {
      const r = await pool.query(`
        SELECT
          h.id,
          h.title,
          h.cover_url,
          h.created_at,
          COUNT(hi.story_id)::int AS item_count
        FROM highlights h
        LEFT JOIN highlight_items hi
          ON hi.highlight_id=h.id
        WHERE h.user_id=$1
        GROUP BY h.id
        ORDER BY h.created_at DESC
      `,[user.id]);

      const html = `
        <div class="card">
          <h2>⭐ هایلایت‌ها</h2>

          <form method="POST" action="/highlights">
            <input
              name="title"
              maxlength="100"
              placeholder="نام هایلایت"
              required
            >

            <input
              name="cover_url"
              maxlength="2000"
              placeholder="لینک تصویر کاور"
            >

            <button class="full">
              ➕ ساخت هایلایت
            </button>
          </form>
        </div>

        ${
          r.rows.map(h => `
            <div class="card">
              <div class="username">
                ⭐ ${escapeHtml(h.title)}
              </div>

              <div class="small">
                ${h.item_count} استوری
              </div>

              ${
                h.cover_url
                  ? `
                    <img
                      class="post-image"
                      src="${escapeHtml(h.cover_url)}"
                    >
                  `
                  : ""
              }

              <div class="actions">
                <a href="/highlight?id=${h.id}">
                  <button>مشاهده</button>
                </a>

                <a href="/highlight-delete?id=${h.id}">
                  <button class="danger">حذف</button>
                </a>
              </div>
            </div>
          `).join("")
          ||
          `<div class="card empty">
             هنوز هایلایتی ساخته نشده است.
           </div>`
        }
      `;

      sendHtml(res,200,"هایلایت‌ها",html,user);
      return;
    }

    if (req.method === "POST" && path === "/highlights") {
      const d = await readBody(req);

      const title =
        (d.get("title") || "").trim();

      const coverUrl =
        (d.get("cover_url") || "").trim();

      if (!title) {
        sendHtml(
          res,
          400,
          "خطا",
          `<div class="card error">
             نام هایلایت الزامی است.
           </div>`,
          user
        );
        return;
      }

      await pool.query(`
        INSERT INTO highlights(
          user_id,
          title,
          cover_url
        )
        VALUES($1,$2,$3)
      `,[
        user.id,
        title,
        coverUrl || null
      ]);

      redirect(res,"/highlights");
      return;
    }

    if (req.method === "GET" && path === "/highlight") {
      const highlightId =
        Number(url.searchParams.get("id"));

      if (!Number.isInteger(highlightId)) {
        sendHtml(
          res,
          400,
          "خطا",
          `<div class="card error">
             شناسه هایلایت نامعتبر است.
           </div>`,
          user
        );
        return;
      }

      const r = await pool.query(`
        SELECT
          h.id,
          h.title,
          h.cover_url,
          s.id AS story_id,
          s.media_url,
          s.media_type,
          s.text,
          s.created_at
        FROM highlights h
        LEFT JOIN highlight_items hi
          ON hi.highlight_id=h.id
        LEFT JOIN stories s
          ON s.id=hi.story_id
        WHERE h.id=$1
          AND h.user_id=$2
        ORDER BY s.created_at ASC
      `,[highlightId,user.id]);

      if (!r.rows.length) {
        sendHtml(
          res,
          404,
          "هایلایت",
          `<div class="card empty">
             هایلایت پیدا نشد.
           </div>`,
          user
        );
        return;
      }

      let html = `
        <div class="card">
          <h2>⭐ ${escapeHtml(r.rows[0].title)}</h2>
        </div>
      `;

      for (const s of r.rows) {
        if (!s.story_id) continue;

        const media =
          s.media_type === "video"
            ? `<video class="post-image" controls src="${escapeHtml(s.media_url || "")}"></video>`
            : s.media_url
              ? `<img class="post-image" src="${escapeHtml(s.media_url)}">`
              : "";

        html += `
          <div class="card">
            ${media}
            ${
              s.text
                ? `<div class="post-text">${escapeHtml(s.text)}</div>`
                : ""
            }
          </div>
        `;
      }

      sendHtml(res,200,"هایلایت",html,user);
      return;
    }

    if (req.method === "GET" && path === "/highlight-delete") {
      const highlightId =
        Number(url.searchParams.get("id"));

      if (Number.isInteger(highlightId)) {
        await pool.query(`
          DELETE FROM highlights
          WHERE id=$1 AND user_id=$2
        `,[highlightId,user.id]);
      }

      redirect(res,"/highlights");
      return;
    }

    if (req.method === "GET" && path === "/reels") {
      const r = await pool.query(`
        SELECT
          r.id,
          r.caption,
          r.media_url,
          r.media_type,
          r.created_at,
          u.id AS user_id,
          u.name,
          (SELECT COUNT(*)
             FROM reel_likes rl
            WHERE rl.reel_id=r.id)::int AS like_count,
          (SELECT COUNT(*)
             FROM reel_comments rc
            WHERE rc.reel_id=r.id)::int AS comment_count,
          EXISTS(
            SELECT 1
            FROM reel_likes rl2
            WHERE rl2.reel_id=r.id
              AND rl2.user_id=$1
          ) AS liked
        FROM reels r
        JOIN users u ON u.id=r.user_id
        WHERE NOT EXISTS(
          SELECT 1
          FROM blocked_users b
          WHERE
            (b.blocker_id=$1 AND b.blocked_id=r.user_id)
            OR
            (b.blocker_id=r.user_id AND b.blocked_id=$1)
        )
        ORDER BY r.created_at DESC
        LIMIT 100
      `,[user.id]);

      let html = `
        <div class="card">
          <h2>🎬 Reels</h2>

          <form method="POST" action="/reels">
            <input
              name="media_url"
              maxlength="2000"
              placeholder="لینک ویدئو"
              required
            >

            <input
              name="caption"
              maxlength="3000"
              placeholder="توضیحات Reel"
            >

            <button class="full green">
              ➕ انتشار Reel
            </button>
          </form>
        </div>
      `;

      for (const r of r.rows) {
        const media =
          r.media_type === "video"
            ? `
              <video
                class="post-image"
                controls
                src="${escapeHtml(r.media_url)}"
              ></video>
            `
            : `
              <img
                class="post-image"
                src="${escapeHtml(r.media_url)}"
              >
            `;

        html += `
          <article class="card">
            <div class="profile-head">
              <div class="avatar">
                ${escapeHtml(r.name.charAt(0))}
              </div>

              <div>
                <div class="username">
                  ${escapeHtml(r.name)}
                </div>
              </div>
            </div>

            ${media}

            ${
              r.caption
                ? `<div class="post-text">${escapeHtml(r.caption)}</div>`
                : ""
            }

            <div class="stats">
              ❤️ ${r.like_count}
              · 💬 ${r.comment_count}
            </div>

            <div class="actions">
              <a href="/reel-like?id=${r.id}">
                <button class="like">
                  ${r.liked ? "💔 برداشتن لایک" : "❤️ لایک"}
                </button>
              </a>

              <a href="/reel?id=${r.id}">
                <button>💬 نظرها</button>
              </a>

              <a href="/reel-share?id=${r.id}">
                <button>🔗 اشتراک</button>
              </a>
            </div>
          </article>
        `;
      }

      if (!r.rows.length) {
        html += `
          <div class="card empty">
            هنوز Reel منتشر نشده است.
          </div>
        `;
      }

      sendHtml(res,200,"Reels",html,user);
      return;
    }

    if (req.method === "POST" && path === "/reels") {
      const d = await readBody(req);

      const mediaUrl =
        (d.get("media_url") || "").trim();

      const caption =
        (d.get("caption") || "").trim();

      if (!mediaUrl) {
        sendHtml(
          res,
          400,
          "خطا",
          `<div class="card error">
             لینک ویدئو الزامی است.
           </div>`,
          user
        );
        return;
      }

      await pool.query(`
        INSERT INTO reels(
          user_id,
          media_url,
          media_type,
          caption
        )
        VALUES($1,$2,'video',$3)
      `,[
        user.id,
        mediaUrl,
        caption || null
      ]);

      redirect(res,"/reels");
      return;
    }

    if (req.method === "GET" && path === "/reel") {
      const reelId =
        Number(url.searchParams.get("id"));

      const r = await pool.query(`
        SELECT
          r.*,
          u.name,
          u.email
        FROM reels r
        JOIN users u ON u.id=r.user_id
        WHERE r.id=$1
      `,[reelId]);

      if (!r.rows.length) {
        sendHtml(
          res,
          404,
          "Reel",
          `<div class="card empty">
             Reel پیدا نشد.
           </div>`,
          user
        );
        return;
      }

      const reel = r.rows[0];

      await pool.query(`
        INSERT INTO reel_views(reel_id,user_id)
        SELECT $1,$2
        WHERE NOT EXISTS(
          SELECT 1
          FROM reel_views
          WHERE reel_id=$1
            AND user_id=$2
        )
      `,[reelId,user.id]);

      const comments = await pool.query(`
        SELECT
          c.comment,
          c.created_at,
          u.name
        FROM reel_comments c
        JOIN users u ON u.id=c.user_id
        WHERE c.reel_id=$1
        ORDER BY c.created_at ASC
      `,[reelId]);

      const media =
        reel.media_type === "video"
          ? `
            <video
              class="post-image"
              controls
              src="${escapeHtml(reel.media_url)}"
            ></video>
          `
          : `
            <img
              class="post-image"
              src="${escapeHtml(reel.media_url)}"
            >
          `;

      const commentsHtml =
        comments.rows.map(c => `
          <div class="comment">
            <div class="comment-name">
              ${escapeHtml(c.name)}
            </div>
            <div class="comment-text">
              ${escapeHtml(c.comment)}
            </div>
          </div>
        `).join("")
        ||
        `<div class="empty">
           هنوز نظری ثبت نشده است.
         </div>`;

      sendHtml(
        res,
        200,
        "Reel",
        `
          <article class="card">
            <div class="profile-head">
              <div class="avatar">
                ${escapeHtml(reel.name.charAt(0))}
              </div>

              <div>
                <div class="username">
                  ${escapeHtml(reel.name)}
                </div>

                <div class="small">
                  ${escapeHtml(reel.email)}
                </div>
              </div>
            </div>

            ${media}

            ${
              reel.caption
                ? `<div class="post-text">${escapeHtml(reel.caption)}</div>`
                : ""
            }

            <div class="actions">
              <a href="/reel-like?id=${reel.id}">
                <button>❤️ لایک</button>
              </a>

              <a href="/reel-share?id=${reel.id}">
                <button>🔗 اشتراک</button>
              </a>
            </div>
          </article>

          <div class="card">
            <h3>💬 نظرات</h3>

            ${commentsHtml}

            <div class="divider"></div>

            <form method="POST" action="/reel-comment">
              <input
                type="hidden"
                name="reel_id"
                value="${reel.id}"
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
        `,
        user
      );

      return;
    }

    if (req.method === "GET" && path === "/reel-like") {
      const reelId =
        Number(url.searchParams.get("id"));

      if (Number.isInteger(reelId)) {
        const r = await pool.query(`
          SELECT
        if (req.method === "GET" && path === "/profile") {
      const profileId = Number(
        url.searchParams.get("id") || user.id
      );

      if (!Number.isInteger(profileId)) {
        sendHtml(
          res,
          400,
          "خطا",
          `<div class="card error">شناسه کاربر نامعتبر است.</div>`,
          user
        );
        return;
      }

      const r = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.created_at,
          COALESCE(s.is_private,FALSE) AS is_private,

          (SELECT COUNT(*)
             FROM posts p
            WHERE p.user_id=u.id
              AND COALESCE(p.archived,FALSE)=FALSE)::int AS post_count,

          (SELECT COUNT(*)
             FROM follows f
            WHERE f.following_id=u.id)::int AS follower_count,

          (SELECT COUNT(*)
             FROM follows f
            WHERE f.follower_id=u.id)::int AS following_count,

          EXISTS(
            SELECT 1
            FROM follows f
            WHERE f.follower_id=$2
              AND f.following_id=u.id
          ) AS following,

          EXISTS(
            SELECT 1
            FROM follow_requests fr
            WHERE fr.sender_id=$2
              AND fr.receiver_id=u.id
              AND fr.status='pending'
          ) AS request_pending,

          EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$2 AND b.blocked_id=u.id)
              OR
              (b.blocker_id=u.id AND b.blocked_id=$2)
          ) AS blocked

        FROM users u
        LEFT JOIN user_settings s
          ON s.user_id=u.id
        WHERE u.id=$1
      `,[profileId,user.id]);

      if (!r.rows.length) {
        sendHtml(
          res,
          404,
          "پروفایل",
          `<div class="card empty">کاربر پیدا نشد.</div>`,
          user
        );
        return;
      }

      const p = r.rows[0];

      if (
        profileId !== user.id &&
        !p.blocked
      ) {
        await pool.query(`
          INSERT INTO profile_visits(
            visitor_id,
            profile_id
          )
          VALUES($1,$2)
        `,[user.id,profileId]);
      }

      const canSeePosts =
        profileId === user.id ||
        !p.is_private ||
        p.following;

      let postsHtml = "";

      if (canSeePosts && !p.blocked) {
        const posts = await pool.query(`
          SELECT
            p.*,
            (SELECT COUNT(*)
               FROM likes l
              WHERE l.post_id=p.id)::int AS like_count,

            (SELECT COUNT(*)
               FROM comments c
              WHERE c.post_id=p.id)::int AS comment_count,

            EXISTS(
              SELECT 1
              FROM likes l2
              WHERE l2.post_id=p.id
                AND l2.user_id=$2
            ) AS liked,

            EXISTS(
              SELECT 1
              FROM bookmarks b2
              WHERE b2.post_id=p.id
                AND b2.user_id=$2
            ) AS bookmarked

          FROM posts p
          WHERE p.user_id=$1
            AND COALESCE(p.archived,FALSE)=FALSE
          ORDER BY p.created_at DESC
          LIMIT 100
        `,[profileId,user.id]);

        postsHtml =
          posts.rows.map(renderPost).join("")
          ||
          `<div class="card empty">
             هنوز پستی منتشر نشده است.
           </div>`;
      } else if (p.blocked) {
        postsHtml = `
          <div class="card empty">
            این پروفایل در دسترس نیست.
          </div>
        `;
      } else {
        postsHtml = `
          <div class="card empty">
            🔒 این حساب خصوصی است.
            برای دیدن پست‌ها ابتدا باید او را دنبال کنید.
          </div>
        `;
      }

      let action = "";

      if (profileId === user.id) {
        action = `
          <a href="/profile-edit">
            <button>✏️ ویرایش پروفایل</button>
          </a>
          <a href="/settings">
            <button>⚙️ تنظیمات</button>
          </a>
        `;
      } else if (p.blocked) {
        action = `
          <a href="/block?id=${p.id}">
            <button>🔓 رفع بلاک</button>
          </a>
        `;
      } else if (p.following) {
        action = `
          <a href="/follow?id=${p.id}">
            <button>❌ لغو دنبال‌کردن</button>
          </a>
        `;
      } else if (p.request_pending) {
        action = `
          <button disabled>
            ⏳ درخواست ارسال شده
          </button>
        `;
      } else {
        action = `
          <a href="/follow?id=${p.id}">
            <button class="green">
              ${
                p.is_private
                  ? "🔒 درخواست دنبال‌کردن"
                  : "➕ دنبال‌کردن"
              }
            </button>
          </a>
        `;
      }

      const profileHtml = `
        <div class="card">
          <div class="profile-head">
            <div class="avatar big">
              ${escapeHtml((p.name || "?").charAt(0))}
            </div>

            <div>
              <h2>${escapeHtml(p.name)}</h2>

              <div class="small">
                ${p.is_private ? "🔒 حساب خصوصی" : "🌐 حساب عمومی"}
              </div>
            </div>
          </div>

          <div class="stats-grid">
            <div>
              <strong>${p.post_count}</strong>
              <span>پست</span>
            </div>

            <div>
              <strong>${p.follower_count}</strong>
              <span>دنبال‌کننده</span>
            </div>

            <div>
              <strong>${p.following_count}</strong>
              <span>دنبال‌شونده</span>
            </div>
          </div>

          <div class="actions">
            ${action}

            ${
              profileId !== user.id && !p.blocked
                ? `
                  <a href="/messages?user=${p.id}">
                    <button>💬 پیام</button>
                  </a>

                  <a href="/block?id=${p.id}">
                    <button class="danger">🚫 بلاک</button>
                  </a>
                `
                : ""
            }
          </div>
        </div>

        <h3 class="section-title">📸 پست‌ها</h3>

        ${postsHtml}
      `;

      sendHtml(
        res,
        200,
        `پروفایل ${p.name}`,
        profileHtml,
        user
      );

      return;
    }

    if (req.method === "GET" && path === "/profile-edit") {
      const r = await pool.query(`
        SELECT
          u.name,
          u.email
        FROM users u
        WHERE u.id=$1
      `,[user.id]);

      const current = r.rows[0] || user;

      sendHtml(
        res,
        200,
        "ویرایش پروفایل",
        `
          <div class="card">
            <h2>✏️ ویرایش پروفایل</h2>

            <form method="POST" action="/profile-edit">
              <label>نام</label>

              <input
                name="name"
                value="${escapeHtml(current.name || "")}"
                maxlength="100"
                required
              >

              <label>ایمیل</label>

              <input
                type="email"
                name="email"
                value="${escapeHtml(current.email || "")}"
                maxlength="200"
              >

              <button class="full green">
                💾 ذخیره تغییرات
              </button>
            </form>

            <div class="divider"></div>

            <a href="/password">
              <button class="full">
                🔐 تغییر رمز عبور
              </button>
            </a>
          </div>
        `,
        user
      );

      return;
    }

    if (req.method === "POST" && path === "/profile-edit") {
      const d = await readBody(req);

      const name =
        (d.get("name") || "").trim();

      const email =
        (d.get("email") || "").trim();

      if (!name) {
        sendHtml(
          res,
          400,
          "خطا",
          `<div class="card error">
             نام نمی‌تواند خالی باشد.
           </div>`,
          user
        );
        return;
      }

      const emailOwner = await pool.query(`
        SELECT id
        FROM users
        WHERE LOWER(email)=LOWER($1)
          AND id<>$2
        LIMIT 1
      `,[email,user.id]);

      if (email && emailOwner.rows.length) {
        sendHtml(
          res,
          400,
          "خطا",
          `<div class="card error">
             این ایمیل قبلاً استفاده شده است.
           </div>`,
          user
        );
        return;
      }

      await pool.query(`
        UPDATE users
        SET
          name=$1,
          email=$2
        WHERE id=$3
      `,[
        name,
        email || null,
        user.id
      ]);

      redirect(res,`/profile?id=${user.id}`);
      return;
    }

    if (req.method === "GET" && path === "/follow") {
      const targetId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(targetId) ||
        targetId === user.id
      ) {
        redirect(res,"/");
        return;
      }

      const target = await pool.query(`
        SELECT
          u.id,
          u.name,
          COALESCE(s.is_private,FALSE) AS is_private
        FROM users u
        LEFT JOIN user_settings s
          ON s.user_id=u.id
        WHERE u.id=$1
      `,[targetId]);

      if (!target.rows.length) {
        redirect(res,"/");
        return;
      }

      const blocked = await pool.query(`
        SELECT 1
        FROM blocked_users
        WHERE
          (blocker_id=$1 AND blocked_id=$2)
          OR
          (blocker_id=$2 AND blocked_id=$1)
        LIMIT 1
      `,[user.id,targetId]);

      if (blocked.rows.length) {
        redirect(res,`/profile?id=${targetId}`);
        return;
      }

      const existing = await pool.query(`
        SELECT 1
        FROM follows
        WHERE follower_id=$1
          AND following_id=$2
        LIMIT 1
      `,[user.id,targetId]);

      if (existing.rows.length) {
        await pool.query(`
          DELETE FROM follows
          WHERE follower_id=$1
            AND following_id=$2
        `,[user.id,targetId]);

        await pool.query(`
          DELETE FROM follow_requests
          WHERE sender_id=$1
            AND receiver_id=$2
        `,[user.id,targetId]);

        redirect(res,`/profile?id=${targetId}`);
        return;
      }

      if (target.rows[0].is_private) {
        await pool.query(`
          INSERT INTO follow_requests(
            sender_id,
            receiver_id,
            status
          )
          VALUES($1,$2,'pending')
          ON CONFLICT(sender_id,receiver_id)
          DO UPDATE SET status='pending'
        `,[user.id,targetId]);

        await notify(
          targetId,
          user.id,
          "follow_request",
          null,
          `${user.name} درخواست دنبال‌کردن شما را ارسال کرد.`
        );
      } else {
        await pool.query(`
          INSERT INTO follows(
            follower_id,
            following_id
          )
          VALUES($1,$2)
          ON CONFLICT DO NOTHING
        `,[user.id,targetId]);

        await notify(
          targetId,
          user.id,
          "follow",
          null,
          `${user.name} شما را دنبال کرد.`
        );
      }

      redirect(res,`/profile?id=${targetId}`);
      return;
    }

    if (req.method === "GET" && path === "/follow-requests") {
      const r = await pool.query(`
        SELECT
          fr.id,
          fr.sender_id,
          fr.created_at,
          u.name
        FROM follow_requests fr
        JOIN users u
          ON u.id=fr.sender_id
        WHERE fr.receiver_id=$1
          AND fr.status='pending'
        ORDER BY fr.created_at DESC
      `,[user.id]);

      const html = `
        <div class="card">
          <h2>👥 درخواست‌های دنبال‌کردن</h2>
        </div>

        ${
          r.rows.map(x => `
            <div class="card">
              <div class="profile-head">
                <div class="avatar">
                  ${escapeHtml((x.name || "?").charAt(0))}
                </div>

                <div>
                  <div class="username">
                    ${escapeHtml(x.name)}
                  </div>

                  <div class="small">
                    درخواست دنبال‌کردن
                  </div>
                </div>
              </div>

              <div class="actions">
                <a href="/follow-accept?id=${x.id}">
                  <button class="green">
                    ✅ قبول
                  </button>
                </a>

                <a href="/follow-reject?id=${x.id}">
                  <button class="danger">
                    ❌ رد
                  </button>
                </a>

                <a href="/profile?id=${x.sender_id}">
                  <button>
                    👤 پروفایل
                  </button>
                </a>
              </div>
            </div>
          `).join("")
          ||
          `<div class="card empty">
             درخواست جدیدی وجود ندارد.
           </div>`
        }
      `;

      sendHtml(
        res,
        200,
        "درخواست‌ها",
        html,
        user
      );

      return;
    }

    if (req.method === "GET" && path === "/follow-accept") {
      const requestId =
        Number(url.searchParams.get("id"));

      if (Number.isInteger(requestId)) {
        const r = await pool.query(`
          SELECT sender_id
          FROM follow_requests
          WHERE id=$1
            AND receiver_id=$2
            AND status='pending'
        `,[requestId,user.id]);

        if (r.rows.length) {
          const senderId = r.rows[0].sender_id;

          await pool.query(`
            UPDATE follow_requests
            SET
              status='accepted',
              responded_at=CURRENT_TIMESTAMP
            WHERE id=$1
          `,[requestId]);

          await pool.query(`
            INSERT INTO follows(
              follower_id,
              following_id
            )
            VALUES($1,$2)
            ON CONFLICT DO NOTHING
          `,[senderId,user.id]);

          await notify(
            senderId,
            user.id,
            "follow_accept",
            null,
            `${user.name} درخواست دنبال‌کردن شما را پذیرفت.`
          );
        }
      }

      redirect(res,"/follow-requests");
      return;
    }

    if (req.method === "GET" && path === "/follow-reject") {
      const requestId =
        Number(url.searchParams.get("id"));

      if (Number.isInteger(requestId)) {
        const r = await pool.query(`
          SELECT sender_id
          FROM follow_requests
          WHERE id=$1
            AND receiver_id=$2
            AND status='pending'
        `,[requestId,user.id]);

        if (r.rows.length) {
          await pool.query(`
            UPDATE follow_requests
            SET
              status='rejected',
              responded_at=CURRENT_TIMESTAMP
            WHERE id=$1
          `,[requestId]);

          await notify(
            r.rows[0].sender_id,
            user.id,
            "follow_reject",
            null,
            `${user.name} درخواست دنبال‌کردن شما را رد کرد.`
          );
        }
      }

      redirect(res,"/follow-requests");
      return;
    }

    if (req.method === "GET" && path === "/messages") {
      const otherId =
        Number(url.searchParams.get("user") || 0);

      let people = [];

      if (Number.isInteger(otherId) && otherId > 0) {
        const exists = await pool.query(`
          SELECT id,name
          FROM users
          WHERE id=$1
        `,[otherId]);

        if (exists.rows.length) {
          people = exists.rows;
        }
      }

      const conversations = await pool.query(`
        SELECT DISTINCT
          u.id,
          u.name
        FROM users u
        JOIN messages m
          ON (
            (m.sender_id=$1 AND m.receiver_id=u.id)
            OR
            (m.receiver_id=$1 AND m.sender_id=u.id)
          )
        WHERE u.id<>$1
        ORDER BY u.name
      `,[user.id]);

      for (const p of conversations.rows) {
        if (!people.some(x => x.id === p.id)) {
          people.push(p);
        }
      }

      let messagesHtml = "";

      if (Number.isInteger(otherId) && otherId > 0) {
        const selected = await pool.query(`
          SELECT
            m.id,
            m.sender_id,
            m.receiver_id,
            m.content,
            m.created_at,
            u.name AS sender_name
          FROM messages m
          JOIN users u
            ON u.id=m.sender_id
          WHERE
            (m.sender_id=$1 AND m.receiver_id=$2)
            OR
            (m.sender_id=$2 AND m.receiver_id=$1)
          ORDER BY m.created_at ASC
          LIMIT 500
        `,[user.id,otherId]);

        messagesHtml =
          selected.rows.map(m => `
            <div class="message ${
              m.sender_id === user.id
                ? "mine"
                : "theirs"
            }">
              <div class="small">
                ${escapeHtml(m.sender_name)}
              </div>

              <div>
                ${escapeHtml(m.content)}
              </div>

              <div class="small">
                ${new Date(m.created_at).toLocaleString("fa-IR")}
              </div>
            </div>
          `).join("")
          ||
          `<div class="empty">
             هنوز پیامی وجود ندارد.
           </div>`;
      }

      sendHtml(
        res,
        200,
        "پیام‌ها",
        `
          <div class="card">
            <h2>💬 پیام‌ها</h2>

            <div class="conversation-list">
              ${
                people.map(p => `
                  <a
                    class="conversation"
                    href="/messages?user=${p.id}"
                  >
                    👤 ${escapeHtml(p.name)}
                  </a>
                `).join("")
                ||
                `<div class="small">
                   هنوز گفت‌وگویی ندارید.
                 </div>`
              }
            </div>
          </div>

          ${
            Number.isInteger(otherId) && otherId > 0
              ? `
                <div class="card">
                  <div class="messages">
                    ${messagesHtml}
                  </div>

                  <form method="POST" action="/send-message">
                    <input
                      type="hidden"
                      name="receiver_id"
                      value="${otherId}"
                    >

                    <textarea
                      name="content"
                      maxlength="5000"
                      placeholder="پیام خود را بنویس..."
                      required
                    ></textarea>

                    <button class="full green">
                      📤 ارسال پیام
                    </button>
                  </form>
                </div>
              `
              : `
                <div class="card empty">
                  یک گفت‌وگو را انتخاب کنید.
                </div>
              `
          }
        `,
        user
      );

      return;
    }

    if (req.method === "POST" && path === "/send-message") {
      const d = await readBody(req);

      const receiverId =
        Number(d.get("receiver_id"));

      const content =
        (d.get("content") || "").trim();

      if (
        !Number.isInteger(receiverId) ||
        receiverId <= 0 ||
        !content
      ) {
        redirect(res,"/messages");
        return;
      }

      if (receiverId === user.id) {
        redirect(res,"/messages");
        return;
      }

      const blocked = await pool.query(`
        SELECT 1
        FROM blocked_users
        WHERE
          (blocker_id=$1 AND blocked_id=$2)
          OR
          (blocker_id=$2 AND blocked_id=$1)
        LIMIT 1
      `,[user.id,receiverId]);

      if (!blocked.rows.length) {
        const receiver = await pool.query(`
          SELECT id
          FROM users
          WHERE id=$1
        `,[re     // ============================================================
    // SECTION 5
    // PRIVACY / MODERATION / CLOSE FRIENDS / COLLECTIONS
    // ARCHIVE / PIN
    // ============================================================

    if (req.method === "GET" && path === "/privacy") {
      const r = await pool.query(`
        SELECT
          COALESCE(is_private,FALSE) AS is_private,
          COALESCE(message_policy,'everyone') AS message_policy,
          COALESCE(mention_policy,'everyone') AS mention_policy,
          COALESCE(tag_policy,'everyone') AS tag_policy,
          COALESCE(show_activity,TRUE) AS show_activity,
          COALESCE(allow_story_replies,TRUE) AS allow_story_replies,
          COALESCE(notifications_enabled,TRUE) AS notifications_enabled
        FROM user_settings
        WHERE user_id=$1
      `,[user.id]);

      const s = r.rows[0] || {
        is_private:false,
        message_policy:"everyone",
        mention_policy:"everyone",
        tag_policy:"everyone",
        show_activity:true,
        allow_story_replies:true,
        notifications_enabled:true
      };

      sendPage(
        res,
        "حریم خصوصی",
        `
        <div class="card">
          <h2>🔐 حریم خصوصی و امنیت</h2>

          <form method="POST" action="/privacy">

            <label>
              <input
                type="checkbox"
                name="is_private"
                ${s.is_private ? "checked" : ""}
              >
              حساب خصوصی
            </label>

            <label>پیام‌ها</label>
            <select name="message_policy">
              <option value="everyone"
                ${s.message_policy==="everyone"?"selected":""}>
                همه
              </option>
              <option value="followers"
                ${s.message_policy==="followers"?"selected":""}>
                دنبال‌کنندگان
              </option>
              <option value="nobody"
                ${s.message_policy==="nobody"?"selected":""}>
                هیچ‌کس
              </option>
            </select>

            <label>منشن کردن</label>
            <select name="mention_policy">
              <option value="everyone"
                ${s.mention_policy==="everyone"?"selected":""}>
                همه
              </option>
              <option value="followers"
                ${s.mention_policy==="followers"?"selected":""}>
                دنبال‌کنندگان
              </option>
              <option value="nobody"
                ${s.mention_policy==="nobody"?"selected":""}>
                هیچ‌کس
              </option>
            </select>

            <label>تگ کردن</label>
            <select name="tag_policy">
              <option value="everyone"
                ${s.tag_policy==="everyone"?"selected":""}>
                همه
              </option>
              <option value="followers"
                ${s.tag_policy==="followers"?"selected":""}>
                دنبال‌کنندگان
              </option>
              <option value="nobody"
                ${s.tag_policy==="nobody"?"selected":""}>
                هیچ‌کس
              </option>
            </select>

            <label>
              <input
                type="checkbox"
                name="show_activity"
                ${s.show_activity ? "checked" : ""}
              >
              نمایش وضعیت فعالیت
            </label>

            <label>
              <input
                type="checkbox"
                name="allow_story_replies"
                ${s.allow_story_replies ? "checked" : ""}
              >
              اجازه پاسخ به استوری
            </label>

            <label>
              <input
                type="checkbox"
                name="notifications_enabled"
                ${s.notifications_enabled ? "checked" : ""}
              >
              فعال بودن اعلان‌ها
            </label>

            <button type="submit">ذخیره تنظیمات</button>
          </form>
        </div>
        `
      );
      return;
    }

    if (req.method === "POST" && path === "/privacy") {
      const d = await readBody(req);

      const isPrivate =
        d.get("is_private") === "on";

      const showActivity =
        d.get("show_activity") === "on";

      const allowStoryReplies =
        d.get("allow_story_replies") === "on";

      const notificationsEnabled =
        d.get("notifications_enabled") === "on";

      const validPolicies = [
        "everyone",
        "followers",
        "nobody"
      ];

      let messagePolicy =
        d.get("message_policy") || "everyone";

      let mentionPolicy =
        d.get("mention_policy") || "everyone";

      let tagPolicy =
        d.get("tag_policy") || "everyone";

      if (!validPolicies.includes(messagePolicy)) {
        messagePolicy = "everyone";
      }

      if (!validPolicies.includes(mentionPolicy)) {
        mentionPolicy = "everyone";
      }

      if (!validPolicies.includes(tagPolicy)) {
        tagPolicy = "everyone";
      }

      await pool.query(`
        INSERT INTO user_settings(
          user_id,
          is_private,
          message_policy,
          mention_policy,
          tag_policy,
          show_activity,
          allow_story_replies,
          notifications_enabled
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(user_id)
        DO UPDATE SET
          is_private=EXCLUDED.is_private,
          message_policy=EXCLUDED.message_policy,
          mention_policy=EXCLUDED.mention_policy,
          tag_policy=EXCLUDED.tag_policy,
          show_activity=EXCLUDED.show_activity,
          allow_story_replies=EXCLUDED.allow_story_replies,
          notifications_enabled=EXCLUDED.notifications_enabled
      `,[
        user.id,
        isPrivate,
        messagePolicy,
        mentionPolicy,
        tagPolicy,
        showActivity,
        allowStoryReplies,
        notificationsEnabled
      ]);

      redirect(res,"/privacy");
      return;
    }

    // ------------------------------------------------------------
    // RESTRICT
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/restrict") {
      const targetId =
        Number(url.searchParams.get("user"));

      if (
        !Number.isInteger(targetId) ||
        targetId <= 0 ||
        targetId === user.id
      ) {
        redirect(res,"/profile");
        return;
      }

      const existing = await pool.query(`
        SELECT 1
        FROM restrictions
        WHERE
          user_id=$1
          AND restricted_user_id=$2
      `,[user.id,targetId]);

      if (existing.rows.length) {
        await pool.query(`
          DELETE FROM restrictions
          WHERE user_id=$1
          AND restricted_user_id=$2
        `,[user.id,targetId]);
      } else {
        await pool.query(`
          INSERT INTO restrictions(
            user_id,
            restricted_user_id
          )
          VALUES($1,$2)
          ON CONFLICT DO NOTHING
        `,[user.id,targetId]);
      }

      redirect(res,`/profile?id=${targetId}`);
      return;
    }

    // ------------------------------------------------------------
    // MUTE
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/mute") {
      const targetId =
        Number(url.searchParams.get("user"));

      if (
        !Number.isInteger(targetId) ||
        targetId <= 0 ||
        targetId === user.id
      ) {
        redirect(res,"/profile");
        return;
      }

      const existing = await pool.query(`
        SELECT 1
        FROM mutes
        WHERE
          user_id=$1
          AND muted_user_id=$2
      `,[user.id,targetId]);

      if (existing.rows.length) {
        await pool.query(`
          DELETE FROM mutes
          WHERE user_id=$1
          AND muted_user_id=$2
        `,[user.id,targetId]);
      } else {
        await pool.query(`
          INSERT INTO mutes(
            user_id,
            muted_user_id
          )
          VALUES($1,$2)
          ON CONFLICT DO NOTHING
        `,[user.id,targetId]);
      }

      redirect(res,`/profile?id=${targetId}`);
      return;
    }

    // ------------------------------------------------------------
    // CLOSE FRIENDS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/close-friends") {
      const friends = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.username,
          CASE
            WHEN cf.friend_id IS NULL THEN FALSE
            ELSE TRUE
          END AS is_close
        FROM users u
        JOIN follows f
          ON f.following_id=u.id
         AND f.follower_id=$1
        LEFT JOIN close_friends cf
          ON cf.user_id=$1
         AND cf.friend_id=u.id
        WHERE u.id<>$1
        ORDER BY u.name ASC
      `,[user.id]);

      const list =
        friends.rows.map(f => `
          <div class="card">
            <strong>${escapeHtml(
              f.name || f.username || "کاربر"
            )}</strong>

            <span>
              ${f.is_close ? "⭐ دوست نزدیک" : "دنبال‌کننده"}
            </span>

            <a class="btn"
              href="/close-friend?user=${f.id}">
              ${f.is_close ? "حذف" : "افزودن"}
            </a>
          </div>
        `).join("");

      sendPage(
        res,
        "دوستان نزدیک",
        `
        <div class="card">
          <h2>⭐ دوستان نزدیک</h2>
          <p>
            فهرست افرادی که برای محتوای مخصوص دوستان نزدیک انتخاب کرده‌ای.
          </p>
        </div>

        ${list || `
          <div class="card">
            هنوز کسی برای دوستان نزدیک انتخاب نشده است.
          </div>
        `}
        `
      );
      return;
    }

    if (req.method === "GET" && path === "/close-friend") {
      const friendId =
        Number(url.searchParams.get("user"));

      if (
        !Number.isInteger(friendId) ||
        friendId <= 0 ||
        friendId === user.id
      ) {
        redirect(res,"/close-friends");
        return;
      }

      const following = await pool.query(`
        SELECT 1
        FROM follows
        WHERE follower_id=$1
        AND following_id=$2
      `,[user.id,friendId]);

      if (!following.rows.length) {
        redirect(res,"/close-friends");
        return;
      }

      const existing = await pool.query(`
        SELECT 1
        FROM close_friends
        WHERE user_id=$1
        AND friend_id=$2
      `,[user.id,friendId]);

      if (existing.rows.length) {
        await pool.query(`
          DELETE FROM close_friends
          WHERE user_id=$1
          AND friend_id=$2
        `,[user.id,friendId]);
      } else {
        await pool.query(`
          INSERT INTO close_friends(
            user_id,
            friend_id
          )
          VALUES($1,$2)
          ON CONFLICT DO NOTHING
        `,[user.id,friendId]);
      }

      redirect(res,"/close-friends");
      return;
    }

    // ------------------------------------------------------------
    // BLOCKED USERS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/blocked") {
      const blocked = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.username
        FROM blocked_users b
        JOIN users u
          ON u.id=b.blocked_id
        WHERE b.blocker_id=$1
        ORDER BY u.name ASC
      `,[user.id]);

      const list =
        blocked.rows.map(b => `
          <div class="card">
            <strong>${escapeHtml(
              b.name || b.username || "کاربر"
            )}</strong>

            <span>
              @${escapeHtml(b.username || "")}
            </span>

            <a class="btn"
              href="/block?user=${b.id}">
              رفع مسدودی
            </a>
          </div>
        `).join("");

      sendPage(
        res,
        "کاربران مسدودشده",
        `
        <div class="card">
          <h2>🚫 کاربران مسدودشده</h2>
        </div>

        ${list || `
          <div class="card">
            کاربری مسدود نشده است.
          </div>
        `}
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // COLLECTIONS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/collections") {
      const collections = await pool.query(`
        SELECT
          c.id,
          c.name,
          c.created_at,
          COUNT(ci.post_id)::int AS item_count
        FROM collections c
        LEFT JOIN collection_items ci
          ON ci.collection_id=c.id
        WHERE c.user_id=$1
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `,[user.id]);

      const list =
        collections.rows.map(c => `
          <div class="card">
            <h3>📁 ${escapeHtml(c.name)}</h3>

            <p>
              ${c.item_count} پست ذخیره‌شده
            </p>

            <a class="btn"
              href="/collection?id=${c.id}">
              مشاهده
            </a>

            <a class="btn"
              href="/collection-delete?id=${c.id}"
              onclick="return confirm('این مجموعه حذف شود؟')">
              حذف
            </a>
          </div>
        `).join("");

      sendPage(
        res,
        "مجموعه‌ها",
        `
        <div class="card">
          <h2>📚 مجموعه‌های ذخیره‌شده</h2>

          <form method="POST" action="/collection-create">
            <input
              name="name"
              maxlength="100"
              placeholder="نام مجموعه"
              required
            >
            <button type="submit">
              ایجاد مجموعه
            </button>
          </form>
        </div>

        ${list || `
          <div class="card">
            هنوز مجموعه‌ای ساخته نشده است.
          </div>
        `}
        `
      );
      return;
    }

    if (req.method === "POST" && path === "/collection-create") {
      const d = await readBody(req);

      const name =
        (d.get("name") || "").trim();

      if (!name) {
        redirect(res,"/collections");
        return;
      }

      await pool.query(`
        INSERT INTO collections(
          user_id,
          name
        )
        VALUES($1,$2)
      `,[user.id,name.slice(0,100)]);

      redirect(res,"/collections");
      return;
    }

    if (req.method === "GET" && path === "/collection") {
      const collectionId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(collectionId) ||
        collectionId <= 0
      ) {
        redirect(res,"/collections");
        return;
      }

      const collection = await pool.query(`
        SELECT id,name
        FROM collections
        WHERE id=$1
        AND user_id=$2
      `,[collectionId,user.id]);

      if (!collection.rows.length) {
        redirect(res,"/collections");
        return;
      }

      const posts = await pool.query(`
        SELECT
          p.*,
          u.name AS user_name,
          u.username
        FROM collection_items ci
        JOIN posts p
          ON p.id=ci.post_id
        JOIN users u
          ON u.id=p.user_id
        WHERE ci.collection_id=$1
        ORDER BY p.created_at DESC
      `,[collectionId]);

      const body = posts.rows.map(p =>
        renderPost(p,user.id)
      ).join("");

      sendPage(
        res,
        collection.rows[0].name,
        `
        <div class="card">
          <h2>📁 ${escapeHtml(
            collection.rows[0].name
          )}</h2>
        </div>

        ${body || `
          <div class="card">
            این مجموعه خالی است.
          </div>
        `}
        `
      );
      return;
    }

    if (req.method === "GET" && path === "/collection-add") {
      const collectionId =
        Number(url.searchParams.get("collection"));

      const postId =
        Number(url.searchParams.get("post"));

      if (
        !Number.isInteger(collectionId) ||
        !Number.isInteger(postId) ||
        collectionId <= 0 ||
        postId <= 0
      ) {
        redirect(res,"/");
        return;
      }

      const owner = await pool.query(`
        SELECT 1
        FROM collections
        WHERE id=$1
        AND user_id=$2
      `,[collectionId,user.id]);

      if (!owner.rows.length) {
        redirect(res,"/");
        return;
      }

      await pool.query(`
        INSERT INTO collection_items(
          collection_id,
          post_id
        )
        VALUES($1,$2)
        ON CONFLICT DO NOTHING
      `,[collectionId,postId]);

      redirect(res,`/post?id=${postId}`);
      return;
    }

    if (req.method === "GET" && path === "/collection-remove") {
      const collectionId =
        Number(url.searchParams.get("collection"));

      const postId =
        Number(url.searchParams.get("post"));

      if (
        !Number.isInteger(collectionId) ||
        !Number.isInteger(postId)
      ) {
        redirect(res,"/collections");
        return;
      }

      await pool.query(`
        DELETE FROM collection_items
        WHERE collection_id=$1
        AND post_id=$2
        AND collection_id IN(
          SELECT id
          FROM collections
          WHERE user_id=$3
        )
      `,[collectionId,postId,user.id]);

      redirect(res,`/collection?id=${collectionId}`);
      return;
    }

    if (req.method === "GET" && path === "/collection-delete") {
      const collectionId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(collectionId) ||
        collectionId <= 0
      ) {
        redirect(res,"/collections");
        return;
      }

      await pool.query(`
        DELETE FROM collection_items
        WHERE collection_id=$1
        AND collection_id IN(
          SELECT id
          FROM collections
          WHERE user_id=$2
        )
      `,[collectionId,user.id]);

      await pool.query(`
        DELETE FROM collections
        WHERE id=$1
        AND user_id=$2
      `,[collectionId,user.id]);

      redirect(res,"/collections");
      return;
    }

    // ------------------------------------------------------------
    // ARCHIVE POST
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/archive") {
      const postId =
        Number(url.searchParams.get("post"));

      if (
        !Number.isInteger(postId) ||
        postId <= 0
      ) {
        redirect(res,"/");
        return;
      }

      await pool.query(`
        UPDATE posts
        SET archived=NOT COALESCE(archived,FALSE)
        WHERE id=$1
        AND user_id=$2
      `,[postId,user.id]);

      redirect(res,`/post?id=${postId}`);
      return;
    }

    if (req.method === "GET" && path === "/archived") {
      const posts = await pool.query(`
        SELECT
          p.*,
          u.name AS user_name,
          u.username
        FROM posts p
        JOIN users u
          ON u.id=p.user_id
        WHERE p.user_id=$1
        AND COALESCE(p.archived,FALSE)=TRUE
        ORDER BY p.created_at DESC
      `,[user.id]);

      const body =
        posts.rows.map(p =>
          renderPost(p,user.id)
        ).join("");

      sendPage(
        res,
        "آرشیو",
        `
        <div class="card">
          <h2>🗃 پست‌های آرشیوشده</h2>
        </div>

        ${body || `
          <div class="card">
            پست آرشیوشده‌ای وجود ندارد.
          </div>
        `}
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // PIN POST
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/pin") {
      const postId =
        Number(url.searchParams.get("post"));

      if (
        !Number.isInteger(postId) ||
        postId <= 0
      ) {
        redirect(res,"/");
        return;
      }

      await pool.query(`
        UPDATE posts
        SET pinned=NO  // ============================================================
    // SECTION 6
    // EXPLORE / DISCOVER / HASHTAGS / ANALYTICS / ACCOUNT ACTIVITY
    // ============================================================

    // ------------------------------------------------------------
    // EXPLORE
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/explore") {
      const q =
        (url.searchParams.get("q") || "").trim();

      let posts;

      if (q) {
        const search = `%${q}%`;

        posts = await pool.query(`
          SELECT
            p.*,
            u.name AS user_name,
            u.username
          FROM posts p
          JOIN users u
            ON u.id=p.user_id
          WHERE
            COALESCE(p.archived,FALSE)=FALSE
            AND (
              p.content ILIKE $1
              OR u.name ILIKE $1
              OR u.username ILIKE $1
            )
            AND NOT EXISTS (
              SELECT 1
              FROM blocked_users b
              WHERE
                (b.blocker_id=$2 AND b.blocked_id=p.user_id)
                OR
                (b.blocker_id=p.user_id AND b.blocked_id=$2)
            )
          ORDER BY p.created_at DESC
          LIMIT 50
        `,[search,user.id]);
      } else {
        posts = await pool.query(`
          SELECT
            p.*,
            u.name AS user_name,
            u.username
          FROM posts p
          JOIN users u
            ON u.id=p.user_id
          WHERE
            COALESCE(p.archived,FALSE)=FALSE
            AND NOT EXISTS (
              SELECT 1
              FROM blocked_users b
              WHERE
                (b.blocker_id=$1 AND b.blocked_id=p.user_id)
                OR
                (b.blocker_id=p.user_id AND b.blocked_id=$1)
            )
          ORDER BY p.created_at DESC
          LIMIT 50
        `,[user.id]);
      }

      const body =
        posts.rows.map(p =>
          renderPost(p,user.id)
        ).join("");

      sendPage(
        res,
        "اکسپلور",
        `
        <div class="card">
          <h2>🔎 اکسپلور MySocial</h2>

          <form method="GET" action="/explore">
            <input
              name="q"
              value="${escapeHtml(q)}"
              placeholder="جستجوی پست، نام یا نام کاربری..."
              maxlength="100"
            >
            <button type="submit">
              جستجو
            </button>
          </form>
        </div>

        ${body || `
          <div class="card">
            نتیجه‌ای پیدا نشد.
          </div>
        `}
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // HASHTAG DISCOVERY
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/discover-hashtags") {
      const tags = await pool.query(`
        SELECT
          h.id,
          h.tag,
          COUNT(hp.post_id)::int AS post_count
        FROM hashtags h
        LEFT JOIN hashtag_posts hp
          ON hp.hashtag_id=h.id
        GROUP BY h.id
        ORDER BY post_count DESC, h.tag ASC
        LIMIT 50
      `);

      const body =
        tags.rows.map(t => `
          <div class="card">
            <h3>
              #${escapeHtml(t.tag)}
            </h3>

            <p>
              ${t.post_count} پست
            </p>

            <a class="btn"
              href="/hashtag?tag=${encodeURIComponent(t.tag)}">
              مشاهده
            </a>
          </div>
        `).join("");

      sendPage(
        res,
        "هشتگ‌ها",
        `
        <div class="card">
          <h2>🏷 هشتگ‌های محبوب</h2>
        </div>

        ${body || `
          <div class="card">
            هنوز هشتگی ثبت نشده است.
          </div>
        `}
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // REEL ANALYTICS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/reel-analytics") {
      const reels = await pool.query(`
        SELECT
          r.id,
          r.caption,
          r.created_at,
          COUNT(DISTINCT rv.id)::int AS views,
          COUNT(DISTINCT rl.id)::int AS likes,
          COUNT(DISTINCT rc.id)::int AS comments,
          COUNT(DISTINCT sh.id)::int AS shares
        FROM reels r
        LEFT JOIN reel_views rv
          ON rv.reel_id=r.id
        LEFT JOIN reel_likes rl
          ON rl.reel_id=r.id
        LEFT JOIN reel_comments rc
          ON rc.reel_id=r.id
        LEFT JOIN shares sh
          ON sh.reel_id=r.id
        WHERE r.user_id=$1
        GROUP BY r.id
        ORDER BY r.created_at DESC
        LIMIT 100
      `,[user.id]);

      const rows =
        reels.rows.map(r => `
          <tr>
            <td>${r.id}</td>
            <td>${escapeHtml(r.caption || "")}</td>
            <td>${r.views}</td>
            <td>${r.likes}</td>
            <td>${r.comments}</td>
            <td>${r.shares}</td>
          </tr>
        `).join("");

      sendPage(
        res,
        "آمار ریلز",
        `
        <div class="card">
          <h2>📊 آمار ریلزهای من</h2>

          <div style="overflow:auto">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>عنوان</th>
                  <th>بازدید</th>
                  <th>لایک</th>
                  <th>نظر</th>
                  <th>اشتراک‌گذاری</th>
                </tr>
              </thead>

              <tbody>
                ${rows || `
                  <tr>
                    <td colspan="6">
                      هنوز ریلزی منتشر نکرده‌اید.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // POST ANALYTICS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/post-analytics") {
      const stats = await pool.query(`
        SELECT
          p.id,
          LEFT(COALESCE(p.content,''),80) AS content,
          COUNT(DISTINCT pv.id)::int AS views,
          COUNT(DISTINCT l.user_id)::int AS likes,
          COUNT(DISTINCT c.id)::int AS comments,
          COUNT(DISTINCT s.id)::int AS shares
        FROM posts p
        LEFT JOIN post_views pv
          ON pv.post_id=p.id
        LEFT JOIN likes l
          ON l.post_id=p.id
        LEFT JOIN comments c
          ON c.post_id=p.id
        LEFT JOIN shares s
          ON s.post_id=p.id
        WHERE p.user_id=$1
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 100
      `,[user.id]);

      const rows =
        stats.rows.map(p => `
          <tr>
            <td>${p.id}</td>
            <td>${escapeHtml(p.content || "")}</td>
            <td>${p.views}</td>
            <td>${p.likes}</td>
            <td>${p.comments}</td>
            <td>${p.shares}</td>
          </tr>
        `).join("");

      sendPage(
        res,
        "آمار پست‌ها",
        `
        <div class="card">
          <h2>📈 آمار پست‌های من</h2>

          <div style="overflow:auto">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>محتوا</th>
                  <th>بازدید</th>
                  <th>لایک</th>
                  <th>نظر</th>
                  <th>اشتراک‌گذاری</th>
                </tr>
              </thead>

              <tbody>
                ${rows || `
                  <tr>
                    <td colspan="6">
                      هنوز پستی منتشر نکرده‌اید.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // ACCOUNT ACTIVITY
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/account-activity") {
      const activity = await pool.query(`
        SELECT
          id,
          ip_address,
          user_agent,
          created_at
        FROM login_activity
        WHERE user_id=$1
        ORDER BY created_at DESC
        LIMIT 50
      `,[user.id]);

      const rows =
        activity.rows.map(a => `
          <div class="card">
            <strong>🔐 ورود به حساب</strong>

            <p>
              زمان:
              ${escapeHtml(
                new Date(a.created_at).toLocaleString("fa-IR")
              )}
            </p>

            <p>
              IP:
              ${escapeHtml(a.ip_address || "نامشخص")}
            </p>

            <p>
              دستگاه:
              ${escapeHtml(a.user_agent || "نامشخص")}
            </p>
          </div>
        `).join("");

      sendPage(
        res,
        "فعالیت حساب",
        `
        <div class="card">
          <h2>🛡 فعالیت‌های اخیر حساب</h2>
          <p>
            ورودهای اخیر حساب در این بخش نمایش داده می‌شوند.
          </p>
        </div>

        ${rows || `
          <div class="card">
            سابقه‌ای ثبت نشده است.
          </div>
        `}
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // PROFILE VISITS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/profile-visits") {
      const visits = await pool.query(`
        SELECT
          pv.created_at,
          u.id,
          u.name,
          u.username
        FROM profile_visits pv
        JOIN users u
          ON u.id=pv.visitor_id
        WHERE pv.profile_id=$1
        ORDER BY pv.created_at DESC
        LIMIT 100
      `,[user.id]);

      const body =
        visits.rows.map(v => `
          <div class="card">
            <strong>
              ${escapeHtml(v.name || v.username || "کاربر")}
            </strong>

            <p>
              @${escapeHtml(v.username || "")}
            </p>

            <p>
              ${escapeHtml(
                new Date(v.created_at).toLocaleString("fa-IR")
              )}
            </p>

            <a class="btn"
              href="/profile?id=${v.id}">
              مشاهده پروفایل
            </a>
          </div>
        `).join("");

      sendPage(
        res,
        "بازدید پروفایل",
        `
        <div class="card">
          <h2>👁 بازدیدهای پروفایل</h2>
        </div>

        ${body || `
          <div class="card">
            هنوز بازدیدی ثبت نشده است.
          </div>
        `}
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // LOG PROFILE VISIT
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/profile-visit") {
      const profileId =
        Number(url.searchParams.get("user"));

      if (
        !Number.isInteger(profileId) ||
        profileId <= 0 ||
        profileId === user.id
      ) {
        redirect(res,"/profile");
        return;
      }

      const target = await pool.query(`
        SELECT id
        FROM users
        WHERE id=$1
      `,[profileId]);

      if (target.rows.length) {
        await pool.query(`
          INSERT INTO profile_visits(
            profile_id,
            visitor_id
          )
          VALUES($1,$2)
        `,[profileId,user.id]);
      }

      redirect(res,`/profile?id=${profileId}`);
      return;
    }

    // ------------------------------------------------------------
    // ACCOUNT DASHBOARD
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/dashboard") {
      const stats = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM posts
            WHERE user_id=$1)::int AS posts,

          (SELECT COUNT(*) FROM reels
            WHERE user_id=$1)::int AS reels,

          (SELECT COUNT(*) FROM followers
            WHERE user_id=$1)::int AS followers
      `,[user.id]).catch(() => null);

      let postCount = 0;
      let reelCount = 0;
      let followerCount = 0;

      const p = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM posts
        WHERE user_id=$1
      `,[user.id]);

      const r = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM reels
        WHERE user_id=$1
      `,[user.id]);

      const f = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM follows
        WHERE following_id=$1
      `,[user.id]);

      postCount = p.rows[0].count;
      reelCount = r.rows[0].count;
      followerCount = f.rows[0].count;

      sendPage(
        res,
        "داشبورد",
        `
        <div class="card">
          <h2>📊 داشبورد MySocial</h2>

          <div class="stats">
            <div>
              <strong>${postCount}</strong>
              <span>پست</span>
            </div>

            <div>
              <strong>${reelCount}</strong>
              <span>ریلز</span>
            </div>

            <div>
              <strong>${followerCount}</strong>
              <span>دنبال‌کننده</span>
            </div>
          </div>

          <div style="display:grid;gap:10px;margin-top:20px">
            <a class="btn" href="/post-analytics">
              📈 آمار پست‌ها
            </a>

            <a class="btn" href="/reel-analytics">
              🎬 آمار ریلزها
            </a>

            <a class="btn" href="/profile-visits">
              👁 بازدید پروفایل
            </a>

            <a class="btn" href="/account-activity">
              🛡 فعالیت حساب
            </a>

            <a class="btn" href="/privacy">
              🔐 حریم خصوصی
            </a>
          </div>
        </div>
        `
      );
      return;
                                 }     // ============================================================
    // SECTION 7
    // ADS / CREATOR / SUBSCRIPTIONS / WALLET / PAYMENTS
    // ============================================================

    // ------------------------------------------------------------
    // AD ACCOUNT
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/ads") {
      const ads = await pool.query(`
        SELECT
          a.id,
          a.title,
          a.description,
          a.target_url,
          a.budget,
          a.spent,
          a.status,
          a.created_at
        FROM ads a
        WHERE a.user_id=$1
        ORDER BY a.created_at DESC
      `,[user.id]);

      const body = ads.rows.map(a => `
        <div class="card">
          <h3>📢 ${escapeHtml(a.title || "تبلیغ")}</h3>

          <p>
            ${escapeHtml(a.description || "")}
          </p>

          <p>
            بودجه:
            ${Number(a.budget || 0).toLocaleString("fa-IR")}
          </p>

          <p>
            هزینه‌شده:
            ${Number(a.spent || 0).toLocaleString("fa-IR")}
          </p>

          <p>
            وضعیت:
            ${escapeHtml(a.status || "draft")}
          </p>

          <a class="btn"
             href="/ad-analytics?id=${a.id}">
             📊 آمار
          </a>
        </div>
      `).join("");

      sendPage(
        res,
        "تبلیغات",
        `
        <div class="card">
          <h2>📢 مدیریت تبلیغات</h2>

          <form method="POST" action="/ad-create">
            <input
              name="title"
              placeholder="عنوان تبلیغ"
              maxlength="150"
              required
            >

            <textarea
              name="description"
              placeholder="توضیحات تبلیغ"
              maxlength="1000"
            ></textarea>

            <input
              name="target_url"
              placeholder="https://example.com"
              maxlength="1000"
              required
            >

            <input
              name="budget"
              type="number"
              min="0"
              step="0.01"
              placeholder="بودجه"
              required
            >

            <button type="submit">
              ایجاد تبلیغ
            </button>
          </form>
        </div>

        ${body || `
          <div class="card">
            هنوز تبلیغی ایجاد نکرده‌اید.
          </div>
        `}
        `
      );
      return;
    }

    if (req.method === "POST" && path === "/ad-create") {
      const d = await readBody(req);

      const title =
        (d.get("title") || "").trim();

      const description =
        (d.get("description") || "").trim();

      const targetUrl =
        (d.get("target_url") || "").trim();

      const budget =
        Number(d.get("budget") || 0);

      if (
        !title ||
        !targetUrl ||
        !Number.isFinite(budget) ||
        budget < 0
      ) {
        redirect(res,"/ads");
        return;
      }

      let parsedUrl;

      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        redirect(res,"/ads");
        return;
      }

      if (
        parsedUrl.protocol !== "http:" &&
        parsedUrl.protocol !== "https:"
      ) {
        redirect(res,"/ads");
        return;
      }

      await pool.query(`
        INSERT INTO ads(
          user_id,
          title,
          description,
          target_url,
          budget,
          spent,
          status
        )
        VALUES($1,$2,$3,$4,$5,0,'draft')
      `,[
        user.id,
        title.slice(0,150),
        description.slice(0,1000),
        parsedUrl.toString(),
        budget
      ]);

      redirect(res,"/ads");
      return;
    }

    // ------------------------------------------------------------
    // AD START / PAUSE
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/ad-toggle") {
      const adId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(adId) ||
        adId <= 0
      ) {
        redirect(res,"/ads");
        return;
      }

      const ad = await pool.query(`
        SELECT status
        FROM ads
        WHERE id=$1
        AND user_id=$2
      `,[adId,user.id]);

      if (!ad.rows.length) {
        redirect(res,"/ads");
        return;
      }

      const current =
        ad.rows[0].status || "draft";

      const next =
        current === "active"
          ? "paused"
          : "active";

      await pool.query(`
        UPDATE ads
        SET status=$1
        WHERE id=$2
        AND user_id=$3
      `,[next,adId,user.id]);

      redirect(res,"/ads");
      return;
    }

    // ------------------------------------------------------------
    // AD ANALYTICS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/ad-analytics") {
      const adId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(adId) ||
        adId <= 0
      ) {
        redirect(res,"/ads");
        return;
      }

      const ad = await pool.query(`
        SELECT
          id,
          title,
          budget,
          spent,
          status
        FROM ads
        WHERE id=$1
        AND user_id=$2
      `,[adId,user.id]);

      if (!ad.rows.length) {
        redirect(res,"/ads");
        return;
      }

      const events = await pool.query(`
        SELECT
          event_type,
          COUNT(*)::int AS count
        FROM ad_events
        WHERE ad_id=$1
        GROUP BY event_type
        ORDER BY event_type
      `,[adId]);

      const rows = events.rows.map(e => `
        <tr>
          <td>${escapeHtml(e.event_type)}</td>
          <td>${e.count}</td>
        </tr>
      `).join("");

      sendPage(
        res,
        "آمار تبلیغ",
        `
        <div class="card">
          <h2>📊 ${escapeHtml(
            ad.rows[0].title
          )}</h2>

          <p>
            بودجه:
            ${Number(ad.rows[0].budget || 0)
              .toLocaleString("fa-IR")}
          </p>

          <p>
            هزینه:
            ${Number(ad.rows[0].spent || 0)
              .toLocaleString("fa-IR")}
          </p>

          <p>
            وضعیت:
            ${escapeHtml(ad.rows[0].status || "")}
          </p>
        </div>

        <div class="card">
          <h3>رویدادها</h3>

          <table>
            <thead>
              <tr>
                <th>نوع</th>
                <th>تعداد</th>
              </tr>
            </thead>

            <tbody>
              ${rows || `
                <tr>
                  <td colspan="2">
                    هنوز داده‌ای ثبت نشده است.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // CREATOR ACCOUNT
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/creator") {
      const creator = await pool.query(`
        SELECT
          ca.id,
          ca.display_name,
          ca.bio,
          ca.status,
          COALESCE(
            SUM(
              CASE
                WHEN ct.type='earning'
                THEN ct.amount
                ELSE 0
              END
            ),0
          ) AS earnings
        FROM creator_accounts ca
        LEFT JOIN creator_transactions ct
          ON ct.creator_id=ca.id
        WHERE ca.user_id=$1
        GROUP BY ca.id
      `,[user.id]);

      if (!creator.rows.length) {
        sendPage(
          res,
          "حساب سازنده",
          `
          <div class="card">
            <h2>⭐ حساب سازنده</h2>

            <p>
              با فعال‌کردن حساب سازنده می‌توانید
              امکانات حرفه‌ای درآمدزایی را مدیریت کنید.
            </p>

            <form method="POST"
                  action="/creator-enable">
              <input
                name="display_name"
                maxlength="100"
                placeholder="نام سازنده"
                required
              >

              <textarea
                name="bio"
                maxlength="1000"
                placeholder="معرفی کوتاه"
              ></textarea>

              <button type="submit">
                فعال‌سازی
              </button>
            </form>
          </div>
          `
        );
        return;
      }

      const c = creator.rows[0];

      sendPage(
        res,
        "داشبورد سازنده",
        `
        <div class="card">
          <h2>⭐ ${escapeHtml(
            c.display_name || user.name
          )}</h2>

          <p>
            ${escapeHtml(c.bio || "")}
          </p>

          <p>
            وضعیت:
            ${escapeHtml(c.status || "active")}
          </p>

          <p>
            درآمد ثبت‌شده:
            ${Number(c.earnings || 0)
              .toLocaleString("fa-IR")}
          </p>

          <div style="display:grid;gap:10px">
            <a class="btn" href="/creator-subscriptions">
              💎 اشتراک‌های من
            </a>

            <a class="btn" href="/creator-transactions">
              💰 تراکنش‌ها
            </a>

            <a class="btn" href="/creator-payouts">
              🏦 برداشت‌ها
            </a>
          </div>
        </div>
        `
      );
      return;
    }

    if (req.method === "POST" && path === "/creator-enable") {
      const d = await readBody(req);

      const displayName =
        (d.get("display_name") || "").trim();

      const bio =
        (d.get("bio") || "").trim();

      if (!displayName) {
        redirect(res,"/creator");
        return;
      }

      await pool.query(`
        INSERT INTO creator_accounts(
          user_id,
          display_name,
          bio,
          status
        )
        VALUES($1,$2,$3,'active')
        ON CONFLICT(user_id)
        DO UPDATE SET
          display_name=EXCLUDED.display_name,
          bio=EXCLUDED.bio,
          status='active'
      `,[
        user.id,
        displayName.slice(0,100),
        bio.slice(0,1000)
      ]);

      redirect(res,"/creator");
      return;
    }

    // ------------------------------------------------------------
    // CREATOR TRANSACTIONS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/creator-transactions") {
      const rows = await pool.query(`
        SELECT
          id,
          type,
          amount,
          description,
          created_at
        FROM creator_transactions
        WHERE creator_id IN(
          SELECT id
          FROM creator_accounts
          WHERE user_id=$1
        )
        ORDER BY created_at DESC
        LIMIT 100
      `,[user.id]);

      const body = rows.rows.map(t => `
        <div class="card">
          <strong>
            ${escapeHtml(t.type || "")}
          </strong>

          <p>
            مبلغ:
            ${Number(t.amount || 0)
              .toLocaleString("fa-IR")}
          </p>

          <p>
            ${escapeHtml(t.description || "")}
          </p>

          <small>
            ${escapeHtml(
              new Date(t.created_at)
                .toLocaleString("fa-IR")
            )}
          </small>
        </div>
      `).join("");

      sendPage(
        res,
        "تراکنش‌های سازنده",
        `
        <div class="card">
          <h2>💰 تراکنش‌های سازنده</h2>
        </div>

        ${body || `
          <div class="card">
            تراکنشی ثبت نشده است.
          </div>
        `}
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // CREATOR PAYOUTS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/creator-payouts") {
      const payouts = await pool.query(`
        SELECT
          id,
          amount,
          status,
          created_at
        FROM creator_payouts
        WHERE creator_id IN(
          SELECT id
          FROM creator_accounts
          WHERE user_id=$1
        )
        ORDER BY created_at DESC
        LIMIT 100
      `,[user.id]);

      const body = payouts.rows.map(p => `
        <div class="card">
          <strong>
            برداشت:
            ${Number(p.amount || 0)
              .toLocaleString("fa-IR")}
          </strong>

          <p>
            وضعیت:
            ${escapeHtml(p.status || "pending")}
          </p>

          <small>
            ${escapeHtml(
              new Date(p.created_at)
                .toLocaleString("fa-IR")
            )}
          </small>
        </div>
      `).join("");

      sendPage(
        res,
        "برداشت درآمد",
        `
        <div class="card">
          <h2>🏦 برداشت درآمد</h2>

          <form method="POST"
                action="/creator-payout">
            <input
              name="amount"
              type="number"
              min="1"
              step="0.01"
              placeholder="مبلغ برداشت"
              required
            >

            <button type="submit">
              درخواست برداشت
            </button>
          </form>
        </div>

        ${body}
        `
      );
      return;
    }

    if (req.method === "POST" && path === "/creator-payout") {
      const d = await readBody(req);

      const amount =
        Number(d.get("amount") || 0);

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        redirect(res,"/creator-payouts");
        return;
      }

      const creator = await pool.query(`
        SELECT id
        FROM creator_accounts
        WHERE user_id=$1
        AND status='active'
        LIMIT 1
      `,[user.id]);

      if (!creator.rows.length) {
        redirect(res,"/creator");
        return;
      }

      const creatorId =
        creator.rows[0].id;

      const earnings = await pool.query(`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN type='earning'
              THEN amount
              WHEN type='payout'
              THEN -amount
              ELSE 0
            END
          ),0) AS balance
        FROM creator_transactions
        WHERE creator_id=$1
      `,[creatorId]);

      const balance =
        Number(earnings.rows[0].balance || 0);

      if (amount > balance) {
        redirect(res,"/creator-payouts");
        return;
      }

      await pool.query(`
        INSERT INTO creator_payouts(
          creator_id,
          amount,
          status
        )
        VALUES($1,$2,'pending')
      `,[creatorId,amount]);

      await pool.query(`
        INSERT INTO creator_transactions(
          creator_id,
          type,
          amount,
          description
        )
        VALUES(
          $1,
          'payout',
          $2,
          'درخواست برداشت درآمد'
        )
      `,[creatorId,amount]);

      redirect(res,"/creator-payouts");
      return;
    }

    // ------------------------------------------------------------
    // SUBSCRIPTION PLANS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/plans") {
      const plans = await pool.query(`
        SELECT
          id,
          name,
          description,
          price,
          duration_days,
          creator_id
        FROM subscription_plans
        WHERE active=TRUE
        ORDER BY price ASC
      `);

      const body = plans.rows.map(p => `
        <div class="card">
          <h3>💎 ${escapeHtml(p.name)}</h3>

          <p>
            ${escapeHtml(p.description || "")}
          </p>

          <p>
            قیمت:
            ${Number(p.price || 0)
              .toLocaleString("fa-IR")}
          </p>

          <p>
            مدت:
            ${Number(p.duration_days || 0)} روز
          </p>

          <form method="POST"
                action="/subscribe">
            <input
              type="hidden"
              name="plan_id"
              value="${p.id}"
            >

            <button type="submit">
              خرید اشتراک
            </button>
          </form>
        </div>
      `).join("");

      sendPage(
        res,
        "اشتراک‌ها",
        `
        <div class="card">
          <h2>💎 پلن‌های اشتراک</h2>
        </div>

        ${body || `
          <div class="card">
            پلن فعالی وجود ندارد.
          </div>
        `}
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // USER SUBSCRIPTIONS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/my-subscriptions") {
      const subscriptions = await pool.query(`
        SELECT
          us.id,
          us.status,
          us.started_at,
          us.expires_at,
          sp.name,
          sp.price
        FROM user_subscriptions us
        JOIN subscription_plans sp
          ON sp.id=us.plan_id
        WHERE us.user_id=$1
        ORDER BY us.started_at DESC
      `,[user.id]);

      const body =
        subscriptions.rows.map(s => `
          <div class="card">
            <h3>💎 ${escapeHtml(s.name)}</h3>

            <p>
              وضعیت:
              ${escapeHtml(s.status || "")}
            </p>

            <p>
              شروع:
              ${escapeHtml(
                new Date(s.started_at)
                  .toLocaleString("fa-IR")
              )}
            </p>

            <p>
              پایان:
              ${escapeHtml(
                new Date(s.expires_at)
                  .toLocaleString("fa-IR")
              )}
            </p>
          </div>
        `).join("");

      sendPage(
        res,
        "اشتراک‌های من",
        `
        <div class="card">
          <h2>💎 اشتراک‌های من</h2>

          <a class="btn" href="/plans">
            مشاهده پلن‌ها
          </a>
        </div>

        ${body || `
          <div class="card">
            اشتراک فعالی ندارید.
          </div>
        `}
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // WALLET
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/wallet") {
      const wallet = await pool.query(`
        SELECT
          id,
          balance,
          currency
        FROM wallet_accounts
        WHERE user_id=$1
      `,[user.id]);

      const transactions = await pool.query(`
        SELECT
          type,
          amount,
          description,
          created_at
        FROM wallet_transactions
        WHERE user_id=$1
        ORDER BY created_at DESC
        LIMIT 50
      `,[user.id]);

      const balance =
        wallet.rows.length
          ? Number(wallet.rows[0].balance || 0)
          : 0;

      const rows =
        transactions.rows.map(t => `
          <tr>
            <td>${escapeHtml(t.type || "")}</td>
            <td>${Number(t.amount || 0)
              .toLocaleString("fa-IR")}</td>
            <td>${escapeHtml(
              t.description || ""
            )}</td>
          </tr>
        `).join("");

      sendPage(
        res,
        "کیف پول",
        `
        <div class="card">
          <h2>👛 کیف پول</h2>

          <h1>
            ${balance.toLocaleString("fa-IR")}
          </h1>

          <p>
            موجودی کیف پول
          </p>
        </div>

        <div class="card">
          <h3>تراکنش‌ها</h3>

          <table>
            <thead>
              <tr>
                <th>نوع</th>
                <th>مبلغ</th>
                <th>توضیحات</th>
              </tr>
            </thead>

            <tbody>
              ${rows || `
                <tr>
                  <td colspan="3">
                    تراکنشی وجود ندارد.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // PAYMENT ORDERS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/payments") {
      const orders = await pool.query(`
        SELECT
          id,
          amount,
          currency,
          status,
          description,
          created_at
        FROM payment_orders
        WHERE user_id=$1
        ORDER BY created_at DESC
        LIMIT 100
      `,[user.id]);

      const body =
        orders.rows.map(o => `
          <div class="card">
            <strong>
              سفارش #${o.id}
            </strong>

            <p>
              مبلغ:
              ${Number(o.amount || 0)
                .toLocaleString("fa-IR")}
              ${escapeHtml(o.currency || "")}
            </p>

            <p>
              وضعیت:
              ${escapeHtml(o.status || "")}
            </p>

            <p>
              ${escapeHtml(o.description || "")}
            </p>
          </div>
        `).join("");

      sendPage(
        res,
        "پرداخت‌ها",
        `
        <div class="card">
          <h2>💳 پرداخت‌ها</h2>
        </div>

        ${body || `
          <div class="card">
            سفارش پرداختی وجود ندارد.
          </div>
        `}
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // SUBSCRIBE
    // ------------------------------------------------------------

    if (req.method === "POST" && path === "/subscribe") {
      const d = await readBody(req);

      const planId =
        Number(d.get("plan_id"));

      if (
        !Number.isInteger(planId) ||
        planId <= 0
      ) {
        redirect(res,"/plans");
        return;
      }

      const plan = await pool.query(`
        SELECT
          id,
          price,
          duration_days
        FROM subscription_plans
        WHERE id=$1
        AND active=TRUE
      `,[planId]);

      if (!plan.rows.length) {
        redirect(res,"/plans");
        return;
      }

      const p = plan.rows[0];

      if (Number(p.price) <= 0) {
        const started = new Date();
        const expires =
          new Date(
            started.getTime() +
            Number(p.duration_days || 30) *
            86400000
          );

        await pool.query(`
          INSERT INTO user_subscriptions(
            user_id,
            plan_id,
            status,
            started_at,
            expires_at
          )
          VALUES($1,$2,'active',$3,$4)
        `,[
          user.id,
          planId,
          started,
          expires
        ]);

        redirect(res,"/my-subscriptions");
        return;
      }

      const order = await pool.query(`
        INSERT INTO payment_orders(
          user_id,
          amount,
          currency,
          status,
          description
        )
        VALUES(
          $1,
          $2,
          'IRR',
          'pending',
          $3
        )
        RETURNING id
      `,[
        user.id,
        Number(p.price),
        `خرید پلن اشتراک #${planId}`
      ]);

      redirect(
        res,
        `/payment?id=${order.rows[0].id}`
      );

      return;
    }

    // ------------------------------------------------------------
    // PAYMENT PAGE
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/payment") {
      const orderId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(orderId) ||
        orderId <= 0
      ) {
        redirect(res,"/payments");
        return;
      }

      const order = await pool.query(`
        SELECT
          id,
          amount,
          currency,
          status,
          description
        FROM payment_orders
        WHERE id=$1
        AND user_id=$2
      `,[orderId,user.id]);

      if (!order.rows.length) {
        redirect(res,"/payments");
        return;
      }

      const o = order.rows[0];

      sendPage(
        res,
        "پرداخت",
        `
        <div class="card">
          <h2>💳 پرداخت سفارش #${o.id}</h2>

          <p>
            ${escapeHtml(o.description || "")}
          </p>

          <h2>
            ${Number(o.amount || 0)
              .toLocaleString("fa-IR")}
            ${escapeHtml(o.currency || "")}
          </h2>

          <p>
            وضعیت:
            ${escapeHtml(o.status || "")}
          </p>

          <form method="POST"
                action="/payment-confirm">
            <input
              type="hidden"
              name="order_id"
              value="${o.id}"
            >

            <button type="submit">
              شبیه‌سازی تأیید پرداخت
            </button>
          </form>
        </div>
        `
      );
      return;
    }

    // ------------------------------------------------------------
    // PAYMENT CONFIRMATION
    // ------------------------------------------------------------

    if (req.method === "POST" && path === "/payment-confirm") {
      const d = await readBody(req);

      const orderId =
        Number(d.get("order_id"));

      if (
        !Number.isInteger(orderId) ||
        orderId <= 0
      ) {
        redirect(res,"/payments");
        return;
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const order = await client.query(`
          SELECT
            id,
            amount,
            status,
            description
          FROM payment_orders
          WHERE id=$1
          AND user_id=$2
          FOR UPDATE
        `,[orderId,user.id]);

        if (!order.rows.length) {
          await client.query("ROLLBACK");
          redirect(res,"/payments");
          return;
        }

        const o = order.rows[0];

        if (o.status !== "paid") {
          await client.query(`
            UPDATE payment_orders
            SET status='paid',
                paid_at=NOW()
            WHERE id=$1
          `,[orderId]);

          await client.query(`
            INSERT INTO wallet_transactions(
              user_id,
              type,
              amount,
              description
            )
            VALUES(
              $1,
              'payment',
              0,
              $2
            )
          `,[
            user.id,
            `پرداخت سفارش #${orderId}`
          ]);
        }

        await client.query("COMMIT");

      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      redirect(res,"/payments");
      return;
    }  // ============================================================
    // SECTION 8
    // PAID CONTENT / LIVE / ACCOUNT / HEALTH
    // ============================================================

    // ------------------------------------------------------------
    // PAID CONTENT
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/paid-content") {
      const result = await pool.query(`
        SELECT
          pc.id,
          pc.title,
          pc.description,
          pc.price,
          pc.media_url,
          pc.created_at,
          u.id AS creator_id,
          u.name AS creator_name
        FROM paid_content pc
        JOIN users u ON u.id=pc.creator_id
        WHERE pc.creator_id=$1
        ORDER BY pc.created_at DESC
      `,[user.id]);

      sendPage(
        res,
        "محتوای پولی",
        `
        <div class="card">
          <h2>محتوای پولی</h2>

          <form method="POST" action="/paid-content-create">
            <input
              name="title"
              placeholder="عنوان محتوا"
              required
              maxlength="200"
            >

            <textarea
              name="description"
              placeholder="توضیحات محتوا"
              maxlength="5000"
            ></textarea>

            <input
              name="media_url"
              placeholder="لینک تصویر یا ویدیو"
              maxlength="1000"
            >

            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              placeholder="قیمت"
              required
            >

            <button type="submit">
              ایجاد محتوای پولی
            </button>
          </form>
        </div>

        ${
          result.rows.map(p => `
            <div class="card">
              <h3>${escapeHtml(p.title)}</h3>

              <p>
                ${escapeHtml(p.description || "")}
              </p>

              ${
                p.media_url
                  ? `<p><a href="${escapeHtml(p.media_url)}" target="_blank">مشاهده رسانه</a></p>`
                  : ""
              }

              <strong>
                قیمت: ${Number(p.price).toLocaleString("fa-IR")}
              </strong>

              <p>
                شناسه محتوا: ${p.id}
              </p>
            </div>
          `).join("")
        }
        `
      );

      return;
    }

    if (req.method === "POST" && path === "/paid-content-create") {
      const d = await readBody(req);

      const title =
        (d.get("title") || "").trim();

      const description =
        (d.get("description") || "").trim();

      const mediaUrl =
        (d.get("media_url") || "").trim();

      const price =
        Number(d.get("price"));

      if (
        !title ||
        !Number.isFinite(price) ||
        price < 0
      ) {
        redirect(res,"/paid-content");
        return;
      }

      await pool.query(`
        INSERT INTO paid_content(
          creator_id,
          title,
          description,
          price,
          media_url
        )
        VALUES($1,$2,$3,$4,$5)
      `,[
        user.id,
        title,
        description || null,
        price,
        mediaUrl || null
      ]);

      redirect(res,"/paid-content");
      return;
    }

    if (req.method === "GET" && path === "/paid-content-buy") {
      const contentId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(contentId) ||
        contentId <= 0
      ) {
        redirect(res,"/");
        return;
      }

      const content = await pool.query(`
        SELECT
          pc.id,
          pc.creator_id,
          pc.title,
          pc.description,
          pc.price,
          pc.media_url,
          u.name AS creator_name
        FROM paid_content pc
        JOIN users u ON u.id=pc.creator_id
        WHERE pc.id=$1
      `,[contentId]);

      if (!content.rows.length) {
        redirect(res,"/");
        return;
      }

      const p = content.rows[0];

      if (p.creator_id === user.id) {
        redirect(
          res,
          `/paid-content?id=${contentId}`
        );
        return;
      }

      const purchased = await pool.query(`
        SELECT 1
        FROM paid_content_purchases
        WHERE content_id=$1
        AND buyer_id=$2
        LIMIT 1
      `,[contentId,user.id]);

      if (purchased.rows.length) {
        sendPage(
          res,
          "محتوای خریداری‌شده",
          `
          <div class="card">
            <h2>${escapeHtml(p.title)}</h2>
            <p>${escapeHtml(p.description || "")}</p>

            ${
              p.media_url
                ? `
                  <p>
                    <a
                      href="${escapeHtml(p.media_url)}"
                      target="_blank"
                    >
                      مشاهده محتوا
                    </a>
                  </p>
                `
                : ""
            }

            <p>این محتوا قبلاً خریداری شده است.</p>
          </div>
          `
        );

        return;
      }

      const order = await pool.query(`
        INSERT INTO payment_orders(
          user_id,
          amount,
          status,
          description
        )
        VALUES(
          $1,
          $2,
          'pending',
          $3
        )
        RETURNING id
      `,[
        user.id,
        p.price,
        `خرید محتوای پولی #${contentId}`
      ]);

      sendPage(
        res,
        "خرید محتوا",
        `
        <div class="card">
          <h2>خرید محتوا</h2>

          <p>
            ${escapeHtml(p.title)}
          </p>

          <p>
            قیمت:
            ${Number(p.price).toLocaleString("fa-IR")}
          </p>

          <form method="POST" action="/paid-content-confirm">
            <input
              type="hidden"
              name="order_id"
              value="${order.rows[0].id}"
            >

            <input
              type="hidden"
              name="content_id"
              value="${contentId}"
            >

            <button type="submit">
              تأیید خرید
            </button>
          </form>
        </div>
        `
      );

      return;
    }

    if (
      req.method === "POST" &&
      path === "/paid-content-confirm"
    ) {
      const d = await readBody(req);

      const orderId =
        Number(d.get("order_id"));

      const contentId =
        Number(d.get("content_id"));

      if (
        !Number.isInteger(orderId) ||
        orderId <= 0 ||
        !Number.isInteger(contentId) ||
        contentId <= 0
      ) {
        redirect(res,"/");
        return;
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const order = await client.query(`
          SELECT
            id,
            amount,
            status,
            description
          FROM payment_orders
          WHERE id=$1
          AND user_id=$2
          FOR UPDATE
        `,[orderId,user.id]);

        const content = await client.query(`
          SELECT
            id,
            creator_id,
            price
          FROM paid_content
          WHERE id=$1
          FOR UPDATE
        `,[contentId]);

        if (
          !order.rows.length ||
          !content.rows.length
        ) {
          await client.query("ROLLBACK");
          redirect(res,"/");
          return;
        }

        const o = order.rows[0];
        const c = content.rows[0];

        if (
          o.status === "pending" &&
          Number(o.amount) >= Number(c.price)
        ) {
          await client.query(`
            UPDATE payment_orders
            SET
              status='paid',
              paid_at=NOW()
            WHERE id=$1
          `,[orderId]);

          await client.query(`
            INSERT INTO paid_content_purchases(
              content_id,
              buyer_id,
              amount
            )
            VALUES($1,$2,$3)
            ON CONFLICT DO NOTHING
          `,[
            contentId,
            user.id,
            c.price
          ]);

          await client.query(`
            INSERT INTO creator_transactions(
              creator_id,
              user_id,
              amount,
              type,
              description
            )
            VALUES(
              $1,
              $2,
              $3,
              'sale',
              $4
            )
          `,[
            c.creator_id,
            user.id,
            c.price,
            `فروش محتوای پولی #${contentId}`
          ]);

          await notify(
            c.creator_id,
            user.id,
            "payment",
            contentId,
            `${user.name} محتوای پولی شما را خریداری کرد.`
          );
        }

        await client.query("COMMIT");

      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      redirect(
        res,
        `/paid-content-buy?id=${contentId}`
      );

      return;
    }

    // ------------------------------------------------------------
    // LIVE STREAMS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/live") {
      const live = await pool.query(`
        SELECT
          l.id,
          l.title,
          l.status,
          l.started_at,
          l.ended_at,
          u.id AS user_id,
          u.name AS user_name,
          (
            SELECT COUNT(*)
            FROM live_viewers v
            WHERE v.live_id=l.id
          ) AS viewers
        FROM live_streams l
        JOIN users u ON u.id=l.user_id
        WHERE l.status='live'
        ORDER BY l.started_at DESC
      `);

      sendPage(
        res,
        "پخش زنده",
        `
        <div class="card">
          <h2>پخش زنده</h2>

          <form method="POST" action="/live-start">
            <input
              name="title"
              placeholder="عنوان پخش زنده"
              required
              maxlength="200"
            >

            <button type="submit">
              شروع پخش زنده
            </button>
          </form>
        </div>

        ${
          live.rows.length
            ? live.rows.map(l => `
              <div class="card">
                <h3>
                  ${escapeHtml(l.title)}
                </h3>

                <p>
                  توسط
                  <a href="/profile?id=${l.user_id}">
                    ${escapeHtml(l.user_name)}
                  </a>
                </p>

                <p>
                  بینندگان:
                  ${Number(l.viewers).toLocaleString("fa-IR")}
                </p>

                <a
                  class="btn"
                  href="/live-view?id=${l.id}"
                >
                  ورود به پخش
                </a>
              </div>
            `).join("")
            : `
              <div class="card">
                <p>
                  در حال حاضر پخش زنده‌ای وجود ندارد.
                </p>
              </div>
            `
        }
        `
      );

      return;
    }

    if (req.method === "POST" && path === "/live-start") {
      const d = await readBody(req);

      const title =
        (d.get("title") || "").trim();

      if (!title) {
        redirect(res,"/live");
        return;
      }

      const existing = await pool.query(`
        SELECT id
        FROM live_streams
        WHERE user_id=$1
        AND status='live'
        LIMIT 1
      `,[user.id]);

      if (existing.rows.length) {
        redirect(
          res,
          `/live-view?id=${existing.rows[0].id}`
        );
        return;
      }

      const stream = await pool.query(`
        INSERT INTO live_streams(
          user_id,
          title,
          status,
          started_at
        )
        VALUES(
          $1,
          $2,
          'live',
          NOW()
        )
        RETURNING id
      `,[
        user.id,
        title
      ]);

      redirect(
        res,
        `/live-view?id=${stream.rows[0].id}`
      );

      return;
    }

    if (req.method === "GET" && path === "/live-view") {
      const liveId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(liveId) ||
        liveId <= 0
      ) {
        redirect(res,"/live");
        return;
      }

      const stream = await pool.query(`
        SELECT
          l.id,
          l.user_id,
          l.title,
          l.status,
          l.started_at,
          u.name AS user_name
        FROM live_streams l
        JOIN users u ON u.id=l.user_id
        WHERE l.id=$1
      `,[liveId]);

      if (!stream.rows.length) {
        redirect(res,"/live");
        return;
      }

      const s = stream.rows[0];

      await pool.query(`
        INSERT INTO live_viewers(
          live_id,
          user_id,
          joined_at,
          last_seen_at
        )
        VALUES(
          $1,
          $2,
          NOW(),
          NOW()
        )
        ON CONFLICT(live_id,user_id)
        DO UPDATE SET
          last_seen_at=NOW()
      `,[
        liveId,
        user.id
      ]);

      const comments = await pool.query(`
        SELECT
          c.id,
          c.comment,
          c.created_at,
          u.id AS user_id,
          u.name AS user_name
        FROM live_comments c
        JOIN users u ON u.id=c.user_id
        WHERE c.live_id=$1
        ORDER BY c.created_at ASC
        LIMIT 100
      `,[liveId]);

      sendPage(
        res,
        `پخش زنده ${s.title}`,
        `
        <div class="card">
          <h2>
            ${escapeHtml(s.title)}
          </h2>

          <p>
            پخش توسط:
            <a href="/profile?id=${s.user_id}">
              ${escapeHtml(s.user_name)}
            </a>
          </p>

          <div
            style="
              min-height:300px;
              display:flex;
              align-items:center;
              justify-content:center;
              border:1px solid #ddd;
              border-radius:12px;
              margin:15px 0;
            "
          >
            <div>
              <h3>🔴 LIVE</h3>
              <p>
                اتصال رسانه‌ای پخش زنده در این بخش قرار می‌گیرد.
              </p>
            </div>
          </div>

          ${
            s.user_id === user.id
              ? `
                <a
                  class="btn"
                  href="/live-stop?id=${s.id}"
                >
                  پایان پخش
                </a>
              `
              : ""
          }
        </div>

        <div class="card">
          <h3>نظرات زنده</h3>

          ${
            comments.rows.map(c => `
              <div
                style="
                  padding:8px 0;
                  border-bottom:1px solid #eee;
                "
              >
                <strong>
                  ${escapeHtml(c.user_name)}
                </strong>
                :
                ${escapeHtml(c.comment)}
              </div>
            `).join("")
          }

          <form method="POST" action="/live-comment">
            <input
              type="hidden"
              name="live_id"
              value="${s.id}"
            >

            <input
              name="comment"
              placeholder="پیام شما..."
              maxlength="1000"
              required
            >

            <button type="submit">
              ارسال
            </button>
          </form>
        </div>
        `
      );

      return;
    }

    if (req.method === "POST" && path === "/live-comment") {
      const d = await readBody(req);

      const liveId =
        Number(d.get("live_id"));

      const comment =
        (d.get("comment") || "").trim();

      if (
        !Number.isInteger(liveId) ||
        liveId <= 0 ||
        !comment
      ) {
        redirect(res,"/live");
        return;
      }

      const live = await pool.query(`
        SELECT
          id,
          user_id,
          status
        FROM live_streams
        WHERE id=$1
      `,[liveId]);

      if (
        !live.rows.length ||
        live.rows[0].status !== "live"
      ) {
        redirect(res,"/live");
        return;
      }

      await pool.query(`
        INSERT INTO live_comments(
          live_id,
          user_id,
          comment
        )
        VALUES($1,$2,$3)
      `,[
        liveId,
        user.id,
        comment
      ]);

      if (live.rows[0].user_id !== user.id) {
        await notify(
          live.rows[0].user_id,
          user.id,
          "live_comment",
          liveId,
          `${user.name} در پخش زنده شما نظر داد.`
        );
      }

      redirect(
        res,
        `/live-view?id=${liveId}`
      );

      return;
    }

    if (req.method === "GET" && path === "/live-stop") {
      const liveId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(liveId) ||
        liveId <= 0
      ) {
        redirect(res,"/live");
        return;
      }

      await pool.query(`
        UPDATE live_streams
        SET
          status='ended',
          ended_at=NOW()
        WHERE id=$1
        AND user_id=$2
        AND status='live'
      `,[
        liveId,
        user.id
      ]);

      await pool.query(`
        UPDATE live_viewers
        SET last_seen_at=NOW()
        WHERE live_id=$1
        AND user_id=$2
      `,[
        liveId,
        user.id
      ]);

      redirect(res,"/live");
      return;
    }

    // ------------------------------------------------------------
    // MY LIVE HISTORY
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/live-history"
    ) {
      const history = await pool.query(`
        SELECT
          l.id,
          l.title,
          l.status,
          l.started_at,
          l.ended_at,
          (
            SELECT COUNT(*)
            FROM live_viewers v
            WHERE v.live_id=l.id
          ) AS viewers
        FROM live_streams l
        WHERE l.user_id=$1
        ORDER BY l.started_at DESC
        LIMIT 100
      `,[user.id]);

      sendPage(
        res,
        "تاریخچه پخش زنده",
        `
        <div class="card">
          <h2>تاریخچه پخش‌های زنده</h2>

          ${
            history.rows.length
              ? history.rows.map(l => `
                <div
                  style="
                    padding:12px 0;
                    border-bottom:1px solid #eee;
                  "
                >
                  <strong>
                    ${escapeHtml(l.title)}
                  </strong>

                  <p>
                    وضعیت:
                    ${escapeHtml(l.status)}
                  </p>

                  <p>
                    بینندگان:
                    ${Number(l.viewers).toLocaleString("fa-IR")}
                  </p>

                  <p>
                    شروع:
                    ${new Date(l.started_at).toLocaleString("fa-IR")}
                  </p>
                </div>
              `).join("")
              : "<p>هنوز پخش زنده‌ای ثبت نشده است.</p>"
          }
        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // HEALTH CHECK
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/health") {
      try {
        await pool.query("SELECT 1");

        res.writeHead(200,{
          "Content-Type":"application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:true,
          service:"MySocial",
          database:"connected",
          time:new Date().toISOString()
        }));

      } catch (err) {
        res.writeHead(503,{
          "Content-Type":"application/json; charset=utf-8"
        });

        res.end(JSON.stringify(    // ============================================================
 // SECTION 9
 // SERVER STARTUP / DATABASE INITIALIZATION
 // ============================================================

async function startServer() {
  try {
    console.log("Starting MySocial...");

    await createTables();

    console.log("Database initialized successfully.");

    const server = http.createServer(async (req, res) => {
      await handleRequest(req, res);
    });

    server.on("error", (err) => {
      console.error("HTTP SERVER ERROR:", err);
    });

    server.listen(PORT, "0.0.0.0", () => {
      console.log(
        `MySocial server running on port ${PORT}`
      );
    });

  } catch (err) {
    console.error(
      "FATAL STARTUP ERROR:",
      err
    );

    process.exit(1);
  }
}

process.on("unhandledRejection", (err) => {
  console.error(
    "UNHANDLED REJECTION:",
    err
  );
});

process.on("uncaughtException", (err) => {
  console.error(
    "UNCAUGHT EXCEPTION:",
    err
  );
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received.");

  try {
    await pool.end();
  } catch (err) {
    console.error(
      "DATABASE CLOSE ERROR:",
      err
    );
  }

  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received.");

  try {
    await pool.end();
  } catch (err) {
    console.error(
      "DATABASE CLOSE ERROR:",
      err
    );
  }

  process.exit(0);
});

startServer();   // ============================================================
    // SECTION 10
    // SECURITY / RATE LIMIT / SESSION CLEANUP / API
    // ============================================================

    // ------------------------------------------------------------
    // SESSION CLEANUP
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/session-cleanup"
    ) {
      await pool.query(`
        DELETE FROM sessions
        WHERE expires_at < NOW()
      `);

      sendPage(
        res,
        "پاکسازی نشست‌ها",
        `
        <div class="card">
          <h2>نشست‌های من</h2>

          <p>
            نشست‌های منقضی‌شده پاکسازی شدند.
          </p>

          <a href="/">بازگشت به خانه</a>
        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // API CURRENT USER
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/me"
    ) {
      res.writeHead(200,{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        user:{
          id:user.id,
          name:user.name,
          email:user.email,
          username:user.username || null
        }
      }));

      return;
    }

    // ------------------------------------------------------------
    // API NOTIFICATIONS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/notifications"
    ) {
      const result = await pool.query(`
        SELECT
          id,
          type,
          message,
          is_read,
          created_at
        FROM notifications
        WHERE user_id=$1
        ORDER BY created_at DESC
        LIMIT 50
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        notifications:result.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // MARK NOTIFICATIONS AS READ
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/notifications/read"
    ) {
      await pool.query(`
        UPDATE notifications
        SET is_read=TRUE
        WHERE user_id=$1
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true
      }));

      return;
    }

    // ------------------------------------------------------------
    // API FEED
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/feed"
    ) {
      const result = await pool.query(`
        SELECT
          p.id,
          p.user_id,
          p.content,
          p.image_url,
          p.media_type,
          p.location,
          p.created_at,
          u.name,
          u.username,

          (
            SELECT COUNT(*)
            FROM likes l
            WHERE l.post_id=p.id
          ) AS likes,

          (
            SELECT COUNT(*)
            FROM comments c
            WHERE c.post_id=p.id
          ) AS comments,

          EXISTS(
            SELECT 1
            FROM likes ml
            WHERE
              ml.post_id=p.id
              AND ml.user_id=$1
          ) AS liked,

          EXISTS(
            SELECT 1
            FROM bookmarks bm
            WHERE
              bm.post_id=p.id
              AND bm.user_id=$1
          ) AS bookmarked

        FROM posts p
        JOIN users u
          ON u.id=p.user_id

        WHERE
          p.archived=FALSE
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$1 AND b.blocked_id=p.user_id)
              OR
              (b.blocker_id=p.user_id AND b.blocked_id=$1)
          )

        ORDER BY p.created_at DESC
        LIMIT 50
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        posts:result.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // API SEARCH
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/search"
    ) {
      const q =
        (url.searchParams.get("q") || "").trim();

      if (!q) {
        res.writeHead(200,{
          "Content-Type":"application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:true,
          users:[],
          posts:[]
        }));

        return;
      }

      const usersResult = await pool.query(`
        SELECT
          id,
          name,
          username,
          bio
        FROM users
        WHERE
          name ILIKE $1
          OR username ILIKE $1
        ORDER BY name
        LIMIT 20
      `,[`%${q}%`]);

      const postsResult = await pool.query(`
        SELECT
          p.id,
          p.user_id,
          p.content,
          p.image_url,
          p.created_at,
          u.name,
          u.username
        FROM posts p
        JOIN users u
          ON u.id=p.user_id
        WHERE
          p.archived=FALSE
          AND p.content ILIKE $1
        ORDER BY p.created_at DESC
        LIMIT 20
      `,[`%${q}%`]);

      res.writeHead(200,{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        users:usersResult.rows,
        posts:postsResult.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // API UNREAD COUNT
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/unread-count"
    ) {
      const result = await pool.query(`
        SELECT COUNT(*)::INTEGER AS count
        FROM notifications
        WHERE
          user_id=$1
          AND is_read=FALSE
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        count:result.rows[0].count
      }));

      return;
    }

    // ------------------------------------------------------------
    // SECURITY HEADERS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/security-check"
    ) {
      res.writeHead(200,{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store",
        "X-Content-Type-Options":"nosniff",
        "X-Frame-Options":"SAMEORIGIN",
        "Referrer-Policy":"strict-origin-when-cross-origin"
      });

      res.end(JSON.stringify({
        ok:true,
        security:[
          "session-authentication",
          "password-hashing",
          "blocked-user-filtering",
          "validated-ad-urls",
          "database-parameterized-queries"
        ]
      }));

      return;
    }

    // ------------------------------------------------------------
    // API SYSTEM STATUS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/status"
    ) {
      let database = "offline";

      try {
        await pool.query("SELECT 1");
        database = "online";
      } catch (err) {
        database = "offline";
      }

      res.writeHead(
        database === "online" ? 200 : 503,
        {
          "Content-Type":
            "application/json; charset=utf-8",
          "Cache-Control":"no-store"
        }
      );

      res.end(JSON.stringify({
        ok:database === "online",
        service:"MySocial",
        database,
        uptime:Math.floor(process.uptime()),
        timestamp:new Date().toISOString()
      }));

      return;
    }

    // ------------------------------------------------------------
    // ROBOTS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/robots.txt"
    ) {
      res.writeHead(200,{
        "Content-Type":"text/plain; charset=utf-8"
      });

      res.end(
        "User-agent: *\nAllow: /\n"
      );

      return;
    }

    // ------------------------------------------------------------
    // FAVICON
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/favicon.ico"
    ) {
      res.writeHead(204);
      res.end();
      return;
                    }    // ============================================================
    // SECTION 11
    // ADMIN / REPORTS / MODERATION / SYSTEM MANAGEMENT
    // ============================================================

    if (
      req.method === "GET" &&
      path === "/reports"
    ) {
      const reports = await pool.query(`
        SELECT
          r.id,
          r.reason,
          r.description,
          r.status,
          r.created_at,
          r.post_id,
          r.reported_user_id,
          u.name AS reporter_name
        FROM reports r
        JOIN users u
          ON u.id=r.reporter_id
        WHERE r.reporter_id=$1
        ORDER BY r.created_at DESC
        LIMIT 100
      `,[user.id]);

      sendPage(
        res,
        "گزارش‌های من",
        `
        <div class="card">
          <h2>گزارش‌های من</h2>

          ${
            reports.rows.length
              ? reports.rows.map(r => `
                <div
                  style="
                    padding:12px 0;
                    border-bottom:1px solid #eee;
                  "
                >
                  <strong>
                    گزارش #${r.id}
                  </strong>

                  <p>
                    دلیل:
                    ${escapeHtml(r.reason || "")}
                  </p>

                  <p>
                    وضعیت:
                    ${escapeHtml(r.status || "pending")}
                  </p>

                  ${
                    r.description
                      ? `
                        <p>
                          ${escapeHtml(r.description)}
                        </p>
                      `
                      : ""
                  }

                  <small>
                    ${new Date(r.created_at).toLocaleString("fa-IR")}
                  </small>
                </div>
              `).join("")
              : "<p>هنوز گزارشی ثبت نکرده‌اید.</p>"
          }
        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // DELETE MY SESSION
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/logout-all"
    ) {
      await pool.query(`
        DELETE FROM sessions
        WHERE user_id=$1
      `,[user.id]);

      res.writeHead(302,{
        "Location":"/login",
        "Set-Cookie":
          "sessionId=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
      });

      res.end();
      return;
    }

    // ------------------------------------------------------------
    // MY ACCOUNT DATA
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/account-data"
    ) {
      const [posts,followers,following,comments,likes] =
        await Promise.all([
          pool.query(`
            SELECT COUNT(*)::INTEGER AS count
            FROM posts
            WHERE user_id=$1
          `,[user.id]),

          pool.query(`
            SELECT COUNT(*)::INTEGER AS count
            FROM follows
            WHERE following_id=$1
          `,[user.id]),

          pool.query(`
            SELECT COUNT(*)::INTEGER AS count
            FROM follows
            WHERE follower_id=$1
          `,[user.id]),

          pool.query(`
            SELECT COUNT(*)::INTEGER AS count
            FROM comments
            WHERE user_id=$1
          `,[user.id]),

          pool.query(`
            SELECT COUNT(*)::INTEGER AS count
            FROM likes
            WHERE user_id=$1
          `,[user.id])
        ]);

      sendPage(
        res,
        "اطلاعات حساب",
        `
        <div class="card">
          <h2>اطلاعات حساب من</h2>

          <p>
            نام:
            <strong>${escapeHtml(user.name)}</strong>
          </p>

          <p>
            ایمیل:
            ${escapeHtml(user.email)}
          </p>

          <hr>

          <p>
            پست‌ها:
            ${posts.rows[0].count}
          </p>

          <p>
            دنبال‌کننده‌ها:
            ${followers.rows[0].count}
          </p>

          <p>
            دنبال‌شده‌ها:
            ${following.rows[0].count}
          </p>

          <p>
            نظرات:
            ${comments.rows[0].count}
          </p>

          <p>
            پسندیده‌ها:
            ${likes.rows[0].count}
          </p>
        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // ACCOUNT EXPORT API
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/account"
    ) {
      const profile = await pool.query(`
        SELECT
          id,
          name,
          email,
          username,
          bio,
          avatar_url,
          created_at
        FROM users
        WHERE id=$1
      `,[user.id]);

      const posts = await pool.query(`
        SELECT
          id,
          content,
          image_url,
          media_type,
          location,
          created_at
        FROM posts
        WHERE user_id=$1
        ORDER BY created_at DESC
        LIMIT 100
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        account:profile.rows[0] || null,
        posts:posts.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // REMOVE MY PROFILE PHOTO
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/remove-avatar"
    ) {
      await pool.query(`
        UPDATE users
        SET avatar_url=NULL
        WHERE id=$1
      `,[user.id]);

      redirect(res,"/profile");
      return;
    }

    // ------------------------------------------------------------
    // REMOVE MY BIO
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/clear-bio"
    ) {
      await pool.query(`
        UPDATE users
        SET bio=NULL
        WHERE id=$1
      `,[user.id]);

      redirect(res,"/profile-edit");
      return;
    }

    // ------------------------------------------------------------
    // REMOVE OLD EXPIRED STORIES
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/cleanup-stories"
    ) {
      await pool.query(`
        DELETE FROM stories
        WHERE expires_at < NOW()
      `);

      redirect(res,"/stories");
      return;
    }

    // ------------------------------------------------------------
    // CLEANUP ENDED LIVE STREAMS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/cleanup-live"
    ) {
      await pool.query(`
        UPDATE live_streams
        SET
          status='ended',
          ended_at=COALESCE(ended_at,NOW())
        WHERE
          status='live'
          AND started_at < NOW() - INTERVAL '24 hours'
      `);

      redirect(res,"/live");
      return;
    }

    // ------------------------------------------------------------
    // API HEALTH DETAIL
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/health/detail"
    ) {
      let database = false;

      try {
        await pool.query("SELECT NOW()");
        database = true;
      } catch (err) {
        database = false;
      }

      let tables = {};

      if (database) {
        const tableNames = [
          "users",
          "posts",
          "likes",
          "comments",
          "follows",
          "messages",
          "notifications",
          "stories",
          "reels",
          "ads",
          "payment_orders",
          "wallet_accounts",
          "live_streams"
        ];

        for (const tableName of tableNames) {
          try {
            const result = await pool.query(`
              SELECT to_regclass($1) AS table_name
            `,[
              `public.${tableName}`
            ]);

            tables[tableName] =
              Boolean(result.rows[0].table_name);

          } catch (err) {
            tables[tableName] = false;
          }
        }
      }

      res.writeHead(
        database ? 200 : 503,
        {
          "Content-Type":
            "application/json; charset=utf-8",
          "Cache-Control":"no-store"
        }
      );

      res.end(JSON.stringify({
        ok:database,
        service:"MySocial",
        database,
        tables,
        uptime:Math.floor(process.uptime()),
        timestamp:new Date().toISOString()
      }));

      return;
            }   // ============================================================
    // SECTION 12
    // FINAL ROUTES / API / DATABASE SAFE OPERATIONS
    // ============================================================

    // ------------------------------------------------------------
    // PUBLIC USER PROFILE API
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/user"
    ) {
      const id =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_user_id"
        }));

        return;
      }

      const result = await pool.query(`
        SELECT
          id,
          name,
          username,
          bio,
          avatar_url,
          created_at
        FROM users
        WHERE id=$1
      `,[id]);

      if (!result.rows.length) {
        res.writeHead(404,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"user_not_found"
        }));

        return;
      }

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        user:result.rows[0]
      }));

      return;
    }

    // ------------------------------------------------------------
    // API POST
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/post"
    ) {
      const postId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(postId) ||
        postId <= 0
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_post_id"
        }));

        return;
      }

      const result = await pool.query(`
        SELECT
          p.id,
          p.user_id,
          p.content,
          p.image_url,
          p.media_type,
          p.location,
          p.archived,
          p.pinned,
          p.created_at,

          u.name,
          u.username,
          u.avatar_url,

          (
            SELECT COUNT(*)
            FROM likes l
            WHERE l.post_id=p.id
          ) AS likes,

          (
            SELECT COUNT(*)
            FROM comments c
            WHERE c.post_id=p.id
          ) AS comments,

          EXISTS(
            SELECT 1
            FROM likes ml
            WHERE
              ml.post_id=p.id
              AND ml.user_id=$2
          ) AS liked,

          EXISTS(
            SELECT 1
            FROM bookmarks bm
            WHERE
              bm.post_id=p.id
              AND bm.user_id=$2
          ) AS bookmarked

        FROM posts p
        JOIN users u
          ON u.id=p.user_id

        WHERE
          p.id=$1
          AND (
            p.user_id=$2
            OR p.archived=FALSE
          )
      `,[postId,user.id]);

      if (!result.rows.length) {
        res.writeHead(404,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"post_not_found"
        }));

        return;
      }

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        post:result.rows[0]
      }));

      return;
    }

    // ------------------------------------------------------------
    // API COMMENTS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/comments"
    ) {
      const postId =
        Number(url.searchParams.get("post_id"));

      if (
        !Number.isInteger(postId) ||
        postId <= 0
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_post_id"
        }));

        return;
      }

      const result = await pool.query(`
        SELECT
          c.id,
          c.post_id,
          c.user_id,
          c.comment,
          c.created_at,
          u.name,
          u.username,
          u.avatar_url
        FROM comments c
        JOIN users u
          ON u.id=c.user_id
        WHERE
          c.post_id=$1
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$2 AND b.blocked_id=c.user_id)
              OR
              (b.blocker_id=c.user_id AND b.blocked_id=$2)
          )
        ORDER BY c.created_at ASC
        LIMIT 200
      `,[postId,user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        comments:result.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // API STORIES
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/stories"
    ) {
      const result = await pool.query(`
        SELECT
          s.id,
          s.user_id,
          s.media_url,
          s.media_type,
          s.text,
          s.created_at,
          s.expires_at,
          u.name,
          u.username,
          u.avatar_url,

          EXISTS(
            SELECT 1
            FROM story_views sv
            WHERE
              sv.story_id=s.id
              AND sv.user_id=$1
          ) AS viewed

        FROM stories s
        JOIN users u
          ON u.id=s.user_id

        WHERE
          s.expires_at > NOW()
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$1 AND b.blocked_id=s.user_id)
              OR
              (b.blocker_id=s.user_id AND b.blocked_id=$1)
          )

        ORDER BY s.created_at DESC
        LIMIT 100
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        stories:result.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // API REELS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/reels"
    ) {
      const result = await pool.query(`
        SELECT
          r.id,
          r.user_id,
          r.video_url,
          r.caption,
          r.created_at,
          u.name,
          u.username,
          u.avatar_url,

          (
            SELECT COUNT(*)
            FROM reel_likes rl
            WHERE rl.reel_id=r.id
          ) AS likes,

          (
            SELECT COUNT(*)
            FROM reel_comments rc
            WHERE rc.reel_id=r.id
          ) AS comments,

          EXISTS(
            SELECT 1
            FROM reel_likes myrl
            WHERE
              myrl.reel_id=r.id
              AND myrl.user_id=$1
          ) AS liked

        FROM reels r
        JOIN users u
          ON u.id=r.user_id

        WHERE NOT EXISTS(
          SELECT 1
          FROM blocked_users b
          WHERE
            (b.blocker_id=$1 AND b.blocked_id=r.user_id)
            OR
            (b.blocker_id=r.user_id AND b.blocked_id=$1)
        )

        ORDER BY r.created_at DESC
        LIMIT 100
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        reels:result.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // API FOLLOW STATUS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/follow-status"
    ) {
      const targetId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(targetId) ||
        targetId <= 0 ||
        targetId === user.id
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_target"
        }));

        return;
      }

      const following = await pool.query(`
        SELECT 1
        FROM follows
        WHERE
          follower_id=$1
          AND following_id=$2
        LIMIT 1
      `,[user.id,targetId]);

      const request = await pool.query(`
        SELECT 1
        FROM follow_requests
        WHERE
          requester_id=$1
          AND target_id=$2
          AND status='pending'
        LIMIT 1
      `,[user.id,targetId]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        following:Boolean(following.rows.length),
        request_pending:Boolean(request.rows.length)
      }));

      return;
    }

    // ------------------------------------------------------------
    // API WALLET
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/wallet"
    ) {
      const wallet = await pool.query(`
        SELECT
          id,
          balance,
          currency,
          updated_at
        FROM wallet_accounts
        WHERE user_id=$1
        LIMIT 1
      `,[user.id]);

      if (!wallet.rows.length) {
        await pool.query(`
          INSERT INTO wallet_accounts(
            user_id,
            balance,
            currency
          )
          VALUES($1,0,'IRR')
          ON CONFLICT(user_id) DO NOTHING
        `,[user.id]);
      }

      const finalWallet = await pool.query(`
        SELECT
          id,
          balance,
          currency,
          updated_at
        FROM wallet_accounts
        WHERE user_id=$1
        LIMIT 1
      `,[user.id]);

      const transactions = await pool.query(`
        SELECT
          id,
          type,
          amount,
          description,
          created_at
        FROM wallet_transactions
        WHERE user_id=$1
        ORDER BY created_at DESC
        LIMIT 100
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        wallet:finalWallet.rows[0],
        transactions:transactions.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // API LIVE
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/live"
    ) {
      const result = await pool.query(`
        SELECT
          l.id,
          l.user_id,
          l.title,
          l.status,
          l.started_at,
          u.name,
          u.username,
          u.avatar_url,

          (
            SELECT COUNT(*)
            FROM live_viewers v
            WHERE v.live_id=l.id
          ) AS viewers

        FROM live_streams l
        JOIN users u
          ON u.id=l.user_id

        WHERE
          l.status='live'
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$1 AND b.blocked_id=l.user_id)
              OR
              (b.blocker_id=l.user_id AND b.blocked_id=$1)
          )

        ORDER BY l.started_at DESC
        LIMIT 100
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        live:result.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // API MARK VIEW
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/post-view"
    ) {
      const d = await readBody(req);

      const postId =
        Number(d.get("post_id"));

      if (
        !Number.isInteger(postId) ||
        postId <= 0
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_post_id"
        }));

        return;
      }

      await pool.query(`
        INSERT INTO post_views(
          post_id,
          user_id
        )
        VALUES($1,$2)
      `,[postId,user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok:true
      }));

      return;
    }

    // ------------------------------------------------------------
    // API SHARE POST
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/share"
    ) {
      const d = await readBody(req);

      const postId =
        Number(d.get("post_id"));

      if (
        !Number.isInteger(postId) ||
        postId <= 0
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_post_id"
        }));

        return;
      }

      const post = await pool.query(`
        SELECT user_id
        FROM posts
        WHERE id=$1
      `,[postId]);

      if (!post.rows.length) {
        res.writeHead(404,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"post_not_found"
        }));

        return;
      }

      await pool.query(`
        INSERT INTO shares(
          user_id,
          post_id
        )
        VALUES($1,$2)
      `,[user.id,postId]);

      if (post.rows[0].user_id !== user.id) {
        await notify(
          post.rows[0].user_id,
          user.id,
          "share",
          postId,
          `${user.name} پست شما را به اشتراک گذاشت.`
        );
      }

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok:true
      }));

      return;
    }

    // ------------------------------------------------------------
    // API DELETE OWN POST
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/delete-post"
    ) {
      const d = await readBody(req);

      const postId =
        Number(d.get("post_id"));

      if (
        !Number.isInteger(postId) ||
        postId <= 0
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_post_id"
        }));

        return;
      }

      const result = await pool.query(`
        DELETE FROM posts
        WHERE
          id=$1
          AND user_id=$2
        RETURNING id
      `,[postId,user.id]);

      res.writeHead(
        result.rows.length ? 200 : 404,
        {
          "Content-Type":
            "application/json; charset=utf-8"
        }
      );

      res.end(JSON.stringify({
        ok:Boolean(result.rows.length)
      }));

      return;
    }

    // ------------------------------------------------------------
    // API LOGOUT
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/logout"
    ) {
      const cookies =
        parseCookies(req.headers.cookie || "");

      const token =
        cookies.sessionId;

      if (token) {
        await pool.query(`
          DELETE FROM sessions
          WHERE token=$1
        `,[token]);
      }

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Set-Cookie":
          "sessionId=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
      });

      res.end(JSON.stringify({
        ok:true
      }));

      return;
        }    // ============================================================
    // SECTION 13
    // NOTIFICATIONS / REPORTS / ACCOUNT MANAGEMENT
    // ============================================================

    // ------------------------------------------------------------
    // NOTIFICATIONS PAGE
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/notifications"
    ) {
      await pool.query(`
        UPDATE notifications
        SET is_read=TRUE
        WHERE
          user_id=$1
          AND is_read=FALSE
      `,[user.id]);

      const result = await pool.query(`
        SELECT
          n.id,
          n.type,
          n.post_id,
          n.message,
          n.created_at,
          n.is_read,
          u.name,
          u.username,
          u.avatar_url
        FROM notifications n
        LEFT JOIN users u
          ON u.id=n.actor_id
        WHERE n.user_id=$1
        ORDER BY n.created_at DESC
        LIMIT 200
      `,[user.id]);

      const items = result.rows.map(n => `
        <div class="card">
          <div style="display:flex;gap:12px;align-items:center">
            ${
              n.avatar_url
                ? `<img src="${safeUrl(n.avatar_url)}"
                    style="width:46px;height:46px;border-radius:50%;object-fit:cover">`
                : `<div class="avatar">👤</div>`
            }

            <div>
              <strong>
                ${escapeHtml(n.name || "کاربر")}
              </strong>

              ${
                n.username
                  ? `<div class="muted">
                      @${escapeHtml(n.username)}
                    </div>`
                  : ""
              }

              <div style="margin-top:5px">
                ${escapeHtml(n.message || "")}
              </div>

              <small class="muted">
                ${new Date(n.created_at).toLocaleString("fa-IR")}
              </small>
            </div>
          </div>
        </div>
      `).join("");

      sendPage(
        res,
        "اعلان‌ها",
        `
        <div class="container">
          <h1>🔔 اعلان‌ها</h1>

          ${
            items ||
            `<div class="card">
              هنوز اعلانی ندارید.
            </div>`
          }
        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // MARK NOTIFICATION READ
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/notification-read"
    ) {
      const id =
        Number(url.searchParams.get("id"));

      if (
        Number.isInteger(id) &&
        id > 0
      ) {
        await pool.query(`
          UPDATE notifications
          SET is_read=TRUE
          WHERE
            id=$1
            AND user_id=$2
        `,[id,user.id]);
      }

      redirect(res,"/notifications");
      return;
    }

    // ------------------------------------------------------------
    // DELETE NOTIFICATION
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/notification-delete"
    ) {
      const id =
        Number(url.searchParams.get("id"));

      if (
        Number.isInteger(id) &&
        id > 0
      ) {
        await pool.query(`
          DELETE FROM notifications
          WHERE
            id=$1
            AND user_id=$2
        `,[id,user.id]);
      }

      redirect(res,"/notifications");
      return;
    }

    // ------------------------------------------------------------
    // CLEAR ALL NOTIFICATIONS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/notifications-clear"
    ) {
      await pool.query(`
        DELETE FROM notifications
        WHERE user_id=$1
      `,[user.id]);

      redirect(res,"/notifications");
      return;
    }

    // ------------------------------------------------------------
    // REPORTS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/reports"
    ) {
      const result = await pool.query(`
        SELECT
          r.id,
          r.target_type,
          r.target_id,
          r.reason,
          r.status,
          r.created_at
        FROM reports r
        WHERE r.reporter_id=$1
        ORDER BY r.created_at DESC
        LIMIT 100
      `,[user.id]);

      sendPage(
        res,
        "گزارش‌های من",
        `
        <div class="container">
          <h1>🚩 گزارش‌های من</h1>

          ${
            result.rows.map(r => `
              <div class="card">
                <strong>
                  ${escapeHtml(r.target_type)}
                </strong>

                <p>
                  شناسه:
                  ${r.target_id}
                </p>

                <p>
                  دلیل:
                  ${escapeHtml(r.reason || "")}
                </p>

                <p>
                  وضعیت:
                  ${escapeHtml(r.status || "pending")}
                </p>

                <small class="muted">
                  ${new Date(r.created_at).toLocaleString("fa-IR")}
                </small>
              </div>
            `).join("") ||
            `<div class="card">
              گزارشی ثبت نشده است.
            </div>`
          }
        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // REPORT API
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/report"
    ) {
      const d = await readBody(req);

      const targetType =
        (d.get("target_type") || "").trim();

      const targetId =
        Number(d.get("target_id"));

      const reason =
        (d.get("reason") || "").trim();

      const allowedTypes = [
        "user",
        "post",
        "comment",
        "reel",
        "story",
        "live"
      ];

      if (
        !allowedTypes.includes(targetType) ||
        !Number.isInteger(targetId) ||
        targetId <= 0 ||
        !reason
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_report"
        }));

        return;
      }

      await pool.query(`
        INSERT INTO reports(
          reporter_id,
          target_type,
          target_id,
          reason,
          status
        )
        VALUES(
          $1,$2,$3,$4,'pending'
        )
      `,[
        user.id,
        targetType,
        targetId,
        reason.slice(0,1000)
      ]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok:true
      }));

      return;
    }

    // ------------------------------------------------------------
    // ACCOUNT DATA
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/account"
    ) {
      const result = await pool.query(`
        SELECT
          id,
          name,
          username,
          bio,
          avatar_url,
          created_at
        FROM users
        WHERE id=$1
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        account:result.rows[0] || null
      }));

      return;
    }

    // ------------------------------------------------------------
    // REMOVE AVATAR
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/remove-avatar"
    ) {
      await pool.query(`
        UPDATE users
        SET avatar_url=NULL
        WHERE id=$1
      `,[user.id]);

      redirect(res,"/profile");
      return;
    }

    // ------------------------------------------------------------
    // CLEAR BIO
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/clear-bio"
    ) {
      await pool.query(`
        UPDATE users
        SET bio=''
        WHERE id=$1
      `,[user.id]);

      redirect(res,"/profile-edit");
      return;
    }

    // ------------------------------------------------------------
    // ACCOUNT DEACTIVATE
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/account/deactivate"
    ) {
      const d = await readBody(req);

      const confirm =
        (d.get("confirm") || "").trim();

      if (confirm !== "DEACTIVATE") {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"confirmation_required"
        }));

        return;
      }

      await pool.query(`
        UPDATE users
        SET
          username=NULL,
          bio='',
          avatar_url=NULL
        WHERE id=$1
      `,[user.id]);

      await pool.query(`
        DELETE FROM sessions
        WHERE user_id=$1
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Set-Cookie":
          "sessionId=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
      });

      res.end(JSON.stringify({
        ok:true,
        deactivated:true
      }));

      return;
    }

    // ------------------------------------------------------------
    // USER BLOCK
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/block"
    ) {
      const d = await readBody(req);

      const blockedId =
        Number(d.get("user_id"));

      if (
        !Number.isInteger(blockedId) ||
        blockedId <= 0 ||
        blockedId === user.id
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_user"
        }));

        return;
      }

      await pool.query(`
        INSERT INTO blocked_users(
          blocker_id,
          blocked_id
        )
        VALUES($1,$2)
        ON CONFLICT DO NOTHING
      `,[user.id,blockedId]);

      await pool.query(`
        DELETE FROM follows
        WHERE
          (
            follower_id=$1
            AND following_id=$2
          )
          OR
          (
            follower_id=$2
            AND following_id=$1
          )
      `,[user.id,blockedId]);

      await pool.query(`
        DELETE FROM follow_requests
        WHERE
          (
            requester_id=$1
            AND target_id=$2
          )
          OR
          (
            requester_id=$2
            AND target_id=$1
          )
      `,[user.id,blockedId]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok:true,
        blocked:true
      }));

      return;
    }

    // ------------------------------------------------------------
    // USER UNBLOCK
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/unblock"
    ) {
      const d = await readBody(req);

      const blockedId =
        Number(d.get("user_id"));

      if (
        !Number.isInteger(blockedId) ||
        blockedId <= 0
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_user"
        }));

        return;
      }

      await pool.query(`
        DELETE FROM blocked_users
        WHERE
          blocker_id=$1
          AND blocked_id=$2
      `,[user.id,blockedId]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok:true,
        blocked:false
      }));

      return;
    }

    // ------------------------------------------------------------
    // CLEAN EXPIRED STORIES
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/cleanup-stories"
    ) {
      const result = await pool.query(`
        DELETE FROM stories
        WHERE expires_at <= NOW()
        RETURNING id
      `);

      sendPage(
        res,
        "پاکسازی استوری",
        `
        <div class="container">
          <div class="card">
            تعداد استوری‌های حذف‌شده:
            <strong>${result.rowCount}</strong>
          </div>
        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // CLEAN OLD NOTIFICATIONS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/cleanup-notifications"
    ) {
      const result = await pool.query(`
        DELETE FROM notifications
        WHERE
          created_at < NOW() - INTERVAL '90 days'
        RETURNING id
      `);

      sendPage(
        res,
        "پاکسازی اعلان‌ها",
        `
        <div class="container">
          <div class="card">
            پاکسازی انجام شد.
            <br>
            تعداد حذف‌شده:
            <strong>${result.rowCount}</strong>
          </div>
        </div>
        `
      );

      return;
              }   // ============================================================
    // SECTION 14
    // GROUPS / CHANNELS / BUSINESS PAGES
    // ============================================================

    // ------------------------------------------------------------
    // GROUPS LIST
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/groups"
    ) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS groups (
          id SERIAL PRIMARY KEY,
          owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(120) NOT NULL,
          description TEXT DEFAULT '',
          avatar_url TEXT,
          is_private BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS group_members (
          id SERIAL PRIMARY KEY,
          group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL DEFAULT 'member',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(group_id,user_id)
        )
      `);

      const groups = await pool.query(`
        SELECT
          g.id,
          g.name,
          g.description,
          g.avatar_url,
          g.is_private,
          g.created_at,
          u.name AS owner_name,
          (
            SELECT COUNT(*)
            FROM group_members gm
            WHERE gm.group_id=g.id
          ) AS members
        FROM groups g
        JOIN users u
          ON u.id=g.owner_id
        WHERE
          g.is_private=FALSE
          OR EXISTS(
            SELECT 1
            FROM group_members gm2
            WHERE
              gm2.group_id=g.id
              AND gm2.user_id=$1
          )
        ORDER BY g.created_at DESC
        LIMIT 100
      `,[user.id]);

      sendPage(
        res,
        "گروه‌ها",
        `
        <div class="container">

          <h1>👥 گروه‌ها</h1>

          <div class="card">
            <form method="POST" action="/group-create">

              <input
                name="name"
                placeholder="نام گروه"
                maxlength="120"
                required
              >

              <textarea
                name="description"
                placeholder="توضیحات گروه"
                maxlength="1000"
              ></textarea>

              <label>
                <input
                  type="checkbox"
                  name="is_private"
                  value="1"
                >
                گروه خصوصی
              </label>

              <button type="submit">
                ایجاد گروه
              </button>

            </form>
          </div>

          ${
            groups.rows.map(g => `
              <div class="card">

                <h3>
                  <a href="/group?id=${g.id}">
                    ${escapeHtml(g.name)}
                  </a>
                </h3>

                <p>
                  ${escapeHtml(g.description || "")}
                </p>

                <small class="muted">
                  ${g.members} عضو
                  • سازنده:
                  ${escapeHtml(g.owner_name)}
                </small>

              </div>
            `).join("")
          }

        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // CREATE GROUP
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/group-create"
    ) {
      const d = await readBody(req);

      const name =
        (d.get("name") || "").trim();

      const description =
        (d.get("description") || "").trim();

      const isPrivate =
        d.get("is_private") === "1";

      if (!name) {
        redirect(res,"/groups");
        return;
      }

      const group = await pool.query(`
        INSERT INTO groups(
          owner_id,
          name,
          description,
          is_private
        )
        VALUES($1,$2,$3,$4)
        RETURNING id
      `,[
        user.id,
        name.slice(0,120),
        description.slice(0,1000),
        isPrivate
      ]);

      await pool.query(`
        INSERT INTO group_members(
          group_id,
          user_id,
          role
        )
        VALUES($1,$2,'owner')
        ON CONFLICT DO NOTHING
      `,[
        group.rows[0].id,
        user.id
      ]);

      redirect(
        res,
        `/group?id=${group.rows[0].id}`
      );

      return;
    }

    // ------------------------------------------------------------
    // GROUP PAGE
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/group"
    ) {
      const groupId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(groupId) ||
        groupId <= 0
      ) {
        redirect(res,"/groups");
        return;
      }

      const group = await pool.query(`
        SELECT
          g.*,
          u.name AS owner_name
        FROM groups g
        JOIN users u
          ON u.id=g.owner_id
        WHERE g.id=$1
      `,[groupId]);

      if (!group.rows.length) {
        redirect(res,"/groups");
        return;
      }

      const g = group.rows[0];

      const membership = await pool.query(`
        SELECT role
        FROM group_members
        WHERE
          group_id=$1
          AND user_id=$2
        LIMIT 1
      `,[groupId,user.id]);

      if (
        g.is_private &&
        !membership.rows.length
      ) {
        sendPage(
          res,
          "گروه خصوصی",
          `
          <div class="container">
            <div class="card">
              <h2>🔒 گروه خصوصی</h2>
              <p>
                برای مشاهده این گروه باید عضو آن باشید.
              </p>
            </div>
          </div>
          `
        );

        return;
      }

      const members = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.username,
          u.avatar_url,
          gm.role
        FROM group_members gm
        JOIN users u
          ON u.id=gm.user_id
        WHERE gm.group_id=$1
        ORDER BY gm.created_at ASC
        LIMIT 200
      `,[groupId]);

      sendPage(
        res,
        g.name,
        `
        <div class="container">

          <div class="card">

            <h1>
              👥 ${escapeHtml(g.name)}
            </h1>

            <p>
              ${escapeHtml(g.description || "")}
            </p>

            <small class="muted">
              سازنده:
              ${escapeHtml(g.owner_name)}
            </small>

            <div style="margin-top:15px">

              ${
                membership.rows.length
                  ? `
                    <a
                      class="button"
                      href="/group-leave?id=${g.id}"
                    >
                      ترک گروه
                    </a>
                  `
                  : `
                    <a
                      class="button"
                      href="/group-join?id=${g.id}"
                    >
                      عضویت در گروه
                    </a>
                  `
              }

            </div>

          </div>

          <div class="card">

            <h2>اعضا</h2>

            ${
              members.rows.map(m => `
                <div
                  style="
                    display:flex;
                    align-items:center;
                    gap:10px;
                    padding:8px 0;
                  "
                >

                  ${
                    m.avatar_url
                      ? `
                        <img
                          src="${safeUrl(m.avatar_url)}"
                          style="
                            width:42px;
                            height:42px;
                            border-radius:50%;
                            object-fit:cover;
                          "
                        >
                      `
                      : `<div class="avatar">👤</div>`
                  }

                  <div>
                    <strong>
                      ${escapeHtml(m.name)}
                    </strong>

                    ${
                      m.username
                        ? `
                          <div class="muted">
                            @${escapeHtml(m.username)}
                          </div>
                        `
                        : ""
                    }

                    <small class="muted">
                      ${escapeHtml(m.role)}
                    </small>
                  </div>

                </div>
              `).join("")
            }

          </div>

        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // JOIN GROUP
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/group-join"
    ) {
      const groupId =
        Number(url.searchParams.get("id"));

      if (
        Number.isInteger(groupId) &&
        groupId > 0
      ) {
        const group = await pool.query(`
          SELECT
            id,
            is_private
          FROM groups
          WHERE id=$1
        `,[groupId]);

        if (
          group.rows.length &&
          !group.rows[0].is_private
        ) {
          await pool.query(`
            INSERT INTO group_members(
              group_id,
              user_id,
              role
            )
            VALUES($1,$2,'member')
            ON CONFLICT DO NOTHING
          `,[groupId,user.id]);
        }
      }

      redirect(
        res,
        `/group?id=${groupId}`
      );

      return;
    }

    // ------------------------------------------------------------
    // LEAVE GROUP
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/group-leave"
    ) {
      const groupId =
        Number(url.searchParams.get("id"));

      if (
        Number.isInteger(groupId) &&
        groupId > 0
      ) {
        const owner = await pool.query(`
          SELECT owner_id
          FROM groups
          WHERE id=$1
        `,[groupId]);

        if (
          owner.rows.length &&
          owner.rows[0].owner_id !== user.id
        ) {
          await pool.query(`
            DELETE FROM group_members
            WHERE
              group_id=$1
              AND user_id=$2
          `,[groupId,user.id]);
        }
      }

      redirect(res,"/groups");
      return;
    }

    // ------------------------------------------------------------
    // CHANNELS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/channels"
    ) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS channels (
          id SERIAL PRIMARY KEY,
          owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(120) NOT NULL,
          username VARCHAR(80) UNIQUE,
          description TEXT DEFAULT '',
          avatar_url TEXT,
          is_private BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS channel_members (
          id SERIAL PRIMARY KEY,
          channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL DEFAULT 'subscriber',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(channel_id,user_id)
        )
      `);

      const channels = await pool.query(`
        SELECT
          c.id,
          c.name,
          c.username,
          c.description,
          c.avatar_url,
          c.created_at,
          (
            SELECT COUNT(*)
            FROM channel_members cm
            WHERE cm.channel_id=c.id
          ) AS members
        FROM channels c
        WHERE
          c.is_private=FALSE
          OR EXISTS(
            SELECT 1
            FROM channel_members cm2
            WHERE
              cm2.channel_id=c.id
              AND cm2.user_id=$1
          )
        ORDER BY c.created_at DESC
        LIMIT 100
      `,[user.id]);

      sendPage(
        res,
        "کانال‌ها",
        `
        <div class="container">

          <h1>📢 کانال‌ها</h1>

          <div class="card">

            <form method="POST" action="/channel-create">

              <input
                name="name"
                placeholder="نام کانال"
                maxlength="120"
                required
              >

              <input
                name="username"
                placeholder="نام کاربری کانال"
                maxlength="80"
              >

              <textarea
                name="description"
                placeholder="توضیحات"
                maxlength="1000"
              ></textarea>

              <button type="submit">
                ایجاد کانال
              </button>

            </form>

          </div>

          ${
            channels.rows.map(c => `
              <div class="card">

                <h3>
                  <a href="/channel?id=${c.id}">
                    ${escapeHtml(c.name)}
                  </a>
                </h3>

                ${
                  c.username
                    ? `
                      <div class="muted">
                        @${escapeHtml(c.username)}
                      </div>
                    `
                    : ""
                }

                <p>
                  ${escapeHtml(c.description || "")}
                </p>

                <small class="muted">
                  ${c.members} مشترک
                </small>

              </div>
            `).join("")
          }

        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // CREATE CHANNEL
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/channel-create"
    ) {
      const d = await readBody(req);

      const name =
        (d.get("name") || "").trim();

      const username =
        (d.get("username") || "")
          .trim()
          .replace(/^@/,"")
          .toLowerCase();

      const description =
        (d.get("description") || "").trim();

      if (!name) {
        redirect(res,"/channels");
        return;
      }

      try {
        const channel = await pool.query(`
          INSERT INTO channels(
            owner_id,
            name,
            username,
            description
          )
          VALUES(
            $1,
            $2,
            NULLIF($3,''),
            $4
          )
          RETURNING id
        `,[
          user.id,
          name.slice(0,120),
          username.slice(0,80),
          description.slice(0,1000)
        ]);

        await pool.query(`
          INSERT INTO channel_members(
            channel_id,
            user_id,
            role
          )
          VALUES($1,$2,'owner')
          ON CONFLICT DO NOTHING
        `,[
          channel.rows[0].id,
          user.id
        ]);

        redirect(
          res,
          `/channel?id=${channel.rows[0].id}`
        );

      } catch (err) {
        console.error(
          "CHANNEL CREATE ERROR:",
          err
        );

        redirect(res,"/channels");
      }

      return;
    }

    // ------------------------------------------------------------
    // CHANNEL PAGE
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/channel"
    ) {
      const channelId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(channelId) ||
        channelId <= 0
      ) {
        redirect(res,"/channels");
        return;
      }

      const channel = await pool.query(`
        SELECT
          c.*,
          u.name AS owner_name
        FROM channels c
        JOIN users u
          ON u.id=c.owner_id
        WHERE c.id=$1
      `,[channelId]);

      if (!channel.rows.length) {
        redirect(res,"/channels");
        return;
      }

      const c = channel.rows[0];

      const member = await pool.query(`
        SELECT role
        FROM channel_members
        WHERE
          channel_id=$1
          AND user_id=$2
        LIMIT 1
      `,[channelId,user.id]);

      if (
        c.is_private &&
        !member.rows.length
      ) {
        sendPage(
          res,
          "کانال خصوصی",
          `
          <div class="container">
            <div class="card">
              <h2>🔒 کانال خصوصی</h2>
              <p>
                برای مشاهده کانال باید مشترک باشید.
              </p>
            </div>
          </div>
          `
        );

        return;
      }

      sendPage(
        res,
        c.name,
        `
        <div class="container">

          <div class="card">

            <h1>
              📢 ${escapeHtml(c.name)}
            </h1>

            ${
              c.username
                ? `
                  <div class="muted">
                    @${escapeHtml(c.username)}
                  </div>
                `
                : ""
            }

            <p>
              ${escapeHtml(c.description || "")}
            </p>

            ${
              member.rows.length
                ? `
                  <a
                    class="button"
                    href="/channel-leave?id=${c.id}"
                  >
                    لغو اشتراک
                  </a>
                `
                : `
                  <a
                    class="button"
                    href="/channel-join?id=${c.id}"
                  >
                    عضویت در کانال
                  </a>
                `
            }

          </div>

        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // JOIN CHANNEL
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/channel-join"
    ) {
      const channelId =
        Number(url.searchParams.get("id"));

      if (
        Number.isInteger(channelId) &&
        channelId > 0
      ) {
        const channel = await pool.query(`
          SELECT
            id,
            is_private
          FROM channels
          WHERE id=$1
        `,[channelId]);

        if (
          channel.rows.length &&
          !channel.rows[0].is_private
        ) {
          await pool.query(`
            INSERT INTO channel_members(
              channel_id,
              user_id,
              role
            )
            VALUES($1,$2,'subscriber')
            ON CONFLICT DO NOTHING
          `,[channelId,user.id]);
        }
      }

      redirect(
        res,
        `/channel?id=${channelId}`
      );

      return;
    }

    // ------------------------------------------------------------
    // LEAVE CHANNEL
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/channel-leave"
    ) {
      const channelId =
        Number(url.searchParams.get("id"));

      if (
        Number.isInteger(channelId) &&
        channelId > 0
      ) {
        const owner = await pool.query(`
          SELECT owner_id
          FROM channels
          WHERE id=$1
        `,[channelId]);

        if (
          owner.rows.length &&
          owner.rows[0].owner_id !== user.id
        ) {
          await p// ============================================================
// SECTION 15
// GROUPS / CHANNELS / BUSINESS MANAGEMENT
// POLLS / EVENTS / BADGES / REWARDS
// CALL SIGNALING
// ============================================================


// ------------------------------------------------------------
// GROUP EDIT
// ------------------------------------------------------------

if (req.method === "POST" && path === "/group-edit") {

  const d = await readBody(req);

  const groupId = Number(d.get("group_id"));
  const name = (d.get("name") || "").trim();
  const description = (d.get("description") || "").trim();

  if (
    !Number.isInteger(groupId) ||
    groupId <= 0 ||
    !name
  ) {
    redirect(res, "/groups");
    return;
  }

  const owner = await pool.query(`
    SELECT id
    FROM groups
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `, [groupId, user.id]);

  if (owner.rows.length) {

    await pool.query(`
      UPDATE groups
      SET
        name=$1,
        description=$2
      WHERE id=$3
    `, [
      name.slice(0,100),
      description.slice(0,1000),
      groupId
    ]);
  }

  redirect(res, `/group?id=${groupId}`);
  return;
}


// ------------------------------------------------------------
// GROUP DELETE
// ------------------------------------------------------------

if (req.method === "GET" && path === "/group-delete") {

  const groupId = Number(
    url.searchParams.get("id")
  );

  if (
    Number.isInteger(groupId) &&
    groupId > 0
  ) {

    await pool.query(`
      DELETE FROM groups
      WHERE id=$1
        AND owner_id=$2
    `, [
      groupId,
      user.id
    ]);
  }

  redirect(res, "/groups");
  return;
}


// ------------------------------------------------------------
// GROUP REMOVE MEMBER
// ------------------------------------------------------------

if (req.method === "GET" && path === "/group-remove-member") {

  const groupId = Number(
    url.searchParams.get("group_id")
  );

  const memberId = Number(
    url.searchParams.get("user_id")
  );

  if (
    Number.isInteger(groupId) &&
    Number.isInteger(memberId) &&
    groupId > 0 &&
    memberId > 0
  ) {

    const owner = await pool.query(`
      SELECT id
      FROM groups
      WHERE id=$1
        AND owner_id=$2
      LIMIT 1
    `, [
      groupId,
      user.id
    ]);

    if (owner.rows.length) {

      await pool.query(`
        DELETE FROM group_members
        WHERE group_id=$1
          AND user_id=$2
      `, [
        groupId,
        memberId
      ]);
    }
  }

  redirect(res, `/group?id=${groupId}`);
  return;
}


// ------------------------------------------------------------
// GROUP POSTS TABLE
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS group_posts (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_group_posts_group
  ON group_posts(group_id, created_at DESC)
`);


// ------------------------------------------------------------
// CREATE GROUP POST
// ------------------------------------------------------------

if (req.method === "POST" && path === "/group-post") {

  const d = await readBody(req);

  const groupId = Number(
    d.get("group_id")
  );

  const content =
    (d.get("content") || "").trim();

  if (
    !Number.isInteger(groupId) ||
    groupId <= 0 ||
    !content
  ) {
    redirect(res, `/group?id=${groupId}`);
    return;
  }

  const member = await pool.query(`
    SELECT 1
    FROM group_members
    WHERE group_id=$1
      AND user_id=$2
    LIMIT 1
  `, [
    groupId,
    user.id
  ]);

  if (member.rows.length) {

    await pool.query(`
      INSERT INTO group_posts(
        group_id,
        user_id,
        content
      )
      VALUES($1,$2,$3)
    `, [
      groupId,
      user.id,
      content.slice(0,5000)
    ]);
  }

  redirect(res, `/group?id=${groupId}`);
  return;
}


// ------------------------------------------------------------
// DELETE GROUP POST
// ------------------------------------------------------------

if (req.method === "GET" && path === "/group-post-delete") {

  const postId = Number(
    url.searchParams.get("id")
  );

  if (
    Number.isInteger(postId) &&
    postId > 0
  ) {

    await pool.query(`
      DELETE FROM group_posts gp
      USING groups g
      WHERE gp.id=$1
        AND gp.group_id=g.id
        AND (
          gp.user_id=$2
          OR g.owner_id=$2
        )
    `, [
      postId,
      user.id
    ]);
  }

  redirect(res, "/groups");
  return;
}


// ------------------------------------------------------------
// CHANNEL EDIT
// ------------------------------------------------------------

if (req.method === "POST" && path === "/channel-edit") {

  const d = await readBody(req);

  const channelId = Number(
    d.get("channel_id")
  );

  const name =
    (d.get("name") || "").trim();

  const description =
    (d.get("description") || "").trim();

  if (
    !Number.isInteger(channelId) ||
    channelId <= 0 ||
    !name
  ) {
    redirect(res, "/channels");
    return;
  }

  await pool.query(`
    UPDATE channels
    SET
      name=$1,
      description=$2
    WHERE id=$3
      AND owner_id=$4
  `, [
    name.slice(0,100),
    description.slice(0,1000),
    channelId,
    user.id
  ]);

  redirect(res, `/channel?id=${channelId}`);
  return;
}


// ------------------------------------------------------------
// CHANNEL DELETE
// ------------------------------------------------------------

if (req.method === "GET" && path === "/channel-delete") {

  const channelId = Number(
    url.searchParams.get("id")
  );

  if (
    Number.isInteger(channelId) &&
    channelId > 0
  ) {

    await pool.query(`
      DELETE FROM channels
      WHERE id=$1
        AND owner_id=$2
    `, [
      channelId,
      user.id
    ]);
  }

  redirect(res, "/channels");
  return;
}


// ------------------------------------------------------------
// CHANNEL POSTS
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS channel_posts (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_channel_posts_channel
  ON channel_posts(channel_id, created_at DESC)
`);


// ------------------------------------------------------------
// CREATE CHANNEL POST
// ------------------------------------------------------------

if (req.method === "POST" && path === "/channel-post") {

  const d = await readBody(req);

  const channelId = Number(
    d.get("channel_id")
  );

  const content =
    (d.get("content") || "").trim();

  if (
    !Number.isInteger(channelId) ||
    channelId <= 0 ||
    !content
  ) {
    redirect(res, `/channel?id=${channelId}`);
    return;
  }

  const owner = await pool.query(`
    SELECT id
    FROM channels
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `, [
    channelId,
    user.id
  ]);

  if (owner.rows.length) {

    await pool.query(`
      INSERT INTO channel_posts(
        channel_id,
        user_id,
        content
      )
      VALUES($1,$2,$3)
    `, [
      channelId,
      user.id,
      content.slice(0,5000)
    ]);
  }

  redirect(res, `/channel?id=${channelId}`);
  return;
}


// ------------------------------------------------------------
// DELETE CHANNEL POST
// ------------------------------------------------------------

if (req.method === "GET" && path === "/channel-post-delete") {

  const postId = Number(
    url.searchParams.get("id")
  );

  if (
    Number.isInteger(postId) &&
    postId > 0
  ) {

    await pool.query(`
      DELETE FROM channel_posts cp
      USING channels c
      WHERE cp.id=$1
        AND cp.channel_id=c.id
        AND (
          cp.user_id=$2
          OR c.owner_id=$2
        )
    `, [
      postId,
      user.id
    ]);
  }

  redirect(res, "/channels");
  return;
}


// ------------------------------------------------------------
// BUSINESS PAGE EDIT
// ------------------------------------------------------------

if (req.method === "POST" && path === "/business-edit") {

  const d = await readBody(req);

  const pageId = Number(
    d.get("page_id")
  );

  const name =
    (d.get("name") || "").trim();

  const description =
    (d.get("description") || "").trim();

  const website =
    (d.get("website") || "").trim();

  if (
    !Number.isInteger(pageId) ||
    pageId <= 0 ||
    !name
  ) {
    redirect(res, "/business");
    return;
  }

  let safeWebsite = "";

  if (website) {
    try {
      const parsed = new URL(website);

      if (
        parsed.protocol === "http:" ||
        parsed.protocol === "https:"
      ) {
        safeWebsite = parsed.toString();
      }
    } catch {}
  }

  await pool.query(`
    UPDATE business_pages
    SET
      name=$1,
      description=$2,
      website=$3
    WHERE id=$4
      AND owner_id=$5
  `, [
    name.slice(0,120),
    description.slice(0,2000),
    safeWebsite,
    pageId,
    user.id
  ]);

  redirect(res, `/business-page?id=${pageId}`);
  return;
}


// ------------------------------------------------------------
// BUSINESS PAGE DELETE
// ------------------------------------------------------------

if (req.method === "GET" && path === "/business-delete") {

  const pageId = Number(
    url.searchParams.get("id")
  );

  if (
    Number.isInteger(pageId) &&
    pageId > 0
  ) {

    await pool.query(`
      DELETE FROM business_pages
      WHERE id=$1
        AND owner_id=$2
    `, [
      pageId,
      user.id
    ]);
  }

  redirect(res, "/business");
  return;
}


// ------------------------------------------------------------
// BUSINESS FOLLOWERS
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS business_followers (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES business_pages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(page_id,user_id)
  )
`);


// ------------------------------------------------------------
// BUSINESS FOLLOW / UNFOLLOW
// ------------------------------------------------------------

if (req.method === "GET" && path === "/business-follow") {

  const pageId = Number(
    url.searchParams.get("id")
  );

  if (
    Number.isInteger(pageId) &&
    pageId > 0
  ) {

    const exists = await pool.query(`
      SELECT 1
      FROM business_followers
      WHERE page_id=$1
        AND user_id=$2
      LIMIT 1
    `, [
      pageId,
      user.id
    ]);

    if (exists.rows.length) {

      await pool.query(`
        DELETE FROM business_followers
        WHERE page_id=$1
          AND user_id=$2
      `, [
        pageId,
        user.id
      ]);

    } else {

      await pool.query(`
        INSERT INTO business_followers(
          page_id,
          user_id
        )
        VALUES($1,$2)
        ON CONFLICT(page_id,user_id)
        DO NOTHING
      `, [
        pageId,
        user.id
      ]);
    }
  }

  redirect(res, `/business-page?id=${pageId}`);
  return;
}


// ------------------------------------------------------------
// POLLS
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS polls (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS poll_options (
    id SERIAL PRIMARY KEY,
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    votes INTEGER NOT NULL DEFAULT 0
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS poll_votes (
    id SERIAL PRIMARY KEY,
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(poll_id,user_id)
  )
`);


// ------------------------------------------------------------
// CREATE POLL
// ------------------------------------------------------------

if (req.method === "POST" && path === "/poll-create") {

  const d = await readBody(req);

  const question =
    (d.get("question") || "").trim();

  const option1 =
    (d.get("option1") || "").trim();

  const option2 =
    (d.get("option2") || "").trim();

  const option3 =
    (d.get("option3") || "").trim();

  const option4 =
    (d.get("option4") || "").trim();

  const options = [
    option1,
    option2,
    option3,
    option4
  ].filter(Boolean);

  if (
    !question ||
    options.length < 2
  ) {
    redirect(res, "/");
    return;
  }

  const poll = await pool.query(`
    INSERT INTO polls(
      user_id,
      question,
      expires_at
    )
    VALUES(
      $1,
      $2,
      NOW() + INTERVAL '7 days'
    )
    RETURNING id
  `, [
    user.id,
    question.slice(0,500)
  ]);

  for (const option of options) {

    await pool.query(`
      INSERT INTO poll_options(
        poll_id,
        option_text
      )
      VALUES($1,$2)
    `, [
      poll.rows[0].id,
      option.slice(0,200)
    ]);
  }

  redirect(res, "/");
  return;
}


// ------------------------------------------------------------
// VOTE POLL
// ------------------------------------------------------------

if (req.method === "GET" && path === "/poll-vote") {

  const pollId = Number(
    url.searchParams.get("poll_id")
  );

  const optionId = Number(
    url.searchParams.get("option_id")
  );

  if (
    Number.isInteger(pollId) &&
    pollId > 0 &&
    Number.isInteger(optionId) &&
    optionId > 0
  ) {

    const poll = await pool.query(`
      SELECT id
      FROM polls
      WHERE id=$1
        AND (
          expires_at IS NULL
          OR expires_at > NOW()
        )
      LIMIT 1
    `, [pollId]);

    const option = await pool.query(`
      SELECT id
      FROM poll_options
      WHERE id=$1
        AND poll_id=$2
      LIMIT 1
    `, [
      optionId,
      pollId
    ]);

    if (
      poll.rows.length &&
      option.rows.length
    ) {

      const inserted = await pool.query(`
        INSERT INTO poll_votes(
          poll_id,
          option_id,
          user_id
        )
        VALUES($1,$2,$3)
        ON CONFLICT(poll_id,user_id)
        DO NOTHING
        RETURNING id
      `, [
        pollId,
        optionId,
        user.id
      ]);

      if (inserted.rows.length) {

        await pool.query(`
          UPDATE poll_options
          SET votes=votes+1
          WHERE id=$1
        `, [optionId]);
      }
    }
  }

  redirect(res, "/");
  return;
}


// ------------------------------------------------------------
// POLL API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/poll"
) {

  const pollId = Number(
    url.searchParams.get("id")
  );

  if (
    !Number.isInteger(pollId) ||
    pollId <= 0
  ) {
    sendJson(res, {
      ok:false,
      error:"invalid_poll"
    }, 400);
    return;
  }

  const poll = await pool.query(`
    SELECT
      p.id,
      p.question,
      p.expires_at,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id',o.id,
            'text',o.option_text,
            'votes',o.votes
          )
          ORDER BY o.id
        ),
        '[]'::json
      ) AS options
    FROM polls p
    LEFT JOIN poll_options o
      ON o.poll_id=p.id
    WHERE p.id=$1
    GROUP BY
      p.id,
      p.question,
      p.expires_at
  `, [pollId]);

  if (!poll.rows.length) {

    sendJson(res, {
      ok:false,
      error:"not_found"
    }, 404);

    return;
  }

  sendJson(res, {
    ok:true,
    poll:poll.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// EVENTS
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    event_date TIMESTAMP NOT NULL,
    location VARCHAR(300),
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS event_attendees (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'going',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(event_id,user_id)
  )
`);


// ------------------------------------------------------------
// CREATE EVENT
// ------------------------------------------------------------

if (req.method === "POST" && path === "/event-create") {

  const d = await readBody(req);

  const title =
    (d.get("title") || "").trim();

  const description =
    (d.get("description") || "").trim();

  const dateText =
    (d.get("event_date") || "").trim();

  const location =
    (d.get("location") || "").trim();

  const eventDate =
    new Date(dateText);

  if (
    !title ||
    !dateText ||
    Number.isNaN(eventDate.getTime())
  ) {
    redirect(res, "/");
    return;
  }

  await pool.query(`
    INSERT INTO events(
      user_id,
      title,
      description,
      event_date,
      location
    )
    VALUES($1,$2,$3,$4,$5)
  `, [
    user.id,
    title.slice(0,200),
    description.slice(0,3000),
    eventDate,
    location.slice(0,300)
  ]);

  redirect(res, "/");
  return;
}


// ------------------------------------------------------------
// EVENT ATTEND
// ------------------------------------------------------------

if (req.method === "GET" && path === "/event-attend") {

  const eventId = Number(
    url.searchParams.get("id")
  );

  if (
    Number.isInteger(eventId) &&
    eventId > 0
  ) {

    const exists = await pool.query(`
      SELECT 1
      FROM event_attendees
      WHERE event_id=$1
        AND user_id=$2
      LIMIT 1
    `, [
      eventId,
      user.id
    ]);

    if (exists.rows.length) {

      await pool.query(`
        DELETE FROM event_attendees
        WHERE event_id=$1
          AND user_id=$2
      `, [
        eventId,
        user.id
      ]);

    } else {

      await pool.query(`
        INSERT INTO event_attendees(
          event_id,
          user_id,
          status
        )
        VALUES($1,$2,'going')
        ON CONFLICT(event_id,user_id)
        DO UPDATE
        SET status='going'
      `, [
        eventId,
        user.id
      ]);
    }
  }

  redirect(res, "/");
  return;
}


// ------------------------------------------------------------
// BADGES
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS badges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS user_badges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id,badge_id)
  )
`);


// ------------------------------------------------------------
// SEED DEFAULT BADGES
// ------------------------------------------------------------

const badgeSeed = [
  [
    "عضو قدیمی",
    "برای  // ============================================================
// SECTION 16
// GROUPS / CHANNELS / BUSINESS ADVANCED FEATURES
// MODERATION / MEMBERS / ADMIN CONTROLS
// EVENTS / POLLS / REWARDS APIs
// ============================================================


// ------------------------------------------------------------
// GROUP MEMBERS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/group/members"
) {

  const groupId = Number(
    url.searchParams.get("group_id")
  );

  if (
    !Number.isInteger(groupId) ||
    groupId <= 0
  ) {
    sendJson(res, {
      ok:false,
      error:"invalid_group"
    },400);
    return;
  }

  const members = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      gm.role,
      gm.created_at
    FROM group_members gm
    JOIN users u
      ON u.id=gm.user_id
    WHERE gm.group_id=$1
    ORDER BY gm.created_at ASC
  `,[groupId]);

  sendJson(res,{
    ok:true,
    members:members.rows
  });

  return;
}


// ------------------------------------------------------------
// GROUP PROMOTE MEMBER
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/group/promote"
) {

  const d = await readBody(req);

  const groupId =
    Number(d.get("group_id"));

  const memberId =
    Number(d.get("user_id"));

  if (
    !Number.isInteger(groupId) ||
    !Number.isInteger(memberId) ||
    groupId <= 0 ||
    memberId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);

    return;
  }

  const owner = await pool.query(`
    SELECT id
    FROM groups
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `,[
    groupId,
    user.id
  ]);

  if (!owner.rows.length) {

    sendJson(res,{
      ok:false,
      error:"not_allowed"
    },403);

    return;
  }

  await pool.query(`
    UPDATE group_members
    SET role='admin'
    WHERE group_id=$1
      AND user_id=$2
  `,[
    groupId,
    memberId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// GROUP DEMOTE MEMBER
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/group/demote"
) {

  const d = await readBody(req);

  const groupId =
    Number(d.get("group_id"));

  const memberId =
    Number(d.get("user_id"));

  if (
    !Number.isInteger(groupId) ||
    !Number.isInteger(memberId) ||
    groupId <= 0 ||
    memberId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);

    return;
  }

  const owner = await pool.query(`
    SELECT id
    FROM groups
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `,[
    groupId,
    user.id
  ]);

  if (!owner.rows.length) {

    sendJson(res,{
      ok:false,
      error:"not_allowed"
    },403);

    return;
  }

  await pool.query(`
    UPDATE group_members
    SET role='member'
    WHERE group_id=$1
      AND user_id=$2
      AND user_id <> (
        SELECT owner_id
        FROM groups
        WHERE id=$1
      )
  `,[
    groupId,
    memberId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// CHANNEL MEMBERS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/channel/members"
) {

  const channelId = Number(
    url.searchParams.get("channel_id")
  );

  if (
    !Number.isInteger(channelId) ||
    channelId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_channel"
    },400);

    return;
  }

  const members = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      cm.role,
      cm.created_at
    FROM channel_members cm
    JOIN users u
      ON u.id=cm.user_id
    WHERE cm.channel_id=$1
    ORDER BY cm.created_at ASC
  `,[channelId]);

  sendJson(res,{
    ok:true,
    members:members.rows
  });

  return;
}


// ------------------------------------------------------------
// CHANNEL PROMOTE MEMBER
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/channel/promote"
) {

  const d = await readBody(req);

  const channelId =
    Number(d.get("channel_id"));

  const memberId =
    Number(d.get("user_id"));

  if (
    !Number.isInteger(channelId) ||
    !Number.isInteger(memberId) ||
    channelId <= 0 ||
    memberId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);

    return;
  }

  const owner = await pool.query(`
    SELECT id
    FROM channels
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `,[
    channelId,
    user.id
  ]);

  if (!owner.rows.length) {

    sendJson(res,{
      ok:false,
      error:"not_allowed"
    },403);

    return;
  }

  await pool.query(`
    UPDATE channel_members
    SET role='admin'
    WHERE channel_id=$1
      AND user_id=$2
  `,[
    channelId,
    memberId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// CHANNEL REMOVE MEMBER
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/channel/remove-member"
) {

  const d = await readBody(req);

  const channelId =
    Number(d.get("channel_id"));

  const memberId =
    Number(d.get("user_id"));

  if (
    !Number.isInteger(channelId) ||
    !Number.isInteger(memberId) ||
    channelId <= 0 ||
    memberId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);

    return;
  }

  const owner = await pool.query(`
    SELECT id
    FROM channels
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `,[
    channelId,
    user.id
  ]);

  if (!owner.rows.length) {

    sendJson(res,{
      ok:false,
      error:"not_allowed"
    },403);

    return;
  }

  await pool.query(`
    DELETE FROM channel_members
    WHERE channel_id=$1
      AND user_id=$2
  `,[
    channelId,
    memberId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// BUSINESS PAGE FOLLOWERS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/business/followers"
) {

  const pageId = Number(
    url.searchParams.get("id")
  );

  if (
    !Number.isInteger(pageId) ||
    pageId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_page"
    },400);

    return;
  }

  const followers = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      bf.created_at
    FROM business_followers bf
    JOIN users u
      ON u.id=bf.user_id
    WHERE bf.page_id=$1
    ORDER BY bf.created_at DESC
    LIMIT 500
  `,[pageId]);

  sendJson(res,{
    ok:true,
    followers:followers.rows
  });

  return;
}


// ------------------------------------------------------------
// BUSINESS PAGE ANALYTICS TABLE
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS business_events (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL
      REFERENCES business_pages(id)
      ON DELETE CASCADE,
    user_id INTEGER
      REFERENCES users(id)
      ON DELETE SET NULL,
    event_type VARCHAR(40) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_business_events_page
  ON business_events(page_id,event_type,created_at DESC)
`);


// ------------------------------------------------------------
// BUSINESS PAGE EVENT
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/business/event"
) {

  const d = await readBody(req);

  const pageId =
    Number(d.get("page_id"));

  const eventType =
    (d.get("event_type") || "").trim();

  const allowedEvents = [
    "view",
    "contact",
    "website",
    "follow",
    "message"
  ];

  if (
    !Number.isInteger(pageId) ||
    pageId <= 0 ||
    !allowedEvents.includes(eventType)
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_event"
    },400);

    return;
  }

  const page = await pool.query(`
    SELECT id
    FROM business_pages
    WHERE id=$1
    LIMIT 1
  `,[pageId]);

  if (!page.rows.length) {

    sendJson(res,{
      ok:false,
      error:"page_not_found"
    },404);

    return;
  }

  await pool.query(`
    INSERT INTO business_events(
      page_id,
      user_id,
      event_type
    )
    VALUES($1,$2,$3)
  `,[
    pageId,
    user.id,
    eventType
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// BUSINESS ANALYTICS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/business-analytics"
) {

  const pageId = Number(
    url.searchParams.get("id")
  );

  if (
    !Number.isInteger(pageId) ||
    pageId <= 0
  ) {
    redirect(res,"/business");
    return;
  }

  const owner = await pool.query(`
    SELECT id,name
    FROM business_pages
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `,[
    pageId,
    user.id
  ]);

  if (!owner.rows.length) {

    sendPage(
      res,
      "دسترسی غیرمجاز",
      `
        <div class="card">
          <h2>⛔ دسترسی غیرمجاز</h2>
        </div>
      `
    );

    return;
  }

  const stats = await pool.query(`
    SELECT
      event_type,
      COUNT(*)::INTEGER AS count
    FROM business_events
    WHERE page_id=$1
    GROUP BY event_type
    ORDER BY count DESC
  `,[pageId]);

  const followers = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM business_followers
    WHERE page_id=$1
  `,[pageId]);

  sendPage(
    res,
    "آمار کسب‌وکار",
    `
      <div class="card">
        <h2>
          📊 آمار ${escapeHtml(owner.rows[0].name)}
        </h2>

        <p>
          دنبال‌کنندگان:
          <strong>${followers.rows[0].count}</strong>
        </p>

        ${
          stats.rows.map(s => `
            <div class="card">
              <strong>
                ${escapeHtml(s.event_type)}
              </strong>
              :
              ${s.count}
            </div>
          `).join("")
        }
      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// EVENTS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/events"
) {

  const rows = await pool.query(`
    SELECT
      e.id,
      e.title,
      e.description,
      e.event_date,
      e.location,
      e.user_id,
      u.name AS creator_name,
      COUNT(ea.id)::INTEGER AS attendees
    FROM events e
    JOIN users u
      ON u.id=e.user_id
    LEFT JOIN event_attendees ea
      ON ea.event_id=e.id
    WHERE e.event_date >= NOW()
    GROUP BY
      e.id,
      u.name
    ORDER BY e.event_date ASC
    LIMIT 100
  `);

  sendJson(res,{
    ok:true,
    events:rows.rows
  });

  return;
}


// ------------------------------------------------------------
// EVENT DETAILS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/event"
) {

  const eventId = Number(
    url.searchParams.get("id")
  );

  if (
    !Number.isInteger(eventId) ||
    eventId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_event"
    },400);

    return;
  }

  const event = await pool.query(`
    SELECT
      e.id,
      e.title,
      e.description,
      e.event_date,
      e.location,
      e.user_id,
      u.name AS creator_name
    FROM events e
    JOIN users u
      ON u.id=e.user_id
    WHERE e.id=$1
    LIMIT 1
  `,[eventId]);

  if (!event.rows.length) {

    sendJson(res,{
      ok:false,
      error:"not_found"
    },404);

    return;
  }

  const attendees = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      ea.status
    FROM event_attendees ea
    JOIN users u
      ON u.id=ea.user_id
    WHERE ea.event_id=$1
    ORDER BY ea.created_at ASC
  `,[eventId]);

  sendJson(res,{
    ok:true,
    event:event.rows[0],
    attendees:attendees.rows
  });

  return;
}


// ------------------------------------------------------------
// POLL LIST API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/polls"
) {

  const rows = await pool.query(`
    SELECT
      p.id,
      p.question,
      p.expires_at,
      p.created_at,
      u.id AS user_id,
      u.name AS user_name,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id',po.id,
            'text',po.option_text,
            'votes',po.votes
          )
          ORDER BY po.id
        ),
        '[]'::json
      ) AS options
    FROM polls p
    JOIN users u
      ON u.id=p.user_id
    LEFT JOIN poll_options po
      ON po.poll_id=p.id
    WHERE
      p.expires_at IS NULL
      OR p.expires_at > NOW()
    GROUP BY
      p.id,
      u.id
    ORDER BY p.created_at DESC
    LIMIT 100
  `);

  sendJson(res,{
    ok:true,
    polls:rows.rows
  });

  return;
}


// ------------------------------------------------------------
// REWARD POINTS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/rewards"
) {

  const points = await pool.query(`
    SELECT points
    FROM user_points
    WHERE user_id=$1
  `,[user.id]);

  const rewards = await pool.query(`
    SELECT
      r.id,
      r.name,
      r.description,
      r.points,
      EXISTS(
        SELECT 1
        FROM user_rewards ur
        WHERE ur.user_id=$1
          AND ur.reward_id=r.id
      ) AS claimed
    FROM rewards r
    ORDER BY r.points ASC
  `,[user.id]);

  sendJson(res,{
    ok:true,
    points:Number(points.rows[0]?.points || 0),
    rewards:rewards.rows
  });

  return;
}


// ------------------------------------------------------------
// ADD USER POINTS
// INTERNAL SAFE SYSTEM EVENT
// ------------------------------------------------------------

async function addUserPoints(userId, amount) {

  const safeAmount =
    Math.max(
      0,
      Math.min(
        Number(amount) || 0,
        100
      )
    );

  if (
    !Number.isInteger(userId) ||
    userId <= 0 ||
    safeAmount <= 0
  ) {
    return;
  }

  await pool.query(`
    INSERT INTO user_points(
      user_id,
      points
    )
    VALUES($1,$2)
    ON CONFLICT(user_id)
    DO UPDATE SET
      points=user_points.points + EXCLUDED.points,
      updated_at=NOW()
  `,[
    userId,
    safeAmount
  ]);
}


// ------------------------------------------------------------
// AUTOMATIC REWARD FOR FIRST POST
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/reward/post-created"
) {

  const count = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM posts
    WHERE user_id=$1
  `,[user.id]);

  if (
    Number(count.rows[0].count) === 1
  ) {

    await addUserPoints(
      user.id,
      10
    );
  }

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// CALL CLEANUP
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/call/cleanup"
) {

  await pool.query(`
    UPDATE calls
    SET
      status='ended',
      ended_at=NOW()
    WHERE status IN('ringing','active')
      AND created_at < NOW() - INTERVAL '2 hours'
  `);

  await pool.query(`
    DELETE FROM call_signals
    WHERE created_at < NOW() - INTERVAL '24 hours'
  `);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// EXPIRED DATA CLEANUP
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/system/cleanup"
) {

  await pool.query(`
    DELETE FROM stories
    WHERE expires_at <= NOW()
  `);

  await pool.query(`
    DELETE FROM call_signals
    WHERE created_at < NOW() - INTERVAL '24 hours'
  `);

  await pool.query(`
    DELETE FROM ad_events
    WHERE created_at < NOW() - INTERVAL '180 days'
  `);

  await pool.query(`
    DELETE FROM post_views
    WHERE viewed_at < NOW() - INTERVAL '365 days'
  `);

  sendJson(res,{
    ok:true,
    cleaned:true
  });

  return;
}


// ------------------------------------------------------------
// SYSTEM STATUS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/system/status"
) {

  const db = await pool.query(`
    SELECT NOW() AS server_time
  `);

  sendJson(res,{
    ok:true,
    service:"MySocial",
    status:"online",
    database:"connected",
    server_time:db.rows[0].server_time
  });

  return;
}// ============================================================
// SECTION 17
// ADVANCED POSTS / MENTIONS / HASHTAGS / SAVED CONTENT
// CONTENT MODERATION / USER RESTRICTIONS / REPORTING
// ============================================================


// ------------------------------------------------------------
// POST MENTIONS
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS post_mentions (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL
      REFERENCES posts(id) ON DELETE CASCADE,
    mentioned_user_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id,mentioned_user_id)
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_post_mentions_user
  ON post_mentions(mentioned_user_id,created_at DESC)
`);


// ------------------------------------------------------------
// STORY MENTIONS
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS story_mentions (
    id SERIAL PRIMARY KEY,
    story_id INTEGER NOT NULL
      REFERENCES stories(id) ON DELETE CASCADE,
    mentioned_user_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(story_id,mentioned_user_id)
  )
`);


// ------------------------------------------------------------
// REEL MENTIONS
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS reel_mentions (
    id SERIAL PRIMARY KEY,
    reel_id INTEGER NOT NULL
      REFERENCES reels(id) ON DELETE CASCADE,
    mentioned_user_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(reel_id,mentioned_user_id)
  )
`);


// ------------------------------------------------------------
// MENTION USER API
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/mention"
) {

  const d = await readBody(req);

  const type =
    (d.get("type") || "").trim();

  const contentId =
    Number(d.get("content_id"));

  const mentionedUserId =
    Number(d.get("user_id"));

  if (
    !["post","story","reel"].includes(type) ||
    !Number.isInteger(contentId) ||
    contentId <= 0 ||
    !Number.isInteger(mentionedUserId) ||
    mentionedUserId <= 0 ||
    mentionedUserId === user.id
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);

    return;
  }

  const target = await pool.query(`
    SELECT id
    FROM users
    WHERE id=$1
    LIMIT 1
  `,[mentionedUserId]);

  if (!target.rows.length) {

    sendJson(res,{
      ok:false,
      error:"user_not_found"
    },404);

    return;
  }

  if (type === "post") {

    const post = await pool.query(`
      SELECT id
      FROM posts
      WHERE id=$1
        AND user_id=$2
      LIMIT 1
    `,[
      contentId,
      user.id
    ]);

    if (post.rows.length) {

      await pool.query(`
        INSERT INTO post_mentions(
          post_id,
          mentioned_user_id
        )
        VALUES($1,$2)
        ON CONFLICT(post_id,mentioned_user_id)
        DO NOTHING
      `,[
        contentId,
        mentionedUserId
      ]);

      await notify(
        mentionedUserId,
        user.id,
        "mention",
        contentId,
        `${user.name} شما را در یک پست منشن کرد.`
      );
    }
  }

  if (type === "story") {

    const story = await pool.query(`
      SELECT id
      FROM stories
      WHERE id=$1
        AND user_id=$2
      LIMIT 1
    `,[
      contentId,
      user.id
    ]);

    if (story.rows.length) {

      await pool.query(`
        INSERT INTO story_mentions(
          story_id,
          mentioned_user_id
        )
        VALUES($1,$2)
        ON CONFLICT(story_id,mentioned_user_id)
        DO NOTHING
      `,[
        contentId,
        mentionedUserId
      ]);

      await notify(
        mentionedUserId,
        user.id,
        "mention",
        contentId,
        `${user.name} شما را در یک استوری منشن کرد.`
      );
    }
  }

  if (type === "reel") {

    const reel = await pool.query(`
      SELECT id
      FROM reels
      WHERE id=$1
        AND user_id=$2
      LIMIT 1
    `,[
      contentId,
      user.id
    ]);

    if (reel.rows.length) {

      await pool.query(`
        INSERT INTO reel_mentions(
          reel_id,
          mentioned_user_id
        )
        VALUES($1,$2)
        ON CONFLICT(reel_id,mentioned_user_id)
        DO NOTHING
      `,[
        contentId,
        mentionedUserId
      ]);

      await notify(
        mentionedUserId,
        user.id,
        "mention",
        contentId,
        `${user.name} شما را در یک ریل منشن کرد.`
      );
    }
  }

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// MY MENTIONS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/mentions"
) {

  const posts = await pool.query(`
    SELECT
      p.id,
      p.content,
      p.created_at,
      u.id AS user_id,
      u.name,
      u.username
    FROM post_mentions pm
    JOIN posts p
      ON p.id=pm.post_id
    JOIN users u
      ON u.id=p.user_id
    WHERE pm.mentioned_user_id=$1
    ORDER BY pm.created_at DESC
    LIMIT 100
  `,[user.id]);

  sendPage(
    res,
    "منشن‌های من",
    `
      <div class="card">
        <h2>🏷️ منشن‌های من</h2>

        ${
          posts.rows.length
          ? posts.rows.map(p => `
              <div class="card">
                <strong>
                  ${escapeHtml(p.name)}
                </strong>

                <p>
                  ${escapeHtml(p.content)}
                </p>

                <a
                  class="btn"
                  href="/post?id=${p.id}"
                >
                  مشاهده پست
                </a>
              </div>
            `).join("")
          : "<p>هنوز کسی شما را منشن نکرده است.</p>"
        }
      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// CONTENT MODERATION TABLE
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS moderation_actions (
    id SERIAL PRIMARY KEY,
    target_type VARCHAR(30) NOT NULL,
    target_id INTEGER NOT NULL,
    moderator_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(40) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_moderation_target
  ON moderation_actions(
    target_type,
    target_id,
    created_at DESC
  )
`);


// ------------------------------------------------------------
// HIDE POST
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/post/hide"
) {

  const d = await readBody(req);

  const postId =
    Number(d.get("post_id"));

  if (
    !Number.isInteger(postId) ||
    postId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_post"
    },400);

    return;
  }

  const post = await pool.query(`
    SELECT id
    FROM posts
    WHERE id=$1
    LIMIT 1
  `,[postId]);

  if (!post.rows.length) {

    sendJson(res,{
      ok:false,
      error:"post_not_found"
    },404);

    return;
  }

  await pool.query(`
    INSERT INTO moderation_actions(
      target_type,
      target_id,
      moderator_id,
      action,
      reason
    )
    VALUES(
      'post',
      $1,
      $2,
      'hide',
      'user_hidden'
    )
  `,[
    postId,
    user.id
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// USER CONTENT PREFERENCES
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS content_preferences (
    user_id INTEGER PRIMARY KEY
      REFERENCES users(id) ON DELETE CASCADE,
    sensitive_content VARCHAR(20)
      NOT NULL DEFAULT 'standard',
    autoplay BOOLEAN
      NOT NULL DEFAULT TRUE,
    show_suggested BOOLEAN
      NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT NOW()
  )
`);


// ------------------------------------------------------------
// CONTENT PREFERENCES PAGE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/content-preferences"
) {

  const settings = await pool.query(`
    SELECT
      sensitive_content,
      autoplay,
      show_suggested
    FROM content_preferences
    WHERE user_id=$1
  `,[user.id]);

  const s = settings.rows[0] || {
    sensitive_content:"standard",
    autoplay:true,
    show_suggested:true
  };

  sendPage(
    res,
    "تنظیمات محتوا",
    `
      <div class="card">
        <h2>⚙️ تنظیمات محتوا</h2>

        <form method="POST"
              action="/content-preferences">

          <label>محتوای حساس</label>

          <select name="sensitive_content">
            <option value="standard"
              ${s.sensitive_content==="standard"?"selected":""}>
              استاندارد
            </option>

            <option value="less"
              ${s.sensitive_content==="less"?"selected":""}>
              کمتر
            </option>
          </select>

          <label>
            پخش خودکار
          </label>

          <select name="autoplay">
            <option value="1"
              ${s.autoplay?"selected":""}>
              فعال
            </option>

            <option value="0"
              ${!s.autoplay?"selected":""}>
              غیرفعال
            </option>
          </select>

          <label>
            نمایش پیشنهادها
          </label>

          <select name="show_suggested">
            <option value="1"
              ${s.show_suggested?"selected":""}>
              فعال
            </option>

            <option value="0"
              ${!s.show_suggested?"selected":""}>
              غیرفعال
            </option>
          </select>

          <button class="btn">
            ذخیره تنظیمات
          </button>
        </form>
      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// SAVE CONTENT PREFERENCES
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/content-preferences"
) {

  const d = await readBody(req);

  const sensitive =
    d.get("sensitive_content") === "less"
      ? "less"
      : "standard";

  const autoplay =
    d.get("autoplay") === "1";

  const suggested =
    d.get("show_suggested") === "1";

  await pool.query(`
    INSERT INTO content_preferences(
      user_id,
      sensitive_content,
      autoplay,
      show_suggested
    )
    VALUES($1,$2,$3,$4)
    ON CONFLICT(user_id)
    DO UPDATE SET
      sensitive_content=EXCLUDED.sensitive_content,
      autoplay=EXCLUDED.autoplay,
      show_suggested=EXCLUDED.show_suggested,
      updated_at=NOW()
  `,[
    user.id,
    sensitive,
    autoplay,
    suggested
  ]);

  redirect(
    res,
    "/content-preferences"
  );

  return;
}


// ------------------------------------------------------------
// USER RESTRICTION STATUS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/user/restrictions"
) {

  const targetId =
    Number(url.searchParams.get("id"));

  if (
    !Number.isInteger(targetId) ||
    targetId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  const result = await pool.query(`
    SELECT
      EXISTS(
        SELECT 1
        FROM blocked_users
        WHERE blocker_id=$1
          AND blocked_id=$2
      ) AS blocked,

      EXISTS(
        SELECT 1
        FROM restrictions
        WHERE user_id=$1
          AND restricted_user_id=$2
      ) AS restricted,

      EXISTS(
        SELECT 1
        FROM mutes
        WHERE user_id=$1
          AND muted_user_id=$2
      ) AS muted
  `,[
    user.id,
    targetId
  ]);

  sendJson(res,{
    ok:true,
    restrictions:result.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// REPORT CONTENT API
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/report-content"
) {

  const d = await readBody(req);

  const targetType =
    (d.get("target_type") || "").trim();

  const targetId =
    Number(d.get("target_id"));

  const reason =
    (d.get("reason") || "").trim();

  const allowedTypes = [
    "post",
    "comment",
    "reel",
    "story",
    "user",
    "message",
    "group",
    "channel",
    "business"
  ];

  if (
    !allowedTypes.includes(targetType) ||
    !Number.isInteger(targetId) ||
    targetId <= 0 ||
    !reason
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_report"
    },400);

    return;
  }

  await pool.query(`
    INSERT INTO reports(
      reporter_id,
      target_type,
      target_id,
      reason,
      status
    )
    VALUES($1,$2,$3,$4,'pending')
  `,[
    user.id,
    targetType,
    targetId,
    reason.slice(0,1000)
  ]);

  sendJson(res,{
    ok:true,
    reported:true
  });

  return;
}


// ------------------------------------------------------------
// REPORT STATUS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/reports"
) {

  const rows = await pool.query(`
    SELECT
      id,
      target_type,
      target_id,
      reason,
      status,
      created_at
    FROM reports
    WHERE reporter_id=$1
    ORDER BY created_at DESC
    LIMIT 100
  `,[user.id]);

  sendJson(res,{
    ok:true,
    reports:rows.rows
  });

  return;
}


// ------------------------------------------------------------
// DELETE OWN REPORT
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/report/delete"
) {

  const d = await readBody(req);

  const reportId =
    Number(d.get("report_id"));

  if (
    !Number.isInteger(reportId) ||
    reportId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_report"
    },400);

    return;
  }

  await pool.query(`
    DELETE FROM reports
    WHERE id=$1
      AND reporter_id=$2
      AND status='pending'
  `,[
    reportId,
    user.id
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// SAVED POSTS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/saved"
) {

  const rows = await pool.query(`
    SELECT
      p.id,
      p.content,
      p.image_url,
      p.created_at,
      u.id AS user_id,
      u.name,
      u.username
    FROM bookmarks b
    JOIN posts p
      ON p.id=b.post_id
    JOIN users u
      ON u.id=p.user_id
    WHERE b.user_id=$1
      AND COALESCE(p.archived,FALSE)=FALSE
    ORDER BY b.created_at DESC
    LIMIT 200
  `,[user.id]);

  sendJson(res,{
    ok:true,
    posts:rows.rows
  });

  return;
}


// ------------------------------------------------------------
// REMOVE SAVED POST
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/saved/remove"
) {

  const d = await readBody(req);

  const postId =
    Number(d.get("post_id"));

  if (
    !Number.isInteger(postId) ||
    postId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_post"
    },400);

    return;
  }

  await pool.query(`
    DELETE FROM bookmarks
    WHERE user_id=$1
      AND post_id=$2
  `,[
    user.id,
    postId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// HASHTAG FOLLOWING
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS hashtag_follows (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,
    hashtag_id INTEGER NOT NULL
      REFERENCES hashtags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id,hashtag_id)
  )
`);


// ------------------------------------------------------------
// FOLLOW HASHTAG
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/hashtag-follow"
) {

  const hashtagId =
    Number(url.searchParams.get("id"));

  if (
    Number.isInteger(hashtagId) &&
    hashtagId > 0
  ) {

    const exists = await pool.query(`
      SELECT 1
      FROM hashtag_follows
      WHERE user_id=$1
        AND hashtag_id=$2
      LIMIT 1
    `,[
      user.id,
      hashtagId
    ]);

    if (exists.rows.length) {

      await pool.query(`
        DELETE FROM hashtag_follows
        WHERE user_id=$1
          AND hashtag_id=$2
      `,[
        user.id,
        hashtagId
      ]);

    } else {

      await pool.query(`
        INSERT INTO hashtag_follows(
          user_id,
          hashtag_id
        )
        VALUES($1,$2)
        ON CONFLICT(user_id,hashtag_id)
        DO NOTHING
      `,[
        user.id,
        hashtagId
      ]);
    }
  }

  redirect(
    res,
    `/hashtag?id=${hashtagId}`
  );

  return;
}


// ------------------------------------------------------------
// HASHTAG FOLLOWING API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/hashtag-following"
) {

  const rows = await pool.query(`
    SELECT
      h.id,
      h.name,
      hf.created_at
    FROM hashtag_follows hf
    JOIN hashtags h
      ON h.id=hf.hashtag_id
    WHERE hf.user_id=$1
    ORDER BY hf.created_at DESC
  `,[user.id]);

  sendJson(res,{
    ok:true,
    hashtags:rows.rows
  });

  return;
}


// ------------------------------------------------------------
// USER SEARCH SUGGESTIONS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/suggestions"
) {

  const q =
    (url.searchParams.get("q") || "")
      .trim()
      .toLowerCase();

  if (!q) {

    sendJson(res,{
      ok:true,
      users:[]
    });

    return;
  }

  const rows = await pool.query(`
    SELECT
      id,
      name,
      username,
      avatar_url
    FROM users
    WHERE
      LOWER(name) LIKE $1
      OR LOWER(username) LIKE $1
    ORDER BY
      CASE
        WHEN LOWER(username)=$2 THEN 0
        WHEN LOWER(username) LIKE $3 THEN 1
        ELSE 2
      END,
      name ASC
    LIMIT 20
  `,[
    `%${q}%`,
    q,
    `${q}%`
  ]);

  sendJson(res,{
    ok:true,
    users:rows.rows
  });

  return;
}// ============================================================
// SECTION 18
// SHOP / PRODUCTS / CART / ORDERS
// SELLER MANAGEMENT / WISHLIST
// ============================================================


// ------------------------------------------------------------
// SHOP TABLES
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    price NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'IRR',

    image_url TEXT DEFAULT '',
    stock INTEGER NOT NULL DEFAULT 0,

    category VARCHAR(100) DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CHECK(price >= 0),
    CHECK(stock >= 0)
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_products_seller
  ON products(seller_id,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_products_category
  ON products(category,created_at DESC)
`);


await pool.query(`
  CREATE TABLE IF NOT EXISTS cart_items (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    product_id INTEGER NOT NULL
      REFERENCES products(id) ON DELETE CASCADE,

    quantity INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id,product_id),

    CHECK(quantity > 0)
  )
`);


await pool.query(`
  CREATE TABLE IF NOT EXISTS wishlist_items (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    product_id INTEGER NOT NULL
      REFERENCES products(id) ON DELETE CASCADE,

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id,product_id)
  )
`);


await pool.query(`
  CREATE TABLE IF NOT EXISTS shop_orders (
    id SERIAL PRIMARY KEY,

    buyer_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'IRR',

    status VARCHAR(30) NOT NULL DEFAULT 'pending',

    shipping_name VARCHAR(200) DEFAULT '',
    shipping_phone VARCHAR(50) DEFAULT '',
    shipping_address TEXT DEFAULT '',

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CHECK(total_amount >= 0)
  )
`);


await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_shop_orders_buyer
  ON shop_orders(buyer_id,created_at DESC)
`);


await pool.query(`
  CREATE TABLE IF NOT EXISTS shop_order_items (
    id SERIAL PRIMARY KEY,

    order_id INTEGER NOT NULL
      REFERENCES shop_orders(id) ON DELETE CASCADE,

    product_id INTEGER
      REFERENCES products(id) ON DELETE SET NULL,

    seller_id INTEGER
      REFERENCES users(id) ON DELETE SET NULL,

    product_name VARCHAR(200) NOT NULL DEFAULT '',

    quantity INTEGER NOT NULL DEFAULT 1,

    unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),

    CHECK(quantity > 0),
    CHECK(unit_price >= 0)
  )
`);


await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_shop_order_items_order
  ON shop_order_items(order_id)
`);


// ------------------------------------------------------------
// SHOP HOME
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/shop"
) {

  const q =
    (url.searchParams.get("q") || "")
      .trim();

  const category =
    (url.searchParams.get("category") || "")
      .trim();

  const products = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.description,
      p.price,
      p.currency,
      p.image_url,
      p.stock,
      p.category,
      p.seller_id,
      u.name AS seller_name,
      u.username AS seller_username
    FROM products p
    JOIN users u
      ON u.id=p.seller_id
    WHERE
      p.active=TRUE
      AND p.stock > 0
      AND (
        $1=''
        OR LOWER(p.name) LIKE LOWER($2)
        OR LOWER(p.description) LIKE LOWER($2)
      )
      AND (
        $3=''
        OR LOWER(p.category)=LOWER($3)
      )
    ORDER BY p.created_at DESC
    LIMIT 100
  `,[
    q,
    `%${q}%`,
    category
  ]);

  sendPage(
    res,
    "فروشگاه",
    `
      <div class="card">
        <h2>🛍️ فروشگاه MySocial</h2>

        <form method="GET" action="/shop">

          <input
            name="q"
            value="${escapeHtml(q)}"
            placeholder="جستجوی محصول..."
          >

          <input
            name="category"
            value="${escapeHtml(category)}"
            placeholder="دسته‌بندی"
          >

          <button class="btn">
            جستجو
          </button>
        </form>

        <p>
          <a class="btn"
             href="/shop-seller">
            مدیریت محصولات من
          </a>

          <a class="btn"
             href="/cart">
            🛒 سبد خرید
          </a>

          <a class="btn"
             href="/wishlist">
            ❤️ علاقه‌مندی‌ها
          </a>

          <a class="btn"
             href="/orders">
            📦 سفارش‌های من
          </a>
        </p>
      </div>

      <div class="grid">

        ${
          products.rows.length
          ? products.rows.map(p => `

              <div class="card">

                ${
                  p.image_url
                  ? `
                    <img
                      src="${escapeHtml(p.image_url)}"
                      style="
                        width:100%;
                        max-height:280px;
                        object-fit:cover;
                        border-radius:12px;
                      "
                    >
                  `
                  : ""
                }

                <h3>
                  ${escapeHtml(p.name)}
                </h3>

                <p>
                  ${escapeHtml(p.description || "")}
                </p>

                <strong>
                  ${escapeHtml(String(p.price))}
                  ${escapeHtml(p.currency)}
                </strong>

                <p>
                  فروشنده:
                  ${escapeHtml(p.seller_name)}
                </p>

                <p>
                  موجودی:
                  ${p.stock}
                </p>

                <a
                  class="btn"
                  href="/product?id=${p.id}"
                >
                  مشاهده
                </a>

              </div>

            `).join("")
          : `
            <div class="card">
              <p>
                محصولی پیدا نشد.
              </p>
            </div>
          `
        }

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// PRODUCT PAGE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/product"
) {

  const productId =
    Number(url.searchParams.get("id"));

  if (
    !Number.isInteger(productId) ||
    productId <= 0
  ) {

    redirect(res,"/shop");
    return;
  }

  const result = await pool.query(`
    SELECT
      p.*,
      u.name AS seller_name,
      u.username AS seller_username
    FROM products p
    JOIN users u
      ON u.id=p.seller_id
    WHERE p.id=$1
      AND p.active=TRUE
    LIMIT 1
  `,[productId]);

  if (!result.rows.length) {

    redirect(res,"/shop");
    return;
  }

  const p = result.rows[0];

  sendPage(
    res,
    p.name,
    `
      <div class="card">

        ${
          p.image_url
          ? `
            <img
              src="${escapeHtml(p.image_url)}"
              style="
                width:100%;
                max-height:500px;
                object-fit:contain;
                border-radius:14px;
              "
            >
          `
          : ""
        }

        <h2>
          ${escapeHtml(p.name)}
        </h2>

        <p>
          ${escapeHtml(p.description || "")}
        </p>

        <h3>
          ${escapeHtml(String(p.price))}
          ${escapeHtml(p.currency)}
        </h3>

        <p>
          موجودی:
          ${p.stock}
        </p>

        <p>
          فروشنده:
          <a href="/profile?id=${p.seller_id}">
            ${escapeHtml(p.seller_name)}
          </a>
        </p>

        ${
          p.stock > 0
          ? `
            <form method="POST"
                  action="/cart-add">

              <input
                type="hidden"
                name="product_id"
                value="${p.id}"
              >

              <input
                type="number"
                name="quantity"
                min="1"
                max="${p.stock}"
                value="1"
              >

              <button class="btn">
                🛒 افزودن به سبد
              </button>
            </form>
          `
          : `
            <p>
              این محصول فعلاً موجود نیست.
            </p>
          `
        }

        <p>

          <a
            class="btn"
            href="/wishlist-add?id=${p.id}"
          >
            ❤️ افزودن به علاقه‌مندی
          </a>

        </p>

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// SELLER DASHBOARD
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/shop-seller"
) {

  const products = await pool.query(`
    SELECT
      id,
      name,
      description,
      price,
      currency,
      stock,
      category,
      active,
      created_at
    FROM products
    WHERE seller_id=$1
    ORDER BY created_at DESC
    LIMIT 200
  `,[user.id]);

  sendPage(
    res,
    "مدیریت فروشگاه",
    `
      <div class="card">

        <h2>
          🏪 مدیریت محصولات
        </h2>

        <form method="POST"
              action="/product-create">

          <input
            name="name"
            placeholder="نام محصول"
            required
          >

          <textarea
            name="description"
            placeholder="توضیحات محصول"
          ></textarea>

          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            placeholder="قیمت"
            required
          >

          <input
            name="currency"
            value="IRR"
            maxlength="10"
          >

          <input
            name="stock"
            type="number"
            min="0"
            value="1"
            placeholder="موجودی"
          >

          <input
            name="category"
            placeholder="دسته‌بندی"
          >

          <input
            name="image_url"
            placeholder="آدرس تصویر محصول"
          >

          <button class="btn">
            ایجاد محصول
          </button>

        </form>
      </div>

      ${
        products.rows.map(p => `
          <div class="card">

            <h3>
              ${escapeHtml(p.name)}
            </h3>

            <p>
              قیمت:
              ${escapeHtml(String(p.price))}
              ${escapeHtml(p.currency)}
            </p>

            <p>
              موجودی:
              ${p.stock}
            </p>

            <p>
              وضعیت:
              ${p.active ? "فعال" : "غیرفعال"}
            </p>

            <a
              class="btn"
              href="/product-edit?id=${p.id}"
            >
              ویرایش
            </a>

            <a
              class="btn"
              href="/product-toggle?id=${p.id}"
            >
              ${p.active ? "غیرفعال کردن" : "فعال کردن"}
            </a>

          </div>
        `).join("")
      }
    `
  );

  return;
}


// ------------------------------------------------------------
// CREATE PRODUCT
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/product-create"
) {

  const d = await readBody(req);

  const name =
    (d.get("name") || "").trim();

  const description =
    (d.get("description") || "").trim();

  const price =
    Number(d.get("price"));

  const currency =
    (d.get("currency") || "IRR")
      .trim()
      .slice(0,10);

  const stock =
    Number(d.get("stock"));

  const category =
    (d.get("category") || "")
      .trim()
      .slice(0,100);

  let imageUrl =
    (d.get("image_url") || "").trim();

  if (!name ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(stock) ||
      stock < 0) {

    redirect(res,"/shop-seller");
    return;
  }

  if (imageUrl) {

    const safe = safeUrl(imageUrl);

    if (!safe) {
      imageUrl = "";
    } else {
      imageUrl = safe;
    }
  }

  await pool.query(`
    INSERT INTO products(
      seller_id,
      name,
      description,
      price,
      currency,
      image_url,
      stock,
      category
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
  `,[
    user.id,
    name.slice(0,200),
    description.slice(0,5000),
    price,
    currency || "IRR",
    imageUrl,
    stock,
    category
  ]);

  redirect(
    res,
    "/shop-seller"
  );

  return;
}


// ------------------------------------------------------------
// EDIT PRODUCT PAGE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/product-edit"
) {

  const productId =
    Number(url.searchParams.get("id"));

  const result = await pool.query(`
    SELECT *
    FROM products
    WHERE id=$1
      AND seller_id=$2
    LIMIT 1
  `,[
    productId,
    user.id
  ]);

  if (!result.rows.length) {

    redirect(res,"/shop-seller");
    return;
  }

  const p = result.rows[0];

  sendPage(
    res,
    "ویرایش محصول",
    `
      <div class="card">

        <h2>
          ✏️ ویرایش محصول
        </h2>

        <form method="POST"
              action="/product-edit">

          <input
            type="hidden"
            name="product_id"
            value="${p.id}"
          >

          <input
            name="name"
            value="${escapeHtml(p.name)}"
            required
          >

          <textarea
            name="description"
          >${escapeHtml(p.description || "")}</textarea>

          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            value="${escapeHtml(String(p.price))}"
            required
          >

          <input
            name="currency"
            value="${escapeHtml(p.currency)}"
          >

          <input
            name="stock"
            type="number"
            min="0"
            value="${p.stock}"
          >

          <input
            name="category"
            value="${escapeHtml(p.category || "")}"
          >

          <input
            name="image_url"
            value="${escapeHtml(p.image_url || "")}"
          >

          <button class="btn">
            ذخیره تغییرات
          </button>

        </form>
      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// SAVE PRODUCT EDIT
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/product-edit"
) {

  const d = await readBody(req);

  const productId =
    Number(d.get("product_id"));

  const name =
    (d.get("name") || "").trim();

  const description =
    (d.get("description") || "").trim();

  const price =
    Number(d.get("price"));

  const currency =
    (d.get("currency") || "IRR")
      .trim()
      .slice(0,10);

  const stock =
    Number(d.get("stock"));

  const category =
    (d.get("category") || "")
      .trim()
      .slice(0,100);

  let imageUrl =
    (d.get("image_url") || "").trim();

  if (
    !Number.isInteger(productId) ||
    productId <= 0 ||
    !name ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(stock) ||
    stock < 0
  ) {

    redirect(res,"/shop-seller");
    return;
  }

  if (imageUrl) {
    imageUrl = safeUrl(imageUrl) || "";
  }

  await pool.query(`
    UPDATE products
    SET
      name=$1,
      description=$2,
      price=$3,
      currency=$4,
      stock=$5,
      category=$6,
      image_url=$7,
      updated_at=NOW()
    WHERE id=$8
      AND seller_id=$9
  `,[
    name.slice(0,200),
    description.slice(0,5000),
    price,
    currency || "IRR",
    stock,
    category,
    imageUrl,
    productId,
    user.id
  ]);

  redirect(
    res,
    "/shop-seller"
  );

  return;
}


// ------------------------------------------------------------
// TOGGLE PRODUCT
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/product-toggle"
) {

  const productId =
    Number(url.searchParams.get("id"));

  await pool.query(`
    UPDATE products
    SET
      active=NOT active,
      updated_at=NOW()
    WHERE id=$1
      AND seller_id=$2
  `,[
    productId,
    user.id
  ]);

  redirect(
    res,
    "/shop-seller"
  );

  return;
}


// ------------------------------------------------------------
// ADD TO CART
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/cart-add"
) {

  const d = await readBody(req);

  const productId =
    Number(d.get("product_id"));

  let quantity =
    Number(d.get("quantity"));

  if (!Number.isInteger(quantity) || quantity < 1) {
    quantity = 1;
  }

  const product = await pool.query(`
    SELECT
      id,
      stock,
      active
    FROM products
    WHERE id=$1
    LIMIT 1
  `,[productId]);

  if (!product.rows.length ||
      !product.rows[0].active ||
      product.rows[0].stock < 1) {

    redirect(res,"/shop");
    return;
  }

  quantity = Math.min(
    quantity,
    product.rows[0].stock
  );

  await pool.query(`
    INSERT INTO cart_items(
      user_id,
      product_id,
      quantity
    )
    VALUES($1,$2,$3)
    ON CONFLICT(user_id,product_id)
    DO UPDATE SET
      quantity=LEAST(
        cart_items.quantity + EXCLUDED.quantity,
        $4
      ),
      updated_at=NOW()
  `,[
    user.id,
    productId,
    quantity,
    product.rows[0].stock
  ]);

  redirect(
    res,
    "/cart"
  );

  return;
}


// ------------------------------------------------------------
// CART
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/cart"
) {

  const rows = await pool.query(`
    SELECT
      c.id,
      c.quantity,
      p.id AS product_id,
      p.name,
      p.price,
      p.currency,
      p.stock,
      p.active,
      (c.quantity*p.price) AS subtotal
    FROM cart_items c
    JOIN products p
      ON p.id=c.product_id
    WHERE c.user_id=$1
    ORDER BY c.created_at DESC
  `,[user.id]);

  const total =
    rows.rows.reduce(
      (sum,r) =>
        sum + Number(r.subtotal || 0),
      0
    );

  sendPage(
    res,
    "سبد خرید",
    `
      <div class="card">

        <h2>
          🛒 سبد خرید
        </h2>

        ${
          rows.rows.length
          ? rows.rows.map(r => `

              <div class="card">

                <h3>
                  ${escapeHtml(r.name)}
                </h3>

                <p>
                  تعداد:
                  ${r.quantity}
                </p>

                <p>
                  قیمت:
                  ${escapeHtml(String(r.price))}
                  ${escapeHtml(r.currency)}
                </p>

                <p>
                  مجموع:
                  ${escapeHtml(String(r.subtotal))}
                  ${escapeHtml(r.currency)}
                </p>

                <form
                  method="POST"
                  action="/cart-update"
                >

                  <input
                    type="hidden"
                    name="product_id"
                    value="${r.product_id}"
                  >

                  <input
                    type="num// ============================================================
// SECTION 19
// SHOP ADVANCED
// SELLER ORDERS / ORDER MANAGEMENT / REVIEWS
// PRODUCT REVIEWS / RATINGS / COUPONS
// ============================================================


// ------------------------------------------------------------
// PRODUCT REVIEWS
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS product_reviews (
    id SERIAL PRIMARY KEY,

    product_id INTEGER NOT NULL
      REFERENCES products(id) ON DELETE CASCADE,

    user_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    rating INTEGER NOT NULL,
    title VARCHAR(200) DEFAULT '',
    content TEXT DEFAULT '',

    approved BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(product_id,user_id),

    CHECK(rating >= 1 AND rating <= 5)
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_product_reviews_product
  ON product_reviews(product_id,created_at DESC)
`);


// ------------------------------------------------------------
// COUPONS
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS shop_coupons (
    id SERIAL PRIMARY KEY,

    seller_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    code VARCHAR(50) NOT NULL,
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,

    max_uses INTEGER DEFAULT NULL,
    used_count INTEGER NOT NULL DEFAULT 0,

    expires_at TIMESTAMP DEFAULT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(seller_id,code),

    CHECK(discount_percent >= 0),
    CHECK(discount_percent <= 100),
    CHECK(used_count >= 0)
  )
`);


// ------------------------------------------------------------
// ORDER STATUS
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/shop/order-status"
) {

  const d = await readBody(req);

  const orderId =
    Number(d.get("order_id"));

  const status =
    (d.get("status") || "").trim();

  const allowed = [
    "pending",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled"
  ];

  if (
    !Number.isInteger(orderId) ||
    orderId <= 0 ||
    !allowed.includes(status)
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);

    return;
  }

  const seller = await pool.query(`
    SELECT 1
    FROM shop_order_items
    WHERE order_id=$1
      AND seller_id=$2
    LIMIT 1
  `,[
    orderId,
    user.id
  ]);

  if (!seller.rows.length) {

    sendJson(res,{
      ok:false,
      error:"not_allowed"
    },403);

    return;
  }

  await pool.query(`
    UPDATE shop_orders
    SET
      status=$1,
      updated_at=NOW()
    WHERE id=$2
  `,[
    status,
    orderId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// SELLER ORDERS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/seller-orders"
) {

  const rows = await pool.query(`
    SELECT DISTINCT
      o.id,
      o.total_amount,
      o.currency,
      o.status,
      o.shipping_name,
      o.shipping_phone,
      o.shipping_address,
      o.created_at
    FROM shop_orders o
    JOIN shop_order_items oi
      ON oi.order_id=o.id
    WHERE oi.seller_id=$1
    ORDER BY o.created_at DESC
    LIMIT 200
  `,[user.id]);

  sendPage(
    res,
    "سفارش‌های فروشگاه",
    `
      <div class="card">

        <h2>
          📦 سفارش‌های محصولات من
        </h2>

        ${
          rows.rows.length
          ? rows.rows.map(o => `

              <div class="card">

                <h3>
                  سفارش #${o.id}
                </h3>

                <p>
                  مبلغ:
                  ${escapeHtml(String(o.total_amount))}
                  ${escapeHtml(o.currency)}
                </p>

                <p>
                  وضعیت:
                  ${escapeHtml(o.status)}
                </p>

                <p>
                  گیرنده:
                  ${escapeHtml(o.shipping_name)}
                </p>

                <p>
                  تلفن:
                  ${escapeHtml(o.shipping_phone)}
                </p>

                <p>
                  آدرس:
                  ${escapeHtml(o.shipping_address)}
                </p>

                <form
                  method="POST"
                  action="/api/shop/order-status"
                >

                  <input
                    type="hidden"
                    name="order_id"
                    value="${o.id}"
                  >

                  <select name="status">

                    <option value="processing">
                      در حال آماده‌سازی
                    </option>

                    <option value="shipped">
                      ارسال شده
                    </option>

                    <option value="delivered">
                      تحویل شده
                    </option>

                    <option value="cancelled">
                      لغو شده
                    </option>

                  </select>

                  <button class="btn">
                    تغییر وضعیت
                  </button>

                </form>

              </div>

            `).join("")
          : `
            <p>
              سفارشی برای محصولات شما ثبت نشده است.
            </p>
          `
        }

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// REVIEW PRODUCT
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/product-review"
) {

  const d = await readBody(req);

  const productId =
    Number(d.get("product_id"));

  const rating =
    Number(d.get("rating"));

  const title =
    (d.get("title") || "")
      .trim()
      .slice(0,200);

  const content =
    (d.get("content") || "")
      .trim()
      .slice(0,3000);

  if (
    !Number.isInteger(productId) ||
    productId <= 0 ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {

    redirect(
      res,
      `/product?id=${productId}`
    );

    return;
  }

  const purchased = await pool.query(`
    SELECT 1
    FROM shop_order_items oi
    JOIN shop_orders o
      ON o.id=oi.order_id
    WHERE
      oi.product_id=$1
      AND o.buyer_id=$2
      AND o.status IN(
        'paid',
        'processing',
        'shipped',
        'delivered'
      )
    LIMIT 1
  `,[
    productId,
    user.id
  ]);

  if (!purchased.rows.length) {

    redirect(
      res,
      `/product?id=${productId}`
    );

    return;
  }

  await pool.query(`
    INSERT INTO product_reviews(
      product_id,
      user_id,
      rating,
      title,
      content
    )
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(product_id,user_id)
    DO UPDATE SET
      rating=EXCLUDED.rating,
      title=EXCLUDED.title,
      content=EXCLUDED.content,
      updated_at=NOW()
  `,[
    productId,
    user.id,
    rating,
    title,
    content
  ]);

  redirect(
    res,
    `/product?id=${productId}`
  );

  return;
}


// ------------------------------------------------------------
// PRODUCT REVIEWS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/product-reviews"
) {

  const productId =
    Number(url.searchParams.get("product_id"));

  if (
    !Number.isInteger(productId) ||
    productId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_product"
    },400);

    return;
  }

  const rows = await pool.query(`
    SELECT
      r.id,
      r.rating,
      r.title,
      r.content,
      r.created_at,
      u.id AS user_id,
      u.name,
      u.username
    FROM product_reviews r
    JOIN users u
      ON u.id=r.user_id
    WHERE
      r.product_id=$1
      AND r.approved=TRUE
    ORDER BY r.created_at DESC
    LIMIT 100
  `,[productId]);

  const avg = await pool.query(`
    SELECT
      COALESCE(AVG(rating),0) AS average,
      COUNT(*) AS count
    FROM product_reviews
    WHERE
      product_id=$1
      AND approved=TRUE
  `,[productId]);

  sendJson(res,{
    ok:true,
    average:Number(
      avg.rows[0].average || 0
    ),
    count:Number(
      avg.rows[0].count || 0
    ),
    reviews:rows.rows
  });

  return;
}


// ------------------------------------------------------------
// COUPON CREATE
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/coupon-create"
) {

  const d = await readBody(req);

  const code =
    (d.get("code") || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g,"")
      .slice(0,50);

  const discount =
    Number(d.get("discount_percent"));

  const maxUsesRaw =
    (d.get("max_uses") || "").trim();

  const maxUses =
    maxUsesRaw
      ? Number(maxUsesRaw)
      : null;

  if (
    !code ||
    !Number.isFinite(discount) ||
    discount <= 0 ||
    discount > 100 ||
    (
      maxUses !== null &&
      (
        !Number.isInteger(maxUses) ||
        maxUses <= 0
      )
    )
  ) {

    redirect(res,"/shop-seller");
    return;
  }

  await pool.query(`
    INSERT INTO shop_coupons(
      seller_id,
      code,
      discount_percent,
      max_uses
    )
    VALUES($1,$2,$3,$4)
    ON CONFLICT(seller_id,code)
    DO UPDATE SET
      discount_percent=EXCLUDED.discount_percent,
      max_uses=EXCLUDED.max_uses,
      active=TRUE
  `,[
    user.id,
    code,
    discount,
    maxUses
  ]);

  redirect(
    res,
    "/shop-seller"
  );

  return;
}


// ------------------------------------------------------------
// COUPONS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/shop/coupons"
) {

  const rows = await pool.query(`
    SELECT
      id,
      code,
      discount_percent,
      max_uses,
      used_count,
      expires_at,
      active
    FROM shop_coupons
    WHERE
      seller_id=$1
    ORDER BY created_at DESC
    LIMIT 100
  `,[user.id]);

  sendJson(res,{
    ok:true,
    coupons:rows.rows
  });

  return;
}


// ------------------------------------------------------------
// VALIDATE COUPON
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/shop/coupon-check"
) {

  const d = await readBody(req);

  const sellerId =
    Number(d.get("seller_id"));

  const code =
    (d.get("code") || "")
      .trim()
      .toUpperCase();

  if (
    !Number.isInteger(sellerId) ||
    sellerId <= 0 ||
    !code
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_coupon"
    },400);

    return;
  }

  const coupon = await pool.query(`
    SELECT
      id,
      discount_percent,
      max_uses,
      used_count,
      expires_at
    FROM shop_coupons
    WHERE
      seller_id=$1
      AND code=$2
      AND active=TRUE
      AND (
        expires_at IS NULL
        OR expires_at > NOW()
      )
      AND (
        max_uses IS NULL
        OR used_count < max_uses
      )
    LIMIT 1
  `,[
    sellerId,
    code
  ]);

  if (!coupon.rows.length) {

    sendJson(res,{
      ok:false,
      error:"coupon_invalid"
    },404);

    return;
  }

  sendJson(res,{
    ok:true,
    coupon:coupon.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// SHOP DASHBOARD API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/shop/dashboard"
) {

  const products = await pool.query(`
    SELECT COUNT(*) AS count
    FROM products
    WHERE seller_id=$1
  `,[user.id]);

  const sales = await pool.query(`
    SELECT
      COUNT(DISTINCT oi.order_id) AS orders,
      COALESCE(
        SUM(oi.quantity*oi.unit_price),
        0
      ) AS revenue
    FROM shop_order_items oi
    JOIN shop_orders o
      ON o.id=oi.order_id
    WHERE
      oi.seller_id=$1
      AND o.status <> 'cancelled'
  `,[user.id]);

  const stock = await pool.query(`
    SELECT
      COALESCE(SUM(stock),0) AS total_stock
    FROM products
    WHERE
      seller_id=$1
      AND active=TRUE
  `,[user.id]);

  sendJson(res,{
    ok:true,
    products:Number(
      products.rows[0].count || 0
    ),
    orders:Number(
      sales.rows[0].orders || 0
    ),
    revenue:Number(
      sales.rows[0].revenue || 0
    ),
    stock:Number(
      stock.rows[0].total_stock || 0
    )
  });

  return;
}


// ------------------------------------------------------------
// PRODUCT SEARCH API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/shop/search"
) {

  const q =
    (url.searchParams.get("q") || "")
      .trim();

  const category =
    (url.searchParams.get("category") || "")
      .trim();

  const minPrice =
    Number(url.searchParams.get("min"));

  const maxPrice =
    Number(url.searchParams.get("max"));

  const rows = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.description,
      p.price,
      p.currency,
      p.image_url,
      p.stock,
      p.category,
      p.seller_id,
      u.name AS seller_name
    FROM products p
    JOIN users u
      ON u.id=p.seller_id
    WHERE
      p.active=TRUE
      AND p.stock>0

      AND (
        $1=''
        OR LOWER(p.name) LIKE LOWER($2)
        OR LOWER(p.description) LIKE LOWER($2)
      )

      AND (
        $3=''
        OR LOWER(p.category)=LOWER($3)
      )

      AND (
        $4 IS NULL
        OR p.price >= $4
      )

      AND (
        $5 IS NULL
        OR p.price <= $5
      )

    ORDER BY p.created_at DESC
    LIMIT 100
  `,[
    q,
    `%${q}%`,
    category,
    Number.isFinite(minPrice)
      ? minPrice
      : null,
    Number.isFinite(maxPrice)
      ? maxPrice
      : null
  ]);

  sendJson(res,{
    ok:true,
    products:rows.rows
  });

  return;
}


// ------------------------------------------------------------
// REMOVE PRODUCT FROM WISHLIST API
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/shop/wishlist/remove"
) {

  const d = await readBody(req);

  const productId =
    Number(d.get("product_id"));

  if (
    !Number.isInteger(productId) ||
    productId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_product"
    },400);

    return;
  }

  await pool.query(`
    DELETE FROM wishlist_items
    WHERE
      user_id=$1
      AND product_id=$2
  `,[
    user.id,
    productId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// SHOP SUMMARY
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/shop/summary"
) {

  const cart = await pool.query(`
    SELECT
      COALESCE(SUM(quantity),0) AS items
    FROM cart_items
    WHERE user_id=$1
  `,[user.id]);

  const wishlist = await pool.query(`
    SELECT
      COUNT(*) AS count
    FROM wishlist_items
    WHERE user_id=$1
  `,[user.id]);

  const orders = await pool.query(`
    SELECT
      COUNT(*) AS count
    FROM shop_orders
    WHERE buyer_id=$1
  `,[user.id]);

  sendJson(res,{
    ok:true,
    cart_items:Number(
      cart.rows[0].items || 0
    ),
    wishlist:Number(
      wishlist.rows[0].count || 0
    ),
    orders:Number(
      orders.rows[0].count || 0
    )
  });

  return;
    }// ============================================================
// SECTION 20
// ADMIN PANEL / MODERATION / USER MANAGEMENT
// REPORT MANAGEMENT / CONTENT CONTROL / SYSTEM SETTINGS
// ============================================================


// ------------------------------------------------------------
// ADMIN TABLES
// ------------------------------------------------------------

await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(30)
  DEFAULT 'user'
`);

await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN
  DEFAULT TRUE
`);

await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN
  DEFAULT FALSE
`);

await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP
  DEFAULT NULL
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS admin_actions (
    id SERIAL PRIMARY KEY,

    admin_id INTEGER NOT NULL
      REFERENCES users(id) ON DELETE CASCADE,

    target_user_id INTEGER
      REFERENCES users(id) ON DELETE SET NULL,

    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) DEFAULT '',
    target_id INTEGER DEFAULT NULL,

    details TEXT DEFAULT '',

    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_admin_actions_admin
  ON admin_actions(admin_id,created_at DESC)
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,

    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT DEFAULT '',

    updated_at TIMESTAMP DEFAULT NOW()
  )
`);


// ------------------------------------------------------------
// ADMIN CHECK
// ------------------------------------------------------------

async function isAdmin(userId) {

  if (!userId) {
    return false;
  }

  const result = await pool.query(`
    SELECT role
    FROM users
    WHERE id=$1
      AND is_active=TRUE
    LIMIT 1
  `,[userId]);

  if (!result.rows.length) {
    return false;
  }

  return [
    "admin",
    "superadmin"
  ].includes(result.rows[0].role);
}


// ------------------------------------------------------------
// ADMIN ACTION LOGGER
// ------------------------------------------------------------

async function logAdminAction(
  adminId,
  action,
  targetUserId = null,
  targetType = "",
  targetId = null,
  details = ""
) {

  await pool.query(`
    INSERT INTO admin_actions(
      admin_id,
      target_user_id,
      action,
      target_type,
      target_id,
      details
    )
    VALUES($1,$2,$3,$4,$5,$6)
  `,[
    adminId,
    targetUserId,
    action,
    targetType,
    targetId,
    details
  ]);
}


// ------------------------------------------------------------
// ADMIN DASHBOARD
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/admin"
) {

  if (!(await isAdmin(user.id))) {

    res.writeHead(403,{
      "Content-Type":"text/html; charset=utf-8"
    });

    res.end(`
      <h2 style="font-family:Arial">
        دسترسی غیرمجاز
      </h2>
    `);

    return;
  }

  const users = await pool.query(`
    SELECT COUNT(*) AS count
    FROM users
  `);

  const activeUsers = await pool.query(`
    SELECT COUNT(*) AS count
    FROM users
    WHERE is_active=TRUE
  `);

  const posts = await pool.query(`
    SELECT COUNT(*) AS count
    FROM posts
  `);

  const reports = await pool.query(`
    SELECT COUNT(*) AS count
    FROM reports
  `);

  const pendingReports = await pool.query(`
    SELECT COUNT(*) AS count
    FROM reports
    WHERE status='pending'
  `);

  const products = await pool.query(`
    SELECT COUNT(*) AS count
    FROM products
  `);

  const orders = await pool.query(`
    SELECT COUNT(*) AS count
    FROM shop_orders
  `);

  sendPage(
    res,
    "پنل مدیریت",
    `
      <div class="card">

        <h2>
          🛡️ پنل مدیریت MySocial
        </h2>

        <div class="grid">

          <div class="card">
            <h3>👥 کاربران</h3>
            <strong>
              ${users.rows[0].count}
            </strong>
          </div>

          <div class="card">
            <h3>🟢 کاربران فعال</h3>
            <strong>
              ${activeUsers.rows[0].count}
            </strong>
          </div>

          <div class="card">
            <h3>📝 پست‌ها</h3>
            <strong>
              ${posts.rows[0].count}
            </strong>
          </div>

          <div class="card">
            <h3>🚨 گزارش‌ها</h3>
            <strong>
              ${reports.rows[0].count}
            </strong>
          </div>

          <div class="card">
            <h3>⏳ گزارش‌های در انتظار</h3>
            <strong>
              ${pendingReports.rows[0].count}
            </strong>
          </div>

          <div class="card">
            <h3>🛍️ محصولات</h3>
            <strong>
              ${products.rows[0].count}
            </strong>
          </div>

          <div class="card">
            <h3>📦 سفارش‌ها</h3>
            <strong>
              ${orders.rows[0].count}
            </strong>
          </div>

        </div>

        <p>
          <a class="btn" href="/admin-users">
            مدیریت کاربران
          </a>

          <a class="btn" href="/admin-reports">
            مدیریت گزارش‌ها
          </a>

          <a class="btn" href="/admin-posts">
            مدیریت پست‌ها
          </a>

          <a class="btn" href="/admin-actions">
            گزارش فعالیت مدیران
          </a>

          <a class="btn" href="/admin-settings">
            تنظیمات سیستم
          </a>
        </p>

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// ADMIN USERS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/admin-users"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const q =
    (url.searchParams.get("q") || "")
      .trim();

  const rows = await pool.query(`
    SELECT
      id,
      name,
      username,
      email,
      role,
      is_active,
      is_verified,
      suspended_until,
      created_at
    FROM users
    WHERE
      $1=''
      OR LOWER(name) LIKE LOWER($2)
      OR LOWER(username) LIKE LOWER($2)
      OR LOWER(email) LIKE LOWER($2)
    ORDER BY id DESC
    LIMIT 200
  `,[
    q,
    `%${q}%`
  ]);

  sendPage(
    res,
    "مدیریت کاربران",
    `
      <div class="card">

        <h2>
          👥 مدیریت کاربران
        </h2>

        <form method="GET"
              action="/admin-users">

          <input
            name="q"
            value="${escapeHtml(q)}"
            placeholder="جستجوی کاربر..."
          >

          <button class="btn">
            جستجو
          </button>

        </form>

      </div>

      ${
        rows.rows.map(u => `

          <div class="card">

            <h3>
              ${escapeHtml(u.name)}
            </h3>

            <p>
              @${escapeHtml(u.username || "")}
            </p>

            <p>
              ID:
              ${u.id}
            </p>

            <p>
              نقش:
              ${escapeHtml(u.role || "user")}
            </p>

            <p>
              وضعیت:
              ${u.is_active ? "فعال" : "غیرفعال"}
            </p>

            <p>
              تأیید:
              ${u.is_verified ? "تأیید شده" : "تأیید نشده"}
            </p>

            <p>

              <a
                class="btn"
                href="/admin-user?id=${u.id}"
              >
                مدیریت
              </a>

            </p>

          </div>

        `).join("")
      }
    `
  );

  return;
}


// ------------------------------------------------------------
// ADMIN USER PAGE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/admin-user"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const targetId =
    Number(url.searchParams.get("id"));

  const result = await pool.query(`
    SELECT
      id,
      name,
      username,
      email,
      role,
      is_active,
      is_verified,
      suspended_until,
      created_at
    FROM users
    WHERE id=$1
    LIMIT 1
  `,[targetId]);

  if (!result.rows.length) {

    redirect(res,"/admin-users");
    return;
  }

  const u = result.rows[0];

  sendPage(
    res,
    "مدیریت کاربر",
    `
      <div class="card">

        <h2>
          🛡️ مدیریت کاربر
        </h2>

        <p>
          نام:
          ${escapeHtml(u.name)}
        </p>

        <p>
          نام کاربری:
          @${escapeHtml(u.username || "")}
        </p>

        <p>
          ایمیل:
          ${escapeHtml(u.email || "")}
        </p>

        <p>
          نقش:
          ${escapeHtml(u.role || "user")}
        </p>

        <p>
          وضعیت:
          ${u.is_active ? "فعال" : "غیرفعال"}
        </p>

        <p>
          تأیید:
          ${u.is_verified ? "تأیید شده" : "تأیید نشده"}
        </p>

        <hr>

        <form method="POST"
              action="/admin-user-role">

          <input
            type="hidden"
            name="user_id"
            value="${u.id}"
          >

          <select name="role">

            <option value="user">
              کاربر عادی
            </option>

            <option value="creator">
              Creator
            </option>

            <option value="business">
              Business
            </option>

            <option value="moderator">
              Moderator
            </option>

            <option value="admin">
              Admin
            </option>

          </select>

          <button class="btn">
            تغییر نقش
          </button>

        </form>

        <p>

          <a
            class="btn"
            href="/admin-user-toggle?id=${u.id}"
          >
            ${u.is_active
              ? "غیرفعال کردن حساب"
              : "فعال کردن حساب"}
          </a>

          <a
            class="btn"
            href="/admin-user-verify?id=${u.id}"
          >
            ${u.is_verified
              ? "لغو تأیید"
              : "تأیید حساب"}
          </a>

        </p>

        <form method="POST"
              action="/admin-suspend">

          <input
            type="hidden"
            name="user_id"
            value="${u.id}"
          >

          <select name="hours">

            <option value="1">
              ۱ ساعت
            </option>

            <option value="24">
              ۲۴ ساعت
            </option>

            <option value="72">
              ۳ روز
            </option>

            <option value="168">
              ۷ روز
            </option>

          </select>

          <button class="btn">
            تعلیق موقت
          </button>

        </form>

        <p>

          <a
            class="btn"
            href="/admin-unsuspend?id=${u.id}"
          >
            لغو تعلیق
          </a>

        </p>

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// CHANGE USER ROLE
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/admin-user-role"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const d = await readBody(req);

  const targetId =
    Number(d.get("user_id"));

  const role =
    (d.get("role") || "user").trim();

  const allowedRoles = [
    "user",
    "creator",
    "business",
    "moderator",
    "admin"
  ];

  if (
    !Number.isInteger(targetId) ||
    targetId <= 0 ||
    !allowedRoles.includes(role)
  ) {

    redirect(res,"/admin-users");
    return;
  }

  if (
    targetId === user.id &&
    role !== "admin"
  ) {

    redirect(
      res,
      `/admin-user?id=${targetId}`
    );

    return;
  }

  await pool.query(`
    UPDATE users
    SET role=$1
    WHERE id=$2
  `,[
    role,
    targetId
  ]);

  await logAdminAction(
    user.id,
    "change_role",
    targetId,
    "user",
    targetId,
    `role=${role}`
  );

  redirect(
    res,
    `/admin-user?id=${targetId}`
  );

  return;
}


// ------------------------------------------------------------
// TOGGLE USER
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/admin-user-toggle"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const targetId =
    Number(url.searchParams.get("id"));

  if (
    !Number.isInteger(targetId) ||
    targetId <= 0 ||
    targetId === user.id
  ) {

    redirect(res,"/admin-users");
    return;
  }

  await pool.query(`
    UPDATE users
    SET is_active=NOT is_active
    WHERE id=$1
  `,[targetId]);

  await logAdminAction(
    user.id,
    "toggle_user",
    targetId,
    "user",
    targetId
  );

  redirect(
    res,
    `/admin-user?id=${targetId}`
  );

  return;
}


// ------------------------------------------------------------
// VERIFY USER
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/admin-user-verify"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const targetId =
    Number(url.searchParams.get("id"));

  await pool.query(`
    UPDATE users
    SET is_verified=NOT is_verified
    WHERE id=$1
  `,[targetId]);

  await logAdminAction(
    user.id,
    "toggle_verification",
    targetId,
    "user",
    targetId
  );

  redirect(
    res,
    `/admin-user?id=${targetId}`
  );

  return;
}


// ------------------------------------------------------------
// SUSPEND USER
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/admin-suspend"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const d = await readBody(req);

  const targetId =
    Number(d.get("user_id"));

  const hours =
    Number(d.get("hours"));

  const allowedHours = [
    1,
    24,
    72,
    168
  ];

  if (
    !Number.isInteger(targetId) ||
    !allowedHours.includes(hours) ||
    targetId === user.id
  ) {

    redirect(res,"/admin-users");
    return;
  }

  await pool.query(`
    UPDATE users
    SET suspended_until=
      NOW() + ($1 * INTERVAL '1 hour')
    WHERE id=$2
  `,[
    hours,
    targetId
  ]);

  await logAdminAction(
    user.id,
    "suspend_user",
    targetId,
    "user",
    targetId,
    `hours=${hours}`
  );

  redirect(
    res,
    `/admin-user?id=${targetId}`
  );

  return;
}


// ------------------------------------------------------------
// UNSUSPEND USER
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/admin-unsuspend"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const targetId =
    Number(url.searchParams.get("id"));

  await pool.query(`
    UPDATE users
    SET suspended_until=NULL
    WHERE id=$1
  `,[targetId]);

  await logAdminAction(
    user.id,
    "unsuspend_user",
    targetId,
    "user",
    targetId
  );

  redirect(
    res,
    `/admin-user?id=${targetId}`
  );

  return;
}


// ------------------------------------------------------------
// ADMIN REPORTS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/admin-reports"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const status =
    (url.searchParams.get("status") || "pending")
      .trim();

  const rows = await pool.query(`
    SELECT
      r.id,
      r.reporter_id,
      r.target_id,
      r.target_type,
      r.reason,
      r.status,
      r.created_at,
      u.name AS reporter_name
    FROM reports r
    LEFT JOIN users u
      ON u.id=r.reporter_id
    WHERE
      $1=''
      OR r.status=$1
    ORDER BY r.created_at DESC
    LIMIT 200
  `,[status]);

  sendPage(
    res,
    "مدیریت گزارش‌ها",
    `
      <div class="card">

        <h2>
          🚨 گزارش‌های کاربران
        </h2>

        <p>

          <a
            class="btn"
            href="/admin-reports?status=pending"
          >
            در انتظار
          </a>

          <a
            class="btn"
            href="/admin-reports?status=resolved"
          >
            رسیدگی شده
          </a>

          <a
            class="btn"
            href="/admin-reports?status=rejected"
          >
            رد شده
          </a>

        </p>

      </div>

      ${
        rows.rows.map(r => `

          <div class="card">

            <h3>
              گزارش #${r.id}
            </h3>

            <p>
              گزارش‌دهنده:
              ${escapeHtml(r.reporter_name || "کاربر")}
            </p>

            <p>
              نوع:
              ${escapeHtml(r.target_type || "")}
            </p>

            <p>
              شناسه هدف:
              ${r.target_id || ""}
            </p>

            <p>
              دلیل:
              ${escapeHtml(r.reason || "")}
            </p>

            <p>
              وضعیت:
              ${escapeHtml(r.status || "pending")}
            </p>

            <a
              class="btn"
              href="/admin-report?id=${r.id}"
            >
              بررسی گزارش
            </a>

          </div>

        `).join("")
      }
    `
  );

  return;
}


// ------------------------------------------------------------
// ADMIN REPORT ACTION
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/admin-report-action"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const d = await readBody(req);

  const reportId =
    Number(d.get("report_id"));

  const status =
    (d.get("status") || "").trim();

  const allowed = [
    "pending",
    "resolved",
    "rejected"
  ];

  if (
    !Number.isInteger(reportId) ||
    reportId <= 0 ||
    !allowed.includes(status)
  ) {

    redirect(
      res,
      "/admin-reports"
    );

    return;
  }

  const report = await pool.query(`
    SELECT
      id,
      target_id,
      target_type
    FROM reports
    WHERE id=$1
    LIMIT 1
  `,[reportId]);

  if (!report.rows.length) {

    redirect(
      res,
      "/admin-reports"
    );

    return;
  }

  await pool.query(`
    UPDATE reports
    SET status=$1
    WHERE id=$2
  `,[
    status,
    reportId
  ]);

  await logAdminAction(
    user.id,
    `report_${status}`,
    null,
    report.rows[0].target_type || "report",
    report.rows[0].target_id || null,
    `report_id=${reportId}`
  );

  redirect(
    res,
    `/admin-reports?status=${status}`
  );

  return;
}


// ------------------------------------------------------------
// ADMIN ACTIONS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/admin-actions"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const rows = await pool.query(`
    SELECT
      a.id,
      a.action,
      a.target_type,
      a.target_id,
      a.details,
      a.created_at,
      u.name AS admin_name
    FROM admin_actions a
    JOIN users u
      ON u.id=a.admin_id
    ORDER BY a.created_at DESC
    LIMIT 300
  `);

  sendPage(
    res,
    "فعالیت مدیران",
    `
      <div class="card">

        <h2>
          📋 فعالیت مدیران
        </h2>

        ${
          rows.rows.map(a => `

            <div class="card">// ============================================================
// SECTION 21
// ADMIN ADVANCED MODERATION
// CONTENT REVIEW / USER SUSPENSION / REPORT ACTIONS
// COMMENTS / REELS / STORIES / LIVE / SHOP MODERATION
// ============================================================


// ------------------------------------------------------------
// MODERATION TABLES
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS moderation_queue (
    id SERIAL PRIMARY KEY,

    target_type VARCHAR(40) NOT NULL,
    target_id INTEGER NOT NULL,

    reason VARCHAR(255) DEFAULT '',
    priority INTEGER DEFAULT 0,

    status VARCHAR(30) DEFAULT 'pending',

    assigned_to INTEGER
      REFERENCES users(id)
      ON DELETE SET NULL,

    created_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP DEFAULT NULL
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_moderation_queue_status
  ON moderation_queue(status,priority DESC,created_at DESC)
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS content_actions (
    id SERIAL PRIMARY KEY,

    admin_id INTEGER
      REFERENCES users(id)
      ON DELETE SET NULL,

    target_type VARCHAR(40) NOT NULL,
    target_id INTEGER NOT NULL,

    action VARCHAR(50) NOT NULL,

    reason TEXT DEFAULT '',

    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_content_actions_target
  ON content_actions(target_type,target_id,created_at DESC)
`);


// ------------------------------------------------------------
// ADMIN MODERATION DASHBOARD
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/admin-moderation"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const pending = await pool.query(`
    SELECT COUNT(*) AS count
    FROM moderation_queue
    WHERE status='pending'
  `);

  const reports = await pool.query(`
    SELECT COUNT(*) AS count
    FROM reports
    WHERE status='pending'
  `);

  const suspended = await pool.query(`
    SELECT COUNT(*) AS count
    FROM users
    WHERE suspended_until IS NOT NULL
      AND suspended_until > NOW()
  `);

  sendPage(
    res,
    "مرکز نظارت",
    `
      <div class="card">

        <h2>
          🛡️ مرکز نظارت MySocial
        </h2>

        <div class="grid">

          <div class="card">
            <h3>⏳ صف بررسی</h3>
            <strong>
              ${pending.rows[0].count}
            </strong>
          </div>

          <div class="card">
            <h3>🚨 گزارش‌ها</h3>
            <strong>
              ${reports.rows[0].count}
            </strong>
          </div>

          <div class="card">
            <h3>🔒 حساب‌های تعلیق‌شده</h3>
            <strong>
              ${suspended.rows[0].count}
            </strong>
          </div>

        </div>

        <p>

          <a
            class="btn"
            href="/admin-moderation-queue"
          >
            صف بررسی محتوا
          </a>

          <a
            class="btn"
            href="/admin-reports"
          >
            گزارش‌های کاربران
          </a>

        </p>

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// MODERATION QUEUE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/admin-moderation-queue"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const status =
    (url.searchParams.get("status") || "pending")
      .trim();

  const rows = await pool.query(`
    SELECT
      q.id,
      q.target_type,
      q.target_id,
      q.reason,
      q.priority,
      q.status,
      q.created_at,
      u.name AS assigned_name
    FROM moderation_queue q
    LEFT JOIN users u
      ON u.id=q.assigned_to
    WHERE
      $1=''
      OR q.status=$1
    ORDER BY
      q.priority DESC,
      q.created_at ASC
    LIMIT 300
  `,[status]);

  sendPage(
    res,
    "صف نظارت",
    `
      <div class="card">

        <h2>
          🔎 صف بررسی محتوا
        </h2>

        <p>

          <a
            class="btn"
            href="/admin-moderation-queue?status=pending"
          >
            در انتظار
          </a>

          <a
            class="btn"
            href="/admin-moderation-queue?status=approved"
          >
            تأیید شده
          </a>

          <a
            class="btn"
            href="/admin-moderation-queue?status=removed"
          >
            حذف شده
          </a>

        </p>

      </div>

      ${
        rows.rows.map(q => `

          <div class="card">

            <h3>
              بررسی #${q.id}
            </h3>

            <p>
              نوع محتوا:
              ${escapeHtml(q.target_type)}
            </p>

            <p>
              شناسه:
              ${q.target_id}
            </p>

            <p>
              دلیل:
              ${escapeHtml(q.reason || "")}
            </p>

            <p>
              اولویت:
              ${q.priority}
            </p>

            <p>
              وضعیت:
              ${escapeHtml(q.status)}
            </p>

            <a
              class="btn"
              href="/admin-moderation-item?id=${q.id}"
            >
              بررسی
            </a>

          </div>

        `).join("")
      }
    `
  );

  return;
}


// ------------------------------------------------------------
// MODERATION ITEM
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/admin-moderation-item"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const queueId =
    Number(url.searchParams.get("id"));

  if (
    !Number.isInteger(queueId) ||
    queueId <= 0
  ) {

    redirect(
      res,
      "/admin-moderation-queue"
    );

    return;
  }

  const result = await pool.query(`
    SELECT *
    FROM moderation_queue
    WHERE id=$1
    LIMIT 1
  `,[queueId]);

  if (!result.rows.length) {

    redirect(
      res,
      "/admin-moderation-queue"
    );

    return;
  }

  const q = result.rows[0];

  let contentHtml = `
    <p>
      محتوای مورد نظر در دسترس نیست.
    </p>
  `;

  if (q.target_type === "post") {

    const p = await pool.query(`
      SELECT
        p.id,
        p.content,
        p.image_url,
        p.user_id,
        u.name,
        u.username
      FROM posts p
      JOIN users u
        ON u.id=p.user_id
      WHERE p.id=$1
      LIMIT 1
    `,[q.target_id]);

    if (p.rows.length) {

      const x = p.rows[0];

      contentHtml = `
        <p>
          <strong>
            ${escapeHtml(x.name)}
          </strong>
          @${escapeHtml(x.username || "")}
        </p>

        <p>
          ${escapeHtml(x.content || "")}
        </p>

        ${
          x.image_url
          ? `
            <img
              src="${escapeHtml(x.image_url)}"
              style="
                max-width:100%;
                border-radius:12px;
              "
            >
          `
          : ""
        }
      `;
    }
  }

  if (q.target_type === "comment") {

    const c = await pool.query(`
      SELECT
        c.id,
        c.content,
        c.user_id,
        u.name,
        u.username
      FROM comments c
      JOIN users u
        ON u.id=c.user_id
      WHERE c.id=$1
      LIMIT 1
    `,[q.target_id]);

    if (c.rows.length) {

      const x = c.rows[0];

      contentHtml = `
        <p>
          <strong>
            ${escapeHtml(x.name)}
          </strong>
          @${escapeHtml(x.username || "")}
        </p>

        <p>
          ${escapeHtml(x.content || "")}
        </p>
      `;
    }
  }

  sendPage(
    res,
    "بررسی محتوا",
    `
      <div class="card">

        <h2>
          🔎 بررسی محتوا #${q.id}
        </h2>

        <p>
          نوع:
          ${escapeHtml(q.target_type)}
        </p>

        <p>
          دلیل:
          ${escapeHtml(q.reason || "")}
        </p>

        <hr>

        ${contentHtml}

        <hr>

        <form
          method="POST"
          action="/admin-moderation-action"
        >

          <input
            type="hidden"
            name="queue_id"
            value="${q.id}"
          >

          <input
            name="reason"
            placeholder="دلیل تصمیم"
          >

          <button
            class="btn"
            name="action"
            value="approve"
          >
            تأیید
          </button>

          <button
            class="btn"
            name="action"
            value="remove"
          >
            حذف محتوا
          </button>

          <button
            class="btn"
            name="action"
            value="dismiss"
          >
            رد گزارش
          </button>

        </form>

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// MODERATION ACTION
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/admin-moderation-action"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const d = await readBody(req);

  const queueId =
    Number(d.get("queue_id"));

  const action =
    (d.get("action") || "").trim();

  const reason =
    (d.get("reason") || "")
      .trim()
      .slice(0,1000);

  if (
    !Number.isInteger(queueId) ||
    queueId <= 0
  ) {

    redirect(
      res,
      "/admin-moderation-queue"
    );

    return;
  }

  const allowed = [
    "approve",
    "remove",
    "dismiss"
  ];

  if (!allowed.includes(action)) {

    redirect(
      res,
      `/admin-moderation-item?id=${queueId}`
    );

    return;
  }

  const q = await pool.query(`
    SELECT
      id,
      target_type,
      target_id
    FROM moderation_queue
    WHERE id=$1
    LIMIT 1
  `,[queueId]);

  if (!q.rows.length) {

    redirect(
      res,
      "/admin-moderation-queue"
    );

    return;
  }

  const item = q.rows[0];

  let newStatus = "approved";

  if (action === "remove") {
    newStatus = "removed";
  }

  if (action === "dismiss") {
    newStatus = "dismissed";
  }

  await pool.query(`
    UPDATE moderation_queue
    SET
      status=$1,
      assigned_to=$2,
      reviewed_at=NOW()
    WHERE id=$3
  `,[
    newStatus,
    user.id,
    queueId
  ]);

  if (action === "remove") {

    if (item.target_type === "post") {

      await pool.query(`
        DELETE FROM posts
        WHERE id=$1
      `,[item.target_id]);
    }

    if (item.target_type === "comment") {

      await pool.query(`
        DELETE FROM comments
        WHERE id=$1
      `,[item.target_id]);
    }

    if (item.target_type === "reel") {

      await pool.query(`
        DELETE FROM reels
        WHERE id=$1
      `,[item.target_id]);
    }

    if (item.target_type === "story") {

      await pool.query(`
        DELETE FROM stories
        WHERE id=$1
      `,[item.target_id]);
    }
  }

  await pool.query(`
    INSERT INTO content_actions(
      admin_id,
      target_type,
      target_id,
      action,
      reason
    )
    VALUES($1,$2,$3,$4,$5)
  `,[
    user.id,
    item.target_type,
    item.target_id,
    action,
    reason
  ]);

  await logAdminAction(
    user.id,
    `moderation_${action}`,
    null,
    item.target_type,
    item.target_id,
    reason
  );

  redirect(
    res,
    "/admin-moderation-queue"
  );

  return;
}


// ------------------------------------------------------------
// ADD CONTENT TO MODERATION QUEUE
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/moderation/queue"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const d = await readBody(req);

  const targetType =
    (d.get("target_type") || "")
      .trim();

  const targetId =
    Number(d.get("target_id"));

  const reason =
    (d.get("reason") || "")
      .trim()
      .slice(0,500);

  const priority =
    Math.max(
      0,
      Math.min(
        100,
        Number(d.get("priority") || 0)
      )
    );

  const allowedTypes = [
    "post",
    "comment",
    "reel",
    "story",
    "live",
    "product"
  ];

  if (
    !allowedTypes.includes(targetType) ||
    !Number.isInteger(targetId) ||
    targetId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);

    return;
  }

  const existing = await pool.query(`
    SELECT id
    FROM moderation_queue
    WHERE
      target_type=$1
      AND target_id=$2
      AND status='pending'
    LIMIT 1
  `,[
    targetType,
    targetId
  ]);

  if (existing.rows.length) {

    sendJson(res,{
      ok:true,
      id:existing.rows[0].id,
      existing:true
    });

    return;
  }

  const result = await pool.query(`
    INSERT INTO moderation_queue(
      target_type,
      target_id,
      reason,
      priority
    )
    VALUES($1,$2,$3,$4)
    RETURNING id
  `,[
    targetType,
    targetId,
    reason,
    priority
  ]);

  sendJson(res,{
    ok:true,
    id:result.rows[0].id
  });

  return;
}


// ------------------------------------------------------------
// ADMIN USER SEARCH API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/admin/users"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const q =
    (url.searchParams.get("q") || "")
      .trim();

  const result = await pool.query(`
    SELECT
      id,
      name,
      username,
      role,
      is_active,
      is_verified,
      suspended_until
    FROM users
    WHERE
      $1=''
      OR LOWER(name) LIKE LOWER($2)
      OR LOWER(username) LIKE LOWER($2)
    ORDER BY id DESC
    LIMIT 100
  `,[
    q,
    `%${q}%`
  ]);

  sendJson(res,{
    ok:true,
    users:result.rows
  });

  return;
}


// ------------------------------------------------------------
// ADMIN SUSPEND API
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/admin/suspend"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const d = await readBody(req);

  const targetId =
    Number(d.get("user_id"));

  const hours =
    Number(d.get("hours"));

  if (
    !Number.isInteger(targetId) ||
    targetId <= 0 ||
    targetId === user.id ||
    !Number.isInteger(hours) ||
    hours <= 0 ||
    hours > 8760
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);

    return;
  }

  await pool.query(`
    UPDATE users
    SET suspended_until=
      NOW() + ($1 * INTERVAL '1 hour')
    WHERE id=$2
  `,[
    hours,
    targetId
  ]);

  await logAdminAction(
    user.id,
    "api_suspend_user",
    targetId,
    "user",
    targetId,
    `hours=${hours}`
  );

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// ADMIN UNSUSPEND API
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/admin/unsuspend"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const d = await readBody(req);

  const targetId =
    Number(d.get("user_id"));

  if (
    !Number.isInteger(targetId) ||
    targetId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  await pool.query(`
    UPDATE users
    SET suspended_until=NULL
    WHERE id=$1
  `,[targetId]);

  await logAdminAction(
    user.id,
    "api_unsuspend_user",
    targetId,
    "user",
    targetId
  );

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// CONTENT ACTION HISTORY API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/admin/content-actions"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const targetType =
    (url.searchParams.get("target_type") || "")
      .trim();

  const targetId =
    Number(url.searchParams.get("target_id"));

  const rows = await pool.query(`
    SELECT
      c.id,
      c.target_type,
      c.target_id,
      c.action,
      c.reason,
      c.created_at,
      u.name AS admin_name
    FROM content_actions c
    LEFT JOIN users u
      ON u.id=c.admin_id
    WHERE
      ($1='' OR c.target_type=$1)
      AND
      ($2=0 OR c.target_id=$2)
    ORDER BY c.created_at DESC
    LIMIT 200
  `,[
    targetType,
    Number.isInteger(targetId)
      ? targetId
      : 0
  ]);

  sendJson(res,{
    ok:true,
    actions:rows.rows
  });

  return;
}


// ------------------------------------------------------------
// MODERATION STATISTICS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/admin/moderation-stats"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const queue = await pool.query(`
    SELECT
      status,
      COUNT(*)::INTEGER AS count
    FROM moderation_queue
    GROUP BY status
    ORDER BY status
  `);

  const actions = await pool.query(`
    SELECT
      action,
      COUNT(*)::INTEGER AS count
    FROM content_actions
    GROUP BY action
    ORDER BY count DESC
  `);

  const reports = await pool.query(`
    SELECT
      status,
      COUNT(*)::INTEGER AS count
    FROM reports
    GROUP BY status
    ORDER BY status
  `);

  sendJson(res,{
    ok:true,
    queue:queue.rows,
    actions:actions.rows,
    reports:reports.rows
  });

  return;
}


// ------------------------------------------------------------
// CLEANUP MODERATION QUEUE
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/admin/moderation-cleanup"
) {

  if (!(await isAdmin(user.id))) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const result = await pool.query(`
    DELETE FROM moderation_queue
    WHERE
      status IN(
        'approved',
        'dismissed'
      )
      AND reviewed_at <
        NOW() - INTERVAL '180 days'
  `);

  await logAdminAction(
    user.id,
    "moderation_cleanup",
    null,
    "moderation",
    null,
    `deleted=${result.rowCount}`
  );

  sendJson(res,{
    ok:true,
    deleted:result.rowCount
  });

  return;
}// ============================================================
// SECTION 22
// ADVANCED MESSAGING
// DIRECT MESSAGES / CONVERSATIONS / READ STATUS / DELETION
// MESSAGE REACTIONS / TYPING STATUS / MESSAGE SEARCH
// ============================================================


// ------------------------------------------------------------
// MESSAGE ADVANCED TABLES
// ------------------------------------------------------------

await pool.query(`
  ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN
  DEFAULT FALSE
`);

await pool.query(`
  ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_for_sender BOOLEAN
  DEFAULT FALSE
`);

await pool.query(`
  ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_for_receiver BOOLEAN
  DEFAULT FALSE
`);

await pool.query(`
  ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS edited BOOLEAN
  DEFAULT FALSE
`);

await pool.query(`
  ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP
  DEFAULT NOW()
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS message_reactions (
    id SERIAL PRIMARY KEY,

    message_id INTEGER NOT NULL
      REFERENCES messages(id)
      ON DELETE CASCADE,

    user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    reaction VARCHAR(30) NOT NULL,

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(message_id,user_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS message_typing (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    receiver_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id,receiver_id)
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver
  ON messages(sender_id,receiver_id,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_messages_receiver_sender
  ON messages(receiver_id,sender_id,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions(message_id)
`);


// ------------------------------------------------------------
// MESSAGE LIST API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/messages"
) {

  const otherId =
    Number(url.searchParams.get("user"));

  if (
    !Number.isInteger(otherId) ||
    otherId <= 0 ||
    otherId === user.id
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  const blocked = await pool.query(`
    SELECT 1
    FROM blocked_users
    WHERE
      (blocker_id=$1 AND blocked_id=$2)
      OR
      (blocker_id=$2 AND blocked_id=$1)
    LIMIT 1
  `,[
    user.id,
    otherId
  ]);

  if (blocked.rows.length) {

    sendJson(res,{
      ok:false,
      error:"blocked"
    },403);

    return;
  }

  const limitRaw =
    Number(url.searchParams.get("limit") || 50);

  const limit =
    Math.max(
      1,
      Math.min(
        100,
        Number.isInteger(limitRaw)
          ? limitRaw
          : 50
      )
    );

  const rows = await pool.query(`
    SELECT
      m.id,
      m.sender_id,
      m.receiver_id,
      m.message,
      m.created_at,
      m.is_read,
      m.edited,

      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'user_id',mr.user_id,
            'reaction',mr.reaction
          )
        )
        FILTER(
          WHERE mr.id IS NOT NULL
        ),
        '[]'::json
      ) AS reactions

    FROM messages m

    LEFT JOIN message_reactions mr
      ON mr.message_id=m.id

    WHERE
      (
        m.sender_id=$1
        AND m.receiver_id=$2
        AND m.deleted_for_sender=FALSE
      )
      OR
      (
        m.sender_id=$2
        AND m.receiver_id=$1
        AND m.deleted_for_receiver=FALSE
      )

    GROUP BY
      m.id

    ORDER BY
      m.created_at DESC

    LIMIT $3
  `,[
    user.id,
    otherId,
    limit
  ]);

  await pool.query(`
    UPDATE messages
    SET is_read=TRUE
    WHERE
      sender_id=$1
      AND receiver_id=$2
      AND is_read=FALSE
  `,[
    otherId,
    user.id
  ]);

  sendJson(res,{
    ok:true,
    messages:rows.rows.reverse()
  });

  return;
}


// ------------------------------------------------------------
// SEND MESSAGE API
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/messages/send"
) {

  const d = await readBody(req);

  const receiverId =
    Number(d.get("receiver_id"));

  const content =
    (d.get("message") ||
     d.get("content") ||
     "")
      .trim()
      .slice(0,5000);

  if (
    !Number.isInteger(receiverId) ||
    receiverId <= 0 ||
    receiverId === user.id ||
    !content
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);

    return;
  }

  const blocked = await pool.query(`
    SELECT 1
    FROM blocked_users
    WHERE
      (blocker_id=$1 AND blocked_id=$2)
      OR
      (blocker_id=$2 AND blocked_id=$1)
    LIMIT 1
  `,[
    user.id,
    receiverId
  ]);

  if (blocked.rows.length) {

    sendJson(res,{
      ok:false,
      error:"blocked"
    },403);

    return;
  }

  const receiver = await pool.query(`
    SELECT id
    FROM users
    WHERE
      id=$1
      AND is_active=TRUE
    LIMIT 1
  `,[receiverId]);

  if (!receiver.rows.length) {

    sendJson(res,{
      ok:false,
      error:"user_not_found"
    },404);

    return;
  }

  const result = await pool.query(`
    INSERT INTO messages(
      sender_id,
      receiver_id,
      message,
      is_read,
      updated_at
    )
    VALUES(
      $1,
      $2,
      $3,
      FALSE,
      NOW()
    )
    RETURNING
      id,
      sender_id,
      receiver_id,
      message,
      created_at,
      is_read
  `,[
    user.id,
    receiverId,
    content
  ]);

  await notify(
    receiverId,
    user.id,
    "message",
    result.rows[0].id,
    `${user.name} برای شما پیام فرستاد.`
  );

  sendJson(res,{
    ok:true,
    message:result.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// MARK MESSAGES READ
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/messages/read"
) {

  const d = await readBody(req);

  const otherId =
    Number(d.get("user_id"));

  if (
    !Number.isInteger(otherId) ||
    otherId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  const result = await pool.query(`
    UPDATE messages
    SET is_read=TRUE
    WHERE
      sender_id=$1
      AND receiver_id=$2
      AND is_read=FALSE
  `,[
    otherId,
    user.id
  ]);

  sendJson(res,{
    ok:true,
    updated:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// UNREAD MESSAGE COUNT
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/messages/unread"
) {

  const result = await pool.query(`
    SELECT
      COUNT(*)::INTEGER AS count
    FROM messages
    WHERE
      receiver_id=$1
      AND is_read=FALSE
      AND deleted_for_receiver=FALSE
  `,[user.id]);

  sendJson(res,{
    ok:true,
    count:Number(
      result.rows[0].count || 0
    )
  });

  return;
}


// ------------------------------------------------------------
// CONVERSATIONS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/conversations"
) {

  const rows = await pool.query(`
    SELECT DISTINCT ON (
      CASE
        WHEN m.sender_id=$1
        THEN m.receiver_id
        ELSE m.sender_id
      END
    )

      CASE
        WHEN m.sender_id=$1
        THEN m.receiver_id
        ELSE m.sender_id
      END AS other_user_id,

      m.id AS last_message_id,
      m.message AS last_message,
      m.created_at AS last_message_at,

      u.name,
      u.username,
      u.avatar_url,

      (
        SELECT COUNT(*)::INTEGER
        FROM messages mx
        WHERE
          mx.sender_id=
            CASE
              WHEN m.sender_id=$1
              THEN m.receiver_id
              ELSE m.sender_id
            END
          AND mx.receiver_id=$1
          AND mx.is_read=FALSE
          AND mx.deleted_for_receiver=FALSE
      ) AS unread_count

    FROM messages m

    JOIN users u
      ON u.id=
        CASE
          WHEN m.sender_id=$1
          THEN m.receiver_id
          ELSE m.sender_id
        END

    WHERE
      (
        m.sender_id=$1
        AND m.deleted_for_sender=FALSE
      )
      OR
      (
        m.receiver_id=$1
        AND m.deleted_for_receiver=FALSE
      )

    ORDER BY
      CASE
        WHEN m.sender_id=$1
        THEN m.receiver_id
        ELSE m.sender_id
      END,
      m.created_at DESC
  `,[user.id]);

  rows.rows.sort(
    (a,b) =>
      new Date(b.last_message_at) -
      new Date(a.last_message_at)
  );

  sendJson(res,{
    ok:true,
    conversations:rows.rows
  });

  return;
}


// ------------------------------------------------------------
// MESSAGE REACTION
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/message/reaction"
) {

  const d = await readBody(req);

  const messageId =
    Number(d.get("message_id"));

  const reaction =
    (d.get("reaction") || "")
      .trim()
      .slice(0,30);

  const allowedReactions = [
    "like",
    "love",
    "laugh",
    "sad",
    "angry",
    "wow",
    "👍",
    "❤️",
    "😂",
    "😢",
    "😡",
    "😮"
  ];

  if (
    !Number.isInteger(messageId) ||
    messageId <= 0 ||
    !allowedReactions.includes(reaction)
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_reaction"
    },400);

    return;
  }

  const message = await pool.query(`
    SELECT
      id,
      sender_id,
      receiver_id
    FROM messages
    WHERE id=$1
    LIMIT 1
  `,[messageId]);

  if (!message.rows.length) {

    sendJson(res,{
      ok:false,
      error:"message_not_found"
    },404);

    return;
  }

  const m = message.rows[0];

  if (
    m.sender_id !== user.id &&
    m.receiver_id !== user.id
  ) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  const existing = await pool.query(`
    SELECT id
    FROM message_reactions
    WHERE
      message_id=$1
      AND user_id=$2
    LIMIT 1
  `,[
    messageId,
    user.id
  ]);

  if (existing.rows.length) {

    await pool.query(`
      UPDATE message_reactions
      SET
        reaction=$1,
        created_at=NOW()
      WHERE id=$2
    `,[
      reaction,
      existing.rows[0].id
    ]);

  } else {

    await pool.query(`
      INSERT INTO message_reactions(
        message_id,
        user_id,
        reaction
      )
      VALUES($1,$2,$3)
    `,[
      messageId,
      user.id,
      reaction
    ]);
  }

  const receiverId =
    m.sender_id === user.id
      ? m.receiver_id
      : m.sender_id;

  await notify(
    receiverId,
    user.id,
    "message_reaction",
    messageId,
    `${user.name} به پیام شما واکنش نشان داد.`
  );

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// REMOVE MESSAGE REACTION
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/message/reaction/remove"
) {

  const d = await readBody(req);

  const messageId =
    Number(d.get("message_id"));

  if (
    !Number.isInteger(messageId) ||
    messageId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_message"
    },400);

    return;
  }

  await pool.query(`
    DELETE FROM message_reactions
    WHERE
      message_id=$1
      AND user_id=$2
  `,[
    messageId,
    user.id
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// EDIT MESSAGE
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/message/edit"
) {

  const d = await readBody(req);

  const messageId =
    Number(d.get("message_id"));

  const content =
    (d.get("message") ||
     d.get("content") ||
     "")
      .trim()
      .slice(0,5000);

  if (
    !Number.isInteger(messageId) ||
    messageId <= 0 ||
    !content
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);

    return;
  }

  const result = await pool.query(`
    UPDATE messages
    SET
      message=$1,
      edited=TRUE,
      updated_at=NOW()
    WHERE
      id=$2
      AND sender_id=$3
      AND deleted_for_sender=FALSE
    RETURNING
      id,
      message,
      edited,
      updated_at
  `,[
    content,
    messageId,
    user.id
  ]);

  if (!result.rows.length) {

    sendJson(res,{
      ok:false,
      error:"message_not_found"
    },404);

    return;
  }

  sendJson(res,{
    ok:true,
    message:result.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// DELETE MESSAGE FOR CURRENT USER
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/message/delete"
) {

  const d = await readBody(req);

  const messageId =
    Number(d.get("message_id"));

  const mode =
    (d.get("mode") || "me").trim();

  if (
    !Number.isInteger(messageId) ||
    messageId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_message"
    },400);

    return;
  }

  const message = await pool.query(`
    SELECT
      id,
      sender_id,
      receiver_id
    FROM messages
    WHERE id=$1
    LIMIT 1
  `,[messageId]);

  if (!message.rows.length) {

    sendJson(res,{
      ok:false,
      error:"message_not_found"
    },404);

    return;
  }

  const m = message.rows[0];

  if (
    m.sender_id !== user.id &&
    m.receiver_id !== user.id
  ) {

    sendJson(res,{
      ok:false,
      error:"forbidden"
    },403);

    return;
  }

  if (
    mode === "everyone" &&
    m.sender_id === user.id
  ) {

    await pool.query(`
      DELETE FROM messages
      WHERE id=$1
    `,[messageId]);

  } else if (m.sender_id === user.id) {

    await pool.query(`
      UPDATE messages
      SET deleted_for_sender=TRUE
      WHERE id=$1
    `,[messageId]);

  } else {

    await pool.query(`
      UPDATE messages
      SET deleted_for_receiver=TRUE
      WHERE id=$1
    `,[messageId]);
  }

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// TYPING START
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/message/typing"
) {

  const d = await readBody(req);

  const receiverId =
    Number(d.get("receiver_id"));

  if (
    !Number.isInteger(receiverId) ||
    receiverId <= 0 ||
    receiverId === user.id
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  await pool.query(`
    INSERT INTO message_typing(
      user_id,
      receiver_id,
      updated_at
    )
    VALUES($1,$2,NOW())

    ON CONFLICT(
      user_id,
      receiver_id
    )
    DO UPDATE SET
      updated_at=NOW()
  `,[
    user.id,
    receiverId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// TYPING STATUS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/message/typing"
) {

  const otherId =
    Number(url.searchParams.get("user"));

  if (
    !Number.isInteger(otherId) ||
    otherId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  const result = await pool.query(`
    SELECT
      user_id,
      updated_at
    FROM message_typing
    WHERE
      user_id=$1
      AND receiver_id=$2
      AND updated_at >
        NOW() - INTERVAL '10 seconds'
    LIMIT 1
  `,[
    otherId,
    user.id
  ]);

  sendJson(res,{
    ok:true,
    typing:result.rows.length > 0
  });

  return;
}


// ------------------------------------------------------------
// CLEAN OLD TYPING STATUS
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/message/typing-cleanup"
) {

  const result = await pool.query(`
    DELETE FROM message_typing
    WHERE
      updated_at <
        NOW() - INTERVAL '1 minute'
  `);

  sendJson(res,{
    ok:true,
    deleted:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// MESSAGE SEARCH
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/messages/search"
) {

  const q =
    (url.searchParams.get("q") || "")
      .trim()
      .slice(0,100);

  if (!q) {

    sendJson(res,{
      ok:true,
      messages:[]
    });

    return;
  }

  const result = await pool.query(`
    SELECT
      m.id,
      m.sender_id,
      m.receiver_id,
      m.message,
      m.created_at,

      u.name AS sender_name,
      u.username AS sender_username

    FROM messages m

    JOIN users u
      ON u.id=m.sender_id

    WHERE
      (
        m.sender_id=$1
        OR m.receiver_id=$1
      )
      AND
      m.message ILIKE $2

    ORDER BY
      m.created_at DESC

    LIMIT 100
  `,[
    user.id,
    `%${q}%`
  ]);

  sendJson(res,{
    ok:true,
    messages:result.rows
  });

  return;
}


// ------------------------------------------------------------
// MESSAGE PROFILE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/message/user"
) {

  const otherId =
    Number(url.searchParams.get("id"));

  if (
    !Number.isInteger(otherId) ||
    otherId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  const result = await pool.query(`
    SELECT
      id,
      name,
      username,
      avatar_url,
      bio,
      is_verified,
      is_active
    FROM users
    WHERE id=$1
    LIMIT 1
  `,[otherId]);

  if (!result.rows.length) {

    sendJson(res,{
      ok:false,
      error:"user_not_found"
    },404);

    return;
  }

  sendJson(res,{
    ok:true,
    user:result.rows[0]
  });

  return;
  }// ============================================================
// SECTION 23
// ADVANCED NOTIFICATIONS
// PUSH-READY EVENTS / NOTIFICATION PREFERENCES
// MENTIONS / FOLLOW / LIKE / COMMENT / SYSTEM ALERTS
// ============================================================


// ------------------------------------------------------------
// NOTIFICATION ADVANCED TABLES
// ------------------------------------------------------------

await pool.query(`
  ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN
  DEFAULT FALSE
`);

await pool.query(`
  ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50)
  DEFAULT NULL
`);

await pool.query(`
  ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS entity_id INTEGER
  DEFAULT NULL
`);

await pool.query(`
  ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP
  DEFAULT NOW()
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    likes BOOLEAN DEFAULT TRUE,
    comments BOOLEAN DEFAULT TRUE,
    follows BOOLEAN DEFAULT TRUE,
    messages BOOLEAN DEFAULT TRUE,
    mentions BOOLEAN DEFAULT TRUE,
    story_replies BOOLEAN DEFAULT TRUE,
    live BOOLEAN DEFAULT TRUE,
    payments BOOLEAN DEFAULT TRUE,
    security BOOLEAN DEFAULT TRUE,
    marketing BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id)
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications(user_id,is_read,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON notifications(entity_type,entity_id,created_at DESC)
`);


// ------------------------------------------------------------
// ENSURE NOTIFICATION PREFERENCES
// ------------------------------------------------------------

async function ensureNotificationPreferences(userId) {

  await pool.query(`
    INSERT INTO notification_preferences(user_id)
    VALUES($1)
    ON CONFLICT(user_id)
    DO NOTHING
  `,[userId]);
}


// ------------------------------------------------------------
// SMART NOTIFICATION HELPER
// ------------------------------------------------------------

async function createNotification(
  receiverId,
  senderId,
  type,
  entityType,
  entityId,
  message
) {

  if (
    !Number.isInteger(receiverId) ||
    receiverId <= 0
  ) {
    return;
  }

  if (senderId === receiverId) {
    return;
  }

  await ensureNotificationPreferences(receiverId);

  const pref = await pool.query(`
    SELECT
      likes,
      comments,
      follows,
      messages,
      mentions,
      story_replies,
      live,
      payments,
      security,
      marketing
    FROM notification_preferences
    WHERE user_id=$1
    LIMIT 1
  `,[receiverId]);

  if (pref.rows.length) {

    const p = pref.rows[0];

    const allowed =
      type === "like"
        ? p.likes
        : type === "comment"
        ? p.comments
        : type === "follow"
        ? p.follows
        : type === "message"
        ? p.messages
        : type === "mention"
        ? p.mentions
        : type === "story_reply"
        ? p.story_replies
        : type === "live"
        ? p.live
        : type === "payment"
        ? p.payments
        : type === "security"
        ? p.security
        : type === "marketing"
        ? p.marketing
        : true;

    if (!allowed) {
      return;
    }
  }

  await pool.query(`
    INSERT INTO notifications(
      user_id,
      actor_id,
      type,
      message,
      entity_type,
      entity_id,
      is_read,
      created_at
    )
    VALUES(
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      FALSE,
      NOW()
    )
  `,[
    receiverId,
    senderId || null,
    type,
    message,
    entityType || null,
    Number.isInteger(entityId)
      ? entityId
      : null
  ]);
}


// ------------------------------------------------------------
// NOTIFICATION PREFERENCES PAGE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/notification-preferences"
) {

  await ensureNotificationPreferences(user.id);

  const result = await pool.query(`
    SELECT *
    FROM notification_preferences
    WHERE user_id=$1
    LIMIT 1
  `,[user.id]);

  const p = result.rows[0];

  sendPage(
    res,
    "تنظیمات اعلان‌ها",
    `
      <div class="card">

        <h2>
          🔔 تنظیمات اعلان‌ها
        </h2>

        <form
          method="POST"
          action="/notification-preferences"
        >

          <label>
            <input
              type="checkbox"
              name="likes"
              ${p.likes ? "checked" : ""}
            >
            لایک‌ها
          </label>

          <br>

          <label>
            <input
              type="checkbox"
              name="comments"
              ${p.comments ? "checked" : ""}
            >
            نظرات
          </label>

          <br>

          <label>
            <input
              type="checkbox"
              name="follows"
              ${p.follows ? "checked" : ""}
            >
            دنبال کردن‌ها
          </label>

          <br>

          <label>
            <input
              type="checkbox"
              name="messages"
              ${p.messages ? "checked" : ""}
            >
            پیام‌ها
          </label>

          <br>

          <label>
            <input
              type="checkbox"
              name="mentions"
              ${p.mentions ? "checked" : ""}
            >
            منشن‌ها
          </label>

          <br>

          <label>
            <input
              type="checkbox"
              name="story_replies"
              ${p.story_replies ? "checked" : ""}
            >
            پاسخ استوری
          </label>

          <br>

          <label>
            <input
              type="checkbox"
              name="live"
              ${p.live ? "checked" : ""}
            >
            لایو
          </label>

          <br>

          <label>
            <input
              type="checkbox"
              name="payments"
              ${p.payments ? "checked" : ""}
            >
            پرداخت‌ها
          </label>

          <br>

          <label>
            <input
              type="checkbox"
              name="security"
              ${p.security ? "checked" : ""}
            >
            امنیت حساب
          </label>

          <br>

          <label>
            <input
              type="checkbox"
              name="marketing"
              ${p.marketing ? "checked" : ""}
            >
            اعلان‌های تبلیغاتی
          </label>

          <br><br>

          <button class="btn">
            ذخیره تنظیمات
          </button>

        </form>

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// SAVE NOTIFICATION PREFERENCES
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/notification-preferences"
) {

  const d = await readBody(req);

  const boolValue = name =>
    d.has(name);

  await pool.query(`
    INSERT INTO notification_preferences(
      user_id,
      likes,
      comments,
      follows,
      messages,
      mentions,
      story_replies,
      live,
      payments,
      security,
      marketing,
      updated_at
    )
    VALUES(
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      NOW()
    )

    ON CONFLICT(user_id)
    DO UPDATE SET
      likes=$2,
      comments=$3,
      follows=$4,
      messages=$5,
      mentions=$6,
      story_replies=$7,
      live=$8,
      payments=$9,
      security=$10,
      marketing=$11,
      updated_at=NOW()
  `,[
    user.id,
    boolValue("likes"),
    boolValue("comments"),
    boolValue("follows"),
    boolValue("messages"),
    boolValue("mentions"),
    boolValue("story_replies"),
    boolValue("live"),
    boolValue("payments"),
    boolValue("security"),
    boolValue("marketing")
  ]);

  redirect(
    res,
    "/notification-preferences"
  );

  return;
}


// ------------------------------------------------------------
// NOTIFICATION COUNT API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/notifications/count"
) {

  const result = await pool.query(`
    SELECT
      COUNT(*)::INTEGER AS count
    FROM notifications
    WHERE
      user_id=$1
      AND is_read=FALSE
  `,[user.id]);

  sendJson(res,{
    ok:true,
    count:Number(
      result.rows[0].count || 0
    )
  });

  return;
}


// ------------------------------------------------------------
// NOTIFICATION LIST API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/notifications"
) {

  const limitRaw =
    Number(
      url.searchParams.get("limit") || 50
    );

  const limit =
    Math.max(
      1,
      Math.min(
        100,
        Number.isInteger(limitRaw)
          ? limitRaw
          : 50
      )
    );

  const result = await pool.query(`
    SELECT
      n.id,
      n.type,
      n.message,
      n.entity_type,
      n.entity_id,
      n.is_read,
      n.created_at,

      a.id AS actor_id,
      a.name AS actor_name,
      a.username AS actor_username,
      a.avatar_url AS actor_avatar,
      a.is_verified AS actor_verified

    FROM notifications n

    LEFT JOIN users a
      ON a.id=n.actor_id

    WHERE n.user_id=$1

    ORDER BY
      n.created_at DESC

    LIMIT $2
  `,[
    user.id,
    limit
  ]);

  sendJson(res,{
    ok:true,
    notifications:result.rows
  });

  return;
}


// ------------------------------------------------------------
// MARK ONE NOTIFICATION AS READ
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/notification/read"
) {

  const d = await readBody(req);

  const notificationId =
    Number(d.get("id"));

  if (
    !Number.isInteger(notificationId) ||
    notificationId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_notification"
    },400);

    return;
  }

  const result = await pool.query(`
    UPDATE notifications
    SET is_read=TRUE
    WHERE
      id=$1
      AND user_id=$2
  `,[
    notificationId,
    user.id
  ]);

  sendJson(res,{
    ok:true,
    updated:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// MARK ALL NOTIFICATIONS AS READ
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/notifications/read-all"
) {

  const result = await pool.query(`
    UPDATE notifications
    SET is_read=TRUE
    WHERE
      user_id=$1
      AND is_read=FALSE
  `,[user.id]);

  sendJson(res,{
    ok:true,
    updated:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// DELETE ONE NOTIFICATION
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/notification/delete"
) {

  const d = await readBody(req);

  const notificationId =
    Number(d.get("id"));

  if (
    !Number.isInteger(notificationId) ||
    notificationId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_notification"
    },400);

    return;
  }

  const result = await pool.query(`
    DELETE FROM notifications
    WHERE
      id=$1
      AND user_id=$2
  `,[
    notificationId,
    user.id
  ]);

  sendJson(res,{
    ok:true,
    deleted:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// DELETE ALL NOTIFICATIONS
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/notifications/delete-all"
) {

  const result = await pool.query(`
    DELETE FROM notifications
    WHERE user_id=$1
  `,[user.id]);

  sendJson(res,{
    ok:true,
    deleted:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// NOTIFICATION PAGINATION
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/notifications/page"
) {

  const beforeId =
    Number(
      url.searchParams.get("before_id") || 0
    );

  const limitRaw =
    Number(
      url.searchParams.get("limit") || 50
    );

  const limit =
    Math.max(
      1,
      Math.min(
        100,
        Number.isInteger(limitRaw)
          ? limitRaw
          : 50
      )
    );

  const result = await pool.query(`
    SELECT
      n.id,
      n.type,
      n.message,
      n.entity_type,
      n.entity_id,
      n.is_read,
      n.created_at,

      u.id AS actor_id,
      u.name AS actor_name,
      u.username AS actor_username,
      u.avatar_url AS actor_avatar

    FROM notifications n

    LEFT JOIN users u
      ON u.id=n.actor_id

    WHERE
      n.user_id=$1
      AND
      (
        $2=0
        OR n.id < $2
      )

    ORDER BY
      n.id DESC

    LIMIT $3
  `,[
    user.id,
    Number.isInteger(beforeId)
      ? beforeId
      : 0,
    limit
  ]);

  sendJson(res,{
    ok:true,
    notifications:result.rows,
    next_before_id:
      result.rows.length
        ? result.rows[result.rows.length-1].id
        : null
  });

  return;
}


// ------------------------------------------------------------
// SECURITY NOTIFICATION
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/security/notification"
) {

  const d = await readBody(req);

  const message =
    (d.get("message") || "")
      .trim()
      .slice(0,500);

  if (!message) {

    sendJson(res,{
      ok:false,
      error:"empty_message"
    },400);

    return;
  }

  await createNotification(
    user.id,
    null,
    "security",
    "security",
    null,
    message
  );

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// CLEAN OLD NOTIFICATIONS
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/notifications/cleanup"
) {

  const result = await pool.query(`
    DELETE FROM notifications
    WHERE
      user_id=$1
      AND is_read=TRUE
      AND created_at <
        NOW() - INTERVAL '180 days'
  `,[user.id]);

  sendJson(res,{
    ok:true,
    deleted:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// NOTIFICATION HEALTH
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/notifications/health"
) {

  const total = await pool.query(`
    SELECT
      COUNT(*)::INTEGER AS count
    FROM notifications
    WHERE user_id=$1
  `,[user.id]);

  const unread = await pool.query(`
    SELECT
      COUNT(*)::INTEGER AS count
    FROM notifications
    WHERE
      user_id=$1
      AND is_read=FALSE
  `,[user.id]);

  sendJson(res,{
    ok:true,
    total:Number(total.rows[0].count || 0),
    unread:Number(unread.rows[0].count || 0)
  });

  return;
    }// ============================================================
// SECTION 24
// ADVANCED PROFILE SYSTEM
// PROFILE SETTINGS / SOCIAL LINKS / VERIFICATION
// FOLLOWERS / FOLLOWING / PROFILE SEARCH / USER DISCOVERY
// ============================================================


// ------------------------------------------------------------
// PROFILE ADVANCED TABLES
// ------------------------------------------------------------

await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS website VARCHAR(500)
`);

await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS location VARCHAR(255)
`);

await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birth_date DATE
`);

await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender VARCHAR(50)
`);

await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50)
`);

await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_public BOOLEAN
  DEFAULT TRUE
`);

await pool.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP
  DEFAULT NULL
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS social_links (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    platform VARCHAR(50) NOT NULL,
    url VARCHAR(500) NOT NULL,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id,platform)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS profile_settings (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    show_email BOOLEAN DEFAULT FALSE,
    show_phone BOOLEAN DEFAULT FALSE,
    show_location BOOLEAN DEFAULT TRUE,
    show_birth_date BOOLEAN DEFAULT FALSE,
    show_followers BOOLEAN DEFAULT TRUE,
    show_following BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id)
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_social_links_user
  ON social_links(user_id)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_users_username
  ON users(username)
`);


// ------------------------------------------------------------
// ENSURE PROFILE SETTINGS
// ------------------------------------------------------------

async function ensureProfileSettings(userId) {

  await pool.query(`
    INSERT INTO profile_settings(user_id)
    VALUES($1)
    ON CONFLICT(user_id)
    DO NOTHING
  `,[userId]);
}


// ------------------------------------------------------------
// PROFILE API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/profile"
) {

  const profileId =
    Number(url.searchParams.get("id"));

  if (
    !Number.isInteger(profileId) ||
    profileId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  const result = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      u.bio,
      u.avatar_url,
      u.website,
      u.location,
      u.birth_date,
      u.gender,
      u.is_verified,
      u.profile_public,

      COALESCE(
        ps.show_followers,
        TRUE
      ) AS show_followers,

      COALESCE(
        ps.show_following,
        TRUE
      ) AS show_following

    FROM users u

    LEFT JOIN profile_settings ps
      ON ps.user_id=u.id

    WHERE
      u.id=$1
      AND u.is_active=TRUE

    LIMIT 1
  `,[profileId]);

  if (!result.rows.length) {

    sendJson(res,{
      ok:false,
      error:"user_not_found"
    },404);

    return;
  }

  const profile =
    result.rows[0];

  const counts = await pool.query(`
    SELECT
      (
        SELECT COUNT(*)::INTEGER
        FROM posts
        WHERE
          user_id=$1
          AND archived=FALSE
      ) AS posts,

      (
        SELECT COUNT(*)::INTEGER
        FROM follows
        WHERE
          following_id=$1
      ) AS followers,

      (
        SELECT COUNT(*)::INTEGER
        FROM follows
        WHERE
          follower_id=$1
      ) AS following
  `,[profileId]);

  let followers =
    Number(counts.rows[0].followers || 0);

  let following =
    Number(counts.rows[0].following || 0);

  if (!profile.show_followers) {
    followers = null;
  }

  if (!profile.show_following) {
    following = null;
  }

  const relation = await pool.query(`
    SELECT
      EXISTS(
        SELECT 1
        FROM follows
        WHERE
          follower_id=$1
          AND following_id=$2
      ) AS following,

      EXISTS(
        SELECT 1
        FROM follow_requests
        WHERE
          requester_id=$1
          AND target_id=$2
          AND status='pending'
      ) AS request_pending
  `,[
    user.id,
    profileId
  ]);

  sendJson(res,{
    ok:true,
    profile:{
      ...profile,
      followers,
      following,
      posts:Number(
        counts.rows[0].posts || 0
      ),
      is_following:
        relation.rows[0].following,
      request_pending:
        relation.rows[0].request_pending
    }
  });

  return;
}


// ------------------------------------------------------------
// PROFILE SOCIAL LINKS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/profile/social-links"
) {

  const profileId =
    Number(
      url.searchParams.get("id") ||
      user.id
    );

  if (
    !Number.isInteger(profileId) ||
    profileId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  const result = await pool.query(`
    SELECT
      id,
      platform,
      url,
      created_at
    FROM social_links
    WHERE user_id=$1
    ORDER BY platform ASC
  `,[profileId]);

  sendJson(res,{
    ok:true,
    links:result.rows
  });

  return;
}


// ------------------------------------------------------------
// ADD / UPDATE SOCIAL LINK
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/profile/social-link"
) {

  const d = await readBody(req);

  const platform =
    (d.get("platform") || "")
      .trim()
      .toLowerCase()
      .slice(0,50);

  const rawUrl =
    (d.get("url") || "")
      .trim()
      .slice(0,500);

  const allowedPlatforms = [
    "instagram",
    "youtube",
    "telegram",
    "x",
    "facebook",
    "tiktok",
    "linkedin",
    "website"
  ];

  if (
    !allowedPlatforms.includes(platform) ||
    !rawUrl
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);

    return;
  }

  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {

    sendJson(res,{
      ok:false,
      error:"invalid_url"
    },400);

    return;
  }

  if (
    !["http:","https:"].includes(
      parsed.protocol
    )
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_url"
    },400);

    return;
  }

  await pool.query(`
    INSERT INTO social_links(
      user_id,
      platform,
      url,
      updated_at
    )
    VALUES(
      $1,
      $2,
      $3,
      NOW()
    )

    ON CONFLICT(
      user_id,
      platform
    )
    DO UPDATE SET
      url=$3,
      updated_at=NOW()
  `,[
    user.id,
    platform,
    parsed.toString()
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// DELETE SOCIAL LINK
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/profile/social-link/delete"
) {

  const d = await readBody(req);

  const platform =
    (d.get("platform") || "")
      .trim()
      .toLowerCase();

  if (!platform) {

    sendJson(res,{
      ok:false,
      error:"invalid_platform"
    },400);

    return;
  }

  await pool.query(`
    DELETE FROM social_links
    WHERE
      user_id=$1
      AND platform=$2
  `,[
    user.id,
    platform
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// PROFILE SETTINGS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/profile/settings"
) {

  await ensureProfileSettings(user.id);

  const result = await pool.query(`
    SELECT
      show_email,
      show_phone,
      show_location,
      show_birth_date,
      show_followers,
      show_following
    FROM profile_settings
    WHERE user_id=$1
    LIMIT 1
  `,[user.id]);

  sendJson(res,{
    ok:true,
    settings:result.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// SAVE PROFILE SETTINGS
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/profile/settings"
) {

  const d = await readBody(req);

  const boolValue =
    name => d.has(name);

  await pool.query(`
    INSERT INTO profile_settings(
      user_id,
      show_email,
      show_phone,
      show_location,
      show_birth_date,
      show_followers,
      show_following,
      updated_at
    )
    VALUES(
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      NOW()
    )

    ON CONFLICT(user_id)
    DO UPDATE SET
      show_email=$2,
      show_phone=$3,
      show_location=$4,
      show_birth_date=$5,
      show_followers=$6,
      show_following=$7,
      updated_at=NOW()
  `,[
    user.id,
    boolValue("show_email"),
    boolValue("show_phone"),
    boolValue("show_location"),
    boolValue("show_birth_date"),
    boolValue("show_followers"),
    boolValue("show_following")
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// PROFILE EDIT API
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/profile/update"
) {

  const d = await readBody(req);

  const name =
    (d.get("name") || "")
      .trim()
      .slice(0,100);

  const username =
    (d.get("username") || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g,"")
      .slice(0,50);

  const bio =
    (d.get("bio") || "")
      .trim()
      .slice(0,1000);

  const website =
    (d.get("website") || "")
      .trim()
      .slice(0,500);

  const location =
    (d.get("location") || "")
      .trim()
      .slice(0,255);

  const gender =
    (d.get("gender") || "")
      .trim()
      .slice(0,50);

  const birthDate =
    (d.get("birth_date") || "")
      .trim();

  if (!name) {

    sendJson(res,{
      ok:false,
      error:"name_required"
    },400);

    return;
  }

  if (
    username &&
    !/^[a-z0-9_.]{3,50}$/.test(username)
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_username"
    },400);

    return;
  }

  if (username) {

    const duplicate =
      await pool.query(`
        SELECT id
        FROM users
        WHERE
          LOWER(username)=LOWER($1)
          AND id<>$2
        LIMIT 1
      `,[
        username,
        user.id
      ]);

    if (duplicate.rows.length) {

      sendJson(res,{
        ok:false,
        error:"username_taken"
      },409);

      return;
    }
  }

  let validBirthDate = null;

  if (birthDate) {

    const date =
      new Date(`${birthDate}T00:00:00`);

    if (
      Number.isNaN(date.getTime())
    ) {

      sendJson(res,{
        ok:false,
        error:"invalid_birth_date"
      },400);

      return;
    }

    validBirthDate =
      birthDate;
  }

  let validWebsite = null;

  if (website) {

    try {

      const parsed =
        new URL(website);

      if (
        !["http:","https:"].includes(
          parsed.protocol
        )
      ) {
        throw new Error(
          "invalid protocol"
        );
      }

      validWebsite =
        parsed.toString();

    } catch {

      sendJson(res,{
        ok:false,
        error:"invalid_website"
      },400);

      return;
    }
  }

  const result =
    await pool.query(`
      UPDATE users
      SET
        name=$1,
        username=$2,
        bio=$3,
        website=$4,
        location=$5,
        gender=$6,
        birth_date=$7
      WHERE id=$8
      RETURNING
        id,
        name,
        username,
        bio,
        avatar_url,
        website,
        location,
        gender,
        birth_date
    `,[
      name,
      username || null,
      bio,
      validWebsite,
      location || null,
      gender || null,
      validBirthDate,
      user.id
    ]);

  sendJson(res,{
    ok:true,
    user:result.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// USERNAME AVAILABILITY
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/username/check"
) {

  const username =
    (url.searchParams.get("username") || "")
      .trim()
      .toLowerCase();

  if (
    !/^[a-z0-9_.]{3,50}$/.test(username)
  ) {

    sendJson(res,{
      ok:true,
      available:false
    });

    return;
  }

  const result = await pool.query(`
    SELECT id
    FROM users
    WHERE LOWER(username)=LOWER($1)
    LIMIT 1
  `,[username]);

  sendJson(res,{
    ok:true,
    available:result.rows.length === 0
  });

  return;
}


// ------------------------------------------------------------
// FOLLOWERS API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/profile/followers"
) {

  const profileId =
    Number(
      url.searchParams.get("id") ||
      user.id
    );

  if (
    !Number.isInteger(profileId) ||
    profileId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  const result = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      u.avatar_url,
      u.is_verified,

      EXISTS(
        SELECT 1
        FROM follows f2
        WHERE
          f2.follower_id=$1
          AND f2.following_id=u.id
      ) AS is_following

    FROM follows f

    JOIN users u
      ON u.id=f.follower_id

    WHERE
      f.following_id=$2
      AND u.is_active=TRUE

    ORDER BY
      f.created_at DESC

    LIMIT 500
  `,[
    user.id,
    profileId
  ]);

  sendJson(res,{
    ok:true,
    users:result.rows
  });

  return;
}


// ------------------------------------------------------------
// FOLLOWING API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/profile/following"
) {

  const profileId =
    Number(
      url.searchParams.get("id") ||
      user.id
    );

  if (
    !Number.isInteger(profileId) ||
    profileId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  const result = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      u.avatar_url,
      u.is_verified,

      EXISTS(
        SELECT 1
        FROM follows f2
        WHERE
          f2.follower_id=$1
          AND f2.following_id=u.id
      ) AS is_following

    FROM follows f

    JOIN users u
      ON u.id=f.following_id

    WHERE
      f.follower_id=$2
      AND u.is_active=TRUE

    ORDER BY
      f.created_at DESC

    LIMIT 500
  `,[
    user.id,
    profileId
  ]);

  sendJson(res,{
    ok:true,
    users:result.rows
  });

  return;
}


// ------------------------------------------------------------
// USER DISCOVERY API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/discover/users"
) {

  const q =
    (url.searchParams.get("q") || "")
      .trim()
      .slice(0,100);

  if (!q) {

    sendJson(res,{
      ok:true,
      users:[]
    });

    return;
  }

  const result = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      u.avatar_url,
      u.bio,
      u.is_verified,

      EXISTS(
        SELECT 1
        FROM follows f
        WHERE
          f.follower_id=$1
          AND f.following_id=u.id
      ) AS is_following

    FROM users u

   // ============================================================
// SECTION 25
// ADVANCED SEARCH & DISCOVERY
// GLOBAL SEARCH / USERS / POSTS / REELS / HASHTAGS
// SEARCH HISTORY / TRENDING / SUGGESTIONS
// ============================================================


// ------------------------------------------------------------
// SEARCH TABLES
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS search_history (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    query VARCHAR(255) NOT NULL,

    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS search_trends (
    id SERIAL PRIMARY KEY,

    query VARCHAR(255) NOT NULL,

    search_count INTEGER DEFAULT 1,

    last_searched_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(query)
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_search_history_user
  ON search_history(user_id,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_search_trends_count
  ON search_trends(search_count DESC,last_searched_at DESC)
`);


// ------------------------------------------------------------
// GLOBAL SEARCH API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/global-search"
) {

  const q =
    (url.searchParams.get("q") || "")
      .trim()
      .slice(0,100);

  if (!q) {

    sendJson(res,{
      ok:true,
      users:[],
      posts:[],
      reels:[],
      hashtags:[]
    });

    return;
  }

  await pool.query(`
    INSERT INTO search_history(
      user_id,
      query
    )
    VALUES($1,$2)
  `,[
    user.id,
    q
  ]);

  await pool.query(`
    INSERT INTO search_trends(
      query,
      search_count,
      last_searched_at
    )
    VALUES(
      $1,
      1,
      NOW()
    )

    ON CONFLICT(query)
    DO UPDATE SET
      search_count=
        search_trends.search_count+1,
      last_searched_at=NOW()
  `,[q]);

  const users = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      u.avatar_url,
      u.is_verified,

      EXISTS(
        SELECT 1
        FROM follows f
        WHERE
          f.follower_id=$1
          AND f.following_id=u.id
      ) AS is_following

    FROM users u

    WHERE
      u.is_active=TRUE
      AND u.id<>$1
      AND (
        LOWER(u.name) LIKE LOWER($2)
        OR
        LOWER(COALESCE(u.username,'')) LIKE LOWER($2)
      )

    ORDER BY
      u.is_verified DESC,
      u.id DESC

    LIMIT 20
  `,[
    user.id,
    `%${q}%`
  ]);

  const posts = await pool.query(`
    SELECT
      p.id,
      p.user_id,
      p.content,
      p.image_url,
      p.media_type,
      p.created_at,

      u.name,
      u.username,
      u.avatar_url,
      u.is_verified

    FROM posts p

    JOIN users u
      ON u.id=p.user_id

    WHERE
      p.archived=FALSE
      AND u.is_active=TRUE
      AND (
        p.content ILIKE $1
        OR
        COALESCE(p.location,'') ILIKE $1
      )

    ORDER BY
      p.created_at DESC

    LIMIT 30
  `,[
    `%${q}%`
  ]);

  const reels = await pool.query(`
    SELECT
      r.id,
      r.user_id,
      r.caption,
      r.video_url,
      r.thumbnail_url,
      r.created_at,

      u.name,
      u.username,
      u.avatar_url,
      u.is_verified

    FROM reels r

    JOIN users u
      ON u.id=r.user_id

    WHERE
      u.is_active=TRUE
      AND (
        r.caption ILIKE $1
        OR
        COALESCE(r.location,'') ILIKE $1
      )

    ORDER BY
      r.created_at DESC

    LIMIT 30
  `,[
    `%${q}%`
  ]);

  const hashtags = await pool.query(`
    SELECT
      h.id,
      h.tag,
      h.created_at,

      (
        SELECT COUNT(*)::INTEGER
        FROM hashtag_posts hp
        WHERE hp.hashtag_id=h.id
      )
      +
      (
        SELECT COUNT(*)::INTEGER
        FROM hashtag_reels hr
        WHERE hr.hashtag_id=h.id
      )
      AS usage_count

    FROM hashtags h

    WHERE
      h.tag ILIKE $1

    ORDER BY
      usage_count DESC,
      h.id DESC

    LIMIT 20
  `,[
    `%${q}%`
  ]);

  sendJson(res,{
    ok:true,
    query:q,
    users:users.rows,
    posts:posts.rows,
    reels:reels.rows,
    hashtags:hashtags.rows
  });

  return;
}


// ------------------------------------------------------------
// SEARCH HISTORY
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/search-history"
) {

  const result = await pool.query(`
    SELECT
      id,
      query,
      created_at
    FROM search_history
    WHERE user_id=$1
    ORDER BY created_at DESC
    LIMIT 50
  `,[user.id]);

  sendJson(res,{
    ok:true,
    history:result.rows
  });

  return;
}


// ------------------------------------------------------------
// DELETE SEARCH HISTORY ITEM
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/search-history/delete"
) {

  const d = await readBody(req);

  const id =
    Number(d.get("id"));

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_id"
    },400);

    return;
  }

  const result = await pool.query(`
    DELETE FROM search_history
    WHERE
      id=$1
      AND user_id=$2
  `,[
    id,
    user.id
  ]);

  sendJson(res,{
    ok:true,
    deleted:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// CLEAR SEARCH HISTORY
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/search-history/clear"
) {

  const result = await pool.query(`
    DELETE FROM search_history
    WHERE user_id=$1
  `,[user.id]);

  sendJson(res,{
    ok:true,
    deleted:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// TRENDING SEARCHES
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/search-trending"
) {

  const result = await pool.query(`
    SELECT
      query,
      search_count,
      last_searched_at
    FROM search_trends

    WHERE
      last_searched_at >
        NOW() - INTERVAL '7 days'

    ORDER BY
      search_count DESC,
      last_searched_at DESC

    LIMIT 30
  `);

  sendJson(res,{
    ok:true,
    trends:result.rows
  });

  return;
}


// ------------------------------------------------------------
// SEARCH SUGGESTIONS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/search-suggestions"
) {

  const q =
    (url.searchParams.get("q") || "")
      .trim()
      .slice(0,80);

  if (!q) {

    sendJson(res,{
      ok:true,
      suggestions:[]
    });

    return;
  }

  const users = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      u.avatar_url,
      u.is_verified

    FROM users u

    WHERE
      u.is_active=TRUE
      AND (
        LOWER(u.username) LIKE LOWER($1)
        OR
        LOWER(u.name) LIKE LOWER($1)
      )

    ORDER BY
      u.is_verified DESC,
      u.id DESC

    LIMIT 10
  `,[
    `${q}%`
  ]);

  const tags = await pool.query(`
    SELECT
      id,
      tag

    FROM hashtags

    WHERE
      tag ILIKE $1

    ORDER BY
      id DESC

    LIMIT 10
  `,[
    `${q}%`
  ]);

  sendJson(res,{
    ok:true,
    suggestions:[
      ...users.rows.map(x => ({
        type:"user",
        id:x.id,
        name:x.name,
        username:x.username,
        avatar_url:x.avatar_url,
        is_verified:x.is_verified
      })),

      ...tags.rows.map(x => ({
        type:"hashtag",
        id:x.id,
        tag:x.tag
      }))
    ]
  });

  return;
}


// ------------------------------------------------------------
// TRENDING HASHTAGS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/trending-hashtags"
) {

  const result = await pool.query(`
    SELECT
      h.id,
      h.tag,

      (
        SELECT COUNT(*)::INTEGER
        FROM hashtag_posts hp
        JOIN posts p
          ON p.id=hp.post_id
        WHERE
          hp.hashtag_id=h.id
          AND p.created_at >
            NOW() - INTERVAL '7 days'
      )
      +
      (
        SELECT COUNT(*)::INTEGER
        FROM hashtag_reels hr
        JOIN reels r
          ON r.id=hr.reel_id
        WHERE
          hr.hashtag_id=h.id
          AND r.created_at >
            NOW() - INTERVAL '7 days'
      ) AS recent_usage

    FROM hashtags h

    ORDER BY
      recent_usage DESC,
      h.id DESC

    LIMIT 30
  `);

  sendJson(res,{
    ok:true,
    hashtags:result.rows
  });

  return;
}


// ------------------------------------------------------------
// USER SUGGESTIONS BASED ON FOLLOW NETWORK
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/discover/suggested-users"
) {

  const result = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      u.avatar_url,
      u.is_verified,

      COUNT(*)::INTEGER AS mutual_connections

    FROM follows f1

    JOIN follows f2
      ON f2.following_id=f1.following_id

    JOIN users u
      ON u.id=f2.follower_id

    WHERE
      f1.follower_id=$1
      AND f2.follower_id<>$1
      AND f2.following_id<>$1
      AND u.is_active=TRUE

      AND NOT EXISTS(
        SELECT 1
        FROM follows fx
        WHERE
          fx.follower_id=$1
          AND fx.following_id=u.id
      )

    GROUP BY
      u.id

    ORDER BY
      mutual_connections DESC,
      u.is_verified DESC,
      u.id DESC

    LIMIT 30
  `,[user.id]);

  sendJson(res,{
    ok:true,
    users:result.rows
  });

  return;
}


// ------------------------------------------------------------
// DISCOVERY FEED
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/discover/feed"
) {

  const limitRaw =
    Number(
      url.searchParams.get("limit") || 30
    );

  const limit =
    Math.max(
      1,
      Math.min(
        50,
        Number.isInteger(limitRaw)
          ? limitRaw
          : 30
      )
    );

  const result = await pool.query(`
    SELECT
      p.id,
      p.user_id,
      p.content,
      p.image_url,
      p.media_type,
      p.location,
      p.created_at,

      u.name,
      u.username,
      u.avatar_url,
      u.is_verified,

      (
        SELECT COUNT(*)::INTEGER
        FROM likes l
        WHERE l.post_id=p.id
      ) AS likes,

      (
        SELECT COUNT(*)::INTEGER
        FROM comments c
        WHERE c.post_id=p.id
      ) AS comments,

      EXISTS(
        SELECT 1
        FROM likes ml
        WHERE
          ml.post_id=p.id
          AND ml.user_id=$1
      ) AS liked,

      EXISTS(
        SELECT 1
        FROM bookmarks b
        WHERE
          b.post_id=p.id
          AND b.user_id=$1
      ) AS bookmarked

    FROM posts p

    JOIN users u
      ON u.id=p.user_id

    WHERE
      p.archived=FALSE
      AND u.is_active=TRUE
      AND p.user_id<>$1

      AND NOT EXISTS(
        SELECT 1
        FROM blocked_users b
        WHERE
          (
            b.blocker_id=$1
            AND b.blocked_id=p.user_id
          )
          OR
          (
            b.blocker_id=p.user_id
            AND b.blocked_id=$1
          )
      )

    ORDER BY
      (
        (
          SELECT COUNT(*)
          FROM likes l
          WHERE l.post_id=p.id
        ) * 3
        +
        (
          SELECT COUNT(*)
          FROM comments c
          WHERE c.post_id=p.id
        ) * 2
      ) DESC,

      p.created_at DESC

    LIMIT $2
  `,[
    user.id,
    limit
  ]);

  sendJson(res,{
    ok:true,
    posts:result.rows
  });

  return;
}


// ------------------------------------------------------------
// SEARCH RESULT COUNTS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/search/counts"
) {

  const q =
    (url.searchParams.get("q") || "")
      .trim()
      .slice(0,100);

  if (!q) {

    sendJson(res,{
      ok:true,
      users:0,
      posts:0,
      reels:0,
      hashtags:0
    });

    return;
  }

  const users = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM users
    WHERE
      is_active=TRUE
      AND (
        name ILIKE $1
        OR COALESCE(username,'') ILIKE $1
      )
  `,[
    `%${q}%`
  ]);

  const posts = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM posts
    WHERE
      archived=FALSE
      AND content ILIKE $1
  `,[
    `%${q}%`
  ]);

  const reels = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM reels
    WHERE
      caption ILIKE $1
  `,[
    `%${q}%`
  ]);

  const hashtags = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM hashtags
    WHERE
      tag ILIKE $1
  `,[
    `%${q}%`
  ]);

  sendJson(res,{
    ok:true,
    users:Number(users.rows[0].count || 0),
    posts:Number(posts.rows[0].count || 0),
    reels:Number(reels.rows[0].count || 0),
    hashtags:Number(hashtags.rows[0].count || 0)
  });

  return;
}// ============================================================
// SECTION 26
// ADVANCED SECURITY / SESSION & DEVICE MANAGEMENT
// LOGIN PROTECTION / ACCOUNT SECURITY / PASSWORD RESET
// ============================================================


// ------------------------------------------------------------
// SECURITY TABLES
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS user_devices (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    device_name VARCHAR(255),

    user_agent TEXT,

    ip_address VARCHAR(100),

    last_seen TIMESTAMP DEFAULT NOW(),

    created_at TIMESTAMP DEFAULT NOW(),

    revoked BOOLEAN DEFAULT FALSE
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,

    user_id INTEGER
      REFERENCES users(id)
      ON DELETE SET NULL,

    identifier VARCHAR(255),

    ip_address VARCHAR(100),

    success BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    token_hash VARCHAR(128) NOT NULL UNIQUE,

    expires_at TIMESTAMP NOT NULL,

    used BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_user_devices_user
  ON user_devices(user_id,last_seen DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
  ON login_attempts(ip_address,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_login_attempts_user
  ON login_attempts(user_id,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_password_reset_user
  ON password_reset_tokens(user_id,created_at DESC)
`);


// ------------------------------------------------------------
// ADD SECURITY COLUMNS TO SESSIONS
// ------------------------------------------------------------

await pool.query(`
  ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
`);

await pool.query(`
  ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW()
`);

await pool.query(`
  ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100)
`);

await pool.query(`
  ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS user_agent TEXT
`);


// ------------------------------------------------------------
// SECURITY STATUS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/security/status"
) {

  const devices = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM user_devices
    WHERE
      user_id=$1
      AND revoked=FALSE
  `,[user.id]);

  const sessions = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM sessions
    WHERE user_id=$1
  `,[user.id]);

  const failed = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM login_attempts
    WHERE
      user_id=$1
      AND success=FALSE
      AND created_at >
        NOW() - INTERVAL '24 hours'
  `,[user.id]);

  sendJson(res,{
    ok:true,
    active_devices:Number(
      devices.rows[0]?.count || 0
    ),
    active_sessions:Number(
      sessions.rows[0]?.count || 0
    ),
    failed_logins_24h:Number(
      failed.rows[0]?.count || 0
    )
  });

  return;
}


// ------------------------------------------------------------
// ACTIVE DEVICES
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/security/devices"
) {

  const result = await pool.query(`
    SELECT
      id,
      device_name,
      user_agent,
      ip_address,
      last_seen,
      created_at,
      revoked

    FROM user_devices

    WHERE user_id=$1

    ORDER BY
      last_seen DESC

    LIMIT 50
  `,[user.id]);

  sendJson(res,{
    ok:true,
    devices:result.rows
  });

  return;
}


// ------------------------------------------------------------
// REVOKE DEVICE
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/security/device/revoke"
) {

  const d = await readBody(req);

  const deviceId =
    Number(d.get("device_id"));

  if (
    !Number.isInteger(deviceId) ||
    deviceId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_device"
    },400);

    return;
  }

  const result = await pool.query(`
    UPDATE user_devices

    SET revoked=TRUE

    WHERE
      id=$1
      AND user_id=$2
  `,[
    deviceId,
    user.id
  ]);

  sendJson(res,{
    ok:true,
    revoked:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// ACTIVE SESSIONS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/security/sessions"
) {

  const result = await pool.query(`
    SELECT
      id,
      created_at,
      last_seen,
      ip_address,
      user_agent

    FROM sessions

    WHERE user_id=$1

    ORDER BY
      last_seen DESC

    LIMIT 50
  `,[user.id]);

  sendJson(res,{
    ok:true,
    sessions:result.rows.map(s => ({
      ...s,
      current:
        String(s.id) ===
        String(sessionId)
    }))
  });

  return;
}


// ------------------------------------------------------------
// REVOKE ONE SESSION
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/security/session/revoke"
) {

  const d = await readBody(req);

  const id =
    String(
      d.get("session_id") || ""
    ).trim();

  if (!id) {

    sendJson(res,{
      ok:false,
      error:"invalid_session"
    },400);

    return;
  }

  if (
    String(id) ===
    String(sessionId)
  ) {

    sendJson(res,{
      ok:false,
      error:"current_session_cannot_be_revoked_here"
    },400);

    return;
  }

  const result = await pool.query(`
    DELETE FROM sessions
    WHERE
      id=$1
      AND user_id=$2
  `,[
    id,
    user.id
  ]);

  sendJson(res,{
    ok:true,
    revoked:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// REVOKE ALL OTHER SESSIONS
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/security/sessions/revoke-all"
) {

  const result = await pool.query(`
    DELETE FROM sessions
    WHERE
      user_id=$1
      AND id<>$2
  `,[
    user.id,
    sessionId
  ]);

  sendJson(res,{
    ok:true,
    revoked:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// LOGIN HISTORY
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/security/login-history"
) {

  const result = await pool.query(`
    SELECT
      id,
      identifier,
      ip_address,
      success,
      created_at

    FROM login_attempts

    WHERE user_id=$1

    ORDER BY
      created_at DESC

    LIMIT 100
  `,[user.id]);

  sendJson(res,{
    ok:true,
    history:result.rows
  });

  return;
}


// ------------------------------------------------------------
// PASSWORD CHANGE
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/security/password-change"
) {

  const d = await readBody(req);

  const currentPassword =
    String(
      d.get("current_password") || ""
    );

  const newPassword =
    String(
      d.get("new_password") || ""
    );

  if (
    currentPassword.length < 1 ||
    newPassword.length < 8
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_password"
    },400);

    return;
  }

  const result = await pool.query(`
    SELECT password_hash
    FROM users
    WHERE id=$1
  `,[user.id]);

  if (!result.rows.length) {

    sendJson(res,{
      ok:false,
      error:"user_not_found"
    },404);

    return;
  }

  const valid =
    await verifyPassword(
      currentPassword,
      result.rows[0].password_hash
    );

  if (!valid) {

    sendJson(res,{
      ok:false,
      error:"wrong_current_password"
    },401);

    return;
  }

  const newHash =
    await hashPassword(newPassword);

  await pool.query(`
    UPDATE users
    SET password_hash=$1
    WHERE id=$2
  `,[
    newHash,
    user.id
  ]);

  await pool.query(`
    DELETE FROM sessions
    WHERE
      user_id=$1
      AND id<>$2
  `,[
    user.id,
    sessionId
  ]);

  sendJson(res,{
    ok:true,
    message:"password_changed"
  });

  return;
}


// ------------------------------------------------------------
// PASSWORD RESET REQUEST
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/security/password-reset/request"
) {

  const d = await readBody(req);

  const identifier =
    String(
      d.get("identifier") || ""
    )
    .trim()
    .slice(0,255);

  if (!identifier) {

    sendJson(res,{
      ok:false,
      error:"invalid_identifier"
    },400);

    return;
  }

  const result = await pool.query(`
    SELECT
      id
    FROM users

    WHERE
      LOWER(username)=LOWER($1)
      OR
      LOWER(email)=LOWER($1)

    LIMIT 1
  `,[identifier]);

  /*
    امنیت:
    توکن واقعی فقط در دیتابیس به صورت hash ذخیره می‌شود.
    ارسال ایمیل/SMS باید از سرویس خارجی انجام شود.
  */

  if (!result.rows.length) {

    sendJson(res,{
      ok:true,
      message:"if_account_exists_reset_can_be_requested"
    });

    return;
  }

  const cryptoToken =
    crypto.randomBytes(32).toString("hex");

  const tokenHash =
    crypto
      .createHash("sha256")
      .update(cryptoToken)
      .digest("hex");

  await pool.query(`
    UPDATE password_reset_tokens
    SET used=TRUE
    WHERE
      user_id=$1
      AND used=FALSE
  `,[
    result.rows[0].id
  ]);

  await pool.query(`
    INSERT INTO password_reset_tokens(
      user_id,
      token_hash,
      expires_at
    )
    VALUES(
      $1,
      $2,
      NOW()+INTERVAL '30 minutes'
    )
  `,[
    result.rows[0].id,
    tokenHash
  ]);

  sendJson(res,{
    ok:true,

    /*
      این token نباید در محیط واقعی
      به کاربر نمایش داده شود.
      فقط برای اتصال به سرویس ایمیل/SMS
      در مرحله بعدی استفاده می‌شود.
    */

    reset_token:
      process.env.NODE_ENV === "production"
        ? undefined
        : cryptoToken
  });

  return;
}


// ------------------------------------------------------------
// PASSWORD RESET CONFIRM
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/security/password-reset/confirm"
) {

  const d = await readBody(req);

  const token =
    String(
      d.get("token") || ""
    ).trim();

  const newPassword =
    String(
      d.get("new_password") || ""
    );

  if (
    !token ||
    newPassword.length < 8
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_reset_request"
    },400);

    return;
  }

  const tokenHash =
    crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

  const result = await pool.query(`
    SELECT
      id,
      user_id

    FROM password_reset_tokens

    WHERE
      token_hash=$1
      AND used=FALSE
      AND expires_at>NOW()

    LIMIT 1
  `,[
    tokenHash
  ]);

  if (!result.rows.length) {

    sendJson(res,{
      ok:false,
      error:"invalid_or_expired_token"
    },400);

    return;
  }

  const reset =
    result.rows[0];

  const passwordHash =
    await hashPassword(newPassword);

  await pool.query("BEGIN");

  try {

    await pool.query(`
      UPDATE users
      SET password_hash=$1
      WHERE id=$2
    `,[
      passwordHash,
      reset.user_id
    ]);

    await pool.query(`
      UPDATE password_reset_tokens
      SET used=TRUE
      WHERE id=$1
    `,[
      reset.id
    ]);

    await pool.query(`
      DELETE FROM sessions
      WHERE user_id=$1
    `,[
      reset.user_id
    ]);

    await pool.query("COMMIT");

  } catch (error) {

    await pool.query("ROLLBACK");

    throw error;
  }

  sendJson(res,{
    ok:true,
    message:"password_reset_successfully"
  });

  return;
}


// ------------------------------------------------------------
// CLEAN EXPIRED RESET TOKENS
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/security/cleanup"
) {

  const result = await pool.query(`
    DELETE FROM password_reset_tokens

    WHERE
      expires_at<NOW()
      OR used=TRUE
  `);

  sendJson(res,{
    ok:true,
    deleted:result.rowCount
  });

  return;
  }// ============================================================
// SECTION 27
// ADVANCED CONTENT SAFETY / MODERATION / USER CONTROLS
// HIDDEN CONTENT / KEYWORDS / PERSONALIZED CONTENT SETTINGS
// ============================================================


// ------------------------------------------------------------
// CONTENT CONTROL TABLES
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS hidden_posts (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    post_id INTEGER NOT NULL
      REFERENCES posts(id)
      ON DELETE CASCADE,

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id,post_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS hidden_reels (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    reel_id INTEGER NOT NULL
      REFERENCES reels(id)
      ON DELETE CASCADE,

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id,reel_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS blocked_keywords (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    keyword VARCHAR(100) NOT NULL,

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id,keyword)
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_hidden_posts_user
  ON hidden_posts(user_id,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_hidden_reels_user
  ON hidden_reels(user_id,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_blocked_keywords_user
  ON blocked_keywords(user_id)
`);


// ------------------------------------------------------------
// HIDE POST
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/content/hide-post"
) {

  const d = await readBody(req);

  const postId =
    Number(d.get("post_id"));

  if (
    !Number.isInteger(postId) ||
    postId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_post"
    },400);

    return;
  }

  await pool.query(`
    INSERT INTO hidden_posts(
      user_id,
      post_id
    )
    VALUES($1,$2)

    ON CONFLICT(user_id,post_id)
    DO NOTHING
  `,[
    user.id,
    postId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// UNHIDE POST
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/content/unhide-post"
) {

  const d = await readBody(req);

  const postId =
    Number(d.get("post_id"));

  if (
    !Number.isInteger(postId) ||
    postId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_post"
    },400);

    return;
  }

  await pool.query(`
    DELETE FROM hidden_posts
    WHERE
      user_id=$1
      AND post_id=$2
  `,[
    user.id,
    postId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// HIDE REEL
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/content/hide-reel"
) {

  const d = await readBody(req);

  const reelId =
    Number(d.get("reel_id"));

  if (
    !Number.isInteger(reelId) ||
    reelId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_reel"
    },400);

    return;
  }

  await pool.query(`
    INSERT INTO hidden_reels(
      user_id,
      reel_id
    )
    VALUES($1,$2)

    ON CONFLICT(user_id,reel_id)
    DO NOTHING
  `,[
    user.id,
    reelId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// UNHIDE REEL
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/content/unhide-reel"
) {

  const d = await readBody(req);

  const reelId =
    Number(d.get("reel_id"));

  if (
    !Number.isInteger(reelId) ||
    reelId <= 0
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_reel"
    },400);

    return;
  }

  await pool.query(`
    DELETE FROM hidden_reels
    WHERE
      user_id=$1
      AND reel_id=$2
  `,[
    user.id,
    reelId
  ]);

  sendJson(res,{
    ok:true
  });

  return;
}


// ------------------------------------------------------------
// ADD BLOCKED KEYWORD
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/content/blocked-keyword"
) {

  const d = await readBody(req);

  const keyword =
    String(
      d.get("keyword") || ""
    )
    .trim()
    .toLowerCase()
    .slice(0,100);

  if (
    !keyword ||
    keyword.length < 2
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_keyword"
    },400);

    return;
  }

  await pool.query(`
    INSERT INTO blocked_keywords(
      user_id,
      keyword
    )
    VALUES($1,$2)

    ON CONFLICT(user_id,keyword)
    DO NOTHING
  `,[
    user.id,
    keyword
  ]);

  sendJson(res,{
    ok:true,
    keyword
  });

  return;
}


// ------------------------------------------------------------
// REMOVE BLOCKED KEYWORD
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/content/blocked-keyword/remove"
) {

  const d = await readBody(req);

  const keyword =
    String(
      d.get("keyword") || ""
    )
    .trim()
    .toLowerCase()
    .slice(0,100);

  if (!keyword) {

    sendJson(res,{
      ok:false,
      error:"invalid_keyword"
    },400);

    return;
  }

  const result = await pool.query(`
    DELETE FROM blocked_keywords
    WHERE
      user_id=$1
      AND keyword=$2
  `,[
    user.id,
    keyword
  ]);

  sendJson(res,{
    ok:true,
    deleted:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// GET BLOCKED KEYWORDS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/content/blocked-keywords"
) {

  const result = await pool.query(`
    SELECT
      id,
      keyword,
      created_at

    FROM blocked_keywords

    WHERE user_id=$1

    ORDER BY
      keyword ASC
  `,[user.id]);

  sendJson(res,{
    ok:true,
    keywords:result.rows
  });

  return;
}


// ------------------------------------------------------------
// HIDDEN CONTENT LIST
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/content/hidden"
) {

  const posts = await pool.query(`
    SELECT
      hp.id,
      hp.post_id,
      hp.created_at,

      p.content,
      p.image_url,
      p.media_type,
      p.created_at AS post_created_at,

      u.id AS author_id,
      u.username,
      u.name,
      u.avatar_url

    FROM hidden_posts hp

    JOIN posts p
      ON p.id=hp.post_id

    JOIN users u
      ON u.id=p.user_id

    WHERE hp.user_id=$1

    ORDER BY
      hp.created_at DESC

    LIMIT 100
  `,[user.id]);

  const reels = await pool.query(`
    SELECT
      hr.id,
      hr.reel_id,
      hr.created_at,

      r.caption,
      r.video_url,
      r.thumbnail_url,
      r.created_at AS reel_created_at,

      u.id AS author_id,
      u.username,
      u.name,
      u.avatar_url

    FROM hidden_reels hr

    JOIN reels r
      ON r.id=hr.reel_id

    JOIN users u
      ON u.id=r.user_id

    WHERE hr.user_id=$1

    ORDER BY
      hr.created_at DESC

    LIMIT 100
  `,[user.id]);

  sendJson(res,{
    ok:true,
    posts:posts.rows,
    reels:reels.rows
  });

  return;
}


// ------------------------------------------------------------
// CONTENT SAFETY STATUS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/content/safety-status"
) {

  const hiddenPosts = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM hidden_posts
    WHERE user_id=$1
  `,[user.id]);

  const hiddenReels = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM hidden_reels
    WHERE user_id=$1
  `,[user.id]);

  const keywords = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM blocked_keywords
    WHERE user_id=$1
  `,[user.id]);

  const reports = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM reports
    WHERE
      reporter_id=$1
      AND created_at >
        NOW() - INTERVAL '30 days'
  `,[user.id]);

  sendJson(res,{
    ok:true,
    hidden_posts:Number(
      hiddenPosts.rows[0]?.count || 0
    ),
    hidden_reels:Number(
      hiddenReels.rows[0]?.count || 0
    ),
    blocked_keywords:Number(
      keywords.rows[0]?.count || 0
    ),
    reports_last_30_days:Number(
      reports.rows[0]?.count || 0
    )
  });

  return;
}


// ------------------------------------------------------------
// CHECK CONTENT AGAINST USER KEYWORDS
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/content/check-keywords"
) {

  const d = await readBody(req);

  const content =
    String(
      d.get("content") || ""
    )
    .toLowerCase()
    .slice(0,10000);

  if (!content) {

    sendJson(res,{
      ok:true,
      matched:[],
      blocked:false
    });

    return;
  }

  const result = await pool.query(`
    SELECT
      keyword

    FROM blocked_keywords

    WHERE user_id=$1

    ORDER BY
      LENGTH(keyword) DESC
  `,[user.id]);

  const matched = [];

  for (
    const row of result.rows
  ) {

    const keyword =
      String(row.keyword || "")
        .trim()
        .toLowerCase();

    if (
      keyword &&
      content.includes(keyword)
    ) {

      matched.push(keyword);
    }

    if (
      matched.length >= 20
    ) {

      break;
    }
  }

  sendJson(res,{
    ok:true,
    blocked:matched.length>0,
    matched
  });

  return;
}


// ------------------------------------------------------------
// CONTENT PREFERENCES
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/content/preferences"
) {

  const result = await pool.query(`
    SELECT
      id,
      show_sensitive_content,
      autoplay_videos,
      personalized_recommendations,
      show_suggested_posts,
      show_suggested_reels

    FROM content_preferences

    WHERE user_id=$1

    LIMIT 1
  `,[user.id]);

  if (!result.rows.length) {

    await pool.query(`
      INSERT INTO content_preferences(
        user_id
      )
      VALUES($1)
      ON CONFLICT(user_id)
      DO NOTHING
    `,[user.id]);

    const created = await pool.query(`
      SELECT
        id,
        show_sensitive_content,
        autoplay_videos,
        personalized_recommendations,
        show_suggested_posts,
        show_suggested_reels

      FROM content_preferences

      WHERE user_id=$1
    `,[user.id]);

    sendJson(res,{
      ok:true,
      preferences:
        created.rows[0] || null
    });

    return;
  }

  sendJson(res,{
    ok:true,
    preferences:result.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// UPDATE CONTENT PREFERENCES
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/content/preferences"
) {

  const d = await readBody(req);

  const boolValue = (
    value,
    fallback
  ) => {

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {

      return fallback;
    }

    return (
      String(value).toLowerCase()
        === "true"
      ||
      String(value) === "1"
      ||
      String(value).toLowerCase()
        === "on"
    );
  };

  const current =
    await pool.query(`
      SELECT *
      FROM content_preferences
      WHERE user_id=$1
      LIMIT 1
    `,[user.id]);

  const old =
    current.rows[0] || {};

  const showSensitive =
    boolValue(
      d.get("show_sensitive_content"),
      old.show_sensitive_content ?? false
    );

  const autoplay =
    boolValue(
      d.get("autoplay_videos"),
      old.autoplay_videos ?? true
    );

  const personalized =
    boolValue(
      d.get("personalized_recommendations"),
      old.personalized_recommendations ?? true
    );

  const suggestedPosts =
    boolValue(
      d.get("show_suggested_posts"),
      old.show_suggested_posts ?? true
    );

  const suggestedReels =
    boolValue(
      d.get("show_suggested_reels"),
      old.show_suggested_reels ?? true
    );

  await pool.query(`
    INSERT INTO content_preferences(
      user_id,
      show_sensitive_content,
      autoplay_videos,
      personalized_recommendations,
      show_suggested_posts,
      show_suggested_reels
    )
    VALUES(
      $1,$2,$3,$4,$5,$6
    )

    ON CONFLICT(user_id)
    DO UPDATE SET
      show_sensitive_content=
        EXCLUDED.show_sensitive_content,

      autoplay_videos=
        EXCLUDED.autoplay_videos,

      personalized_recommendations=
        EXCLUDED.personalized_recommendations,

      show_suggested_posts=
        EXCLUDED.show_suggested_posts,

      show_suggested_reels=
        EXCLUDED.show_suggested_reels
  `,[
    user.id,
    showSensitive,
    autoplay,
    personalized,
    suggestedPosts,
    suggestedReels
  ]);

  sendJson(res,{
    ok:true,
    preferences:{
      show_sensitive_content:
        showSensitive,

      autoplay_videos:
        autoplay,

      personalized_recommendations:
        personalized,

      show_suggested_posts:
        suggestedPosts,

      show_suggested_reels:
        suggestedReels
    }
  });

  return;
}


// ------------------------------------------------------------
// USER REPORT BLOCK
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/content/report-user"
) {

  const d = await readBody(req);

  const targetId =
    Number(d.get("user_id"));

  const reason =
    String(
      d.get("reason") || "other"
    )
    .trim()
    .slice(0,500);

  if (
    !Number.isInteger(targetId) ||
    targetId <= 0 ||
    targetId === user.id
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_user"
    },400);

    return;
  }

  const exists =
    await pool.query(`
      SELECT id
      FROM users
      WHERE
        id=$1
        AND is_active=TRUE
    `,[targetId]);

  if (!exists.rows.length) {

    sendJson(res,{
      ok:false,
      error:"user_not_found"
    },404);

    return;
  }

  await pool.query(`
    INSERT INTO reports(
      reporter_id,
      target_type,
      target_id,
      reason,
      status,
      created_at
    )
    VALUES(
      $1,
      'user',
      $2,
      $3,
      'pending',
      NOW()
    )
  `,[
    user.id,
    targetId,
    reason || "other"
  ]);

  sendJson(res,{
    ok:true,
    message:"report_submitted"
  });

  return;
                 }/* =========================================================
   MySocial — بخش ۲۸ و پایانی
   API / امنیت / مدیریت حساب / جستجو / فروشگاه / اعلان‌ها /
   پیام‌رسانی / مدیریت محتوا / گروه‌ها / کانال‌ها / تماس‌ها
   ========================================================= */

/* ---------- Compatibility columns ---------- */

const compatibilityColumns = [
  ["users", "username", "TEXT"],
  ["users", "bio", "TEXT DEFAULT ''"],
  ["users", "avatar_url", "TEXT"],
  ["users", "website", "TEXT"],
  ["users", "location", "TEXT"],
  ["users", "profile_public", "BOOLEAN DEFAULT TRUE"],
  ["users", "is_verified", "BOOLEAN DEFAULT FALSE"],
  ["users", "role", "TEXT DEFAULT 'user'"],
  ["users", "status", "TEXT DEFAULT 'active'"],

  ["messages", "is_read", "BOOLEAN DEFAULT FALSE"],
  ["messages", "deleted_for_sender", "BOOLEAN DEFAULT FALSE"],
  ["messages", "deleted_for_receiver", "BOOLEAN DEFAULT FALSE"],
  ["messages", "edited", "BOOLEAN DEFAULT FALSE"],
  ["messages", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],

  ["notifications", "entity_type", "TEXT"],
  ["notifications", "entity_id", "INTEGER"],

  ["payment_orders", "plan_id", "INTEGER"],
  ["payment_orders", "paid_at", "TIMESTAMP"]
];

for (const [table, column, definition] of compatibilityColumns) {
  try {
    await ensureColumn(table, column, definition);
  } catch (e) {
    console.error(`Compatibility column skipped: ${table}.${column}`);
  }
}

/* ---------- Advanced tables ---------- */

await pool.query(`
  CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    privacy TEXT DEFAULT 'public',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(group_id,user_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS channels (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    privacy TEXT DEFAULT 'public',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS channel_members (
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(channel_id,user_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS business_pages (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    website TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS group_posts (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS channel_posts (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS business_followers (
    business_id INTEGER NOT NULL REFERENCES business_pages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(business_id,user_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS polls (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS poll_options (
    id SERIAL PRIMARY KEY,
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(poll_id,user_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    event_date TIMESTAMP,
    location TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS event_attendees (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'going',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(event_id,user_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS badges (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '🏅'
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS user_badges (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,badge_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS user_points (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS rewards (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    points_required INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN DEFAULT TRUE
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS user_rewards (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,reward_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    caller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_type TEXT NOT NULL DEFAULT 'audio',
    status TEXT NOT NULL DEFAULT 'ringing',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS call_signals (
    id SERIAL PRIMARY KEY,
    call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload TEXT DEFAULT '',
    consumed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(message_id,user_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS hidden_posts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,post_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS hidden_reels (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reel_id INTEGER NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,reel_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS blocked_keywords (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,keyword)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS content_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    show_sensitive_content BOOLEAN DEFAULT FALSE,
    autoplay_videos BOOLEAN DEFAULT TRUE,
    personalized_recommendations BOOLEAN DEFAULT TRUE,
    show_suggested_posts BOOLEAN DEFAULT TRUE,
    show_suggested_reels BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    likes BOOLEAN DEFAULT TRUE,
    comments BOOLEAN DEFAULT TRUE,
    follows BOOLEAN DEFAULT TRUE,
    messages BOOLEAN DEFAULT TRUE,
    mentions BOOLEAN DEFAULT TRUE,
    story_replies BOOLEAN DEFAULT TRUE,
    live BOOLEAN DEFAULT TRUE,
    payments BOOLEAN DEFAULT TRUE,
    security BOOLEAN DEFAULT TRUE,
    marketing BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS social_links (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,platform)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS user_devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name TEXT DEFAULT '',
    ip TEXT,
    user_agent TEXT,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    email TEXT,
    ip TEXT,
    success BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS search_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS search_trends (
    id SERIAL PRIMARY KEY,
    query TEXT UNIQUE NOT NULL,
    search_count INTEGER DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    stock INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS cart_items (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,product_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS wishlist_items (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,product_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS shop_orders (
    id SERIAL PRIMARY KEY,
    buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'pending',
    payment_order_id INTEGER REFERENCES payment_orders(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS shop_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    price NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS product_reviews (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    review TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id,user_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS shop_coupons (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    discount_percent NUMERIC(5,2) NOT NULL CHECK(discount_percent>=0 AND discount_percent<=100),
    expires_at TIMESTAMP,
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(seller_id,code)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS moderation_queue (
    id SERIAL PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    reason TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS content_actions (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    reason TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(sender_id,receiver_id,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_calls_receiver
  ON calls(receiver_id,status,started_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_call_signals_receiver
  ON call_signals(receiver_id,consumed,created_at)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_products_seller
  ON products(seller_id,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_shop_orders_buyer
  ON shop_orders(buyer_id,created_at DESC)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_search_history_user
  ON search_history(user_id,created_at DESC)
`);


/* =========================================================
   HELPERS
   ========================================================= */

function isSafeInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function validHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function ensureNotificationPreferences(userId) {
  await pool.query(`
    INSERT INTO notification_preferences(user_id)
    VALUES($1)
    ON CONFLICT(user_id) DO NOTHING
  `, [userId]);
}

async function ensureContentPreferences(userId) {
  await pool.query(`
    INSERT INTO content_preferences(user_id)
    VALUES($1)
    ON CONFLICT(user_id) DO NOTHING
  `, [userId]);
}

async function addUserPoints(userId, points) {
  const amount = Math.max(0, Number(points) || 0);
  if (!amount) return;

  await pool.query(`
    INSERT INTO user_points(user_id,points)
    VALUES($1,$2)
    ON CONFLICT(user_id)
    DO UPDATE SET
      points=user_points.points+$2,
      updated_at=CURRENT_TIMESTAMP
  `, [userId, amount]);
}

async function createAdvancedNotification(
  userId,
  actorId,
  type,
  message,
  entityType = null,
  entityId = null
) {
  if (!userId || Number(userId) === Number(actorId)) return;

  await ensureNotificationPreferences(userId);

  const pref = await pool.query(`
    SELECT *
    FROM notification_preferences
    WHERE user_id=$1
  `, [userId]);

  const p = pref.rows[0];

  const allowed = {
    like: p?.likes !== false,
    comment: p?.comments !== false,
    follow: p?.follows !== false,
    message: p?.messages !== false,
    mention: p?.mentions !== false,
    story_reply: p?.story_replies !== false,
    live: p?.live !== false,
    payment: p?.payments !== false,
    security: p?.security !== false,
    marketing: p?.marketing === true
  };

  if (allowed[type] === false) return;

  await pool.query(`
    INSERT INTO notifications(
      user_id,actor_id,type,message,entity_type,entity_id
    )
    VALUES($1,$2,$3,$4,$5,$6)
  `, [
    userId,
    actorId || null,
    type,
    message,
    entityType,
    entityId
  ]);
}

function requireAdmin(user) {
  return user &&
    ["admin", "superadmin"].includes(String(user.role || "").toLowerCase());
}


/* =========================================================
   ADVANCED API
   ========================================================= */

if (path === "/api/account" && req.method === "GET") {
  sendJson(res, 200, {
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
  return;
}


if (path === "/api/profile" && req.method === "GET") {
  const id = Number(url.searchParams.get("id") || user.id);

  const r = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.email,
      COALESCE(u.bio,'') bio,
      u.avatar_url,
      u.website,
      u.location,
      COALESCE(u.profile_public,TRUE) profile_public,
      COALESCE(u.is_verified,FALSE) is_verified,
      (SELECT COUNT(*) FROM follows f WHERE f.following_id=u.id)::int followers,
      (SELECT COUNT(*) FROM follows f WHERE f.follower_id=u.id)::int following,
      (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id AND p.archived=FALSE)::int posts
    FROM users u
    WHERE u.id=$1
  `, [id]);

  if (!r.rows.length) {
    sendJson(res, 404, { success:false, error:"کاربر پیدا نشد." });
    return;
  }

  const p = r.rows[0];

  if (id !== user.id) {
    await pool.query(`
      INSERT INTO profile_visits(profile_id,visitor_id)
      VALUES($1,$2)
    `, [id,user.id]);
  }

  sendJson(res, 200, { success:true, profile:p });
  return;
}


if (path === "/api/profile/update" && req.method === "POST") {
  const d = await readBody(req);

  const name = String(d.get("name") || "").trim();
  const bio = String(d.get("bio") || "").trim();
  const website = String(d.get("website") || "").trim();
  const location = String(d.get("location") || "").trim();

  if (!name || name.length > 100) {
    sendJson(res,400,{success:false,error:"نام نامعتبر است."});
    return;
  }

  if (website && !validHttpUrl(website)) {
    sendJson(res,400,{success:false,error:"لینک سایت نامعتبر است."});
    return;
  }

  await pool.query(`
    UPDATE users
    SET name=$1,bio=$2,website=$3,location=$4
    WHERE id=$5
  `, [name,bio,website || null,location || null,user.id]);

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/profile/social-link" && req.method === "POST") {
  const d = await readBody(req);
  const platform = String(d.get("platform") || "").trim().slice(0,50);
  const link = String(d.get("url") || "").trim();

  if (!platform || !validHttpUrl(link)) {
    sendJson(res,400,{success:false,error:"اطلاعات لینک نامعتبر است."});
    return;
  }

  await pool.query(`
    INSERT INTO social_links(user_id,platform,url)
    VALUES($1,$2,$3)
    ON CONFLICT(user_id,platform)
    DO UPDATE SET url=EXCLUDED.url
  `,[user.id,platform,link]);

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/profile/social-links" && req.method === "GET") {
  const r = await pool.query(`
    SELECT platform,url
    FROM social_links
    WHERE user_id=$1
    ORDER BY platform
  `,[user.id]);

  sendJson(res,200,{success:true,links:r.rows});
  return;
}


if (path === "/api/username/check" && req.method === "GET") {
  const username = String(url.searchParams.get("username") || "")
    .trim()
    .toLowerCase();

  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
    sendJson(res,200,{available:false});
    return;
  }

  const r = await pool.query(`
    SELECT id
    FROM users
    WHERE LOWER(COALESCE(username,''))=$1
      AND id<>$2
    LIMIT 1
  `,[username,user.id]);

  sendJson(res,200,{available:!r.rows.length});
  return;
}


/* ---------- Notifications ---------- */

if (path === "/api/notifications/count" && req.method === "GET") {
  const r = await pool.query(`
    SELECT COUNT(*)::int count
    FROM notifications
    WHERE user_id=$1 AND is_read=FALSE
  `,[user.id]);

  sendJson(res,200,{success:true,count:r.rows[0].count});
  return;
}


if (path === "/api/notifications" && req.method === "GET") {
  const r = await pool.query(`
    SELECT
      n.id,n.type,n.message,n.entity_type,n.entity_id,
      n.is_read,n.created_at,
      u.name actor_name
    FROM notifications n
    LEFT JOIN users u ON u.id=n.actor_id
    WHERE n.user_id=$1
    ORDER BY n.created_at DESC
    LIMIT 100
  `,[user.id]);

  sendJson(res,200,{success:true,notifications:r.rows});
  return;
}


if (path === "/api/notification/read" && req.method === "POST") {
  const d = await readBody(req);
  const id = Number(d.get("id"));

  if (isSafeInteger(id)) {
    await pool.query(`
      UPDATE notifications
      SET is_read=TRUE
      WHERE id=$1 AND user_id=$2
    `,[id,user.id]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/notifications/read-all" && req.method === "POST") {
  await pool.query(`
    UPDATE notifications
    SET is_read=TRUE
    WHERE user_id=$1
  `,[user.id]);

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/notification/delete" && req.method === "POST") {
  const d = await readBody(req);
  const id = Number(d.get("id"));

  if (isSafeInteger(id)) {
    await pool.query(`
      DELETE FROM notifications
      WHERE id=$1 AND user_id=$2
    `,[id,user.id]);
  }

  sendJson(res,200,{success:true});
  return;
}


/* ---------- Advanced messages ---------- */

if (path === "/api/messages" && req.method === "GET") {
  const otherId = Number(url.searchParams.get("user_id"));

  if (!isSafeInteger(otherId)) {
    sendJson(res,400,{success:false,error:"کاربر نامعتبر است."});
    return;
  }

  const r = await pool.query(`
    SELECT
      m.id,
      m.sender_id,
      m.receiver_id,
      m.message,
      m.created_at,
      m.is_read,
      m.edited,
      EXISTS(
        SELECT 1
        FROM message_reactions mr
        WHERE mr.message_id=m.id
      ) has_reaction
    FROM messages m
    WHERE
      (
        m.sender_id=$1 AND
        m.receiver_id=$2 AND
        m.deleted_for_sender=FALSE
      )
      OR
      (
        m.sender_id=$2 AND
        m.receiver_id=$1 AND
        m.deleted_for_receiver=FALSE
      )
    ORDER BY m.created_at ASC
    LIMIT 300
  `,[user.id,otherId]);

  await pool.query(`
    UPDATE messages
    SET is_read=TRUE
    WHERE sender_id=$1
      AND receiver_id=$2
  `,[otherId,user.id]);

  sendJson(res,200,{success:true,messages:r.rows});
  return;
}


if (path === "/api/messages/send" && req.method === "POST") {
  const d = await readBody(req);
  const receiverId = Number(d.get("receiver_id"));
  const message = String(d.get("message") || "").trim();

  if (
    !isSafeInteger(receiverId) ||
    receiverId === user.id ||
    !message ||
    message.length > 5000
  ) {
    sendJson(res,400,{success:false,error:"پیام نامعتبر است."});
    return;
  }

  const receiver = await pool.query(`
    SELECT id FROM users WHERE id=$1
  `,[receiverId]);

  if (!receiver.rows.length) {
    sendJson(res,404,{success:false,error:"گیرنده پیدا نشد."});
    return;
  }

  const settings = await pool.query(`
    SELECT message_policy
    FROM user_settings
    WHERE user_id=$1
  `,[receiverId]);

  if (
    settings.rows.length &&
    settings.rows[0].message_policy === "followers"
  ) {
    const follows = await pool.query(`
      SELECT 1
      FROM follows
      WHERE follower_id=$1 AND following_id=$2
    `,[user.id,receiverId]);

    if (!follows.rows.length) {
      sendJson(res,403,{
        success:false,
        error:"این کاربر فقط از دنبال‌کنندگان پیام می‌پذیرد."
      });
      return;
    }
  }

  const r = await pool.query(`
    INSERT INTO messages(sender_id,receiver_id,message)
    VALUES($1,$2,$3)
    RETURNING id,sender_id,receiver_id,message,created_at
  `,[user.id,receiverId,message]);

  await createAdvancedNotification(
    receiverId,
    user.id,
    "message",
    `${user.name} برای شما پیام فرستاد.`,
    "message",
    r.rows[0].id
  );

  sendJson(res,200,{success:true,message:r.rows[0]});
  return;
}


if (path === "/api/messages/read" && req.method === "POST") {
  const d = await readBody(req);
  const senderId = Number(d.get("sender_id"));

  if (isSafeInteger(senderId)) {
    await pool.query(`
      UPDATE messages
      SET is_read=TRUE
      WHERE sender_id=$1 AND receiver_id=$2
    `,[senderId,user.id]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/messages/unread" && req.method === "GET") {
  const r = await pool.query(`
    SELECT COUNT(*)::int count
    FROM messages
    WHERE receiver_id=$1
      AND is_read=FALSE
      AND deleted_for_receiver=FALSE
  `,[user.id]);

  sendJson(res,200,{success:true,count:r.rows[0].count});
  return;
}


if (path === "/api/conversations" && req.method === "GET") {
  const r = await pool.query(`
    SELECT DISTINCT ON (x.other_id)
      x.other_id,
      u.name,
      u.email,
      x.message,
      x.created_at
    FROM (
      SELECT
        CASE
          WHEN sender_id=$1 THEN receiver_id
          ELSE sender_id
        END other_id,
        message,
        created_at
      FROM messages
      WHERE sender_id=$1 OR receiver_id=$1
    ) x
    JOIN users u ON u.id=x.other_id
    ORDER BY x.other_id,x.created_at DESC
  `,[user.id]);

  sendJson(res,200,{success:true,conversations:r.rows});
  return;
}


if (path === "/api/message/reaction" && req.method === "POST") {
  const d = await readBody(req);
  const messageId = Number(d.get("message_id"));
  const reaction = String(d.get("reaction") || "❤️").slice(0,20);

  if (isSafeInteger(messageId)) {
    const owned = await pool.query(`
      SELECT id
      FROM messages
      WHERE id=$1
        AND (sender_id=$2 OR receiver_id=$2)
    `,[messageId,user.id]);

    if (owned.rows.length) {
      await pool.query(`
        INSERT INTO message_reactions(message_id,user_id,reaction)
        VALUES($1,$2,$3)
        ON CONFLICT(message_id,user_id)
        DO UPDATE SET reaction=EXCLUDED.reaction
      `,[messageId,user.id,reaction]);
    }
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/message/reaction/remove" && req.method === "POST") {
  const d = await readBody(req);
  const messageId = Number(d.get("message_id"));

  if (isSafeInteger(messageId)) {
    await pool.query(`
      DELETE FROM message_reactions
      WHERE message_id=$1 AND user_id=$2
    `,[messageId,user.id]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/message/edit" && req.method === "POST") {
  const d = await readBody(req);
  const messageId = Number(d.get("message_id"));
  const message = String(d.get("message") || "").trim();

  if (
    !isSafeInteger(messageId) ||
    !message ||
    message.length > 5000
  ) {
    sendJson(res,400,{success:false,error:"اطلاعات نامعتبر است."});
    return;
  }

  const r = await pool.query(`
    UPDATE messages
    SET message=$1,edited=TRUE,updated_at=CURRENT_TIMESTAMP
    WHERE id=$2
      AND sender_id=$3
      AND created_at>CURRENT_TIMESTAMP-INTERVAL '15 minutes'
    RETURNING id,message,edited,updated_at
  `,[message,messageId,user.id]);

  sendJson(res,200,{
    success:!!r.rows.length,
    message:r.rows[0] || null
  });
  return;
}


if (path === "/api/message/delete" && req.method === "POST") {
  const d = await readBody(req);
  const messageId = Number(d.get("message_id"));
  const mode = String(d.get("mode") || "me");

  const r = await pool.query(`
    SELECT sender_id,receiver_id
    FROM messages
    WHERE id=$1
  `,[messageId]);

  if (!r.rows.length) {
    sendJson(res,404,{success:false});
    return;
  }

  const m = r.rows[0];

  if (Number(m.sender_id) === Number(user.id)) {
    if (mode === "everyone") {
      await pool.query(`
        UPDATE messages
        SET deleted_for_sender=TRUE,
            deleted_for_receiver=TRUE,
            message='[پیام حذف شد]'
        WHERE id=$1
      `,[messageId]);
    } else {
      await pool.query(`
        UPDATE messages
        SET deleted_for_sender=TRUE
        WHERE id=$1
      `,[messageId]);
    }
  } else if (Number(m.receiver_id) === Number(user.id)) {
    await pool.query(`
      UPDATE messages
      SET deleted_for_receiver=TRUE
      WHERE id=$1
    `,[messageId]);
  }

  sendJson(res,200,{success:true});
  return;
}


/* ---------- Search ---------- */

if (path === "/api/global-search" && req.method === "GET") {
  const q = String(url.searchParams.get("q") || "").trim().slice(0,100);

  if (!q) {
    sendJson(res,200,{success:true,users:[],posts:[],reels:[]});
    return;
  }

  await pool.query(`
    INSERT INTO search_history(user_id,query)
    VALUES($1,$2)
  `,[user.id,q]);

  await pool.query(`
    INSERT INTO search_trends(query,search_count)
    VALUES($1,1)
    ON CONFLICT(query)
    DO UPDATE SET
      search_count=search_trends.search_count+1,
      updated_at=CURRENT_TIMESTAMP
  `,[q]);

  const [users,posts,reels] = await Promise.all([
    pool.query(`
      SELECT id,name,email,avatar_url
      FROM users
      WHERE name ILIKE $1
         OR email ILIKE $1
         OR COALESCE(username,'') ILIKE $1
      ORDER BY id DESC
      LIMIT 30
    `,[`%${q}%`]),

    pool.query(`
      SELECT p.id,p.content,p.image_url,p.created_at,u.name
      FROM posts p
      JOIN users u ON u.id=p.user_id
      WHERE p.content ILIKE $1
        AND p.archived=FALSE
      ORDER BY p.created_at DESC
      LIMIT 50
    `,[`%${q}%`]),

    pool.query(`
      SELECT r.id,r.caption,r.media_url,r.created_at,u.name
      FROM reels r
      JOIN users u ON u.id=r.user_id
      WHERE r.caption ILIKE $1
      ORDER BY r.created_at DESC
      LIMIT 50
    `,[`%${q}%`])
  ]);

  sendJson(res,200,{
    success:true,
    users:users.rows,
    posts:posts.rows,
    reels:reels.rows
  });
  return;
}


if (path === "/api/search-history" && req.method === "GET") {
  const r = await pool.query(`
    SELECT id,query,created_at
    FROM search_history
    WHERE user_id=$1
    ORDER BY created_at DESC
    LIMIT 50
  `,[user.id]);

  sendJson(res,200,{success:true,history:r.rows});
  return;
}


if (path === "/api/search-history/clear" && req.method === "POST") {
  await pool.query(`
    DELETE FROM search_history
    WHERE user_id=$1
  `,[user.id]);

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/search-trending" && req.method === "GET") {
  const r = await pool.query(`
    SELECT query,search_count
    FROM search_trends
    ORDER BY search_count DESC,updated_at DESC
    LIMIT 20
  `);

  sendJson(res,200,{success:true,trends:r.rows});
  return;
}


/* ---------- Content safety ---------- */

if (path === "/api/content/hide-post" && req.method === "POST") {
  const d = await readBody(req);
  const postId = Number(d.get("post_id"));

  if (isSafeInteger(postId)) {
    await pool.query(`
      INSERT INTO hidden_posts(user_id,post_id)
      VALUES($1,$2)
      ON CONFLICT DO NOTHING
    `,[user.id,postId]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/content/unhide-post" && req.method === "POST") {
  const d = await readBody(req);
  const postId = Number(d.get("post_id"));

  if (isSafeInteger(postId)) {
    await pool.query(`
      DELETE FROM hidden_posts
      WHERE user_id=$1 AND post_id=$2
    `,[user.id,postId]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/content/hide-reel" && req.method === "POST") {
  const d = await readBody(req);
  const reelId = Number(d.get("reel_id"));

  if (isSafeInteger(reelId)) {
    await pool.query(`
      INSERT INTO hidden_reels(user_id,reel_id)
      VALUES($1,$2)
      ON CONFLICT DO NOTHING
    `,[user.id,reelId]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/content/unhide-reel" && req.method === "POST") {
  const d = await readBody(req);
  const reelId = Number(d.get("reel_id"));

  if (isSafeInteger(reelId)) {
    await pool.query(`
      DELETE FROM hidden_reels
      WHERE user_id=$1 AND reel_id=$2
    `,[user.id,reelId]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/content/blocked-keyword" && req.method === "POST") {
  const d = await readBody(req);
  const keyword = String(d.get("keyword") || "").trim().toLowerCase().slice(0,100);

  if (keyword) {
    await pool.query(`
      INSERT INTO blocked_keywords(user_id,keyword)
      VALUES($1,$2)
      ON CONFLICT(user_id,keyword) DO NOTHING
    `,[user.id,keyword]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/content/blocked-keyword/remove" && req.method === "POST") {
  const d = await readBody(req);
  const keyword = String(d.get("keyword") || "").trim().toLowerCase();

  await pool.query(`
    DELETE FROM blocked_keywords
    WHERE user_id=$1 AND keyword=$2
  `,[user.id,keyword]);

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/content/blocked-keywords" && req.method === "GET") {
  const r = await pool.query(`
    SELECT id,keyword,created_at
    FROM blocked_keywords
    WHERE user_id=$1
    ORDER BY created_at DESC
  `,[user.id]);

  sendJson(res,200,{success:true,keywords:r.rows});
  return;
}


if (path === "/api/content/hidden" && req.method === "GET") {
  const [posts,reels] = await Promise.all([
    pool.query(`
      SELECT p.id,p.content,p.created_at
      FROM hidden_posts h
      JOIN posts p ON p.id=h.post_id
      WHERE h.user_id=$1
      ORDER BY h.created_at DESC
    `,[user.id]),

    pool.query(`
      SELECT r.id,r.caption,r.created_at
      FROM hidden_reels h
      JOIN reels r ON r.id=h.reel_id
      WHERE h.user_id=$1
      ORDER BY h.created_at DESC
    `,[user.id])
  ]);

  sendJson(res,200,{
    success:true,
    posts:posts.rows,
    reels:reels.rows
  });
  return;
}


if (path === "/api/content/preferences" && req.method === "GET") {
  await ensureContentPreferences(user.id);

  const r = await pool.query(`
    SELECT *
    FROM content_preferences
    WHERE user_id=$1
  `,[user.id]);

  sendJson(res,200,{success:true,preferences:r.rows[0]});
  return;
}


if (path === "/api/content/preferences" && req.method === "POST") {
  const d = await readBody(req);

  const bool = n => d.get(n) === "on" || d.get(n) === "true" || d.get(n) === "1";

  await pool.query(`
    INSERT INTO content_preferences(
      user_id,
      show_sensitive_content,
      autoplay_videos,
      personalized_recommendations,
      show_suggested_posts,
      show_suggested_reels
    )
    VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(user_id)
    DO UPDATE SET
      show_sensitive_content=EXCLUDED.show_sensitive_content,
      autoplay_videos=EXCLUDED.autoplay_videos,
      personalized_recommendations=EXCLUDED.personalized_recommendations,
      show_suggested_posts=EXCLUDED.show_suggested_posts,
      show_suggested_reels=EXCLUDED.show_suggested_reels,
      updated_at=CURRENT_TIMESTAMP
  `,[
    user.id,
    bool("show_sensitive_content"),
    bool("autoplay_videos"),
    bool("personalized_recommendations"),
    bool("show_suggested_posts"),
    bool("show_suggested_reels")
  ]);

  sendJson(res,200,{success:true});
  return;
}


/* ---------- Calls / signaling ---------- */

if (path === "/api/call/start" && req.method === "POST") {
  const d = await readBody(req);
  const receiverId = Number(d.get("receiver_id"));
  const callType =
    String(d.get("call_type") || "audio") === "video"
      ? "video"
      : "audio";

  if (
    !isSafeInteger(receiverId) ||
    receiverId === user.id
  ) {
    sendJson(res,400,{success:false,error:"گیرنده نامعتبر است."});
    return;
  }

  const receiver = await pool.query(`
    SELECT id FROM users WHERE id=$1
  `,[receiverId]);

  if (!receiver.rows.length) {
    sendJson(res,404,{success:false,error:"کاربر پیدا نشد."});
    return;
  }

  await pool.query(`
    UPDATE calls
    SET status='ended',ended_at=CURRENT_TIMESTAMP
    WHERE
      (
        caller_id=$1 OR receiver_id=$1
      )
      AND status IN ('ringing','active')
  `,[user.id]);

  const r = await pool.query(`
    INSERT INTO calls(caller_id,receiver_id,call_type,status)
    VALUES($1,$2,$3,'ringing')
    RETURNING id,caller_id,receiver_id,call_type,status,started_at
  `,[user.id,receiverId,callType]);

  await createAdvancedNotification(
    receiverId,
    user.id,
    "message",
    `${user.name} با شما تماس ${callType === "video" ? "تصویری" : "صوتی"} گرفته است.`,
    "call",
    r.rows[0].id
  );

  sendJson(res,200,{success:true,call:r.rows[0]});
  return;
}


if (path === "/api/call/signal" && req.method === "POST") {
  const d = await readBody(req);

  const callId = Number(d.get("call_id"));
  const receiverId = Number(d.get("receiver_id"));
  const type = String(d.get("type") || "").trim().slice(0,50);
  const payload = String(d.get("payload") || "").slice(0,50000);

  if (
    !isSafeInteger(callId) ||
    !isSafeInteger(receiverId) ||
    !type
  ) {
    sendJson(res,400,{success:false});
    return;
  }

  const call = await pool.query(`
    SELECT id
    FROM calls
    WHERE id=$1
      AND (
        (caller_id=$2 AND receiver_id=$3)
        OR
        (caller_id=$3 AND receiver_id=$2)
      )
      AND status IN ('ringing','active')
  `,[callId,user.id,receiverId]);

  if (!call.rows.length) {
    sendJson(res,403,{success:false,error:"تماس معتبر نیست."});
    return;
  }

  await pool.query(`
    INSERT INTO call_signals(
      call_id,sender_id,receiver_id,type,payload
    )
    VALUES($1,$2,$3,$4,$5)
  `,[callId,user.id,receiverId,type,payload]);

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/call/signals" && req.method === "GET") {
  const callId = Number(url.searchParams.get("call_id"));

  if (!isSafeInteger(callId)) {
    sendJson(res,400,{success:false});
    return;
  }

  const r = await pool.query(`
    SELECT
      id,sender_id,type,payload,created_at
    FROM call_signals
    WHERE call_id=$1
      AND receiver_id=$2
      AND consumed=FALSE
    ORDER BY created_at ASC
    LIMIT 100
  `,[callId,user.id]);

  if (r.rows.length) {
    await pool.query(`
      UPDATE call_signals
      SET consumed=TRUE
      WHERE receiver_id=$1
        AND call_id=$2
        AND consumed=FALSE
    `,[user.id,callId]);
  }

  sendJson(res,200,{success:true,signals:r.rows});
  return;
}


if (path === "/api/call/answer" && req.method === "POST") {
  const d = await readBody(req);
  const callId = Number(d.get("call_id"));

  if (isSafeInteger(callId)) {
    await pool.query(`
      UPDATE calls
      SET status='active'
      WHERE id=$1
        AND receiver_id=$2
        AND status='ringing'
    `,[callId,user.id]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/call/reject" && req.method === "POST") {
  const d = await readBody(req);
  const callId = Number(d.get("call_id"));

  if (isSafeInteger(callId)) {
    await pool.query(`
      UPDATE calls
      SET status='rejected',ended_at=CURRENT_TIMESTAMP
      WHERE id=$1
        AND receiver_id=$2
        AND status='ringing'
    `,[callId,user.id]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/call/end" && req.method === "POST") {
  const d = await readBody(req);
  const callId = Number(d.get("call_id"));

  if (isSafeInteger(callId)) {
    await pool.query(`
      UPDATE calls
      SET status='ended',ended_at=CURRENT_TIMESTAMP
      WHERE id=$1
        AND (caller_id=$2 OR receiver_id=$2)
        AND status IN ('ringing','active')
    `,[callId,user.id]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/call/history" && req.method === "GET") {
  const r = await pool.query(`
    SELECT
      c.*,
      u.name other_name
    FROM calls c
    JOIN users u
      ON u.id=CASE
        WHEN c.caller_id=$1 THEN c.receiver_id
        ELSE c.caller_id
      END
    WHERE c.caller_id=$1 OR c.receiver_id=$1
    ORDER BY c.started_at DESC
    LIMIT 100
  `,[user.id]);

  sendJson(res,200,{success:true,calls:r.rows});
  return;
}


/* ---------- Wallet ---------- */

if (path === "/api/wallet" && req.method === "GET") {
  await pool.query(`
    INSERT INTO wallet_accounts(user_id)
    VALUES($1)
    ON CONFLICT DO NOTHING
  `,[user.id]);

  const [account,transactions] = await Promise.all([
    pool.query(`
      SELECT user_id,balance,currency
      FROM wallet_accounts
      WHERE user_id=$1
    `,[user.id]),

    pool.query(`
      SELECT *
      FROM wallet_transactions
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 100
    `,[user.id])
  ]);

  sendJson(res,200,{
    success:true,
    account:account.rows[0],
    transactions:transactions.rows
  });
  return;
}


/* ---------- Follow status ---------- */

if (path === "/api/follow/status" && req.method === "GET") {
  const targetId = Number(url.searchParams.get("user_id"));

  const [following,pending,blocked] = await Promise.all([
    pool.query(`
      SELECT 1
      FROM follows
      WHERE follower_id=$1 AND following_id=$2
    `,[user.id,targetId]),

    pool.query(`
      SELECT 1
      FROM follow_requests
      WHERE requester_id=$1
        AND target_id=$2
        AND status='pending'
    `,[user.id,targetId]),

    pool.query(`
      SELECT 1
      FROM blocked_users
      WHERE blocker_id=$1 AND blocked_id=$2
    `,[user.id,targetId])
  ]);

  sendJson(res,200,{
    success:true,
    following:!!following.rows.length,
    pending:!!pending.rows.length,
    blocked:!!blocked.rows.length
  });
  return;
}


/* ---------- Posts API ---------- */

if (path === "/api/posts" && req.method === "GET") {
  const limit = Math.min(
    100,
    Math.max(1,Number(url.searchParams.get("limit") || 50))
  );

  const r = await pool.query(`
    SELECT
      p.id,
      p.user_id,
      p.content,
      p.image_url,
      p.media_type,
      p.location,
      p.created_at,
      u.name,
      u.avatar_url,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id)::int like_count,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id)::int comment_count,
      EXISTS(
        SELECT 1 FROM likes l2
        WHERE l2.post_id=p.id AND l2.user_id=$1
      ) liked,
      EXISTS(
        SELECT 1 FROM bookmarks b
        WHERE b.post_id=p.id AND b.user_id=$1
      ) bookmarked
    FROM posts p
    JOIN users u ON u.id=p.user_id
    WHERE p.archived=FALSE
      AND NOT EXISTS(
        SELECT 1
        FROM blocked_users b
        WHERE
          (b.blocker_id=$1 AND b.blocked_id=p.user_id)
          OR
          (b.blocker_id=p.user_id AND b.blocked_id=$1)
      )
      AND NOT EXISTS(
        SELECT 1
        FROM hidden_posts hp
        WHERE hp.user_id=$1 AND hp.post_id=p.id
      )
      AND NOT EXISTS(
        SELECT 1
        FROM mutes mu
        WHERE mu.user_id=$1 AND mu.muted_id=p.user_id
      )
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `,[user.id]);

  sendJson(res,200,{success:true,posts:r.rows});
  return;
}


if (path === "/api/post/delete" && req.method === "POST") {
  const d = await readBody(req);
  const postId = Number(d.get("post_id"));

  if (isSafeInteger(postId)) {
    await pool.query(`
      DELETE FROM posts
      WHERE id=$1 AND user_id=$2
    `,[postId,user.id]);
  }

  sendJson(res,200,{success:true});
  return;
}


/* ---------- Stories API ---------- */

if (path === "/api/stories" && req.method === "GET") {
  await pool.query(`
    DELETE FROM stories
    WHERE expires_at<CURRENT_TIMESTAMP
  `);

  const r = await pool.query(`
    SELECT
      s.id,s.user_id,s.media_url,s.text,s.media_type,
      s.expires_at,s.created_at,
      u.name,u.avatar_url
    FROM stories s
    JOIN users u ON u.id=s.user_id
    WHERE s.expires_at>CURRENT_TIMESTAMP
      AND NOT EXISTS(
        SELECT 1
        FROM blocked_users b
        WHERE
          (b.blocker_id=$1 AND b.blocked_id=s.user_id)
          OR
          (b.blocker_id=s.user_id AND b.blocked_id=$1)
      )
    ORDER BY s.created_at DESC
    LIMIT 100
  `,[user.id]);

  sendJson(res,200,{success:true,stories:r.rows});
  return;
}


/* ---------- Reels API ---------- */

if (path === "/api/reels" && req.method === "GET") {
  const r = await pool.query(`
    SELECT
      r.id,r.user_id,r.media_url,r.caption,r.created_at,
      u.name,u.avatar_url,
      (SELECT COUNT(*) FROM reel_likes l WHERE l.reel_id=r.id)::int like_count,
      (SELECT COUNT(*) FROM reel_comments c WHERE c.reel_id=r.id)::int comment_count,
      (SELECT COUNT(*) FROM reel_views v WHERE v.reel_id=r.id)::int view_count,
      EXISTS(
        SELECT 1 FROM reel_likes l2
        WHERE l2.reel_id=r.id AND l2.user_id=$1
      ) liked
    FROM reels r
    JOIN users u ON u.id=r.user_id
    WHERE NOT EXISTS(
      SELECT 1 FROM hidden_reels h
      WHERE h.user_id=$1 AND h.reel_id=r.id
    )
      AND NOT EXISTS(
        SELECT 1 FROM blocked_users b
        WHERE
          (b.blocker_id=$1 AND b.blocked_id=r.user_id)
          OR
          (b.blocker_id=r.user_id AND b.blocked_id=$1)
      )
    ORDER BY r.created_at DESC
    LIMIT 100
  `,[user.id]);

  sendJson(res,200,{success:true,reels:r.rows});
  return;
}


/* ---------- Shop API ---------- */

if (path === "/api/shop/products" && req.method === "GET") {
  const q = String(url.searchParams.get("q") || "").trim();

  const r = q
    ? await pool.query(`
        SELECT
          p.*,
          u.name seller_name,
          COALESCE(AVG(pr.rating),0)::numeric(3,2) rating,
          COUNT(pr.id)::int review_count
        FROM products p
        JOIN users u ON u.id=p.seller_id
        LEFT JOIN product_reviews pr ON pr.product_id=p.id
        WHERE p.status='active'
          AND (
            p.name ILIKE $1
            OR p.description ILIKE $1
          )
        GROUP BY p.id,u.name
        ORDER BY p.created_at DESC
        LIMIT 100
      `,[`%${q}%`])
    : await pool.query(`
        SELECT
          p.*,
          u.name seller_name,
          COALESCE(AVG(pr.rating),0)::numeric(3,2) rating,
          COUNT(pr.id)::int review_count
        FROM products p
        JOIN users u ON u.id=p.seller_id
        LEFT JOIN product_reviews pr ON pr.product_id=p.id
        WHERE p.status='active'
        GROUP BY p.id,u.name
        ORDER BY p.created_at DESC
        LIMIT 100
      `);

  sendJson(res,200,{success:true,products:r.rows});
  return;
}


if (path === "/api/shop/cart" && req.method === "GET") {
  const r = await pool.query(`
    SELECT
      c.product_id,
      c.quantity,
      p.name,
      p.price,
      p.currency,
      p.stock,
      p.image_url,
      p.seller_id
    FROM cart_items c
    JOIN products p ON p.id=c.product_id
    WHERE c.user_id=$1
    ORDER BY c.created_at DESC
  `,[user.id]);

  sendJson(res,200,{success:true,items:r.rows});
  return;
}


if (path === "/api/shop/cart/add" && req.method === "POST") {
  const d = await readBody(req);
  const productId = Number(d.get("product_id"));
  const quantity = Math.max(1,Number(d.get("quantity") || 1));

  const p = await pool.query(`
    SELECT id,stock,status
    FROM products
    WHERE id=$1
  `,[productId]);

  if (!p.rows.length || p.rows[0].status !== "active") {
    sendJson(res,404,{success:false,error:"محصول پیدا نشد."});
    return;
  }

  if (quantity > Number(p.rows[0].stock)) {
    sendJson(res,400,{success:false,error:"موجودی محصول کافی نیست."});
    return;
  }

  await pool.query(`
    INSERT INTO cart_items(user_id,product_id,quantity)
    VALUES($1,$2,$3)
    ON CONFLICT(user_id,product_id)
    DO UPDATE SET quantity=LEAST(
      products.stock,
      cart_items.quantity+$3
    )
  `,[user.id,productId,quantity]);

  sendJson(res,200,{success:true});
  return;
}


/* ---------- Product review ---------- */

if (path === "/api/shop/review" && req.method === "POST") {
  const d = await readBody(req);

  const productId = Number(d.get("product_id"));
  const rating = Number(d.get("rating"));
  const review = String(d.get("review") || "").trim();

  if (
    !isSafeInteger(productId) ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    sendJson(res,400,{success:false,error:"امتیاز نامعتبر است."});
    return;
  }

  const purchased = await pool.query(`
    SELECT 1
    FROM shop_order_items oi
    JOIN shop_orders o ON o.id=oi.order_id
    WHERE oi.product_id=$1
      AND o.buyer_id=$2
      AND o.status IN ('paid','processing','shipped','delivered')
    LIMIT 1
  `,[productId,user.id]);

  if (!purchased.rows.length) {
    sendJson(res,403,{
      success:false,
      error:"فقط خریدار محصول می‌تواند نظر ثبت کند."
    });
    return;
  }

  await pool.query(`
    INSERT INTO product_reviews(product_id,user_id,rating,review)
    VALUES($1,$2,$3,$4)
    ON CONFLICT(product_id,user_id)
    DO UPDATE SET
      rating=EXCLUDED.rating,
      review=EXCLUDED.review
  `,[productId,user.id,rating,review]);

  sendJson(res,200,{success:true});
  return;
}


/* ---------- Admin ---------- */

if (path === "/api/admin/status" && req.method === "GET") {
  sendJson(res,200,{
    success:true,
    admin:requireAdmin(user),
    role:user.role || "user"
  });
  return;
}


if (path === "/api/admin/users" && req.method === "GET") {
  if (!requireAdmin(user)) {
    sendJson(res,403,{success:false,error:"دسترسی غیرمجاز."});
    return;
  }

  const r = await pool.query(`
    SELECT
      id,name,email,
      COALESCE(role,'user') role,
      COALESCE(status,'active') status
    FROM users
    ORDER BY id DESC
    LIMIT 500
  `);

  sendJson(res,200,{success:true,users:r.rows});
  return;
}


if (path === "/api/admin/user/status" && req.method === "POST") {
  if (!requireAdmin(user)) {
    sendJson(res,403,{success:false,error:"دسترسی غیرمجاز."});
    return;
  }

  const d = await readBody(req);
  const targetId = Number(d.get("user_id"));
  const status = ["active","suspended","disabled"].includes(
    String(d.get("status"))
  )
    ? String(d.get("status"))
    : "active";

  if (!isSafeInteger(targetId) || targetId === user.id) {
    sendJson(res,400,{success:false});
    return;
  }

  await pool.query(`
    UPDATE users
    SET status=$1
    WHERE id=$2
  `,[status,targetId]);

  await pool.query(`
    DELETE FROM sessions
    WHERE user_id=$1
  `,[targetId]);

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/admin/user/role" && req.method === "POST") {
  if (!requireAdmin(user)) {
    sendJson(res,403,{success:false,error:"دسترسی غیرمجاز."});
    return;
  }

  const d = await readBody(req);
  const targetId = Number(d.get("user_id"));
  const role = ["user","moderator","admin"].includes(
    String(d.get("role"))
  )
    ? String(d.get("role"))
    : "user";

  if (!isSafeInteger(targetId) || targetId === user.id) {
    sendJson(res,400,{success:false});
    return;
  }

  if (String(user.role) !== "superadmin" && role === "admin") {
    sendJson(res,403,{
      success:false,
      error:"فقط superadmin می‌تواند admin جدید تعیین کند."
    });
    return;
  }

  await pool.query(`
    UPDATE users
    SET role=$1
    WHERE id=$2
  `,[role,targetId]);

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/admin/reports" && req.method === "GET") {
  if (!requireAdmin(user)) {
    sendJson(res,403,{success:false});
    return;
  }

  const r = await pool.query(`
    SELECT
      r.*,
      u.name reporter_name,
      ru.name reported_name
    FROM reports r
    JOIN users u ON u.id=r.reporter_id
    LEFT JOIN users ru ON ru.id=r.reported_user_id
    ORDER BY r.created_at DESC
    LIMIT 300
  `);

  sendJson(res,200,{success:true,reports:r.rows});
  return;
}


/* ---------- Security ---------- */

if (path === "/api/security/status" && req.method === "GET") {
  const sessions = await pool.query(`
    SELECT COUNT(*)::int count
    FROM sessions
    WHERE user_id=$1
  `,[user.id]);

  const devices = await pool.query(`
    SELECT COUNT(*)::int count
    FROM user_devices
    WHERE user_id=$1
  `,[user.id]);

  sendJson(res,200,{
    success:true,
    sessions:sessions.rows[0].count,
    devices:devices.rows[0].count
  });
  return;
}


if (path === "/api/security/sessions" && req.method === "GET") {
  const r = await pool.query(`
    SELECT
      session_id,
      created_at
    FROM sessions
    WHERE user_id=$1
    ORDER BY created_at DESC
  `,[user.id]);

  sendJson(res,200,{success:true,sessions:r.rows});
  return;
}


if (path === "/api/security/session/revoke" && req.method === "POST") {
  const d = await readBody(req);
  const sessionId = String(d.get("session_id") || "");

  if (sessionId) {
    await pool.query(`
      DELETE FROM sessions
      WHERE session_id=$1 AND user_id=$2
    `,[sessionId,user.id]);
  }

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/security/sessions/revoke-all" && req.method === "POST") {
  const current = parseCookies(req).sessionId;

  await pool.query(`
    DELETE FROM sessions
    WHERE user_id=$1 AND session_id<>$2
  `,[user.id,current || ""]);

  sendJson(res,200,{success:true});
  return;
}


if (path === "/api/security/devices" && req.method === "GET") {
  const r = await pool.query(`
    SELECT id,device_name,ip,user_agent,last_seen,created_at
    FROM user_devices
    WHERE user_id=$1
    ORDER BY last_seen DESC
    LIMIT 100
  `,[user.id]);

  sendJson(res,200,{success:true,devices:r.rows});
  return;
}


if (path === "/api/security/device/revoke" && req.method === "POST") {
  const d = await readBody(req);
  const id = Number(d.get("id"));

  if (isSafeInteger(id)) {
    await pool.query(`
      DELETE FROM user_devices
      WHERE id=$1 AND user_id=$2
    `,[id,user.id]);
  }

  sendJson(res,200,{success:true});
  return;
}


/* ---------- Password reset, transaction-safe ---------- */

if (path === "/api/security/password-reset/confirm" && req.method === "POST") {
  const d = await readBody(req);

  const token = String(d.get("token") || "").trim();
  const newPassword = String(d.get("password") || "");

  if (!token || newPassword.length < 6) {
    sendJson(res,400,{
      success:false,
      error:"توکن یا رمز جدید نامعتبر است."
    });
    return;
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const r = await client.query(`
      SELECT user_id
      FROM password_reset_tokens
      WHERE token_hash=$1
        AND used=FALSE
        AND expires_at>CURRENT_TIMESTAMP
      FOR UPDATE
    `,[tokenHash]);

    if (!r.rows.length) {
      await client.query("ROLLBACK");

      sendJson(res,400,{
        success:false,
        error:"توکن نامعتبر یا منقضی شده است."
      });
      return;
    }

    const userId = r.rows[0].user_id;

    await client.query(`
      UPDATE users
      SET password=$1
      WHERE id=$2
    `,[hashPassword(newPassword),userId]);

    await client.query(`
      UPDATE password_reset_tokens
      SET used=TRUE
      WHERE token_hash=$1
    `,[tokenHash]);

    await client.query(`
      DELETE FROM sessions
      WHERE user_id=$1
    `,[userId]);

    await client.query("COMMIT");

    sendJson(res,200,{success:true});
    return;

  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}

    console.error("PASSWORD RESET ERROR:",e);

    sendJson(res,500,{
      success:false,
      error:"خطا در تغییر رمز عبور."
    });
    return;

  } finally {
    client.release();
  }
}


/* ---------- Reports ---------- */

if (path === "/api/content/report-user" && req.method === "POST") {
  const d = await readBody(req);

  const targetId = Number(d.get("user_id"));
  const reason = String(d.get("reason") || "گزارش کاربر")
    .trim()
    .slice(0,500);

  if (
    !isSafeInteger(targetId) ||
    targetId === user.id
  ) {
    sendJson(res,400,{success:false});
    return;
  }

  await pool.query(`
    INSERT INTO reports(
      reporter_id,
      reported_user_id,
      reason
    )
    VALUES($1,$2,$3)
  `,[user.id,targetId,reason]);

  await createAdvancedNotification(
    targetId,
    user.id,
    "security",
    "یک گزارش درباره حساب شما ثبت شد.",
    "report",
    null
  );

  sendJson(res,200,{success:true});
  return;
}


/* ---------- Logout API ---------- */

if (path === "/api/logout" && req.method === "POST") {
  const sid = parseCookies(req).sessionId;

  if (sid) {
    await pool.query(`
      DELETE FROM sessions
      WHERE session_id=$1
    `,[sid]);
  }

  sendJson(res,200,{success:true});
  return;
}


/* ---------- System cleanup ---------- */

if (path === "/api/system/cleanup" && req.method === "POST") {
  if (!requireAdmin(user)) {
    sendJson(res,403,{success:false,error:"دسترسی غیرمجاز."});
    return;
  }

  const result = {};

  const stories = await pool.query(`
    DELETE FROM stories
    WHERE expires_at<CURRENT_TIMESTAMP
  `);

  result.stories = stories.rowCount;

  const tokens = await pool.query(`
    DELETE FROM password_reset_tokens
    WHERE expires_at<CURRENT_TIMESTAMP OR used=TRUE
  `);

  result.password_tokens = tokens.rowCount;

  const notifications = await pool.query(`
    DELETE FROM notifications
    WHERE created_at<CURRENT_TIMESTAMP-INTERVAL '180 days'
  `);

  result.notifications = notifications.rowCount;

  const signals = await pool.query(`
    DELETE FROM call_signals
    WHERE created_at<CURRENT_TIMESTAMP-INTERVAL '1 day'
  `);

  result.call_signals = signals.rowCount;

  const loginAttempts = await pool.query(`
    DELETE FROM login_attempts
    WHERE created_at<CURRENT_TIMESTAMP-INTERVAL '90 days'
  `);

  result.login_attempts = loginAttempts.rowCount;

  sendJson(res,200,{success:true,result});
  return;
}


/* =========================================================
   FINAL 404
   ========================================================= */

sendJson(res,404,{
  success:false,
  error:"مسیر مورد نظر پیدا نشد."
});
return;

} catch (error) {

  console.error("SERVER ERROR:", error);

  if (!res.headersSent) {
    sendJson(res,500,{
      success:false,
      error:"خطای داخلی سرور."
    });
  }

  return;
}
});


/* =========================================================
   SERVER STARTUP
   ========================================================= */

async function startServer() {
  try {
    await createTables();

    await pool.query(`
      UPDATE users
      SET status='active'
      WHERE status IS NULL
    `).catch(() => {});

    await pool.query(`
      INSERT INTO badges(name,description,icon)
      VALUES
        ('First Post','اولین پست','🏅'),
        ('Active User','کاربر فعال','⭐'),
        ('Creator','سازنده محتوا','🎨')
      ON CONFLICT(name) DO NOTHING
    `).catch(() => {});

    await pool.query(`
      INSERT INTO rewards(name,description,points_required,active)
      VALUES
        ('Starter','جایزه شروع فعالیت',10,TRUE),
        ('Active Creator','جایزه سازنده فعال',100,TRUE),
        ('Super Creator','جایزه سازنده برتر',500,TRUE)
      ON CONFLICT DO NOTHING
    `).catch(() => {});

    await pool.query(`
      UPDATE user_subscriptions
      SET status='expired'
      WHERE status='active'
        AND expires_at<=CURRENT_TIMESTAMP
    `).catch(() => {});

    await pool.query(`
      DELETE FROM stories
      WHERE expires_at<CURRENT_TIMESTAMP
    `).catch(() => {});

    await pool.query(`
      DELETE FROM password_reset_tokens
      WHERE expires_at<CURRENT_TIMESTAMP OR used=TRUE
    `).catch(() => {});

    server.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log("=================================");
        console.log("MySocial server is running.");
        console.log("PORT:",PORT);
        console.log("Database: connected");
        console.log("=================================");
      }
    );

  } catch (error) {
    console.error("STARTUP ERROR:",error);
    process.exit(1);
  }
}

startServer();
