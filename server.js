const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// Read the frontend HTML once at startup to avoid per-request file system access
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

// --- Simple in-memory rate limiter (100 req / 60 s per IP) ---
const rateLimitMap = new Map();
const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60 * 1000;

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  rateLimitMap.set(ip, entry);
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests, please try again later.' });
  }
  next();
}

app.use(express.json());
app.use(rateLimit);
app.use(express.static(path.join(__dirname, 'public')));

// --- DB helpers ---
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`Database file not found at ${DB_PATH}`);
    throw new Error(`Failed to parse database: ${err.message}`);
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// --- Routes ---

// GET all products (with optional search/filter)
app.get('/api/products', (req, res) => {
  const db = readDB();
  let products = db.products;
  const { search, category } = req.query;
  if (search) {
    const q = search.toLowerCase();
    products = products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  }
  if (category && category !== 'All') {
    products = products.filter((p) => p.category === category);
  }
  res.json(products);
});

// GET single product
app.get('/api/products/:id', (req, res) => {
  const db = readDB();
  const product = db.products.find((p) => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// POST create product
app.post('/api/products', (req, res) => {
  const { name, category, price, quantity, description } = req.body;
  if (!name || !category || price == null || quantity == null) {
    return res.status(400).json({ error: 'name, category, price and quantity are required' });
  }
  const db = readDB();
  const newProduct = {
    id: db.nextId++,
    name: name.trim(),
    category: category.trim(),
    price: parseFloat(price),
    quantity: parseInt(quantity),
    description: (description || '').trim(),
  };
  db.products.push(newProduct);
  writeDB(db);
  res.status(201).json(newProduct);
});

// PATCH update quantity (and other fields)
app.patch('/api/products/:id', (req, res) => {
  const db = readDB();
  const idx = db.products.findIndex((p) => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });

  const allowed = ['name', 'category', 'price', 'quantity', 'description'];
  allowed.forEach((field) => {
    if (req.body[field] != null) {
      if (field === 'price') db.products[idx][field] = parseFloat(req.body[field]);
      else if (field === 'quantity') db.products[idx][field] = parseInt(req.body[field]);
      else db.products[idx][field] = req.body[field];
    }
  });

  writeDB(db);
  res.json(db.products[idx]);
});

// DELETE product
app.delete('/api/products/:id', (req, res) => {
  const db = readDB();
  const idx = db.products.findIndex((p) => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });
  db.products.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// Serve frontend for all other routes
app.get('*', rateLimit, (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(INDEX_HTML);
});

app.listen(PORT, () => {
  console.log(`Anime Inventory Manager running at http://localhost:${PORT}`);
});
