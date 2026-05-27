document.getElementById('page-style').textContent = SHARED_CSS;
  let currentTab = 'recent';

  function setTab(tab, el) {
    currentTab = tab;
    document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    loadReplies();
  }

  async function loadReplies() {
    const container = document.getElementById('replies-container');
    container.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';
    try {
      const sort = currentTab === 'liked' ? 'liked' : 'recent';
      const data = await apiGet(`/api/replies/feed?sort=${sort}`);
      if (!data.messages.length) {
        container.innerHTML = `<div class="empty-state"><div class="emoji">💬</div><p>No public replies yet.<br>Be the first to clap back.</p></div>`;
        return;
      }
      container.innerHTML = '';
      data.messages.forEach((msg, i) => container.innerHTML += renderReplyThreadCard(msg, i));
    } catch(e) {
      container.innerHTML = `<div class="empty-state"><div class="emoji">😵</div><p>Couldn't load replies.</p></div>`;
    }
  }

  function renderReplyThreadCard(msg, i) {
    const delay    = Math.min(i * 0.05, 0.4);
    const key      = moodKey(msg.original_mood || msg.mood);
    const liked    = isLiked(msg.id);
    const likes    = msg.likes || 0;
    const origText = escapeHTML(msg.original_message || '');
    const origMood = escapeHTML(msg.original_mood || '');
    const msgEsc   = origText.replace(/'/g,"\\'");
    const moodEsc  = origMood.replace(/'/g,"\\'");
    return `
      <div class="reply-thread-card" style="animation-delay:${delay}s">
        <div class="rtc-original mood-${key}">
          <div class="rtc-original-label">
            <svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:var(--muted);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            anonymous message
            <div class="mood-badge mood-badge-${key}">${origMood}</div>
          </div>
          <div class="rtc-original-text">"${origText}"</div>
        </div>
        <div class="rtc-reply">
          <div class="rtc-reply-label">
            <svg viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>
            clapped back
          </div>
          <div class="rtc-reply-text">${escapeHTML(msg.message)}</div>
          <div class="rtc-footer">
            <div class="rtc-time">${timeAgo(msg.created_at)}</div>
            <div class="rtc-actions">
              <button class="like-btn ${liked?'liked':''}" onclick="toggleLike(this,'${msg.id}',${likes})">
                <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                <span class="like-count">${likes}</span>
              </button>
              <button class="share-img-btn" onclick="shareAsImage('${msgEsc}','${moodEsc}')">
                <svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                Share
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  attachScrollNav();
  loadReplies();