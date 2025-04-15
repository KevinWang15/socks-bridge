const fs = require('fs');
const path = require('path');
const {reloadProxyServers} = require('./proxyManager');

let debounce = null;

/**
 * Begin watching the supplied file.  When it changes, the proxy farm is
 * reloaded (with a 2‑second debounce to avoid duplicate reloads).
 * @param {string} cfgPath full path to config.js
 */
function watchConfig(cfgPath) {
    // Use fs.watchFile for portability inside Docker bind‑mounts
    fs.watchFile(cfgPath, {interval: 500}, (cur, prev) => {
        if (cur.mtimeMs === prev.mtimeMs) return; // no actual change
        if (debounce) return;

        console.log('[configWatcher] Detected config.js change – reloading…');
        reloadProxyServers();

        debounce = setTimeout(() => (debounce = null), 2000);
    });

    console.log(`[configWatcher] Watching ${path.basename(cfgPath)} for changes`);
}

module.exports = {watchConfig};
