# socks-bridge

socks-bridge is a Node.js project that exposes one or more **HTTPS CONNECT proxies** on specified ports and forwards all traffic through SOCKS5. It’s particularly useful for scenarios where you need multiple HTTPS proxy endpoints that each tunnel traffic through different SOCKS5 configurations.

## Features

- **Multiple HTTPS Listeners**  
  Spin up multiple proxy servers, each on a different port, with distinct SOCKS5 settings.
- **HTTPS CONNECT Support**  
  Tunnels TLS traffic through a secure channel and forwards via SOCKS5.
- **Optional Basic Authentication**  
  Prompt users for credentials before allowing them to proxy traffic.
- **Direct or SOCKS5 Forwarding**  
  If no SOCKS server is specified for a port, the connection will be made directly.
- **Domain Filtering (stub)**  
  A placeholder function is included if you want to filter/allow specific domains.

## Table of Contents

1. [Requirements](#requirements)
2. [Installation](#installation)
3. [Usage](#usage)
4. [Configuration](#configuration)
5. [Example](#example)
6. [Limitations](#limitations)
7. [License](#license)

---

## Requirements

- **Node.js 14+** (or higher)
- **npm** (or `yarn`)
- A valid **TLS certificate** and **private key** (for HTTPS)

If you do not need Basic Auth or domain-based filtering, you can remove those parts from the code.

---

## Installation

1. **Clone** the repository:
   ```bash
   git clone https://github.com/KevinWang15/socks-bridge.git
   cd socks-bridge
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Obtain/Copy your TLS certificate and key** into the project folder or a known location.

---

## Usage

1. **Configure** your server using `config.js` (see [Configuration](#configuration)).
2. **Run** the proxy:
   ```bash
   node index.js
   ```
3. **Point** your client (cURL, browser, etc.) at the HTTPS proxy:

    - For example, to connect through the proxy on `localhost:8443`:
      ```bash
      curl --proxy https://username:password@localhost:8443 https://example.com
      ```
    - Make sure the client trusts your TLS certificate if it’s self-signed.

---

## Configuration

Edit `config.js` to adjust settings. By default, it should export:

```js
module.exports = {
  domainName: 'example.com',        // (Optional) domain name for SNI usage
  tlsCert: './certs/cert.pem',      // Path to your certificate file
  tlsKey: './certs/key.pem',        // Path to your private key file
  httpsProxyListeners: [
    {
      port: 8443,
      SOCKS_HOST: '127.0.0.1',
      SOCKS_PORT: 1080,
      SOCKS_USERNAME: 'user1',
      SOCKS_PASSWORD: 'password1'
    },
    {
      port: 9443,
      SOCKS_HOST: '127.0.0.1',
      SOCKS_PORT: 1080,
      SOCKS_USERNAME: '',
      SOCKS_PASSWORD: ''
    }
  ]
};
```

- **`tlsCert` / `tlsKey`:** paths to your TLS certificate and private key.
- **`httpsProxyListeners`:** an array of objects describing one HTTPS listener per port.
    - **`port`:** The TCP port to listen on for HTTPS/CONNECT requests.
    - **`SOCKS_HOST`, `SOCKS_PORT`:** The SOCKS5 server details.
    - **`SOCKS_USERNAME`, `SOCKS_PASSWORD`:** Optional. Basic authentication credentials for the SOCKS proxy.
    - If you leave them blank, you can either skip authentication or modify how the code handles it.

---

## Example

**Example `config.js`:**

```js
module.exports = {
  domainName: 'my-proxy.local',
  tlsCert: './certs/cert.pem',
  tlsKey: './certs/key.pem',
  httpsProxyListeners: [
    {
      port: 8443,
      SOCKS_HOST: '127.0.0.1',
      SOCKS_PORT: 1080,
      SOCKS_USERNAME: 'user1',
      SOCKS_PASSWORD: 'pass1'
    },
    {
      port: 9443,
      SOCKS_HOST: '127.0.0.1',
      SOCKS_PORT: 1080,
      SOCKS_USERNAME: '',
      SOCKS_PASSWORD: ''
    }
  ]
};
```

**Running the Proxy:**

```bash
node index.js
```

You should see:
```
HTTPS Proxy listening on port 8443
HTTPS Proxy listening on port 9443
All configured HTTPS proxies are up and running...
```

**Using cURL with Basic Auth:**

```bash
curl --proxy https://user1:pass1@localhost:8443 https://example.com
```

---

## License

MIT License