module.exports = {
    tlsKey: "/app/certs/key.pem",
    tlsCert: "/app/certs/cert.pem",
    // When true, returns 200 OK with empty JSON instead of 407 for auth failures
    // This helps mask the fact that it's a proxy server, but breaks standard browser proxy usage
    maskProxyAuth: false,
    // Optional: tune timeouts/keepalive behavior to minimize premature closes
    // All values are in milliseconds unless noted; omit to use safe defaults
    timeouts: {
        server: {
            // 0 disables request timeout (recommended)
            requestTimeout: 0,
            // Large values avoid premature slowloris/header timeouts (riskier if exposed publicly)
            headersTimeout: 86400000,      // 24h
            keepAliveTimeout: 86400000,    // 24h (HTTP keep-alive idle, not CONNECT tunnels)
            socketTimeout: 0               // 0 disables server socket inactivity timeout
        },
        socket: {
            idleTimeout: 0,                // 0 disables per-socket idle timeout
            keepAlive: true,               // enable TCP keep-alive to help with NATs
            keepAliveInitialDelayMs: 60000 // send first keepalive probe after 60s idle
        },
        socks: {
            // SOCKS handshake/connect timeout. Use 0 or a large value to avoid early failure.
            handshakeTimeoutMs: 86400000   // 24h
        }
    },
    admin: {
        username: "admin",
        password: "admin123"
    },
    httpsProxyListeners: [
        {
            port: 1905,
            USERNAME: "proxy-username",
            PASSWORD: "proxy-password",
            SOCKS_HOST: "xxx.yyy",
            SOCKS_PORT: 30006,
            SOCKS_USERNAME: "socks-username",
            SOCKS_PASSWORD: "socks-password"
        }
    ]
};
