module.exports = {
    tlsKey: "/app/certs/key.pem",
    tlsCert: "/app/certs/cert.pem",
    // When true, returns 200 OK with empty JSON instead of 407 for auth failures
    // This helps mask the fact that it's a proxy server, but breaks standard browser proxy usage
    maskProxyAuth: false,
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