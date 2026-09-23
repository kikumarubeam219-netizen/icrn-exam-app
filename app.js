/**
 * 集中治療認証看護師 過去問演習アプリ コアスクリプト
 * ・Googleログイン認証（Firebase Auth）
 * ・管理者承認制（ホワイトリスト方式）
 * ・個人別クラウドデータ同期（Cloud Firestore）
 * ・年度別演習 / ランダム出題 / 弱点復習機能
 */

// グローバル状態
let allQuestions = [];
let userAnswers = {}; // { qId: { selectedKeys: [], isCorrect: bool, timestamp: number } }
let bookmarkedIds = new Set(); // Set of qId

let currentUser = null; // Firebase User
let isAdmin = false;
let isApproved = false;
let isFirebaseConfigured = false;

let db = null;
let auth = null;

let currentSession = {
  mode: '', // 'year', 'random', 'wrong', 'bookmark'
  title: '',
  questions: [],
  currentIndex: 0,
  userSelections: [],
  isAnswered: false,
  sessionResults: []
};

// LocalStorageキー
const STORAGE_KEY_ANSWERS = 'icrn_user_answers_v1';
const STORAGE_KEY_BOOKMARKS = 'icrn_bookmarks_v1';
const STORAGE_KEY_THEME = 'icrn_theme_v1';

// DOM要素
const dom = {
  // Views
  viewAuth: document.getElementById('view-auth'),
  viewPending: document.getElementById('view-pending'),
  viewHome: document.getElementById('view-home'),
  viewQuiz: document.getElementById('view-quiz'),
  viewResult: document.getElementById('view-result'),

  // Auth / User UI
  btnGoogleLogin: document.getElementById('btn-google-login'),
  authConfigNotice: document.getElementById('auth-config-notice'),
  btnBypassLogin: document.getElementById('btn-bypass-login'),
  pendingUserEmail: document.getElementById('pending-user-email'),
  btnPendingRefresh: document.getElementById('btn-pending-refresh'),
  btnPendingLogout: document.getElementById('btn-pending-logout'),
  userProfileMenu: document.getElementById('user-profile-menu'),
  userAvatar: document.getElementById('user-avatar'),
  btnLogout: document.getElementById('btn-logout'),
  btnAdminPanel: document.getElementById('btn-admin-panel'),
  cloudSyncBadge: document.getElementById('cloud-sync-badge'),

  // Admin Modal
  modalAdminUsers: document.getElementById('modal-admin-users'),
  btnCloseAdminModal: document.getElementById('btn-close-admin-modal'),
  inputNewWhitelistEmail: document.getElementById('input-new-whitelist-email'),
  btnAddWhitelist: document.getElementById('btn-add-whitelist'),
  adminPendingCount: document.getElementById('admin-pending-count'),
  adminPendingList: document.getElementById('admin-pending-list'),
  adminWhitelistCount: document.getElementById('admin-whitelist-count'),
  adminWhitelistList: document.getElementById('admin-whitelist-list'),

  // Header
  btnHome: document.getElementById('btn-header-home'),
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  themeIcon: document.getElementById('theme-icon'),
  btnResetData: document.getElementById('btn-reset-data'),

  // Dashboard Stats
  statSolved: document.getElementById('stat-solved-count'),
  statAccuracy: document.getElementById('stat-accuracy'),
  statReview: document.getElementById('stat-review-count'),
  badgeWrong: document.getElementById('badge-wrong-count'),
  badgeBookmark: document.getElementById('badge-bookmark-count'),

  // Overview
  overviewTabs: document.getElementById('overview-year-tabs'),
  overviewGrid: document.getElementById('overview-grid'),

  // Quiz View
  quizModeBadge: document.getElementById('quiz-mode-badge'),
  quizProgressText: document.getElementById('quiz-progress-text'),
  quizProgressBar: document.getElementById('quiz-progress-bar'),
  btnToggleBookmark: document.getElementById('btn-toggle-bookmark'),
  bookmarkIcon: document.getElementById('bookmark-icon'),
  btnOpenDrawer: document.getElementById('btn-open-drawer'),
  btnExitQuiz: document.getElementById('btn-exit-quiz'),

  qNumberTag: document.getElementById('q-number-tag'),
  qSelectBadge: document.getElementById('q-select-badge'),
  qStatusBadge: document.getElementById('q-status-badge'),
  qBody: document.getElementById('q-body'),
  qImagesContainer: document.getElementById('q-images-container'),
  qCancelledAlert: document.getElementById('q-cancelled-alert'),
  qOptionsContainer: document.getElementById('q-options-container'),

  quizActionBar: document.getElementById('quiz-action-bar'),
  btnSubmitAnswer: document.getElementById('btn-submit-answer'),

  qExplanationCard: document.getElementById('q-explanation-card'),
  bannerResult: document.getElementById('banner-result'),
  bannerIcon: document.getElementById('banner-icon'),
  bannerText: document.getElementById('banner-text'),
  bannerCorrectAns: document.getElementById('banner-correct-ans'),
  qExplanationBody: document.getElementById('q-explanation-body'),
  btnPrevQuestion: document.getElementById('btn-prev-question'),
  btnNextQuestion: document.getElementById('btn-next-question'),

  // Random Mode Inputs
  randomYearSelect: document.getElementById('random-year-select'),
  randomCountButtons: document.getElementById('random-count-buttons'),
  btnStartRandom: document.getElementById('btn-start-random'),

  // Review Buttons
  btnReviewWrong: document.getElementById('btn-review-wrong'),
  btnReviewBookmarks: document.getElementById('btn-review-bookmarks'),

  // Results View
  resultModeTitle: document.getElementById('result-mode-title'),
  resultHeadline: document.getElementById('result-headline'),
  resultSubtext: document.getElementById('result-subtext'),
  resultScore: document.getElementById('result-score'),
  resultPercent: document.getElementById('result-percent'),
  resultGrade: document.getElementById('result-grade'),
  btnResultReviewWrong: document.getElementById('btn-result-review-wrong'),
  btnResultHome: document.getElementById('btn-result-home'),

  // Drawer & Modals
  modalDrawer: document.getElementById('modal-drawer'),
  drawerGrid: document.getElementById('drawer-grid'),
  btnCloseDrawer: document.getElementById('btn-close-drawer'),
  modalImageViewer: document.getElementById('modal-image-viewer'),
  modalImgElement: document.getElementById('modal-img-element'),
  btnCloseImageViewer: document.getElementById('btn-close-image-viewer')
};

// ==================== 初期化 ====================
async function init() {
  setupTheme();
  setupEventListeners();
  await loadQuestionsData();

  // Firebaseのセットアップ
  initFirebase();
}

function initFirebase() {
  if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
    try {
      firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
      isFirebaseConfigured = true;

      // セッションをローカルストレージに永続化（モバイルでのセッション切れ防止）
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
        console.warn('Persistence error:', err);
      });

      // リダイレクト結果の受信（モバイル用）
      auth.getRedirectResult().then(result => {
        if (result && result.user) {
          console.log('Redirect login success:', result.user.email);
        }
      }).catch(err => {
        console.warn('Redirect result error:', err);
      });

      auth.onAuthStateChanged(handleAuthStateChange);
    } catch (e) {
      console.error('Firebase init error:', e);
      fallbackToLocalMode('Firebase初期化エラー');
    }
  } else {
    // Firebase設定が未入力の場合のフォールバック
    isFirebaseConfigured = false;
    dom.authConfigNotice.classList.remove('hidden');
    switchView('auth');
  }
}

function fallbackToLocalMode(reason) {
  console.log('Running in local/offline mode:', reason);
  isApproved = true;
  currentUser = null;
  loadStoredDataLocal();
  switchView('home');
  dom.cloudSyncBadge.innerHTML = '<i class="ph-bold ph-hard-drive"></i> ローカル保存';
  dom.cloudSyncBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/30 text-slate-200 border border-slate-300/30';
  updateDashboardStats();
  renderOverviewGrid(2025);
}

// 認証ステータスの変化を監視
async function handleAuthStateChange(user) {
  if (!user) {
    currentUser = null;
    isAdmin = false;
    isApproved = false;
    dom.userProfileMenu.classList.add('hidden');
    dom.userProfileMenu.classList.remove('flex');
    dom.btnAdminPanel.classList.add('hidden');
    switchView('auth');
    return;
  }

  currentUser = user;
  const userEmail = (user.email || '').toLowerCase().trim();
  const adminEmail = (typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : '').toLowerCase().trim();

  // ユーザーアバター・メニューの表示
  dom.userAvatar.src = user.photoURL || 'icon.svg';
  dom.userAvatar.title = `${user.displayName || ''} (${user.email})`;
  dom.userProfileMenu.classList.remove('hidden');
  dom.userProfileMenu.classList.add('flex');

  // 管理者判定
  if (userEmail && adminEmail && userEmail === adminEmail) {
    isAdmin = true;
    isApproved = true;
    dom.btnAdminPanel.classList.remove('hidden');
  } else {
    isAdmin = false;
    dom.btnAdminPanel.classList.add('hidden');
    // ホワイトリストのチェック
    isApproved = await checkWhitelist(userEmail);
  }

  if (isApproved) {
    // 承認済み: ユーザーデータをクラウドから読み込み
    await loadUserDataFromCloud(user.uid);
    switchView('home');
    updateDashboardStats();
    renderOverviewGrid(2025);
  } else {
    // 未承認: 承認申請を送信し、待機画面を表示
    await submitJoinRequest(user);
    dom.pendingUserEmail.textContent = user.email;
    switchView('pending');
  }
}

// ホワイトリストのチェック
async function checkWhitelist(email) {
  if (!db || !email) return false;
  try {
    const docRef = db.collection('whitelist').doc(email);
    const snap = await docRef.get();
    return snap.exists && snap.data().allowed === true;
  } catch (err) {
    console.warn('Whitelist check error:', err);
    return false;
  }
}

// 承認リクエストの送信
async function submitJoinRequest(user) {
  if (!db) return;
  try {
    const email = (user.email || '').toLowerCase().trim();
    await db.collection('join_requests').doc(email).set({
      email: email,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      requestedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.warn('Submit request error:', e);
  }
}

// クラウド（Firestore）からのユーザーデータ取得
async function loadUserDataFromCloud(uid) {
  if (!db) {
    loadStoredDataLocal();
    return;
  }

  try {
    const userDocRef = db.collection('users').doc(uid);
    const snap = await userDocRef.get();

    if (snap.exists) {
      const data = snap.data();
      userAnswers = data.answers || {};
      bookmarkedIds = new Set(data.bookmarks || []);
      console.log('User data loaded from Firestore cloud.');
    } else {
      // クラウドにまだない場合、LocalStorageにあれば移行
      loadStoredDataLocal();
      await saveUserDataToCloud();
    }
  } catch (err) {
    console.warn('Firestore load failed, falling back to LocalStorage:', err);
    loadStoredDataLocal();
  }
}

// クラウド（Firestore）へのユーザーデータ保存
async function saveUserDataToCloud() {
  if (!currentUser || !db) return;
  try {
    const userDocRef = db.collection('users').doc(currentUser.uid);
    await userDocRef.set({
      email: currentUser.email,
      displayName: currentUser.displayName || '',
      answers: userAnswers,
      bookmarks: Array.from(bookmarkedIds),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore save error:', err);
  }
}

// ユーザーデータの保存（クラウド＋ローカル併用）
function saveUserData() {
  // ローカルにもバックアップ保存
  try {
    localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify(userAnswers));
    localStorage.setItem(STORAGE_KEY_BOOKMARKS, JSON.stringify(Array.from(bookmarkedIds)));
  } catch (e) {}

  // クラウドへ保存
  if (isApproved && currentUser && isFirebaseConfigured) {
    saveUserDataToCloud();
  }

  updateDashboardStats();
}

function loadStoredDataLocal() {
  try {
    const savedAns = localStorage.getItem(STORAGE_KEY_ANSWERS);
    if (savedAns) userAnswers = JSON.parse(savedAns);

    const savedBm = localStorage.getItem(STORAGE_KEY_BOOKMARKS);
    if (savedBm) bookmarkedIds = new Set(JSON.parse(savedBm));
  } catch (e) {}
}

// Googleログイン処理
async function handleGoogleLogin() {
  if (!auth) {
    alert('Firebase設定が完了していません。firebase-config.js をご確認ください。');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    // まずはポップアップ認証を試みる
    await auth.signInWithPopup(provider);
  } catch (error) {
    console.warn('Popup login failed, attempting redirect:', error);
    // ポップアップがブロックされた場合やモバイル環境ではリダイレクトにフォールバック
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
      try {
        await auth.signInWithRedirect(provider);
      } catch (redirectErr) {
        console.error('Redirect sign-in error:', redirectErr);
        alert(`ログインに失敗しました: ${redirectErr.message}`);
      }
    } else if (error.code !== 'auth/popup-closed-by-user') {
      alert(`ログインエラー: ${error.message}\n\n※Firebaseコンソールの「承認済みドメイン」に kikumarubeam219-netizen.github.io が追加されているかご確認ください。`);
    }
  }
}

// ログアウト処理
async function handleLogout() {
  if (auth) {
    await auth.signOut();
  }
  userAnswers = {};
  bookmarkedIds = new Set();
  switchView('auth');
}

// ==================== 管理者用パネル機能 ====================

async function openAdminPanel() {
  if (!isAdmin || !db) return;
  dom.modalAdminUsers.classList.remove('hidden');
  await refreshAdminData();
}

function closeAdminPanel() {
  dom.modalAdminUsers.classList.add('hidden');
}

async function refreshAdminData() {
  if (!db) return;

  // 1. 承認待ちリストの取得
  try {
    const reqSnap = await db.collection('join_requests').orderBy('requestedAt', 'desc').get();
    dom.adminPendingCount.textContent = `${reqSnap.size}件`;
    dom.adminPendingList.innerHTML = '';

    if (reqSnap.empty) {
      dom.adminPendingList.innerHTML = '<div class="text-xs text-slate-400 py-2 text-center">承認待ちの申請はありません</div>';
    } else {
      reqSnap.forEach(doc => {
        const item = doc.data();
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60';
        row.innerHTML = `
          <div>
            <div class="font-bold text-slate-800 dark:text-slate-200 text-xs">${item.displayName || '（名前未設定）'}</div>
            <div class="text-[11px] text-slate-500">${item.email}</div>
          </div>
          <button class="btn-approve-req px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm">
            承認して許可
          </button>
        `;
        row.querySelector('.btn-approve-req').addEventListener('click', async () => {
          await approveUser(item.email);
          await refreshAdminData();
        });
        dom.adminPendingList.appendChild(row);
      });
    }
  } catch (err) {
    console.warn('Error fetching join requests:', err);
  }

  // 2. 許可済みホワイトリストの取得
  try {
    const whiteSnap = await db.collection('whitelist').where('allowed', '==', true).get();
    dom.adminWhitelistCount.textContent = `${whiteSnap.size}名`;
    dom.adminWhitelistList.innerHTML = '';

    if (whiteSnap.empty) {
      dom.adminWhitelistList.innerHTML = '<div class="text-xs text-slate-400 py-2 text-center">許可ユーザーはいません</div>';
    } else {
      whiteSnap.forEach(doc => {
        const email = doc.id;
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700';
        row.innerHTML = `
          <span class="font-medium text-xs text-slate-700 dark:text-slate-300">${email}</span>
          <button class="btn-revoke px-2 py-0.5 text-[11px] font-semibold rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition">
            解除
          </button>
        `;
        row.querySelector('.btn-revoke').addEventListener('click', async () => {
          if (confirm(`${email} の利用許可を解除しますか？`)) {
            await revokeUser(email);
            await refreshAdminData();
          }
        });
        dom.adminWhitelistList.appendChild(row);
      });
    }
  } catch (err) {
    console.warn('Error fetching whitelist:', err);
  }
}

// ユーザー承認処理
async function approveUser(email) {
  if (!db || !email) return;
  const cleanEmail = email.toLowerCase().trim();
  try {
    await db.collection('whitelist').doc(cleanEmail).set({
      allowed: true,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // 申請から削除
    await db.collection('join_requests').doc(cleanEmail).delete();
  } catch (err) {
    alert(`承認に失敗しました: ${err.message}`);
  }
}

// ユーザー許可解除
async function revokeUser(email) {
  if (!db || !email) return;
  const cleanEmail = email.toLowerCase().trim();
  try {
    await db.collection('whitelist').doc(cleanEmail).delete();
  } catch (err) {
    alert(`解除に失敗しました: ${err.message}`);
  }
}

// 手動でメールアドレスを追加
async function handleAddWhitelist() {
  const email = (dom.inputNewWhitelistEmail.value || '').toLowerCase().trim();
  if (!email || !email.includes('@')) {
    alert('有効なメールアドレスを入力してください。');
    return;
  }
  await approveUser(email);
  dom.inputNewWhitelistEmail.value = '';
  await refreshAdminData();
  alert(`${email} を許可リストに追加しました。`);
}

// ==================== 問題データ読み込み ====================
async function loadQuestionsData() {
  try {
    const res = await fetch('./data/questions.json');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    allQuestions = await res.json();
  } catch (err) {
    console.error('Failed to load questions:', err);
  }
}

// ==================== テーマ（ダークモード） ====================
function setupTheme() {
  const saved = localStorage.getItem(STORAGE_KEY_THEME);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === 'dark' || (!saved && prefersDark)) {
    document.documentElement.classList.add('dark');
    dom.themeIcon.className = 'ph-bold ph-sun text-xl text-amber-400';
  } else {
    document.documentElement.classList.remove('dark');
    dom.themeIcon.className = 'ph-bold ph-moon text-xl text-slate-600';
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem(STORAGE_KEY_THEME, isDark ? 'dark' : 'light');
  dom.themeIcon.className = isDark
    ? 'ph-bold ph-sun text-xl text-amber-400'
    : 'ph-bold ph-moon text-xl text-slate-600';
}

// ==================== イベントリスナー ====================
function setupEventListeners() {
  // Auth
  dom.btnGoogleLogin.addEventListener('click', handleGoogleLogin);
  dom.btnLogout.addEventListener('click', handleLogout);
  dom.btnPendingLogout.addEventListener('click', handleLogout);
  dom.btnPendingRefresh.addEventListener('click', () => {
    if (currentUser) handleAuthStateChange(currentUser);
  });
  dom.btnBypassLogin.addEventListener('click', () => {
    fallbackToLocalMode('バイパスログイン');
  });

  // Admin
  dom.btnAdminPanel.addEventListener('click', openAdminPanel);
  dom.btnCloseAdminModal.addEventListener('click', closeAdminPanel);
  dom.modalAdminUsers.addEventListener('click', (e) => {
    if (e.target === dom.modalAdminUsers) closeAdminPanel();
  });
  dom.btnAddWhitelist.addEventListener('click', handleAddWhitelist);

  // Home & Header
  dom.btnHome.addEventListener('click', showHome);
  dom.btnThemeToggle.addEventListener('click', toggleTheme);
  dom.btnResetData.addEventListener('click', handleDataReset);

  // ランダム問題数ボタン
  let randomCount = 20;
  dom.randomCountButtons.querySelectorAll('.btn-count').forEach(btn => {
    btn.addEventListener('click', () => {
      dom.randomCountButtons.querySelectorAll('.btn-count').forEach(b => {
        b.classList.remove('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-950/40', 'text-emerald-600', 'dark:text-emerald-400');
        b.classList.add('border-slate-200', 'dark:border-slate-600', 'bg-white', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-200');
      });
      btn.classList.add('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-950/40', 'text-emerald-600', 'dark:text-emerald-400');
      btn.classList.remove('border-slate-200', 'dark:border-slate-600', 'bg-white', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-200');
      randomCount = parseInt(btn.dataset.count, 10);
    });
  });

  dom.btnStartRandom.addEventListener('click', () => {
    const yr = dom.randomYearSelect.value;
    startRandomMode(yr, randomCount);
  });

  dom.btnReviewWrong.addEventListener('click', startWrongReviewMode);
  dom.btnReviewBookmarks.addEventListener('click', startBookmarkReviewMode);

  // 演習画面
  dom.btnSubmitAnswer.addEventListener('click', submitCurrentAnswer);
  dom.btnPrevQuestion.addEventListener('click', goToPrevQuestion);
  dom.btnNextQuestion.addEventListener('click', goToNextQuestion);
  dom.btnToggleBookmark.addEventListener('click', toggleCurrentBookmark);
  dom.btnExitQuiz.addEventListener('click', confirmExitQuiz);

  // ドロワー
  dom.btnOpenDrawer.addEventListener('click', openDrawer);
  dom.btnCloseDrawer.addEventListener('click', closeDrawer);
  dom.modalDrawer.addEventListener('click', (e) => {
    if (e.target === dom.modalDrawer) closeDrawer();
  });

  // 画像ビューア
  dom.btnCloseImageViewer.addEventListener('click', closeImageViewer);
  dom.modalImageViewer.addEventListener('click', (e) => {
    if (e.target === dom.modalImageViewer) closeImageViewer();
  });

  // 結果画面
  dom.btnResultReviewWrong.addEventListener('click', startWrongReviewMode);
  dom.btnResultHome.addEventListener('click', showHome);

  // ステータスタブ切り替え
  dom.overviewTabs.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      dom.overviewTabs.querySelectorAll('button').forEach(b => {
        b.className = 'px-3 py-1 text-xs font-bold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700';
      });
      btn.className = 'px-3 py-1 text-xs font-bold rounded-lg bg-sky-600 text-white';
      renderOverviewGrid(parseInt(btn.dataset.year, 10));
    });
  });
}

// 画面切り替え
function switchView(viewName) {
  dom.viewAuth.classList.add('hidden');
  dom.viewPending.classList.add('hidden');
  dom.viewHome.classList.add('hidden');
  dom.viewQuiz.classList.add('hidden');
  dom.viewResult.classList.add('hidden');

  if (viewName === 'auth') dom.viewAuth.classList.remove('hidden');
  if (viewName === 'pending') dom.viewPending.classList.remove('hidden');
  if (viewName === 'home') dom.viewHome.classList.remove('hidden');
  if (viewName === 'quiz') dom.viewQuiz.classList.remove('hidden');
  if (viewName === 'result') dom.viewResult.classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showHome() {
  if (!isApproved) {
    switchView(currentUser ? 'pending' : 'auth');
    return;
  }
  switchView('home');
  updateDashboardStats();
  const activeTab = dom.overviewTabs.querySelector('.bg-sky-600');
  const yr = activeTab ? parseInt(activeTab.dataset.year, 10) : 2025;
  renderOverviewGrid(yr);
}

// ダッシュボード統計
function updateDashboardStats() {
  const answeredKeys = Object.keys(userAnswers);
  const totalSolved = answeredKeys.length;
  let correctCount = 0;
  let wrongCount = 0;

  answeredKeys.forEach(k => {
    if (userAnswers[k].isCorrect) correctCount++;
    else wrongCount++;
  });

  const accuracy = totalSolved > 0 ? Math.round((correctCount / totalSolved) * 100) : 0;
  const bookmarkCount = bookmarkedIds.size;

  dom.statSolved.textContent = totalSolved;
  dom.statAccuracy.textContent = totalSolved > 0 ? `${accuracy}%` : '--%';
  dom.statReview.textContent = wrongCount + bookmarkCount;

  dom.badgeWrong.textContent = `${wrongCount}問`;
  dom.badgeBookmark.textContent = `${bookmarkCount}問`;
}

// 全問題一覧グリッド描画
function renderOverviewGrid(year) {
  dom.overviewGrid.innerHTML = '';
  const yearQs = allQuestions.filter(q => q.year === year);

  yearQs.forEach(q => {
    const btn = document.createElement('button');
    const ans = userAnswers[q.id];
    const isBookmarked = bookmarkedIds.has(q.id);

    let bgClass = 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600';
    if (ans) {
      if (ans.isCorrect) {
        bgClass = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      } else {
        bgClass = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800';
      }
    }

    btn.className = `relative p-2 rounded-lg text-xs font-bold border transition hover:opacity-80 flex flex-col items-center justify-center ${bgClass}`;
    btn.innerHTML = `
      <span>問${q.q_num}</span>
      ${isBookmarked ? '<i class="ph-fill ph-star text-amber-500 text-[11px] absolute top-1 right-1"></i>' : ''}
    `;

    btn.addEventListener('click', () => {
      startSingleQuestion(q);
    });

    dom.overviewGrid.appendChild(btn);
  });
}

// ==================== モード開始関数 ====================

// 1. 年度別演習モード
function startYearMode(year) {
  const qs = allQuestions.filter(q => q.year === year);
  if (!qs.length) return alert('問題データがありません。');

  currentSession = {
    mode: 'year',
    title: `${year}年度 過去問演習`,
    questions: qs,
    currentIndex: 0,
    userSelections: [],
    isAnswered: false,
    sessionResults: []
  };

  startSession();
}

// 2. ランダム出題モード
function startRandomMode(yearFilter, count) {
  let pool = allQuestions.filter(q => !q.is_cancelled);
  if (yearFilter !== 'all') {
    const yr = parseInt(yearFilter, 10);
    pool = pool.filter(q => q.year === yr);
  }

  if (pool.length === 0) return alert('出題対象の問題がありません。');

  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  const yrLabel = yearFilter === 'all' ? '全年度' : `${yearFilter}年度`;

  currentSession = {
    mode: 'random',
    title: `ランダム演習 (${yrLabel}・${selected.length}問)`,
    questions: selected,
    currentIndex: 0,
    userSelections: [],
    isAnswered: false,
    sessionResults: []
  };

  startSession();
}

// 3. 間違えた問題復習モード
function startWrongReviewMode() {
  const wrongIds = Object.keys(userAnswers).filter(id => !userAnswers[id].isCorrect);
  if (wrongIds.length === 0) {
    alert('現在、間違えた問題の履歴はありません。素晴らしい成績です！');
    return;
  }

  const qs = allQuestions.filter(q => wrongIds.includes(q.id));
  currentSession = {
    mode: 'wrong',
    title: `間違えた問題の復習 (${qs.length}問)`,
    questions: qs,
    currentIndex: 0,
    userSelections: [],
    isAnswered: false,
    sessionResults: []
  };

  startSession();
}

// 4. チェック（ブックマーク）復習モード
function startBookmarkReviewMode() {
  if (bookmarkedIds.size === 0) {
    alert('チェック（ブックマーク）された問題はまだありません。問題演習中に星マークをタップして追加してください。');
    return;
  }

  const qs = allQuestions.filter(q => bookmarkedIds.has(q.id));
  currentSession = {
    mode: 'bookmark',
    title: `チェックした問題の復習 (${qs.length}問)`,
    questions: qs,
    currentIndex: 0,
    userSelections: [],
    isAnswered: false,
    sessionResults: []
  };

  startSession();
}

function startSingleQuestion(targetQ) {
  const qs = allQuestions.filter(q => q.year === targetQ.year);
  const idx = qs.findIndex(q => q.id === targetQ.id);

  currentSession = {
    mode: 'year',
    title: `${targetQ.year}年度 過去問演習`,
    questions: qs,
    currentIndex: idx >= 0 ? idx : 0,
    userSelections: [],
    isAnswered: false,
    sessionResults: []
  };

  startSession();
}

function startSession() {
  switchView('quiz');
  dom.quizModeBadge.textContent = currentSession.title;
  renderCurrentQuestion();
}

// ==================== 問題レンダリング & 解答判定 ====================

function renderCurrentQuestion() {
  const q = currentSession.questions[currentSession.currentIndex];
  if (!q) return;

  currentSession.userSelections = [];
  currentSession.isAnswered = false;

  const total = currentSession.questions.length;
  const currentNum = currentSession.currentIndex + 1;
  dom.quizProgressText.textContent = `問 ${currentNum} / ${total}`;
  dom.quizProgressBar.style.width = `${(currentNum / total) * 100}%`;

  dom.qNumberTag.textContent = `${q.year}年 第${q.q_num}問`;
  
  if (q.is_multiple) {
    dom.qSelectBadge.textContent = `${q.num_choices || 2}つ選べ`;
    dom.qSelectBadge.className = 'px-2 py-0.5 rounded text-xs font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200';
  } else {
    dom.qSelectBadge.textContent = '1つ選べ';
    dom.qSelectBadge.className = 'px-2 py-0.5 rounded text-xs font-bold bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200';
  }

  updateBookmarkButtonUI(bookmarkedIds.has(q.id));
  dom.qBody.textContent = q.question;

  if (q.is_cancelled) {
    dom.qCancelledAlert.classList.remove('hidden');
  } else {
    dom.qCancelledAlert.classList.add('hidden');
  }

  dom.qImagesContainer.innerHTML = '';
  if (q.images && q.images.length > 0) {
    dom.qImagesContainer.classList.remove('hidden');
    q.images.forEach(imgSrc => {
      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = `問題図 ${q.id}`;
      img.className = 'quiz-figure-img';
      img.title = 'クリックで拡大';
      img.addEventListener('click', () => openImageViewer(imgSrc));
      dom.qImagesContainer.appendChild(img);
    });
  } else {
    dom.qImagesContainer.classList.add('hidden');
  }

  dom.qOptionsContainer.innerHTML = '';
  if (q.options && q.options.length > 0) {
    q.options.forEach(opt => {
      const card = document.createElement('div');
      card.className = 'option-card option-card-default';
      card.dataset.key = opt.key;

      card.innerHTML = `
        <span class="option-badge">${opt.key.toUpperCase()}</span>
        <span class="text-sm sm:text-base leading-snug flex-1">${opt.text}</span>
      `;

      card.addEventListener('click', () => handleOptionClick(opt.key, card, q));
      dom.qOptionsContainer.appendChild(card);
    });
  }

  dom.quizActionBar.classList.remove('hidden');
  dom.btnSubmitAnswer.disabled = true;
  dom.qExplanationCard.classList.add('hidden');

  dom.btnPrevQuestion.disabled = currentSession.currentIndex === 0;
  if (currentSession.currentIndex === total - 1) {
    dom.btnNextQuestion.innerHTML = '<span>結果を見る</span> <i class="ph-bold ph-trophy"></i>';
  } else {
    dom.btnNextQuestion.innerHTML = '<span>次の問題へ</span> <i class="ph-bold ph-caret-right"></i>';
  }

  const pastAns = userAnswers[q.id];
  if (pastAns) {
    dom.qStatusBadge.classList.remove('hidden');
    if (pastAns.isCorrect) {
      dom.qStatusBadge.textContent = '過去解答: 正解';
      dom.qStatusBadge.className = 'text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
    } else {
      dom.qStatusBadge.textContent = '過去解答: 不正解';
      dom.qStatusBadge.className = 'text-xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200';
    }
  } else {
    dom.qStatusBadge.classList.add('hidden');
  }
}

function handleOptionClick(key, cardEl, q) {
  if (currentSession.isAnswered) return;

  if (q.is_multiple) {
    if (currentSession.userSelections.includes(key)) {
      currentSession.userSelections = currentSession.userSelections.filter(k => k !== key);
      cardEl.classList.remove('option-card-selected');
    } else {
      const limit = q.num_choices || 2;
      if (currentSession.userSelections.length >= limit) {
        const removedKey = currentSession.userSelections.shift();
        const prevCard = dom.qOptionsContainer.querySelector(`[data-key="${removedKey}"]`);
        if (prevCard) prevCard.classList.remove('option-card-selected');
      }
      currentSession.userSelections.push(key);
      cardEl.classList.add('option-card-selected');
    }
  } else {
    currentSession.userSelections = [key];
    dom.qOptionsContainer.querySelectorAll('.option-card').forEach(el => {
      el.classList.remove('option-card-selected');
    });
    cardEl.classList.add('option-card-selected');
  }

  const requiredCount = q.is_multiple ? (q.num_choices || 2) : 1;
  dom.btnSubmitAnswer.disabled = currentSession.userSelections.length !== requiredCount;
}

function submitCurrentAnswer() {
  const q = currentSession.questions[currentSession.currentIndex];
  if (!q) return;

  currentSession.isAnswered = true;
  dom.quizActionBar.classList.add('hidden');

  const selectedSorted = [...currentSession.userSelections].sort().join(',');
  const correctSorted = [...q.correct_keys].sort().join(',');
  const isCorrect = (selectedSorted === correctSorted) || q.is_cancelled;

  // 解答データの保存（クラウド＋ローカル）
  userAnswers[q.id] = {
    selectedKeys: currentSession.userSelections,
    isCorrect: isCorrect,
    timestamp: Date.now()
  };
  saveUserData();

  currentSession.sessionResults.push({
    qId: q.id,
    isCorrect: isCorrect
  });

  dom.qOptionsContainer.querySelectorAll('.option-card').forEach(card => {
    const key = card.dataset.key;
    const isSelected = currentSession.userSelections.includes(key);
    const isKeyCorrect = q.correct_keys.includes(key);

    card.classList.remove('option-card-selected');
    if (isKeyCorrect) {
      card.classList.add('option-card-correct');
    } else if (isSelected && !isKeyCorrect) {
      card.classList.add('option-card-wrong');
    }
  });

  if (isCorrect) {
    dom.bannerResult.className = 'p-4 rounded-xl flex items-center justify-between text-white font-bold bg-emerald-600 shadow-md shadow-emerald-600/20';
    dom.bannerIcon.className = 'ph-bold ph-check-circle text-2xl';
    dom.bannerText.textContent = q.is_cancelled ? '全員正答（採点対象外）' : '正解です！お見事！';
  } else {
    dom.bannerResult.className = 'p-4 rounded-xl flex items-center justify-between text-white font-bold bg-rose-600 shadow-md shadow-rose-600/20';
    dom.bannerIcon.className = 'ph-bold ph-x-circle text-2xl';
    dom.bannerText.textContent = '不正解… 解説で復習しましょう';
  }

  dom.bannerCorrectAns.textContent = `正解: ${q.answer_raw || q.correct_keys.join(', ')}`;
  dom.qExplanationBody.textContent = q.explanation || '解説は準備中です。';
  dom.qExplanationCard.classList.remove('hidden');

  dom.qExplanationCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function goToPrevQuestion() {
  if (currentSession.currentIndex > 0) {
    currentSession.currentIndex--;
    renderCurrentQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function goToNextQuestion() {
  if (currentSession.currentIndex < currentSession.questions.length - 1) {
    currentSession.currentIndex++;
    renderCurrentQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    showResults();
  }
}

function toggleCurrentBookmark() {
  const q = currentSession.questions[currentSession.currentIndex];
  if (!q) return;

  if (bookmarkedIds.has(q.id)) {
    bookmarkedIds.delete(q.id);
    updateBookmarkButtonUI(false);
  } else {
    bookmarkedIds.add(q.id);
    updateBookmarkButtonUI(true);
  }
  saveUserData();
}

function updateBookmarkButtonUI(isBookmarked) {
  if (isBookmarked) {
    dom.btnToggleBookmark.className = 'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300';
    dom.bookmarkIcon.className = 'ph-fill ph-star text-amber-500 text-base';
  } else {
    dom.btnToggleBookmark.className = 'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/30';
    dom.bookmarkIcon.className = 'ph-bold ph-star text-base';
  }
}

function confirmExitQuiz() {
  if (confirm('演習を中断してホームに戻りますか？')) {
    showHome();
  }
}

// ==================== 結果画面 ====================
function showResults() {
  switchView('result');

  const total = currentSession.questions.length;
  let correctCount = 0;
  currentSession.questions.forEach(q => {
    if (userAnswers[q.id] && userAnswers[q.id].isCorrect) {
      correctCount++;
    }
  });

  const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  dom.resultModeTitle.textContent = currentSession.title;
  dom.resultScore.textContent = `${correctCount} / ${total}`;
  dom.resultPercent.textContent = `${percent}%`;

  if (percent >= 80) {
    dom.resultHeadline.textContent = '素晴らしい！高得点達成！';
    dom.resultSubtext.textContent = '知識が非常にしっかり定着しています。この調子で本番へ臨みましょう！';
    dom.resultGrade.textContent = '合格圏（優秀）';
    dom.resultGrade.className = 'text-lg sm:text-xl font-black text-emerald-600 mt-1';
  } else if (percent >= 60) {
    dom.resultHeadline.textContent = '合格ライン到達！';
    dom.resultSubtext.textContent = '間違えた問題をしっかり見直すことで、さらに確実な合格力が身につきます。';
    dom.resultGrade.textContent = '合格圏内';
    dom.resultGrade.className = 'text-lg sm:text-xl font-black text-sky-600 mt-1';
  } else {
    dom.resultHeadline.textContent = 'お疲れ様でした！復習のチャンスです';
    dom.resultSubtext.textContent = '集中治療認証看護師試験は解説の理解が鍵です。間違えた問題を今すぐ復習しましょう。';
    dom.resultGrade.textContent = '要復習';
    dom.resultGrade.className = 'text-lg sm:text-xl font-black text-amber-600 mt-1';
  }
}

// ==================== ドロワー & モーダル ====================
function openDrawer() {
  dom.drawerGrid.innerHTML = '';
  currentSession.questions.forEach((q, idx) => {
    const btn = document.createElement('button');
    const isCurrent = idx === currentSession.currentIndex;
    const ans = userAnswers[q.id];
    const isBookmarked = bookmarkedIds.has(q.id);

    let bgClass = 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200';
    if (ans) {
      if (ans.isCorrect) bgClass = 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-400';
      else bgClass = 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border-rose-400';
    }

    if (isCurrent) {
      bgClass += ' ring-2 ring-sky-500 ring-offset-2 dark:ring-offset-slate-800';
    }

    btn.className = `p-2.5 rounded-xl text-xs font-bold border transition relative flex items-center justify-center ${bgClass}`;
    btn.innerHTML = `
      <span>問${q.q_num}</span>
      ${isBookmarked ? '<i class="ph-fill ph-star text-amber-500 text-[10px] absolute top-1 right-1"></i>' : ''}
    `;

    btn.addEventListener('click', () => {
      currentSession.currentIndex = idx;
      renderCurrentQuestion();
      closeDrawer();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    dom.drawerGrid.appendChild(btn);
  });

  dom.modalDrawer.classList.remove('hidden');
}

function closeDrawer() {
  dom.modalDrawer.classList.add('hidden');
}

function openImageViewer(src) {
  dom.modalImgElement.src = src;
  dom.modalImageViewer.classList.remove('hidden');
}

function closeImageViewer() {
  dom.modalImageViewer.classList.add('hidden');
}

// データの初期化
async function handleDataReset() {
  if (confirm('これまでの解答履歴やチェックをすべて初期化しますか？\n（この操作は取り消せません）')) {
    localStorage.removeItem(STORAGE_KEY_ANSWERS);
    localStorage.removeItem(STORAGE_KEY_BOOKMARKS);
    userAnswers = {};
    bookmarkedIds = new Set();

    if (isApproved && currentUser && isFirebaseConfigured) {
      await saveUserDataToCloud();
    }

    updateDashboardStats();
    renderOverviewGrid(2025);
    alert('学習データを初期化しました。');
  }
}

// アプリ起動
window.addEventListener('DOMContentLoaded', init);
