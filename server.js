const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("STARTUP ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
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
    const index = part.indexOf("=");

    if (index < 0) return;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

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
  const nav = user
    ? `
      <nav class="bottom-nav">
        <a href="/">
          <span>🏠</span>
          خانه
        </a>

        <a href="/search">
          <span>🔎</span>
          جستجو
        </a>

        <a href="/new-post">
          <span>➕</span>
          پست
        </a>

        <a href="/messages">
          <span>💬</span>
          پیام
        </a>

        <a href="/profile">
          <span>👤</span>
          پروفایل
        </a>
      </nav>
    `
    : "";

  const topMenu = user
    ? `
      <div class="top-actions">
        <a href="/jobs">💼 کاریابی</a>
        <a href="/settings">⚙️ تنظیمات</a>
        <a href="/notifications">🔔 اعلان‌ها</a>
        <a href="/logout">🚪 خروج</a>
      </div>
    `
    : "";

  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>${escapeHtml(title)}</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family:
        Tahoma,
        Arial,
        sans-serif;
      background: #f3f5f7;
      color: #222;
      padding-bottom: 80px;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    header {
      background: #ffffff;
      border-bottom: 1px solid #ddd;
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .header-inner {
      max-width: 760px;
      margin: auto;
      padding: 14px 16px;
    }

    .brand {
      font-size: 22px;
      font-weight: bold;
      margin-bottom: 10px;
    }

    .top-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .top-actions a {
      background: #f0f2f5;
      padding: 8px 10px;
      border-radius: 10px;
      font-size: 13px;
    }

    main {
      max-width: 760px;
      margin: 20px auto;
      padding: 0 12px;
    }

    .card {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 14px;
      box-shadow:
        0 2px 8px rgba(0,0,0,.04);
    }

    .profile-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #e9ecef;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 20px;
    }

    .username {
      font-weight: bold;
      font-size: 16px;
    }

    .email,
    .small {
      color: #777;
      font-size: 12px;
      margin-top: 3px;
    }

    .post-text {
      white-space: pre-wrap;
      line-height: 1.9;
      margin-top: 15px;
      overflow-wrap: anywhere;
    }

    .post-image {
      width: 100%;
      max-height: 600px;
      object-fit: cover;
      border-radius: 12px;
      margin-top: 14px;
    }

    .stats {
      display: flex;
      gap: 18px;
      color: #666;
      font-size: 13px;
      margin-top: 14px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }

    button {
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      cursor: pointer;
      background: #e9ecef;
      font-size: 14px;
    }

    button.full {
      width: 100%;
    }

    button.danger {
      background: #ffe1e1;
    }

    button.follow {
      background: #dcecff;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    input,
    textarea {
      width: 100%;
      border: 1px solid #ccc;
      border-radius: 10px;
      padding: 12px;
      font-family: inherit;
      font-size: 14px;
      background: #fff;
    }

    textarea {
      min-height: 120px;
      resize: vertical;
    }

    .error {
      color: #c62828;
      font-weight: bold;
    }

    .success {
      color: #2e7d32;
      font-weight: bold;
    }

    .empty {
      text-align: center;
      color: #777;
    }

    .comment {
      margin-bottom: 10px;
    }

    .comment-name {
      font-weight: bold;
      margin-bottom: 6px;
    }

    .comment-text {
      white-space: pre-wrap;
      line-height: 1.8;
    }

    .job-title {
      font-size: 18px;
      font-weight: bold;
    }

    .job-city,
    .job-salary {
      margin-top: 8px;
      color: #555;
    }

    .job-description {
      white-space: pre-wrap;
      line-height: 1.8;
      margin-top: 12px;
    }

    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 30;
      background: #fff;
      border-top: 1px solid #ddd;
      display: flex;
      justify-content: center;
      gap: 8px;
      padding: 8px;
    }

    .bottom-nav a {
      flex: 1;
      max-width: 140px;
      text-align: center;
      font-size: 12px;
      padding: 7px 3px;
      border-radius: 10px;
    }

    .bottom-nav a:hover {
      background: #f1f3f5;
    }

    .bottom-nav span {
      display: block;
      font-size: 18px;
      margin-bottom: 2px;
    }

    @media (max-width: 600px) {
      main {
        margin-top: 12px;
      }

      .card {
        border-radius: 12px;
      }

      .top-actions {
        gap: 5px;
      }

      .top-actions a {
        font-size: 11px;
        padding: 7px 8px;
      }
    }
  </style>
</head>

<body>

<header>
  <div class="header-inner">

    <div class="brand">
      MySocial 📱
    </div>

    ${topMenu}

  </div>
</header>

<main>
  ${content}
</main>

${nav}

<script>
  function toggleTheme() {
    const dark =
      document.body.dataset.theme === "dark";

    if (dark) {
      document.body.dataset.theme = "";
      document.body.style.background = "#f3f5f7";
      document.body.style.color = "#222";
    } else {
      document.body.dataset.theme = "dark";
      document.body.style.background = "#151515";
      document.body.style.color = "#eee";
    }
  }
</script>

</body>
</html>
  `;
}async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(128) UNIQUE NOT NULL,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      content TEXT NOT NULL,
      image_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      UNIQUE(user_id, post_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      id SERIAL PRIMARY KEY,
      follower_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      following_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      UNIQUE(follower_id, following_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
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
        REFERENCES users(id)
        ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL
        REFERENCES posts(id)
        ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      actor_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      type TEXT NOT NULL,
      post_id INTEGER
        REFERENCES posts(id)
        ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      reported_user_id INTEGER
        REFERENCES users(id)
        ON DELETE CASCADE,
      post_id INTEGER
        REFERENCES posts(id)
        ON DELETE CASCADE,
      reason TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_users (
      id SERIAL PRIMARY KEY,
      blocker_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blocker_id, blocked_id)
    )
  `);

  console.log(
    "Database tables checked successfully."
  );
}

async function createSession(userId) {
  const sessionId =
    crypto.randomBytes(32).toString("hex");

  await pool.query(
    `
      INSERT INTO sessions(
        session_id,
        user_id
      )
      VALUES($1,$2)
    `,
    [
      sessionId,
      userId
    ]
  );

  return sessionId;
}

async function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.sessionId;

  if (!sessionId) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT
        users.id,
        users.name,
        users.email,
        users.bio,
        users.avatar_url
      FROM sessions
      JOIN users
        ON users.id=sessions.user_id
      WHERE sessions.session_id=$1
    `,
    [sessionId]
  );

  return result.rows[0] || null;
}

async function notify(
  userId,
  actorId,
  type,
  postId,
  message
) {
  if (
    !userId ||
    userId === actorId
  ) {
    return;
  }

  await pool.query(
    `
      INSERT INTO notifications(
        user_id,
        actor_id,
        type,
        post_id,
        message
      )
      VALUES($1,$2,$3,$4,$5)
    `,
    [
      userId,
      actorId,
      type,
      postId || null,
      message
    ]
  );
}

const server = http.createServer(
  async (req, res) => {
    try {
      const url = new URL(
        req.url,
        "http://localhost"
      );

      const path = url.pathname;

      const user =
        await getSession(req);

      if (
        path !== "/login" &&
        path !== "/register" &&
        path !== "/health" &&
        !user
      ) {
        redirect(res, "/login");
        return;
      }

      if (
        req.method === "GET" &&
        path === "/health"
      ) {
        res.writeHead(200, {
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(
          JSON.stringify({
            ok: true,
            service: "MySocial"
          })
        );

        return;
      }

      if (
        req.method === "GET" &&
        path === "/login"
      ) {
        if (user) {
          redirect(res, "/");
          return;
        }

        sendHtml(
          res,
          200,
          "ورود",
          `
            <div class="card">

              <h2>ورود به MySocial</h2>

              <form
                method="POST"
                action="/login"
              >

                <input
                  type="email"
                  name="email"
                  placeholder="ایمیل"
                  required
                >

                <input
                  type="password"
                  name="password"
                  placeholder="رمز عبور"
                  required
                >

                <button class="full">
                  🔐 ورود
                </button>

              </form>

              <p>
                حساب نداری؟
                <a href="/register">
                  ثبت‌نام
                </a>
              </p>

            </div>
          `
        );

        return;
      }

      if (
        req.method === "POST" &&
        path === "/login"
      ) {
        const data =
          await readBody(req);

        const email =
          (data.get("email") || "")
            .trim()
            .toLowerCase();

        const password =
          data.get("password") || "";

        const result =
          await pool.query(
            `
              SELECT id
              FROM users
              WHERE email=$1
              AND password=$2
            `,
            [
              email,
              hashPassword(password)
            ]
          );

        if (!result.rows.length) {
          sendHtml(
            res,
            401,
            "خطا",
            `
              <div class="card">
                <p class="error">
                  ایمیل یا رمز عبور اشتباه است.
                </p>

                <a href="/login">
                  بازگشت به ورود
                </a>
              </div>
            `
          );

          return;
        }

        const sessionId =
          await createSession(
            result.rows[0].id
          );

        redirect(
          res,
          "/",
          `sessionId=${encodeURIComponent(
            sessionId
          )}; HttpOnly; Path=/; SameSite=Lax`
        );

        return;
      }

      if (
        req.method === "GET" &&
        path === "/register"
      ) {
        if (user) {
          redirect(res, "/");
          return;
        }

        sendHtml(
          res,
          200,
          "ثبت‌نام",
          `
            <div class="card">

              <h2>ساخت حساب</h2>

              <form
                method="POST"
                action="/register"
              >

                <input
                  name="name"
                  maxlength="100"
                  placeholder="نام"
                  required
                >

                <input
                  type="email"
                  name="email"
                  maxlength="255"
                  placeholder="ایمیل"
                  required
                >

                <input
                  type="password"
                  name="password"
                  minlength="6"
                  placeholder="رمز عبور"
                  required
                >

                <button class="full">
                  📝 ثبت‌نام
                </button>

              </form>

              <p>
                قبلاً حساب ساخته‌ای؟
                <a href="/login">
                  ورود
                </a>
              </p>

            </div>
          `
        );

        return;
      }

      if (
        req.method === "POST" &&
        path === "/register"
      ) {
        const data =
          await readBody(req);

        const name =
          (data.get("name") || "")
            .trim();

        const email =
          (data.get("email") || "")
            .trim()
            .toLowerCase();

        const password =
          data.get("password") || "";

        if (
          !name ||
          !email ||
          password.length < 6
        ) {
          sendHtml(
            res,
            400,
            "خطا",
            `
              <div class="card">
                <p class="error">
                  نام، ایمیل و رمز عبور معتبر لازم است.
                </p>
              </div>
            `
          );

          return;
        }

        try {
          const result =
            await pool.query(
              `
                INSERT INTO users(
                  name,
                  email,
                  password
                )
                VALUES($1,$2,$3)
                RETURNING id
              `,
              [
                name,
                email,
                hashPassword(password)
              ]
            );

          const sessionId =
            await createSession(
              result.rows[0].id
            );

          redirect(
            res,
            "/",
            `sessionId=${encodeURIComponent(
              sessionId
            )}; HttpOnly; Path=/; SameSite=Lax`
          );

        } catch (error) {
          if (
            error.code === "23505"
          ) {
            sendHtml(
              res,
              409,
              "خطا",
              `
                <div class="card">
                  <p class="error">
                    این ایمیل قبلاً ثبت شده است.
                  </p>

                  <a href="/login">
                    ورود به حساب
                  </a>
                </div>
              `
            );
          } else {
            throw error;
          }
        }

        return;
      }if (
        req.method === "GET" &&
        path === "/logout"
      ) {
        const cookies =
          parseCookies(req);

        if (cookies.sessionId) {
          await pool.query(
            `
              DELETE FROM sessions
              WHERE session_id=$1
            `,
            [cookies.sessionId]
          );
        }

        redirect(
          res,
          "/login",
          "sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
        );

        return;
      }

      if (
        req.method === "GET" &&
        path === "/"
      ) {
        const posts =
          await pool.query(`
            SELECT
              p.id,
              p.user_id,
              p.content,
              p.image_url,
              p.created_at,
              u.name,
              u.email,

              (
                SELECT COUNT(*)
                FROM likes l
                WHERE l.post_id=p.id
              ) AS like_count,

              (
                SELECT COUNT(*)
                FROM comments c
                WHERE c.post_id=p.id
              ) AS comment_count,

              EXISTS(
                SELECT 1
                FROM likes ml
                WHERE ml.post_id=p.id
                AND ml.user_id=$1
              ) AS liked,

              EXISTS(
                SELECT 1
                FROM bookmarks mb
                WHERE mb.post_id=p.id
                AND mb.user_id=$1
              ) AS bookmarked

            FROM posts p

            JOIN users u
              ON u.id=p.user_id

            WHERE NOT EXISTS(
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

            ORDER BY p.created_at DESC
            LIMIT 100
          `, [user.id]);

        let html = `
          <div class="card">

            <h2>
              سلام ${escapeHtml(user.name)} 👋
            </h2>

            <p class="small">
              آخرین پست‌های کاربران
            </p>

            <div class="actions">

              <a href="/new-post">
                <button>
                  ➕ انتشار پست
                </button>
              </a>

              <a href="/search">
                <button>
                  🔎 جستجو
                </button>
              </a>

            </div>

          </div>
        `;

        if (!posts.rows.length) {
          html += `
            <div class="card empty">
              هنوز پستی برای نمایش وجود ندارد.
            </div>
          `;
        } else {
          for (const p of posts.rows) {
            html += `
              <article class="card">

                <div class="profile-head">

                  <a href="/profile?id=${p.user_id}">
                    <div class="avatar">
                      ${escapeHtml(
                        p.name.charAt(0)
                      )}
                    </div>
                  </a>

                  <div>
                    <a href="/profile?id=${p.user_id}">
                      <div class="username">
                        ${escapeHtml(p.name)}
                      </div>
                    </a>

                    <div class="email">
                      ${escapeHtml(p.email)}
                    </div>

                    <div class="small">
                      ${new Date(
                        p.created_at
                      ).toLocaleString("fa-IR")}
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
                        src="${escapeHtml(
                          p.image_url
                        )}"
                        alt="تصویر پست"
                      >
                    `
                    : ""
                }

                <div class="stats">
                  <span>
                    ❤️ ${p.like_count}
                  </span>

                  <span>
                    💬 ${p.comment_count}
                  </span>
                </div>

                <div class="actions">

                  <a href="/like?post=${p.id}">
                    <button>
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
                          ? "🔖 حذف ذخیره"
                          : "🔖 ذخیره"
                      }
                    </button>
                  </a>

                  <a href="/post?id=${p.id}">
                    <button>
                      💬 نظرات
                    </button>
                  </a>

                  <a href="/report?post=${p.id}&user=${p.user_id}">
                    <button class="danger">
                      🚩 گزارش
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
          "خانه",
          html,
          user
        );

        return;
      }

      if (
        req.method === "GET" &&
        path === "/new-post"
      ) {
        sendHtml(
          res,
          200,
          "پست جدید",
          `
            <div class="card">

              <h2>
                ➕ انتشار پست جدید
              </h2>

              <form
                method="POST"
                action="/new-post"
              >

                <textarea
                  name="content"
                  maxlength="10000"
                  placeholder="چه چیزی می‌خواهی منتشر کنی؟"
                  required
                ></textarea>

                <input
                  name="image_url"
                  maxlength="2000"
                  placeholder="لینک تصویر (اختیاری)"
                >

                <button class="full">
                  📤 انتشار پست
                </button>

              </form>

            </div>
          `,
          user
        );

        return;
      }

      if (
        req.method === "POST" &&
        path === "/new-post"
      ) {
        const data =
          await readBody(req);

        const content =
          (data.get("content") || "")
            .trim();

        const imageUrl =
          (data.get("image_url") || "")
            .trim();

        if (!content) {
          sendHtml(
            res,
            400,
            "خطا",
            `
              <div class="card">
                <p class="error">
                  متن پست نمی‌تواند خالی باشد.
                </p>
              </div>
            `,
            user
          );

          return;
        }

        const result =
          await pool.query(
            `
              INSERT INTO posts(
                user_id,
                content,
                image_url
              )
              VALUES($1,$2,$3)
              RETURNING id
            `,
            [
              user.id,
              content,
              imageUrl
            ]
          );

        redirect(
          res,
          `/post?id=${result.rows[0].id}`
        );

        return;
      }

      if (
        req.method === "GET" &&
        path === "/post"
      ) {
        const postId =
          Number(
            url.searchParams.get("id")
          );

        if (!Number.isInteger(postId)) {
          redirect(res, "/");
          return;
        }

        const result =
          await pool.query(
            `
              SELECT
                p.id,
                p.user_id,
                p.content,
                p.image_url,
                p.created_at,
                u.name,
                u.email,

                (
                  SELECT COUNT(*)
                  FROM likes l
                  WHERE l.post_id=p.id
                ) AS like_count,

                EXISTS(
                  SELECT 1
                  FROM likes ml
                  WHERE ml.post_id=p.id
                  AND ml.user_id=$1
                ) AS liked,

                EXISTS(
                  SELECT 1
                  FROM bookmarks mb
                  WHERE mb.post_id=p.id
                  AND mb.user_id=$1
                ) AS bookmarked

              FROM posts p

              JOIN users u
                ON u.id=p.user_id

              WHERE p.id=$2
            `,
            [
              user.id,
              postId
            ]
          );

        if (!result.rows.length) {
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

        const post =
          result.rows[0];

        const comments =
          await pool.query(
            `
              SELECT
                c.id,
                c.comment,
                c.created_at,
                u.id user_id,
                u.name,
                u.email

              FROM comments c

              JOIN users u
                ON u.id=c.user_id

              WHERE c.post_id=$1

              ORDER BY c.created_at ASC
            `,
            [postId]
          );

        let html = `
          <article class="card">

            <div class="profile-head">

              <a href="/profile?id=${post.user_id}">
                <div class="avatar">
                  ${escapeHtml(
                    post.name.charAt(0)
                  )}
                </div>
              </a>

              <div>

                <a href="/profile?id=${post.user_id}">
                  <div class="username">
                    ${escapeHtml(post.name)}
                  </div>
                </a>

                <div class="email">
                  ${escapeHtml(post.email)}
                </div>

                <div class="small">
                  ${new Date(
                    post.created_at
                  ).toLocaleString("fa-IR")}
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
                    src="${escapeHtml(
                      post.image_url
                    )}"
                    alt="تصویر پست"
                  >
                `
                : ""
            }

            <div class="stats">
              <span>
                ❤️ ${post.like_count}
              </span>
            </div>

            <div class="actions">

              <a href="/like?post=${post.id}">
                <button>
                  ${
                    post.liked
                      ? "💔 برداشتن لایک"
                      : "❤️ لایک"
                  }
                </button>
              </a>

              <a href="/bookmark?post=${post.id}">
                <button>
                  ${
                    post.bookmarked
                      ? "🔖 حذف ذخیره"
                      : "🔖 ذخیره"
                  }
                </button>
              </a>

              <a href="/report?post=${post.id}&user=${post.user_id}">
                <button class="danger">
                  🚩 گزارش
                </button>
              </a>

            </div>

          </article>

          <div class="card">

            <h3>
              💬 نظرات
            </h3>

            <form
              method="POST"
              action="/comment"
            >

              <input
                type="hidden"
                name="post_id"
                value="${post.id}"
              >

              <textarea
                name="comment"
                maxlength="3000"
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
              <div class="card">

                <div class="profile-head">

                  <a href="/profile?id=${c.user_id}">
                    <div class="avatar">
                      ${escapeHtml(
                        c.name.charAt(0)
                      )}
                    </div>
                  </a>

                  <div>
                    <a href="/profile?id=${c.user_id}">
                      <div class="username">
                        ${escapeHtml(c.name)}
                      </div>
                    </a>

                    <div class="small">
                      ${new Date(
                        c.created_at
                      ).toLocaleString("fa-IR")}
                    </div>
                  </div>

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
      }if (req.method==="GET" && path==="/signup") {
        sendHtml(res,200,"ثبت‌نام",`
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

      if (req.method==="POST" && path==="/signup") {
        const d=await readBody(req);

        const name=(d.get("name")||"").trim();
        const email=(d.get("email")||"")
          .trim()
          .toLowerCase();
        const password=d.get("password")||"";

        if(!name||!email||password.length<6){
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

        try{
          await pool.query(
            `
              INSERT INTO users(
                name,
                email,
                password
              )
              VALUES($1,$2,$3)
            `,
            [
              name,
              email,
              hashPassword(password)
            ]
          );

          sendHtml(
            res,
            200,
            "ثبت‌نام موفق",
            `
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
            `
          );

        }catch(e){
          sendHtml(
            res,
            400,
            "خطا",
            `
              <p class="error">
                این ایمیل قبلاً ثبت شده است.
              </p>

              <a href="/signup">
                بازگشت
              </a>
            `
          );
        }

        return;
      }

      if (
        req.method==="GET" &&
        path==="/login"
      ) {
        sendHtml(
          res,
          200,
          "ورود",
          `
            <div class="card">
              <form
                method="POST"
                action="/login"
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

                <button class="full">
                  ورود
                </button>

              </form>
            </div>
          `
        );

        return;
      }

      if (
        req.method==="POST" &&
        path==="/login"
      ) {
        const d=await readBody(req);

        const email=(d.get("email")||"")
          .trim()
          .toLowerCase();

        const password=d.get("password")||"";

        const r=await pool.query(
          `
            SELECT
              id,
              name,
              email
            FROM users
            WHERE email=$1
            AND password=$2
          `,
          [
            email,
            hashPassword(password)
          ]
        );

        if(!r.rows.length){
          sendHtml(
            res,
            401,
            "خطا",
            `
              <p class="error">
                ایمیل یا رمز عبور اشتباه است.
              </p>

              <a href="/login">
                تلاش دوباره
              </a>
            `
          );

          return;
        }

        const sid=
          await createSession(
            r.rows[0].id
          );

        redirect(
          res,
          "/",
          `sessionId=${encodeURIComponent(
            sid
          )}; HttpOnly; Path=/; SameSite=Lax`
        );

        return;
      }

      if (!user) {
        if (
          ["/logout"].includes(path)
        ) {
          redirect(res,"/");
        } else {
          redirect(res,"/login");
        }

        return;
      }

      if (
        req.method==="GET" &&
        path==="/new-post"
      ) {
        sendHtml(
          res,
          200,
          "انتشار پست",
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

                <button class="full">
                  📸 انتشار
                </button>

              </form>
            </div>
          `,
          user
        );

        return;
      }

      if (
        req.method==="POST" &&
        path==="/new-post"
      ) {
        const d=await readBody(req);

        const content=
          (d.get("content")||"").trim();

        if(!content){
          sendHtml(
            res,
            400,
            "خطا",
            `
              <p class="error">
                متن پست خالی است.
              </p>
            `,
            user
          );

          return;
        }

        await pool.query(
          `
            INSERT INTO posts(
              user_id,
              content
            )
            VALUES($1,$2)
          `,
          [
            user.id,
            content
          ]
        );

        redirect(res,"/");
        return;
      }

      if (
        req.method==="GET" &&
        path==="/like"
      ) {
        const postId=
          Number(
            url.searchParams.get("post")
          );

        if(Number.isInteger(postId)){
          const x=
            await pool.query(
              `
                SELECT
                  p.user_id,
                  EXISTS(
                    SELECT 1
                    FROM likes
                    WHERE post_id=$1
                    AND user_id=$2
                  ) liked
                FROM posts p
                WHERE p.id=$1
              `,
              [
                postId,
                user.id
              ]
            );

          if(x.rows.length){
            if(x.rows[0].liked){
              await pool.query(
                `
                  DELETE FROM likes
                  WHERE post_id=$1
                  AND user_id=$2
                `,
                [
                  postId,
                  user.id
                ]
              );
            } else {
              await pool.query(
                `
                  INSERT INTO likes(
                    post_id,
                    user_id
                  )
                  VALUES($1,$2)
                  ON CONFLICT DO NOTHING
                `,
                [
                  postId,
                  user.id
                ]
              );

              await notify(
                x.rows[0].user_id,
                user.id,
                "like",
                postId,
                `${user.name} پست شما را پسندید.`
              );
            }
          }
        }

        redirect(res,"/");
        return;
      }

      if (
        req.method==="GET" &&
        path==="/bookmark"
      ) {
        const postId=
          Number(
            url.searchParams.get("post")
          );

        if(Number.isInteger(postId)){
          const x=
            await pool.query(
              `
                SELECT id
                FROM bookmarks
                WHERE post_id=$1
                AND user_id=$2
              `,
              [
                postId,
                user.id
              ]
            );

          if(x.rows.length){
            await pool.query(
              `
                DELETE FROM bookmarks
                WHERE post_id=$1
                AND user_id=$2
              `,
              [
                postId,
                user.id
              ]
            );
          } else {
            await pool.query(
              `
                INSERT INTO bookmarks(
                  post_id,
                  user_id
                )
                VALUES($1,$2)
                ON CONFLICT DO NOTHING
              `,
              [
                postId,
                user.id
              ]
            );
          }
        }

        redirect(res,"/");
        return;
      }if (
        req.method==="GET" &&
        path==="/post"
      ) {
        const postId =
          Number(
            url.searchParams.get("id")
          );

        if(!Number.isInteger(postId)){
          redirect(res,"/");
          return;
        }

        const r =
          await pool.query(
            `
              SELECT
                p.id,
                p.user_id,
                p.content,
                p.created_at,
                u.name,
                u.email,

                (
                  SELECT COUNT(*)
                  FROM likes l
                  WHERE l.post_id=p.id
                ) AS likes,

                (
                  SELECT COUNT(*)
                  FROM comments c
                  WHERE c.post_id=p.id
                ) AS comments_count

              FROM posts p

              JOIN users u
                ON u.id=p.user_id

              WHERE p.id=$1
            `,
            [postId]
          );

        if(!r.rows.length){
          sendHtml(
            res,
            404,
            "پست پیدا نشد",
            `
              <div class="card">
                <p class="error">
                  پست مورد نظر پیدا نشد.
                </p>
              </div>
            `,
            user
          );

          return;
        }

        const post=r.rows[0];

        const comments =
          await pool.query(
            `
              SELECT
                c.id,
                c.comment,
                c.created_at,
                u.id AS user_id,
                u.name,
                u.email
              FROM comments c
              JOIN users u
                ON u.id=c.user_id
              WHERE c.post_id=$1
              ORDER BY c.created_at ASC
            `,
            [postId]
          );

        let html=`
          <div class="card">

            <div class="profile-head">

              <div class="avatar">
                ${escapeHtml(
                  post.name.charAt(0)
                )}
              </div>

              <div>

                <div class="username">
                  ${escapeHtml(post.name)}
                </div>

                <div class="email">
                  ${escapeHtml(post.email)}
                </div>

                <div class="small">
                  ${new Date(
                    post.created_at
                  ).toLocaleString("fa-IR")}
                </div>

              </div>

            </div>

            <div class="post-text">
              ${escapeHtml(post.content)}
            </div>

            <div class="stats">

              <span>
                ❤️ ${post.likes}
              </span>

              <span>
                💬 ${post.comments_count}
              </span>

            </div>

            <div class="actions">

              <a href="/like?post=${post.id}">
                <button>
                  ❤️ لایک
                </button>
              </a>

              <a href="/">
                <button>
                  🏠 خانه
                </button>
              </a>

            </div>

          </div>

          <div class="card">

            <h3>
              💬 ارسال نظر
            </h3>

            <form
              method="POST"
              action="/comment"
            >

              <input
                type="hidden"
                name="post_id"
                value="${post.id}"
              >

              <textarea
                name="comment"
                maxlength="2000"
                placeholder="نظر خود را بنویسید..."
                required
              ></textarea>

              <button class="full">
                ارسال نظر
              </button>

            </form>

          </div>
        `;

        if(!comments.rows.length){
          html += `
            <div class="card empty">
              هنوز نظری ثبت نشده است.
            </div>
          `;
        } else {
          for(const c of comments.rows){
            html += `
              <div class="card">

                <div class="profile-head">

                  <div class="avatar">
                    ${escapeHtml(
                      c.name.charAt(0)
                    )}
                  </div>

                  <div>
                    <div class="username">
                      ${escapeHtml(c.name)}
                    </div>

                    <div class="small">
                      ${new Date(
                        c.created_at
                      ).toLocaleString("fa-IR")}
                    </div>
                  </div>

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

      if (
        req.method==="POST" &&
        path==="/comment"
      ) {
        const d=
          await readBody(req);

        const postId=
          Number(
            d.get("post_id")
          );

        const comment=
          (d.get("comment")||"")
            .trim();

        if(
          !Number.isInteger(postId) ||
          !comment
        ){
          sendHtml(
            res,
            400,
            "خطا",
            `
              <p class="error">
                اطلاعات نظر معتبر نیست.
              </p>
            `,
            user
          );

          return;
        }

        const post=
          await pool.query(
            `
              SELECT
                user_id
              FROM posts
              WHERE id=$1
            `,
            [postId]
          );

        if(!post.rows.length){
          sendHtml(
            res,
            404,
            "خطا",
            `
              <p class="error">
                پست پیدا نشد.
              </p>
            `,
            user
          );

          return;
        }

        await pool.query(
          `
            INSERT INTO comments(
              post_id,
              user_id,
              comment
            )
            VALUES($1,$2,$3)
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
          `${user.name} روی پست شما نظر داد.`
        );

        redirect(
          res,
          `/post?id=${postId}`
        );

        return;
      }

      if (
        req.method==="GET" &&
        path==="/profile"
      ) {
        const profileId =
          Number(
            url.searchParams.get("id")
          ) || user.id;

        const r =
          await pool.query(
            `
              SELECT
                id,
                name,
                email,
                bio,
                avatar_url,
                created_at
              FROM users
              WHERE id=$1
            `,
            [profileId]
          );

        if(!r.rows.length){
          sendHtml(
            res,
            404,
            "کاربر پیدا نشد",
            `
              <div class="card">
                <p class="error">
                  کاربر پیدا نشد.
                </p>
              </div>
            `,
            user
          );

          return;
        }

        const profile=r.rows[0];

        const followerCount=
          await pool.query(
            `
              SELECT COUNT(*)
              FROM follows
              WHERE following_id=$1
            `,
            [profileId]
          );

        const followingCount=
          await pool.query(
            `
              SELECT COUNT(*)
              FROM follows
              WHERE follower_id=$1
            `,
            [profileId]
          );

        const isFollowing=
          await pool.query(
            `
              SELECT id
              FROM follows
              WHERE follower_id=$1
              AND following_id=$2
            `,
            [
              user.id,
              profileId
            ]
          );

        const posts=
          await pool.query(
            `
              SELECT
                id,
                content,
                created_at
              FROM posts
              WHERE user_id=$1
              ORDER BY created_at DESC
              LIMIT 100
            `,
            [profileId]
          );

        let html=`
          <div class="card">

            <div class="profile-head">

              <div class="avatar">
                ${escapeHtml(
                  profile.name.charAt(0)
                )}
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

            ${
              profile.bio
                ? `
                  <div class="post-text">
                    ${escapeHtml(profile.bio)}
                  </div>
                `
                : ""
            }

            <div class="stats">

              <span>
                👥 دنبال‌کننده:
                ${followerCount.rows[0].count}
              </span>

              <span>
                ➡️ دنبال‌شونده:
                ${followingCount.rows[0].count}
              </span>

            </div>

            ${
              profileId !== user.id
                ? `
                  <div class="actions">
                    <a href="/follow?user=${profileId}">
                      <button class="follow">
                        ${
                          isFollowing.rows.length
                            ? "❌ لغو دنبال کردن"
                            : "➕ دنبال کردن"
                        }
                      </button>
                    </a>

                    <a href="/messages?user=${profileId}">
                      <button>
                        💬 پیام
                      </button>
                    </a>

                    <a href="/block?user=${profileId}">
                      <button class="danger">
                        🚫 مسدود کردن
                      </button>
                    </a>
                  </div>
                `
                : ""
            }

          </div>
        `;

        if(!posts.rows.length){
          html += `
            <div class="card empty">
              هنوز پستی منتشر نشده است.
            </div>
          `;
        } else {
          for(const p of posts.rows){
            html += `
              <div class="card">

                <div class="small">
                  ${new Date(
                    p.created_at
                  ).toLocaleString("fa-IR")}
                </div>

                <div class="post-text">
                  ${escapeHtml(p.content)}
                </div>

                <a href="/post?id=${p.id}">
                  <button>
                    💬 مشاهده پست
                  </button>
                </a>

              </div>
            `;
          }
        }

        sendHtml(
          res,
          200,
          "پروفایل",
          html,
          user
        );

        return;
      }if (
        req.method==="GET" &&
        path==="/follow"
      ) {
        const targetId =
          Number(
            url.searchParams.get("user")
          );

        if (
          !Number.isInteger(targetId) ||
          targetId === user.id
        ) {
          redirect(res,"/");
          return;
        }

        const target =
          await pool.query(
            `
              SELECT id
              FROM users
              WHERE id=$1
            `,
            [targetId]
          );

        if(!target.rows.length){
          redirect(res,"/");
          return;
        }

        const existing =
          await pool.query(
            `
              SELECT id
              FROM follows
              WHERE follower_id=$1
              AND following_id=$2
            `,
            [
              user.id,
              targetId
            ]
          );

        if(existing.rows.length){
          await pool.query(
            `
              DELETE FROM follows
              WHERE follower_id=$1
              AND following_id=$2
            `,
            [
              user.id,
              targetId
            ]
          );
        } else {
          await pool.query(
            `
              INSERT INTO follows(
                follower_id,
                following_id
              )
              VALUES($1,$2)
              ON CONFLICT DO NOTHING
            `,
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
            `${user.name} شما را دنبال کرد.`
          );
        }

        redirect(
          res,
          `/profile?id=${targetId}`
        );

        return;
      }

      if (
        req.method==="GET" &&
        path==="/search"
      ) {
        const q =
          (url.searchParams.get("q")||"")
            .trim();

        let html=`
          <div class="card">

            <h2>
              🔎 جستجوی کاربران
            </h2>

            <form method="GET" action="/search">

              <input
                name="q"
                value="${escapeHtml(q)}"
                placeholder="نام یا ایمیل..."
              >

              <button class="full">
                جستجو
              </button>

            </form>

          </div>
        `;

        if(q){
          const results=
            await pool.query(
              `
                SELECT
                  id,
                  name,
                  email,
                  bio
                FROM users
                WHERE
                  name ILIKE $1
                  OR email ILIKE $1
                ORDER BY name
                LIMIT 50
              `,
              [`%${q}%`]
            );

          if(!results.rows.length){
            html += `
              <div class="card empty">
                نتیجه‌ای پیدا نشد.
              </div>
            `;
          } else {
            for(const u of results.rows){
              html += `
                <div class="card">

                  <div class="profile-head">

                    <div class="avatar">
                      ${escapeHtml(
                        u.name.charAt(0)
                      )}
                    </div>

                    <div>
                      <div class="username">
                        ${escapeHtml(u.name)}
                      </div>

                      <div class="email">
                        ${escapeHtml(u.email)}
                      </div>

                      ${
                        u.bio
                          ? `
                            <div class="small">
                              ${escapeHtml(u.bio)}
                            </div>
                          `
                          : ""
                      }
                    </div>

                  </div>

                  <div class="actions">
                    <a href="/profile?id=${u.id}">
                      <button>
                        👤 مشاهده پروفایل
                      </button>
                    </a>
                  </div>

                </div>
              `;
            }
          }
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

      if (
        req.method==="GET" &&
        path==="/messages"
      ) {
        const otherId =
          Number(
            url.searchParams.get("user")
          );

        if(
          Number.isInteger(otherId) &&
          otherId !== user.id
        ){
          const other =
            await pool.query(
              `
                SELECT
                  id,
                  name,
                  email
                FROM users
                WHERE id=$1
              `,
              [otherId]
            );

          if(!other.rows.length){
            redirect(res,"/messages");
            return;
          }

          const messages =
            await pool.query(
              `
                SELECT
                  m.id,
                  m.sender_id,
                  m.receiver_id,
                  m.message,
                  m.created_at,
                  u.name
                FROM messages m
                JOIN users u
                  ON u.id=m.sender_id
                WHERE
                  (
                    m.sender_id=$1
                    AND m.receiver_id=$2
                  )
                  OR
                  (
                    m.sender_id=$2
                    AND m.receiver_id=$1
                  )
                ORDER BY m.created_at ASC
                LIMIT 200
              `,
              [
                user.id,
                otherId
              ]
            );

          let html=`
            <div class="card">

              <h2>
                💬 گفتگو با
                ${escapeHtml(
                  other.rows[0].name
                )}
              </h2>

              <form
                method="POST"
                action="/messages"
              >

                <input
                  type="hidden"
                  name="receiver_id"
                  value="${otherId}"
                >

                <textarea
                  name="message"
                  maxlength="3000"
                  placeholder="پیام..."
                  required
                ></textarea>

                <button class="full">
                  ارسال پیام
                </button>

              </form>

            </div>
          `;

          if(!messages.rows.length){
            html += `
              <div class="card empty">
                هنوز پیامی وجود ندارد.
              </div>
            `;
          } else {
            for(const m of messages.rows){
              html += `
                <div class="card">

                  <div class="username">
                    ${escapeHtml(m.name)}
                  </div>

                  <div class="small">
                    ${new Date(
                      m.created_at
                    ).toLocaleString("fa-IR")}
                  </div>

                  <div class="post-text">
                    ${escapeHtml(m.message)}
                  </div>

                </div>
              `;
            }
          }

          sendHtml(
            res,
            200,
            "پیام‌ها",
            html,
            user
          );

          return;
        }

        const contacts =
          await pool.query(
            `
              SELECT DISTINCT
                u.id,
                u.name,
                u.email
              FROM users u
              WHERE u.id IN(
                SELECT receiver_id
                FROM messages
                WHERE sender_id=$1

                UNION

                SELECT sender_id
                FROM messages
                WHERE receiver_id=$1
              )
              ORDER BY u.name
            `,
            [user.id]
          );

        let html=`
          <div class="card">
            <h2>
              💬 پیام‌ها
            </h2>

            <p class="small">
              برای شروع گفتگو، پروفایل یک کاربر را باز کنید.
            </p>
          </div>
        `;

        if(!contacts.rows.length){
          html += `
            <div class="card empty">
              هنوز گفتگویی ندارید.
            </div>
          `;
        } else {
          for(const c of contacts.rows){
            html += `
              <div class="card">

                <div class="profile-head">

                  <div class="avatar">
                    ${escapeHtml(
                      c.name.charAt(0)
                    )}
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

                <div class="actions">
                  <a href="/messages?user=${c.id}">
                    <button>
                      💬 باز کردن گفتگو
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
          "پیام‌ها",
          html,
          user
        );

        return;
      }

      if (
        req.method==="POST" &&
        path==="/messages"
      ) {
        const d=
          await readBody(req);

        const receiverId=
          Number(
            d.get("receiver_id")
          );

        const message=
          (d.get("message")||"")
            .trim();

        if(
          !Number.isInteger(receiverId) ||
          receiverId === user.id ||
          !message
        ){
          redirect(res,"/messages");
          return;
        }

        const receiver =
          await pool.query(
            `
              SELECT id
              FROM users
              WHERE id=$1
            `,
            [receiverId]
          );

        if(!receiver.rows.length){
          redirect(res,"/messages");
          return;
        }

        await pool.query(
          `
            INSERT INTO messages(
              sender_id,
              receiver_id,
              message
            )
            VALUES($1,$2,$3)
          `,
          [
            user.id,
            receiverId,
            message
          ]
        );

        await notify(
          receiverId,
          user.id,
          "message",
          null,
          `${user.name} برای شما پیام فرستاد.`
        );

        redirect(
          res,
          `/messages?user=${receiverId}`
        );

        return;
      }if (
        req.method==="GET" &&
        path==="/notifications"
      ) {
        const notifications =
          await pool.query(
            `
              SELECT
                n.id,
                n.type,
                n.message,
                n.is_read,
                n.created_at,
                u.name AS actor_name
              FROM notifications n
              LEFT JOIN users u
                ON u.id=n.actor_id
              WHERE n.user_id=$1
              ORDER BY n.created_at DESC
              LIMIT 100
            `,
            [user.id]
          );

        await pool.query(
          `
            UPDATE notifications
            SET is_read=TRUE
            WHERE user_id=$1
          `,
          [user.id]
        );

        let html=`
          <div class="card">
            <h2>
              🔔 اعلان‌ها
            </h2>
          </div>
        `;

        if(!notifications.rows.length){
          html += `
            <div class="card empty">
              اعلان جدیدی ندارید.
            </div>
          `;
        } else {
          for(
            const n of notifications.rows
          ){
            html += `
              <div class="card">

                <div class="username">
                  ${escapeHtml(
                    n.actor_name || "سیستم"
                  )}
                </div>

                <div class="post-text">
                  ${escapeHtml(n.message)}
                </div>

                <div class="small">
                  ${new Date(
                    n.created_at
                  ).toLocaleString("fa-IR")}
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

      if (
        req.method==="GET" &&
        path==="/saved"
      ) {
        const saved =
          await pool.query(
            `
              SELECT
                p.id,
                p.content,
                p.created_at,
                u.id AS user_id,
                u.name,
                u.email
              FROM bookmarks b

              JOIN posts p
                ON p.id=b.post_id

              JOIN users u
                ON u.id=p.user_id

              WHERE b.user_id=$1

              ORDER BY b.created_at DESC

              LIMIT 100
            `,
            [user.id]
          );

        let html=`
          <div class="card">
            <h2>
              🔖 پست‌های ذخیره‌شده
            </h2>
          </div>
        `;

        if(!saved.rows.length){
          html += `
            <div class="card empty">
              هنوز پستی ذخیره نکرده‌اید.
            </div>
          `;
        } else {
          for(
            const p of saved.rows
          ){
            html += `
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

                    <div class="small">
                      ${new Date(
                        p.created_at
                      ).toLocaleString("fa-IR")}
                    </div>
                  </div>

                </div>

                <div class="post-text">
                  ${escapeHtml(p.content)}
                </div>

                <div class="actions">

                  <a href="/post?id=${p.id}">
                    <button>
                      مشاهده پست
                    </button>
                  </a>

                  <a href="/bookmark?post=${p.id}">
                    <button>
                      ❌ حذف از ذخیره‌ها
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
          "ذخیره‌ها",
          html,
          user
        );

        return;
      }

      if (
        req.method==="GET" &&
        path==="/report"
      ) {
        const postId =
          Number(
            url.searchParams.get("post")
          );

        const reportedUserId =
          Number(
            url.searchParams.get("user")
          );

        if(
          !Number.isInteger(postId) &&
          !Number.isInteger(
            reportedUserId
          )
        ){
          redirect(res,"/");
          return;
        }

        sendHtml(
          res,
          200,
          "گزارش",
          `
            <div class="card">

              <h2>
                🚩 گزارش محتوا
              </h2>

              <form
                method="POST"
                action="/report"
              >

                <input
                  type="hidden"
                  name="post_id"
                  value="${
                    Number.isInteger(postId)
                      ? postId
                      : ""
                  }"
                >

                <input
                  type="hidden"
                  name="reported_user_id"
                  value="${
                    Number.isInteger(
                      reportedUserId
                    )
                      ? reportedUserId
                      : ""
                  }"
                >

                <textarea
                  name="reason"
                  maxlength="1000"
                  placeholder="دلیل گزارش..."
                  required
                ></textarea>

                <button
                  class="full danger"
                >
                  ارسال گزارش
                </button>

              </form>

            </div>
          `,
          user
        );

        return;
      }

      if (
        req.method==="POST" &&
        path==="/report"
      ) {
        const d=
          await readBody(req);

        const postId =
          Number(
            d.get("post_id")
          );

        const reportedUserId =
          Number(
            d.get("reported_user_id")
          );

        const reason =
          (d.get("reason")||"")
            .trim();

        if(
          !reason ||
          (
            !Number.isInteger(postId) &&
            !Number.isInteger(
              reportedUserId
            )
          )
        ){
          redirect(res,"/");
          return;
        }

        await pool.query(
          `
            INSERT INTO reports(
              reporter_id,
              reported_user_id,
              post_id,
              reason
            )
            VALUES($1,$2,$3,$4)
          `,
          [
            user.id,
            Number.isInteger(
              reportedUserId
            )
              ? reportedUserId
              : null,
            Number.isInteger(postId)
              ? postId
              : null,
            reason
          ]
        );

        sendHtml(
          res,
          200,
          "گزارش ثبت شد",
          `
            <div class="card">

              <h2 class="success">
                گزارش شما ثبت شد ✅
              </h2>

              <a href="/">
                بازگشت به خانه
              </a>

            </div>
          `,
          user
        );

        return;
      }

      if (
        req.method==="GET" &&
        path==="/block"
      ) {
        const targetId =
          Number(
            url.searchParams.get("user")
          );

        if(
          !Number.isInteger(targetId) ||
          targetId === user.id
        ){
          redirect(res,"/");
          return;
        }

        const target =
          await pool.query(
            `
              SELECT
                id,
                name
              FROM users
              WHERE id=$1
            `,
            [targetId]
          );

        if(!target.rows.length){
          redirect(res,"/");
          return;
        }

        const existing =
          await pool.query(
            `
              SELECT id
              FROM blocked_users
              WHERE blocker_id=$1
              AND blocked_id=$2
            `,
            [
              user.id,
              targetId
            ]
          );

        if(existing.rows.length){
          await pool.query(
            `
              DELETE FROM blocked_users
              WHERE blocker_id=$1
              AND blocked_id=$2
            `,
            [
              user.id,
              targetId
            ]
          );
        } else {
          await pool.query(
            `
              INSERT INTO blocked_users(
                blocker_id,
                blocked_id
              )
              VALUES($1,$2)
              ON CONFLICT DO NOTHING
            `,
            [
              user.id,
              targetId
            ]
          );

          await pool.query(
            `
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
            `,
            [
              user.id,
              targetId
            ]
          );
        }

        redirect(res,"/");
        return;
      }

      if (
        req.method==="GET" &&
        path==="/jobs"
      ) {
        const jobs =
          await pool.query(
            `
              SELECT
                j.id,
                j.user_id,
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
            `
          );

        let html=`
          <div class="card">

            <h2>
              💼 کاریابی
            </h2>

            <a href="/new-job">
              <button>
                ➕ ثبت آگهی کار
              </button>
            </a>

          </div>
        `;

        if(!jobs.rows.length){
          html += `
            <div class="card empty">
              هنوز آگهی کاری ثبت نشده است.
            </div>
          `;
        } else {
          for(
            const j of jobs.rows
          ){
            html += `
              <div class="card">

                <div class="job-title">
                  ${escapeHtml(j.title)}
                </div>

                <div class="job-city">
                  📍 شهر:
                  ${escapeHtml(j.city)}
                </div>

                <div class="job-salary">
                  💰 حقوق:
                  ${escapeHtml(j.salary)}
                </div>

                <div class="job-description">
                  ${escapeHtml(j.description)}
                </div>

                <div class="small">
                  منتشرکننده:
                  ${escapeHtml(j.name)}
                </div>

                <div class="small">
                  ${new Date(
                    j.created_at
                  ).toLocaleString("fa-IR")}
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
      }if (
        req.method==="GET" &&
        path==="/new-job"
      ) {
        sendHtml(
          res,
          200,
          "ثبت آگهی کار",
          `
            <div class="card">

              <h2>
                ➕ ثبت آگهی کار
              </h2>

              <form
                method="POST"
                action="/new-job"
              >

                <input
                  name="title"
                  maxlength="200"
                  placeholder="عنوان شغل"
                  required
                >

                <input
                  name="city"
                  maxlength="100"
                  placeholder="شهر"
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
                  maxlength="5000"
                  placeholder="توضیحات شغل..."
                  required
                ></textarea>

                <button class="full">
                  📢 انتشار آگهی
                </button>

              </form>

            </div>
          `,
          user
        );

        return;
      }

      if (
        req.method==="POST" &&
        path==="/new-job"
      ) {
        const d=
          await readBody(req);

        const title=
          (d.get("title")||"")
            .trim();

        const city=
          (d.get("city")||"")
            .trim();

        const salary=
          (d.get("salary")||"")
            .trim();

        const description=
          (d.get("description")||"")
            .trim();

        if(
          !title ||
          !city ||
          !salary ||
          !description
        ){
          sendHtml(
            res,
            400,
            "خطا",
            `
              <div class="card">
                <p class="error">
                  همه فیلدها را کامل کنید.
                </p>
              </div>
            `,
            user
          );

          return;
        }

        await pool.query(
          `
            INSERT INTO jobs(
              user_id,
              title,
              city,
              salary,
              description
            )
            VALUES($1,$2,$3,$4,$5)
          `,
          [
            user.id,
            title,
            city,
            salary,
            description
          ]
        );

        redirect(
          res,
          "/jobs"
        );

        return;
      }

      if (
        req.method==="GET" &&
        path==="/settings"
      ) {
        const r=
          await pool.query(
            `
              SELECT
                name,
                email,
                bio,
                avatar_url
              FROM users
              WHERE id=$1
            `,
            [user.id]
          );

        const profile=
          r.rows[0] || user;

        sendHtml(
          res,
          200,
          "تنظیمات",
          `
            <div class="card">

              <h2>
                ⚙️ تنظیمات پروفایل
              </h2>

              <form
                method="POST"
                action="/settings"
              >

                <input
                  name="name"
                  maxlength="100"
                  value="${escapeHtml(
                    profile.name
                  )}"
                  placeholder="نام"
                  required
                >

                <input
                  name="bio"
                  maxlength="1000"
                  value="${escapeHtml(
                    profile.bio || ""
                  )}"
                  placeholder="درباره من"
                >

                <input
                  name="avatar_url"
                  maxlength="2000"
                  value="${escapeHtml(
                    profile.avatar_url || ""
                  )}"
                  placeholder="لینک تصویر پروفایل"
                >

                <button class="full">
                  💾 ذخیره تغییرات
                </button>

              </form>

            </div>
          `,
          user
        );

        return;
      }

      if (
        req.method==="POST" &&
        path==="/settings"
      ) {
        const d=
          await readBody(req);

        const name=
          (d.get("name")||"")
            .trim();

        const bio=
          (d.get("bio")||"")
            .trim();

        const avatarUrl=
          (d.get("avatar_url")||"")
            .trim();

        if(!name){
          sendHtml(
            res,
            400,
            "خطا",
            `
              <div class="card">
                <p class="error">
                  نام نمی‌تواند خالی باشد.
                </p>
              </div>
            `,
            user
          );

          return;
        }

        await pool.query(
          `
            UPDATE users
            SET
              name=$1,
              bio=$2,
              avatar_url=$3
            WHERE id=$4
          `,
          [
            name,
            bio,
            avatarUrl,
            user.id
          ]
        );

        redirect(
          res,
          "/profile"
        );

        return;
      }

      if (
        req.method==="GET" &&
        path==="/delete-post"
      ) {
        const postId=
          Number(
            url.searchParams.get("id")
          );

        if(Number.isInteger(postId)){
          await pool.query(
            `
              DELETE FROM posts
              WHERE id=$1
              AND user_id=$2
            `,
            [
              postId,
              user.id
            ]
          );
        }

        redirect(
          res,
          "/"
        );

        return;
      }

      if (
        req.method==="GET" &&
        path==="/delete-job"
      ) {
        const jobId=
          Number(
            url.searchParams.get("id")
          );

        if(Number.isInteger(jobId)){
          await pool.query(
            `
              DELETE FROM jobs
              WHERE id=$1
              AND user_id=$2
            `,
            [
              jobId,
              user.id
            ]
          );
        }

        redirect(
          res,
          "/jobs"
        );

        return;
      }

      if (
        req.method==="GET" &&
        path==="/logout"
      ) {
        const cookies=
          parseCookies(req);

        if(cookies.sessionId){
          await pool.query(
            `
              DELETE FROM sessions
              WHERE session_id=$1
            `,
            [cookies.sessionId]
          );
        }

        redirect(
          res,
          "/login",
          "sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
        );

        return;
      }

      sendHtml(
        res,
        404,
        "صفحه پیدا نشد",
        `
          <div class="card empty">

            <h2>
              404
            </h2>

            <p>
              صفحه مورد نظر پیدا نشد.
            </p>

            <a href="/">
              <button>
                🏠 بازگشت به خانه
              </button>
            </a>

          </div>
        `,
        user
      );

    } catch(error) {

      console.error(
        "REQUEST ERROR:",
        error
      );

      if(!res.headersSent){
        sendHtml(
          res,
          500,
          "خطای سرور",
          `
            <div class="card">

              <h2 class="error">
                خطای داخلی سرور
              </h2>

              <p>
                لطفاً دوباره تلاش کنید.
              </p>

              <a href="/">
                بازگشت
              </a>

            </div>
          `,
          null
        );
      } else {
        res.end();
      }
    }
  }
);

async function startServer(){

  try{

    await createTables();

    await pool.query(
      "SELECT 1"
    );

    server.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `Server running on port ${PORT}`
        );
      }
    );

  }catch(error){

    console.error(
      "STARTUP ERROR:",
      error
    );

    process.exit(1);
  }
}

startServer();
