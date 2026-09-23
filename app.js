/**
 * 集中治療認証看護師 過去問演習アプリ コアスクリプト
 */

// グローバル状態
let allQuestions = [];
let userAnswers = {}; // { qId: { selectedKeys: [], isCorrect: bool, timestamp: number } }
let bookmarkedIds = new Set(); // Set of qId

let currentSession = {
  mode: '', // 'year', 'random', 'wrong', 'bookmark'
  title: '',
  questions: [],
  currentIndex: 0,
  userSelections: [],
  isAnswered: false,
  sessionResults: [] // { qId, isCorrect }
};

// LocalStorageキー
const STORAGE_KEY_ANSWERS = 'icrn_user_answers_v1';
const STORAGE_KEY_BOOKMARKS = 'icrn_bookmarks_v1';
const STORAGE_KEY_THEME = 'icrn_theme_v1';

// DOM要素の参照
const dom = {
  // Views
  viewHome: document.getElementById('view-home'),
  viewQuiz: document.getElementById('view-quiz'),
  viewResult: document.getElementById('view-result'),

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

// 初期化処理
async function init() {
  loadStoredData();
  setupTheme();
  setupEventListeners();
  await loadQuestionsData();
  updateDashboardStats();
  renderOverviewGrid(2025);
}

// データのロード
async function loadQuestionsData() {
  try {
    const res = await fetch('./data/questions.json');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    allQuestions = await res.json();
    console.log(`Loaded ${allQuestions.length} questions successfully.`);
  } catch (err) {
    console.error('Failed to load questions:', err);
    alert('問題データの読み込みに失敗しました。ページを再読み込みしてください。');
  }
}

// ストレージから履歴読み込み
function loadStoredData() {
  try {
    const savedAns = localStorage.getItem(STORAGE_KEY_ANSWERS);
    if (savedAns) userAnswers = JSON.parse(savedAns);

    const savedBm = localStorage.getItem(STORAGE_KEY_BOOKMARKS);
    if (savedBm) bookmarkedIds = new Set(JSON.parse(savedBm));
  } catch (e) {
    console.warn('LocalStorage access error:', e);
  }
}

// ストレージへ保存
function saveUserData() {
  try {
    localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify(userAnswers));
    localStorage.setItem(STORAGE_KEY_BOOKMARKS, JSON.stringify(Array.from(bookmarkedIds)));
  } catch (e) {
    console.warn('LocalStorage save error:', e);
  }
  updateDashboardStats();
}

// テーマ（ダークモード）設定
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

// イベントリスナー設定
function setupEventListeners() {
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
  dom.viewHome.classList.add('hidden');
  dom.viewQuiz.classList.add('hidden');
  dom.viewResult.classList.add('hidden');

  if (viewName === 'home') dom.viewHome.classList.remove('hidden');
  if (viewName === 'quiz') dom.viewQuiz.classList.remove('hidden');
  if (viewName === 'result') dom.viewResult.classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showHome() {
  switchView('home');
  updateDashboardStats();
  const activeTab = dom.overviewTabs.querySelector('.bg-sky-600');
  const yr = activeTab ? parseInt(activeTab.dataset.year, 10) : 2025;
  renderOverviewGrid(yr);
}

// ダッシュボード統計更新
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
  let pool = allQuestions.filter(q => !q.is_cancelled); // 採点対象外は除外
  if (yearFilter !== 'all') {
    const yr = parseInt(yearFilter, 10);
    pool = pool.filter(q => q.year === yr);
  }

  if (pool.length === 0) return alert('出題対象の問題がありません。');

  // シャッフル
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

// 一覧から特定の1問を解く
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

// セッション開始
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

  // 進捗更新
  const total = currentSession.questions.length;
  const currentNum = currentSession.currentIndex + 1;
  dom.quizProgressText.textContent = `問 ${currentNum} / ${total}`;
  dom.quizProgressBar.style.width = `${(currentNum / total) * 100}%`;

  // 問題ヘッダー
  dom.qNumberTag.textContent = `${q.year}年 第${q.q_num}問`;
  
  if (q.is_multiple) {
    dom.qSelectBadge.textContent = `${q.num_choices || 2}つ選べ`;
    dom.qSelectBadge.className = 'px-2 py-0.5 rounded text-xs font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200';
  } else {
    dom.qSelectBadge.textContent = '1つ選べ';
    dom.qSelectBadge.className = 'px-2 py-0.5 rounded text-xs font-bold bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200';
  }

  // ブックマーク状態
  updateBookmarkButtonUI(bookmarkedIds.has(q.id));

  // 問題本文
  dom.qBody.textContent = q.question;

  // 採点対象外アラート
  if (q.is_cancelled) {
    dom.qCancelledAlert.classList.remove('hidden');
  } else {
    dom.qCancelledAlert.classList.add('hidden');
  }

  // 図・画像
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

  // 選択肢
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

  // UI状態初期化
  dom.quizActionBar.classList.remove('hidden');
  dom.btnSubmitAnswer.disabled = true;
  dom.qExplanationCard.classList.add('hidden');

  // ナビゲーションボタン状態
  dom.btnPrevQuestion.disabled = currentSession.currentIndex === 0;
  if (currentSession.currentIndex === total - 1) {
    dom.btnNextQuestion.innerHTML = '<span>結果を見る</span> <i class="ph-bold ph-trophy"></i>';
  } else {
    dom.btnNextQuestion.innerHTML = '<span>次の問題へ</span> <i class="ph-bold ph-caret-right"></i>';
  }

  // 既に解答済みの履歴があれば表示
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

// 選択肢クリック時の挙動
function handleOptionClick(key, cardEl, q) {
  if (currentSession.isAnswered) return; // 回答後は選択不可

  if (q.is_multiple) {
    // 複数選択
    if (currentSession.userSelections.includes(key)) {
      currentSession.userSelections = currentSession.userSelections.filter(k => k !== key);
      cardEl.classList.remove('option-card-selected');
    } else {
      const limit = q.num_choices || 2;
      if (currentSession.userSelections.length >= limit) {
        // 先に入っていたものを押し出すか、制限するか
        const removedKey = currentSession.userSelections.shift();
        const prevCard = dom.qOptionsContainer.querySelector(`[data-key="${removedKey}"]`);
        if (prevCard) prevCard.classList.remove('option-card-selected');
      }
      currentSession.userSelections.push(key);
      cardEl.classList.add('option-card-selected');
    }
  } else {
    // 単一選択
    currentSession.userSelections = [key];
    dom.qOptionsContainer.querySelectorAll('.option-card').forEach(el => {
      el.classList.remove('option-card-selected');
    });
    cardEl.classList.add('option-card-selected');
  }

  // 送信ボタンの活性化判定
  const requiredCount = q.is_multiple ? (q.num_choices || 2) : 1;
  dom.btnSubmitAnswer.disabled = currentSession.userSelections.length !== requiredCount;
}

// 回答の確定
function submitCurrentAnswer() {
  const q = currentSession.questions[currentSession.currentIndex];
  if (!q) return;

  currentSession.isAnswered = true;
  dom.quizActionBar.classList.add('hidden');

  // 正誤判定
  const selectedSorted = [...currentSession.userSelections].sort().join(',');
  const correctSorted = [...q.correct_keys].sort().join(',');
  const isCorrect = (selectedSorted === correctSorted) || q.is_cancelled;

  // 履歴に保存
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

  // 選択肢の色分け
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

  // バナーと解説の表示
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

  // 解説までスムーズスクロール
  dom.qExplanationCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 前の問題へ
function goToPrevQuestion() {
  if (currentSession.currentIndex > 0) {
    currentSession.currentIndex--;
    renderCurrentQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// 次の問題へ / 結果画面
function goToNextQuestion() {
  if (currentSession.currentIndex < currentSession.questions.length - 1) {
    currentSession.currentIndex++;
    renderCurrentQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    showResults();
  }
}

// ブックマーク切り替え
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
  // 今回のセッションで正解した数を集計
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
function handleDataReset() {
  if (confirm('これまでの解答履歴やチェックをすべて初期化しますか？\n（この操作は取り消せません）')) {
    localStorage.removeItem(STORAGE_KEY_ANSWERS);
    localStorage.removeItem(STORAGE_KEY_BOOKMARKS);
    userAnswers = {};
    bookmarkedIds = new Set();
    updateDashboardStats();
    renderOverviewGrid(2025);
    alert('学習データを初期化しました。');
  }
}

// アプリ起動
window.addEventListener('DOMContentLoaded', init);
