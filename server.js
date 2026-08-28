async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      theme VARCHAR(20) DEFAULT 'light',
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
      content TEXT DEFAULT '',
      media_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, post_id)
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ==============================
  // مهاجرت دیتابیس قدیمی
  // ==============================

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'light',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE posts
      ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS media_url TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE likes
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE follows
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS token VARCHAR(128);

    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  // ==============================
  // اطمینان از ایندکس‌ها
  // ==============================

  await pool.query(`
    CREATE INDEX IF NOT EXISTS posts_created_at_idx
      ON posts(created_at DESC);

    CREATE INDEX IF NOT EXISTS comments_post_id_idx
      ON comments(post_id);

    CREATE INDEX IF NOT EXISTS messages_created_at_idx
      ON messages(created_at DESC);

    CREATE INDEX IF NOT EXISTS sessions_user_id_idx
      ON sessions(user_id);

    CREATE INDEX IF NOT EXISTS follows_follower_idx
      ON follows(follower_id);

    CREATE INDEX IF NOT EXISTS follows_following_idx
      ON follows(following_id);
  `);

  // ==============================
  // اطمینان از UNIQUE بودن session token
  // ==============================

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_unique_idx
      ON sessions(token)
      WHERE token IS NOT NULL;
  `);

  console.log("DATABASE: tables and migrations ready.");
}
