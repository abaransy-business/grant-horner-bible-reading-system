import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './db.js';

const PgSession = connectPgSimple(session);
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.urlencoded({ extended: false }));

app.use(session({
  store: new PgSession({ pool }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 10 * 365 * 24 * 60 * 60 * 1000 },
}));

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user) return done(null, false);
    const match = await bcrypt.compare(password, user.password_hash);
    return done(null, match ? user : false);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, rows[0] || false);
  } catch (err) {
    done(err);
  }
});

app.use(passport.initialize());
app.use(passport.session());

const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
};

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.sendFile(join(__dirname, 'login.html'));
});

app.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login?error=invalid',
}));

app.get('/signup', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.sendFile(join(__dirname, 'signup.html'));
});

app.post('/signup', async (req, res, next) => {
  const { username, password, password_confirm } = req.body;
  if (password !== password_confirm) return res.redirect('/signup?error=mismatch');
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, chapter_code) VALUES ($1, $2, $3) RETURNING *',
      [username, hash, '0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0'],
    );
    await new Promise((resolve, reject) =>
      req.login(rows[0], (err) => (err ? reject(err) : resolve())),
    );
    res.redirect('/');
  } catch (err) {
    if (err.code === '23505') return res.redirect('/signup?error=taken');
    next(err);
  }
});

app.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

app.get('/', requireAuth, (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

app.get('/api/chapter-code', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT chapter_code FROM users WHERE id = $1', [req.user.id]);
    const chapterCode = rows[0]?.chapter_code ?? '0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0';
    res.json({ chapterCode });
  } catch (err) {
    next(err);
  }
});

app.post('/api/chapter-code', requireAuth, express.json(), async (req, res, next) => {
  try {
    await pool.query('UPDATE users SET chapter_code = $1 WHERE id = $2', [req.body.chapterCode, req.user.id]);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

app.use(express.static(__dirname, { index: false }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
