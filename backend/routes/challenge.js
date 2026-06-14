const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { supabase } = require('../db');
const { general } = require('../middleware/rateLimit');

const REQUIREMENTS = {
  qualified_messages:      50,  // messages received with 10+ chars
  messages_with_10_likes:  10,  // received messages that each have 10+ likes
  posts_liked:             10,  // posts they liked on the feed
  replies_sent:            20,  // replies they sent
};
const CHALLENGE_DAYS  = 3;
const REWARD_AMOUNT   = 3500;
const MIN_MSG_CHARS   = 10;
const MIN_MSG_LIKES   = 10;

function isComplete(entry) {
  return (
    (entry.qualified_messages     || 0) >= REQUIREMENTS.qualified_messages &&
    (entry.messages_with_10_likes || 0) >= REQUIREMENTS.messages_with_10_likes &&
    (entry.posts_liked            || 0) >= REQUIREMENTS.posts_liked &&
    (entry.replies_sent           || 0) >= REQUIREMENTS.replies_sent
  );
}

/* ── POST /api/challenge/join ── */
router.post('/join', general, async (req, res) => {
  try {
    const { verifySession } = require('./auth');
    const token    = (req.headers.authorization || '').replace('Bearer ', '');
    const username = verifySession(token);
    if (!username) return res.status(401).json({ error: 'Open your inbox first.' });

    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required to claim your reward.' });
    }

    // Check if already joined
    const { data: existing } = await supabase
      .from('challenge_entries')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      return res.json({ ok: true, already_joined: true, entry: existing });
    }

    const deadline = new Date(
      Date.now() + CHALLENGE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: entry, error } = await supabase
      .from('challenge_entries')
      .insert({ username, email, deadline })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ ok: true, entry, requirements: REQUIREMENTS, reward: REWARD_AMOUNT });

  } catch(err) {
    console.error('[challenge/join]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

/* ── GET /api/challenge/status ── */
router.get('/status', general, async (req, res) => {
  try {
    const { verifySession } = require('./auth');
    const token    = (req.headers.authorization || '').replace('Bearer ', '');
    const username = verifySession(token);
    if (!username) return res.status(401).json({ error: 'Not authenticated.' });

    const { data: entry, error } = await supabase
      .from('challenge_entries')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (error) throw error;
    if (!entry) return res.json({ joined: false, requirements: REQUIREMENTS, reward: REWARD_AMOUNT });

    // Recount messages_with_10_likes live from the messages table
    // so it updates automatically as likes accumulate
    const { data: likedMsgs } = await supabase
      .from('messages')
      .select('id, likes')
      .eq('recipient_username', username)
      .eq('is_public', true)
      .gte('likes', MIN_MSG_LIKES)
      .gte('created_at', entry.joined_at);

    const liveWith10Likes = likedMsgs ? likedMsgs.length : 0;

    // Update if changed
    if (liveWith10Likes !== entry.messages_with_10_likes) {
      await supabase
        .from('challenge_entries')
        .update({ messages_with_10_likes: liveWith10Likes })
        .eq('username', username);
      entry.messages_with_10_likes = liveWith10Likes;
    }

    const expired  = new Date(entry.deadline) < new Date();
    const complete = isComplete(entry);

    // Auto-mark eligible
    if (complete && !entry.is_eligible) {
      await supabase
        .from('challenge_entries')
        .update({ is_eligible: true, completed_at: new Date().toISOString() })
        .eq('username', username);
      entry.is_eligible  = true;
      entry.completed_at = new Date().toISOString();
    }

    return res.json({
      joined:       true,
      entry,
      requirements: REQUIREMENTS,
      reward:       REWARD_AMOUNT,
      complete,
      expired,
      progress: {
        qualified_messages:     { current: entry.qualified_messages     || 0, target: REQUIREMENTS.qualified_messages },
        messages_with_10_likes: { current: entry.messages_with_10_likes || 0, target: REQUIREMENTS.messages_with_10_likes },
        posts_liked:            { current: entry.posts_liked            || 0, target: REQUIREMENTS.posts_liked },
        replies_sent:           { current: entry.replies_sent           || 0, target: REQUIREMENTS.replies_sent },
      }
    });

  } catch(err) {
    console.error('[challenge/status]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

/* ── INTERNAL TRACKING FUNCTIONS ──
   Called from other routes — not exposed as HTTP endpoints
*/

async function trackMessageReceived(recipientUsername, messageText, senderIP) {
  try {
    if (!recipientUsername) return;

    const { data: entry } = await supabase
      .from('challenge_entries')
      .select('*')
      .eq('username', recipientUsername)
      .maybeSingle();

    if (!entry) return;
    if (new Date(entry.deadline) < new Date()) return;
    if (entry.is_eligible) return;

    const isQualified = messageText && messageText.length >= MIN_MSG_CHARS;
    if (!isQualified) return;

    const ipHash      = senderIP
      ? crypto.createHash('sha256').update(senderIP).digest('hex')
      : null;
    const senderIPs   = entry.unique_sender_ips || [];
    const isNewSender = ipHash && !senderIPs.includes(ipHash);

    const updates = {
      qualified_messages: (entry.qualified_messages || 0) + 1
    };

    if (isNewSender && ipHash) {
      updates.unique_sender_ips = [...senderIPs, ipHash];
    }

    await supabase
      .from('challenge_entries')
      .update(updates)
      .eq('username', recipientUsername);

  } catch(e) {
    console.error('[challenge/track/message]', e);
  }
}

async function trackPostLiked(username) {
  try {
    if (!username) return;

    const { data: entry } = await supabase
      .from('challenge_entries')
      .select('posts_liked, deadline, is_eligible')
      .eq('username', username)
      .maybeSingle();

    if (!entry) return;
    if (new Date(entry.deadline) < new Date()) return;
    if (entry.is_eligible) return;

    await supabase
      .from('challenge_entries')
      .update({ posts_liked: (entry.posts_liked || 0) + 1 })
      .eq('username', username);

  } catch(e) {
    console.error('[challenge/track/like]', e);
  }
}

async function trackUnliked(username) {
  try {
    if (!username) return;

    const { data: entry } = await supabase
      .from('challenge_entries')
      .select('posts_liked, deadline, is_eligible')
      .eq('username', username)
      .maybeSingle();

    if (!entry) return;
    if (entry.is_eligible) return;

    await supabase
      .from('challenge_entries')
      .update({ posts_liked: Math.max(0, (entry.posts_liked || 0) - 1) })
      .eq('username', username);

  } catch(e) {
    console.error('[challenge/track/unlike]', e);
  }
}

async function trackReply(username) {
  try {
    if (!username) return;

    const { data: entry } = await supabase
      .from('challenge_entries')
      .select('replies_sent, deadline, is_eligible')
      .eq('username', username)
      .maybeSingle();

    if (!entry) return;
    if (new Date(entry.deadline) < new Date()) return;
    if (entry.is_eligible) return;

    await supabase
      .from('challenge_entries')
      .update({ replies_sent: (entry.replies_sent || 0) + 1 })
      .eq('username', username);

  } catch(e) {
    console.error('[challenge/track/reply]', e);
  }
}

module.exports = router;
module.exports.trackMessageReceived = trackMessageReceived;
module.exports.trackPostLiked       = trackPostLiked;
module.exports.trackUnliked         = trackUnliked;
module.exports.trackReply           = trackReply;