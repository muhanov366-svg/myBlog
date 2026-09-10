// ==================== КОНФИГУРАЦИЯ ====================
const API_URL = 'https://script.google.com/macros/s/AKfycbz_R-gCeC2vlTvTXdphkysUgcz4_jnKxqG2s_cmel81LaVOA-1bUARZ4kdEirSZaMNqBQ/exec';

// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let currentUser = null;
let allPosts = [];
let allUsersCache = {};
let currentMode = 'feed'; // feed | recommendations | profile | tags

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
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
  if (el) {
    el.textContent = text;
    el.className = isError ? 'error' : 'success';
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 5000);
  }
}

function getUserNameSync(userId) {
  return allUsersCache[userId] || `Пользователь ${userId}`;
}

async function loadUserNames(userIds) {
  const uniqueIds = [...new Set(userIds)];
  for (const id of uniqueIds) {
    if (!allUsersCache[id]) {
      const result = await apiCall('getUserById', { userId: id });
      if (result.success) {
        allUsersCache[id] = result.user.name;
      }
    }
  }
}

// Возвращает JS-код для кнопки «Показать все» в зависимости от текущего режима
function getBackAction() {
  if (currentMode === 'recommendations') return 'loadRecommendations()';
  if (currentMode === 'profile') return 'loadMyProfile()';
  if (currentMode === 'tags') return 'showAllTags()';
  return 'loadFeed()';
}

// ==================== API ЗАПРОСЫ ====================
async function apiCall(action, data = {}) {
  try {
    const params = new URLSearchParams({ action, ...data });
    const url = `${API_URL}?${params.toString()}`;
    
    console.log('📤 Запрос:', action, data);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('📥 Ответ:', result);
    return result;
  } catch (e) {
    console.error('❌ Ошибка запроса:', e);
    return { 
      success: false, 
      error: `Ошибка соединения: ${e.message}` 
    };
  }
}

// ==================== АВТОРИЗАЦИЯ ====================
async function register() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  if (!name || !email || !password) return setMessage('regMessage', 'Заполните все поля');
  
  const result = await apiCall('register', { name, email, password });
  if (result.success) {
    setMessage('regMessage', '✅ Регистрация успешна! Войдите.', false);
    showScreen('loginScreen');
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
  allPosts = [];
  allUsersCache = {};
  showScreen('loginScreen');
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
}

// ==================== ОТОБРАЖЕНИЕ ПОСТОВ (УНИВЕРСАЛЬНАЯ ФУНКЦИЯ) ====================
function renderPosts(posts, showSubscribeButtons = false, title = '') {
  const container = document.getElementById('feedContainer');
  
  if (!posts || posts.length === 0) {
    container.innerHTML = `
      <p>${title || 'Нет постов'}</p>
      ${!title ? '<p style="color: #64748b; margin-top: 10px;">Подпишитесь на авторов, чтобы видеть их посты!</p>' : ''}
    `;
    return;
  }
  
  let html = '';
  
  // Заголовок для рекомендаций / тегов
  if (title) {
    html += `
      <div class="recommendations-header">
        <strong>${title}</strong>
        <p>Нажмите на тег, чтобы отфильтровать посты по нему.</p>
      </div>
    `;
  }
  
  const subs = currentUser.subscriptions 
    ? currentUser.subscriptions.split(',').map(id => String(id).trim()) 
    : [];
  
  for (const post of posts) {
    const authorName = getUserNameSync(post.userId);
    const tags = post.tags ? post.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const isPrivate = post.isPrivate;
    const badge = isPrivate 
      ? '<span class="badge-private">🔒 Приватный</span>' 
      : '<span class="badge-public">🌍 Публичный</span>';
    const isOwnPost = String(post.userId) === String(currentUser.id);
    const isSubscribed = subs.includes(String(post.userId));
    
    html += `
      <div class="post-card" data-postid="${post.id}">
        <div class="post-header">
          <div>
            <span class="post-title">${post.title}</span>
            ${badge}
          </div>
          <span class="post-meta">${authorName} • ${new Date(post.createdAt).toLocaleDateString()}</span>
        </div>
        <p style="margin: 10px 0;">${post.content}</p>
        <div class="post-tags">
          ${tags.map(tag => `<span class="post-tag" onclick="filterByTag('${tag}')">#${tag}</span>`).join('')}
        </div>
        <div class="post-actions">
          <button onclick="showComments(${post.id})">💬 Комментировать</button>
          
          ${isOwnPost ? `
            <button onclick="editPost(${post.id})">✏️ Редактировать</button>
            <button class="btn-danger" onclick="deletePost(${post.id})">🗑️ Удалить</button>
          ` : ''}
          
          ${showSubscribeButtons && !isOwnPost ? `
            ${isSubscribed ? `
              <button class="btn-unsubscribe" onclick="unsubscribeUser('${post.userId}')">🔕 Отписаться</button>
            ` : `
              <button class="btn-subscribe" onclick="subscribeUser('${post.userId}')">➕ Подписаться</button>
            `}
          ` : ''}
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

// ==================== ЛЕНТА ====================
async function loadFeed() {
  if (!currentUser) return;
  
  currentMode = 'feed';
  document.getElementById('feedContainer').innerHTML = '<p>⏳ Загрузка...</p>';
  
  let subs = currentUser.subscriptions 
    ? currentUser.subscriptions.split(',').map(id => id.trim()) 
    : [];
  if (!subs.includes(String(currentUser.id))) subs.push(String(currentUser.id));
  
  const result = await apiCall('getPosts', { userId: currentUser.id });
  if (result.success) {
    const userIds = result.posts.map(p => p.userId);
    await loadUserNames(userIds);
    
    let posts = result.posts.filter(post => subs.includes(String(post.userId)));
    allPosts = posts; // ✅ обновляем
    renderPosts(posts, false);
  } else {
    document.getElementById('feedContainer').innerHTML = `<p style="color:red;">❌ Ошибка: ${result.error}</p>`;
  }
}

// ==================== РЕКОМЕНДАЦИИ ====================
async function loadRecommendations() {
  if (!currentUser) return;
  
  currentMode = 'recommendations';
  document.getElementById('feedContainer').innerHTML = '<p>⏳ Загрузка рекомендаций...</p>';
  
  const result = await apiCall('getPosts', { 
    userId: currentUser.id,
    isPrivate: 'false'
  });
  
  if (result.success) {
    const posts = result.posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    allPosts = posts; // ✅ обновляем
    
    if (posts.length === 0) {
      document.getElementById('feedContainer').innerHTML = `
        <div class="recommendations-header" style="text-align: center;">
          <strong>😕 Публичных постов пока нет</strong>
          <p>Станьте первым, кто создаст публичный пост!</p>
          <button onclick="showCreatePost()" style="margin-top: 10px;">➕ Создать первый пост</button>
        </div>
      `;
    } else {
      const userIds = posts.map(p => p.userId);
      await loadUserNames(userIds);
      renderPosts(posts, true, '🔥 Рекомендации');
    }
  } else {
    document.getElementById('feedContainer').innerHTML = `<p style="color:red;">❌ Ошибка: ${result.error}</p>`;
  }
}

// ==================== ТЕГИ ====================
function filterByTag(tag) {
  const searchTag = String(tag).trim().toLowerCase();
  if (!searchTag) return;
  
  const filtered = allPosts.filter(post => {
    if (!post.tags) return false;
    return post.tags.split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)
      .includes(searchTag);
  });
  
  const backAction = getBackAction();
  
  if (filtered.length === 0) {
    document.getElementById('feedContainer').innerHTML = `
      <h2>🏷️ #${tag}</h2>
      <p>Нет постов с тегом #${tag}</p>
      <button onclick="${backAction}" style="margin-top:15px;">🔄 Показать все</button>
    `;
    return;
  }
  
  const showSubscribe = currentMode === 'recommendations';
  renderPosts(filtered, showSubscribe, `🏷️ #${tag}`);
  
  const container = document.getElementById('feedContainer');
  container.innerHTML += `
    <button onclick="${backAction}" style="margin-top:15px;">
      🔄 Показать все посты
    </button>
  `;
}

// Поиск по тегу из поля ввода
function searchByTag() {
  const input = document.getElementById('tagSearchInput');
  if (!input) return;
  const tag = input.value.trim();
  if (!tag) return alert('Введите тег для поиска');
  filterByTag(tag);
}

// Экран «Все теги»
function showAllTags() {
  currentMode = 'tags';
  const container = document.getElementById('feedContainer');
  
  const tagsSet = new Set();
  allPosts.forEach(p => {
    if (p.tags) {
      p.tags.split(',').forEach(t => {
        const trimmed = t.trim();
        if (trimmed) tagsSet.add(trimmed);
      });
    }
  });
  
  const tags = [...tagsSet].sort((a, b) => a.localeCompare(b));
  
  if (tags.length === 0) {
    container.innerHTML = `
      <h2>📋 Все теги</h2>
      <p>Тегов пока нет. Создайте пост с тегами!</p>
      <button onclick="loadFeed()" style="margin-top:15px;">🔄 Вернуться в ленту</button>
    `;
    return;
  }
  
  container.innerHTML = `
    <h2>📋 Все теги (${tags.length})</h2>
    <p style="color:#64748b;margin-bottom:15px;">Нажмите на тег, чтобы отфильтровать посты</p>
    <div class="post-tags" style="gap:10px;">
      ${tags.map(t => `<span class="post-tag" style="font-size:15px;padding:8px 16px;" onclick="filterByTag('${t}')">#${t}</span>`).join('')}
    </div>
    <button onclick="loadFeed()" style="margin-top:20px;">🔄 Вернуться в ленту</button>
  `;
}

// Сортировка постов по количеству тегов
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
  
  const result = await apiCall('subscribe', { 
    currentUserId: currentUser.id, 
    targetUserId: userId 
  });
  
  if (result.success) {
    currentUser.subscriptions = result.subscriptions.join(',');
    alert('✅ Подписка оформлена!');
    
    if (currentMode === 'recommendations') {
      loadRecommendations();
    } else {
      loadFeed();
    }
  } else {
    alert('❌ Ошибка: ' + result.error);
  }
}

async function unsubscribeUser(userId) {
  if (!currentUser) return;
  if (!confirm('Отписаться от этого пользователя?')) return;
  
  const result = await apiCall('unsubscribe', { 
    currentUserId: currentUser.id, 
    targetUserId: userId 
  });
  
  if (result.success) {
    currentUser.subscriptions = result.subscriptions.join(',');
    alert('✅ Отписка оформлена');
    
    if (currentMode === 'recommendations') {
      loadRecommendations();
    } else {
      loadFeed();
    }
  } else {
    alert('❌ Ошибка: ' + result.error);
  }
}

// ==================== СОЗДАНИЕ И РЕДАКТИРОВАНИЕ ПОСТА ====================
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

document.getElementById('postPrivacy').addEventListener('change', function() {
  const group = document.getElementById('allowedUsersGroup');
  group.style.display = this.value === 'true' ? 'block' : 'none';
});

async function savePost() {
  const postId = document.getElementById('editPostId').value;
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();
  const tags = document.getElementById('postTags').value.trim();
  const isPrivate = document.getElementById('postPrivacy').value;
  const allowedUsers = document.getElementById('postAllowedUsers').value.trim();
  
  if (!title || !content) return alert('Заполните заголовок и текст');

  const data = {
    userId: currentUser.id,
    title,
    content,
    tags,
    isPrivate,
    allowedUsers
  };

  let result;
  if (postId) {
    data.postId = postId;
    result = await apiCall('editPost', data);
  } else {
    result = await apiCall('addPost', data);
  }

  if (result.success) {
    closeModal('postModal');
    if (currentMode === 'recommendations') {
      loadRecommendations();
    } else if (currentMode === 'profile') {
      loadMyProfile();
    } else {
      loadFeed();
    }
  } else {
    alert('Ошибка: ' + result.error);
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
  
  const result = await apiCall('deletePost', { postId, userId: currentUser.id });
  if (result.success) {
    if (currentMode === 'recommendations') {
      loadRecommendations();
    } else if (currentMode === 'profile') {
      loadMyProfile();
    } else {
      loadFeed();
    }
  } else {
    alert('Ошибка: ' + result.error);
  }
}

// ==================== ПРОФИЛЬ ====================
async function loadMyProfile() {
  if (!currentUser) return;
  
  currentMode = 'profile';
  const container = document.getElementById('feedContainer');
  container.innerHTML = `
    <h2>👤 Профиль ${currentUser.name}</h2>
    <p><strong>Email:</strong> ${currentUser.email}</p>
    <p><strong>Подписки:</strong> ${currentUser.subscriptions || 'Нет подписок'}</p>
    <hr style="margin: 20px 0;">
    <h3>Мои посты</h3>
    <button onclick="showCreatePost()">➕ Создать новый пост</button>
    <div id="myPostsContainer"></div>
  `;

  const result = await apiCall('getPosts', { userId: currentUser.id });
  if (result.success) {
    const myPosts = result.posts.filter(p => String(p.userId) === String(currentUser.id));
    allPosts = myPosts; // ✅ обновляем для фильтра по тегам
    const postsContainer = document.getElementById('myPostsContainer');
    
    if (myPosts.length === 0) {
      postsContainer.innerHTML = '<p>Вы еще не создали ни одного поста.</p>';
    } else {
      let html = '';
      for (const post of myPosts) {
        const tags = post.tags ? post.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const badge = post.isPrivate ? '🔒 Приватный' : '🌍 Публичный';
        html += `
          <div class="post-card">
            <div class="post-header">
              <span class="post-title">${post.title}</span>
              <span class="post-meta">${badge}</span>
            </div>
            <p>${post.content}</p>
            <div class="post-tags">
              ${tags.map(tag => `<span class="post-tag" onclick="filterByTag('${tag}')">#${tag}</span>`).join('')}
            </div>
            <div class="post-actions">
              <button onclick="editPost(${post.id})">✏️ Редактировать</button>
              <button class="btn-danger" onclick="deletePost(${post.id})">🗑️ Удалить</button>
            </div>
          </div>
        `;
      }
      postsContainer.innerHTML = html;
    }
  }
}

// ==================== КОММЕНТАРИИ ====================
async function showComments(postId) {
  document.getElementById('commentPostId').value = postId;
  document.getElementById('commentText').value = '';
  showModal('commentsModal');
  
  const result = await apiCall('getComments', { postId });
  const container = document.getElementById('commentsContainer');
  
  if (result.success && result.comments.length > 0) {
    const userIds = result.comments.map(c => c.userId);
    await loadUserNames(userIds);
    
    let html = '';
    for (const comment of result.comments) {
      const name = getUserNameSync(comment.userId);
      html += `
        <div class="comment-item">
          <strong>${name}</strong> 
          <span style="color:#94a3b8;font-size:13px;">${new Date(comment.createdAt).toLocaleString()}</span>
          <p style="margin-top:5px;">${comment.text}</p>
        </div>
      `;
    }
    container.innerHTML = html;
  } else {
    container.innerHTML = '<p>Нет комментариев. Будьте первым!</p>';
  }
}

async function addComment() {
  const postId = document.getElementById('commentPostId').value;
  const text = document.getElementById('commentText').value.trim();
  if (!text) return alert('Напишите текст комментария');
  
  const result = await apiCall('addComment', { postId, userId: currentUser.id, text });
  if (result.success) {
    showComments(postId);
  } else {
    alert('Ошибка: ' + result.error);
  }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
window.onload = function() {
  console.log('📝 Блог приложение запущено!');
};
