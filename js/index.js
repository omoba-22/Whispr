document.getElementById('page-style').textContent = SHARED_CSS;

  let currentFilter = 'all';

  function showTrending() {
    document.getElementById('section-feed').style.display     = 'none';
    document.getElementById('section-trending').style.display = 'block';
    loadTrending();
    window.scrollTo(0,0);
  }
  function showFeed() {
    document.getElementById('section-feed').style.display     = 'block';
    document.getElementById('section-trending').style.display = 'none';
    window.scrollTo(0,0);
  }

  // Handle #trending in URL
  if (window.location.hash === '#trending') showTrending();

  document.getElementById('nav-trending-btn').addEventListener('click', e => { e.preventDefault(); showTrending(); });
  document.getElementById('bnav-trending').addEventListener('click', e => { e.preventDefault(); showTrending(); });

  document.getElementById('page-style').textContent = SHARED_CSS;

  function showTrending() {
    document.getElementById('section-feed').style.display     = 'none';
    document.getElementById('section-trending').style.display = 'block';
    loadTrending();
    window.scrollTo(0,0);
  }
  function showFeed() {
    document.getElementById('section-feed').style.display     = 'block';
    document.getElementById('section-trending').style.display = 'none';
    window.scrollTo(0,0);
  }

  if (window.location.hash === '#trending') showTrending();
  document.getElementById('nav-trending-btn').addEventListener('click', e => { e.preventDefault(); showTrending(); });
  document.getElementById('bnav-trending').addEventListener('click',    e => { e.preventDefault(); showTrending(); });

  async function loadFeed() {
    const container = document.getElementById('feed-container');
    container.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';
    try {
      let path = `/api/messages/feed?page=0`;
      if (currentFilter !== 'all') path += `&mood=${encodeURIComponent(currentFilter)}`;
      const data = await apiGet(path);
      if (!data.messages.length) {
        container.innerHTML = `<div class="empty-state"><div class="emoji">👻</div><p>No messages in the last 72h. Be the first.</p></div>`;
        return;
      }
      container.innerHTML = '<div class="messages-grid"></div>';
      const grid = container.querySelector('.messages-grid');
      data.messages.forEach((msg, i) => grid.innerHTML += renderCard(msg, i, { showReplyThread: true }));
    } catch(e) {
      container.innerHTML = `<div class="empty-state"><div class="emoji">😵</div><p>Couldn't load messages.</p></div>`;
      console.error(e);
    }
    loadTopMood();
  }

  async function loadTrending() {
    const container = document.getElementById('trending-container');
    container.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';
    try {
      const data = await apiGet('/api/messages/trending');
      if (!data.messages.length) {
        container.innerHTML = `<div class="empty-state"><div class="emoji">🫙</div><p>No trending yet. Like some messages!</p></div>`;
        return;
      }
      container.innerHTML = '<div class="messages-grid"></div>';
      const grid = container.querySelector('.messages-grid');
      data.messages.forEach((msg, i) => {
        const rc = i===0?'gold':i===1?'silver':i===2?'bronze':'';
        const rl = i===0?'🥇 #1':i===1?'🥈 #2':i===2?'🥉 #3':`#${i+1}`;
        grid.innerHTML += renderCard(msg, i, { showRank: rl, rankClass: rc, showReplyThread: true });
      });
    } catch(e) {
      container.innerHTML = `<div class="empty-state"><div class="emoji">😵</div><p>Couldn't load trending.</p></div>`;
    }
  }

  async function loadTopMood() {
    try {
      const data = await apiGet('/api/messages/top-mood');
      if (!data.topMood) return;
      document.querySelectorAll('.mood-chip').forEach(c => {
        c.classList.remove('top-mood');
        // Compare trimmed strings to avoid whitespace issues
        if (c.dataset.mood && c.dataset.mood.trim() === data.topMood.trim()) {
          c.classList.add('top-mood');
        }
      });
    } catch(e) { console.error('top mood error', e); }
  }

  function filterMood(mood, el) {
    currentFilter = mood;
    document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    loadFeed();
  }

  let lastMessageCount = 0;
  let newMessageDot    = false;

  async function checkForNewMessages() {
    try {
      const data = await apiGet('/api/messages/feed?page=0');
      const count = data.total || 0;
      if (lastMessageCount > 0 && count > lastMessageCount && !newMessageDot) {
        newMessageDot = true;
        // Add dot to feed nav icon
        document.querySelectorAll('.bottom-nav-item[href="index.html"], a[href="index.html"].btn-ghost').forEach(el => {
          if (!el.querySelector('.new-dot')) {
            const dot = document.createElement('span');
            dot.className = 'new-dot';
            dot.style.cssText = 'width:7px;height:7px;background:#7c3aed;border-radius:50%;position:absolute;top:4px;right:4px;animation:pulse-dot 1.5s ease-in-out infinite;';
            el.style.position = 'relative';
            el.appendChild(dot);
          }
        });
      }
      lastMessageCount = count;
    } catch(e) {}
  }

  // Add pulse animation to page CSS
  const style = document.createElement('style');
  style.textContent = '@keyframes pulse-dot{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.3);opacity:0.7;}}';
  document.head.appendChild(style);

  // Check every 30 seconds
  setInterval(checkForNewMessages, 30000);
  // Clear dot when feed reloads
  const _origLoadFeed = loadFeed;
  loadFeed = async function() {
    newMessageDot = false;
    document.querySelectorAll('.new-dot').forEach(d => d.remove());
    await _origLoadFeed();
  };

  attachScrollNav();
  loadFeed();