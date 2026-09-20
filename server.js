const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const RUNTIME_DB_FILE = process.env.VERCEL ? path.join('/tmp', 'fairway-forward-db.json') : DB_FILE;
const staticTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const seed = {
  users: [
    { id: 'user-demo', name: 'Jamie Davis', email: 'jamie@example.com', password: 'password123', plan: 'monthly', charity: 'Mindful Miles', contributionPercent: 10, role: 'member', createdAt: '2024-01-15' },
    { id: 'admin-demo', name: 'Alex Morgan', email: 'admin@example.com', password: 'password123', plan: 'yearly', charity: 'Mindful Miles', contributionPercent: 15, role: 'admin', createdAt: '2024-01-15' }
  ],
  sessions: {},
  scores: [
    { id: 'score-1', userId: 'user-demo', score: 34, date: '2026-04-16' },
    { id: 'score-2', userId: 'user-demo', score: 29, date: '2026-04-05' },
    { id: 'score-3', userId: 'user-demo', score: 37, date: '2026-03-22' }
  ],
  charities: [
    { id: 'mindful-miles', name: 'Mindful Miles', description: 'Mental health through movement', featured: true },
    { id: 'green-table', name: 'The Green Table', description: 'Community food gardens', featured: false },
    { id: 'open-fairways', name: 'Open Fairways', description: 'Accessible golf for all', featured: false }
  ],
  draws: [{ id: 'draw-april-2026', month: 'April 2026', status: 'scheduled', jackpot: 12640, activeMembers: 2480 }],
  winners: [],
  stats: { charityTotal: 15300, pendingReviews: 4 }
};

function ensureDb() {
  fs.mkdirSync(path.dirname(RUNTIME_DB_FILE), { recursive: true });
  if (!fs.existsSync(RUNTIME_DB_FILE)) {
    if (RUNTIME_DB_FILE === DB_FILE) fs.writeFileSync(RUNTIME_DB_FILE, JSON.stringify(seed, null, 2));
    else fs.copyFileSync(DB_FILE, RUNTIME_DB_FILE);
  }
}
function readDb() { ensureDb(); return JSON.parse(fs.readFileSync(RUNTIME_DB_FILE, 'utf8')); }
function writeDb(db) { fs.writeFileSync(RUNTIME_DB_FILE, JSON.stringify(db, null, 2)); }
function id(prefix) { return `${prefix}-${crypto.randomBytes(6).toString('hex')}`; }
function send(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function serveFile(req, res) {
  const requested = req.url === '/' ? 'index.html' : req.url.slice(1).split('?')[0];
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'Not found' });
  res.writeHead(200, { 'Content-Type': staticTypes[path.extname(file)] || 'text/plain; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
}
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 1e6) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function currentUser(req, db) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const userId = db.sessions[token];
  return db.users.find(user => user.id === userId);
}
function publicUser(user) { const { password, ...safe } = user; return safe; }
function requireUser(req, res, db) { const user = currentUser(req, db); if (!user) send(res, 401, { error: 'Authentication required' }); return user; }

async function api(req, res) {
  const db = readDb();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname;
  if (req.method === 'GET' && route === '/api/health') return send(res, 200, { ok: true, service: 'fairway-forward-golf', persistence: 'json' });
  if (req.method === 'POST' && (route === '/api/auth/signup' || route === '/api/auth/login')) {
    const input = await body(req);
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    if (!email.includes('@') || password.length < 8) return send(res, 400, { error: 'Enter a valid email and a password of at least 8 characters.' });
    let user = db.users.find(item => item.email === email);
    if (route.endsWith('signup')) {
      if (user) return send(res, 409, { error: 'An account with this email already exists.' });
      user = { id: id('user'), name: input.name || email.split('@')[0], email, password, plan: input.plan === 'yearly' ? 'yearly' : 'monthly', charity: 'Mindful Miles', contributionPercent: 10, role: 'member', createdAt: new Date().toISOString().slice(0, 10) };
      db.users.push(user);
    } else if (!user || user.password !== password) return send(res, 401, { error: 'Email or password is incorrect.' });
    const token = crypto.randomBytes(24).toString('hex'); db.sessions[token] = user.id; writeDb(db);
    return send(res, 200, { token, user: publicUser(user) });
  }
  if (req.method === 'GET' && route === '/api/me') { const user = requireUser(req, res, db); if (!user) return; return send(res, 200, { user: publicUser(user) }); }
  if (req.method === 'GET' && route === '/api/scores') { const user = requireUser(req, res, db); if (!user) return; return send(res, 200, { scores: db.scores.filter(score => score.userId === user.id).sort((a, b) => b.date.localeCompare(a.date)) }); }
  if (req.method === 'POST' && route === '/api/scores') {
    const user = requireUser(req, res, db); if (!user) return; const input = await body(req); const score = Number(input.score); const date = String(input.date || '');
    if (!Number.isInteger(score) || score < 1 || score > 45 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(res, 400, { error: 'Score must be an integer from 1 to 45 with a valid date.' });
    const userScores = db.scores.filter(item => item.userId === user.id); if (userScores.some(item => item.date === date)) return send(res, 409, { error: 'A score already exists for this date. Edit or delete it first.' });
    db.scores.push({ id: id('score'), userId: user.id, score, date }); const sorted = db.scores.filter(item => item.userId === user.id).sort((a, b) => b.date.localeCompare(a.date));
    const keep = new Set(sorted.slice(0, 5).map(item => item.id)); db.scores = db.scores.filter(item => item.userId !== user.id || keep.has(item.id)); writeDb(db); return send(res, 201, { scores: sorted.slice(0, 5) });
  }
  if (req.method === 'DELETE' && route.startsWith('/api/scores/')) { const user = requireUser(req, res, db); if (!user) return; const scoreId = route.split('/').pop(); db.scores = db.scores.filter(item => !(item.id === scoreId && item.userId === user.id)); writeDb(db); return send(res, 200, { ok: true }); }
  if (req.method === 'GET' && route === '/api/charities') return send(res, 200, { charities: db.charities });
  if (req.method === 'PUT' && route === '/api/profile') { const user = requireUser(req, res, db); if (!user) return; const input = await body(req); if (input.charity && db.charities.some(charity => charity.name === input.charity)) user.charity = input.charity; if (Number(input.contributionPercent) >= 10 && Number(input.contributionPercent) <= 50) user.contributionPercent = Number(input.contributionPercent); writeDb(db); return send(res, 200, { user: publicUser(user) }); }
  if (req.method === 'GET' && route === '/api/draws') return send(res, 200, { draws: db.draws, winners: db.winners });
  if (req.method === 'GET' && route === '/api/admin/metrics') { const user = requireUser(req, res, db); if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admin access required' }); return send(res, 200, { metrics: { activeUsers: db.users.length, prizePool: 19800, charityTotal: db.stats.charityTotal, pendingReviews: db.stats.pendingReviews } }); }
  if (req.method === 'POST' && route === '/api/admin/draws/simulate') { const user = requireUser(req, res, db); if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admin access required' }); return send(res, 200, { result: 'Simulation complete. No winners detected yet. Jackpot will roll over.' }); }
  return send(res, 404, { error: 'API route not found' });
}

async function handleRequest(req, res) {
  try {
    if (req.url.startsWith('/api/')) await api(req, res);
    else serveFile(req, res);
  } catch (error) {
    send(res, 500, { error: error.message || 'Internal server error' });
  }
}

if (require.main === module) {
  const server = http.createServer(handleRequest);
  ensureDb();
  server.listen(PORT, () => console.log(`Fairway Forward running at http://localhost:${PORT}`));
}

module.exports = handleRequest;
