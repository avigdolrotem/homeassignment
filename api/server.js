const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const { logUserActivity } = require('./logger');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your-secret-key-change-in-production';

app.use(cors());
app.use(bodyParser.json());

let pool;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDatabase(maxRetries = 30, retryDelay = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const tempPool = mysql.createPool({
        host: process.env.DB_HOST || 'tidb',
        port: process.env.DB_PORT || 4000,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        waitForConnections: true,
        connectionLimit: 1
      });
      
      await tempPool.execute('SELECT 1');
      await tempPool.end();
      console.log('Database connection successful');
      return true;
    } catch (error) {
      console.log(`Waiting for database... attempt ${i + 1}/${maxRetries}`);
      await sleep(retryDelay);
    }
  }
  throw new Error('Could not connect to database after maximum retries');
}

async function initDatabase() {
  await waitForDatabase();
  
  const tempPool = mysql.createPool({
    host: process.env.DB_HOST || 'tidb',
    port: process.env.DB_PORT || 4000,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 10
  });
  
  try {
    await tempPool.execute('CREATE DATABASE IF NOT EXISTS appdb');
    console.log('Database appdb created or already exists');
    await tempPool.end();
  } catch (error) {
    console.error('Error creating database:', error);
    await tempPool.end();
    throw error;
  }
  
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'tidb',
    port: process.env.DB_PORT || 4000,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'appdb',
    waitForConnections: true,
    connectionLimit: 10
  });
  
  console.log('Database connection pool created');
  
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(512) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    
    console.log('Tables created successfully');
    
    const hashedPassword = await bcrypt.hash('admin123', 10);
    try {
      await pool.execute(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        ['admin', 'admin@example.com', hashedPassword]
      );
      console.log('Default admin user created');
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        console.log('Admin user already exists');
      } else {
        throw err;
      }
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress;

  try {
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      logUserActivity('unknown', 'failed_login_attempt', ipAddress);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      logUserActivity(user.id, 'failed_login', ipAddress);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    
    await pool.execute(
      'INSERT INTO tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))',
      [user.id, token]
    );

    logUserActivity(user.id, 'login_success', ipAddress);

    res.json({ token, userId: user.id, username: user.username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function authenticateToken(req, res, next) {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is protected data', userId: req.user.userId });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/db-status', async (req, res) => {
  try {
    const [users] = await pool.execute('SELECT COUNT(*) as count FROM users');
    const [tokens] = await pool.execute('SELECT COUNT(*) as count FROM tokens');
    res.json({ 
      users: users[0].count, 
      tokens: tokens[0].count,
      status: 'connected'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`API server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
