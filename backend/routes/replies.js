const express = require('express');
const router  = express.Router();
const { supabase } = require('../db');
const { clean } = require('../middleware/sanitize');
const { general } = require('../middleware/rateLimit');

const FREE_REPLY_LIMIT = 3;

function getMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

async function getUserStatus(username) {
  const { data } = await supabase
    .from('users')
    .select('paid_replies, unlimited_until, pending_replies')
    .eq('username', username)
    .maybeSingle();
  const hasUnlimited = data?.unlimited_until && new Date(data.unlimited_until) > new Date();
  const paidReplies  = data?.paid_replies  || 0;
  const pending      = data?.pending_replies || 0;
  return { hasUnlimited, paidReplies, pending, unlimited_until: data?.unlimited_until };
}

async function getUsedCount(username) {
  const monthKey = getMonthKey();
  const { data } = await supabase
    .from('reply_counts')
    .select('used')
    .eq('username', username)
    .eq('month_key', monthKey)
    .maybeSingle();
  return { used: data?.used || 0, monthKey };
}

router.get('/count', general, async (req, res) => {
  try {
    const { verifySession } = require('./auth');
    const token    = (req.headers.authorization || '').replace('Bearer ', '');
    const username = verifySession(token);
    if (!username) return res.status(401).json({ error: 'Not authenticated.' });

    const { hasUnlimited, paidReplies, pending, unlimited_until } = await getUserStatus(username);
    const { used } = await getUsedCount(username);

    // If savage pass just expired, move pending to paid
    if (!hasUnlimited && unlimited_until && pending > 0) {
      await supabase.from('users')
        .update({ paid_replies: paidReplies + pending, pending_replies: 0 })
        .eq('username', username);
    }

    const limit = hasUnlimited ? -1 : FREE_REPLY_LIMIT + paidReplies;

    return res.json({
      used,
      limit,
      remaining:     hasUnlimited ? -1 : Math.max(0, limit - used),
      has_unlimited: !!hasUnlimited,
      paid_replies:  paidReplies,
      pending_replies: pending
    });
  } catch(err) {
    console.error('[replies/count]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/send', general, async (req, res) => {
  try {
    const { verifySession } = require('./auth');
    const token    = (req.headers.authorization || '').replace('Bearer ', '');
    const username = verifySession(token);
    if (!username) return res.status(401).json({ error: 'Not authenticated.' });

    const replyText = (req.body.reply_text || '').trim();
    const replyToId = req.body.reply_to_id;
    const isPublic  = req.body.is_public !== false;

    if (!replyText || replyText.length < 1 || replyText.length > 280) {
      return res.status(400).json({ error: 'Reply must be 1-280 characters.' });
    }
    if (!replyToId) return res.status(400).json({ error: 'Target message is required.' });

    // Verify message belongs to this user
    const { data: msg, error: msgErr } = await supabase
      .from('messages')
      .select('id, recipient_username, reply_text')
      .eq('id', replyToId)
      .maybeSingle();
    if (msgErr) throw msgErr;
    if (!msg) return res.status(404).json({ error: 'Message not found.' });
    if (msg.recipient_username !== username) {
      return res.status(403).json({ error: 'You can only reply to your own messages.' });
    }

    // Check limits
    const { hasUnlimited, paidReplies } = await getUserStatus(username);
    const { used, monthKey } = await getUsedCount(username);
    const totalAllowed = hasUnlimited ? Infinity : FREE_REPLY_LIMIT + paidReplies;

    if (!hasUnlimited && used >= totalAllowed) {
      return res.status(402).json({ error: 'Reply limit reached.', upgrade: true });
    }

    // Save reply on original message
    const { error: updErr } = await supabase
      .from('messages')
      .update({ reply_text: replyText, is_public: isPublic })
      .eq('id', replyToId);
    if (updErr) throw updErr;

    // Also insert as a reply message for the feed
    await supabase.from('messages').insert({
      message:     replyText,
      mood:        '↩️ Reply',
      is_public:   isPublic,
      reply_to_id: replyToId,
      reply_text:  replyText,
      likes:       0
    });

    // Increment monthly count
    const newCount = used + 1;
    await supabase.from('reply_counts').upsert(
      { username, month_key: monthKey, used: newCount },
      { onConflict: 'username,month_key' }
    );

    // Deduct paid reply if used beyond free limit
    if (!hasUnlimited && used >= FREE_REPLY_LIMIT && paidReplies > 0) {
      await supabase.from('users')
        .update({ paid_replies: paidReplies - 1 })
        .eq('username', username);
    }

    const newLimit     = hasUnlimited ? -1 : FREE_REPLY_LIMIT + Math.max(0, paidReplies - (used >= FREE_REPLY_LIMIT ? 1 : 0));
    const remaining    = hasUnlimited ? -1 : Math.max(0, newLimit - newCount);

    return res.json({ ok: true, used: newCount, remaining });
  } catch(err) {
    console.error('[replies/send]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/feed', general, async (req, res) => {
  try {
    const order = req.query.sort === 'liked' ? 'likes' : 'created_at';
    const since = new Date(Date.now() - 72*60*60*1000).toISOString();

    const { data, error } = await supabase
      .from('messages')
      .select('id, message, mood, likes, created_at, reply_to_id')
      .eq('is_public', true)
      .not('reply_to_id', 'is', null)
      .gte('created_at', since)
      .order(order, { ascending: false })
      .limit(30);

    if (error) throw error;

    const enriched = await Promise.all((data || []).map(async (replyMsg) => {
      const { data: original } = await supabase
        .from('messages')
        .select('message, mood')
        .eq('id', replyMsg.reply_to_id)
        .maybeSingle();
      return {
        ...replyMsg,
        original_message: original?.message || '',
        original_mood:    original?.mood    || ''
      };
    }));

    return res.json({ messages: enriched });
  } catch(err) {
    console.error('[replies/feed]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;