// Utility for managing the config.js file

const fs = require('fs');
const path = require('path');

// Config file path
const CONFIG_FILE_PATH = path.join(__dirname, '..', 'config.js');

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

// Helper function to write config file
const writeConfig = (config) => {
    try {
        // Format the config object as a JavaScript module
        const configString = `// config.js
// Configuration file for HTTPS CONNECT proxy

module.exports = ${JSON.stringify(config, null, 2).replace(/"([^"]+)":/g, '$1:')};`;

        // Write to the config file
        fs.writeFileSync(CONFIG_FILE_PATH, configString, 'utf8');

        // Clear require cache to ensure next read gets the latest version
        delete require.cache[require.resolve('../config.js')];

        return true;
    } catch (error) {
        console.error('Error writing config file:', error);
        throw new Error('Failed to write configuration file');
    }
};

// Helper function to validate listener object
const validateListener = (listener) => {
    // Required fields
    if (!listener.port || isNaN(parseInt(listener.port))) {
        throw new Error('Valid port number is required');
    }

    // Convert numeric fields to numbers
    if (listener.port) {
        listener.port = parseInt(listener.port, 10);
    }

    if (listener.SOCKS_PORT && !isNaN(parseInt(listener.SOCKS_PORT))) {
        listener.SOCKS_PORT = parseInt(listener.SOCKS_PORT, 10);
    }

    return listener;
};

module.exports = {
    readConfig,
    writeConfig,
    validateListener,
    getTlsDomain: require('./certUtils').getTlsDomain
};
