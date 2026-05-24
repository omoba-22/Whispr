const rateLimit = require('express-rate-limit');

/* General API limit — 100 requests per 15 minutes per IP */
const general = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' }
});

/* Strict limit for auth routes — 10 attempts per 15 minutes */
const auth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' }
});

/* Message sending — 20 messages per 10 minutes */
const send = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Sending too fast. Slow down.' }
});

/* Likes — 60 per minute */
const like = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many likes. Slow down.' }
});

/* Replies — 10 per hour */
const reply = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Reply limit reached for this hour.' }
});

module.exports = { general, auth, send, like, reply };