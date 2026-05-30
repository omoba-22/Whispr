document.getElementById('page-style').textContent = SHARED_CSS;
  let selectedMood = null, isPublic = true;

  const u = new URLSearchParams(window.location.search).get('u');
  if (u) {
    window._recipientUsername = normalize(u);
    const tag = document.getElementById('send-recipient-tag');
    tag.style.display = 'inline-flex';
    tag.textContent = `✉️ Sending to @${window._recipientUsername}`;
    document.getElementById('send-subtitle').textContent = `@${window._recipientUsername} will never know it was you.`;
  } else {
    document.getElementById('recipient-section').style.display = 'block';
  }

  function selectMood(el) {
    document.querySelectorAll('.mood-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    selectedMood = el.dataset.mood;
  }

  function togglePublic() {
    isPublic = !isPublic;
    document.getElementById('public-toggle-switch').classList.toggle('on', isPublic);
  }

  async function sendMessage() {
    const text      = document.getElementById('msg-text').value.trim();
    const toEl      = document.getElementById('to-username');
    const recipient = window._recipientUsername || normalize(toEl ? toEl.value : '') || null;

    if (!text)         return showToast('Write something first 👀');
    if (!selectedMood) return showToast('Pick a vibe first!');
    if (!recipient)    return showToast('Who are you sending this to?');

    const btn = document.getElementById('send-btn');
    btn.disabled = true; btn.textContent = 'Sending...';

    try {
      await apiPost('/api/messages/send', {
        message:            text,
        mood:               selectedMood,
        is_public:          isPublic,
        recipient_username: recipient
      });
      document.getElementById('send-form-area').style.display = 'none';
      document.getElementById('send-success').style.display   = 'block';
    } catch(e) {
      showToast(e.message || 'Failed to send. Try again.');
      btn.disabled = false; btn.textContent = 'Send anonymously ✦';
    }
  }

  function resetSend() {
    document.getElementById('msg-text').value = '';
    document.getElementById('char-count').textContent = '0';
    selectedMood = null; isPublic = true;
    document.getElementById('public-toggle-switch').classList.add('on');
    document.querySelectorAll('.mood-option').forEach(o => o.classList.remove('selected'));
    document.getElementById('send-form-area').style.display = 'block';
    document.getElementById('send-success').style.display   = 'none';
    const btn = document.getElementById('send-btn');
    btn.disabled = false; btn.textContent = 'Send anonymously ✦';
  }

  attachScrollNav();
  // Show page after CSS is injected
  document.querySelector('.page-wrap').classList.add('ready');