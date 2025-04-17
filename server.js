const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const https = require('https');
const {readConfig} = require('./utils/configManager');

// Import API routes and middleware
const {router: authRouter} = require('./api/auth');
const {router: configRouter} = require('./api/config');
const {authenticateToken} = require('./middleware/auth');
const {startProxyServers} = require('./utils/proxyManager');
const {watchConfig} = require("./utils/configWatcher");

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 35443;

// Middleware
app.use(cors({
    origin: true, credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(cookieParser());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/config', authenticateToken, configRouter);

// Catch-all route to serve the frontend
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const cfg = readConfig();

if (!fs.existsSync(cfg.tlsKey) || !fs.existsSync(cfg.tlsCert)) {
    console.error('[startup] TLS key/cert files not found – aborting.');
    process.exit(1);
}

const httpsServer = https.createServer(
    {
        key: fs.readFileSync(cfg.tlsKey),
        cert: fs.readFileSync(cfg.tlsCert)
    },
    app
);

httpsServer.listen(PORT, () => {
    console.log(`Proxy Manager UI/API (HTTPS) listening on port ${PORT}`);
    console.log('Initializing proxy servers…');
    startProxyServers();

    watchConfig(path.join(__dirname, 'config.js'));
});