import "dotenv/config";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db.js";

const PgSession = connectPgSimple(session);
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

const indexHtml = readFileSync(join(__dirname, "index.html"), "utf8");

app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    store: new PgSession({ pool }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 10 * 365 * 24 * 60 * 60 * 1000 },
  }),
);

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM users WHERE username = $1",
        [username.toLowerCase()],
      );
      const user = rows[0];
      if (!user) return done(null, false);
      const match = await bcrypt.compare(password, user.password_hash);
      return done(null, match ? user : false);
    } catch (err) {
      return done(err);
    }
  }),
);

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [
      id,
    ]);
    done(null, rows[0] || false);
  } catch (err) {
    done(err);
  }
});

app.use(passport.initialize());
app.use(passport.session());

const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
};

app.get("/", (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/app");
  res.sendFile(join(__dirname, "home.html"));
});

app.get("/login", (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/app");
  res.sendFile(join(__dirname, "login.html"));
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/app",
    failureRedirect: "/login?error=invalid",
  }),
);

app.get("/signup", (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/app");
  res.sendFile(join(__dirname, "signup.html"));
});

app.post("/signup", async (req, res, next) => {
  const { username: rawUsername, password, password_confirm } = req.body;
  const username = rawUsername.toLowerCase();
  if (password !== password_confirm)
    return res.redirect("/signup?error=mismatch");
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      "INSERT INTO users (username, password_hash, chapter_code) VALUES ($1, $2, $3) RETURNING *",
      [username, hash, "0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0"],
    );
    await new Promise((resolve, reject) =>
      req.login(rows[0], (err) => (err ? reject(err) : resolve())),
    );
    res.redirect("/app");
  } catch (err) {
    if (err.code === "23505") return res.redirect("/signup?error=taken");
    next(err);
  }
});

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/login");
  });
});

app.get("/app", requireAuth, (req, res) => {
  const theme = req.user.theme ?? "dark";
  res
    .type("html")
    .send(
      indexHtml.replace('data-bs-theme="dark"', `data-bs-theme="${theme}"`),
    );
});

app.get("/api/chapter-code", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT chapter_code, theme, font_size FROM users WHERE id = $1",
      [req.user.id],
    );
    const chapterCode =
      rows[0]?.chapter_code ?? "0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0";
    const theme = rows[0]?.theme ?? "dark";
    const fontSize = rows[0]?.font_size ?? 18;
    res.json({ chapterCode, theme, fontSize });
  } catch (err) {
    next(err);
  }
});

app.post("/api/theme", requireAuth, express.json(), async (req, res, next) => {
  try {
    await pool.query("UPDATE users SET theme = $1 WHERE id = $2", [
      req.body.theme,
      req.user.id,
    ]);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

app.post(
  "/api/font-size",
  requireAuth,
  express.json(),
  async (req, res, next) => {
    try {
      await pool.query("UPDATE users SET font_size = $1 WHERE id = $2", [
        req.body.fontSize,
        req.user.id,
      ]);
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  "/api/chapter-code",
  requireAuth,
  express.json(),
  async (req, res, next) => {
    try {
      await pool.query("UPDATE users SET chapter_code = $1 WHERE id = $2", [
        req.body.chapterCode,
        req.user.id,
      ]);
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  },
);

app.get("/api/highlights/all", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, chapter_code, selected_text, color FROM highlights WHERE user_id = $1 ORDER BY chapter_code, created_at",
      [req.user.id],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.get("/api/highlights", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, selected_text, color FROM highlights WHERE user_id = $1 AND chapter_code = $2",
      [req.user.id, req.query.chapterCode],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post(
  "/api/highlights",
  requireAuth,
  express.json(),
  async (req, res, next) => {
    try {
      const { chapterCode, selectedText, color } = req.body;
      const { rows } = await pool.query(
        "INSERT INTO highlights (user_id, chapter_code, selected_text, color) VALUES ($1, $2, $3, $4) RETURNING id",
        [req.user.id, chapterCode, selectedText, color],
      );
      res.json({ id: rows[0].id });
    } catch (err) {
      next(err);
    }
  },
);

app.delete("/api/highlights/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM highlights WHERE id = $1 AND user_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

app.post(
  "/api/advance",
  requireAuth,
  express.json(),
  async (req, res, next) => {
    const { newChapterCode, bookCompletion, listCompletion } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT position, max_position FROM users WHERE id = $1 FOR UPDATE",
        [req.user.id],
      );
      const { position, max_position } = rows[0];
      const atFrontier = position === max_position;
      if (atFrontier) {
        await client.query(
          `UPDATE users
            SET chapter_code = $1,
                position = position + 1,
                max_position = max_position + 1
          WHERE id = $2`,
          [newChapterCode, req.user.id],
        );
        if (bookCompletion) {
          await client.query(
            `INSERT INTO book_completions (user_id, list_index, book_index, count)
           VALUES ($1, $2, $3, 1)
           ON CONFLICT (user_id, list_index, book_index) DO UPDATE
             SET count = book_completions.count + 1, updated_at = NOW()`,
            [req.user.id, bookCompletion.listIndex, bookCompletion.bookIndex],
          );
        }
        if (listCompletion) {
          await client.query(
            `INSERT INTO list_completions (user_id, list_index, count)
           VALUES ($1, $2, 1)
           ON CONFLICT (user_id, list_index) DO UPDATE
             SET count = list_completions.count + 1, updated_at = NOW()`,
            [req.user.id, listCompletion.listIndex],
          );
        }
      } else {
        await client.query(
          `UPDATE users
            SET chapter_code = $1,
                position = position + 1
          WHERE id = $2`,
          [newChapterCode, req.user.id],
        );
      }
      await client.query("COMMIT");
      res.json({
        position: position + 1,
        max_position: atFrontier ? max_position + 1 : max_position,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      next(err);
    } finally {
      client.release();
    }
  },
);

app.post("/api/back", requireAuth, express.json(), async (req, res, next) => {
  const { chapterCode } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT position, max_position FROM users WHERE id = $1 FOR UPDATE",
      [req.user.id],
    );
    const { position, max_position } = rows[0];
    if (position <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "already at start" });
    }
    await client.query(
      `UPDATE users
          SET chapter_code = $1,
              position = position - 1
        WHERE id = $2`,
      [chapterCode, req.user.id],
    );
    await client.query("COMMIT");
    res.json({ position: position - 1, max_position });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

app.get("/api/completions", requireAuth, async (req, res, next) => {
  try {
    const [listsResult, booksResult] = await Promise.all([
      pool.query(
        "SELECT list_index, count FROM list_completions WHERE user_id = $1 ORDER BY list_index",
        [req.user.id],
      ),
      pool.query(
        "SELECT list_index, book_index, count FROM book_completions WHERE user_id = $1 ORDER BY list_index, book_index",
        [req.user.id],
      ),
    ]);
    res.json({ lists: listsResult.rows, books: booksResult.rows });
  } catch (err) {
    next(err);
  }
});

app.post(
  "/api/completions/list",
  requireAuth,
  express.json(),
  async (req, res, next) => {
    try {
      const { listIndex } = req.body;
      await pool.query(
        `INSERT INTO list_completions (user_id, list_index, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, list_index) DO UPDATE
         SET count = list_completions.count + 1, updated_at = NOW()`,
        [req.user.id, listIndex],
      );
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  "/api/completions/book",
  requireAuth,
  express.json(),
  async (req, res, next) => {
    try {
      const { listIndex, bookIndex } = req.body;
      await pool.query(
        `INSERT INTO book_completions (user_id, list_index, book_index, count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (user_id, list_index, book_index) DO UPDATE
         SET count = book_completions.count + 1, updated_at = NOW()`,
        [req.user.id, listIndex, bookIndex],
      );
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  },
);

app.use(express.static(__dirname, { index: false }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
