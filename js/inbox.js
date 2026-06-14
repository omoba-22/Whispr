document.getElementById('page-style').textContent = SHARED_CSS;

  let currentUsername = null;
  let replyPublic     = true;
  let replyTargetId   = null;
  let repliesUsed     = 0;
  let replyLimit      = 3;

  const uParam = new URLSearchParams(window.location.search).get('u');
  if (uParam) document.getElementById('inbox-username').value = normalize(uParam);

  const savedToken    = getToken();
  const savedUsername = getUsername();
  if (savedToken && savedUsername) {
    document.getElementById('inbox-username').value = savedUsername;
    currentUsername = savedUsername;
    (async () => {
      try {
        await loadInbox();
        await updateReplyCounter();
      } catch(e) {
        clearSession();
        currentUsername = null;
        document.getElementById('inbox-login').style.display    = 'block';
        document.getElementById('inbox-messages').style.display = 'none';
        showToast('Session expired. Please log in again.');
      }
    })();
  }

  async function viewInbox() {
    const username = normalize(document.getElementById('inbox-username').value);
    const secret   = normalize(document.getElementById('inbox-secret').value);
    if (!username || !secret) return showToast('Fill in both fields!');

    const btn = document.getElementById('open-inbox-btn');
    btn.disabled = true; btn.textContent = 'Opening...';

    try {
      const result = await apiPost('/api/auth/verify', { username, secret });
      setToken(result.token);
      setUsername(result.username);
      currentUsername = result.username;
      await loadInbox();
      await updateReplyCounter();
    } catch(e) {
      showToast(e.message || 'Wrong username or secret code!');
    }
    btn.disabled = false; btn.textContent = 'Open inbox';
  }

  async function loadInbox() {
    const res = await apiGet(`/api/messages/inbox/${currentUsername}`);
    const data = res.messages;

    document.getElementById('inbox-login').style.display    = 'none';
    document.getElementById('inbox-messages').style.display = 'block';
    document.getElementById('inbox-link-display').textContent = buildLink(currentUsername);
    document.getElementById('inbox-title').textContent = `@${currentUsername}'s inbox`;
    document.getElementById('inbox-count').textContent = `${data.length} message${data.length!==1?'s':''}`;

    const container = document.getElementById('inbox-container');
    if (!data.length) {
      container.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>No whisprs yet. Share your link!</p></div>`;
      return;
    }
    container.innerHTML = '<div class="messages-grid" id="inbox-grid"></div>';
    const grid = document.getElementById('inbox-grid');
    data.forEach((msg, i) => grid.innerHTML += renderCard(msg, i, { inInbox: true }));
    attachSwipeListeners(grid, (msg) => openReplyDrawer(msg));
  }

  async function updateReplyCounter() {
    try {
      const data = await apiGet('/api/replies/count');
      repliesUsed = data.used;
      replyLimit  = data.limit;

      const usedEl  = document.getElementById('reply-used-display');
      const limitEl = document.getElementById('reply-limit-display');
      const bar     = document.querySelector('.reply-limit-bar .reply-limit-text');

      if (data.has_unlimited) {
        if (usedEl)  usedEl.textContent  = data.used;
        if (limitEl) limitEl.textContent = '∞';
        if (bar) bar.innerHTML = `Replies this month: <strong>${data.used}</strong> · <strong style="color:var(--accent-light)">Savage Pass active ✦</strong>`;
        replyLimit = -1;
      } else {
        if (usedEl)  usedEl.textContent  = data.used;
        if (limitEl) limitEl.textContent = data.limit;
        if (data.pending_replies > 0) {
          if (bar) bar.innerHTML = `Replies: <strong>${data.used}/${data.limit}</strong> · <strong style="color:#f97316">${data.pending_replies} credits pending after Savage Pass</strong>`;
        }
      }
    } catch(e) {
      console.error('updateReplyCounter failed:', e);
    }
  }

  async function openReplyDrawer(msg) {
    replyTargetId = msg.id;
    document.getElementById('reply-quoted-text').textContent = msg.text;
    document.getElementById('reply-text').value = '';
    document.getElementById('reply-char').textContent = '0';
    replyPublic = true;
    document.getElementById('reply-public-switch').classList.add('on');

    // Check if user has hit their limit
    if (repliesUsed >= replyLimit && replyLimit !== -1) {
      // Check payment status from server before showing paywall
      try {
        const status = await apiGet('/api/payment/status');
        if (status.has_unlimited || status.paid_replies > 0) {
          // They have paid — refresh their count and just open drawer
          await updateReplyCounter();
          document.getElementById('reply-drawer').classList.remove('hidden');
          return;
        }
      } catch(e) {}
      // No active pack — show paywall
      showPaywall();
      return;
    }

    document.getElementById('reply-drawer').classList.remove('hidden');
  }

  function handleDrawerBackdropClick(e) {
    // Close if clicking the dark backdrop, not the sheet itself
    if (e.target === document.getElementById('reply-drawer')) {
      closeReplyDrawer();
    }
  }

  function closeReplyDrawer() {
    const drawer = document.getElementById('reply-drawer');
    const sheet  = document.getElementById('reply-sheet');
    sheet.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.2,1)';
    sheet.style.transform  = 'translateY(100%)';
    setTimeout(() => {
      drawer.classList.add('hidden');
      sheet.style.transform  = '';
      sheet.style.transition = '';
    }, 300);
    replyTargetId = null;
  }

  // Drag down to dismiss
  (function() {
    const handle = document.getElementById('reply-drag-handle');
    const sheet  = document.getElementById('reply-sheet');
    let startY = 0, currentY = 0, dragging = false;

    const onStart = (e) => {
      startY   = e.touches ? e.touches[0].clientY : e.clientY;
      dragging = true;
      sheet.style.transition = 'none';
    };
    const onMove = (e) => {
      if (!dragging) return;
      currentY = (e.touches ? e.touches[0].clientY : e.clientY) - startY;
      if (currentY > 0) sheet.style.transform = `translateY(${currentY}px)`;
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      if (currentY > 100) {
        closeReplyDrawer();
      } else {
        sheet.style.transition = 'transform 0.3s cubic-bezier(0.34,1.2,0.64,1)';
        sheet.style.transform  = '';
      }
      currentY = 0;
    };

    handle.addEventListener('touchstart', onStart, { passive: true });
    handle.addEventListener('touchmove',  onMove,  { passive: true });
    handle.addEventListener('touchend',   onEnd);
    handle.addEventListener('mousedown',  onStart);
    window.addEventListener('mousemove',  onMove);
    window.addEventListener('mouseup',    onEnd);
  })();

  function toggleReplyPublic() {
    replyPublic = !replyPublic;
    document.getElementById('reply-public-switch').classList.toggle('on', replyPublic);
  }

  async function submitReply() {
    const text = document.getElementById('reply-text').value.trim();
    if (!text) return showToast('Write your reply first!');

    const btn = document.getElementById('reply-submit-btn');
    btn.disabled = true; btn.textContent = 'Sending...';

    try {
      const result = await apiPost('/api/replies/send', {
        reply_text:  text,
        reply_to_id: replyTargetId,
        is_public:   replyPublic
      });
      closeReplyDrawer();
      showToast(`Reply sent! 🔥 (${result.remaining} left this month)`);
      await loadInbox();
      await updateReplyCounter();
    } catch(e) {
      if (e.status === 402) {
        showPaywall();
      } else {
        showToast(e.message || 'Failed to send reply.');
      }
    }
    btn.disabled = false; btn.textContent = 'Reply ✦';
  }

  async function showPaywall() {
    // Check if they already have a pack first
    try {
      const status = await apiGet('/api/payment/status');
      if (status.has_unlimited) {
        // Savage pass active — just open drawer, something else is wrong
        showToast('Savage Pass active! Try again.');
        await updateReplyCounter();
        return;
      }
      if (status.paid_replies > 0) {
        showToast(`You have ${status.paid_replies} paid replies left!`);
        await updateReplyCounter();
        document.getElementById('reply-drawer').classList.remove('hidden');
        return;
      }
    } catch(e) {}

    // No active pack — show pricing modal
    const list = document.getElementById('pack-list');
    list.innerHTML = PACKS.map(p => `
      <div class="paywall-pack ${p.id==='popular'?'best':''}" onclick="selectPack('${p.id}')">
        <div class="pack-left">
          <div class="pack-name">${p.label}${p.badge?`<span class="pack-badge">${p.badge}</span>`:''}</div>
          <div class="pack-desc">${p.replies==='unlimited'?'Unlimited replies':`${p.replies} replies`}</div>
        </div>
        <div class="pack-price">₦${p.price.toLocaleString()} <span>/ ${p.note}</span></div>
      </div>`).join('');
    document.getElementById('paywall-modal').classList.remove('hidden');
  }

  function selectPack(id) {
    window.location.href = `pricing.html?pack=${id}`;
  }

  function showForgotSecret() {
    document.getElementById('forgot-modal').classList.remove('hidden');
  }

  async function resetAccount() {
    const username  = normalize(document.getElementById('reset-username-input').value);
    const newSecret = normalize(document.getElementById('reset-new-secret').value);

    if (!username)             return showToast('Enter your username');
    if (!newSecret || newSecret.length < 3) return showToast('New secret too short!');

    const btn = document.getElementById('reset-btn');
    btn.disabled = true; btn.textContent = 'Resetting...';

    try {
      await apiPost('/api/auth/reset', { username, new_secret: newSecret });
      document.getElementById('forgot-modal').classList.add('hidden');
      showToast('Account reset! You can now log in with your new code.');
      // Clear any saved session for this user
      if (getUsername() === username) clearSession();
    } catch(e) {
      showToast(e.message || 'Reset failed. Try again.');
    }
    btn.disabled = false; btn.textContent = 'Delete & Reset';
  }

  attachScrollNav();

 // Pull to refresh
  (function() {
    let startY = 0, pulling = false, triggered = false;
    const indicator = document.getElementById('pull-indicator');

    document.addEventListener('touchstart', (e) => {
      if (window.scrollY === 0) {
        startY   = e.touches[0].clientY;
        pulling  = true;
        triggered = false;
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      const dist = e.touches[0].clientY - startY;
      if (dist > 20 && dist < 100) {
        indicator.style.opacity = `${dist / 80}`;
        indicator.textContent   = '↓ Pull to refresh';
      }
      if (dist >= 80 && !triggered) {
        triggered               = true;
        indicator.textContent   = '↑ Release to refresh';
        indicator.style.opacity = '1';
      }
    }, { passive: true });

    document.addEventListener('touchend', async () => {
      if (!pulling) return;
      pulling = false;
      if (triggered && currentUsername) {
        indicator.textContent = '⟳ Refreshing...';
        await loadInbox();
        await updateReplyCounter();
      }
      setTimeout(() => { indicator.style.opacity = '0'; }, 800);
    });
  })(); 

  function logoutInbox() {
    clearSession();
    currentUsername = null;
    repliesUsed     = 0;
    replyLimit      = 3;
    document.getElementById('inbox-messages').style.display = 'none';
    document.getElementById('inbox-login').style.display    = 'block';
    document.getElementById('inbox-username').value = '';
    document.getElementById('inbox-secret').value   = '';
    showToast('Logged out of inbox');
  }

  // Show page after CSS is injected
  document.querySelector('.page-wrap').classList.add('ready');