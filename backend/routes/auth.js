const express  = require('express');
const bcrypt   = require('bcrypt');
const router   = express.Router();
const { supabase } = require('../db');
const { normalize, validUsername, validSecret, requireFields } = require('../middleware/sanitize');
const { auth } = require('../middleware/rateLimit');
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

/* ── POST /api/auth/register ──
   Create a new user with a unique username and hashed secret.
*/
router.post('/register', auth, requireFields('username', 'secret'), async (req, res) => {
  try {
    const username = normalize(req.body.username);
    const secret   = normalize(req.body.secret);

    if (!validUsername(username)) {
      return res.status(400).json({ error: 'Username must be 2-30 characters: letters, numbers, and _ only.' });
    }
    if (!validSecret(secret)) {
      return res.status(400).json({ error: 'Secret code must be at least 3 characters.' });
    }

    // Check if username already taken
    const { data: existing, error: checkErr } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (checkErr) throw checkErr;
    if (existing) {
      return res.status(409).json({ error: 'That username is already taken. Try another.' });
    }

    // Hash the secret with bcrypt
    const secretHash = await bcrypt.hash(secret, BCRYPT_ROUNDS);

    // Insert user
    const { error: insertErr } = await supabase
      .from('users')
      .insert({ username, secret_hash: secretHash });

    if (insertErr) {
      // Handle race condition unique constraint
      if (insertErr.code === '23505') {
        return res.status(409).json({ error: 'That username was just taken. Try another.' });
      }
      throw insertErr;
    }

    return res.status(201).json({ ok: true, username });

  } catch (err) {
    console.error('[auth/register]', err);
    return res.status(500).json({ error: 'Server error. Try again.' });
  }
});

/* ── POST /api/auth/verify ──
   Verify username + secret. Returns ok:true and a session token if valid.
   We use a simple signed token stored server-side via a sessions map.
   (For production scale: use JWT or Supabase Auth instead)
*/

// In-memory session store — good enough for MVP
// Key: token, Value: { username, expires }
const sessions = new Map();
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function createSession(username) {
  const token = require('crypto').randomBytes(32).toString('hex');
  sessions.set(token, { username, expires: Date.now() + SESSION_TTL });
  // Cleanup old sessions every time we create one
  for (const [t, s] of sessions.entries()) {
    if (s.expires < Date.now()) sessions.delete(t);
  }
  return token;
}

function verifySession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) { sessions.delete(token); return null; }
  return session.username;
}

// Export so other routes can use it
module.exports.verifySession = verifySession;

router.post('/verify', auth, requireFields('username', 'secret'), async (req, res) => {
  try {
    const username = normalize(req.body.username);
    const secret   = normalize(req.body.secret);

    if (!validUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format.' });
    }

    // Fetch user record
    const { data: user, error } = await supabase
      .from('users')
      .select('id, secret_hash')
      .eq('username', username)
      .maybeSingle();

    if (error) throw error;
    if (!user) {
      // Don't reveal whether username exists
      return res.status(401).json({ error: 'Wrong username or secret code.' });
    }

    // Compare with bcrypt
    const match = await bcrypt.compare(secret, user.secret_hash);
    if (!match) {
      return res.status(401).json({ error: 'Wrong username or secret code.' });
    }

    // Create session token
    const token = createSession(username);
    return res.json({ ok: true, username, token });

  } catch (err) {
    console.error('[auth/verify]', err);
    return res.status(500).json({ error: 'Server error. Try again.' });
  }
});

/* ── GET /api/auth/check ──
   Check if a username exists (for the create page)
*/
router.get('/check/:username', async (req, res) => {
  try {
    const username = normalize(req.params.username);
    if (!validUsername(username)) {
      return res.status(400).json({ error: 'Invalid username.' });
    }
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (error) throw error;
    return res.json({ available: !data });
  } catch (err) {
    console.error('[auth/check]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/reset', auth, requireFields('username', 'new_secret'), async (req, res) => {
  try {
    const username   = normalize(req.body.username);
    const newSecret  = normalize(req.body.new_secret);

    if (!validUsername(username))    return res.status(400).json({ error: 'Invalid username.' });
    if (!validSecret(newSecret))     return res.status(400).json({ error: 'New secret too short.' });

    // Check user exists
    const { data: user, error: findErr } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!user) return res.status(404).json({ error: 'Username not found.' });

    // Delete all their inbox messages
    await supabase
      .from('messages')
      .delete()
      .eq('recipient_username', username);

    // Reset reply counts
    await supabase
      .from('reply_counts')
      .delete()
      .eq('username', username);

    // Update secret hash
    const newHash = await bcrypt.hash(newSecret, BCRYPT_ROUNDS);
    const { error: updateErr } = await supabase
      .from('users')
      .update({ secret_hash: newHash })
      .eq('username', username);

    if (updateErr) throw updateErr;

    return res.json({ ok: true });
  } catch(err) {
    console.error('[auth/reset]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
module.exports.verifySession = verifySession;