// api/auth.js
// Authentication routes for the proxy manager API

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// JWT Secret (in production, use environment variables)
const JWT_SECRET = 'proxy-manager-secret-key';

// Helper function to read config file
const readConfig = () => {
  try {
    // Clear require cache to ensure we get the latest version
    delete require.cache[require.resolve('../config.js')];
    return require('../config.js');
  } catch (error) {
    console.error('Error reading config file:', error);
    throw new Error('Failed to read configuration file');
  }
};

// Login route
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const config = readConfig();
  
  if (!config.admin || username !== config.admin.username || password !== config.admin.password) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  
  // Generate JWT token
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
  
  // Set token in cookie
  res.cookie('token', token, { 
    httpOnly: true,
    maxAge: 3600000 // 1 hour
  });
  
  return res.json({ message: 'Authentication successful', token });
});

// Logout route
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ message: 'Logout successful' });
});

// Verify token route (useful for frontend to check if user is logged in)
router.get('/verify', (req, res) => {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ authenticated: true, user: decoded });
  } catch (error) {
    return res.status(401).json({ authenticated: false });
  }
});

module.exports = {
  router,
  JWT_SECRET
};
