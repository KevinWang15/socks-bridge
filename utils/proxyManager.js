const fs          = require('fs');
const net         = require('net');
const http        = require('http');
const https       = require('https');
const { SocksClient } = require('socks');
const { readConfig }  = require('./configManager');

// Reusable HTTP agent with keep-alive for direct HTTP requests
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 60_000
});

// Large timeout used where "disable" semantics are ambiguous across Node versions
const BIG_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h

function getTimeouts() {
  const cfg = readConfig();
  const t = cfg.timeouts || {};
  return {
    server: {
      // Disable request timeout (0 disables in Node)
      requestTimeout   : t.server?.requestTimeout ?? 0,
      // Use a very large headers timeout to avoid premature closes
      headersTimeout   : t.server?.headersTimeout ?? BIG_TIMEOUT_MS,
      // Keep idle keep-alive sockets for a long time (not CONNECT tunnels)
      keepAliveTimeout : t.server?.keepAliveTimeout ?? BIG_TIMEOUT_MS,
      // Socket inactivity timeout on the server (0 disables)
      socketTimeout    : t.server?.socketTimeout ?? 0
    },
    socket: {
      // Per-socket idle timeout (0 disables)
      idleTimeout            : t.socket?.idleTimeout ?? 0,
      // Enable TCP keep-alive to reduce idle NAT closures
      keepAlive              : t.socket?.keepAlive ?? true,
      keepAliveInitialDelayMs: t.socket?.keepAliveInitialDelayMs ?? 60_000
    },
    socks: {
      // SOCKS handshake/connect timeout; use long default if not set
      handshakeTimeoutMs: t.socks?.handshakeTimeoutMs ?? BIG_TIMEOUT_MS
    }
  };
}

function tuneSocket(sock) {
  const t = getTimeouts();
  try { sock.setTimeout(t.socket.idleTimeout); } catch {}
  try { sock.setKeepAlive(!!t.socket.keepAlive, t.socket.keepAliveInitialDelayMs); } catch {}
}

let activeServers = [];          // [{port, server}]
/* ───────────────────────── 1. Helper / stub fns ────────────────────────── */

function authenticate (req, listener) {
  const authHeader = req.headers['proxy-authorization'] || '';
  if (!authHeader) return null;

  const [authType, authValue] = authHeader.split(' ');
  if (authType !== 'Basic') return null;

  const [username, password] =
      Buffer.from(authValue, 'base64').toString().split(':');

  if (listener.USERNAME && listener.PASSWORD &&
      (username !== listener.USERNAME || password !== listener.PASSWORD)) {
    return null;
  }
  return listener;   // use listener as the “profile”
}

function isDomainAllowed (hostname, /* profile */ _) {
  // Plug‑in whitelist / ACL logic here if you need it
  return true;
}

/* ───────────────────────── 2. Core proxy handlers ──────────────────────── */

async function handleConnect (clientReq, clientSocket, head, listener) {
  console.log('CONNECT', clientReq.url);

  // Ensure the inbound tunnel socket is not prematurely timed out
  tuneSocket(clientSocket);

  const profile = authenticate(clientReq, listener);
  if (!profile) {
    const config = readConfig();
    if (config.maskProxyAuth) {
      clientSocket.write(
          'HTTP/1.1 200 OK\r\n' +
          'Content-Type: application/json\r\n' +
          'Connection: close\r\n\r\n{}'
      );
    } else {
      clientSocket.write(
          'HTTP/1.1 407 Proxy Authentication Required\r\n' +
          'Proxy-Authenticate: Basic realm="Proxy"\r\n' +
          'Connection: close\r\n\r\n'
      );
    }
    return clientSocket.end();
  }

  const [targetHost, targetPort = 443] = clientReq.url.split(':');
  const destPort = Number(targetPort);

  if (!isDomainAllowed(targetHost, profile)) {
    clientSocket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return clientSocket.end();
  }

  // ── Direct connection ───────────────────────────────────────────────────
  if (!profile.SOCKS_HOST) {
    const upstream = net.connect(destPort, targetHost, () => {
      clientSocket.write(
          'HTTP/1.1 200 Connection Established\r\n' +
          'Proxy-Agent: Socks‑Bridge\r\n\r\n'
      );
      if (head?.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    // Prevent upstream from timing out; enable TCP keep-alive
    tuneSocket(upstream);
    pipeErrors(clientSocket, upstream);
    return;
  }

  // ── Via SOCKS5 ──────────────────────────────────────────────────────────
  try {
    const timeouts = getTimeouts();
    const { socket: socksSocket } = await SocksClient.createConnection({
      proxy : {
        host: profile.SOCKS_HOST,
        port: profile.SOCKS_PORT,
        type: 5,
        userId : profile.SOCKS_USERNAME || undefined,
        password: profile.SOCKS_PASSWORD || undefined
      },
      command: 'connect',
      destination: { host: targetHost, port: destPort },
      timeout: timeouts.socks.handshakeTimeoutMs
    });

    clientSocket.write(
        'HTTP/1.1 200 Connection Established\r\n' +
        'Proxy-Agent: Socks‑Bridge\r\n\r\n'
    );
    if (head?.length) socksSocket.write(head);
    // Prevent SOCKS leg from timing out; enable TCP keep-alive
    tuneSocket(socksSocket);
    socksSocket.pipe(clientSocket);
    clientSocket.pipe(socksSocket);
    pipeErrors(clientSocket, socksSocket);
  } catch (err) {
    console.error('SOCKS CONNECT error:', err);
    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    clientSocket.end();
  }
}

async function handleRequest (clientReq, clientRes, listener) {
  const profile = authenticate(clientReq, listener);
  // Keep inbound socket open as much as possible
  if (clientReq?.socket) tuneSocket(clientReq.socket);
  if (!profile) {
    const config = readConfig();
    if (config.maskProxyAuth) {
      clientRes.writeHead(200, {
        'Content-Type': 'application/json', Connection: 'close'
      });
      return clientRes.end('{}');
    } else {
      clientRes.writeHead(407, {
        'Proxy-Authenticate': 'Basic realm="Proxy"', Connection: 'close'
      });
      return clientRes.end();
    }
  }

  let url;
  try { url = new URL(clientReq.url); }
  catch (e) {
    clientRes.writeHead(400, { Connection: 'close' });
    return clientRes.end('Invalid URL');
  }

  if (!isDomainAllowed(url.hostname, profile)) {
    clientRes.writeHead(403, { Connection: 'close' });
    return clientRes.end('Forbidden');
  }

  const strippedHeaders = { ...clientReq.headers };
  delete strippedHeaders['proxy-connection'];
  delete strippedHeaders['proxy-authorization'];

  // ── Direct path ─────────────────────────────────────────────────────────
  if (!profile.SOCKS_HOST) {
    const upstream = http.request({
      hostname: url.hostname,
      port    : url.port || 80,
      path    : url.pathname + url.search,
      method  : clientReq.method,
      headers : { ...strippedHeaders, host: url.host },
      agent   : httpAgent
    }, (upRes) => {
      clientRes.writeHead(upRes.statusCode, upRes.headers);
      upRes.pipe(clientRes);
    });
    // Ensure no client-side request timeout is applied
    try { upstream.setTimeout(0); } catch {_=>{}} // eslint-disable-line no-empty
    upstream.on('error', err => {
      console.error('HTTP upstream error:', err);
      clientRes.writeHead(500, { Connection: 'close' });
      clientRes.end('Upstream error');
    });
    return clientReq.pipe(upstream);
  }

  // ── SOCKS5 path ─────────────────────────────────────────────────────────
  const destPort = Number(url.port) || 80;
  try {
    const timeouts = getTimeouts();
    const { socket: socksSocket } = await SocksClient.createConnection({
      proxy : {
        host: profile.SOCKS_HOST,
        port: profile.SOCKS_PORT,
        type: 5,
        userId : profile.SOCKS_USERNAME || undefined,
        password: profile.SOCKS_PASSWORD || undefined
      },
      command: 'connect',
      destination: { host: url.hostname, port: destPort },
      timeout: timeouts.socks.handshakeTimeoutMs
    });

    // send initial request line + headers
    let head = `${clientReq.method} ${url.pathname + url.search} HTTP/1.1\r\n`;
    for (const k in strippedHeaders) head += `${k}: ${strippedHeaders[k]}\r\n`;
    head += '\r\n';
    socksSocket.write(head);
    // Keep SOCKS leg alive and disable idle timeouts
    tuneSocket(socksSocket);
    clientReq.pipe(socksSocket);

    let headerParsed = false;
    socksSocket.on('data', chunk => {
      if (!headerParsed) {
        const idx = chunk.indexOf('\r\n\r\n');
        if (idx !== -1) {
          const header = chunk.slice(0, idx).toString();
          const [statusLine, ...hdrLines] = header.split('\r\n');
          const statusCode = Number(statusLine.split(' ')[1]) || 502;
          const headers = {};
          hdrLines.forEach(l => {
            const [k, ...v] = l.split(':');
            headers[k.trim()] = v.join(':').trim();
          });
          clientRes.writeHead(statusCode, headers);
          headerParsed = true;
          clientRes.write(chunk.slice(idx + 4)); // body after headers
        }
      } else {
        clientRes.write(chunk);
      }
    });

    socksSocket.on('end', () => clientRes.end());
    socksSocket.on('error', err => {
      console.error('SOCKS HTTP error:', err);
      if (!clientRes.headersSent)
        clientRes.writeHead(502, { Connection: 'close' });
      clientRes.end('SOCKS upstream error');
    });
  } catch (err) {
    console.error('SOCKS HTTP path error:', err);
    clientRes.writeHead(502, { Connection: 'close' });
    clientRes.end('SOCKS connection failed');
  }
}

/* ───────────────────────── 3. Lifecycle helpers ────────────────────────── */

function pipeErrors (a, b) {
  a.on('error', () => b.destroy());
  b.on('error', () => a.destroy());
}

function startProxyServers () {
  try {
    stopProxyServers();                   // purge old ones if any
    const cfg = readConfig();

    if (!fs.existsSync(cfg.tlsKey) || !fs.existsSync(cfg.tlsCert)) {
      console.error('TLS key/cert files missing');
      return false;
    }
    const tlsOpts = {
      key : fs.readFileSync(cfg.tlsKey),
      cert: fs.readFileSync(cfg.tlsCert)
    };

    const timeouts = getTimeouts();
    cfg.httpsProxyListeners.forEach(listener => {
      const server = https.createServer(tlsOpts);

      try { server.requestTimeout = timeouts.server.requestTimeout; } catch {}
      try { server.headersTimeout = timeouts.server.headersTimeout; } catch {}
      try { server.keepAliveTimeout = timeouts.server.keepAliveTimeout; } catch {}
      try { server.setTimeout(timeouts.server.socketTimeout); } catch {}

      server.on('connect', (req, sock, head) => {
          // Ensure inbound socket has generous settings before tunneling
          tuneSocket(sock);
          handleConnect(req, sock, head, listener);
      });
      server.on('request', (req, res) =>
          handleRequest(req, res, listener)
      );

      server.listen(listener.port, () =>
          console.log(`HTTPS proxy listening on ${listener.port}`)
      );

      activeServers.push({ port: listener.port, server });
    });

    console.log('All configured HTTPS proxies are up.');
    return true;
  } catch (err) {
    console.error('startProxyServers error:', err);
    return false;
  }
}

function stopProxyServers () {
  activeServers.forEach(({ port, server }) => {
    try {
      server.close(() =>
          console.log(`Stopped HTTPS proxy on ${port}`)
      );
    } catch (e) {
      console.error(`Error closing server on ${port}:`, e);
    }
  });
  activeServers = [];
  return true;
}

function reloadProxyServers () {
  console.log('Reloading proxies…');
  return startProxyServers();
}

/* ──────────────────────────── exports ──────────────────────────────────── */
module.exports = {
  startProxyServers,
  stopProxyServers,
  reloadProxyServers
};
