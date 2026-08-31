import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Directories
const BASE_DIR = process.cwd();
const DB_DIR = path.join(BASE_DIR, 'backend', 'databases');
const TENANTS_DIR = path.join(DB_DIR, 'tenants');
const SCHEMA_DIR = path.join(BASE_DIR, 'backend', 'schema');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(TENANTS_DIR)) fs.mkdirSync(TENANTS_DIR, { recursive: true });

// Hash helper using SHA-256 for passwords/pins (compatible across platforms)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + '_stocktrack_salt_v1').digest('hex');
}

// 1. Initialize Main Database
const mainDbPath = path.join(DB_DIR, 'main.sqlite');
const mainDb = new DatabaseSync(mainDbPath);

// Enable WAL mode
mainDb.exec('PRAGMA foreign_keys = ON;');
mainDb.exec('PRAGMA journal_mode = WAL;');

// Initialize main schema
const mainSchemaFile = path.join(SCHEMA_DIR, 'main_schema.sql');
if (fs.existsSync(mainSchemaFile)) {
  const sql = fs.readFileSync(mainSchemaFile, 'utf8');
  mainDb.exec(sql);
} else {
  mainDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      recovery_pin TEXT,
      business_name TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_db_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      db_file TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

// Tenant DB Cache
const tenantDbCache = new Map<string, DatabaseSync>();

function getTenantDb(dbFileName: string): DatabaseSync {
  const cleanName = path.basename(dbFileName);
  if (tenantDbCache.has(cleanName)) {
    return tenantDbCache.get(cleanName)!;
  }

  const tenantPath = path.join(TENANTS_DIR, cleanName);
  const tenantDb = new DatabaseSync(tenantPath);
  tenantDb.exec('PRAGMA foreign_keys = ON;');
  tenantDb.exec('PRAGMA journal_mode = WAL;');

  // Initialize tenant schema
  const tenantSchemaFile = path.join(SCHEMA_DIR, 'tenant_schema.sql');
  if (fs.existsSync(tenantSchemaFile)) {
    const sql = fs.readFileSync(tenantSchemaFile, 'utf8');
    tenantDb.exec(sql);
  } else {
    tenantDb.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        supplier TEXT DEFAULT '',
        stock INTEGER DEFAULT 0,
        threshold_qty INTEGER DEFAULT 2,
        reminder_date TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('IN', 'OUT')),
        quantity INTEGER NOT NULL,
        description TEXT DEFAULT '',
        date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        business_name TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        address TEXT DEFAULT '',
        report_header_name TEXT DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  tenantDbCache.set(cleanName, tenantDb);
  return tenantDb;
}

function createTenantDatabase(userId: number, businessName = ''): string {
  const uuid = crypto.randomBytes(8).toString('hex');
  const dbFileName = `store_${uuid}.sqlite`;
  const tenantDb = getTenantDb(dbFileName);

  // Record mapping in mainDb
  const insertMap = mainDb.prepare('INSERT INTO user_db_mapping (user_id, db_file) VALUES (?, ?)');
  insertMap.run(userId, dbFileName);

  if (businessName) {
    const setStmt = tenantDb.prepare(`
      INSERT OR REPLACE INTO settings (id, business_name, report_header_name, updated_at)
      VALUES (1, ?, ?, CURRENT_TIMESTAMP)
    `);
    setStmt.run(businessName, `${businessName} — Inventory Report`);
  }

  return dbFileName;
}

// Authentication Middleware
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-session-token']) {
    token = String(req.headers['x-session-token']).trim();
  }

  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required. Missing token.' });
    return;
  }

  const sessionStmt = mainDb.prepare(`
    SELECT s.session_token, s.expires_at, u.id, u.username, u.business_name, u.status, m.db_file
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    JOIN user_db_mapping m ON u.id = m.user_id
    WHERE s.session_token = ? AND datetime(s.expires_at) > datetime('now')
    LIMIT 1
  `);

  const session = sessionStmt.get(token) as any;
  if (!session) {
    res.status(401).json({ success: false, error: 'Session expired or invalid. Please log in again.' });
    return;
  }

  if (session.status !== 'active') {
    res.status(403).json({ success: false, error: 'Account is deactivated.' });
    return;
  }

  const tenantDb = getTenantDb(session.db_file);
  (req as any).user = {
    id: session.id,
    username: session.username,
    business_name: session.business_name || '',
    db_file: session.db_file,
  };
  (req as any).tenantDb = tenantDb;
  next();
}

// ==========================================
// REST API ROUTES (ALL WRITE TO REAL SQLITE)
// ==========================================

// --- Auth Routes ---
app.post('/api/auth/register', (req, res) => {
  const { username, password, business_name, recovery_pin } = req.body;
  const cleanUsername = String(username || '').trim().toLowerCase();
  const rawPassword = String(password || '');
  const bName = String(business_name || '').trim();
  const pin = String(recovery_pin || '').trim();

  if (!cleanUsername || cleanUsername.length < 3) {
    res.status(400).json({ success: false, error: 'Username must be at least 3 characters.' });
    return;
  }
  if (!rawPassword || rawPassword.length < 6) {
    res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    return;
  }
  if (pin && !/^\d{4}$/.test(pin)) {
    res.status(400).json({ success: false, error: 'Recovery PIN must be 4 digits.' });
    return;
  }

  // Check duplicate
  const checkUser = mainDb.prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
  if (checkUser.get(cleanUsername)) {
    res.status(400).json({ success: false, error: 'That username is already taken.' });
    return;
  }

  const pHash = hashPassword(rawPassword);
  const pinHash = pin ? crypto.createHash('sha256').update(pin).digest('hex') : null;

  try {
    const insertUser = mainDb.prepare(`
      INSERT INTO users (username, password_hash, recovery_pin, business_name, status, created_at)
      VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    `);
    const userResult = insertUser.run(cleanUsername, pHash, pinHash, bName);
    const userId = Number(userResult.lastInsertRowid);

    // Create tenant SQLite file
    const dbFileName = createTenantDatabase(userId, bName);

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const insertSession = mainDb.prepare(`
      INSERT INTO user_sessions (user_id, session_token, expires_at, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    insertSession.run(userId, token, expiresAt);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: userId, username: cleanUsername, business_name: bName, db_file: dbFileName },
        message: `Account created! Stored in SQLite: backend/databases/main.sqlite and backend/databases/tenants/${dbFileName}`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Registration failed: ' + err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const cleanUsername = String(username || '').trim().toLowerCase();
  const rawPassword = String(password || '');

  if (!cleanUsername || !rawPassword) {
    res.status(400).json({ success: false, error: 'Please enter username and password.' });
    return;
  }

  const userStmt = mainDb.prepare(`
    SELECT u.id, u.username, u.password_hash, u.business_name, u.status, m.db_file
    FROM users u
    LEFT JOIN user_db_mapping m ON u.id = m.user_id
    WHERE u.username = ?
    LIMIT 1
  `);
  const user = userStmt.get(cleanUsername) as any;

  if (!user) {
    res.status(401).json({ success: false, error: 'Invalid username or password.' });
    return;
  }

  const pHash = hashPassword(rawPassword);
  if (user.password_hash !== pHash) {
    res.status(401).json({ success: false, error: 'Invalid username or password.' });
    return;
  }

  if (user.status !== 'active') {
    res.status(403).json({ success: false, error: 'Your account is deactivated.' });
    return;
  }

  let dbFile = user.db_file;
  if (!dbFile) {
    dbFile = createTenantDatabase(user.id, user.business_name || '');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const insertSession = mainDb.prepare(`
    INSERT INTO user_sessions (user_id, session_token, expires_at, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `);
  insertSession.run(user.id, token, expiresAt);

  res.json({
    success: true,
    data: {
      token,
      user: { id: user.id, username: user.username, business_name: user.business_name || '', db_file: dbFile },
      message: 'Login successful!',
    },
  });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
  if (token) {
    mainDb.prepare('DELETE FROM user_sessions WHERE session_token = ?').run(token);
  }
  res.json({ success: true, data: { message: 'Logged out successfully.' } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = (req as any).user;
  const tenantDb = (req as any).tenantDb as DatabaseSync;

  const setRow = tenantDb.prepare('SELECT business_name, phone, address, report_header_name FROM settings WHERE id = 1 LIMIT 1').get() as any;
  const settings = setRow || {
    business_name: user.business_name || '',
    phone: '',
    address: '',
    report_header_name: user.business_name ? `${user.business_name} — Inventory Report` : 'StockTrack Inventory Report',
  };

  res.json({
    success: true,
    data: {
      user: { id: user.id, username: user.username, business_name: settings.business_name || user.business_name },
      settings,
    },
  });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { username, recovery_pin, new_password } = req.body;
  const cleanUser = String(username || '').trim().toLowerCase();
  const pin = String(recovery_pin || '').trim();
  const newPw = String(new_password || '');

  if (!cleanUser || !pin || !newPw) {
    res.status(400).json({ success: false, error: 'Username, 4-digit PIN, and new password are required.' });
    return;
  }
  if (newPw.length < 6) {
    res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    return;
  }

  const user = mainDb.prepare('SELECT id, recovery_pin FROM users WHERE username = ? LIMIT 1').get(cleanUser) as any;
  if (!user) {
    res.status(404).json({ success: false, error: 'Account not found with that username.' });
    return;
  }

  const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
  if (user.recovery_pin !== pinHash && user.recovery_pin !== pin) {
    res.status(401).json({ success: false, error: 'Incorrect 4-digit recovery PIN.' });
    return;
  }

  const newHash = hashPassword(newPw);
  mainDb.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
  mainDb.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(user.id);

  res.json({ success: true, data: { message: 'Password reset successfully!' } });
});

app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const user = (req as any).user;
  const { new_password } = req.body;
  const newPw = String(new_password || '');

  if (!newPw || newPw.length < 6) {
    res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
    return;
  }

  const newHash = hashPassword(newPw);
  mainDb.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

  res.json({ success: true, data: { message: 'Password changed successfully.' } });
});

// --- Database Status Inspector ---
app.get('/api/database/status', (req, res) => {
  try {
    const allUsers = mainDb.prepare('SELECT id, username, business_name, created_at FROM users').all() as any[];
    const sessions = mainDb.prepare("SELECT count(*) as count FROM user_sessions WHERE datetime(expires_at) > datetime('now')").get() as any;
    const mappings = mainDb.prepare('SELECT * FROM user_db_mapping').all() as any[];

    // Tenant details
    const tenantFiles = fs.existsSync(TENANTS_DIR) ? fs.readdirSync(TENANTS_DIR).filter(f => f.endsWith('.sqlite')) : [];
    
    res.json({
      success: true,
      data: {
        main_database: {
          path: 'backend/databases/main.sqlite',
          users_count: allUsers.length,
          users: allUsers,
          active_sessions: sessions?.count || 0,
        },
        tenant_databases: {
          directory: 'backend/databases/tenants/',
          files_count: tenantFiles.length,
          files: tenantFiles,
          mappings,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Products Routes (Tenant SQLite) ---
app.get('/api/products', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  const { search, supplier, low_stock } = req.query;

  let sql = 'SELECT id, name, supplier, stock AS initial_stock, threshold_qty, reminder_date, created_at, updated_at FROM products WHERE 1=1';
  const params: any[] = [];

  if (search) {
    sql += ' AND (name LIKE ? OR supplier LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (supplier && supplier !== 'ALL') {
    sql += ' AND supplier = ?';
    params.push(supplier);
  }
  sql += ' ORDER BY name ASC';

  const rows = tenantDb.prepare(sql).all(...params) as any[];

  // Attach live stock calculations
  const txSumStmt = tenantDb.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS total_out
    FROM transactions
    WHERE product_id = ?
  `);

  const enriched = rows.map((p) => {
    const tx = txSumStmt.get(p.id) as any;
    const currentStock = Number(p.initial_stock) + Number(tx?.total_in || 0) - Number(tx?.total_out || 0);
    const threshold = Number(p.threshold_qty || 2);
    const isLow = currentStock <= threshold;

    return {
      id: p.id,
      name: p.name,
      supplier: p.supplier || '',
      initial_stock: Number(p.initial_stock),
      current_stock: currentStock,
      threshold_qty: threshold,
      reminder_date: p.reminder_date || '',
      is_low_stock: isLow,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  });

  const finalRows = low_stock === 'true' ? enriched.filter(p => p.is_low_stock) : enriched;
  res.json({ success: true, data: finalRows });
});

app.post('/api/products', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  const { name, supplier, initial_stock, stock, threshold_qty, threshold, reminder_date, reminder } = req.body;

  const prodName = String(name || '').trim();
  const supp = String(supplier || '').trim();
  const initStock = Math.max(0, Number(initial_stock ?? stock ?? 0));
  const thresh = Math.max(0, Number(threshold_qty ?? threshold ?? 2));
  const remDate = String(reminder_date ?? reminder ?? '').trim();

  if (!prodName) {
    res.status(400).json({ success: false, error: 'Product name is required.' });
    return;
  }

  const check = tenantDb.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?) LIMIT 1').get(prodName);
  if (check) {
    res.status(400).json({ success: false, error: 'A product with this name already exists in your inventory.' });
    return;
  }

  const id = 'prod_' + crypto.randomBytes(8).toString('hex');
  const insert = tenantDb.prepare(`
    INSERT INTO products (id, name, supplier, stock, threshold_qty, reminder_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  insert.run(id, prodName, supp, initStock, thresh, remDate);

  res.status(201).json({
    success: true,
    data: {
      id,
      name: prodName,
      supplier: supp,
      initial_stock: initStock,
      current_stock: initStock,
      threshold_qty: thresh,
      reminder_date: remDate,
      message: `Product '${prodName}' added to SQLite tenant database!`,
    },
  });
});

app.put('/api/products/:id', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  const id = req.params.id;
  const { name, supplier, initial_stock, stock, threshold_qty, threshold, reminder_date, reminder } = req.body;

  const existing = tenantDb.prepare('SELECT * FROM products WHERE id = ? LIMIT 1').get(id) as any;
  if (!existing) {
    res.status(404).json({ success: false, error: 'Product not found.' });
    return;
  }

  const prodName = String(name || existing.name).trim();
  const supp = supplier !== undefined ? String(supplier).trim() : existing.supplier;
  const initStock = initial_stock !== undefined || stock !== undefined ? Math.max(0, Number(initial_stock ?? stock)) : existing.stock;
  const thresh = threshold_qty !== undefined || threshold !== undefined ? Math.max(0, Number(threshold_qty ?? threshold)) : existing.threshold_qty;
  const remDate = reminder_date !== undefined || reminder !== undefined ? String(reminder_date ?? reminder).trim() : existing.reminder_date;

  // Check duplicate
  const check = tenantDb.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1').get(prodName, id);
  if (check) {
    res.status(400).json({ success: false, error: 'Another product with that name already exists.' });
    return;
  }

  tenantDb.prepare(`
    UPDATE products
    SET name = ?, supplier = ?, stock = ?, threshold_qty = ?, reminder_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(prodName, supp, initStock, thresh, remDate, id);

  if (existing.name.toLowerCase() !== prodName.toLowerCase()) {
    tenantDb.prepare('UPDATE transactions SET product_name = ? WHERE product_id = ?').run(prodName, id);
  }

  res.json({
    success: true,
    data: { id, name: prodName, supplier: supp, initial_stock: initStock, threshold_qty: thresh, reminder_date: remDate },
  });
});

app.delete('/api/products/:id', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  const id = req.params.id;

  tenantDb.prepare('DELETE FROM transactions WHERE product_id = ?').run(id);
  tenantDb.prepare('DELETE FROM products WHERE id = ?').run(id);

  res.json({ success: true, data: { message: 'Product deleted from SQLite database.' } });
});

app.post('/api/products/import', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  const { csv_data } = req.body;

  if (!csv_data || !String(csv_data).trim()) {
    res.status(400).json({ success: false, error: 'No CSV content provided.' });
    return;
  }

  const lines = String(csv_data).trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    res.status(400).json({ success: false, error: 'CSV must have a header row and data rows.' });
    return;
  }

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const nameIdx = header.findIndex(h => h.includes('name') || h.includes('product'));
  const suppIdx = header.findIndex(h => h.includes('supplier'));
  const stockIdx = header.findIndex(h => h.includes('stock') || h.includes('qty') || h.includes('quantity'));
  const threshIdx = header.findIndex(h => h.includes('threshold') || h.includes('min'));
  const remIdx = header.findIndex(h => h.includes('reminder') || h.includes('date'));

  if (nameIdx === -1) {
    res.status(400).json({ success: false, error: "CSV missing 'name' column." });
    return;
  }

  let added = 0;
  let updated = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    const name = cols[nameIdx];
    if (!name) continue;

    const supplier = suppIdx >= 0 ? (cols[suppIdx] || '') : '';
    const stock = stockIdx >= 0 ? Math.max(0, parseInt(cols[stockIdx]) || 0) : 0;
    const threshold = threshIdx >= 0 ? Math.max(0, parseInt(cols[threshIdx]) || 2) : 2;
    const reminder = remIdx >= 0 ? (cols[remIdx] || '') : '';

    const existing = tenantDb.prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?) LIMIT 1').get(name) as any;
    if (existing) {
      tenantDb.prepare(`
        UPDATE products SET supplier = ?, stock = ?, threshold_qty = ?, reminder_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(supplier, stock, threshold, reminder, existing.id);
      updated++;
    } else {
      const id = 'prod_' + crypto.randomBytes(8).toString('hex');
      tenantDb.prepare(`
        INSERT INTO products (id, name, supplier, stock, threshold_qty, reminder_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(id, name, supplier, stock, threshold, reminder);
      added++;
    }
  }

  res.json({
    success: true,
    data: { message: `Imported to SQLite: ${added} added, ${updated} updated.`, added, updated },
  });
});

// --- Transactions Routes (Tenant SQLite) ---
app.get('/api/transactions', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  const { product_id, type, start_date, end_date, search } = req.query;

  let sql = 'SELECT id, product_id, product_name, type, quantity, description, date, created_at FROM transactions WHERE 1=1';
  const params: any[] = [];

  if (product_id && product_id !== 'ALL') {
    sql += ' AND (product_id = ? OR product_name = ?)';
    params.push(product_id, product_id);
  }
  if (type && (type === 'IN' || type === 'OUT')) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (start_date) {
    sql += ' AND date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    sql += ' AND date <= ?';
    params.push(end_date);
  }
  if (search) {
    sql += ' AND (product_name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY date DESC, created_at DESC';
  const rows = tenantDb.prepare(sql).all(...params);
  res.json({ success: true, data: rows });
});

app.post('/api/transactions', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  const { product_id, product_name, type, quantity, qty, description, desc, date } = req.body;

  const tType = String(type || '').toUpperCase();
  const tQty = Math.max(1, Number(quantity ?? qty ?? 0));
  const tDesc = String(description ?? desc ?? '').trim();
  const tDate = String(date || new Date().toISOString().split('T')[0]).trim();

  if (tType !== 'IN' && tType !== 'OUT') {
    res.status(400).json({ success: false, error: "Type must be 'IN' or 'OUT'." });
    return;
  }

  let prod = null as any;
  if (product_id) {
    prod = tenantDb.prepare('SELECT * FROM products WHERE id = ? LIMIT 1').get(product_id);
  }
  if (!prod && product_name) {
    prod = tenantDb.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?) LIMIT 1').get(product_name);
  }

  if (!prod) {
    res.status(404).json({ success: false, error: 'Product not found in catalog.' });
    return;
  }

  const id = 'tx_' + crypto.randomBytes(8).toString('hex');
  tenantDb.prepare(`
    INSERT INTO transactions (id, product_id, product_name, type, quantity, description, date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(id, prod.id, prod.name, tType, tQty, tDesc, tDate);

  res.status(201).json({
    success: true,
    data: {
      id,
      product_id: prod.id,
      product_name: prod.name,
      type: tType,
      quantity: tQty,
      description: tDesc,
      date: tDate,
      message: `${tType === 'IN' ? 'Stock In (+)' : 'Stock Out (-)'} recorded in SQLite.`,
    },
  });
});

app.delete('/api/transactions/:id', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  tenantDb.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ success: true, data: { message: 'Transaction deleted.' } });
});

// --- Dashboard & Reports (Tenant SQLite) ---
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  const user = (req as any).user;

  const products = tenantDb.prepare('SELECT id, name, supplier, stock AS initial_stock, threshold_qty, reminder_date FROM products ORDER BY name ASC').all() as any[];
  const txSum = tenantDb.prepare(`
    SELECT
      product_id,
      COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS total_out
    FROM transactions
    GROUP BY product_id
  `).all() as any[];

  const txMap = new Map<string, { in: number; out: number }>();
  txSum.forEach((t) => txMap.set(t.product_id, { in: Number(t.total_in), out: Number(t.total_out) }));

  let totalUnits = 0;
  const lowStockItems: any[] = [];
  const reminderItems: any[] = [];
  const todayStr = new Date().toISOString().split('T')[0];

  products.forEach((p) => {
    const agg = txMap.get(p.id) || { in: 0, out: 0 };
    const currentStock = Number(p.initial_stock) + agg.in - agg.out;
    totalUnits += currentStock;
    const thresh = Number(p.threshold_qty || 2);

    if (currentStock <= thresh) {
      lowStockItems.push({
        id: p.id,
        name: p.name,
        supplier: p.supplier || '',
        current_stock: currentStock,
        threshold_qty: thresh,
      });
    }

    if (p.reminder_date && p.reminder_date <= todayStr) {
      reminderItems.push({ id: p.id, name: p.name, reminder_date: p.reminder_date });
    }
  });

  const totals = tenantDb.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) AS grand_in,
      COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS grand_out
    FROM transactions
  `).get() as any;

  const recent = tenantDb.prepare('SELECT id, product_id, product_name, type, quantity, description, date FROM transactions ORDER BY date DESC, created_at DESC LIMIT 6').all();
  const setRow = tenantDb.prepare('SELECT business_name FROM settings WHERE id = 1').get() as any;

  res.json({
    success: true,
    data: {
      business_name: setRow?.business_name || user.business_name || 'My Store',
      username: user.username,
      total_products: products.length,
      total_stock_units: totalUnits,
      total_purchased: Number(totals?.grand_in || 0),
      total_sold: Number(totals?.grand_out || 0),
      low_stock_count: lowStockItems.length,
      low_stock_items: lowStockItems,
      reminder_items: reminderItems,
      recent_transactions: recent,
    },
  });
});

// --- Settings & Backup (Tenant SQLite) ---
app.get('/api/settings', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  const user = (req as any).user;
  const row = tenantDb.prepare('SELECT business_name, phone, address, report_header_name FROM settings WHERE id = 1').get() as any;

  res.json({
    success: true,
    data: row || {
      business_name: user.business_name || '',
      phone: '',
      address: '',
      report_header_name: user.business_name ? `${user.business_name} — Inventory Report` : 'StockTrack Inventory Report',
    },
  });
});

app.post('/api/settings', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  const user = (req as any).user;
  const { business_name, phone, address, report_header_name } = req.body;

  const bName = String(business_name || '').trim();
  const bPhone = String(phone || '').trim();
  const bAddr = String(address || '').trim();
  const header = String(report_header_name || (bName ? `${bName} — Inventory Report` : 'StockTrack Inventory Report')).trim();

  tenantDb.prepare(`
    INSERT INTO settings (id, business_name, phone, address, report_header_name, updated_at)
    VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      business_name = excluded.business_name,
      phone = excluded.phone,
      address = excluded.address,
      report_header_name = excluded.report_header_name,
      updated_at = CURRENT_TIMESTAMP
  `).run(bName, bPhone, bAddr, header);

  mainDb.prepare('UPDATE users SET business_name = ? WHERE id = ?').run(bName, user.id);

  res.json({
    success: true,
    data: { business_name: bName, phone: bPhone, address: bAddr, report_header_name: header, message: 'Settings saved to SQLite.' },
  });
});

// Clear all items (for clean start)
app.post('/api/settings/clear-items', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  tenantDb.prepare('DELETE FROM transactions').run();
  tenantDb.prepare('DELETE FROM products').run();
  res.json({ success: true, data: { message: 'All items and transactions cleared from your SQLite database.' } });
});

// Restore / Import full backup directly into SQLite database
app.post('/api/settings/restore', authMiddleware, (req, res) => {
  const tenantDb = (req as any).tenantDb as DatabaseSync;
  const { products, transactions, settings, is_replace } = req.body;

  if (is_replace) {
    tenantDb.prepare('DELETE FROM transactions').run();
    tenantDb.prepare('DELETE FROM products').run();
  }

  const insertProd = tenantDb.prepare(`
    INSERT OR REPLACE INTO products (id, name, supplier, stock, threshold_qty, reminder_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
  `);

  const insertTx = tenantDb.prepare(`
    INSERT OR REPLACE INTO transactions (id, product_id, product_name, type, quantity, description, date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
  `);

  if (Array.isArray(products)) {
    for (const p of products) {
      if (!p.name) continue;
      const pid = p.id || 'prod_' + crypto.randomBytes(8).toString('hex');
      const pSupp = p.supplier || '';
      const pStock = Number(p.initialStock ?? p.initial_stock ?? p.stock ?? 0);
      const pThresh = Number(p.threshold ?? p.threshold_qty ?? 2);
      const pRem = p.reminderDate || p.reminder_date || '';
      insertProd.run(pid, p.name, pSupp, pStock, pThresh, pRem, p.createdAt || p.created_at || null);
    }
  }

  if (Array.isArray(transactions)) {
    for (const t of transactions) {
      if (!t.productName && !t.product_name) continue;
      const tid = t.id || 'tx_' + crypto.randomBytes(8).toString('hex');
      const pid = t.productId || t.product_id || '';
      const pName = t.productName || t.product_name || '';
      const tType = (t.type || 'IN').toUpperCase();
      const tQty = Number(t.quantity || 0);
      const tDesc = t.description || '';
      const tDate = t.date || new Date().toISOString().split('T')[0];
      insertTx.run(tid, pid, pName, tType, tQty, tDesc, tDate, t.createdAt || t.created_at || null);
    }
  }

  if (settings && typeof settings === 'object') {
    const user = (req as any).user;
    const bName = String(settings.businessName || settings.business_name || '').trim();
    const bPhone = String(settings.phone || '').trim();
    const bAddr = String(settings.address || '').trim();
    const header = String(settings.reportHeaderName || settings.report_header_name || (bName ? `${bName} — Inventory Report` : '')).trim();

    tenantDb.prepare(`
      INSERT INTO settings (id, business_name, phone, address, report_header_name, updated_at)
      VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        business_name = excluded.business_name,
        phone = excluded.phone,
        address = excluded.address,
        report_header_name = excluded.report_header_name,
        updated_at = CURRENT_TIMESTAMP
    `).run(bName, bPhone, bAddr, header);

    if (bName) {
      mainDb.prepare('UPDATE users SET business_name = ? WHERE id = ?').run(bName, user.id);
    }
  }

  res.json({ success: true, data: { message: 'Database restored successfully into SQLite.' } });
});

// Start Express Server & Vite
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`STOCKTRACK Server with SQLite DB active on port ${PORT}`);
  });
}

start();
