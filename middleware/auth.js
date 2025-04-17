// middleware/auth.js
// Authentication middleware for the proxy manager API

const jwt = require('jsonwebtoken');

// JWT Secret (in production, use environment variables)
const JWT_SECRET = 'proxy-manager-secret-key';

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

module.exports = {
  authenticateToken,
  JWT_SECRET
};
