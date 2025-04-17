module.exports = {
    tlsKey: "/app/certs/key.pem",
    tlsCert: "/app/certs/cert.pem",
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