let selectedPackId = null;
  document.getElementById('page-style').textContent = SHARED_CSS;
  const preselected = new URLSearchParams(window.location.search).get('pack');

  const container = document.getElementById('pack-cards');
  PACKS.forEach(pack => {
    const isFeatured = pack.id === 'popular';
    const repliesText = pack.replies === 'unlimited' ? 'Unlimited replies' : `${pack.replies} replies`;
    const perks = pack.id === 'starter'
      ? ['5 reply credits, never expire','Use any time across months','Works on all messages']
      : pack.id === 'popular'
      ? ['20 reply credits, never expire','Best value per reply','Works on all messages']
      : ['Unlimited replies for 30 days','Auto-renews monthly','Priority support'];

    const card = document.createElement('div');
    card.className = `pack-card${isFeatured?' featured':''}`;
    if (pack.id === preselected) card.style.borderColor = 'rgba(124,58,237,0.6)';
    card.innerHTML = `
      <div class="pack-top">
        <div>
          <div class="pack-name">${pack.label}${pack.badge?`<span class="pack-badge">${pack.badge}</span>`:''}</div>
          <div class="pack-tag">${repliesText} · ${pack.note}</div>
        </div>
        <div class="pack-price-block">
          <div class="pack-amount">₦${pack.price.toLocaleString()}</div>
          <div class="pack-per">${pack.note}</div>
        </div>
      </div>
      <div class="pack-perks">
        ${perks.map(p=>`<div class="pack-perk"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>${p}</div>`).join('')}
      </div>
      <button class="buy-btn" onclick="buyPack('${pack.id}')">Get ${pack.label} — ₦${pack.price.toLocaleString()}</button>
    `;
    container.appendChild(card);
  });

  async function buyPack(id) {
    const pack = PACKS.find(p => p.id === id);
    if (!pack) return;

    const username = getUsername();
    const token    = getToken();
    if (!username || !token) {
      showToast('Open your inbox first!');
      setTimeout(() => window.location.href = 'inbox.html', 2000);
      return;
    }

    // Check current status
    try {
      const status = await apiGet('/api/payment/status');
      const hasActiveSavage = status.has_unlimited;

      // Block re-buying active Savage Pass
      if (id === 'savage' && hasActiveSavage) {
        const expiry = new Date(status.unlimited_until).toLocaleDateString('en-NG', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
        showToast(`Your Savage Pass is active until ${expiry}!`);
        return;
      }

      // Warn if buying starter/popular while savage is active
      if (id !== 'savage' && hasActiveSavage) {
        const expiry = new Date(status.unlimited_until).toLocaleDateString('en-NG', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
        // Show modal with warning but allow purchase
        document.getElementById('pending-warning').style.display = 'block';
        document.getElementById('pending-warning').textContent =
          `⏳ You have an active Savage Pass until ${expiry}. These credits will activate automatically after it expires.`;
      } else {
        document.getElementById('pending-warning').style.display = 'none';
      }

      // Show current balance if they have credits
      if (status.paid_replies > 0 && id !== 'savage') {
        document.getElementById('current-balance').style.display = 'block';
        document.getElementById('current-balance').textContent =
          `You currently have ${status.paid_replies} reply credits. Buying this adds more.`;
      } else {
        document.getElementById('current-balance').style.display = 'none';
      }

    } catch(e) {}

    selectedPackId = id;
    document.getElementById('modal-pack-name').textContent  = pack.label;
    document.getElementById('modal-pack-price').textContent = `₦${pack.price.toLocaleString()} · ${pack.note}`;
    document.getElementById('coming-modal').classList.remove('hidden');
  }

  async function proceedToPayment() {
    const email = document.getElementById('payment-email').value.trim();
    if (!email || !email.includes('@')) return showToast('Enter a valid email address');

    const btn = document.getElementById('pay-btn');
    btn.disabled = true; btn.textContent = 'Redirecting...';

    try {
      const data = await apiPost('/api/payment/initiate', {
        pack_id: selectedPackId,
        email
      });
      // Redirect to Paystack checkout
      window.location.href = data.payment_url;
    } catch(e) {
      showToast(e.message || 'Payment failed to start. Try again.');
      btn.disabled = false; btn.textContent = 'Pay Now';
    }
  }

  // Handle return from Paystack
  const verifyRef = new URLSearchParams(window.location.search).get('verify');
  if (verifyRef) {
    (async () => {
      showToast('Verifying your payment...');
      try {
        const data = await apiPost('/api/payment/verify', { reference: verifyRef });
        if (data.ok) {
          const successMsg = document.getElementById('success-message');
          if (data.pending) {
            successMsg.textContent = 'Credits purchased! They will activate automatically once your Savage Pass expires.';
          } else if (data.pack_id === 'savage') {
            successMsg.textContent = 'Savage Pass activated! Unlimited replies for 30 days. Go reply to everything! 🔥';
          } else {
            successMsg.textContent = 'Credits added to your account instantly! Go reply to your messages.';
          }
          document.getElementById('success-modal').classList.remove('hidden');
        }
      } catch(e) {
        showToast(e.message || 'Verification failed. Contact support.');
      }
    })();
  }

  function toggleFaq(el) { el.classList.toggle('open'); }

  if (preselected) setTimeout(() => buyPack(preselected), 400);

  attachScrollNav();