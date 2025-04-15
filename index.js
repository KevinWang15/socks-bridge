#!/usr/bin/env node

// index.js
// A simple Node.js HTTPS CONNECT proxy that forwards traffic over SOCKS5
// using one HTTPS server per configured listener.

const fs = require('fs');
const net = require('net');
const http = require('http');
const https = require('https');
const { SocksClient } = require('socks');
const config = require('./config');

// ============================================================================
// 1. STUB/HELPER FUNCTIONS
// ============================================================================

// A simple function that checks Basic Auth and returns the "profile"
// (i.e., the listener config) if valid. Otherwise returns null.
function authenticate(req, listener) {
    const authHeader = req.headers['proxy-authorization'] || '';
    if (!authHeader) return null;

    const [authType, authValue] = authHeader.split(' ');
    if (authType !== 'Basic') return null;

    const [username, password] = Buffer.from(authValue, 'base64').toString().split(':');

    // If the listener is configured without SOCKS_USERNAME/PASSWORD,
    // you might skip the check or handle it differently.
    if (
        listener.USERNAME &&
        listener.PASSWORD &&
        (username !== listener.USERNAME || password !== listener.PASSWORD)
    ) {
        return null;
    }

    // Return the listener config as the "profile"
    // so we can retrieve the socks settings from it.
    return listener;
}

// Example domain-checking function. If you don’t need whitelisting,
// just return true.
function isDomainAllowed(hostname /*: string*/, profile) {
    // This is a stub. In real usage, check if hostname is in some allowed list.
    return true;
}

// ============================================================================
// 2. CORE PROXY LOGIC
// ============================================================================

async function handleConnect(clientReq, clientSocket, head, listener) {
    console.log('Received CONNECT request:', clientReq.url);

    // Check Basic Auth
    const profile = authenticate(clientReq, listener);
    if (!profile) {
        console.log('Authentication failed');
        clientSocket.write(
            'HTTP/1.1 407 Proxy Authentication Required\r\n' +
            'Proxy-Authenticate: Basic realm="Proxy Authentication Required"\r\n' +
            'Connection: close\r\n\r\n'
        );
        clientSocket.end();
        return;
    }

    const [targetHost, targetPort] = clientReq.url.split(':');
    const port = parseInt(targetPort, 10) || 443;

    // Domain check
    if (!isDomainAllowed(targetHost, profile)) {
        console.log(`Domain not allowed: ${targetHost}`);
        clientSocket.write(
            'HTTP/1.1 403 Forbidden\r\n' + 'Connection: close\r\n\r\n'
        );
        clientSocket.end();
        return;
    }

    console.log(`CONNECT -> ${targetHost}:${port}`);

    // If no SOCKS host is specified, connect directly
    if (!profile.SOCKS_HOST) {
        console.log('No SOCKS_HOST set; using direct net.connect');
        const targetSocket = net.connect(port, targetHost, () => {
            clientSocket.write(
                'HTTP/1.1 200 Connection Established\r\n' +
                'Proxy-Agent: Node.js-Proxy\r\n\r\n'
            );
            if (head && head.length) targetSocket.write(head);
            targetSocket.pipe(clientSocket);
            clientSocket.pipe(targetSocket);
        });

        targetSocket.on('error', (err) => {
            console.error('Target connection error:', err);
            clientSocket.end();
        });

        clientSocket.on('error', (err) => {
            console.error('Client connection error:', err);
            targetSocket.end();
        });

        targetSocket.on('end', () => clientSocket.end());
        clientSocket.on('end', () => targetSocket.end());
        return;
    }

    // Otherwise, forward via SOCKS
    console.log(
        `Forwarding via SOCKS5 at ${profile.SOCKS_HOST}:${profile.SOCKS_PORT} -> ${targetHost}:${port}`
    );

    try {
        const { socket: socksSocket } = await SocksClient.createConnection({
            proxy: {
                host: profile.SOCKS_HOST,
                port: profile.SOCKS_PORT,
                type: 5,
                userId: profile.SOCKS_USERNAME || undefined,
                password: profile.SOCKS_PASSWORD || undefined
            },
            command: 'connect',
            destination: {
                host: targetHost,
                port: port
            }
        });

        clientSocket.write(
            'HTTP/1.1 200 Connection Established\r\n' +
            'Proxy-Agent: Node.js-Proxy\r\n\r\n'
        );
        if (head && head.length) {
            socksSocket.write(head);
        }

        socksSocket.pipe(clientSocket);
        clientSocket.pipe(socksSocket);

        socksSocket.on('error', (err) => {
            console.error('SOCKS socket error:', err);
            clientSocket.end();
        });
        socksSocket.on('end', () => clientSocket.end());
        clientSocket.on('error', (err) => {
            console.error('Client socket error:', err);
            socksSocket.end();
        });
        clientSocket.on('end', () => socksSocket.end());
    } catch (err) {
        console.error('Error connecting via SOCKS:', err);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
    }
}

// Handle regular HTTP requests through the HTTPS proxy (rarely used, but possible)
async function handleRequest(clientReq, clientRes, listener) {
    console.log(`Proxying HTTP request to: ${clientReq.url}`);

    // 1. Check Basic Auth
    const profile = authenticate(clientReq, listener);
    if (!profile) {
        console.log('Authentication failed');
        clientRes.writeHead(407, {
            'Proxy-Authenticate': 'Basic realm="Proxy Authentication Required"',
            Connection: 'close'
        });
        clientRes.end();
        return;
    }

    // 2. Parse the URL
    let url;
    try {
        url = new URL(clientReq.url);
    } catch (error) {
        console.error("Invalid URL:", clientReq.url, error);
        clientRes.writeHead(400, { Connection: 'close' });
        clientRes.end('Invalid URL');
        return;
    }

    // 3. Check domain
    if (!isDomainAllowed(url.hostname, profile)) {
        console.log(`Domain not allowed: ${url.hostname}`);
        clientRes.writeHead(403, { Connection: 'close' });
        clientRes.end('Forbidden');
        return;
    }

    // Build HTTP request options
    const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: clientReq.method,
        headers: {
            ...clientReq.headers,
            host: url.host
        }
    };

    // Remove proxy-specific headers
    delete options.headers['proxy-connection'];
    delete options.headers['proxy-authorization'];

    // 4. Direct or SOCKS5 forwarding
    if (!profile.SOCKS_HOST) {
        // Direct
        console.log('No SOCKS_HOST set; using direct http.request');
        const proxyReq = http.request(options, (proxyRes) => {
            clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(clientRes);
        });

        proxyReq.on('error', (err) => {
            console.error('Proxy request error:', err);
            clientRes.writeHead(500, { Connection: 'close' });
            clientRes.end('Proxy request failed');
        });

        clientReq.pipe(proxyReq);
    } else {
        // SOCKS5
        const destinationPort = parseInt(url.port, 10) || 80;
        console.log(
            `Forwarding HTTP via SOCKS5 at ${profile.SOCKS_HOST}:${profile.SOCKS_PORT} -> ${url.hostname}:${destinationPort}`
        );

        try {
            const { socket: socksSocket } = await SocksClient.createConnection({
                proxy: {
                    host: profile.SOCKS_HOST,
                    port: profile.SOCKS_PORT,
                    type: 5,
                    userId: profile.SOCKS_USERNAME || undefined,
                    password: profile.SOCKS_PASSWORD || undefined
                },
                command: 'connect',
                destination: {
                    host: url.hostname,
                    port: destinationPort
                }
            });

            socksSocket.on('error', (err) => {
                console.error('SOCKS error in HTTP path:', err);
                clientRes.writeHead(502, { Connection: 'close' });
                clientRes.end('Error connecting to target via SOCKS5.');
            });

            // Send initial request line + headers
            let initialRequest = `${clientReq.method} ${url.pathname + url.search} HTTP/1.1\r\n`;
            for (const key in options.headers) {
                initialRequest += `${key}: ${options.headers[key]}\r\n`;
            }
            initialRequest += '\r\n'; // End of headers
            socksSocket.write(initialRequest);

            // Pipe the request body
            clientReq.pipe(socksSocket);

            // Listen for the response and forward it back
            let responseBuffer = '';
            let statusCode = null;
            let headers = null;

            socksSocket.on('data', (chunk) => {
                responseBuffer += chunk.toString('binary');
                const headerEndIndex = responseBuffer.indexOf('\r\n\r\n');

                // Once we parse the HTTP response headers, forward them
                if (statusCode === null && headerEndIndex !== -1) {
                    const rawHeader = responseBuffer.substring(0, headerEndIndex);
                    const [statusLine, ...headerLines] = rawHeader.split('\r\n');

                    // Parse status line
                    const statusMatch = statusLine.match(/^HTTP\/1\.[01] (\d+) .*/);
                    if (!statusMatch) {
                        console.error('Invalid status line:', statusLine);
                        clientRes.writeHead(502, { Connection: 'close' });
                        clientRes.end();
                        socksSocket.end();
                        return;
                    }

                    statusCode = parseInt(statusMatch[1], 10);
                    headers = {};

                    // Parse the remaining lines for headers
                    for (const line of headerLines) {
                        const idx = line.indexOf(':');
                        if (idx === -1) continue;
                        const key = line.substring(0, idx).trim();
                        const value = line.substring(idx + 1).trim();
                        headers[key] = value;
                    }

                    // Write the response status + headers to client
                    clientRes.writeHead(statusCode, headers);

                    // Write any leftover body that arrived
                    const body = responseBuffer.substring(headerEndIndex + 4);
                    if (body) {
                        clientRes.write(Buffer.from(body, 'binary'));
                    }

                    responseBuffer = '';
                } else if (statusCode !== null) {
                    // Already processed headers, just pipe the body
                    clientRes.write(Buffer.from(chunk, 'binary'));
                }
            });

            socksSocket.on('end', () => {
                clientRes.end();
            });
        } catch (err) {
            console.error('Error connecting via SOCKS:', err);
            clientRes.writeHead(502, { Connection: 'close' });
            clientRes.end('Error connecting to target via SOCKS5.');
        }
    }
}

// ============================================================================
// 3. CREATE SERVERS FOR EACH CONFIGURED LISTENER
// ============================================================================

const tlsOptions = {
    key: fs.readFileSync(config.tlsKey),
    cert: fs.readFileSync(config.tlsCert),
    // If you use SNI or need the domainName, you can add an SNICallback here.
    // Example: SNICallback: (serverName, cb) => { ... }
};

config.httpsProxyListeners.forEach((listener) => {
    const server = https.createServer(tlsOptions);

    server.on('connect', (req, socket, head) => {
        handleConnect(req, socket, head, listener);
    });

    server.on('request', (req, res) => {
        handleRequest(req, res, listener);
    });

    server.listen(listener.port, () => {
        console.log(`HTTPS Proxy listening on port ${listener.port}`);
    });
});

console.log('All configured HTTPS proxies are up and running...');
