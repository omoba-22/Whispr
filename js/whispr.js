/* ── WHISPR SHARED CONFIG & UTILS ──
   All API calls go through the backend server.
   No Supabase calls from frontend anymore.
*/

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : 'https://whispr-ewnd.onrender.com'; // 👈 change when you deploy

const PACKS = [
  { id: 'starter', label: 'Starter',     replies: 5,           price: 300,  note: 'one-time',  badge: null },
  { id: 'popular', label: 'Popular',     replies: 20,          price: 700,  note: 'one-time',  badge: 'Best Value' },
  { id: 'savage',  label: 'Savage Pass', replies: 'unlimited', price: 1500, note: 'per month', badge: 'Unlimited' },
];

function getToken()        { return localStorage.getItem('whispr_token') || ''; }
function setToken(t)       { localStorage.setItem('whispr_token', t); }
function getUsername()     { return localStorage.getItem('whispr_username') || ''; }
function setUsername(n)    { localStorage.setItem('whispr_username', n); }
function clearSession()    { localStorage.removeItem('whispr_token'); localStorage.removeItem('whispr_username'); }

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` };
}

async function apiGet(path) {
  const res  = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiPost(path, body) {
  const res  = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { const e = new Error(data.error || 'Request failed'); e.status = res.status; e.data = data; throw e; }
  return data;
}

function normalize(str) { return (str || '').trim().toLowerCase().replace(/\s+/g, ''); }

function timeAgo(dateStr) {
  // Supabase returns UTC — make sure we parse it correctly
  const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const diff = Date.now() - date.getTime();
  if (diff < 0) return 'just now'; // future timestamp guard
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildLink(username) {
  const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
  return `${base}send.html?u=${encodeURIComponent(username)}`;
}

function moodKey(mood) {
  if (!mood) return 'vent';
  if (mood.includes('Vent'))     return 'vent';
  if (mood.includes('No Cap'))   return 'nocap';
  if (mood.includes('Feels'))    return 'feels';
  if (mood.includes('Hot Take')) return 'hottake';
  if (mood.includes('Tea'))      return 'tea';
  return 'vent';
}

function isLiked(id) { return JSON.parse(localStorage.getItem('whispr_likes') || '[]').includes(id); }
function setLiked(id, val) {
  let liked = JSON.parse(localStorage.getItem('whispr_likes') || '[]');
  if (val) { if (!liked.includes(id)) liked.push(id); }
  else     { liked = liked.filter(x => x !== id); }
  localStorage.setItem('whispr_likes', JSON.stringify(liked));
}

let _toastTimer = null;
function showToast(msg) {
  let t = document.getElementById('whispr-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'whispr-toast';
    t.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%) translateY(200px);background:#1e1e2e;border:1px solid #2a2a3e;color:#e8e8f0;padding:0.6rem 1.1rem;border-radius:999px;font-size:0.8rem;font-weight:500;z-index:9999;white-space:nowrap;pointer-events:none;opacity:0;font-family:DM Sans,sans-serif;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s;max-width:calc(100vw - 2rem);overflow:hidden;text-overflow:ellipsis;';
    document.body.appendChild(t);
  }
  if (_toastTimer) clearTimeout(_toastTimer);
  t.textContent = msg;
  t.style.transform = 'translateX(-50%) translateY(0)';
  t.style.opacity   = '1';
  _toastTimer = setTimeout(() => {
    t.style.transform = 'translateX(-50%) translateY(200px)';
    t.style.opacity   = '0';
    _toastTimer = null;
  }, 2800);
}

async function toggleLike(btn, id, currentLikes) {
  const wasLiked   = isLiked(id);
  const newVal     = !wasLiked;
  const optimistic = newVal ? currentLikes + 1 : Math.max(0, currentLikes - 1);
  btn.classList.toggle('liked', newVal);
  btn.querySelector('.like-count').textContent = optimistic;
  setLiked(id, newVal);
  try {
    const result = await apiPost(`/api/messages/like/${id}`, {});
    btn.querySelector('.like-count').textContent = result.likes;
    btn.setAttribute('onclick', `toggleLike(this,'${id}',${result.likes})`);
    setLiked(id, result.action === 'liked');
    btn.classList.toggle('liked', result.action === 'liked');
  } catch(e) {
    btn.classList.toggle('liked', wasLiked);
    btn.querySelector('.like-count').textContent = currentLikes;
    setLiked(id, wasLiked);
    showToast('Could not like. Try again.');
  }
}

function attachSwipeListeners(container, onSwipeRight) {
  container.querySelectorAll('[data-swipe="true"]').forEach(card => {
    let startX = 0, currentX = 0, dragging = false;

    const onStart = (e) => {
      startX   = e.touches ? e.touches[0].clientX : e.clientX;
      dragging = true;
      card.style.transition = 'none';
      card.style.overflow   = 'visible';
    };
    const onMove = (e) => {
      if (!dragging) return;
      currentX = (e.touches ? e.touches[0].clientX : e.clientX) - startX;
      if (currentX > 0) {
        card.style.transform  = `translateX(${Math.min(currentX, 120)}px)`;
        card.style.opacity    = `${Math.max(0.4, 1 - currentX / 200)}`;
        card.style.boxShadow  = `${Math.min(currentX * 0.3, 20)}px 0 30px rgba(124,58,237,0.2)`;
      }
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      card.style.transition = 'transform 0.3s cubic-bezier(0.34,1.2,0.64,1), opacity 0.3s ease, box-shadow 0.3s ease';
      if (currentX > 70) {
        card.style.transform = 'translateX(120px)';
        card.style.opacity   = '0';
        setTimeout(() => {
          card.style.transform  = '';
          card.style.opacity    = '';
          card.style.boxShadow  = '';
          card.style.overflow   = '';
          onSwipeRight({ id: card.dataset.msgId, text: card.dataset.msgText, mood: card.dataset.msgMood });
        }, 300);
      } else {
        card.style.transform = '';
        card.style.opacity   = '';
        card.style.boxShadow = '';
        card.style.overflow  = '';
      }
      currentX = 0;
    };

    card.addEventListener('touchstart', onStart, { passive: true });
    card.addEventListener('touchmove',  onMove,  { passive: true });
    card.addEventListener('touchend',   onEnd);
    card.addEventListener('mousedown',  onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onEnd);
  });
}

async function shareAsImage(message, mood, context = 'feed', replyText = null) {
  if (typeof html2canvas === 'undefined') { showToast('Share not available.'); return; }
  showToast('Generating image...');
  const key  = moodKey(mood);
  const host = document.getElementById('share-canvas-host');
  if (!host) return showToast('Share not available here.');

  document.getElementById('share-card-inner').className = `share-card-inner share-card-mood-bar-${key}`;
  document.getElementById('share-badge').className      = `share-badge share-badge-${key}`;
  document.getElementById('share-badge').textContent    = mood;
  document.getElementById('share-msg-text').textContent = `"${message}"`;

  // Handle reply thread in image
  const replyThread = document.getElementById('share-reply-thread');
  const replyTextEl = document.getElementById('share-reply-text');
  if (replyText && replyThread && replyTextEl) {
    replyTextEl.textContent    = replyText;
    replyThread.style.display  = 'block';
  } else if (replyThread) {
    replyThread.style.display  = 'none';
  }

  // Context label
  const ctx = document.getElementById('share-context');
  if (ctx) {
    const labels = {
      inbox: 'someone said this to me anonymously',
      reply: 'my anonymous reply',
      feed:  null
    };
    const label = labels[context];
    if (label) { ctx.textContent = label; ctx.style.display = 'block'; }
    else        { ctx.style.display = 'none'; }
  }

  try {
    const canvas = await html2canvas(host, {
      backgroundColor: '#0a0a0f', scale: 2, useCORS: true, logging: false
    });
    canvas.toBlob(async (blob) => {
      if (!blob) return showToast('Could not generate image.');
      const file = new File([blob], 'whispr.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Whispr' });
      } else {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = 'whispr-message.png'; a.click();
        URL.revokeObjectURL(url);
        showToast('Image saved! Share on WhatsApp 📲');
      }
    }, 'image/png');
  } catch(e) { showToast('Could not generate image.'); }
}

function attachScrollNav(navId = 'bottom-nav') {
  let lastY = window.scrollY, ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const nav = document.getElementById(navId);
        if (nav && window.innerWidth <= 640) {
          const y = window.scrollY;
          if (y > lastY && y > 80) nav.classList.add('hidden');
          else nav.classList.remove('hidden');
          lastY = y;
        }
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

function renderCard(msg, i, opts = {}) {
  const { inInbox = false, showRank = null, rankClass = '', showReplyThread = false } = opts;
  const delay = Math.min(i * 0.05, 0.4);
  const liked = isLiked(msg.id);
  const likes = msg.likes || 0;
  const key   = moodKey(msg.mood);
  const recipientLine  = inInbox ? `<div class="msg-meta">sent to <span class="msg-meta-name">you</span></div>` : '';
  const rankHTML       = showRank ? `<div class="trending-rank ${rankClass}">${showRank}</div>` : '';
  const replyBadge     = inInbox && msg.reply_text ? `<span class="replied-badge">replied ✓</span>` : '';
  const swipeHint      = inInbox && !msg.reply_text ? `<div class="swipe-hint">swipe right to reply →</div>` : '';
  let replyThreadHTML  = '';
  if (showReplyThread && msg.reply_text) {
    replyThreadHTML = `<div class="reply-thread"><div class="reply-thread-line"></div><div class="reply-thread-bubble"><div class="reply-thread-label">replied</div><div class="reply-thread-text">${escapeHTML(msg.reply_text)}</div></div></div>`;
  }
  const msgEsc  = escapeHTML(msg.message).replace(/'/g,"\\'").replace(/\n/g,' ');
  const moodEsc = escapeHTML(msg.mood||'').replace(/'/g,"\\'");
  const replyEsc = msg.reply_text
  ? escapeHTML(msg.reply_text).replace(/'/g,"\\'").replace(/\n/g,' ')
  : '';
  return `
    <div class="msg-card msg-card-${key}" data-mood="${escapeHTML(msg.mood)}" style="animation-delay:${delay}s"
         ${inInbox ? `data-swipe="true" data-msg-id="${msg.id}" data-msg-text="${msgEsc}" data-msg-mood="${moodEsc}"` : ''}>
      ${rankHTML}
      <div class="msg-top">
        <div class="msg-top-left">
          <div class="mood-badge mood-badge-${key}">${escapeHTML(msg.mood)}</div>
          <div class="msg-time">${timeAgo(msg.created_at)}</div>
        </div>
        ${replyBadge}
      </div>
      <div class="msg-text">${escapeHTML(msg.message)}</div>
      ${recipientLine}${replyThreadHTML}${swipeHint}
      <div class="msg-actions">
        <button class="like-btn ${liked?'liked':''}" onclick="toggleLike(this,'${msg.id}',${likes})">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          <span class="like-count">${likes}</span>
        </button>
        <button class="share-img-btn" onclick="shareAsImage('${msgEsc}','${moodEsc}','${inInbox ? 'inbox' : 'feed'}','${replyEsc}')">
          <svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          Share
        </button>
      </div>
    </div>`;
}

const SHARED_CSS = `
  :root{--bg:#0a0a0f;--surface:#111118;--border:#1e1e2e;--text:#e8e8f0;--muted:#6b6b80;--accent:#7c3aed;--accent-light:#a78bfa;--mood-vent:#ef4444;--mood-nocap:#8b5cf6;--mood-feels:#ec4899;--mood-hottake:#f97316;--mood-tea:#06b6d4;--bottom-nav-h:64px;}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{height:100%;}
  body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh;overflow-x:hidden;}
  body::before{content:'';position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");pointer-events:none;z-index:0;}
  .btn{padding:0.5rem 1.1rem;border-radius:999px;font-family:'DM Sans',sans-serif;font-size:0.82rem;font-weight:500;cursor:pointer;border:none;transition:all 0.2s;white-space:nowrap;}
  .btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--border);}
  .btn-ghost:hover{color:var(--text);border-color:var(--muted);}
  .btn-primary{background:var(--accent);color:#fff;}
  .btn-primary:hover{background:#6d28d9;transform:translateY(-1px);}
  .btn-lg{padding:0.72rem 1.5rem;font-size:0.9rem;}
  .page-wrap{padding:1.5rem 1.5rem 2rem;max-width:680px;margin:0 auto;position:relative;z-index:1;}
  .form-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:1.2rem;}
  .form-label{font-size:0.7rem;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.4rem;display:block;}
  .form-group{margin-bottom:1rem;}
  .form-group:last-child{margin-bottom:0;}
  textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:0.9rem;padding:0.8rem 0.9rem;resize:none;min-height:108px;transition:border-color 0.2s;outline:none;}
  textarea:focus{border-color:var(--accent);}
  textarea::placeholder{color:var(--muted);}
  input[type="text"]{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:0.9rem;padding:0.78rem 0.9rem;outline:none;transition:border-color 0.2s;}
  input[type="text"]:focus{border-color:var(--accent);}
  input[type="text"]::placeholder{color:var(--muted);}
  .char-count{font-size:0.66rem;color:var(--muted);text-align:right;margin-top:0.26rem;}
  .hint{font-size:0.7rem;color:var(--muted);margin-top:0.3rem;}
  .send-btn{width:100%;padding:0.82rem;border-radius:10px;font-size:0.92rem;font-weight:700;background:var(--accent);color:white;border:none;cursor:pointer;font-family:'Syne',sans-serif;letter-spacing:0.02em;transition:all 0.2s;margin-top:0.55rem;}
  .send-btn:hover:not(:disabled){background:#6d28d9;transform:translateY(-1px);}
  .send-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none;}
  .input-prefix{display:flex;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:border-color 0.2s;}
  .input-prefix:focus-within{border-color:var(--accent);}
  .prefix-label{padding:0.78rem 0.7rem 0.78rem 0.9rem;color:var(--muted);font-size:0.8rem;white-space:nowrap;border-right:1px solid var(--border);}
  .input-prefix input{border:none;border-radius:0;background:transparent;}
  .mood-selector{display:flex;gap:0.35rem;flex-wrap:wrap;}
  .mood-option{padding:0.38rem 0.75rem;border-radius:999px;font-size:0.74rem;font-weight:500;cursor:pointer;border:1px solid var(--border);background:var(--bg);color:var(--muted);transition:all 0.2s;}
  .mood-option:hover{color:var(--text);}
  .mood-option.selected[data-mood="😤 Vent"]{background:rgba(239,68,68,0.15);border-color:var(--mood-vent);color:var(--mood-vent);}
  .mood-option.selected[data-mood="💀 No Cap"]{background:rgba(139,92,246,0.15);border-color:var(--mood-nocap);color:var(--mood-nocap);}
  .mood-option.selected[data-mood="🥺 Feels"]{background:rgba(236,72,153,0.15);border-color:var(--mood-feels);color:var(--mood-feels);}
  .mood-option.selected[data-mood="🔥 Hot Take"]{background:rgba(249,115,22,0.15);border-color:var(--mood-hottake);color:var(--mood-hottake);}
  .mood-option.selected[data-mood="👀 Tea"]{background:rgba(6,182,212,0.15);border-color:var(--mood-tea);color:var(--mood-tea);}
  .public-toggle{display:flex;align-items:center;gap:0.7rem;padding:0.65rem 0.85rem;background:var(--bg);border:1px solid var(--border);border-radius:10px;cursor:pointer;user-select:none;}
  .toggle-switch{width:33px;height:18px;background:var(--border);border-radius:999px;position:relative;transition:background 0.2s;flex-shrink:0;}
  .toggle-switch::after{content:'';position:absolute;width:12px;height:12px;background:white;border-radius:50%;top:3px;left:3px;transition:left 0.2s;}
  .toggle-switch.on{background:var(--accent);}
  .toggle-switch.on::after{left:18px;}
  .toggle-label{font-size:0.8rem;color:var(--muted);}
  .toggle-label strong{color:var(--text);display:block;font-size:0.84rem;}
  .messages-grid{display:flex;flex-direction:column;gap:0.8rem;}
  .msg-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:1rem 1.1rem;position:relative;overflow:hidden;animation:fadeUp 0.35s ease both;transition:transform 0.2s,border-color 0.2s,opacity 0.2s;}
  .msg-card:hover{transform:translateY(-2px);}
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
  .msg-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;}
  .msg-card-vent::before{background:var(--mood-vent);}
  .msg-card-nocap::before{background:var(--mood-nocap);}
  .msg-card-feels::before{background:var(--mood-feels);}
  .msg-card-hottake::before{background:var(--mood-hottake);}
  .msg-card-tea::before{background:var(--mood-tea);}
  .msg-card-vent:hover{border-color:rgba(239,68,68,0.3);}
  .msg-card-nocap:hover{border-color:rgba(139,92,246,0.3);}
  .msg-card-feels:hover{border-color:rgba(236,72,153,0.3);}
  .msg-card-hottake:hover{border-color:rgba(249,115,22,0.3);}
  .msg-card-tea:hover{border-color:rgba(6,182,212,0.3);}
  .msg-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:0.45rem;}
  .msg-top-left{display:flex;align-items:center;gap:0.5rem;}
  .mood-badge{font-size:0.66rem;font-weight:500;padding:0.16rem 0.5rem;border-radius:999px;}
  .mood-badge-vent{background:rgba(239,68,68,0.15);color:var(--mood-vent);}
  .mood-badge-nocap{background:rgba(139,92,246,0.15);color:var(--mood-nocap);}
  .mood-badge-feels{background:rgba(236,72,153,0.15);color:var(--mood-feels);}
  .mood-badge-hottake{background:rgba(249,115,22,0.15);color:var(--mood-hottake);}
  .mood-badge-tea{background:rgba(6,182,212,0.15);color:var(--mood-tea);}
  .msg-time{font-size:0.66rem;color:var(--muted);}
  .msg-text{font-size:0.9rem;line-height:1.6;color:var(--text);margin-bottom:0.6rem;}
  .msg-meta{font-size:0.7rem;color:var(--muted);margin-bottom:0.5rem;}
  .msg-meta-name{color:var(--accent);font-weight:500;}
  .reply-thread{display:flex;gap:0.6rem;margin:0.4rem 0 0.6rem;padding-left:0.5rem;}
  .reply-thread-line{width:2px;background:var(--border);border-radius:2px;flex-shrink:0;}
  .reply-thread-bubble{background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);border-radius:0 10px 10px 10px;padding:0.5rem 0.75rem;flex:1;}
  .reply-thread-label{font-size:0.62rem;color:var(--accent-light);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.25rem;}
  .reply-thread-text{font-size:0.84rem;color:var(--text);line-height:1.5;}
  .swipe-hint{font-size:0.65rem;color:var(--muted);text-align:right;margin-bottom:0.4rem;opacity:0.6;}
  .replied-badge{font-size:0.62rem;background:rgba(124,58,237,0.15);color:var(--accent-light);border:1px solid rgba(124,58,237,0.25);padding:0.12rem 0.5rem;border-radius:999px;font-weight:500;}
  .msg-actions{display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;}
  .like-btn{display:flex;align-items:center;gap:0.35rem;background:transparent;border:1px solid var(--border);border-radius:999px;padding:0.28rem 0.65rem;color:var(--muted);font-size:0.72rem;font-weight:500;cursor:pointer;transition:all 0.2s;font-family:'DM Sans',sans-serif;}
  .like-btn:hover{border-color:#ec4899;color:#ec4899;}
  .like-btn.liked{border-color:#ec4899;color:#ec4899;background:rgba(236,72,153,0.1);}
  .like-btn svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
  .like-btn.liked svg{fill:#ec4899;}
  .share-img-btn{display:flex;align-items:center;gap:0.35rem;background:transparent;border:1px solid var(--border);border-radius:999px;padding:0.28rem 0.65rem;color:var(--muted);font-size:0.72rem;font-weight:500;cursor:pointer;transition:all 0.2s;font-family:'DM Sans',sans-serif;}
  .share-img-btn:hover{border-color:#25d366;color:#25d366;background:rgba(37,211,102,0.08);}
  .share-img-btn svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
  .trending-rank{position:absolute;top:0.8rem;right:0.9rem;font-family:'Syne',sans-serif;font-size:0.72rem;font-weight:800;color:var(--muted);}
  .trending-rank.gold{color:#facc15;}
  .trending-rank.silver{color:#94a3b8;}
  .trending-rank.bronze{color:#f97316;}
  #share-canvas-host{position:fixed;left:-9999px;top:-9999px;width:480px;padding:40px;background:#0a0a0f;font-family:'DM Sans',sans-serif;border-radius:24px;}
  .share-card-inner{background:#111118;border-radius:16px;padding:28px 28px 24px;border:1px solid #1e1e2e;position:relative;overflow:hidden;}
  .share-card-inner::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;}
  .share-card-mood-bar-vent::before{background:#ef4444;}
  .share-card-mood-bar-nocap::before{background:#8b5cf6;}
  .share-card-mood-bar-feels::before{background:#ec4899;}
  .share-card-mood-bar-hottake::before{background:#f97316;}
  .share-card-mood-bar-tea::before{background:#06b6d4;}
  .share-badge{display:inline-block;font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;margin-bottom:14px;}
  .share-badge-vent{background:rgba(239,68,68,0.15);color:#ef4444;}
  .share-badge-nocap{background:rgba(139,92,246,0.15);color:#8b5cf6;}
  .share-badge-feels{background:rgba(236,72,153,0.15);color:#ec4899;}
  .share-badge-hottake{background:rgba(249,115,22,0.15);color:#f97316;}
  .share-badge-tea{background:rgba(6,182,212,0.15);color:#06b6d4;}
  .share-msg-text{font-size:18px;line-height:1.6;color:#e8e8f0;margin-bottom:20px;font-style:italic;}
  .share-footer{display:flex;align-items:center;justify-content:space-between;}
  .share-footer-logo{font-size:14px;font-weight:800;color:#e8e8f0;letter-spacing:-0.02em;}
  .share-footer-logo span{color:#7c3aed;}
  .share-footer-sub{font-size:11px;color:#6b6b80;}
  .loading{display:flex;gap:0.35rem;justify-content:center;padding:2rem;}
  .loading span{width:7px;height:7px;background:var(--accent);border-radius:50%;animation:bounce 1.2s infinite;}
  .loading span:nth-child(2){animation-delay:0.2s;}
  .loading span:nth-child(3){animation-delay:0.4s;}
  @keyframes bounce{0%,80%,100%{transform:scale(0.6);opacity:0.4;}40%{transform:scale(1);opacity:1;}}
  .empty-state{text-align:center;padding:3rem 1rem;color:var(--muted);}
  .empty-state .emoji{font-size:2.2rem;margin-bottom:0.6rem;}
  .empty-state p{font-size:0.86rem;}
  .share-link-card{background:linear-gradient(135deg,rgba(124,58,237,0.12),rgba(6,182,212,0.08));border:1px solid rgba(124,58,237,0.25);border-radius:14px;padding:1.1rem;margin-bottom:0.9rem;}
  .share-link-card h3{font-family:'Syne',sans-serif;font-size:0.9rem;font-weight:700;margin-bottom:0.6rem;}
  .link-box{display:flex;gap:0.4rem;align-items:center;}
  .link-display{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:0.55rem 0.8rem;font-size:0.76rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .copy-btn{padding:0.55rem 0.85rem;border-radius:8px;background:var(--accent);color:white;border:none;font-size:0.74rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;}
  .copy-btn:hover{background:#6d28d9;}
  .page-title{font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:800;margin-bottom:0.3rem;}
  .page-subtitle{color:var(--muted);font-size:0.84rem;margin-bottom:1.5rem;}
  .back-btn{display:inline-flex;align-items:center;gap:0.4rem;color:var(--muted);font-size:0.8rem;cursor:pointer;margin-bottom:1rem;background:none;border:none;font-family:'DM Sans',sans-serif;transition:color 0.2s;text-decoration:none;}
  .back-btn:hover{color:var(--text);}
  .back-btn svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;}
  .success-msg{text-align:center;padding:2.5rem 1rem;animation:fadeUp 0.4s ease;}
  .success-msg .big-emoji{font-size:2.8rem;margin-bottom:0.6rem;}
  .success-msg h3{font-family:'Syne',sans-serif;font-size:1.35rem;font-weight:800;margin-bottom:0.3rem;}
  .success-msg p{color:var(--muted);font-size:0.86rem;}
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:500;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);animation:fadeIn 0.2s ease;}
  .modal-overlay.hidden{display:none;}
  @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
  .modal-sheet{background:var(--surface);border:1px solid var(--border);border-radius:20px 20px 0 0;padding:1.5rem;width:100%;max-width:500px;animation:slideUp 0.3s cubic-bezier(0.34,1.2,0.64,1);max-height:90vh;overflow-y:auto;}
  @keyframes slideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
  .modal-handle{width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 1.2rem;}
  .modal-title{font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;margin-bottom:0.3rem;}
  .modal-sub{color:var(--muted);font-size:0.84rem;margin-bottom:1.2rem;}
  nav.top-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;background:rgba(10,10,15,0.88);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);}
  .logo{font-family:'Syne',sans-serif;font-weight:800;font-size:1.4rem;color:var(--text);letter-spacing:-0.03em;cursor:pointer;text-decoration:none;}
  .logo span{color:var(--accent);}
  .top-nav .nav-links{display:flex;gap:0.6rem;align-items:center;}
  nav.bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;height:var(--bottom-nav-h);background:rgba(10,10,15,0.96);backdrop-filter:blur(20px);border-top:1px solid var(--border);z-index:200;padding:0 0.25rem;align-items:stretch;justify-content:space-around;transition:transform 0.3s ease;}
  nav.bottom-nav.hidden{transform:translateY(100%);}
  .bottom-nav-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0 0.5rem;cursor:pointer;color:var(--muted);font-size:0.62rem;font-weight:500;transition:color 0.2s;flex:1;border:none;background:transparent;font-family:'DM Sans',sans-serif;text-decoration:none;}
  .bottom-nav-item svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
  .bottom-nav-item.active{color:var(--accent-light);}
  .bottom-nav-item.fab-btn{position:relative;top:-10px;}
  .fab-inner{width:46px;height:46px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(124,58,237,0.5);margin-bottom:1px;}
  .fab-inner svg{stroke:white;width:18px;height:18px;}
  @media(max-width:640px){nav.top-nav{display:none;}nav.bottom-nav{display:flex;}body{padding-bottom:0;}.page-wrap{padding:0.9rem 0.9rem calc(var(--bottom-nav-h) + 2rem);}}
  @media(min-width:641px){nav.top-nav{display:flex;}nav.bottom-nav{display:none!important;}}
`;