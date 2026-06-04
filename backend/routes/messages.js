const express = require('express');
const router  = express.Router();
const { supabase } = require('../db');
const { clean, normalize, requireFields } = require('../middleware/sanitize');
const { send, like, general } = require('../middleware/rateLimit');

const VALID_MOODS = ['😤 Vent', '💀 No Cap', '🥺 Feels', '🔥 Hot Take', '👀 Tea'];

/* ── POST /api/messages/send ──
   Send an anonymous message. Rate limited to 20 per 10 minutes.
*/
router.post('/send', send, requireFields('message', 'mood'), async (req, res) => {
  try {
    const message   = clean(req.body.message);
    const mood      = req.body.mood;
    const recipient = req.body.recipient_username
      ? normalize(req.body.recipient_username) : null;
    const isPublic  = req.body.is_public !== false; // default true

    // Validate
    if (message.length < 1 || message.length > 300) {
      return res.status(400).json({ error: 'Message must be 1-300 characters.' });
    }
    if (!VALID_MOODS.includes(mood)) {
      return res.status(400).json({ error: 'Invalid mood.' });
    }

    // If recipient given, verify they exist
    if (recipient) {
      const { data: user, error } = await supabase
        .from('users')
        .select('id')
        .eq('username', recipient)
        .maybeSingle();
      if (error) throw error;
      if (!user) {
        return res.status(404).json({ error: `User @${recipient} doesn't exist.` });
      }
    }

    const { error: insertErr } = await supabase
      .from('messages')
      .insert({
        message,
        mood,
        is_public: isPublic,
        recipient_username: recipient,
        likes: 0
      });

    if (insertErr) throw insertErr;
    return res.status(201).json({ ok: true });

  } catch (err) {
    console.error('[messages/send]', err);
    return res.status(500).json({ error: 'Server error. Try again.' });
  }
});

/* ── GET /api/messages/feed ──
   Public feed — last 72h, paginated, filterable by mood.
*/
router.get('/feed', general, async (req, res) => {
  try {
    const mood   = req.query.mood || null;
    const page   = Math.max(0, parseInt(req.query.page || '0'));
    const limit  = 30;
    const offset = page * limit;
    const since  = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('messages')
      .select('id, message, mood, likes, created_at, reply_text, recipient_username', { count: 'exact' })
      .eq('is_public', true)
      .is('reply_to_id', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (mood && VALID_MOODS.includes(mood)) {
      query = query.eq('mood', mood);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    // Strip recipient names from public feed for privacy
    const safe = (data || []).map(m => ({ ...m, recipient_username: undefined }));
    return res.json({ messages: safe, total: count, page, hasMore: offset + limit < count });

  } catch (err) {
    console.error('[messages/feed]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/messages/trending ──
   Top 10 most liked in last 24h.
*/
router.get('/trending', general, async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('messages')
      .select('id, message, mood, likes, created_at, reply_text')
      .eq('is_public', true)
      .is('reply_to_id', null)
      .gte('created_at', since)
      .order('likes', { ascending: false })
      .limit(10);

    if (error) throw error;
    return res.json({ messages: data || [] });

  } catch (err) {
    console.error('[messages/trending]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/messages/top-mood ──
   Most used mood in the last 24h (for the crown effect).
*/
router.get('/top-mood', general, async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('messages')
      .select('mood')
      .eq('is_public', true)
      .gte('created_at', since);

    if (error) throw error;
    if (!data || !data.length) return res.json({ topMood: null });

    const counts = {};
    data.forEach(m => { counts[m.mood] = (counts[m.mood] || 0) + 1; });
    const topMood = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return res.json({ topMood });

  } catch (err) {
    console.error('[messages/top-mood]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/messages/inbox/:username ──
   Fetch inbox for a verified user.
   Requires session token in Authorization header.
*/
router.get('/inbox/:username', general, async (req, res) => {
  try {
    const { verifySession } = require('./auth');
    const token    = (req.headers.authorization || '').replace('Bearer ', '');
    const verified = verifySession(token);

    if (!verified) {
      return res.status(401).json({ error: 'Not authenticated. Open your inbox first.' });
    }

    const username = normalize(req.params.username);
    if (verified !== username) {
      return res.status(403).json({ error: 'You can only view your own inbox.' });
    }

    const { data, error } = await supabase
      .from('messages')
      .select('id, message, mood, likes, created_at, reply_text, is_public')
      .eq('recipient_username', username)
      .is('reply_to_id', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json({ messages: data || [] });

  } catch (err) {
    console.error('[messages/inbox]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

/* ── POST /api/messages/like/:id ──
   Toggle like on a message. Server tracks by IP to prevent spam.
   One like per IP per message.
*/
// In-memory like tracker: Map<messageId, Set<ip>>
const likeTracker = new Map();

const crypto = require('crypto');

router.post('/like/:id', like, async (req, res) => {
  try {
    const id     = req.params.id;
    const rawIP  = req.ip || req.connection.remoteAddress || 'unknown';
    // Hash the IP for privacy
    const ipHash = crypto.createHash('sha256').update(rawIP).digest('hex');

    // Check if already liked
    const { data: existing } = await supabase
      .from('message_likes')
      .select('id')
      .eq('message_id', id)
      .eq('ip_hash', ipHash)
      .maybeSingle();

    // Get current likes
    const { data: msg, error: fetchErr } = await supabase
      .from('messages')
      .select('likes')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!msg) return res.status(404).json({ error: 'Message not found.' });

    let newLikes;
    let action;

    if (existing) {
      // Unlike — remove record
      await supabase.from('message_likes').delete()
        .eq('message_id', id).eq('ip_hash', ipHash);
      newLikes = Math.max(0, (msg.likes || 0) - 1);
      action   = 'unliked';
    } else {
      // Like — add record
      await supabase.from('message_likes').insert({ message_id: id, ip_hash: ipHash });
      newLikes = (msg.likes || 0) + 1;
      action   = 'liked';
    }

    await supabase.from('messages').update({ likes: newLikes }).eq('id', id);
    return res.json({ ok: true, likes: newLikes, action });

  } catch(err) {
    console.error('[messages/like]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;