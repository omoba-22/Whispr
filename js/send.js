document.getElementById('page-style').textContent = SHARED_CSS;
  let selectedMood = null, isPublic = true;

  const u = new URLSearchParams(window.location.search).get('u');
  if (u) {
    window._recipientUsername = normalize(u);
    // Show prominent recipient banner
    document.getElementById('send-recipient-tag').style.display = 'inline-flex';
    document.getElementById('send-recipient-tag').textContent   = `✉️ Send a whispr to @${window._recipientUsername}`;
    document.getElementById('send-subtitle').textContent = `@${window._recipientUsername} will never know it was you.`;
    // Also show the preview card
    document.getElementById('recipient-section').style.display = 'block';
    document.getElementById('to-username').value               = window._recipientUsername;
    document.getElementById('to-username').disabled            = true;
    document.getElementById('to-username').style.opacity       = '0.5';
    // Show preview
    document.getElementById('preview-avatar').textContent = window._recipientUsername[0].toUpperCase();
    document.getElementById('preview-name').textContent   = `@${window._recipientUsername}`;
    document.getElementById('username-preview').style.display = 'flex';
  }else {
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
    const recipient = window._recipientUsername || validatedRecipient || null;

    if (!text)         return showToast('Write something first 👀');
    if (!selectedMood) return showToast('Pick a vibe first!');
    if (!recipient)    return showToast('Enter a valid username first!');
    if (!window._recipientUsername && !validatedRecipient) {
      return showToast('Username not found. Check the spelling!');
    }

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

  let usernameCheckTimer = null;
  let validatedRecipient = null;

  async function lookupUsername(val) {
    const username = normalize(val);
    const preview  = document.getElementById('username-preview');
    const notFound = document.getElementById('username-not-found');
    validatedRecipient = null;

    if (!username || username.length < 2) {
      preview.style.display  = 'none';
      notFound.style.display = 'none';
      return;
    }

    if (usernameCheckTimer) clearTimeout(usernameCheckTimer);
    usernameCheckTimer = setTimeout(async () => {
      try {
        const data = await apiGet(`/api/auth/check/${username}`);
        if (!data.available) {
          // Username EXISTS (available: false means it's taken = exists)
          validatedRecipient = username;
          document.getElementById('preview-avatar').textContent = username[0].toUpperCase();
          document.getElementById('preview-name').textContent   = `@${username}`;
          preview.style.display  = 'flex';
          notFound.style.display = 'none';
        } else {
          // Username doesn't exist
          validatedRecipient     = null;
          preview.style.display  = 'none';
          notFound.style.display = 'block';
        }
      } catch(e) {
        validatedRecipient     = null;
        preview.style.display  = 'none';
        notFound.style.display = 'none';
      }
    }, 500);
  }