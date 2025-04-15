module.exports = {
    domainName: 'example.com',
    tlsCert: './certs/cert.pem',
    tlsKey: './certs/key.pem',
    httpsProxyListeners: [
        {
            USERNAME: 'user1',
            PASSWORD: 'password1',

            port: 8443,
            SOCKS_HOST: '127.0.0.1',
            SOCKS_PORT: 1080,
            SOCKS_USERNAME: 'user1',
            SOCKS_PASSWORD: 'password1'
        },
        {
            USERNAME: 'user1',
            PASSWORD: 'password1',

            port: 9443,
            SOCKS_HOST: '127.0.0.1',
            SOCKS_PORT: 1080,
            SOCKS_USERNAME: '',
            SOCKS_PASSWORD: ''
        }
    ]
};
