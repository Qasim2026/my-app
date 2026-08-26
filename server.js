// ==================================
// پروفایل
// ==================================

if (
  req.method === "GET" &&
  req.url === "/profile"
) {

  const user =
    await getSession(req);

  if (!user) {

    redirect(
      res,
      "/login"
    );

    return;
  }

  sendHtml(
    res,
    200,
    "پروفایل",
    `

    <h2>
      پروفایل 👤
    </h2>

    <div class="divider"></div>

    <div class="profile-box">

      <p>
        <strong>
          نام:
        </strong>

        ${escapeHtml(user.name)}
      </p>

      <p>
        <strong>
          ایمیل:
        </strong>

        ${escapeHtml(user.email)}
      </p>

      <p>
        <strong>
          شناسه کاربر:
        </strong>

        ${escapeHtml(user.id)}
      </p>

    </div>

    <div class="divider"></div>

    <h3>
      ویرایش پروفایل ✏️
    </h3>

    <form
      method="POST"
      action="/profile"
    >

      <input
        name="name"
        placeholder="نام جدید"
        value="${escapeHtml(user.name)}"
        maxlength="100"
        required
      >

      <input
        name="email"
        type="email"
        placeholder="ایمیل جدید"
        value="${escapeHtml(user.email)}"
        maxlength="200"
        required
      >

      <button
        type="submit"
        class="main-button"
      >
        ذخیره تغییرات 💾
      </button>

    </form>

    <a href="/">
      <button class="main-button">
        صفحه اصلی
      </button>
    </a>

    `
  );

  return;
}

// ==================================
// ذخیره تغییرات پروفایل
// ==================================

if (
  req.method === "POST" &&
  req.url === "/profile"
) {

  const user =
    await getSession(req);

  if (!user) {

    redirect(
      res,
      "/login"
    );

    return;
  }

  const data =
    await readBody(req);

  const name =
    (data.get("name") || "")
      .trim();

  const email =
    (data.get("email") || "")
      .trim()
      .toLowerCase();

  if (!name || !email) {

    sendHtml(
      res,
      400,
      "خطا",
      `

      <h2 class="error">
        اطلاعات ناقص است
      </h2>

      <p>
        نام و ایمیل را کامل وارد کن.
      </p>

      <a href="/profile">
        بازگشت به پروفایل
      </a>

      `
    );

    return;
  }

  if (name.length > 100) {

    sendHtml(
      res,
      400,
      "خطا",
      `

      <h2 class="error">
        نام بیش از حد طولانی است.
      </h2>

      <a href="/profile">
        بازگشت
      </a>

      `
    );

    return;
  }

  if (email.length > 200) {

    sendHtml(
      res,
      400,
      "خطا",
      `

      <h2 class="error">
        ایمیل بیش از حد طولانی است.
      </h2>

      <a href="/profile">
        بازگشت
      </a>

      `
    );

    return;
  }

  try {

    await pool.query(
      `
      UPDATE users
      SET
        name = $1,
        email = $2
      WHERE id = $3
      `,
      [
        name,
        email,
        user.id
      ]
    );

    sendHtml(
      res,
      200,
      "پروفایل به‌روزرسانی شد",
      `

      <h2 class="success">
        تغییرات ذخیره شد ✅
      </h2>

      <p>
        اطلاعات پروفایل شما با موفقیت به‌روزرسانی شد.
      </p>

      <a href="/profile">
        <button class="main-button">
          مشاهده پروفایل
        </button>
      </a>

      <a href="/">
        <button class="main-button">
          صفحه اصلی
        </button>
      </a>

      `
    );

  } catch (error) {

    console.error(
      "Profile update error:",
      error
    );

    if (
      error.code === "23505"
    ) {

      sendHtml(
        res,
        400,
        "خطا",
        `

        <h2 class="error">
          این ایمیل قبلاً استفاده شده است.
        </h2>

        <p>
          یک ایمیل دیگر وارد کن.
        </p>

        <a href="/profile">
          بازگشت به پروفایل
        </a>

        `
      );

    } else {

      sendHtml(
        res,
        500,
        "خطا",
        `

        <h2 class="error">
          ذخیره تغییرات انجام نشد.
        </h2>

        <p>
          لطفاً دوباره تلاش کن.
        </p>

        <a href="/profile">
          بازگشت
        </a>

        `
      );
    }
  }

  return;
}
