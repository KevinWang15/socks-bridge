// utils/certUtils.js
// Extracts the first DNS name (or CN) from a PEM‑encoded certificate.

const fs = require('fs');
const { X509Certificate } = require('crypto');

function getTlsDomain(certPath) {
  try {
    const pem = fs.readFileSync(certPath, 'utf8');
    const cert = new X509Certificate(pem);

    // Prefer Subject Alt Name, fallback to CN
    const san = cert.subjectAltName;          // e.g. 'DNS:example.com, DNS:www.example.com'
    if (san) {
      const dns = san.split(',').map(s => s.trim().replace(/^DNS:/, ''));
      if (dns.length) return dns[0];          // first SAN entry
    }

    const m = cert.subject.match(/CN=([^,\/]+)/);
    return m ? m[1] : null;
  } catch (e) {
    console.error('[certUtils] Failed to parse certificate:', e.message);
    return null;
  }
}

module.exports = { getTlsDomain };

