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
    try { cookies[key] = decodeURIComponent(value); }
    catch { cookies[key] = value; }
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
      <a href="/account">📱 امکانات</a><a href="/settings">⚙️ تنظیمات</a>
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
body.dark{background:#111;color:#eee} body.dark .app,body.dark .header,body.dark .bottom-nav,body.dark input,body.dark textarea{background:#181818;color:#eee} body.dark .card{background:#1d1d1d;border-color:#333} body.dark .top-actions a{background:#292929;color:#eee} body.dark input,body.dark textarea{border-color:#444} body.dark .comment,body.dark .job{background:#242424;border-color:#3a3a3a} body.dark .email,body.dark .small,body.dark .stats{color:#aaa}
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
<script>function toggleTheme(){document.body.classList.toggle("dark");localStorage.setItem("dark",document.body.classList.contains("dark"));}if(localStorage.getItem("dark")==="true")document.body.classList.add("dark");</script>
</body>
</html>`;
}

async function ensureColumn(table, column, definition) {
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
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
  await ensureColumn("posts", "media_type", "TEXT DEFAULT 'image'");
  await ensureColumn("posts", "location", "TEXT");
  await ensureColumn("posts", "archived", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("posts", "pinned", "BOOLEAN DEFAULT FALSE");

  try {
    await pool.query(`
      UPDATE posts
      SET content = text
      WHERE (content IS NULL OR content = '')
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='posts' AND column_name='text'
        )
    `);
    console.log("Old posts.text data copied to posts.content.");
  } catch (e) {
    console.log("Old posts.text migration skipped.");
  }

  await pool.query(`UPDATE posts SET content = '' WHERE content IS NULL`);
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
  `);

  await pool.query(`
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

  await ensureColumn("notifications", "message", "TEXT");
  await ensureColumn("notifications", "is_read", "BOOLEAN DEFAULT FALSE");

  try {
    await pool.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='read') THEN UPDATE notifications SET is_read = read WHERE is_read IS NULL; END IF; END $$;`);
  } catch (e) {
    console.log("Old notifications migration skipped.");
  }

  await pool.query(`UPDATE notifications SET message='' WHERE message IS NULL`);
  await pool.query(`UPDATE notifications SET is_read=FALSE WHERE is_read IS NULL`);
  await pool.query(`ALTER TABLE notifications ALTER COLUMN message SET NOT NULL`);

  try {
    await pool.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='saved_posts') THEN
        INSERT INTO bookmarks(user_id,post_id) SELECT user_id,post_id FROM saved_posts ON CONFLICT DO NOTHING;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='blocks') THEN
        INSERT INTO blocked_users(blocker_id,blocked_id) SELECT blocker_id,blocked_id FROM blocks ON CONFLICT DO NOTHING;
      END IF;
    END $$;`);
  } catch (e) {
    console.log("Legacy bookmark/block migration skipped.");
  }

  // Instagram-like expansion: stories, reels, highlights, analytics, privacy,
  // creator monetization ledger and advertising management.
  await pool.query(`CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_url TEXT,
    text TEXT DEFAULT '',
    media_type TEXT DEFAULT 'image',
    expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS story_views (
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(story_id,user_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS story_reactions (
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(story_id,user_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS highlights (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    cover_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS highlight_items (
    highlight_id INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    PRIMARY KEY(highlight_id,story_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS reels (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    caption TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS reel_likes (
    reel_id INTEGER NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(reel_id,user_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS reel_comments (
    id SERIAL PRIMARY KEY,
    reel_id INTEGER NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS reel_views (
    id SERIAL PRIMARY KEY,
    reel_id INTEGER NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS post_views (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS shares (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    reel_id INTEGER REFERENCES reels(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK((post_id IS NOT NULL) OR (reel_id IS NOT NULL))
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS hashtags (
    id SERIAL PRIMARY KEY,
    tag TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS hashtag_posts (
    hashtag_id INTEGER NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    PRIMARY KEY(hashtag_id,post_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS hashtag_reels (
    hashtag_id INTEGER NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
    reel_id INTEGER NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    PRIMARY KEY(hashtag_id,reel_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS collections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,name)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS collection_items (
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    PRIMARY KEY(collection_id,post_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS follow_requests (
    id SERIAL PRIMARY KEY,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id,target_id),
    CHECK(requester_id<>target_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS restrictions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    restricted_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id,restricted_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS mutes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    muted_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id,muted_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS close_friends (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id,friend_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    is_private BOOLEAN DEFAULT FALSE,
    message_policy TEXT DEFAULT 'everyone',
    mention_policy TEXT DEFAULT 'everyone',
    tag_policy TEXT DEFAULT 'everyone',
    show_activity BOOLEAN DEFAULT TRUE,
    allow_story_replies BOOLEAN DEFAULT TRUE,
    notifications_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS ad_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_name TEXT DEFAULT '',
    balance NUMERIC(14,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS ads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    media_url TEXT,
    target_url TEXT,
    budget NUMERIC(14,2) DEFAULT 0,
    spent NUMERIC(14,2) DEFAULT 0,
    status TEXT DEFAULT 'draft',
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS ad_events (
    id SERIAL PRIMARY KEY,
    ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);  await pool.query(`CREATE TABLE IF NOT EXISTS creator_accounts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT TRUE,
    balance NUMERIC(14,2) DEFAULT 0,
    lifetime_earned NUMERIC(14,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS creator_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS creator_payouts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(14,2) NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS creator_subscriptions (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscriber_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(14,2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(creator_id,subscriber_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price NUMERIC(14,2) NOT NULL DEFAULT 0,
    duration_days INTEGER NOT NULL DEFAULT 30,
    features TEXT DEFAULT '',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS user_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'active',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    auto_renew BOOLEAN DEFAULT FALSE,
    UNIQUE(user_id,plan_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS wallet_accounts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS wallet_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS payment_orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(14,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    purpose TEXT NOT NULL,
    reference_id INTEGER,
    provider TEXT DEFAULT 'external',
    provider_payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS paid_content (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    reel_id INTEGER REFERENCES reels(id) ON DELETE CASCADE,
    price NUMERIC(14,2) NOT NULL DEFAULT 0,
    title TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK ((post_id IS NOT NULL) OR (reel_id IS NOT NULL))
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS paid_content_purchases (
    id SERIAL PRIMARY KEY,
    content_id INTEGER NOT NULL REFERENCES paid_content(id) ON DELETE CASCADE,
    buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(14,2) NOT NULL,
    payment_order_id INTEGER REFERENCES payment_orders(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(content_id,buyer_id)
  )`);

  await pool.query(`INSERT INTO subscription_plans(name,description,price,duration_days,features)
    SELECT 'MySocial Premium','امکانات ویژه حساب',4.99,30,'بدون تبلیغ · نشان ویژه · امکانات بیشتر'
    WHERE NOT EXISTS (SELECT 1 FROM subscription_plans)`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active ON user_subscriptions(user_id,status,expires_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON wallet_transactions(user_id,created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id,created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_paid_content_creator ON paid_content(creator_id,created_at DESC)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS profile_visits (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visitor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS login_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stories_expiry ON stories(expires_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reels_created ON reels(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ad_events_ad ON ad_events(ad_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at DESC)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS live_streams (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'پخش زنده MySocial',
    status TEXT NOT NULL DEFAULT 'live',
    stream_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS live_viewers (
    live_id INTEGER NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(live_id,user_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS live_comments (
    id SERIAL PRIMARY KEY,
    live_id INTEGER NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_live_streams_status ON live_streams(status,created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_live_comments_live ON live_comments(live_id,created_at DESC)`);

  console.log("Database tables checked and repaired successfully.");
}

async function createSession(userId) {
  const id = crypto.randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO sessions(session_id,user_id) VALUES($1,$2)`,
    [id,userId]
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
  `,[sid]);

  return r.rows[0] || null;
}

async function notify(userId, actorId, type, postId, message) {
  if (!userId || userId === actorId) return;

  await pool.query(`
    INSERT INTO notifications(user_id,actor_id,type,post_id,message)
    VALUES($1,$2,$3,$4,$5)
  `,[userId,actorId,type,postId || null,message]);
}

function sendJson(res,statusOrData,dataMaybe){
  const status=typeof statusOrData==="number"?statusOrData:200;
  const data=typeof statusOrData==="number"?dataMaybe:statusOrData;

  if(res.headersSent)return;

  res.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store"
  });

  res.end(JSON.stringify(data??{}));
}

function sendPage(res,title,content,user=null){
  return sendHtml(res,200,title,content,user);
}

function isSafeInteger(v){
  return Number.isInteger(Number(v))&&Number(v)>0;
}

function validHttpUrl(v){
  try{
    const u=new URL(String(v));
    return u.protocol==="http:"||u.protocol==="https:";
  }catch{
    return false;
  }
}

async function ensureNotificationPreferences(userId){
  try{
    await pool.query(`
      INSERT INTO notification_preferences(user_id)
      VALUES($1)
      ON CONFLICT(user_id) DO NOTHING
    `,[userId]);
  }catch{}
}

async function createAdvancedNotification(
  userId,
  actorId,
  type,
  message,
  entityType=null,
  entityId=null
){
  if(!userId||Number(userId)===Number(actorId))return;

  try{
    await ensureNotificationPreferences(userId);

    await pool.query(`
      INSERT INTO notifications(
        user_id,
        actor_id,
        type,
        message,
        entity_type,
        entity_id
      )
      VALUES($1,$2,$3,$4,$5,$6)
    `,[
      userId,
      actorId||null,
      type,
      message,
      entityType,
      entityId
    ]);
  }catch(e){
    console.error("NOTIFICATION ERROR:",e.message);
  }
}

async function isAdmin(userId){
  try{
    const r=await pool.query(`
      SELECT COALESCE(role,'') AS role
      FROM users
      WHERE id=$1
    `,[userId]);

    return !!(
      r.rows.length &&
      ["admin","superadmin"].includes(
        String(r.rows[0].role||"").toLowerCase()
      )
    );
  }catch{
    return false;
  }
}

function requireAdmin(user){
  return !!(
    user &&
    ["admin","superadmin"].includes(
      String(user.role||"").toLowerCase()
    )
  );
}

const server = http.createServer(async (req,res) => {    if (req.method==="GET" && path==="/notifications") {
      const r=await pool.query(`SELECT n.*,u.name actor_name FROM notifications n LEFT JOIN users u ON u.id=n.actor_id WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 50`,[user.id]);
      await pool.query(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1`,[user.id]);
      const html=r.rows.map(n=>`<div class="card"><div>${n.is_read?"🔔":"🔵"} ${escapeHtml(n.message)}</div><div class="small">${escapeHtml(n.created_at)}</div></div>`).join("")||`<div class="card empty">اعلانی ندارید.</div>`;
      sendHtml(res,200,"اعلان‌ها",html,user);return;
    }

    if (req.method==="GET" && path==="/profile/edit") {
      sendHtml(res,200,"ویرایش پروفایل",`<div class="card"><form method="POST" action="/profile/edit"><input name="name" value="${escapeHtml(user.name)}" maxlength="100" required><input name="email" type="email" value="${escapeHtml(user.email)}" maxlength="200" required><button class="full">💾 ذخیره تغییرات</button></form></div>`,user);return;
    }

    if (req.method==="POST" && path==="/profile/edit") {
      const d=await readBody(req),name=(d.get("name")||"").trim(),email=(d.get("email")||"").trim().toLowerCase();
      try { await pool.query(`UPDATE users SET name=$1,email=$2 WHERE id=$3`,[name,email,user.id]); sendHtml(res,200,"پروفایل",`<div class="card"><p class="success">تغییرات ذخیره شد ✅</p><a href="/profile"><button class="full">بازگشت به پروفایل</button></a></div>`,user); }
      catch(e){sendHtml(res,400,"خطا",`<p class="error">این ایمیل قبلاً استفاده شده است.</p>`,user);}
      return;
    }

    if (req.method==="GET" && path==="/password") {
      sendHtml(res,200,"تغییر رمز عبور",`<div class="card"><form method="POST" action="/password"><input name="old_password" type="password" placeholder="رمز فعلی" required><input name="new_password" type="password" minlength="6" placeholder="رمز جدید، حداقل ۶ کاراکتر" required><button class="full">🔐 تغییر رمز</button></form></div>`,user);return;
    }

    if (req.method==="POST" && path==="/password") {
      const d=await readBody(req),oldPassword=d.get("old_password")||"",newPassword=d.get("new_password")||"";
      const r=await pool.query(`SELECT password FROM users WHERE id=$1`,[user.id]);
      if(!r.rows.length || hashPassword(oldPassword)!==r.rows[0].password || newPassword.length<6){sendHtml(res,400,"خطا",`<p class="error">رمز فعلی اشتباه است یا رمز جدید کوتاه است.</p>`,user);return;}
      await pool.query(`UPDATE users SET password=$1 WHERE id=$2`,[hashPassword(newPassword),user.id]);
      sendHtml(res,200,"موفق",`<div class="card"><p class="success">رمز عبور با موفقیت تغییر کرد ✅</p><a href="/settings"><button class="full">بازگشت</button></a></div>`,user);return;
    }

    if (req.method==="GET" && path==="/settings") {
      sendHtml(res,200,"تنظیمات",`<div class="card"><h3>حساب کاربری ⚙️</h3><p class="success">حساب فعال است ✅</p><p class="small">ایمیل: ${escapeHtml(user.email)}</p></div><div class="card"><h3>امکانات</h3><div class="menu"><a href="/notifications">🔔 اعلان‌ها</a><a href="/bookmarks">🔖 پست‌های ذخیره‌شده</a><a href="/collections">📚 مجموعه‌ها</a><a href="/archived">🗄️ آرشیو</a><a href="/profile/edit">✏️ ویرایش پروفایل</a><a href="/password">🔐 تغییر رمز عبور</a><button class="theme-btn" onclick="toggleTheme()">🌙 تغییر حالت نمایش</button></div></div>`,user);return;
    }

    if (req.method==="GET" && path==="/logout") {
      const sid=parseCookies(req).sessionId;
      if(sid) await pool.query(`DELETE FROM sessions WHERE session_id=$1`,[sid]);
      redirect(res,"/","sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");return;
    }


    /* =====================================================
       STORIES / REELS / EXPLORE / HASHTAGS
       ===================================================== */
    if (req.method === "GET" && path === "/stories") {
      await pool.query(`DELETE FROM stories WHERE expires_at < CURRENT_TIMESTAMP`);
      const r = await pool.query(`
        SELECT s.*,u.name,u.email,
          (SELECT COUNT(*) FROM story_views v WHERE v.story_id=s.id)::int view_count,
          EXISTS(SELECT 1 FROM story_views v2 WHERE v2.story_id=s.id AND v2.user_id=$1) viewed
        FROM stories s JOIN users u ON u.id=s.user_id
        WHERE s.expires_at>CURRENT_TIMESTAMP
          AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id=$1 AND b.blocked_id=s.user_id) OR (b.blocker_id=s.user_id AND b.blocked_id=$1))
        ORDER BY s.created_at DESC LIMIT 100`,[user.id]);
      let html=`<div class="card"><h2>📖 استوری‌ها</h2><form method="POST" action="/stories"><input name="media_url" maxlength="2000" placeholder="لینک عکس/ویدئو"><input name="media_type" value="image" placeholder="image یا video"><textarea name="text" maxlength="1000" placeholder="متن استوری"></textarea><button class="full green">➕ انتشار استوری</button></form></div>`;
      html+=r.rows.map(x=>`<div class="card"><div class="profile-head"><div class="avatar">${escapeHtml(x.name.charAt(0))}</div><div><div class="username">${escapeHtml(x.name)}</div><div class="small">${new Date(x.created_at).toLocaleString("fa-IR")}</div></div></div>${x.media_url?(x.media_type==="video"?`<video controls class="post-image" src="${escapeHtml(x.media_url)}"></video>`:`<img class="post-image" src="${escapeHtml(x.media_url)}" alt="استوری">`):""}<div class="post-text">${escapeHtml(x.text||"")}</div><div class="stats">👀 ${x.view_count} ${x.viewed?"· دیده‌اید":""}</div><div class="actions"><a href="/story-view?id=${x.id}"><button>👀 مشاهده</button></a><a href="/story-react?id=${x.id}&reaction=❤️"><button>❤️</button></a><a href="/story-react?id=${x.id}&reaction=😂"><button>😂</button></a>${Number(x.user_id)===Number(user.id)?`<a href="/story-delete?id=${x.id}"><button class="danger">🗑 حذف</button></a>`:""}</div></div>`).join("")||`<div class="card empty">استوری فعالی وجود ندارد.</div>`;
      sendHtml(res,200,"استوری‌ها",html,user);return;
    }

    if (req.method === "POST" && path === "/stories") {
      const d=await readBody(req),mediaUrl=String(d.get("media_url")||"").trim(),mediaType=String(d.get("media_type")||"image").trim()==="video"?"video":"image",text=String(d.get("text")||"").trim();
      if(!mediaUrl&&!text){sendHtml(res,400,"خطا",`<div class="card"><p class="error">استوری باید متن یا رسانه داشته باشد.</p></div>`,user);return;}
      await pool.query(`INSERT INTO stories(user_id,media_url,text,media_type) VALUES($1,$2,$3,$4)`,[user.id,mediaUrl||null,text,mediaType]);
      redirect(res,"/stories");return;
    }

    if (req.method === "GET" && path === "/story-view") {
      const id=Number(url.searchParams.get("id"));
      if(Number.isInteger(id)){await pool.query(`INSERT INTO story_views(story_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,user.id]);}
      redirect(res,"/stories");return;
    }

    if (req.method === "GET" && path === "/story-react") {
      const id=Number(url.searchParams.get("id")),reaction=String(url.searchParams.get("reaction")||"❤️").slice(0,20);
      if(Number.isInteger(id)) await pool.query(`INSERT INTO story_reactions(story_id,user_id,reaction) VALUES($1,$2,$3) ON CONFLICT(story_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction`,[id,user.id,reaction]);
      redirect(res,"/stories");return;
    }

    if (req.method === "GET" && path === "/story-delete") {
      const id=Number(url.searchParams.get("id"));
      if(Number.isInteger(id))await pool.query(`DELETE FROM stories WHERE id=$1 AND user_id=$2`,[id,user.id]);
      redirect(res,"/stories");return;
    }

    if (req.method === "GET" && path === "/reels") {
      const r=await pool.query(`SELECT r.*,u.name,(SELECT COUNT(*) FROM reel_likes l WHERE l.reel_id=r.id)::int like_count,(SELECT COUNT(*) FROM reel_comments c WHERE c.reel_id=r.id)::int comment_count,(SELECT COUNT(*) FROM reel_views v WHERE v.reel_id=r.id)::int view_count,EXISTS(SELECT 1 FROM reel_likes l2 WHERE l2.reel_id=r.id AND l2.user_id=$1) liked FROM reels r JOIN users u ON u.id=r.user_id WHERE NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id=$1 AND b.blocked_id=r.user_id) OR (b.blocker_id=r.user_id AND b.blocked_id=$1)) ORDER BY r.created_at DESC LIMIT 100`,[user.id]);
      let html=`<div class="card"><h2>🎬 ویدئوهای کوتاه</h2><form method="POST" action="/reels"><input name="media_url" maxlength="2000" placeholder="لینک ویدئو" required><textarea name="caption" maxlength="3000" placeholder="توضیح ویدئو"></textarea><button class="full green">🎬 انتشار ویدئو</button></form></div>`;
      html+=r.rows.map(x=>`<article class="card"><div class="profile-head"><div class="avatar">${escapeHtml(x.name.charAt(0))}</div><div><div class="username">${escapeHtml(x.name)}</div><div class="small">${new Date(x.created_at).toLocaleString("fa-IR")}</div></div></div><video controls playsinline class="post-image" src="${escapeHtml(x.media_url)}"></video><div class="post-text">${escapeHtml(x.caption||"")}</div><div class="stats">❤️ ${x.like_count} · 💬 ${x.comment_count} · 👀 ${x.view_count}</div><div class="actions"><a href="/reel-like?id=${x.id}"><button class="like">${x.liked?"💔 لغو لایک":"❤️ لایک"}</button></a><a href="/reel?id=${x.id}"><button>💬 نظرات</button></a><a href="/reel-share?id=${x.id}"><button>🔗 اشتراک</button></a></div></article>`).join("")||`<div class="card empty">هنوز ویدئویی منتشر نشده است.</div>`;
      sendHtml(res,200,"Reels",html,user);return;
    }

    if (req.method === "POST" && path === "/reels") {
      const d=await readBody(req),mediaUrl=String(d.get("media_url")||"").trim(),caption=String(d.get("caption")||"").trim();
      if(!mediaUrl){sendHtml(res,400,"خطا",`<div class="card"><p class="error">لینک ویدئو لازم است.</p></div>`,user);return;}
      const r=await pool.query(`INSERT INTO reels(user_id,media_url,caption) VALUES($1,$2,$3) RETURNING id`,[user.id,mediaUrl,caption]);
      const tags=(caption.match(/#[\p{L}\p{N}_]+/gu)||[]).map(x=>x.slice(1).toLowerCase());
      for(const tag of tags){const h=await pool.query(`INSERT INTO hashtags(tag) VALUES($1) ON CONFLICT(tag) DO UPDATE SET tag=EXCLUDED.tag RETURNING id`,[tag]);await pool.query(`INSERT INTO hashtag_reels(hashtag_id,reel_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[h.rows[0].id,r.rows[0].id]);}
      redirect(res,"/reels");return;
    }

    if (req.method === "GET" && path === "/reel-like") { const id=Number(url.searchParams.get("id")); if(Number.isInteger(id)){const q=await pool.query(`SELECT 1 FROM reel_likes WHERE reel_id=$1 AND user_id=$2`,[id,user.id]);if(q.rows.length)await pool.query(`DELETE FROM reel_likes WHERE reel_id=$1 AND user_id=$2`,[id,user.id]);else await pool.query(`INSERT INTO reel_likes(reel_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,user.id]);} redirect(res,"/reels");return; }

    if (req.method === "GET" && path === "/reel-view") { const id=Number(url.searchParams.get("id")); if(Number.isInteger(id))await pool.query(`INSERT INTO reel_views(reel_id,user_id) VALUES($1,$2)`,[id,user.id]); redirect(res,"/reels");return; }

    if (req.method === "GET" && path === "/reel-share") { const id=Number(url.searchParams.get("id")); if(Number.isInteger(id))await pool.query(`INSERT INTO shares(user_id,reel_id) VALUES($1,$2)`,[user.id,id]); redirect(res,"/reels");return; }

    if (req.method === "GET" && path === "/reel") {
      const id=Number(url.searchParams.get("id"));
      const r=await pool.query(`SELECT r.*,u.name FROM reels r JOIN users u ON u.id=r.user_id WHERE r.id=$1`,[id]);
      if(!r.rows.length){sendHtml(res,404,"ویدئو",`<div class="card empty">ویدئو پیدا نشد.</div>`,user);return;}
      await pool.query(`INSERT INTO reel_views(reel_id,user_id) VALUES($1,$2)`,[id,user.id]);
      const c=await pool.query(`SELECT c.*,u.name FROM reel_comments c JOIN users u ON u.id=c.user_id WHERE c.reel_id=$1 ORDER BY c.created_at`,[id]);
      let html=`<div class="card"><div class="username">${escapeHtml(r.rows[0].name)}</div><video controls class="post-image" src="${escapeHtml(r.rows[0].media_url)}"></video><div class="post-text">${escapeHtml(r.rows[0].caption||"")}</div></div><div class="card"><h3>💬 نظرات</h3>${c.rows.map(x=>`<div class="comment"><b>${escapeHtml(x.name)}</b><div class="comment-text">${escapeHtml(x.comment)}</div></div>`).join("")||`<div class="empty">هنوز نظری نیست.</div>`}<form method="POST" action="/reel-comment"><input type="hidden" name="reel_id" value="${id}"><textarea name="comment" maxlength="2000" required placeholder="نظر شما..."></textarea><button class="full">ارسال</button></form></div>`;
      sendHtml(res,200,"ویدئو",html,user);return;
    }

    if (req.method === "POST" && path === "/reel-comment") { const d=await readBody(req),id=Number(d.get("reel_id")),comment=String(d.get("comment")||"").trim();if(Number.isInteger(id)&&comment)await pool.query(`INSERT INTO reel_comments(reel_id,user_id,comment) VALUES($1,$2,$3)`,[id,user.id,comment]);redirect(res,`/reel?id=${id}`);return; }

    if (req.method === "GET" && path === "/explore") {
      const posts=await pool.query(`SELECT p.id,p.content,p.image_url,p.created_at,u.name,(SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id)::int likes,(SELECT COUNT(*) FROM post_views v WHERE v.post_id=p.id)::int views FROM posts p JOIN users u ON u.id=p.user_id WHERE NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$1)) ORDER BY ((SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id)*3+(SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id)*2+(SELECT COUNT(*) FROM post_views v WHERE v.post_id=p.id)) DESC,p.created_at DESC LIMIT 100`,[user.id]);
      let html=`<div class="card"><h2>🌍 کاوش</h2><p class="small">محتوای محبوب و جدید را پیدا کن.</p><div class="actions"><a href="/stories"><button>📖 استوری</button></a><a href="/reels"><button>🎬 ویدئوها</button></a><a href="/hashtags"><button>#️⃣ هشتگ‌ها</button></a></div></div>`;
      html+=posts.rows.map(p=>`<article class="card"><div class="username">${escapeHtml(p.name)}</div><div class="post-text">${escapeHtml(p.content)}</div>${p.image_url?`<img class="post-image" src="${escapeHtml(p.image_url)}">`:""}<div class="stats">❤️ ${p.likes} · 👀 ${p.views}</div><a href="/post?id=${p.id}"><button>مشاهده</button></a></article>`).join("")||`<div class="card empty">محتوایی پیدا نشد.</div>`;
      sendHtml(res,200,"کاوش",html,user);return;
    }

    if (req.method === "GET" && path === "/hashtags") {
      const r=await pool.query(`SELECT h.tag,(SELECT COUNT(*) FROM hashtag_posts hp WHERE hp.hashtag_id=h.id)::int posts,(SELECT COUNT(*) FROM hashtag_reels hr WHERE hr.hashtag_id=h.id)::int reels FROM hashtags h ORDER BY (SELECT COUNT(*) FROM hashtag_posts hp WHERE hp.hashtag_id=h.id)+(SELECT COUNT(*) FROM hashtag_reels hr WHERE hr.hashtag_id=h.id) DESC,h.tag LIMIT 100`);
      const html=`<div class="card"><h2>#️⃣ هشتگ‌ها</h2><form method="GET" action="/hashtag"><input name="tag" placeholder="#مثال" required><button class="full">جستجوی هشتگ</button></form></div>${r.rows.map(x=>`<div class="card"><a href="/hashtag?tag=${encodeURIComponent(x.tag)}"><b>#${escapeHtml(x.tag)}</b></a><div class="small">${x.posts} پست · ${x.reels} ویدئو</div></div>`).join("")}`;
      sendHtml(res,200,"هشتگ‌ها",html,user);return;
    }

    if (req.method === "GET" && path === "/hashtag") {
      const tag=String(url.searchParams.get("tag")||"").replace(/^#/,'').trim().toLowerCase();
      const r=await pool.query(`SELECT p.id,p.content,p.image_url,p.created_at,u.name FROM hashtag_posts hp JOIN hashtags h ON h.id=hp.hashtag_id JOIN posts p ON p.id=hp.post_id JOIN users u ON u.id=p.user_id WHERE h.tag=$1 ORDER BY p.created_at DESC LIMIT 100`,[tag]);
      const html=`<div class="card"><h2>#${escapeHtml(tag)}</h2></div>${r.rows.map(p=>`<article class="card"><div class="username">${escapeHtml(p.name)}</div><div class="post-text">${escapeHtml(p.content)}</div>${p.image_url?`<img class="post-image" src="${escapeHtml(p.image_url)}">`:""}<a href="/post?id=${p.id}"><button>مشاهده</button></a></article>`).join("")||`<div class="card empty">پستی با این هشتگ پیدا نشد.</div>`}`;
      sendHtml(res,200,"هشتگ",html,user);return;
    }    if (req.method === "GET" && path === "/collection-remove") {
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
      `,[collectionId,postId]);

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
        DELETE FROM collections
        WHERE id=$1
        AND user_id=$2
      `,[collectionId,user.id]);

      redirect(res,"/collections");
      return;
    }

    // ------------------------------------------------------------
    // BOOKMARKS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/bookmarks") {
      const r = await pool.query(`
        SELECT
          p.*,
          u.name AS user_name,
          u.username
        FROM saved_posts sp
        JOIN posts p
          ON p.id=sp.post_id
        JOIN users u
          ON u.id=p.user_id
        WHERE sp.user_id=$1
        ORDER BY sp.created_at DESC
      `,[user.id]);

      const html =
        r.rows.map(p =>
          renderPost(p,user.id)
        ).join("") ||
        `
          <div class="card empty">
            هنوز پستی ذخیره نکرده‌اید.
          </div>
        `;

      sendPage(
        res,
        "پست‌های ذخیره‌شده",
        `
        <div class="card">
          <h2>🔖 پست‌های ذخیره‌شده</h2>
          <p>پست‌هایی که ذخیره کرده‌اید اینجا نمایش داده می‌شوند.</p>
        </div>
        ${html}
        `,
        user
      );
      return;
    }

    // ------------------------------------------------------------
    // ARCHIVE
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/archived") {
      const r = await pool.query(`
        SELECT
          p.*,
          u.name AS user_name,
          u.username
        FROM posts p
        JOIN users u
          ON u.id=p.user_id
        WHERE p.user_id=$1
        AND COALESCE(p.is_archived,FALSE)=TRUE
        ORDER BY p.created_at DESC
      `,[user.id]);

      const html =
        r.rows.map(p =>
          renderPost(p,user.id)
        ).join("") ||
        `
          <div class="card empty">
            پست آرشیوشده‌ای ندارید.
          </div>
        `;

      sendPage(
        res,
        "آرشیو",
        `
        <div class="card">
          <h2>🗄️ آرشیو پست‌ها</h2>
        </div>
        ${html}
        `,
        user
      );
      return;
    }

    if (
      req.method === "GET" &&
      path === "/archive"
    ) {
      const postId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(postId) ||
        postId <= 0
      ) {
        redirect(res,"/");
        return;
      }

      await pool.query(`
        UPDATE posts
        SET is_archived =
          NOT COALESCE(is_archived,FALSE)
        WHERE id=$1
        AND user_id=$2
      `,[postId,user.id]);

      redirect(res,"/profile");
      return;
    }

    // ------------------------------------------------------------
    // SEARCH
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/search"
    ) {
      const q =
        String(url.searchParams.get("q") || "")
          .trim()
          .slice(0,100);

      let users = [];
      let posts = [];

      if (q) {
        const ur = await pool.query(`
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
          LIMIT 50
        `,[`%${q}%`]);

        users = ur.rows;

        const pr = await pool.query(`
          SELECT
            p.*,
            u.name AS user_name,
            u.username
          FROM posts p
          JOIN users u
            ON u.id=p.user_id
          WHERE
            p.content ILIKE $1
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$2 AND b.blocked_id=p.user_id)
              OR
              (b.blocker_id=p.user_id AND b.blocked_id=$2)
          )
          ORDER BY p.created_at DESC
          LIMIT 50
        `,[`%${q}%`,user.id]);

        posts = pr.rows;
      }

      const usersHtml =
        users.map(u => `
          <div class="card">
            <div class="profile-head">
              <div class="avatar">
                ${escapeHtml(
                  (u.name || u.username || "ک").charAt(0)
                )}
              </div>

              <div>
                <div class="username">
                  ${escapeHtml(
                    u.name || u.username || "کاربر"
                  )}
                </div>

                ${
                  u.username
                    ? `<div class="small">@${escapeHtml(u.username)}</div>`
                    : ""
                }

                ${
                  u.bio
                    ? `<div class="small">${escapeHtml(u.bio)}</div>`
                    : ""
                }
              </div>
            </div>

            <a href="/profile?id=${u.id}">
              <button>مشاهده پروفایل</button>
            </a>
          </div>
        `).join("") ||
        `
          <div class="card empty">
            کاربری پیدا نشد.
          </div>
        `;

      const postsHtml =
        posts.map(p =>
          renderPost(p,user.id)
        ).join("") ||
        `
          <div class="card empty">
            پستی پیدا نشد.
          </div>
        `;

      sendPage(
        res,
        "جستجو",
        `
        <div class="card">
          <h2>🔎 جستجو</h2>

          <form method="GET" action="/search">
            <input
              name="q"
              value="${escapeHtml(q)}"
              maxlength="100"
              placeholder="نام، نام کاربری یا متن پست..."
              required
            >

            <button class="full">
              جستجو
            </button>
          </form>
        </div>

        ${
          q
            ? `
              <div class="card">
                <h3>👤 کاربران</h3>
              </div>

              ${usersHtml}

              <div class="card">
                <h3>📝 پست‌ها</h3>
              </div>

              ${postsHtml}
            `
            : `
              <div class="card empty">
                عبارت موردنظر را وارد کنید.
              </div>
            `
        }
        `,
        user
      );
      return;
    }

    // ------------------------------------------------------------
    // FOLLOW / UNFOLLOW
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/follow"
    ) {
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

      const target = await pool.query(`
        SELECT id
        FROM users
        WHERE id=$1
      `,[targetId]);

      if (!target.rows.length) {
        redirect(res,"/profile");
        return;
      }

      const existing = await pool.query(`
        SELECT 1
        FROM follows
        WHERE
          follower_id=$1
          AND following_id=$2
      `,[user.id,targetId]);

      if (existing.rows.length) {
        await pool.query(`
          DELETE FROM follows
          WHERE
            follower_id=$1
            AND following_id=$2
        `,[user.id,targetId]);
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

    // ------------------------------------------------------------
    // LIKE
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/like"
    ) {
      const postId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(postId) ||
        postId <= 0
      ) {
        redirect(res,"/");
        return;
      }

      const post = await pool.query(`
        SELECT user_id
        FROM posts
        WHERE id=$1
      `,[postId]);

      if (!post.rows.length) {
        redirect(res,"/");
        return;
      }

      const existing = await pool.query(`
        SELECT 1
        FROM likes
        WHERE
          post_id=$1
          AND user_id=$2
      `,[postId,user.id]);

      if (existing.rows.length) {
        await pool.query(`
          DELETE FROM likes
          WHERE
            post_id=$1
            AND user_id=$2
        `,[postId,user.id]);
      } else {
        await pool.query(`
          INSERT INTO likes(
            post_id,
            user_id
          )
          VALUES($1,$2)
          ON CONFLICT DO NOTHING
        `,[postId,user.id]);

        await notify(
          post.rows[0].user_id,
          user.id,
          "like",
          postId,
          `${user.name} پست شما را پسندید.`
        );
      }

      redirect(
        res,
        req.headers.referer || `/?post=${postId}`
      );
      return;
}if (req.method === "GET" && path === "/collection-delete") {
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

/* EXTRA FEATURE SECTION 6 */
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

            <a class="btn"              href="/profile?id=${v.id}">
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

/* EXTRA FEATURE SECTION 7 */
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
      }      const d = await readBody(req);

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
      const transactions = await pool.query(`
        SELECT
          ct.id,
          ct.type,
          ct.amount,
          ct.description,
          ct.created_at
        FROM creator_transactions ct
        JOIN creator_accounts ca
          ON ca.id=ct.creator_id
        WHERE ca.user_id=$1
        ORDER BY ct.created_at DESC
        LIMIT 200
      `,[user.id]);

      const rows =
        transactions.rows.map(t => `
          <tr>
            <td>${t.id}</td>
            <td>${escapeHtml(t.type || "")}</td>
            <td>
              ${Number(t.amount || 0)
                .toLocaleString("fa-IR")}
            </td>
            <td>
              ${escapeHtml(t.description || "")}
            </td>
            <td>
              ${escapeHtml(
                new Date(t.created_at)
                  .toLocaleString("fa-IR")
              )}
            </td>
          </tr>
        `).join("");

      sendPage(
        res,
        "تراکنش‌های سازنده",
        `
        <div class="card">
          <h2>💰 تراکنش‌های من</h2>

          <div style="overflow:auto">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>نوع</th>
                  <th>مبلغ</th>
                  <th>توضیحات</th>
                  <th>تاریخ</th>
                </tr>
              </thead>

              <tbody>
                ${rows || `
                  <tr>
                    <td colspan="5">
                      تراکنشی ثبت نشده است.
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
    // CREATOR PAYOUTS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/creator-payouts") {
      const payouts = await pool.query(`
        SELECT
          cp.id,
          cp.amount,
          cp.status,
          cp.created_at
        FROM creator_payouts cp
        JOIN creator_accounts ca
          ON ca.id=cp.creator_id
        WHERE ca.user_id=$1
        ORDER BY cp.created_at DESC
        LIMIT 100
      `,[user.id]);

      const rows =
        payouts.rows.map(p => `
          <tr>
            <td>${p.id}</td>
            <td>
              ${Number(p.amount || 0)
                .toLocaleString("fa-IR")}
            </td>
            <td>
              ${escapeHtml(p.status || "")}
            </td>
            <td>
              ${escapeHtml(
                new Date(p.created_at)
                  .toLocaleString("fa-IR")
              )}
            </td>
          </tr>
        `).join("");

      sendPage(
        res,
        "برداشت‌ها",
        `
        <div class="card">
          <h2>🏦 برداشت‌های من</h2>

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

        <div class="card">
          <h3>تاریخچه برداشت‌ها</h3>

          <div style="overflow:auto">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                </tr>
              </thead>

              <tbody>
                ${rows || `
                  <tr>
                    <td colspan="4">
                      هنوز درخواست برداشتی ثبت نشده است.
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
      `,[user.id]);

      if (!creator.rows.length) {
        redirect(res,"/creator");
        return;
      }

      const balance = await pool.query(`
        SELECT COALESCE(
          SUM(
            CASE
              WHEN type='earning'
              THEN amount
              WHEN type='payout'
              THEN -amount
              ELSE 0
            END
          ),0
        ) AS balance
        FROM creator_transactions
        WHERE creator_id=$1
      `,[creator.rows[0].id]);

      const available =
        Number(balance.rows[0].balance || 0);

      if (amount > available) {
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
      `,[
        creator.rows[0].id,
        amount
      ]);

      redirect(res,"/creator-payouts");
      return;
    }

    // ------------------------------------------------------------
    // SUBSCRIPTION MANAGEMENT
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/creator-subscriptions"
    ) {
      const subscriptions = await pool.query(`
        SELECT
          s.id,
          s.status,
          s.started_at,
          s.expires_at,
          sp.name AS plan_name,
          sp.price
        FROM subscriptions s
        JOIN subscription_plans sp
          ON sp.id=s.plan_id
        WHERE s.subscriber_id=$1
        ORDER BY s.started_at DESC
        LIMIT 100
      `,[user.id]);

      const rows =
        subscriptions.rows.map(s => `
          <tr>
            <td>${s.id}</td>
            <td>${escapeHtml(s.plan_name || "")}</td>
            <td>
              ${Number(s.price || 0)
                .toLocaleString("fa-IR")}
            </td>
            <td>${escapeHtml(s.status || "")}</td>
            <td>
              ${escapeHtml(
                new Date(s.started_at)
                  .toLocaleString("fa-IR")
              )}
            </td>
            <td>
              ${s.expires_at
                ? escapeHtml(
                    new Date(s.expires_at)
                      .toLocaleString("fa-IR")
                  )
                : "-"}
            </td>
          </tr>
        `).join("");

      sendPage(
        res,
        "اشتراک‌های من",
        `
        <div class="card">
          <h2>💎 اشتراک‌های من</h2>

          <div style="overflow:auto">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>پلن</th>
                  <th>قیمت</th>
                  <th>وضعیت</th>
                  <th>شروع</th>
                  <th>پایان</th>
                </tr>
              </thead>

              <tbody>
                ${rows || `
                  <tr>
                    <td colspan="6">
                      اشتراکی ثبت نشده است.
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
    // REWARDS
    // ------------------------------------------------------------

    if (req.method === "GET" && path === "/rewards") {
      const rewards = await pool.query(`
        SELECT
          COALESCE(SUM(points),0)::int AS points
        FROM user_rewards
        WHERE user_id=$1
      `,[user.id]);

      const history = await pool.query(`
        SELECT
          points,
          reason,
          created_at
        FROM user_rewards
        WHERE user_id=$1
        ORDER BY created_at DESC
        LIMIT 100
      `,[user.id]);

      const rows =
        history.rows.map(r => `
          <tr>
            <td>${r.points}</td>
            <td>${escapeHtml(r.reason || "")}</td>
            <td>
              ${escapeHtml(
                new Date(r.created_at)
                  .toLocaleString("fa-IR")
              )}
            </td>
          </tr>
        `).join("");

      sendPage(
        res,
        "پاداش‌ها",
        `
        <div class="card">
          <h2>🎁 پاداش‌های من</h2>

          <h3>
            امتیاز:
            ${Number(rewards.rows[0].points || 0)
              .toLocaleString("fa-IR")}
          </h3>
        </div>

        <div class="card">
          <h3>تاریخچه امتیازها</h3>

          <table>
            <thead>
              <tr>
                <th>امتیاز</th>
                <th>دلیل</th>
                <th>تاریخ</th>
              </tr>
            </thead>

            <tbody>
              ${rows || `
                <tr>
                  <td colspan="3">
                    هنوز امتیازی ثبت نشده است.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
        `
      );
      return;
    }      const d = await readBody(req);

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
            </p>

            <p>
              ارز:
              ${escapeHtml(o.currency || "")}
            </p>

            <p>
              وضعیت:
              ${escapeHtml(o.status || "")}
            </p>

            <p>
              ${escapeHtml(o.description || "")}
            </p>

            <small>
              ${escapeHtml(
                new Date(o.created_at)
                  .toLocaleString("fa-IR")
              )}
            </small>
          </div>
        `).join("");

      sendPage(
        res,
        "پرداخت‌ها",
        `
        <div class="card">
          <h2>💳 پرداخت‌های من</h2>
        </div>

        ${body || `
          <div class="card">
            پرداختی ثبت نشده است.
          </div>
        `}
        `
      );
      return;
    }              ${escapeHtml(o.currency || "")}
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
    }

/* EXTRA FEATURE SECTION 8 */
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
          $1,      const order = await pool.query(`
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
          id,          user_id,
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

/* EXTRA FEATURE SECTION 10 */
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
        service:"MySocial",        database,
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

/* EXTRA FEATURE SECTION 11 */
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

/* EXTRA FEATURE SECTION 12 */
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
    }      res.end(JSON.stringify({
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

      if (post.rows[0].user_id !== user.id) {    // ------------------------------------------------------------
    // API BLOCK USER
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/block"
    ) {
      const d = await readBody(req);

      const targetId =
        Number(d.get("user_id"));

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
          error:"invalid_user_id"
        }));

        return;
      }

      const target = await pool.query(`
        SELECT id
        FROM users
        WHERE id=$1
        LIMIT 1
      `,[targetId]);

      if (!target.rows.length) {
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

      await pool.query(`
        INSERT INTO blocked_users(
          blocker_id,
          blocked_id
        )
        VALUES($1,$2)
        ON CONFLICT(blocker_id,blocked_id)
        DO NOTHING
      `,[user.id,targetId]);

      await pool.query(`
        DELETE FROM follows
        WHERE
          (follower_id=$1 AND following_id=$2)
          OR
          (follower_id=$2 AND following_id=$1)
      `,[user.id,targetId]);

      await pool.query(`
        DELETE FROM follow_requests
        WHERE
          (requester_id=$1 AND target_id=$2)
          OR
          (requester_id=$2 AND target_id=$1)
      `,[user.id,targetId]);

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
    // API UNBLOCK USER
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/unblock"
    ) {
      const d = await readBody(req);

      const targetId =
        Number(d.get("user_id"));

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
          error:"invalid_user_id"
        }));

        return;
      }

      await pool.query(`
        DELETE FROM blocked_users
        WHERE
          blocker_id=$1
          AND blocked_id=$2
      `,[user.id,targetId]);

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
    // BLOCKED USERS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/blocked-users"
    ) {
      const result = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.username,
          u.avatar_url,
          b.created_at
        FROM blocked_users b
        JOIN users u
          ON u.id=b.blocked_id
        WHERE b.blocker_id=$1
        ORDER BY b.created_at DESC
        LIMIT 500
      `,[user.id]);

      const items = result.rows.map(u => `
        <div class="card">
          <div style="display:flex;align-items:center;gap:12px">

            ${
              u.avatar_url
                ? `<img
                    src="${safeUrl(u.avatar_url)}"
                    style="width:52px;height:52px;border-radius:50%;object-fit:cover"
                  >`
                : `<div class="avatar">👤</div>`
            }

            <div style="flex:1">
              <strong>
                ${escapeHtml(u.name || "کاربر")}
              </strong>

              ${
                u.username
                  ? `<div class="muted">
                      @${escapeHtml(u.username)}
                    </div>`
                  : ""
              }

              <small class="muted">
                ${new Date(u.created_at).toLocaleString("fa-IR")}
              </small>
            </div>

            <button
              onclick="unblockUser(${u.id})"
            >
              رفع مسدودی
            </button>

          </div>
        </div>
      `).join("");

      sendPage(
        res,
        "کاربران مسدودشده",
        `
        <div class="container">

          <h1>🚫 کاربران مسدودشده</h1>

          ${
            items ||
            `<div class="card">
              کاربری مسدود نشده است.
            </div>`
          }

        </div>

        <script>
          async function unblockUser(id){
            const body =
              new URLSearchParams();

            body.set("user_id",id);

            const r =
              await fetch("/api/unblock",{
                method:"POST",
                headers:{
                  "Content-Type":
                    "application/x-www-form-urlencoded"
                },
                body
              });

            const data =
              await r.json();

            if(data.ok){
              location.reload();
            }
          }
        </script>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // BLOCK STATUS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/block-status"
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

      const result = await pool.query(`
        SELECT
          EXISTS(
            SELECT 1
            FROM blocked_users
            WHERE
              blocker_id=$1
              AND blocked_id=$2
          ) AS blocked,

          EXISTS(
            SELECT 1
            FROM blocked_users
            WHERE
              blocker_id=$2
              AND blocked_id=$1
          ) AS blocked_by

      `,[user.id,targetId]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        blocked:Boolean(result.rows[0].blocked),
        blocked_by:Boolean(result.rows[0].blocked_by)
      }));

      return;
    }

    // ------------------------------------------------------------
    // USER SETTINGS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/settings"
    ) {
      const result = await pool.query(`
        SELECT
          id,
          name,
          username,
          email,
          bio,
          avatar_url
        FROM users
        WHERE id=$1
        LIMIT 1
      `,[user.id]);

      const account =
        result.rows[0];

      sendPage(
        res,
        "تنظیمات",
        `
        <div class="container">

          <h1>⚙️ تنظیمات</h1>

          <div class="card">

            <h2>حساب کاربری</h2>

            <p>
              نام:
              <strong>
                ${escapeHtml(account?.name || "")}
              </strong>
            </p>

            <p>
              نام کاربری:
              ${
                account?.username
                  ? "@" + escapeHtml(account.username)
                  : "تنظیم نشده"
              }
            </p>

            <p>
              ایمیل:
              ${escapeHtml(account?.email || "")}
            </p>

            <div style="display:flex;gap:10px;flex-wrap:wrap">

              <a href="/profile-edit">
                <button>
                  ✏️ ویرایش پروفایل
                </button>
              </a>

              <a href="/blocked-users">
                <button>
                  🚫 کاربران مسدودشده
                </button>
              </a>

              <a href="/notifications">
                <button>
                  🔔 اعلان‌ها
                </button>
              </a>

            </div>

          </div>

          <div class="card">

            <h2>حساب</h2>

            <form
              method="POST"
              action="/api/account/deactivate"
              onsubmit="
                return confirm(
                  'آیا مطمئن هستید که می‌خواهید حساب را غیرفعال کنید؟'
                );
              "
            >

              <input
                type="hidden"
                name="confirm"
                value="DEACTIVATE"
              >

              <button
                type="submit"
                style="background:#b91c1c;color:white"
              >
                غیرفعال کردن حساب
              </button>

            </form>

          </div>

        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // CHANGE PROFILE
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/profile"
    ) {
      const d = await readBody(req);

      const name =
        (d.get("name") || "").trim();

      const username =
        (d.get("username") || "")
          .trim()
          .toLowerCase();

      const bio =
        (d.get("bio") || "").trim();

      if (
        !name ||
        name.length > 100 ||
        username.length > 50 ||
        bio.length > 1000
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_profile"
        }));

        return;
      }

      if (
        username &&
        !/^[a-z0-9_.]+$/.test(username)
      ) {
        res.writeHead(400,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"invalid_username"
        }));

        return;
      }

      if (username) {
        const exists = await pool.query(`
          SELECT id
          FROM users
          WHERE
            username=$1
            AND id<>$2
          LIMIT 1
        `,[username,user.id]);

        if (exists.rows.length) {
          res.writeHead(409,{
            "Content-Type":
              "application/json; charset=utf-8"
          });

          res.end(JSON.stringify({
            ok:false,
            error:"username_taken"
          }));

          return;
        }
      }

      await pool.query(`
        UPDATE users
        SET
          name=$1,
          username=$2,
          bio=$3
        WHERE id=$4
      `,[
        name,
        username || null,
        bio,
        user.id
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
    // SEARCH USERS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/search-users"
    ) {
      const q =
        (url.searchParams.get("q") || "")
          .trim()
          .slice(0,100);

      if (!q) {
        res.writeHead(200,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:true,
          users:[]
        }));

        return;
      }

      const result = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.username,
          u.bio,
          u.avatar_url
        FROM users u
        WHERE
          (
            u.name ILIKE $1
            OR
            COALESCE(u.username,'') ILIKE $1
          )
          AND u.id<>$2
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$2 AND b.blocked_id=u.id)
              OR
              (b.blocker_id=u.id AND b.blocked_id=$2)
          )
        ORDER BY
          CASE
            WHEN u.username ILIKE $1
            THEN 0
            ELSE 1
          END,
          u.name ASC
        LIMIT 50
      `,[
        `%${q}%`,
        user.id
      ]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        users:result.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // SEARCH PAGE
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/search"
    ) {
      const q =
        (url.searchParams.get("q") || "")
          .trim()
          .slice(0,100);

      let users = [];

      if (q) {
        const result = await pool.query(`
          SELECT
            u.id,
            u.name,
            u.username,
            u.bio,
            u.avatar_url
          FROM users u
          WHERE
            (
              u.name ILIKE $1
              OR
              COALESCE(u.username,'') ILIKE $1
            )
            AND NOT EXISTS(
              SELECT 1
              FROM blocked_users b
              WHERE
                (b.blocker_id=$2 AND b.blocked_id=u.id)
                OR
                (b.blocker_id=u.id AND b.blocked_id=$2)
            )
          ORDER BY u.name ASC
          LIMIT 50
        `,[
          `%${q}%`,
          user.id
        ]);

        users = result.rows;
      }

      const items = users.map(u => `
        <div class="card">

          <div style="
            display:flex;
            align-items:center;
            gap:12px;
          ">

            ${
              u.avatar_url
                ? `<img
                    src="${safeUrl(u.avatar_url)}"
                    style="
                      width:55px;
                      height:55px;
                      border-radius:50%;
                      object-fit:cover;
                    "
                  >`
                : `<div class="avatar">👤</div>`
            }

            <div style="flex:1">

              <a href="/profile?id=${u.id}">
                <strong>
                  ${escapeHtml(u.name || "کاربر")}
                </strong>
              </a>

              ${
                u.username
                  ? `<div class="muted">
                      @${escapeHtml(u.username)}
                    </div>`
                  : ""
              }

              ${
                u.bio
                  ? `<div>
                      ${escapeHtml(u.bio)}
                    </div>`
                  : ""
              }

            </div>

          </div>

        </div>
      `).join("");

      sendPage(
        res,
        "جستجو",
        `
        <div class="container">

          <h1>🔎 جستجوی کاربران</h1>

          <form
            method="GET"
            action="/search"
            style="display:flex;gap:8px"
          >

            <input
              type="text"
              name="q"
              value="${escapeHtml(q)}"
              placeholder="نام یا نام کاربری..."
              maxlength="100"
              style="flex:1"
            >

            <button type="submit">
              جستجو
            </button>

          </form>

          <div style="margin-top:15px">

            ${
              q
                ? (
                    items ||
                    `<div class="card">
                      نتیجه‌ای پیدا نشد.
                    </div>`
                  )
                : `<div class="card">
                    نام یا نام کاربری را وارد کنید.
                  </div>`
            }

          </div>

        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // USER PROFILE API
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/user"
    ) {
      const targetId =
        Number(url.searchParams.get("id"));

      if (
        !Number.isInteger(targetId) ||
        targetId <= 0
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
          u.id,
          u.name,
          u.username,
          u.bio,
          u.avatar_url,
          u.created_at,

          (
            SELECT COUNT(*)
            FROM follows f
            WHERE f.following_id=u.id
          ) AS followers,

          (
            SELECT COUNT(*)
            FROM follows f
            WHERE f.follower_id=u.id
          ) AS following,

          (
            SELECT COUNT(*)
            FROM posts p
            WHERE p.user_id=u.id
          ) AS posts

        FROM users u

        WHERE
          u.id=$1
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$2 AND b.blocked_id=u.id)
              OR
              (b.blocker_id=u.id AND b.blocked_id=$2)
          )

        LIMIT 1
      `,[targetId,user.id]);

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
    // API FOLLOW
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/follow"
    ) {
      const d = await readBody(req);

      const targetId =
        Number(d.get("user_id"));

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
        res.writeHead(403,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:false,
          error:"blocked"
        }));

        return;
      }

      await pool.query(`
        INSERT INTO follows(
          follower_id,
          following_id
        )
        VALUES($1,$2)
        ON CONFLICT(follower_id,following_id)
        DO NOTHING
      `,[user.id,targetId]);

      await pool.query(`
        DELETE FROM follow_requests
        WHERE
          requester_id=$1
          AND target_id=$2
      `,[user.id,targetId]);

      await notify(
        targetId,
        user.id,
        "follow",
        null,
        `${user.name} شما را دنبال کرد.`
      );

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok:true,
        following:true
      }));

      return;
    }

    // ------------------------------------------------------------
    // API UNFOLLOW
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/unfollow"
    ) {
      const d = await readBody(req);

      const targetId =
        Number(d.get("user_id"));

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

      await pool.query(`
        DELETE FROM follows
        WHERE
          follower_id=$1
          AND following_id=$2
      `,[user.id,targetId]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok:true,
        following:false
      }));

      return;
    }

    // ------------------------------------------------------------
    // FOLLOWERS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/followers"
    ) {
      const targetId =
        Number(url.searchParams.get("id")) || user.id;

      const result = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.username,
          u.avatar_url,
          f.created_at
        FROM follows f
        JOIN users u
          ON u.id=f.follower_id
        WHERE
          f.following_id=$1
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$2 AND b.blocked_id=u.id)
              OR
              (b.blocker_id=u.id AND b.blocked_id=$2)
          )
        ORDER BY f.created_at DESC
        LIMIT 500
      `,[targetId,user.id]);

      const items = result.rows.map(u => `
        <div class="card">
          <div style="
            display:flex;
            align-items:center;
            gap:12px;
          ">

            ${
              u.avatar_url
                ? `<img
                    src="${safeUrl(u.avatar_url)}"
                    style="
                      width:50px;
                      height:50px;
                      border-radius:50%;
                      object-fit:cover;
                    "
                  >`
                : `<div class="avatar">👤</div>`
            }

            <div>
              <a href="/profile?id=${u.id}">
                <strong>
                  ${escapeHtml(u.name || "کاربر")}
                </strong>
              </a>

              ${
                u.username
                  ? `<div class="muted">
                      @${escapeHtml(u.username)}
                    </div>`
                  : ""
              }
            </div>

          </div>
        </div>
      `).join("");

      sendPage(
        res,
        "دنبال‌کنندگان",
        `
        <div class="container">

          <h1>👥 دنبال‌کنندگان</h1>

          ${
            items ||
            `<div class="card">
              دنبال‌کننده‌ای وجود ندارد.
            </div>`
          }

        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // FOLLOWING
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/following"
    ) {
      const targetId =
        Number(url.searchParams.get("id")) || user.id;

      const result = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.username,
          u.avatar_url,
          f.created_at
        FROM follows f
        JOIN users u
          ON u.id=f.following_id
        WHERE
          f.follower_id=$1
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$2 AND b.blocked_id=u.id)
              OR
              (b.blocker_id=u.id AND b.blocked_id=$2)
          )
        ORDER BY f.created_at DESC
        LIMIT 500
      `,[targetId,user.id]);

      const items = result.rows.map(u => `
        <div class="card">
          <div style="
            display:flex;
            align-items:center;
            gap:12px;
          ">

            ${
              u.avatar_url
                ? `<img
                    src="${safeUrl(u.avatar_url)}"
                    style="
                      width:50px;
                      height:50px;
                      border-radius:50%;
                      object-fit:cover;
                    "
                  >`
                : `<div class="avatar">👤</div>`
            }

            <div>
              <a href="/profile?id=${u.id}">
                <strong>
                  ${escapeHtml(u.name || "کاربر")}
                </strong>
              </a>

              ${
                u.username
                  ? `<div class="muted">
                      @${escapeHtml(u.username)}
                    </div>`
                  : ""
              }
            </div>

          </div>
        </div>
      `).join("");

      sendPage(
        res,
        "دنبال‌شونده‌ها",
        `
        <div class="container">

          <h1>👤 دنبال‌شونده‌ها</h1>

          ${
            items ||
            `<div class="card">
              کاربری دنبال نشده است.
            </div>`
          }

        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // PROFILE PAGE
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/profile"
    ) {
      const targetId =
        Number(url.searchParams.get("id")) || user.id;

      const result = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.username,
          u.bio,
          u.avatar_url,
          u.created_at,

          (
            SELECT COUNT(*)
            FROM posts p
            WHERE p.user_id=u.id
          ) AS posts_count,

          (
            SELECT COUNT(*)
            FROM follows f
            WHERE f.following_id=u.id
          ) AS followers_count,

          (
            SELECT COUNT(*)
            FROM follows f
            WHERE f.follower_id=u.id
          ) AS following_count,

          EXISTS(
            SELECT 1
            FROM follows f
            WHERE
              f.follower_id=$2
              AND f.following_id=u.id
          ) AS is_following,

          EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              b.blocker_id=$2
              AND b.blocked_id=u.id
          ) AS is_blocked

        FROM users u

        WHERE
          u.id=$1

        LIMIT 1
      `,[targetId,user.id]);

      if (!result.rows.length) {
        sendPage(
          res,
          "کاربر پیدا نشد",
          `
          <div class="container">
            <div class="card empty">
              کاربر پیدا نشد.
            </div>
          </div>
          `
        );

        return;
      }

      const profile =
        result.rows[0];

      if (
        profile.is_blocked ||
        (
          !profile.id &&
          profile.id !== user.id
        )
      ) {
        sendPage(
          res,
          "پروفایل",
          `
          <div class="container">
            <div class="card empty">
              این پروفایل در دسترس نیست.
            </div>
          </div>
          `
        );

        return;
      }

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
          ) AS liked

        FROM posts p

        WHERE
          p.user_id=$1
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$2 AND b.blocked_id=p.user_id)
              OR
              (b.blocker_id=p.user_id AND b.blocked_id=$2)
          )

        ORDER BY p.created_at DESC
        LIMIT 100
      `,[targetId,user.id]);

      const postItems =
        posts.rows.map(p =>
          renderPost(p,user)
        ).join("");

      const isMe =
        targetId === user.id;

      sendPage(
        res,
        profile.name || "پروفایل",
        `
        <div class="container">

          <div class="card">

            <div style="
              display:flex;
              gap:18px;
              align-items:center;
              flex-wrap:wrap;
            ">

              ${
                profile.avatar_url
                  ? `<img
                      src="${safeUrl(profile.avatar_url)}"
                      style="
                        width:100px;
                        height:100px;
                        border-radius:50%;
                        object-fit:cover;
                      "
                    >`
                  : `<div class="avatar"
                      style="
                        width:100px;
                        height:100px;
                        font-size:45px;
                      "
                    >👤</div>`
              }

              <div style="flex:1">

                <h1 style="margin:0">
                  ${escapeHtml(profile.name || "کاربر")}
                </h1>

                ${
                  profile.username
                    ? `<div class="muted">
                        @${escapeHtml(profile.username)}
                      </div>`
                    : ""
                }

                ${
                  profile.bio
                    ? `<p>
                        ${escapeHtml(profile.bio)}
                      </p>`
                    : ""
                }

                <div style="
                  display:flex;
                  gap:18px;
                  flex-wrap:wrap;
                  margin-top:10px;
                ">

                  <span>
                    <strong>
                      ${profile.posts_count}
                    </strong>
                    پست
                  </span>

                  <a href="/followers?id=${profile.id}">
                    <strong>
                      ${profile.followers_count}
                    </strong>
                    دنبال‌کننده
                  </a>

                  <a href="/following?id=${profile.id}">
                    <strong>
                      ${profile.following_count}
                    </strong>
                    دنبال‌شونده
                  </a>

                </div>

              </div>

            </div>

            <div style="
              display:flex;
              gap:8px;
              flex-wrap:wrap;
              margin-top:18px;
            ">

              ${
                isMe
                  ? `
                    <a href="/profile-edit">
                      <button>
                        ✏️ ویرایش پروفایل
                      </button>
                    </a>

                    <a href="/settings">
                      <button>
                        ⚙️ تنظیمات
                      </button>
                    </a>
                  `
                  : `
                    <button
                      id="followBtn"
                      onclick="toggleFollow(${profile.id})"
                    >
                      ${
                        profile.is_following
                          ? "لغو دنبال‌کردن"
                          : "دنبال کردن"
                      }
                    </button>

                    <button
                      onclick="toggleBlock(${profile.id})"
                    >
                      🚫 ${
                        profile.is_blocked
                          ? "رفع مسدودی"
                          : "مسدود کردن"
                      }
                    </button>

                    <button
                      onclick="reportUser(${profile.id})"
                    >
                      🚩 گزارش
                    </button>
                  `
              }

            </div>

          </div>

          <h2>📷 پست‌ها</h2>

          ${
            postItems ||
            `<div class="card empty">
              هنوز پستی منتشر نشده است.
            </div>`
          }

        </div>

        <script>

          async function toggleFollow(id){

            const btn =
              document.getElementById("followBtn");

            if(!btn) return;

            btn.disabled=true;

            const following =
              btn.textContent.includes("لغو");

            const body =
              new URLSearchParams();

            body.set("user_id",id);

            const r =
              await fetch(
                following
                  ? "/api/unfollow"
                  : "/api/follow",
                {
                  method:"POST",
                  headers:{
                    "Content-Type":
                      "application/x-www-form-urlencoded"
                  },
                  body
                }
              );

            const data =
              await r.json();

            btn.disabled=false;

            if(data.ok){
              btn.textContent =
                data.following
                  ? "لغو دنبال‌کردن"
                  : "دنبال کردن";
            }
          }

          async function toggleBlock(id){

            const blocked =
              confirm(
                "برای مسدود کردن کاربر تأیید کنید."
              );

            if(!blocked) return;

            const body =
              new URLSearchParams();

            body.set("user_id",id);

            const r =
              await fetch("/api/block",{
                method:"POST",
                headers:{
                  "Content-Type":
                    "application/x-www-form-urlencoded"
                },
                body
              });

            const data =
              await r.json();

            if(data.ok){
              location.href="/";
            }
          }

          async function reportUser(id){

            const reason =
              prompt("دلیل گزارش را وارد کنید:");

            if(!reason) return;

            const body =
              new URLSearchParams();

            body.set("target_type","user");
            body.set("target_id",id);
            body.set("reason",reason);

            const r =
              await fetch("/api/report",{
                method:"POST",
                headers:{
                  "Content-Type":
                    "application/x-www-form-urlencoded"
                },
                body
              });

            const data =
              await r.json();

            if(data.ok){
              alert("گزارش ثبت شد.");
            }
          }

        </script>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // PROFILE EDIT PAGE
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/profile-edit"
    ) {
      const result = await pool.query(`
        SELECT
          name,
          username,
          bio,
          avatar_url
        FROM users
        WHERE id=$1
        LIMIT 1
      `,[user.id]);

      const profile =
        result.rows[0] || {};

      sendPage(
        res,
        "ویرایش پروفایل",
        `
        <div class="container">

          <h1>✏️ ویرایش پروفایل</h1>

          <div class="card">

            <form
              method="POST"
              action="/api/profile"
            >

              <label>
                نام
              </label>

              <input
                name="name"
                value="${escapeHtml(profile.name || "")}"
                maxlength="100"
                required
              >

              <label>
                نام کاربری
              </label>

              <input
                name="username"
                value="${escapeHtml(profile.username || "")}"
                maxlength="50"
                placeholder="username"
              >

              <small class="muted">
                فقط حروف انگلیسی، عدد، نقطه و زیرخط
              </small>

              <label>
                بیو
              </label>

              <textarea
                name="bio"
                maxlength="1000"
                rows="5"
              >${escapeHtml(profile.bio || "")}</textarea>

              <button type="submit">
                💾 ذخیره تغییرات
              </button>

            </form>

            ${
              profile.avatar_url
                ? `
                  <div style="margin-top:20px">

                    <img
                      src="${safeUrl(profile.avatar_url)}"
                      style="
                        width:100px;
                        height:100px;
                        border-radius:50%;
                        object-fit:cover;
                      "
                    >

                    <div style="margin-top:10px">

                      <a href="/remove-avatar">
                        <button>
                          🗑 حذف تصویر پروفایل
                        </button>
                      </a>

                    </div>

                  </div>
                `
                : ""
            }

            <div style="margin-top:15px">

              <a href="/clear-bio">
                <button>
                  🧹 پاک کردن بیو
                </button>
              </a>

            </div>

          </div>

        </div>
        `
      );

      return;
    }

    // ------------------------------------------------------------
    // API PROFILE STATS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/profile-stats"
    ) {
      const result = await pool.query(`
        SELECT

          (
            SELECT COUNT(*)
            FROM posts
            WHERE user_id=$1
          ) AS posts,

          (
            SELECT COUNT(*)
            FROM follows
            WHERE following_id=$1
          ) AS followers,

          (
            SELECT COUNT(*)
            FROM follows
            WHERE follower_id=$1
          ) AS following,

          (
            SELECT COUNT(*)
            FROM likes l
            JOIN posts p
              ON p.id=l.post_id
            WHERE p.user_id=$1
          ) AS received_likes,

          (
            SELECT COUNT(*)
            FROM comments c
            JOIN posts p
              ON p.id=c.post_id
            WHERE p.user_id=$1
          ) AS received_comments

      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        stats:result.rows[0]
      }));

      return;
    }

    // ------------------------------------------------------------
    // API MY POSTS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/my-posts"
    ) {
      const result = await pool.query(`
        SELECT
          p.id,
          p.content,
          p.image_url,
          p.created_at,

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

          (
            SELECT COUNT(*)
            FROM shares s
            WHERE s.post_id=p.id
          ) AS shares

        FROM posts p
        WHERE p.user_id=$1
        ORDER BY p.created_at DESC
        LIMIT 200
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        posts:result.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // API SAVED POSTS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/saved-posts"
    ) {
      const result = await pool.query(`
        SELECT
          p.id,
          p.content,
          p.image_url,
          p.created_at,
          u.id AS user_id,
          u.name,
          u.username,
          u.avatar_url

        FROM saved_posts sp

        JOIN posts p
          ON p.id=sp.post_id

        JOIN users u
          ON u.id=p.user_id

        WHERE
          sp.user_id=$1
          AND NOT EXISTS(
            SELECT 1
            FROM blocked_users b
            WHERE
              (b.blocker_id=$1 AND b.blocked_id=p.user_id)
              OR
              (b.blocker_id=p.user_id AND b.blocked_id=$1)
          )

        ORDER BY sp.created_at DESC
        LIMIT 200
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        posts:result.rows
      }));

      return;
    }

    // ------------------------------------------------------------
    // API BOOKMARK
    // ------------------------------------------------------------

    if (
      req.method === "POST" &&
      path === "/api/bookmark"
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

      const existing =
        await pool.query(`
          SELECT 1
          FROM saved_posts
          WHERE
            user_id=$1
            AND post_id=$2
          LIMIT 1
        `,[user.id,postId]);

      if (existing.rows.length) {

        await pool.query(`
          DELETE FROM saved_posts
          WHERE
            user_id=$1
            AND post_id=$2
        `,[user.id,postId]);

        res.writeHead(200,{
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
          ok:true,
          saved:false
        }));

        return;
      }

      await pool.query(`
        INSERT INTO saved_posts(
          user_id,
          post_id
        )
        VALUES($1,$2)
        ON CONFLICT(user_id,post_id)
        DO NOTHING
      `,[user.id,postId]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok:true,
        saved:true
      }));

      return;
    }

    // ------------------------------------------------------------
    // API SAVED STATUS
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/bookmark-status"
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

      const result =
        await pool.query(`
          SELECT 1
          FROM saved_posts
          WHERE
            user_id=$1
            AND post_id=$2
          LIMIT 1
        `,[user.id,postId]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok:true,
        saved:Boolean(result.rows.length)
      }));

      return;
    }

    // ------------------------------------------------------------
    // API NOTIFICATION COUNT
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/notification-count"
    ) {
      const result = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM notifications
        WHERE
          user_id=$1
          AND is_read=FALSE
      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":"no-store"
      });

      res.end(JSON.stringify({
        ok:true,
        count:result.rows[0]?.count || 0
      }));

      return;
    }

    // ------------------------------------------------------------
    // API DASHBOARD SUMMARY
    // ------------------------------------------------------------

    if (
      req.method === "GET" &&
      path === "/api/dashboard"
    ) {
      const result = await pool.query(`
        SELECT

          (
            SELECT COUNT(*)
            FROM posts
            WHERE user_id=$1
          )::int AS posts,

          (
            SELECT COUNT(*)
            FROM followers
            WHERE user_id=$1
          )::int AS followers,

          (
            SELECT COUNT(*)
            FROM follows
            WHERE follower_id=$1
          )::int AS following

      `,[user.id]);

      res.writeHead(200,{
        "Content-Type":
          "application/json; charset=utf-8"
      });

      res.end(JSON.stringify({
        ok:true,
        dashboard:result.rows[0]
      }));

      return;
    }        await notify(
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

/* EXTRA FEATURE SECTION 13 */
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
      path === "/api/block"                      m.username
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

/* EXTRA FEATURE SECTION 15 */
if (req.method === "POST" && path === "/group-edit") {

  const d = await readBody(req);

  const groupId = Number(d.get("group_id"));
  const name = (d.get("name") || "").trim();
  const description = (d.get("description") || "").trim();

  if (
    !Number.isInteger(groupId) ||
    groupId <= 0 ||
    !name                      m.username
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

/* EXTRA FEATURE SECTION 15 */
if (req.method === "POST" && path === "/group-edit") {

  const d = await readBody(req);

  const groupId = Number(d.get("group_id"));
  const name = (d.get("name") || "").trim();
  const description = (d.get("description") || "").trim();

  if (
    !Number.isInteger(groupId) ||
    groupId <= 0 ||
    !nameawait pool.query(`
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

/* EXTRA FEATURE SECTION 16 */
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
  });await pool.query(`
  CREATE TABLE IF NOT EXISTS group_messages (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_group_messages_group
  ON group_messages(group_id,created_at)
`);


if (
  req.method === "GET" &&
  path === "/api/group/messages"
) {

  const groupId = Number(
    url.searchParams.get("group_id")
  );

  if (
    !Number.isInteger(groupId) ||
    groupId <= 0
  ) {
    sendJson(res,{
      ok:false,
      error:"invalid_group"
    },400);
    return;
  }

  const member = await pool.query(`
    SELECT 1
    FROM group_members
    WHERE group_id=$1
      AND user_id=$2
    LIMIT 1
  `,[
    groupId,
    user.id
  ]);

  if (!member.rows.length) {
    sendJson(res,{
      ok:false,
      error:"not_member"
    },403);
    return;
  }

  const messages = await pool.query(`
    SELECT
      gm.id,
      gm.group_id,
      gm.user_id,
      u.name,
      u.username,
      gm.content,
      gm.created_at
    FROM group_messages gm
    JOIN users u
      ON u.id=gm.user_id
    WHERE gm.group_id=$1
    ORDER BY gm.created_at ASC
    LIMIT 300
  `,[groupId]);

  sendJson(res,{
    ok:true,
    messages:messages.rows
  });

  return;
}


if (
  req.method === "POST" &&
  path === "/api/group/messages"
) {

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
    sendJson(res,{
      ok:false,
      error:"invalid_data"
    },400);
    return;
  }

  const member = await pool.query(`
    SELECT 1
    FROM group_members
    WHERE group_id=$1
      AND user_id=$2
    LIMIT 1
  `,[
    groupId,
    user.id
  ]);

  if (!member.rows.length) {
    sendJson(res,{
      ok:false,
      error:"not_member"
    },403);
    return;
  }

  const message = await pool.query(`
    INSERT INTO group_messages(
      group_id,
      user_id,
      content
    )
    VALUES($1,$2,$3)
    RETURNING id,group_id,user_id,content,created_at
  `,[
    groupId,
    user.id,
    content.slice(0,5000)
  ]);

  sendJson(res,{
    ok:true,
    message:message.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// GROUP LEAVE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/group-leave"
) {

  const groupId = Number(
    url.searchParams.get("id")
  );

  if (
    Number.isInteger(groupId) &&
    groupId > 0
  ) {

    await pool.query(`
      DELETE FROM group_members
      WHERE group_id=$1
        AND user_id=$2
    `,[
      groupId,
      user.id
    ]);
  }

  redirect(res,"/");
  return;
}


// ------------------------------------------------------------
// GROUP JOIN
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/group-join"
) {

  const groupId = Number(
    url.searchParams.get("id")
  );

  if (
    Number.isInteger(groupId) &&
    groupId > 0
  ) {

    const group = await pool.query(`
      SELECT id
      FROM groups
      WHERE id=$1
      LIMIT 1
    `,[groupId]);

    if (group.rows.length) {

      await pool.query(`
        INSERT INTO group_members(
          group_id,
          user_id,
          role
        )
        VALUES($1,$2,'member')
        ON CONFLICT(group_id,user_id)
        DO NOTHING
      `,[
        groupId,
        user.id
      ]);
    }
  }

  redirect(res,`/group?id=${groupId}`);
  return;
}


// ------------------------------------------------------------
// GROUP PAGE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/group"
) {

  const groupId = Number(
    url.searchParams.get("id")
  );

  if (
    !Number.isInteger(groupId) ||
    groupId <= 0
  ) {
    sendHtml(
      res,
      400,
      "گروه",
      `<div class="card empty">
        <h2>گروه نامعتبر است</h2>
      </div>`,
      user
    );
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
    LIMIT 1
  `,[groupId]);

  if (!group.rows.length) {
    sendHtml(
      res,
      404,
      "گروه",
      `<div class="card empty">
        <h2>گروه پیدا نشد</h2>
      </div>`,
      user
    );
    return;
  }

  const members = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      gm.role
    FROM group_members gm
    JOIN users u
      ON u.id=gm.user_id
    WHERE gm.group_id=$1
    ORDER BY gm.created_at ASC
  `,[groupId]);

  const isMember = members.rows.some(
    m => Number(m.id) === Number(user.id)
  );

  const messages = isMember
    ? await pool.query(`
        SELECT
          gm.id,
          gm.user_id,
          u.name,
          u.username,
          gm.content,
          gm.created_at
        FROM group_messages gm
        JOIN users u
          ON u.id=gm.user_id
        WHERE gm.group_id=$1
        ORDER BY gm.created_at ASC
        LIMIT 100
      `,[groupId])
    : {rows:[]};

  const html = `
    <div class="card">
      <h2>👥 ${escapeHtml(group.rows[0].name || "گروه")}</h2>

      <p>
        ${escapeHtml(
          group.rows[0].description || ""
        )}
      </p>

      <p>
        👤 اعضا: ${members.rows.length}
      </p>

      ${
        isMember
        ? `
          <a href="/group-leave?id=${groupId}">
            <button>🚪 خروج از گروه</button>
          </a>
        `
        : `
          <a href="/group-join?id=${groupId}">
            <button>➕ عضویت در گروه</button>
          </a>
        `
      }
    </div>

    ${
      isMember
      ? `
        <div class="card">
          <h3>💬 پیام‌های گروه</h3>

          ${
            messages.rows.map(m => `
              <div class="message">
                <b>${escapeHtml(m.name || "")}</b>
                <div>${escapeHtml(m.content || "")}</div>
                <small>${escapeHtml(
                  String(m.created_at || "")
                )}</small>
              </div>
            `).join("")
          }

          <form method="POST" action="/api/group/messages">
            <input
              type="hidden"
              name="group_id"
              value="${groupId}"
            >

            <textarea
              name="content"
              placeholder="پیام خود را بنویسید..."
              maxlength="5000"
              required
            ></textarea>

            <button type="submit">
              📤 ارسال پیام
            </button>
          </form>
        </div>
      `
      : ""
    }

    <div class="card">
      <h3>👤 اعضای گروه</h3>

      ${
        members.rows.map(m => `
          <div class="user-row">
            <b>${escapeHtml(m.name || "")}</b>
            ${
              m.username
              ? `<span>@${escapeHtml(m.username)}</span>`
              : ""
            }
            <small>${escapeHtml(m.role || "member")}</small>
          </div>
        `).join("")
      }
    </div>
  `;

  sendHtml(
    res,
    200,
    group.rows[0].name || "گروه",
    html,
    user
  );

  return;
}


// ------------------------------------------------------------
// GROUP CREATE PAGE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/group-create"
) {

  const html = `
    <div class="card">
      <h2>➕ ایجاد گروه</h2>

      <form method="POST" action="/group-create">

        <label>نام گروه</label>
        <input
          type="text"
          name="name"
          maxlength="120"
          required
        >

        <label>توضیحات</label>
        <textarea
          name="description"
          maxlength="2000"
        ></textarea>

        <button type="submit">
          ایجاد گروه
        </button>

      </form>
    </div>
  `;

  sendHtml(
    res,
    200,
    "ایجاد گروه",
    html,
    user
  );

  return;
}


// ------------------------------------------------------------
// GROUP CREATE
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

  if (!name) {
    redirect(res,"/group-create");
    return;
  }

  const group = await pool.query(`
    INSERT INTO groups(
      owner_id,
      name,
      description
    )
    VALUES($1,$2,$3)
    RETURNING id
  `,[
    user.id,
    name.slice(0,120),
    description.slice(0,2000)
  ]);

  const groupId = group.rows[0].id;

  await pool.query(`
    INSERT INTO group_members(
      group_id,
      user_id,
      role
    )
    VALUES($1,$2,'owner')
    ON CONFLICT(group_id,user_id)
    DO NOTHING
  `,[
    groupId,
    user.id
  ]);

  redirect(res,`/group?id=${groupId}`);
  return;
}


// ------------------------------------------------------------
// GROUPS LIST
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/groups"
) {

  const groups = await pool.query(`
    SELECT
      g.id,
      g.name,
      g.description,
      g.created_at,
      u.name AS owner_name,
      COUNT(gm.id)::INTEGER AS member_count
    FROM groups g
    JOIN users u
      ON u.id=g.owner_id
    LEFT JOIN group_members gm
      ON gm.group_id=g.id
    GROUP BY
      g.id,
      g.name,
      g.description,
      g.created_at,
      u.name
    ORDER BY g.created_at DESC
    LIMIT 200
  `);

  const html = `
    <div class="card">
      <h2>👥 گروه‌ها</h2>

      <a href="/group-create">
        <button>➕ ایجاد گروه</button>
      </a>
    </div>

    ${
      groups.rows.map(g => `
        <div class="card">
          <h3>
            <a href="/group?id=${g.id}">
              ${escapeHtml(g.name || "")}
            </a>
          </h3>

          <p>
            ${escapeHtml(g.description || "")}
          </p>

          <small>
            👤 ${g.member_count} عضو
            · سازنده: ${escapeHtml(g.owner_name || "")}
          </small>
        </div>
      `).join("")
    }
  `;

  sendHtml(
    res,
    200,
    "گروه‌ها",
    html,
    user
  );

  return;
   }// ------------------------------------------------------------
// CHANNELS
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS channels (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    username VARCHAR(100) UNIQUE,
    description TEXT,
    avatar_url TEXT,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS channel_members (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id,user_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS channel_posts (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    media_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_channel_posts_channel
  ON channel_posts(channel_id,created_at)
`);


// ------------------------------------------------------------
// CHANNEL CREATE PAGE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/channel-create"
) {

  const html = `
    <div class="card">
      <h2>📢 ایجاد کانال</h2>

      <form method="POST" action="/channel-create">

        <label>نام کانال</label>

        <input
          type="text"
          name="name"
          maxlength="150"
          required
        >

        <label>نام کاربری کانال</label>

        <input
          type="text"
          name="username"
          maxlength="100"
          placeholder="mychannel"
        >

        <label>توضیحات</label>

        <textarea
          name="description"
          maxlength="3000"
          placeholder="توضیحات کانال..."
        ></textarea>

        <label>
          <input
            type="checkbox"
            name="is_public"
            value="1"
            checked
          >
          کانال عمومی باشد
        </label>

        <br><br>

        <button type="submit">
          📢 ایجاد کانال
        </button>

      </form>
    </div>
  `;

  sendHtml(
    res,
    200,
    "ایجاد کانال",
    html,
    user
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

  let username =
    (d.get("username") || "").trim()
      .toLowerCase()
      .replace(/^@/,"");

  const description =
    (d.get("description") || "").trim();

  const isPublic =
    String(d.get("is_public") || "") === "1";

  if (!name) {
    redirect(res,"/channel-create");
    return;
  }

  if (
    username &&
    !/^[a-z0-9_]{3,100}$/.test(username)
  ) {
    redirect(res,"/channel-create");
    return;
  }

  try {

    const channel = await pool.query(`
      INSERT INTO channels(
        owner_id,
        name,
        username,
        description,
        is_public
      )
      VALUES($1,$2,$3,$4,$5)
      RETURNING id
    `,[
      user.id,
      name.slice(0,150),
      username || null,
      description.slice(0,3000),
      isPublic
    ]);

    const channelId =
      channel.rows[0].id;

    await pool.query(`
      INSERT INTO channel_members(
        channel_id,
        user_id,
        role
      )
      VALUES($1,$2,'owner')
      ON CONFLICT(channel_id,user_id)
      DO NOTHING
    `,[
      channelId,
      user.id
    ]);

    redirect(
      res,
      `/channel?id=${channelId}`
    );

  } catch(error) {

    console.error(
      "CHANNEL CREATE ERROR:",
      error
    );

    redirect(
      res,
      "/channel-create"
    );
  }

  return;
}


// ------------------------------------------------------------
// CHANNEL JOIN / LEAVE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/channel-join"
) {

  const channelId = Number(
    url.searchParams.get("id")
  );

  if (
    Number.isInteger(channelId) &&
    channelId > 0
  ) {

    const channel = await pool.query(`
      SELECT id
      FROM channels
      WHERE id=$1
      LIMIT 1
    `,[channelId]);

    if (channel.rows.length) {

      await pool.query(`
        INSERT INTO channel_members(
          channel_id,
          user_id,
          role
        )
        VALUES($1,$2,'member')
        ON CONFLICT(channel_id,user_id)
        DO NOTHING
      `,[
        channelId,
        user.id
      ]);
    }
  }

  redirect(
    res,
    `/channel?id=${channelId}`
  );

  return;
}


if (
  req.method === "GET" &&
  path === "/channel-leave"
) {

  const channelId = Number(
    url.searchParams.get("id")
  );

  if (
    Number.isInteger(channelId) &&
    channelId > 0
  ) {

    await pool.query(`
      DELETE FROM channel_members
      WHERE channel_id=$1
        AND user_id=$2
        AND role <> 'owner'
    `,[
      channelId,
      user.id
    ]);
  }

  redirect(res,"/channels");
  return;
}


// ------------------------------------------------------------
// CHANNEL POST
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/channel-post"
) {

  const d = await readBody(req);

  const channelId = Number(
    d.get("channel_id")
  );

  const content =
    (d.get("content") || "").trim();

  const mediaUrl =
    (d.get("media_url") || "").trim();

  if (
    !Number.isInteger(channelId) ||
    channelId <= 0 ||
    (!content && !mediaUrl)
  ) {
    redirect(
      res,
      `/channel?id=${channelId}`
    );
    return;
  }

  const member = await pool.query(`
    SELECT role
    FROM channel_members
    WHERE channel_id=$1
      AND user_id=$2
    LIMIT 1
  `,[
    channelId,
    user.id
  ]);

  if (
    !member.rows.length ||
    !["owner","admin"].includes(
      member.rows[0].role
    )
  ) {
    sendJson(res,{
      ok:false,
      error:"دسترسی غیرمجاز"
    },403);

    return;
  }

  if (
    mediaUrl &&
    !validHttpUrl(mediaUrl)
  ) {
    redirect(
      res,
      `/channel?id=${channelId}`
    );
    return;
  }

  await pool.query(`
    INSERT INTO channel_posts(
      channel_id,
      user_id,
      content,
      media_url
    )
    VALUES($1,$2,$3,$4)
  `,[
    channelId,
    user.id,
    content.slice(0,10000),
    mediaUrl || null
  ]);

  redirect(
    res,
    `/channel?id=${channelId}`
  );

  return;
}


// ------------------------------------------------------------
// CHANNEL PAGE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/channel"
) {

  const channelId = Number(
    url.searchParams.get("id")
  );

  if (
    !Number.isInteger(channelId) ||
    channelId <= 0
  ) {
    sendHtml(
      res,
      400,
      "کانال",
      `<div class="card">
        <h2>کانال نامعتبر است</h2>
      </div>`,
      user
    );

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
    LIMIT 1
  `,[channelId]);

  if (!channel.rows.length) {

    sendHtml(
      res,
      404,
      "کانال",
      `<div class="card">
        <h2>کانال پیدا نشد</h2>
      </div>`,
      user
    );

    return;
  }

  const membership = await pool.query(`
    SELECT role
    FROM channel_members
    WHERE channel_id=$1
      AND user_id=$2
    LIMIT 1
  `,[
    channelId,
    user.id
  ]);

  const role =
    membership.rows[0]?.role || null;

  const posts = await pool.query(`
    SELECT
      cp.id,
      cp.content,
      cp.media_url,
      cp.created_at,
      u.name,
      u.username
    FROM channel_posts cp
    JOIN users u
      ON u.id=cp.user_id
    WHERE cp.channel_id=$1
    ORDER BY cp.created_at DESC
    LIMIT 100
  `,[channelId]);

  const canPost =
    role === "owner" ||
    role === "admin";

  const html = `
    <div class="card">

      <h2>
        📢 ${escapeHtml(
          channel.rows[0].name || ""
        )}
      </h2>

      ${
        channel.rows[0].username
        ? `
          <p>
            @${escapeHtml(
              channel.rows[0].username
            )}
          </p>
        `
        : ""
      }

      <p>
        ${escapeHtml(
          channel.rows[0].description || ""
        )}
      </p>

      <p>
        👤 سازنده:
        ${escapeHtml(
          channel.rows[0].owner_name || ""
        )}
      </p>

      ${
        role
        ? `
          <a href="/channel-leave?id=${channelId}">
            <button>
              🚪 خروج از کانال
            </button>
          </a>
        `
        : `
          <a href="/channel-join?id=${channelId}">
            <button>
              ➕ عضویت در کانال
            </button>
          </a>
        `
      }

    </div>

    ${
      canPost
      ? `
        <div class="card">

          <h3>✍️ انتشار پست</h3>

          <form
            method="POST"
            action="/channel-post"
          >

            <input
              type="hidden"
              name="channel_id"
              value="${channelId}"
            >

            <textarea
              name="content"
              maxlength="10000"
              placeholder="متن پست..."
            ></textarea>

            <input
              type="url"
              name="media_url"
              placeholder="لینک تصویر یا ویدیو، اختیاری"
            >

            <button type="submit">
              📤 انتشار
            </button>

          </form>

        </div>
      `
      : ""
    }

    <div class="card">

      <h3>📚 پست‌های کانال</h3>

      ${
        posts.rows.length
        ? posts.rows.map(p => `
            <article class="card">

              <b>
                ${escapeHtml(
                  p.name || ""
                )}
              </b>

              <small>
                ${escapeHtml(
                  String(
                    p.created_at || ""
                  )
                )}
              </small>

              ${
                p.content
                ? `
                  <p>
                    ${escapeHtml(
                      p.content
                    )}
                  </p>
                `
                : ""
              }

              ${
                p.media_url
                ? `
                  <p>
                    <a
                      href="${escapeHtml(
                        p.media_url
                      )}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      🔗 مشاهده رسانه
                    </a>
                  </p>
                `
                : ""
              }

            </article>
          `).join("")
        : `
          <p>
            هنوز پستی منتشر نشده است.
          </p>
        `
      }

    </div>
  `;

  sendHtml(
    res,
    200,
    channel.rows[0].name || "کانال",
    html,
    user
  );

  return;
}


// ------------------------------------------------------------
// CHANNELS LIST
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/channels"
) {

  const channels = await pool.query(`
    SELECT
      c.id,
      c.name,
      c.username,
      c.description,
      c.is_public,
      c.created_at,
      u.name AS owner_name,
      COUNT(cm.id)::INTEGER AS member_count
    FROM channels c
    JOIN users u
      ON u.id=c.owner_id
    LEFT JOIN channel_members cm
      ON cm.channel_id=c.id
    WHERE c.is_public=TRUE
    GROUP BY
      c.id,
      c.name,
      c.username,
      c.description,
      c.is_public,
      c.created_at,
      u.name
    ORDER BY c.created_at DESC
    LIMIT 200
  `);

  const html = `
    <div class="card">

      <h2>📢 کانال‌ها</h2>

      <a href="/channel-create">
        <button>
          ➕ ایجاد کانال
        </button>
      </a>

    </div>

    ${
      channels.rows.map(c => `
        <div class="card">

          <h3>
            <a href="/channel?id=${c.id}">
              📢 ${escapeHtml(
                c.name || ""
              )}
            </a>
          </h3>

          ${
            c.username
            ? `
              <p>
                @${escapeHtml(
                  c.username
                )}
              </p>
            `
            : ""
          }

          <p>
            ${escapeHtml(
              c.description || ""
            )}
          </p>

          <small>
            👤 ${c.member_count} عضو
            · سازنده:
            ${escapeHtml(
              c.owner_name || ""
            )}
          </small>

        </div>
      `).join("")
    }
  `;

  sendHtml(
    res,
    200,
    "کانال‌ها",
    html,
    user
  );

  return;
}    return;
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
}

/* EXTRA FEATURE SECTION 17 */
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
    String(d.get("type") || "").trim();

  const entityId = Number(
    d.get("entity_id")
  );

  const mentionedUserId = Number(
    d.get("mentioned_user_id")
  );

  if (
    !["post","story","reel"].includes(type) ||
    !Number.isInteger(entityId) ||
    entityId <= 0 ||
    !Number.isInteger(mentionedUserId) ||
    mentionedUserId <= 0
  ) {
    sendJson(res,{
      ok:false,
      error:"invalid_request"
    },400);

    return;
  }

  if (mentionedUserId === user.id) {
    sendJson(res,{
      ok:true
    });

    return;
  }

  if (type === "post") {

    const exists = await pool.query(`
      SELECT id
      FROM posts
      WHERE id=$1
        AND user_id=$2
      LIMIT 1
    `,[
      entityId,
      user.id
    ]);

    if (!exists.rows.length) {
      sendJson(res,{
        ok:false,
        error:"not_found"
      },404);

      return;
    }

    await pool.query(`
      INSERT INTO post_mentions(
        post_id,
        mentioned_user_id
      )
      VALUES($1,$2)
      ON CONFLICT(post_id,mentioned_user_id)
      DO NOTHING
    `,[
      entityId,
      mentionedUserId
    ]);

  } else if (type === "story") {

    const exists = await pool.query(`
      SELECT id
      FROM stories
      WHERE id=$1
        AND user_id=$2
      LIMIT 1
    `,[
      entityId,
      user.id
    ]);

    if (!exists.rows.length) {
      sendJson(res,{
        ok:false,
        error:"not_found"
      },404);

      return;
    }

    await pool.query(`
      INSERT INTO story_mentions(
        story_id,
        mentioned_user_id
      )
      VALUES($1,$2)
      ON CONFLICT(story_id,mentioned_user_id)
      DO NOTHING
    `,[
      entityId,
      mentionedUserId
    ]);

  } else {

    const exists = await pool.query(`
      SELECT id
      FROM reels
      WHERE id=$1
        AND user_id=$2
      LIMIT 1
    `,[
      entityId,
      user.id
    ]);

    if (!exists.rows.length) {
      sendJson(res,{
        ok:false,
        error:"not_found"
      },404);

      return;
    }

    await pool.query(`
      INSERT INTO reel_mentions(
        reel_id,
        mentioned_user_id
      )
      VALUES($1,$2)
      ON CONFLICT(reel_id,mentioned_user_id)
      DO NOTHING
    `,[
      entityId,
      mentionedUserId
    ]);
  }

  await createAdvancedNotification(
    mentionedUserId,
    user.id,
    "mention",
    `شما در ${type} منشن شدید.`,
    type,
    entityId
  );

  sendJson(res,{
    ok:true
  });

  return;
}    return;
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
}

/* EXTRA FEATURE SECTION 17 */
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
// ------------------------------------------------------------    return;
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
}

/* EXTRA FEATURE SECTION 17 */
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
    String(d.get("type") || "").trim();

  const entityId = Number(
    d.get("entity_id")
  );

  const mentionedUserId = Number(
    d.get("mentioned_user_id")
  );

  if (
    !["post","story","reel"].includes(type) ||
    !Number.isInteger(entityId) ||
    entityId <= 0 ||
    !Number.isInteger(mentionedUserId) ||
    mentionedUserId <= 0
  ) {
    sendJson(res,{
      ok:false,
      error:"invalid_request"
    },400);

    return;
  }

  if (mentionedUserId === user.id) {
    sendJson(res,{
      ok:true
    });

    return;
  }

  if (type === "post") {

    const exists = await pool.query(`
      SELECT id
      FROM posts
      WHERE id=$1
        AND user_id=$2
      LIMIT 1
    `,[
      entityId,
      user.id
    ]);

    if (!exists.rows.length) {
      sendJson(res,{
        ok:false,
        error:"not_found"
      },404);

      return;
    }

    await pool.query(`
      INSERT INTO post_mentions(
        post_id,
        mentioned_user_id
      )
      VALUES($1,$2)
      ON CONFLICT(post_id,mentioned_user_id)
      DO NOTHING
    `,[
      entityId,
      mentionedUserId
    ]);

  } else if (type === "story") {

    const exists = await pool.query(`
      SELECT id
      FROM stories
      WHERE id=$1
        AND user_id=$2
      LIMIT 1
    `,[
      entityId,
      user.id
    ]);

    if (!exists.rows.length) {
      sendJson(res,{
        ok:false,
        error:"not_found"
      },404);

      return;
    }

    await pool.query(`
      INSERT INTO story_mentions(
        story_id,
        mentioned_user_id
      )
      VALUES($1,$2)
      ON CONFLICT(story_id,mentioned_user_id)
      DO NOTHING
    `,[
      entityId,
      mentionedUserId
    ]);

  } else {

    const exists = await pool.query(`
      SELECT id
      FROM reels
      WHERE id=$1
        AND user_id=$2
      LIMIT 1
    `,[
      entityId,
      user.id
    ]);

    if (!exists.rows.length) {
      sendJson(res,{
        ok:false,
        error:"not_found"
      },404);

      return;
    }

    await pool.query(`
      INSERT INTO reel_mentions(
        reel_id,
        mentioned_user_id
      )
      VALUES($1,$2)
      ON CONFLICT(reel_id,mentioned_user_id)
      DO NOTHING
    `,[
      entityId,
      mentionedUserId
    ]);
  }

  await createAdvancedNotification(
    mentionedUserId,
    user.id,
    "mention",
    `شما در ${type} منشن شدید.`,
    type,
    entityId
  );

  sendJson(res,{
    ok:true
  });

  return;
}              href="/product-edit?id=${p.id}"
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

/* EXTRA FEATURE SECTION 19 */
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
      error:"invalid_data"    return;
  }

  const owner = await pool.query(`
    SELECT
      id,
      name
    FROM business_pages
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `,[
    pageId,
    user.id
  ]);

  if (!owner.rows.length) {
    redirect(res,"/business");
    return;
  }

  const page = owner.rows[0];

  sendPage(
    res,
    "مدیریت صفحه کسب‌وکار",
    `
      <div class="card">

        <h2>
          🏪 مدیریت ${escapeHtml(page.name)}
        </h2>

        <div class="grid">

          <a class="btn"
             href="/business-page?id=${page.id}">
            مشاهده صفحه
          </a>

          <a class="btn"
             href="/business-edit?id=${page.id}">
            ✏️ ویرایش
          </a>

        </div>

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// BUSINESS PAGE POSTS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/business-posts"
) {

  const pageId =
    Number(url.searchParams.get("id"));

  if (!isSafeInteger(pageId)) {
    redirect(res,"/business");
    return;
  }

  const owner = await pool.query(`
    SELECT
      id,
      name
    FROM business_pages
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `,[
    pageId,
    user.id
  ]);

  if (!owner.rows.length) {
    redirect(res,"/business");
    return;
  }

  const posts = await pool.query(`
    SELECT
      p.id,
      p.content,
      p.media_url,
      p.created_at
    FROM posts p
    WHERE p.business_page_id=$1
    ORDER BY p.created_at DESC
    LIMIT 100
  `,[pageId]);

  sendPage(
    res,
    "پست‌های کسب‌وکار",
    `
      <div class="card">

        <h2>
          📱 پست‌های ${escapeHtml(owner.rows[0].name)}
        </h2>

        <a class="btn"
           href="/business-post-new?id=${pageId}">
          ➕ پست جدید
        </a>

        ${
          posts.rows.length
          ? posts.rows.map(p => `
              <div class="card">

                <div>
                  ${escapeHtml(p.content || "")}
                </div>

                ${
                  p.media_url
                  ? `
                    <img
                      src="${escapeHtml(p.media_url)}"
                      style="max-width:100%;border-radius:14px"
                    >
                  `
                  : ""
                }

                <small>
                  ${escapeHtml(String(p.created_at || ""))}
                </small>

              </div>
            `).join("")
          : `
            <div class="empty">
              هنوز پستی منتشر نشده است.
            </div>
          `
        }

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// BUSINESS POST CREATE
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/business-post-create"
) {

  const d = await readBody(req);

  const pageId =
    Number(d.get("page_id"));

  const content =
    (d.get("content") || "").trim();

  let mediaUrl =
    (d.get("media_url") || "").trim();

  if (
    !isSafeInteger(pageId) ||
    !content
  ) {
    redirect(res,"/business");
    return;
  }

  const owner = await pool.query(`
    SELECT id
    FROM business_pages
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `,[
    pageId,
    user.id
  ]);

  if (!owner.rows.length) {
    redirect(res,"/business");
    return;
  }

  if (mediaUrl) {
    mediaUrl = safeUrl(mediaUrl) || "";
  }

  await pool.query(`
    INSERT INTO posts(
      user_id,
      content,
      media_url,
      business_page_id
    )
    VALUES($1,$2,$3,$4)
  `,[
    user.id,
    content.slice(0,10000),
    mediaUrl,
    pageId
  ]);

  redirect(
    res,
    `/business-posts?id=${pageId}`
  );

  return;
}


// ------------------------------------------------------------
// BUSINESS POST NEW PAGE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/business-post-new"
) {

  const pageId =
    Number(url.searchParams.get("id"));

  if (!isSafeInteger(pageId)) {
    redirect(res,"/business");
    return;
  }

  const owner = await pool.query(`
    SELECT
      id,
      name
    FROM business_pages
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `,[
    pageId,
    user.id
  ]);

  if (!owner.rows.length) {
    redirect(res,"/business");
    return;
  }

  sendPage(
    res,
    "پست جدید",
    `
      <div class="card">

        <h2>
          ➕ پست جدید برای
          ${escapeHtml(owner.rows[0].name)}
        </h2>

        <form method="POST"
              action="/business-post-create">

          <input
            type="hidden"
            name="page_id"
            value="${pageId}"
          >

          <textarea
            name="content"
            placeholder="متن پست..."
            required
          ></textarea>

          <input
            name="media_url"
            placeholder="لینک تصویر یا ویدیو"
          >

          <button class="btn">
            انتشار پست
          </button>

        </form>

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// BUSINESS FOLLOW
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/business/follow"
) {

  const d = await readBody(req);

  const pageId =
    Number(d.get("page_id"));

  if (!isSafeInteger(pageId)) {
    sendJson(res,400,{
      success:false,
      error:"invalid_page"
    });
    return;
  }

  const page = await pool.query(`
    SELECT
      id,
      owner_id
    FROM business_pages
    WHERE id=$1
      AND active=TRUE
    LIMIT 1
  `,[pageId]);

  if (!page.rows.length) {
    sendJson(res,404,{
      success:false,
      error:"page_not_found"
    });
    return;
  }

  await pool.query(`
    INSERT INTO business_page_followers(
      page_id,
      user_id
    )
    VALUES($1,$2)
    ON CONFLICT(page_id,user_id)
    DO NOTHING
  `,[
    pageId,
    user.id
  ]);

  sendJson(res,200,{
    success:true
  });

  return;
}


// ------------------------------------------------------------
// BUSINESS UNFOLLOW
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/business/unfollow"
) {

  const d = await readBody(req);

  const pageId =
    Number(d.get("page_id"));

  if (!isSafeInteger(pageId)) {
    sendJson(res,400,{
      success:false
    });
    return;
  }

  await pool.query(`
    DELETE FROM business_page_followers
    WHERE page_id=$1
      AND user_id=$2
  `,[
    pageId,
    user.id
  ]);

  sendJson(res,200,{
    success:true
  });

  return;
}


// ------------------------------------------------------------
// BUSINESS FOLLOWERS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/business-followers"
) {

  const pageId =
    Number(url.searchParams.get("id"));

  if (!isSafeInteger(pageId)) {
    redirect(res,"/business");
    return;
  }

  const owner = await pool.query(`
    SELECT
      id,
      name
    FROM business_pages
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `,[
    pageId,
    user.id
  ]);

  if (!owner.rows.length) {
    redirect(res,"/business");
    return;
  }

  const followers = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.email
    FROM business_page_followers f
    JOIN users u
      ON u.id=f.user_id
    WHERE f.page_id=$1
    ORDER BY f.created_at DESC
    LIMIT 500
  `,[pageId]);

  sendPage(
    res,
    "دنبال‌کنندگان",
    `
      <div class="card">

        <h2>
          👥 دنبال‌کنندگان
        </h2>

        ${
          followers.rows.length
          ? followers.rows.map(f => `
              <div class="card">
                <strong>
                  ${escapeHtml(f.name)}
                </strong>
                <div>
                  ${escapeHtml(f.email)}
                </div>
              </div>
            `).join("")
          : `
            <div class="empty">
              هنوز دنبال‌کننده‌ای وجود ندارد.
            </div>
          `
        }

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// BUSINESS ANALYTICS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/business-analytics"
) {

  const pageId =
    Number(url.searchParams.get("id"));

  if (!isSafeInteger(pageId)) {
    redirect(res,"/business");
    return;
  }

  const owner = await pool.query(`
    SELECT
      id,
      name
    FROM business_pages
    WHERE id=$1
      AND owner_id=$2
    LIMIT 1
  `,[
    pageId,
    user.id
  ]);

  if (!owner.rows.length) {
    redirect(res,"/business");
    return;
  }

  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*)
       FROM business_page_followers
       WHERE page_id=$1) AS followers,

      (SELECT COUNT(*)
       FROM posts
       WHERE business_page_id=$1) AS posts,

      (SELECT COUNT(*)
       FROM business_page_followers
       WHERE page_id=$1
         AND created_at>=CURRENT_DATE) AS new_followers
  `,[pageId]);

  const s = stats.rows[0];

  sendPage(
    res,
    "آمار کسب‌وکار",
    `
      <div class="card">

        <h2>
          📊 آمار ${escapeHtml(owner.rows[0].name)}
        </h2>

        <div class="grid">

          <div class="card">
            <h3>👥 دنبال‌کنندگان</h3>
            <strong>
              ${escapeHtml(String(s.followers || 0))}
            </strong>
          </div>

          <div class="card">
            <h3>📱 پست‌ها</h3>
            <strong>
              ${escapeHtml(String(s.posts || 0))}
            </strong>
          </div>

          <div class="card">
            <h3>🆕 دنبال‌کننده جدید امروز</h3>
            <strong>
              ${escapeHtml(String(s.new_followers || 0))}
            </strong>
          </div>

        </div>

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// BUSINESS PAGE SEARCH
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/business-search"
) {

  const q =
    (url.searchParams.get("q") || "").trim();

  const pages = await pool.query(`
    SELECT
      id,
      name,
      description
    FROM business_pages
    WHERE active=TRUE
      AND (
        name ILIKE $1
        OR description ILIKE $1
      )
    ORDER BY name ASC
    LIMIT 100
  `,[
    `%${q.slice(0,100)}%`
  ]);

  sendPage(
    res,
    "جستجوی کسب‌وکار",
    `
      <div class="card">

        <h2>🔎 جستجوی کسب‌وکار</h2>

        <form method="GET"
              action="/business-search">

          <input
            name="q"
            value="${escapeHtml(q)}"
            placeholder="نام کسب‌وکار..."
          >

          <button class="btn">
            جستجو
          </button>

        </form>

        ${
          pages.rows.length
          ? pages.rows.map(p => `
              <div class="card">

                <h3>
                  ${escapeHtml(p.name)}
                </h3>

                <p>
                  ${escapeHtml(p.description || "")}
                </p>

                <a
                  class="btn"
                  href="/business-page?id=${p.id}"
                >
                  مشاهده
                </a>

              </div>
            `).join("")
          : `
            <div class="empty">
              نتیجه‌ای پیدا نشد.
            </div>
          `
        }

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// BUSINESS PAGE API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/business/page"
) {

  const pageId =
    Number(url.searchParams.get("id"));

  if (!isSafeInteger(pageId)) {
    sendJson(res,400,{
      success:false,
      error:"invalid_id"
    });
    return;
  }

  const pageResult = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.description,
      p.logo_url,
      p.cover_url,
      p.owner_id,
      p.category,
      p.active,
      COUNT(DISTINCT f.user_id)::INTEGER
        AS followers
    FROM business_pages p
    LEFT JOIN business_page_followers f
      ON f.page_id=p.id
    WHERE p.id=$1
    GROUP BY
      p.id,
      p.name,
      p.description,
      p.logo_url,
      p.cover_url,
      p.owner_id,
      p.category,
      p.active
    LIMIT 1
  `,[pageId]);

  if (!pageResult.rows.length) {
    sendJson(res,404,{
      success:false,
      error:"not_found"
    });
    return;
  }

  sendJson(res,200,{
    success:true,
    page:pageResult.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// SHOP WISHLIST
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/shop/wishlist"
) {

  const d = await readBody(req);

  const productId =
    Number(d.get("product_id"));

  if (!isSafeInteger(productId)) {
    sendJson(res,400,{
      success:false,
      error:"invalid_product"
    });
    return;
  }

  const product = await pool.query(`
    SELECT id
    FROM products
    WHERE id=$1
      AND active=TRUE
    LIMIT 1
  `,[productId]);

  if (!product.rows.length) {
    sendJson(res,404,{
      success:false,
      error:"product_not_found"
    });
    return;
  }

  await pool.query(`
    INSERT INTO wishlist_items(
      user_id,
      product_id
    )
    VALUES($1,$2)
    ON CONFLICT(user_id,product_id)
    DO NOTHING
  `,[
    user.id,
    productId
  ]);

  sendJson(res,200,{
    success:true
  });

  return;
}


// ------------------------------------------------------------
// REMOVE WISHLIST
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/shop/wishlist-remove"
) {

  const d = await readBody(req);

  const productId =
    Number(d.get("product_id"));

  if (!isSafeInteger(productId)) {
    sendJson(res,400,{
      success:false
    });
    return;
  }

  await pool.query(`
    DELETE FROM wishlist_items
    WHERE user_id=$1
      AND product_id=$2
  `,[
    user.id,
    productId
  ]);

  sendJson(res,200,{
    success:true
  });

  return;
}


// ------------------------------------------------------------
// WISHLIST PAGE
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/wishlist"
) {

  const items = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.price,
      p.currency,
      p.image_url,
      p.stock
    FROM wishlist_items w
    JOIN products p
      ON p.id=w.product_id
    WHERE w.user_id=$1
      AND p.active=TRUE
    ORDER BY w.created_at DESC
  `,[user.id]);

  sendPage(
    res,
    "علاقه‌مندی‌ها",
    `
      <div class="card">

        <h2>❤️ علاقه‌مندی‌های من</h2>

        ${
          items.rows.length
          ? items.rows.map(p => `
              <div class="card">

                ${
                  p.image_url
                  ? `
                    <img
                      src="${escapeHtml(p.image_url)}"
                      style="max-width:180px;border-radius:12px"
                    >
                  `
                  : ""
                }

                <h3>
                  ${escapeHtml(p.name)}
                </h3>

                <div>
                  ${escapeHtml(String(p.price))}
                  ${escapeHtml(p.currency || "")}
                </div>

                <a
                  class="btn"
                  href="/product?id=${p.id}"
                >
                  مشاهده محصول
                </a>

                <form
                  method="POST"
                  action="/api/shop/wishlist-remove"
                  style="display:inline"
                >
                  <input
                    type="hidden"
                    name="product_id"
                    value="${p.id}"
                  >

                  <button class="btn">
                    حذف
                  </button>
                </form>

              </div>
            `).join("")
          : `
            <div class="empty">
              لیست علاقه‌مندی‌ها خالی است.
            </div>
          `
        }

      </div>
    `
  );

  return;
}


// ------------------------------------------------------------
// PRODUCT REVIEWS API
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/shop/review"
) {

  const d = await readBody(req);

  const productId =
    Number(d.get("product_id"));

  const rating =
    Number(d.get("rating"));

  const title =
    (d.get("title") || "").trim();

  const content =
    (d.get("content") || "").trim();

  if (
    !isSafeInteger(productId) ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {

    sendJson(res,400,{
      success:false,
      error:"invalid_review"
    });

    return;
  }

  const product = await pool.query(`
    SELECT id
    FROM products
    WHERE id=$1
      AND active=TRUE
    LIMIT 1
  `,[productId]);

  if (!product.rows.length) {
    sendJson(res,404,{
      success:false,
      error:"product_not_found"
    });
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
    title.slice(0,200),
    content.slice(0,5000)
  ]);

  sendJson(res,200,{
    success:true
  });

  return;
}


// ------------------------------------------------------------
// PRODUCT REVIEWS
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/shop/reviews"
) {

  const productId =
    Number(url.searchParams.get("product_id"));

  if (!isSafeInteger(productId)) {
    sendJson(res,400,{
      success:false
    });
    return;
  }

  const reviews = await pool.query(`
    SELECT
      r.id,
      r.rating,
      r.title,
      r.content,
      r.created_at,
      u.id user_id,
      u.name user_name
    FROM product_reviews r
    JOIN users u
      ON u.id=r.user_id
    WHERE r.product_id=$1
      AND r.approved=TRUE
    ORDER BY r.created_at DESC
    LIMIT 200
  `,[productId]);

  sendJson(res,200,{
    success:true,
    reviews:reviews.rows
  });

  return;
}


// ------------------------------------------------------------
// PRODUCT RATING SUMMARY
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/shop/rating"
) {

  const productId =
    Number(url.searchParams.get("product_id"));

  if (!isSafeInteger(productId)) {
    sendJson(res,400,{
      success:false
    });
    return;
  }

  const summary = await pool.query(`
    SELECT
      COUNT(*)::INTEGER AS count,
      COALESCE(AVG(rating),0) AS average,
      COUNT(*) FILTER(WHERE rating=5)::INTEGER AS five,
      COUNT(*) FILTER(WHERE rating=4)::INTEGER AS four,
      COUNT(*) FILTER(WHERE rating=3)::INTEGER AS three,
      COUNT(*) FILTER(WHERE rating=2)::INTEGER AS two,
      COUNT(*) FILTER(WHERE rating=1)::INTEGER AS one
    FROM product_reviews
    WHERE product_id=$1
      AND approved=TRUE
  `,[productId]);

  sendJson(res,200,{
    success:true,
    rating:summary.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// CREATE WISHLIST TABLE
// ------------------------------------------------------------

await pool.query(`
  CREATE TABLE IF NOT EXISTS wishlist_items (    return;
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
) {    return;
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
) {      )
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

/* EXTRA FEATURE SECTION 20 */
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
    },403);  if (!(await isAdmin(user.id))) {

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
}

/* EXTRA FEATURE SECTION 21 */
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

if (    `moderation_${action}`,
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
}

/* EXTRA FEATURE SECTION 22 */
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
  CREATE TABLE IF NOT EXISTS message_reactions (    `moderation_${action}`,
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
}

/* EXTRA FEATURE SECTION 22 */
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
  CREATE TABLE IF NOT EXISTS message_reactions (    id SERIAL PRIMARY KEY,

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
    "👍",        m.sender_id=$1
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
}

/* EXTRA FEATURE SECTION 23 */
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
    SELECT      COUNT(*)::INTEGER AS count
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

/* EXTRA FEATURE SECTION 24 */
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
      u.id,      u.name,
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
      ]);    if (duplicate.rows.length) {

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
}

/* EXTRA FEATURE SECTION 25 */
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
      AND (    if (duplicate.rows.length) {

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
}

/* EXTRA FEATURE SECTION 25 */
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
      AND (    LIMIT $2
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
}

/* EXTRA FEATURE SECTION 26 */
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

  const d = await readBody(req);    const d = await readBody(req);

    const currentPassword =
      String(
        d.get("current_password") || ""
      );

    const newPassword =
      String(
        d.get("new_password") || ""
      );

    if (
      !currentPassword ||
      !newPassword
    ) {

      sendJson(res,{
        ok:false,
        error:"password_required"
      },400);

      return;
    }

    if (
      newPassword.length < 8
    ) {

      sendJson(res,{
        ok:false,
        error:"password_too_short"
      },400);

      return;
    }

    const account =
      await pool.query(`
        SELECT
          id,
          password_hash
        FROM users
        WHERE id=$1
        LIMIT 1
      `,[
        user.id
      ]);

    if (
      !account.rows.length
    ) {

      sendJson(res,{
        ok:false,
        error:"user_not_found"
      },404);

      return;
    }

    const valid =
      await verifyPassword(
        currentPassword,
        account.rows[0].password_hash
      );

    if (!valid) {

      await pool.query(`
        INSERT INTO login_attempts(
          user_id,
          identifier,
          ip_address,
          success
        )
        VALUES(
          $1,
          $2,
          $3,
          FALSE
        )
      `,[
        user.id,
        user.email || "",
        req.socket.remoteAddress || ""
      ]);

      sendJson(res,{
        ok:false,
        error:"current_password_incorrect"
      },401);

      return;
    }

    const passwordHash =
      await hashPassword(
        newPassword
      );

    await pool.query(`
      UPDATE users
      SET password_hash=$1
      WHERE id=$2
    `,[
      passwordHash,
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
// CREATE PASSWORD RESET TOKEN
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/security/password-reset/request"
) {

  const d = await readBody(req);

  const identifier =
    String(
      d.get("identifier") || ""
    ).trim();

  if (!identifier) {

    sendJson(res,{
      ok:false,
      error:"identifier_required"
    },400);

    return;
  }

  const account =
    await pool.query(`
      SELECT
        id,
        email,
        name
      FROM users
      WHERE
        LOWER(email)=LOWER($1)
        OR
        LOWER(COALESCE(username,''))=LOWER($1)
      LIMIT 1
    `,[
      identifier
    ]);

  if (
    !account.rows.length
  ) {

    sendJson(res,{
      ok:true,
      message:"اگر حسابی با این مشخصات وجود داشته باشد، درخواست ثبت شد."
    });

    return;
  }

  const target =
    account.rows[0];

  const rawToken =
    crypto.randomBytes(48)
      .toString("hex");

  const tokenHash =
    crypto.createHash("sha256")
      .update(rawToken)
      .digest("hex");

  await pool.query(`
    UPDATE password_reset_tokens
    SET used=TRUE
    WHERE
      user_id=$1
      AND used=FALSE
  `,[
    target.id
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
    target.id,
    tokenHash
  ]);

  sendJson(res,{
    ok:true,
    message:"توکن بازیابی ایجاد شد.",
    token:rawToken
  });

  return;
}


// ------------------------------------------------------------
// PASSWORD RESET WITH TOKEN
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
    !newPassword
  ) {

    sendJson(res,{
      ok:false,
      error:"token_and_password_required"
    },400);

    return;
  }

  if (
    newPassword.length < 8
  ) {

    sendJson(res,{
      ok:false,
      error:"password_too_short"
    },400);

    return;
  }

  const tokenHash =
    crypto.createHash("sha256")
      .update(token)
      .digest("hex");

  const result =
    await pool.query(`
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

  if (
    !result.rows.length
  ) {

    sendJson(res,{
      ok:false,
      error:"invalid_or_expired_token"
    },400);

    return;
  }

  const reset =
    result.rows[0];

  const passwordHash =
    await hashPassword(
      newPassword
    );

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

  sendJson(res,{
    ok:true,
    message:"password_reset_success"
  });

  return;
}


// ------------------------------------------------------------
// UPDATE DEVICE
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/security/device/update"
) {

  const d = await readBody(req);

  const deviceId =
    Number(
      d.get("device_id")
    );

  const deviceName =
    String(
      d.get("device_name") || ""
    )
      .trim()
      .slice(0,255);

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

  const result =
    await pool.query(`
      UPDATE user_devices
      SET
        device_name=$1,
        last_seen=NOW()
      WHERE
        id=$2
        AND user_id=$3
      RETURNING
        id,
        device_name,
        user_agent,
        ip_address,
        last_seen,
        created_at,
        revoked
    `,[
      deviceName || null,
      deviceId,
      user.id
    ]);

  if (
    !result.rows.length
  ) {

    sendJson(res,{
      ok:false,
      error:"device_not_found"
    },404);

    return;
  }

  sendJson(res,{
    ok:true,
    device:result.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// SECURITY CLEANUP
// ------------------------------------------------------------

await pool.query(`
  DELETE FROM password_reset_tokens
  WHERE
    expires_at<NOW()
    OR used=TRUE
`);

await pool.query(`
  DELETE FROM login_attempts
  WHERE
    created_at<
      NOW()-INTERVAL '90 days'
`);

await pool.query(`
  UPDATE user_devices
  SET revoked=TRUE
  WHERE
    last_seen<
      NOW()-INTERVAL '180 days'
    AND revoked=FALSE
`);

await pool.query(`
  DELETE FROM sessions
  WHERE
    last_seen<
      NOW()-INTERVAL '90 days'
`);


// ------------------------------------------------------------
// DEVICE REGISTRATION
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/security/device/register"
) {

  const d = await readBody(req);

  const deviceName =
    String(
      d.get("device_name") || ""
    )
      .trim()
      .slice(0,255);

  const userAgent =
    String(
      req.headers["user-agent"] || ""
    )
      .slice(0,2000);

  const ipAddress =
    String(
      req.socket.remoteAddress || ""
    )
      .slice(0,100);

  const result =
    await pool.query(`
      INSERT INTO user_devices(
        user_id,
        device_name,
        user_agent,
        ip_address,
        last_seen
      )
      VALUES(
        $1,
        $2,
        $3,
        $4,
        NOW()
      )
      RETURNING
        id,
        device_name,
        user_agent,
        ip_address,
        last_seen,
        created_at,
        revoked
    `,[
      user.id,
      deviceName || null,
      userAgent,
      ipAddress
    ]);

  sendJson(res,{
    ok:true,
    device:result.rows[0]
  });

  return;
}


// ------------------------------------------------------------
// UPDATE SESSION ACTIVITY
// ------------------------------------------------------------

if (
  sessionId
) {

  try {

    await pool.query(`
      UPDATE sessions
      SET
        last_seen=NOW(),
        ip_address=$1,
        user_agent=$2
      WHERE
        id=$3
        AND user_id=$4
    `,[
      req.socket.remoteAddress || "",
      String(
        req.headers["user-agent"] || ""
      ).slice(0,2000),
      sessionId,
      user.id
    ]);

  } catch {}
}


// ------------------------------------------------------------
// NOTIFICATION PREFERENCES API
// ------------------------------------------------------------

if (
  req.method === "GET" &&
  path === "/api/notification-preferences"
) {

  await ensureNotificationPreferences(
    user.id
  );

  const result =
    await pool.query(`
      SELECT *
      FROM notification_preferences
      WHERE user_id=$1
      LIMIT 1
    `,[
      user.id
    ]);

  sendJson(res,{
    ok:true,
    preferences:
      result.rows[0] || null
  });

  return;
}


if (
  req.method === "POST" &&
  path === "/api/notification-preferences"
) {

  const d = await readBody(req);

  await ensureNotificationPreferences(
    user.id
  );

  const likes =
    String(d.get("likes") || "")
      === "true";

  const comments =
    String(d.get("comments") || "")
      === "true";

  const follows =
    String(d.get("follows") || "")
      === "true";

  const messages =
    String(d.get("messages") || "")
      === "true";

  const mentions =
    String(d.get("mentions") || "")
      === "true";

  const system =
    String(d.get("system") || "")
      === "true";

  const result =
    await pool.query(`
      UPDATE notification_preferences
      SET
        likes=$1,
        comments=$2,
        follows=$3,
        messages=$4,
        mentions=$5,
        system=$6
      WHERE user_id=$7
      RETURNING *
    `,[
      likes,
      comments,
      follows,
      messages,
      mentions,
      system,
      user.id
    ]);

  sendJson(res,{
    ok:true,
    preferences:
      result.rows[0] || null
  });

  return;
}


// ------------------------------------------------------------
// NOTIFICATION READ ALL
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/notifications/read-all"
) {

  const result =
    await pool.query(`
      UPDATE notifications
      SET
        is_read=TRUE
      WHERE
        user_id=$1
        AND is_read=FALSE
    `,[
      user.id
    ]);

  sendJson(res,{
    ok:true,
    updated:result.rowCount
  });

  return;
}


// ------------------------------------------------------------
// NOTIFICATION DELETE
// ------------------------------------------------------------

if (
  req.method === "POST" &&
  path === "/api/notifications/delete"
) {

  const d = await readBody(req);

  const notificationId =
    Number(
      d.get("notification_id")
    );

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

  const result =
    await pool.query(`
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
}    LIMIT $2
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
}

/* EXTRA FEATURE SECTION 26 */
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

  const d = await readBody(req);      String(value).toLowerCase()
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
    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
      DELETE FROM notifications  return;
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
    )  return;
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
    )    targetId,
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
    sendHtml(res,404,"صفحه پیدا نشد",`<div class="card empty"><h2>صفحه پیدا نشد</h2><a href="/"><button>🏠 خانه</button></a>`,user);
});

async function startServer() {
  try {
    await createTables();
    server.listen(PORT,"0.0.0.0",()=>console.log(`Server running on port ${PORT}`));
  } catch(error) {
    console.error("STARTUP ERROR:",error);
    process.exit(1);
  }
}

startServer();
