const rateLimit = require('express-rate-limit');

/* General API limit — 500 requests per 15 minutes per IP */
const general = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' }
});

/* Strict limit for auth routes — 20 attempts per 15 minutes */
const auth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' }
});

/* Message sending — 30 messages per 10 minutes */
const send = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Sending too fast. Slow down.' }
});

/* Likes — 120 per minute */
const like = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many likes. Slow down.' }
});

/* Replies — 20 per hour */
const reply = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Reply limit reached for this hour.' }
});

module.exports = { general, auth, send, like, reply };