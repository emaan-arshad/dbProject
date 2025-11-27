const express = require('express');
const mysql = require('mysql2');
const jwt = require('jsonwebtoken'); 
const cron = require('node-cron');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Database connection with environment variables
const connection = mysql.createConnection({
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || 'root',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'db_project',
  port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
  ssl: process.env.MYSQL_SSL ? { rejectUnauthorized: false } : false
});

// Connect to database with retry logic
const connectWithRetry = () => {
  connection.connect((err) => {
    if (err) {
      console.error('Error connecting to MySQL:', err);
      console.log('Retrying connection in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
      return;
    }
    console.log('Connected to MySQL successfully!');
  });
};

connectWithRetry();

const app = express();
const port = process.env.PORT || 3000;

// CORS configuration
const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'https://leakpeak-app.railway.app',
  'https://leakpeak-app.up.railway.app',
  'https://*.railway.app',
  'https://*.up.railway.app'
];

app.use(require('cors')({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed.replace('*.', '')))) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(require('express-session')({
  secret: process.env.SESSION_SECRET || 'mySecretKey12345!@#',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    database: connection.state === 'authenticated' ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

// ALL YOUR EXISTING ROUTES FROM ORIGINAL server.js GO HERE
// (Keep all your login, register, admin, etc. routes exactly as they were)

// Login route
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const userQuery = 'SELECT user_id, password, user_category FROM users WHERE email = ?';
  connection.query(userQuery, [email], (err, userResults) => {
    if (err) {
      console.error('Error querying users table:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (userResults.length > 0) {
      if (userResults[0].password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const userId = userResults[0].user_id;
      const userCategory = userResults[0].user_category;

      const token = jwt.sign(
        { userId: userId, role: 'user' },
        process.env.JWT_SECRET || 'mySecretKey12345!@#',
        { expiresIn: '1h' }
      );

      req.session.user_id = userId;
      req.session.role = 'user';

      return res.json({
        message: 'Login successful',
        token: token,
        role: 'user',
        userCategory: userCategory,
        userId: userId
      });
    }

    const adminQuery = 'SELECT admin_id, password FROM admins WHERE email = ?';
    connection.query(adminQuery, [email], (err, adminResults) => {
      if (err) {
        console.error('Error querying admins table:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (adminResults.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (adminResults[0].password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const adminId = adminResults[0].admin_id;
      const token = jwt.sign(
        { userId: adminId, role: 'admin' },
        process.env.JWT_SECRET || 'mySecretKey12345!@#',
        { expiresIn: '1h' }
      );

      req.session.user_id = adminId;
      req.session.role = 'admin';

      return res.json({
        message: 'Login successful',
        token: token,
        role: 'admin',
        userCategory: 'admin',
        userId: adminId
      });
    });
  });
});

// Add all your other routes here exactly as they were in your original server.js
// Include: /api/countries, /compromised-account, /register-user, /admins, etc.

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('public'));
  
  // Serve HTML files
  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/main.html');
  });
  
  app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
  });
}

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📊 Database: ${connection.config.database}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});