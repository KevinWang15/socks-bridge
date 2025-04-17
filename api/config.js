// Configuration management routes for the proxy manager API

const express = require('express');
const router = express.Router();
const {readConfig, writeConfig, validateListener, getTlsDomain} = require('../utils/configManager');
const {reloadProxyServers} = require('../utils/proxyManager');

// Get current configuration
router.get('/', (req, res) => {
    try {
        const config = readConfig();
        // Remove sensitive information like admin password
        const safeConfig = {...config};
        if (safeConfig.admin) {
            safeConfig.admin = {username: safeConfig.admin.username};
        }
        return res.json(safeConfig);
    } catch (error) {
        return res.status(500).json({message: error.message});
    }
});

// Get all proxy listeners
router.get('/listeners', (req, res) => {
    try {
        const config = readConfig();
        return res.json(config.httpsProxyListeners || []);
    } catch (error) {
        return res.status(500).json({message: error.message});
    }
});

// Get specific proxy listener by port
router.get('/listeners/:port', (req, res) => {
    try {
        const port = parseInt(req.params.port, 10);
        if (isNaN(port)) {
            return res.status(400).json({message: 'Invalid port number'});
        }

        const config = readConfig();
        const listener = config.httpsProxyListeners.find(l => l.port === port);

        if (!listener) {
            return res.status(404).json({message: 'Proxy listener not found'});
        }

        return res.json(listener);
    } catch (error) {
        return res.status(500).json({message: error.message});
    }
});

// Add new proxy listener
router.post('/listeners', (req, res) => {
    try {
        const config = readConfig();
        let newListener = req.body;

        try {
            newListener = validateListener(newListener);
        } catch (validationError) {
            return res.status(400).json({message: validationError.message});
        }

        // Check for duplicate port
        if (config.httpsProxyListeners.some(l => l.port === newListener.port)) {
            return res.status(400).json({message: 'Proxy listener with this port already exists'});
        }

        // Add new listener
        config.httpsProxyListeners.push(newListener);

        // Write updated config
        writeConfig(config);

        // Reload proxy servers for immediate effect
        const reloadSuccess = reloadProxyServers();

        return res.status(201).json({
            listener: newListener,
            reloadSuccess: reloadSuccess
        });
    } catch (error) {
        return res.status(500).json({message: error.message});
    }
});

// Update existing proxy listener
router.put('/listeners/:port', (req, res) => {
    try {
        const port = parseInt(req.params.port, 10);
        if (isNaN(port)) {
            return res.status(400).json({message: 'Invalid port number'});
        }

        const config = readConfig();
        let updatedListener = req.body;

        try {
            updatedListener = validateListener(updatedListener);
        } catch (validationError) {
            return res.status(400).json({message: validationError.message});
        }

        const index = config.httpsProxyListeners.findIndex(l => l.port === port);

        if (index === -1) {
            return res.status(404).json({message: 'Proxy listener not found'});
        }

        // If port is being changed, check for duplicates
        if (updatedListener.port !== port &&
            config.httpsProxyListeners.some(l => l.port === updatedListener.port)) {
            return res.status(400).json({message: 'Another proxy listener with this port already exists'});
        }

        // Update listener
        config.httpsProxyListeners[index] = {...config.httpsProxyListeners[index], ...updatedListener};

        // Write updated config
        writeConfig(config);

        // Reload proxy servers for immediate effect
        const reloadSuccess = reloadProxyServers();

        return res.json({
            listener: config.httpsProxyListeners[index],
            reloadSuccess: reloadSuccess
        });
    } catch (error) {
        return res.status(500).json({message: error.message});
    }
});

// Delete proxy listener
router.delete('/listeners/:port', (req, res) => {
    try {
        const port = parseInt(req.params.port, 10);
        if (isNaN(port)) {
            return res.status(400).json({message: 'Invalid port number'});
        }

        const config = readConfig();
        const index = config.httpsProxyListeners.findIndex(l => l.port === port);

        if (index === -1) {
            return res.status(404).json({message: 'Proxy listener not found'});
        }

        // Remove listener
        const deletedListener = config.httpsProxyListeners.splice(index, 1)[0];

        // Write updated config
        writeConfig(config);

        // Reload proxy servers for immediate effect
        const reloadSuccess = reloadProxyServers();

        return res.json({
            listener: deletedListener,
            reloadSuccess: reloadSuccess
        });
    } catch (error) {
        return res.status(500).json({message: error.message});
    }
});

// Reload configuration
router.post('/reload', (req, res) => {
    try {
        // Reload proxy servers
        const reloadSuccess = reloadProxyServers();

        if (reloadSuccess) {
            return res.json({message: 'Configuration reloaded successfully'});
        } else {
            return res.status(500).json({message: 'Failed to reload configuration'});
        }
    } catch (error) {
        return res.status(500).json({message: error.message});
    }
});


router.get('/domain', (req, res) => {
    try {
        const cfg = readConfig();
        const domain = getTlsDomain(cfg.tlsCert);
        if (!domain) return res.status(500).json({message: 'Unable to read domain from certificate'});
        return res.json({domain});
    } catch (e) {
        return res.status(500).json({message: e.message});
    }
});

module.exports = {
    router
};
