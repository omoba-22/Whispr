require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const { general } = require('./middleware/rateLimit');
const { sanitizeBody } = require('./middleware/sanitize');

const authRoutes     = require('./routes/auth');
const messageRoutes  = require('./routes/messages');
const replyRoutes    = require('./routes/replies');
const paymentRoutes = require('./routes/payment');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── SECURITY HEADERS ── */
app.use(helmet());

/* ── CORS ──
   Only allow requests from your frontend URL.
   In development: http://127.0.0.1:5500 (VS Code Live Server default)
   In production: your actual domain e.g. https://whispr.vercel.app
*/
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://whispr-puce-six.vercel.app',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.options('*', cors());

/* ── BODY PARSING ── */
app.use(express.json({ limit: '10kb' })); // limit body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/* ── GLOBAL SANITIZE ── */
app.use(sanitizeBody);

/* ── GLOBAL RATE LIMIT ── */
app.use('/api/', general);

/* ── ROUTES ── */
app.use('/api/auth',     authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/replies',  replyRoutes);

// add this right after the existing app.use routes
app.use('/api/payment', paymentRoutes);

/* ── HEALTH CHECK ── */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/* ── 404 ── */
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

/* ── GLOBAL ERROR HANDLER ── */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Something went wrong.' });
});

/* ── START ── */
app.listen(PORT, () => {
  console.log(`
  ✦ Whispr backend running
  ─────────────────────────
  Local:   http://localhost:${PORT}
  Health:  http://localhost:${PORT}/api/health
  `);
});