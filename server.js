const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database Setup ────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'luxe.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS enquiries (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    email     TEXT    NOT NULL,
    message   TEXT    NOT NULL,
    status    TEXT    DEFAULT 'new',       -- new | read | replied
    ip        TEXT,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token      TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  );
`);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));          // tighten to your domain in production
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate-limit contact form: max 5 requests per 15 min per IP
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many submissions. Try again later.' }
});

// ─── Simple token auth helper ──────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'luxe@admin2026'; // change in production!

function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const row = db.prepare('SELECT token FROM admin_sessions WHERE token = ?').get(token);
  if (!row) return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  next();
}

// ─── PUBLIC ROUTES ─────────────────────────────────────────────────────────────

// POST /api/contact  — save an enquiry from the contact form
app.post('/api/contact', contactLimiter, (req, res) => {
  const { name, email, message } = req.body;

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ success: false, error: 'All fields are required.' });
  }

  // Basic email format check
  const emailRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRE.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email address.' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  db.prepare(
    'INSERT INTO enquiries (name, email, message, ip) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), email.trim(), message.trim(), ip);

  res.json({ success: true, message: 'Your message has been received. We\'ll be in touch within 24 hours!' });
});

// ─── ADMIN ROUTES ──────────────────────────────────────────────────────────────

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Wrong password.' });
  }

  // Generate a simple random token
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  db.prepare('INSERT INTO admin_sessions (token) VALUES (?)').run(token);

  res.json({ success: true, token });
});

// POST /api/admin/logout
app.post('/api/admin/logout', requireAuth, (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
  res.json({ success: true });
});

// GET /api/admin/enquiries  — list all enquiries (newest first)
app.get('/api/admin/enquiries', requireAuth, (req, res) => {
  const { status, search, page = 1 } = req.query;
  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;

  let query = 'WHERE 1=1';
  const params = [];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }

  if (search) {
    query += ' AND (name LIKE ? OR email LIKE ? OR message LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM enquiries ${query}`).get(...params).cnt;
  const rows  = db.prepare(`SELECT * FROM enquiries ${query} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

  res.json({ success: true, total, page: parseInt(page), pages: Math.ceil(total / limit), data: rows });
});

// PATCH /api/admin/enquiries/:id/status  — mark as read / replied
app.patch('/api/admin/enquiries/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  if (!['new', 'read', 'replied'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status.' });
  }
  const info = db.prepare('UPDATE enquiries SET status = ? WHERE id = ?').run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ success: false, error: 'Not found.' });
  res.json({ success: true });
});

// DELETE /api/admin/enquiries/:id
app.delete('/api/admin/enquiries/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM enquiries WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ success: false, error: 'Not found.' });
  res.json({ success: true });
});

// GET /api/admin/stats  — dashboard summary numbers
app.get('/api/admin/stats', requireAuth, (req, res) => {
  const total   = db.prepare('SELECT COUNT(*) as n FROM enquiries').get().n;
  const newOnes = db.prepare("SELECT COUNT(*) as n FROM enquiries WHERE status='new'").get().n;
  const read    = db.prepare("SELECT COUNT(*) as n FROM enquiries WHERE status='read'").get().n;
  const replied = db.prepare("SELECT COUNT(*) as n FROM enquiries WHERE status='replied'").get().n;

  // Last 7 days trend
  const trend = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as cnt
    FROM enquiries
    WHERE created_at >= date('now','-6 days')
    GROUP BY day ORDER BY day
  `).all();

  res.json({ success: true, stats: { total, new: newOnes, read, replied }, trend });
});

// ─── Serve admin dashboard SPA ─────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, error: 'Route not found.' }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✦ Luxe Interior Backend running at http://localhost:${PORT}`);
  console.log(`  Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`  Admin password : ${ADMIN_PASSWORD}\n`);
});
