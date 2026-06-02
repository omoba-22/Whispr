const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const crypto  = require('crypto');
const { supabase } = require('../db');
const { general } = require('../middleware/rateLimit');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const FRONTEND_URL    = process.env.FRONTEND_URL;

const PACKS = {
  starter: { replies: 5,           amount: 30000,  label: 'Starter Pack' },
  popular: { replies: 20,          amount: 70000,  label: 'Popular Pack' },
  savage:  { replies: 'unlimited', amount: 150000, label: 'Savage Pass'  }
};

async function activatePack(username, packId) {
  const pack = PACKS[packId];
  if (!pack) return;

  const { data: userData } = await supabase
    .from('users')
    .select('paid_replies, unlimited_until, pending_replies, total_paid_replies')
    .eq('username', username)
    .maybeSingle();

  const hasActiveSavage  = userData?.unlimited_until && new Date(userData.unlimited_until) > new Date();
  const currentPaid      = userData?.paid_replies       || 0;
  const currentPending   = userData?.pending_replies    || 0;
  const currentTotal     = userData?.total_paid_replies || 0;

  let updateData = {};

  if (packId === 'savage') {
    const expiryDate = new Date(Date.now() + 30*24*60*60*1000).toISOString();
    updateData = { unlimited_until: expiryDate };
  } else {
    if (hasActiveSavage) {
      updateData = {
        pending_replies:    currentPending + pack.replies,
        total_paid_replies: currentTotal   + pack.replies
      };
    } else {
      updateData = {
        paid_replies:       currentPaid  + pack.replies,
        total_paid_replies: currentTotal + pack.replies
      };
    }
  }

  await supabase.from('users').update(updateData).eq('username', username);
}

router.post('/initiate', general, async (req, res) => {
  try {
    const { verifySession } = require('./auth');
    const token    = (req.headers.authorization || '').replace('Bearer ', '');
    const username = verifySession(token);
    if (!username) return res.status(401).json({ error: 'Not authenticated. Open your inbox first.' });

    const packId = req.body.pack_id;
    const email  = req.body.email;

    if (!packId || !PACKS[packId]) return res.status(400).json({ error: 'Invalid pack.' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required.' });

    const pack = PACKS[packId];

    // Block re-buying active Savage Pass
    if (packId === 'savage') {
      const { data: userData } = await supabase
        .from('users').select('unlimited_until').eq('username', username).maybeSingle();
      const hasActiveSavage = userData?.unlimited_until && new Date(userData.unlimited_until) > new Date();
      if (hasActiveSavage) {
        return res.status(400).json({
          error: 'You already have an active Savage Pass. It expires on ' +
            new Date(userData.unlimited_until).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
        });
      }
    }

    const reference = `whispr_${username}_${packId}_${Date.now()}`;

    const { error: dbErr } = await supabase
      .from('payments')
      .insert({ username, pack_id: packId, amount: pack.amount, reference, status: 'pending' });
    if (dbErr) throw dbErr;

    const paystackRes = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email, amount: pack.amount, reference, currency: 'NGN',
        metadata:     { username, pack_id: packId, pack_label: pack.label },
        callback_url: `${FRONTEND_URL}/pricing.html?verify=${reference}`
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' } }
    );

    return res.json({ ok: true, payment_url: paystackRes.data.data.authorization_url, reference });
  } catch(err) {
    console.error('[payment/initiate]', err.response?.data || err.message);
    return res.status(500).json({ error: 'Could not initiate payment. Try again.' });
  }
});

router.post('/verify', general, async (req, res) => {
  try {
    const reference = req.body.reference;
    if (!reference) return res.status(400).json({ error: 'Reference is required.' });

    const { data: payment, error: findErr } = await supabase
      .from('payments').select('*').eq('reference', reference).maybeSingle();
    if (findErr) throw findErr;
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status === 'success') {
      return res.json({ ok: true, already_verified: true, pack_id: payment.pack_id });
    }

    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const txData = paystackRes.data.data;
    if (txData.status !== 'success')        return res.status(400).json({ error: 'Payment not successful yet.' });
    if (txData.amount !== payment.amount)   return res.status(400).json({ error: 'Payment amount mismatch.' });

    await activatePack(payment.username, payment.pack_id);

    await supabase.from('payments')
      .update({ status: 'success', verified_at: new Date().toISOString() })
      .eq('reference', reference);

    // Check if pending (bought starter/popular while savage active)
    const { data: userData } = await supabase
      .from('users').select('unlimited_until').eq('username', payment.username).maybeSingle();
    const pending = userData?.unlimited_until && new Date(userData.unlimited_until) > new Date()
      && payment.pack_id !== 'savage';

    return res.json({ ok: true, pack_id: payment.pack_id, username: payment.username, pending });
  } catch(err) {
    console.error('[payment/verify]', err.response?.data || err.message);
    return res.status(500).json({ error: 'Verification failed. Try again.' });
  }
});

router.get('/status', general, async (req, res) => {
  try {
    const { verifySession } = require('./auth');
    const token    = (req.headers.authorization || '').replace('Bearer ', '');
    const username = verifySession(token);
    if (!username) return res.status(401).json({ error: 'Not authenticated.' });

    const { data: user, error } = await supabase
      .from('users')
      .select('paid_replies, unlimited_until, pending_replies, total_paid_replies')
      .eq('username', username)
      .maybeSingle();
    if (error) throw error;

    const hasActiveSavage = user?.unlimited_until && new Date(user.unlimited_until) > new Date();

    // Savage pass just expired — move pending credits to paid
    if (!hasActiveSavage && user?.unlimited_until && (user?.pending_replies || 0) > 0) {
      await supabase.from('users').update({
        paid_replies:    (user.paid_replies || 0) + user.pending_replies,
        pending_replies: 0
      }).eq('username', username);
    }

    return res.json({
      has_unlimited:      !!hasActiveSavage,
      unlimited_until:    user?.unlimited_until    || null,
      paid_replies:       user?.paid_replies       || 0,
      total_paid_replies: user?.total_paid_replies || 0,
      pending_replies:    user?.pending_replies    || 0
    });
  } catch(err) {
    console.error('[payment/status]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET)
      .update(req.body)
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).send('Invalid signature');
    }

    const event = JSON.parse(req.body);

    if (event.event === 'charge.success') {
      const reference = event.data.reference;

      const { data: payment } = await supabase
        .from('payments').select('*')
        .eq('reference', reference).eq('status', 'pending').maybeSingle();

      if (!payment) return res.sendStatus(200);

      await activatePack(payment.username, payment.pack_id);

      await supabase.from('payments')
        .update({ status: 'success', verified_at: new Date().toISOString() })
        .eq('reference', reference);

      console.log(`✅ Payment activated: ${payment.username} → ${payment.pack_id}`);
    }

    res.sendStatus(200);
  } catch(err) {
    console.error('[webhook]', err);
    res.sendStatus(500);
  }
});

module.exports = router;