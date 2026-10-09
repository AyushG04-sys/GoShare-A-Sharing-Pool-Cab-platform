const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// In production, this should be an environment variable
const JWT_SECRET = 'GoShare_Super_Secret_Key_2026';

app.use(cors());
app.use(bodyParser.json());

// Serve static frontend files from the parent directory
app.use(express.static(path.join(__dirname, '../')));

// --- DB Helpers ---
const readDB = () => {
  try {
    if (!fs.existsSync(DB_PATH)) return { users: [], drivers: [], bookings: [], sosAlerts: [] };
    const rawData = fs.readFileSync(DB_PATH, 'utf8');
    const data = JSON.parse(rawData || '{}');
    return {
      users: Array.isArray(data.users) ? data.users : [],
      drivers: Array.isArray(data.drivers) ? data.drivers : [],
      bookings: Array.isArray(data.bookings) ? data.bookings : [],
      sosAlerts: Array.isArray(data.sosAlerts) ? data.sosAlerts : []
    };
  } catch (e) {
    return { users: [], drivers: [], bookings: [], sosAlerts: [] };
  }
};

const writeDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// --- Security Middlewares ---

// 1. Verify JWT Token Middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 
  
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

// 2. RBAC Admin Middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  next();
};

// --- API Endpoints ---

// Auth: Register/Login with Bcrypt and JWT
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, name, password, role = 'user', vehicleType, vehicleNumber } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }
    
    const db = readDB();
    const targetCollection = role === 'admin' ? db.users : (role === 'driver' ? db.drivers : db.users);
    let account = targetCollection.find(u => u.phone === phone);

    if (account) {
      if (!account.password) {
        const salt = await bcrypt.genSalt(10);
        account.password = await bcrypt.hash(password, salt);
      }

      const isMatch = await bcrypt.compare(password, account.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      if (name) account.name = name;
      if (role === 'driver') {
        account.vehicleType = vehicleType || account.vehicleType;
        account.vehicleNumber = vehicleNumber || account.vehicleNumber;
      }
    } else {
      if (!name) return res.status(400).json({ error: 'Name is required for registration' });
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      const prefix = role === 'admin' ? 'adm_' : (role === 'driver' ? 'drv_' : 'usr_');
      account = {
        id: prefix + Date.now(),
        phone,
        name,
        role,
        password: hashedPassword,
        ...(role === 'driver' && { vehicleType: vehicleType || '', vehicleNumber: vehicleNumber || '' })
      };
      targetCollection.push(account);
    }

    writeDB(db);

    const token = jwt.sign({ id: account.id, role: account.role }, JWT_SECRET, { expiresIn: '24h' });
    const { password: _, ...safeAccountData } = account;

    res.json({
      message: 'Authentication successful',
      token, 
      user: safeAccountData
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/bookings', verifyToken, (req, res) => {
  const db = readDB();
  const { userId } = req.query;
  let filtered = db.bookings;
  if (userId) {
    filtered = filtered.filter(b => b.userId === userId || b.driverId === userId || b.driverPhone === userId);
  }
  res.json(filtered);
});

app.post('/api/bookings', verifyToken, (req, res) => {
  const db = readDB();
  const booking = {
    ...req.body,
    id: 'bk_' + Date.now(),
    createdAt: Date.now()
  };
  db.bookings.push(booking);
  writeDB(db);
  res.status(201).json(booking);
});

app.patch('/api/bookings/:id', verifyToken, (req, res) => {
  const db = readDB();
  const index = db.bookings.findIndex(b => b.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Booking not found' });
  
  const { id, createdAt, ...updateData } = req.body;
  db.bookings[index] = { ...db.bookings[index], ...updateData };
  writeDB(db);
  res.json(db.bookings[index]);
});

app.delete('/api/bookings/:id', verifyToken, (req, res) => {
  const db = readDB();
  const index = db.bookings.findIndex(b => b.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Booking not found' });
  
  db.bookings.splice(index, 1);
  writeDB(db);
  res.json({ message: 'Booking deleted successfully' });
});

app.post('/api/sos', verifyToken, (req, res) => {
  const db = readDB();
  const alert = { ...req.body, id: 'sos_' + Date.now(), timestamp: Date.now() };
  db.sosAlerts.push(alert);
  writeDB(db);
  res.status(201).json(alert);
});

app.get('/api/admin/stats', verifyToken, requireAdmin, (req, res) => {
  const db = readDB();
  res.json({
    bookings: db.bookings,
    drivers: db.drivers,
    users: db.users.filter(u => u.role !== 'admin'),
    sosAlerts: db.sosAlerts
  });
});

app.listen(PORT, () => console.log(`🚀 Secure GoShare Server running at http://localhost:${PORT}`));