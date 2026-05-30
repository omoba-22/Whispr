const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { supabase } = require('../db');
const { normalize } = require('../middleware/sanitize');
const { general } = require('../middleware/rateLimit');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const FRONTEND_URL    = process.env.FRONTEND_URL;

const PACKS = {
  starter: { replies: 5,           amount: 30000,  label: 'Starter Pack' },
  popular: { replies: 20,          amount: 70000,  label: 'Popular Pack' },
  savage:  { replies: 'unlimited', amount: 150000, label: 'Savage Pass' }
};
// Note: Paystack amounts are in kobo (multiply naira by 100)

/* ── POST /api/payment/initiate ──
   Start a payment. Returns a Paystack checkout URL.
*/
router.post('/initiate', general, async (req, res) => {
  try {
    const { verifySession } = require('./auth');
    const token    = (req.headers.authorization || '').replace('Bearer ', '');
    const username = verifySession(token);

    if (!username) {
      return res.status(401).json({ error: 'Not authenticated. Open your inbox first.' });
    }

    const packId = req.body.pack_id;
    const email  = req.body.email;

    if (!packId || !PACKS[packId]) {
      return res.status(400).json({ error: 'Invalid pack.' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required for payment.' });
    }

    const pack = PACKS[packId];

    // Generate unique reference
    const reference = `whispr_${username}_${packId}_${Date.now()}`;

    // Save pending payment to DB
    const { error: dbErr } = await supabase
      .from('payments')
      .insert({
        username,
        pack_id:   packId,
        amount:    pack.amount,
        reference,
        status:    'pending'
      });

    if (dbErr) throw dbErr;

    // Call Paystack to initialize transaction
    const paystackRes = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount:       pack.amount,
        reference,
        currency:     'NGN',
        metadata: {
          username,
          pack_id:    packId,
          pack_label: pack.label
        },
        callback_url: `${FRONTEND_URL}/pricing.html?verify=${reference}`
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { authorization_url } = paystackRes.data.data;
    return res.json({ ok: true, payment_url: authorization_url, reference });

  } catch(err) {
    console.error('[payment/initiate]', err.response?.data || err.message);
    return res.status(500).json({ error: 'Could not initiate payment. Try again.' });
  }
});

/* ── POST /api/payment/verify ──
   Verify a payment after Paystack redirects back.
   Called by frontend after redirect.
*/
router.post('/verify', general, async (req, res) => {
  try {
    const reference = req.body.reference;
    if (!reference) return res.status(400).json({ error: 'Reference is required.' });

    // Check payment exists in our DB
    const { data: payment, error: findErr } = await supabase
      .from('payments')
      .select('*')
      .eq('reference', reference)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status === 'success') {
      return res.json({ ok: true, already_verified: true, pack_id: payment.pack_id });
    }

    // Verify with Paystack
    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const txData = paystackRes.data.data;

    if (txData.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful yet.' });
    }

    // Double check amount matches
    if (txData.amount !== payment.amount) {
      return res.status(400).json({ error: 'Payment amount mismatch.' });
    }

    const pack     = PACKS[payment.pack_id];
    const username = payment.username;

    // Activate the pack for the user
    if (payment.pack_id === 'savage') {
      // Unlimited — set expiry 30 days from now
      const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('users')
        .update({ unlimited_until: expiryDate })
        .eq('username', username);
    } else {
      // Add reply credits
      const { data: user } = await supabase
        .from('users')
        .select('paid_replies')
        .eq('username', username)
        .maybeSingle();

      const currentPaid = user?.paid_replies || 0;
      await supabase
        .from('users')
        .update({ paid_replies: currentPaid + pack.replies })
        .eq('username', username);
    }

    // Mark payment as success
    await supabase
      .from('payments')
      .update({ status: 'success', verified_at: new Date().toISOString() })
      .eq('reference', reference);

    return res.json({ ok: true, pack_id: payment.pack_id, username });

  } catch(err) {
    console.error('[payment/verify]', err.response?.data || err.message);
    return res.status(500).json({ error: 'Verification failed. Try again.' });
  }
});

/* ── GET /api/payment/status ──
   Get user's current pack status.
   Requires session token.
*/
router.get('/status', general, async (req, res) => {
  try {
    const { verifySession } = require('./auth');
    const token    = (req.headers.authorization || '').replace('Bearer ', '');
    const username = verifySession(token);

    if (!username) return res.status(401).json({ error: 'Not authenticated.' });

    const { data: user, error } = await supabase
      .from('users')
      .select('paid_replies, unlimited_until')
      .eq('username', username)
      .maybeSingle();

    if (error) throw error;

    const hasUnlimited = user?.unlimited_until && new Date(user.unlimited_until) > new Date();
    const paidReplies  = user?.paid_replies || 0;

    return res.json({
      has_unlimited: hasUnlimited,
      unlimited_until: user?.unlimited_until || null,
      paid_replies: paidReplies
    });

  } catch(err) {
    console.error('[payment/status]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

const crypto = require('crypto');

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify the webhook is actually from Paystack
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

      // Check payment exists and is pending
      const { data: payment } = await supabase
        .from('payments')
        .select('*')
        .eq('reference', reference)
        .eq('status', 'pending')
        .maybeSingle();

      if (!payment) return res.sendStatus(200); // already processed or not found

      const pack     = PACKS[payment.pack_id];
      const username = payment.username;

      // Fetch current user state
      const { data: userData } = await supabase
        .from('users')
        .select('paid_replies, unlimited_until, pending_replies')
        .eq('username', username)
        .maybeSingle();

      const hasActiveSavage = userData?.unlimited_until && new Date(userData.unlimited_until) > new Date();
      const currentPaid     = userData?.paid_replies   || 0;
      const currentPending  = userData?.pending_replies || 0;

      let updateData = {};

      if (payment.pack_id === 'savage') {
        const expiryDate = new Date(Date.now() + 30*24*60*60*1000).toISOString();
        updateData = { unlimited_until: expiryDate };
      } else {
        if (hasActiveSavage) {
          updateData = { pending_replies: currentPending + pack.replies };
        } else {
          updateData = { paid_replies: currentPaid + pack.replies };
        }
      }

      await supabase.from('users').update(updateData).eq('username', username);
      await supabase.from('payments')
        .update({ status: 'success', verified_at: new Date().toISOString() })
        .eq('reference', reference);

      console.log(`✅ Payment activated: ${username} → ${payment.pack_id}`);
    }

    res.sendStatus(200);
  } catch(err) {
    console.error('[webhook]', err);
    res.sendStatus(500);
  }
});

module.exports = router;