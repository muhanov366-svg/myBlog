// ==================== КОНФИГУРАЦИЯ ====================
const API_URL = 'https://script.google.com/macros/s/AKfycbwQiu0iV4C_UrMPxWTIYYtMLD0s_ibQkup_bdPOsGBOTO0tEwM-_ZbMo7NupXfVLfzrRA/exec';

// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let currentUser = null;
let sessionToken = null;
let allPosts = [];
let allUsersCache = {};
let currentMode = 'feed';

// ==================== УТИЛИТЫ ====================
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function showModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function setMessage(id, text, isError = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'form-message ' + (isError ? 'error' : 'success');
  setTimeout(() => { el.textContent = ''; el.className = 'form-message'; }, 5000);
}

function getUserNameSync(userId) {
  return allUsersCache[userId] || `Пользователь ${userId}`;
}

async function loadUserNames(userIds) {
  const uniqueIds = [...new Set(userIds.map(String))];
  for (const id of uniqueIds) {
    if (!allUsersCache[id]) {
      const result = await apiCall('getUserById', { userId: id });
      if (result.success) {
        allUsersCache[id] = result.user.name;
      } else {
        allUsersCache[id] = `Пользователь ${id}`;
      }
    }
  }
}

function getBackAction() {
  if (currentMode === 'recommendations') return 'loadRecommendations()';
  if (currentMode === 'profile') return 'loadMyProfile()';
  if (currentMode === 'tags') return 'showAllTags()';
  return 'loadFeed()';
}

// ==================== API ====================
async function apiCall(action, data = {}) {
  try {
    const payload = { action, ...data };
    if (sessionToken) payload.token = sessionToken;

    const params = new URLSearchParams(payload);
    const url = `${API_URL}?${params.toString()}`;

    console.log('📤', action, payload);

    const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();
    console.log('📥', result);

    // Если токен протух — разлогиниваем
    if (!result.success && result.error === 'Не авторизован') {
      logout();
    }
    return result;
  } catch (e) {
    console.error('❌', e);
    return { success: false, error: `Ошибка соединения: ${e.message}` };
  }
}

// ==================== АВТОРИЗАЦИЯ ====================
async function register() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value.trim();

  if (!name || !email || !password) return setMessage('regMessage', 'Заполните все поля');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMessage('regMessage', 'Некорректный email');
  if (password.length < 6) return setMessage('regMessage', 'Пароль минимум 6 символов');

  const result = await apiCall('register', { name, email, password });
  if (result.success) {
    // Автовход после регистрации
    sessionToken = result.token;
    currentUser = result.user;
    document.getElementById('userNameDisplay').textContent = currentUser.name;
    setMessage('regMessage', '✅ Регистрация успешна!', false);
    showScreen('mainScreen');
    loadFeed();
  } else {
    setMessage('regMessage', result.error);
  }
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!email || !password) return setMessage('loginMessage', 'Заполните все поля');

  const result = await apiCall('login', { email, password });
  if (result.success) {
    sessionToken = result.token;
    currentUser = result.user;
    document.getElementById('userNameDisplay').textContent = currentUser.name;
    showScreen('mainScreen');
    loadFeed();
    setMessage('loginMessage', '✅ Добро пожаловать!', false);
  } else {
    setMessage('loginMessage', result.error);
  }
}

function logout() {
  currentUser = null;
  sessionToken = null;
  allPosts = [];
  allUsersCache = {};
  showScreen('loginScreen');
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
}

// ==================== ОТОБРАЖЕНИЕ ПОСТОВ ====================
function renderPosts(posts, showSubscribeButtons = false, title = '') {
  const container = document.getElementById('feedContainer');

  if (!posts || posts.length === 0) {
    container.innerHTML = `
      <p>${escapeHtml(title || 'Нет постов')}</p>
      ${!title ? '<p style="color:#64748b;margin-top:10px;">Подпишитесь на авторов, чтобы видеть их посты!</p>' : ''}
    `;
    return;
  }

  let html = '';
  if (title) {
    html += `
      <div class="recommendations-header">
        <strong>${escapeHtml(title)}</strong>
        <p>Нажмите на тег, чтобы отфильтровать посты по нему.</p>
      </div>`;
  }

  const subs = currentUser.subscriptions
    ? currentUser.subscriptions.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  for (const post of posts) {
    const authorName = escapeHtml(getUserNameSync(post.userId));
    const safeTitle = escapeHtml(post.title);
    const safeContent = escapeHtml(post.content);
    const tags = post.tags ? post.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const badge = post.isPrivate
      ? '<span class="badge-private">🔒 Приватный</span>'
      : '<span class="badge-public">🌍 Публичный</span>';
    const isOwnPost = String(post.userId) === String(currentUser.id);
    const isSubscribed = subs.includes(String(post.userId));

    html += `
      <div class="post-card" data-postid="${escapeHtml(post.id)}">
        <div class="post-header">
          <div>
            <span class="post-title">${safeTitle}</span>
            ${badge}
          </div>
          <span class="post-meta">${authorName} • ${new Date(post.createdAt).toLocaleDateString()}</span>
        </div>
        <p style="margin:10px 0;">${safeContent}</p>
        <div class="post-tags">
          ${tags.map(tag => `<span class="post-tag" onclick="filterByTag('${escapeHtml(tag)}')">#${escapeHtml(tag)}</span>`).join('')}
        </div>
        <div class="post-actions">
          <button onclick="showComments('${escapeHtml(post.id)}')">💬 Комментировать</button>
          ${isOwnPost ? `
            <button onclick="editPost('${escapeHtml(post.id)}')">✏️ Редактировать</button>
            <button class="btn-danger" onclick="deletePost('${escapeHtml(post.id)}')">🗑️ Удалить</button>
            ${post.isPrivate ? `<button class="btn-outline" onclick="showAccessRequests('${escapeHtml(post.id)}')">🔑 Заявки</button>` : ''}
          ` : ''}
          ${showSubscribeButtons && !isOwnPost ? (
            isSubscribed
              ? `<button class="btn-unsubscribe" onclick="unsubscribeUser('${escapeHtml(post.userId)}')">🔕 Отписаться</button>`
              : `<button class="btn-subscribe" onclick="subscribeUser('${escapeHtml(post.userId)}')">➕ Подписаться</button>`
          ) : ''}
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

// ==================== ЛЕНТА ====================
async function loadFeed() {
  if (!currentUser) return;
  currentMode = 'feed';
  document.getElementById('feedContainer').innerHTML = '<p>⏳ Загрузка...</p>';

  const subs = currentUser.subscriptions
    ? currentUser.subscriptions.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  if (!subs.includes(String(currentUser.id))) subs.push(String(currentUser.id));

  const result = await apiCall('getPosts');
  if (result.success) {
    const posts = result.posts.filter(p => subs.includes(String(p.userId)));
    allPosts = posts;
    await loadUserNames(posts.map(p => p.userId));
    renderPosts(posts, false);
  } else {
    document.getElementById('feedContainer').innerHTML = `<p style="color:red;">❌ ${escapeHtml(result.error)}</p>`;
  }
}

// ==================== РЕКОМЕНДАЦИИ ====================
async function loadRecommendations() {
  if (!currentUser) return;
  currentMode = 'recommendations';
  document.getElementById('feedContainer').innerHTML = '<p>⏳ Загрузка рекомендаций...</p>';

  const result = await apiCall('getPosts', { isPrivate: 'false' });
  if (result.success) {
    const posts = result.posts;
    allPosts = posts;

    if (posts.length === 0) {
      document.getElementById('feedContainer').innerHTML = `
        <div class="recommendations-header" style="text-align:center;">
          <strong>😕 Публичных постов пока нет</strong>
          <p>Станьте первым, кто создаст публичный пост!</p>
          <button onclick="showCreatePost()" style="margin-top:10px;">➕ Создать первый пост</button>
        </div>`;
    } else {
      await loadUserNames(posts.map(p => p.userId));
      renderPosts(posts, true, '🔥 Рекомендации');
    }
  } else {
    document.getElementById('feedContainer').innerHTML = `<p style="color:red;">❌ ${escapeHtml(result.error)}</p>`;
  }
}

// ==================== ТЕГИ ====================
function filterByTag(tag) {
  const searchTag = String(tag).trim().toLowerCase();
  if (!searchTag) return;

  const filtered = allPosts.filter(post => {
    if (!post.tags) return false;
    return post.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).includes(searchTag);
  });

  const backAction = getBackAction();

  if (filtered.length === 0) {
    document.getElementById('feedContainer').innerHTML = `
      <h2>🏷️ #${escapeHtml(tag)}</h2>
      <p>Нет постов с тегом #${escapeHtml(tag)}</p>
      <button onclick="${backAction}" style="margin-top:15px;">🔄 Показать все</button>`;
    return;
  }

  const showSubscribe = currentMode === 'recommendations';
  renderPosts(filtered, showSubscribe, `🏷️ #${tag}`);

  const container = document.getElementById('feedContainer');
  container.innerHTML += `<button onclick="${backAction}" style="margin-top:15px;">🔄 Показать все посты</button>`;
}

function showAllTags() {
  currentMode = 'tags';
  const container = document.getElementById('feedContainer');

  const tagsSet = new Set();
  allPosts.forEach(p => {
    if (p.tags) p.tags.split(',').forEach(t => { const x = t.trim(); if (x) tagsSet.add(x); });
  });

  const tags = [...tagsSet].sort((a, b) => a.localeCompare(b));

  if (tags.length === 0) {
    container.innerHTML = `
      <h2>📋 Все теги</h2>
      <p>Тегов пока нет. Создайте пост с тегами!</p>
      <button onclick="loadFeed()" style="margin-top:15px;">🔄 Вернуться в ленту</button>`;
    return;
  }

  container.innerHTML = `
    <h2>📋 Все теги (${tags.length})</h2>
    <p style="color:#64748b;margin-bottom:15px;">Нажмите на тег, чтобы отфильтровать посты</p>
    <div class="post-tags" style="gap:10px;">
      ${tags.map(t => `<span class="post-tag" style="font-size:15px;padding:8px 16px;" onclick="filterByTag('${escapeHtml(t)}')">#${escapeHtml(t)}</span>`).join('')}
    </div>
    <button onclick="sortPostsByTagCount()" style="margin-top:20px;">↕️ Сортировать по кол-ву тегов</button>
    <button onclick="loadFeed()" style="margin-top:20px;margin-left:10px;">🔄 Вернуться в ленту</button>`;
}

function sortPostsByTagCount() {
  const sorted = [...allPosts].sort((a, b) => {
    const aCount = a.tags ? a.tags.split(',').filter(t => t.trim()).length : 0;
    const bCount = b.tags ? b.tags.split(',').filter(t => t.trim()).length : 0;
    return bCount - aCount;
  });
  renderPosts(sorted, currentMode === 'recommendations', '↕️ Сортировка по тегам');
}

// ==================== ПОДПИСКИ ====================
async function subscribeUser(userId) {
  if (!currentUser) return;
  const result = await apiCall('subscribe', { targetUserId: userId });
  if (result.success) {
    currentUser.subscriptions = result.subscriptions.join(',');
    alert('✅ Подписка оформлена!');
    if (currentMode === 'recommendations') loadRecommendations();
    else loadFeed();
  } else {
    alert('❌ ' + result.error);
  }
}

async function unsubscribeUser(userId) {
  if (!currentUser) return;
  if (!confirm('Отписаться от этого пользователя?')) return;
  const result = await apiCall('unsubscribe', { targetUserId: userId });
  if (result.success) {
    currentUser.subscriptions = result.subscriptions.join(',');
    alert('✅ Отписка оформлена');
    if (currentMode === 'recommendations') loadRecommendations();
    else loadFeed();
  } else {
    alert('❌ ' + result.error);
  }
}

// ==================== СОЗДАНИЕ/РЕДАКТИРОВАНИЕ ====================
function showCreatePost() {
  document.getElementById('postModalTitle').textContent = 'Создать новый пост';
  document.getElementById('editPostId').value = '';
  document.getElementById('postTitle').value = '';
  document.getElementById('postContent').value = '';
  document.getElementById('postTags').value = '';
  document.getElementById('postPrivacy').value = 'false';
  document.getElementById('postAllowedUsers').value = '';
  document.getElementById('allowedUsersGroup').style.display = 'none';
  showModal('postModal');
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('postPrivacy');
  if (sel) sel.addEventListener('change', function () {
    document.getElementById('allowedUsersGroup').style.display = this.value === 'true' ? 'block' : 'none';
  });
});

async function savePost() {
  const postId = document.getElementById('editPostId').value;
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();
  const tags = document.getElementById('postTags').value.trim();
  const isPrivate = document.getElementById('postPrivacy').value;
  const allowedUsers = document.getElementById('postAllowedUsers').value.trim();

  if (!title || !content) return alert('Заполните заголовок и текст');

  const data = { title, content, tags, isPrivate, allowedUsers };

  let result;
  if (postId) {
    result = await apiCall('editPost', { ...data, postId });
  } else {
    result = await apiCall('addPost', data);
  }

  if (result.success) {
    closeModal('postModal');
    refreshCurrentView();
  } else {
    alert('❌ ' + result.error);
  }
}

function editPost(postId) {
  const post = allPosts.find(p => String(p.id) === String(postId));
  if (!post) return alert('Пост не найден');
  if (String(post.userId) !== String(currentUser.id)) return alert('Нет прав');

  document.getElementById('postModalTitle').textContent = 'Редактировать пост';
  document.getElementById('editPostId').value = post.id;
  document.getElementById('postTitle').value = post.title;
  document.getElementById('postContent').value = post.content;
  document.getElementById('postTags').value = post.tags || '';
  document.getElementById('postPrivacy').value = post.isPrivate ? 'true' : 'false';
  document.getElementById('postAllowedUsers').value = post.allowedUsers ? post.allowedUsers.join(', ') : '';
  document.getElementById('allowedUsersGroup').style.display = post.isPrivate ? 'block' : 'none';
  showModal('postModal');
}

// ==================== УДАЛЕНИЕ ====================
async function deletePost(postId) {
  if (!confirm('Удалить пост?')) return;
  const result = await apiCall('deletePost', { postId });
  if (result.success) refreshCurrentView();
  else alert('❌ ' + result.error);
}

function refreshCurrentView() {
  if (currentMode === 'recommendations') loadRecommendations();
  else if (currentMode === 'profile') loadMyProfile();
  else if (currentMode === 'tags') showAllTags();
  else loadFeed();
}

// ==================== ПРОФИЛЬ ====================
async function loadMyProfile() {
  if (!currentUser) return;
  currentMode = 'profile';
  const container = document.getElementById('feedContainer');
  container.innerHTML = `
    <h2>👤 Профиль ${escapeHtml(currentUser.name)}</h2>
    <p><strong>Email:</strong> ${escapeHtml(currentUser.email)}</p>
    <p><strong>Подписки:</strong> ${escapeHtml(currentUser.subscriptions || 'Нет подписок')}</p>
    <hr style="margin:20px 0;">
    <h3>Мои посты</h3>
    <button onclick="showCreatePost()">➕ Создать новый пост</button>
    <div id="myPostsContainer"></div>`;

  const result = await apiCall('getPosts');
  if (!result.success) return;

  const myPosts = result.posts.filter(p => String(p.userId) === String(currentUser.id));
  allPosts = myPosts;
  const postsContainer = document.getElementById('myPostsContainer');

  if (myPosts.length === 0) {
    postsContainer.innerHTML = '<p>Вы еще не создали ни одного поста.</p>';
    return;
  }

  let html = '';
  for (const post of myPosts) {
    const tags = post.tags ? post.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const badge = post.isPrivate ? '🔒 Приватный' : '🌍 Публичный';
    html += `
      <div class="post-card">
        <div class="post-header">
          <span class="post-title">${escapeHtml(post.title)}</span>
          <span class="post-meta">${badge}</span>
        </div>
        <p>${escapeHtml(post.content)}</p>
        <div class="post-tags">
          ${tags.map(tag => `<span class="post-tag" onclick="filterByTag('${escapeHtml(tag)}')">#${escapeHtml(tag)}</span>`).join('')}
        </div>
        <div class="post-actions">
          <button onclick="editPost('${escapeHtml(post.id)}')">✏️ Редактировать</button>
          <button class="btn-danger" onclick="deletePost('${escapeHtml(post.id)}')">🗑️ Удалить</button>
          ${post.isPrivate ? `<button class="btn-outline" onclick="showAccessRequests('${escapeHtml(post.id)}')">🔑 Заявки</button>` : ''}
        </div>
      </div>`;
  }
  postsContainer.innerHTML = html;
}

// ==================== КОММЕНТАРИИ ====================
async function showComments(postId) {
  document.getElementById('commentPostId').value = postId;
  document.getElementById('commentText').value = '';
  showModal('commentsModal');

  const result = await apiCall('getComments', { postId });
  const container = document.getElementById('commentsContainer');

  if (result.success && result.comments.length > 0) {
    await loadUserNames(result.comments.map(c => c.userId));
    let html = '';
    for (const c of result.comments) {
      const name = escapeHtml(getUserNameSync(c.userId));
      html += `
        <div class="comment-item">
          <strong>${name}</strong>
          <span style="color:#94a3b8;font-size:13px;">${new Date(c.createdAt).toLocaleString()}</span>
          <p style="margin-top:5px;">${escapeHtml(c.text)}</p>
        </div>`;
    }
    container.innerHTML = html;
  } else if (result.success) {
    container.innerHTML = '<p>Нет комментариев. Будьте первым!</p>';
  } else {
    container.innerHTML = `<p style="color:red;">${escapeHtml(result.error)}</p>`;
  }
}

async function addComment() {
  const postId = document.getElementById('commentPostId').value;
  const text = document.getElementById('commentText').value.trim();
  if (!text) return alert('Напишите текст комментария');

  const result = await apiCall('addComment', { postId, text });
  if (result.success) showComments(postId);
  else alert('❌ ' + result.error);
}

// ==================== ЗАЯВКИ НА ДОСТУП ====================
async function showAccessRequests(postId) {
  document.getElementById('accessPostId').value = postId;
  showModal('accessModal');

  const result = await apiCall('getAccessRequests', { postId });
  const container = document.getElementById('accessContainer');

  if (!result.success) {
    container.innerHTML = `<p style="color:red;">${escapeHtml(result.error)}</p>`;
    return;
  }
  if (result.requests.length === 0) {
    container.innerHTML = '<p>Заявок нет</p>';
    return;
  }

  await loadUserNames(result.requests.map(r => r.requesterId));

  let html = '';
  for (const r of result.requests) {
    const name = escapeHtml(getUserNameSync(r.requesterId));
    const status = r.status === 'approved' ? '✅ Одобрено' : (r.status === 'pending' ? '⏳ Ожидает' : '❌ Отклонено');
    html += `
      <div class="comment-item">
        <strong>${name}</strong> <span style="color:#94a3b8;">(ID ${escapeHtml(r.requesterId)})</span>
        <p>${status}</p>
        ${r.status === 'pending' ? `<button onclick="approveAccess('${escapeHtml(r.id)}','${escapeHtml(postId)}')">✅ Одобрить</button>` : ''}
      </div>`;
  }
  container.innerHTML = html;
}

async function approveAccess(requestId, postId) {
  const result = await apiCall('approveAccess', { requestId });
  if (result.success) {
    alert('✅ Доступ одобрен');
    showAccessRequests(postId);
  } else {
    alert('❌ ' + result.error);
  }
}

// ==================== ЗАПРОС ДОСТУПА К ПРИВАТНОМУ ПОСТУ ====================
async function requestAccess(postId) {
  const result = await apiCall('requestAccess', { postId });
  if (result.success) alert('✅ Заявка отправлена автору');
  else alert('❌ ' + result.error);
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
window.onload = function () {
  console.log('📝 Блог приложение запущено!');
};
