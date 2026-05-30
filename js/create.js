document.getElementById('page-style').textContent = SHARED_CSS;
  let createdUsername = null;

  async function createLink() {
    const username = normalize(document.getElementById('username-input').value);
    const secret   = normalize(document.getElementById('secret-input').value);

    if (!username || username.length < 2) return showToast('Username too short! Min 2 characters.');
    if (!/^[a-z0-9_]+$/.test(username))   return showToast('Letters, numbers and _ only!');
    if (!secret || secret.length < 3)     return showToast('Secret code too short! Min 3 characters.');

    const btn = document.getElementById('create-btn');
    btn.disabled = true; btn.textContent = 'Checking...';

    try {
      await apiPost('/api/auth/register', { username, secret });
      createdUsername = username;
      localStorage.setItem('whispr_last_username', username);
      document.getElementById('link-display').textContent = buildLink(username);
      document.getElementById('link-result').style.display = 'block';
      document.getElementById('go-inbox-btn').href = `inbox.html?u=${encodeURIComponent(username)}`;
      btn.textContent = 'Link created! ✓';
      showToast('Link created! Share it now 🔥');
      setTimeout(() => document.getElementById('link-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    } catch(e) {
      showToast(e.message || 'Something went wrong. Try again.');
      btn.disabled = false; btn.textContent = 'Generate my link';
    }
  }

  function copyLink() {
    const link = document.getElementById('link-display').textContent;
    navigator.clipboard.writeText(link).then(() => {
      const btn = document.getElementById('copy-link-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 2000);
      showToast('Link copied! 📋');
    });
  }

  function shareLink() {
    const link = document.getElementById('link-display').textContent;
    if (navigator.share) {
      navigator.share({ title: 'Send me an anonymous message on Whispr', url: link });
    } else {
      copyLink();
    }
  }

  const savedUsername = localStorage.getItem('whispr_last_username');
  if (savedUsername) document.getElementById('username-input').value = savedUsername;

  attachScrollNav();
 // Show page after CSS is injected
  document.querySelector('.page-wrap').classList.add('ready'); 