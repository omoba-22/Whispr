const xss = require('xss');

/* Strip XSS from any string */
function clean(str) {
  if (typeof str !== 'string') return '';
  return xss(str.trim());
}

/* Normalize: lowercase + no spaces */
function normalize(str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/\s+/g, '');
}

/* Validate username: letters, numbers, underscore, 2-30 chars */
function validUsername(username) {
  return /^[a-z0-9_]{2,30}$/.test(username);
}

/* Validate secret: 3-60 chars after normalize */
function validSecret(secret) {
  return secret.length >= 3 && secret.length <= 60;
}

/* Main sanitize middleware — cleans req.body fields */
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = clean(req.body[key]);
      }
    }
  }
  next();
}

/* Validate required fields */
function requireFields(...fields) {
  return (req, res, next) => {
    for (const field of fields) {
      if (!req.body[field] || req.body[field].toString().trim() === '') {
        return res.status(400).json({ error: `${field} is required.` });
      }
    }
    next();
  };
}

module.exports = { clean, normalize, validUsername, validSecret, sanitizeBody, requireFields };