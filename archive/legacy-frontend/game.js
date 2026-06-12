/**
 * 《反着来》游戏引擎
 * Canvas 渲染 + 触控事件 + 游戏状态机 + 全逻辑
 * 依赖：questions.js（全局 QuestionBank）
 */
(function () {
  'use strict';

  // ─── 常量（对齐 design-tokens.json）─────────────────────
  var CANVAS_W = 375;
  var CANVAS_H = 812;                // iPhone X+ 适配
  var QUESTIONS_PER_GAME = 20;
  var PRACTICE_QUESTIONS = 8;
  var LEVEL_QUESTIONS = 10;
  var LEVEL_PASS_COUNT = 6;
  var UNLOCKED_LEVEL_KEY = 'opposite_unlocked_level';
  var LEVEL_CONFIGS = [
    { level: 1, title: '反骨入门', difficulty: 'easy', label: '简单题', timeLimit: 1200 },
    { level: 2, title: '开始手乱', difficulty: 'medium', label: '中档题', timeLimit: 1050 },
    { level: 3, title: '大脑宕机', difficulty: 'hard', label: '难题', timeLimit: 900 }
  ];
  var DEFAULT_TIME_LIMIT = 1200;
  var FEEDBACK_DURATION = 1000;      // 题目间隔 1 秒
  var SWIPE_THRESHOLD = 30;
  var TRANSITION_DELAY = 150;        // animation.fast
  var SAFE_PADDING = 24;             // layout.safePadding
  var MAX_DESKTOP_SCALE = 2.8;

  // colors.background
  var COLOR_BG = '#090C0B';
  var COLOR_BG_SECONDARY = '#101513';
  var COLOR_BG_CARD = '#121816';

  // colors.brand + colors.feedback
  var COLOR_PRIMARY = '#00F5A0';
  var COLOR_DANGER = '#FF3D5A';
  var COLOR_WARNING = '#FFD85C';
  var COLOR_INFO = '#58A6FF';

  // colors.text
  var COLOR_WHITE = '#FFFFFF';
  var COLOR_SECONDARY = '#95A29D';
  var COLOR_DISABLED = '#59625F';

  // colors.game + colors.border
  var COLOR_BTN_BG = '#1A1A1A';
  var COLOR_BTN_RED = '#FF4B5C';
  var COLOR_BTN_BLUE = '#3B82F6';
  var COLOR_TIMER_BG = '#26302D';
  var COLOR_BORDER = '#26302D';

  // typography
  var FONT_FAMILY = '"Alibaba PuHuiTi", "PingFang SC", "Microsoft YaHei", sans-serif';
  var FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  var FONT_HERO = 72;
  var FONT_TITLE = 40;
  var FONT_BUTTON = 22;
  var FONT_BODY = 18;
  var FONT_CAPTION = 14;

  // button
  var BTN_HEIGHT_LARGE = 64;
  var BTN_RADIUS = 2;

  // progressBar
  var PROGRESS_HEIGHT = 8;
  var PROGRESS_RADIUS = 999;

  // ─── 构造函数 ───────────────────────────────────────────

  function OppositeGame() {
    var self = this;

    // Canvas 元素
    this.canvas = document.getElementById('gameCanvas');
    if (!this.canvas) {
      console.error('[反着来] 找不到 #gameCanvas 元素');
      return;
    }
    this.ctx = this.canvas.getContext('2d');
    this.shell = document.getElementById('gameShell') || this.canvas.parentElement;
    if (!this.ctx) {
      console.error('[反着来] 当前浏览器无法创建 Canvas 2D 上下文');
      return;
    }

    // 缩放比例
    this.scale = 1;

    // 游戏状态
    this.page = 'home';         // home | level_select | online_pk | tutorial | playing | pk_transition | result | leaderboard
    this.gameMode = 'single';   // single | local_pk
    this.playMode = 'level';    // level | challenge | practice
    this.selectedLevel = 1;
    this.levelResult = null;
    this.homeNotice = '';
    this.shareNotice = '';
    // ════ 在线 PK Socket.IO 状态 ════
    this.socket = null;
    this.isOnlineGame = false;
    this.onlinePkState = 'idle';       // idle | queuing | matched | playing | result
    this.roomId = null;
    this.opponentName = '';
    this.opponentScore = 0;
    this.opponentCombo = 0;
    this.onlineRound = 0;
    this.onlineTotalRounds = 20;
    this.onlineResult = null;
    this.onlineQueuePos = -1;
    this.onlineQuestionStartMs = 0;
    this.onlineTimeLimit = 8000;
    this.onlineScores = { me: 0 };
    this.onlinePlayerName = '';
    this.motionStop = null;
    this.currentPlayer = 'A';
    this.playerAResult = null;
    this.playerBResult = null;
    this.localPkResult = null;
    this.questions = [];
    this.currentIndex = 0;
    this.score = 0;
    this.totalScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.fastestReaction = Infinity;
    this.answers = [];

    // 当前题目
    this.question = null;
    this.questionStartTime = 0;
    this.timeLimit = DEFAULT_TIME_LIMIT;
    this.timerProgress = 1;
    this.questionAnswered = false;

    // 反馈（数组，每项 {text, color, size}）
    this.feedbackLines = [];
    this.feedbackEndTime = 0;
    this.lastRoundScore = 0;
    this.lastSpeedLabel = '';
    this.lastComboBonus = 0;
    this.screenFlashColor = '';
    this.screenFlashEndTime = 0;
    this.hiddenAt = 0;

    // 触控
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.isTouching = false;

    // 按钮命中区域（逻辑坐标）
    this.buttons = [];

    // 渲染循环
    this.animFrameId = null;
    this.startQuestionTimerId = null;
    this.nextQuestionTimerId = null;

    // 初始化
    this.resize();
    this.bindEvents();
    this.startRenderLoop();
  }

  // ─── 尺寸适配 ───────────────────────────────────────────

  OppositeGame.prototype.resize = function () {
    var bounds = this.shell ? this.shell.getBoundingClientRect() : null;
    var screenW = bounds && bounds.width ? bounds.width : window.innerWidth;
    var screenH = bounds && bounds.height ? bounds.height : window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);

    // 手机按视口等比适配，桌面端限制放大，避免把移动稿拉成巨幅海报。
    this.scale = Math.max(0.1, Math.min(
      screenW / CANVAS_W,
      screenH / CANVAS_H,
      MAX_DESKTOP_SCALE
    ));

    // CSS 尺寸（显示尺寸）—— 不作 floor 保持宽高比一致
    var cssW = CANVAS_W * this.scale;
    var cssH = CANVAS_H * this.scale;

    // Canvas 物理像素：直接从 scale*dpr 计算，保证 X/Y 比例一致
    var phyW = Math.max(1, Math.round(CANVAS_W * this.scale * dpr));
    var phyH = Math.max(1, Math.round(CANVAS_H * this.scale * dpr));
    this.canvas.width  = phyW;
    this.canvas.height = phyH;
    this.canvas.style.width  = cssW + 'px';
    this.canvas.style.height = cssH + 'px';

    // 变换矩阵：强制 X/Y 一致，避免 Canvas 绘制被拉伸变形
    var uniformScale = phyW / CANVAS_W;
    this.renderScaleX = uniformScale;
    this.renderScaleY = uniformScale;

    this.render();
  };

  // ─── 坐标转换 ───────────────────────────────────────────

  OppositeGame.prototype.toLogical = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * CANVAS_W / rect.width,
      y: (clientY - rect.top) * CANVAS_H / rect.height
    };
  };

  // ─── 事件绑定 ───────────────────────────────────────────

  OppositeGame.prototype.bindEvents = function () {
    var self = this;

    window.addEventListener('resize', function () { self.resize(); });
    window.addEventListener('orientationchange', function () { self.resize(); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () { self.resize(); });
    }

    // 触控
    this.canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      self.onTouchStart(e);
    }, { passive: false });

    this.canvas.addEventListener('touchend', function (e) {
      e.preventDefault();
      self.onTouchEnd(e);
    }, { passive: false });

    this.canvas.addEventListener('touchcancel', function (e) {
      self.isTouching = false;
    });

    // 鼠标（PC 调试）
    this.canvas.addEventListener('mousedown', function (e) {
      self.onMouseDown(e);
    });
    this.canvas.addEventListener('mouseup', function (e) {
      self.onMouseUp(e);
    });
    this.canvas.addEventListener('mouseleave', function () {
      self.isTouching = false;
    });

    window.addEventListener('keydown', function (e) {
      self.onKeyDown(e);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        self.hiddenAt = self.page === 'playing' ? Date.now() : 0;
      } else if (self.hiddenAt) {
        if (self.page === 'playing' && !self.questionAnswered && self.questionStartTime > 0) {
          var pauseStart = Math.max(self.hiddenAt, self.questionStartTime);
          self.questionStartTime += Date.now() - pauseStart;
        }
        self.hiddenAt = 0;
      }
    });

    var closeShareFallback = document.getElementById('closeShareFallback');
    if (closeShareFallback) {
      closeShareFallback.addEventListener('click', function () {
        self.hideShareFallback();
      });
    }
  };

  OppositeGame.prototype.onKeyDown = function (e) {
    var key = e.key;

    if (this.page === 'home' && (key === 'Enter' || key === ' ')) {
      e.preventDefault();
      this.goToPage('level_select');
      return;
    }
    if (this.page === 'tutorial' && (key === 'Enter' || key === ' ')) {
      e.preventDefault();
      this.startGame();
      return;
    }
    if (this.page === 'pk_transition' && (key === 'Enter' || key === ' ')) {
      e.preventDefault();
      this.startGame();
      return;
    }
    if (this.page === 'result' && (key === 'Enter' || key === ' ')) {
      e.preventDefault();
      if (this.gameMode === 'local_pk') {
        this.currentPlayer = 'A';
        this.playerAResult = null;
        this.playerBResult = null;
        this.localPkResult = null;
      }
      this.startGame();
      return;
    }
    if (this.page === 'result' && key === 'Escape') {
      e.preventDefault();
      this.resetGameData();
      this.goToPage(this.playMode === 'level' ? 'level_select' : 'home');
      return;
    }
    if ((this.page === 'level_select' || this.page === 'online_pk') && key === 'Escape') {
      e.preventDefault();
      this.goToPage('home');
      return;
    }
    if (this.page === 'leaderboard') {
      if (key === 'Escape' || key === 'Enter' || key === ' ') {
        e.preventDefault();
        this.goToPage('home');
        return;
      }
      return;
    }
    if (this.page !== 'playing' || !this.question || this.questionAnswered) return;

    if (this.question.type === 'direction' &&
        (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown')) {
      e.preventDefault();
      var arrowActions = {
        ArrowLeft: 'swipe_left',
        ArrowRight: 'swipe_right',
        ArrowUp: 'swipe_up',
        ArrowDown: 'swipe_down'
      };
      this.judgeAnswer(arrowActions[key], this.getReactionTime());
      return;
    }

    var optionIndex = key >= '1' && key <= '4' ? Number(key) - 1 : -1;
    var options = this.question.options || [];
    if (optionIndex >= 0 && options[optionIndex]) {
      e.preventDefault();
      this.judgeAnswer(options[optionIndex].action, this.getReactionTime());
    } else if (options.length === 1 && (key === 'Enter' || key === ' ')) {
      e.preventDefault();
      this.judgeAnswer(options[0].action, this.getReactionTime());
    }
  };

  // ─── 触控处理 ───────────────────────────────────────────

  OppositeGame.prototype.onTouchStart = function (e) {
    if (!e.touches.length) return;
    this.isTouching = true;
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  };

  OppositeGame.prototype.onTouchEnd = function (e) {
    if (!this.isTouching) return;
    this.isTouching = false;

    // 使用 changedTouches（手指离开时的位置）
    var endX, endY;
    if (e.changedTouches && e.changedTouches.length) {
      endX = e.changedTouches[0].clientX;
      endY = e.changedTouches[0].clientY;
    } else {
      return; // touchcancel 无坐标
    }

    this.processInput(endX, endY);
  };

  OppositeGame.prototype.onMouseDown = function (e) {
    this.isTouching = true;
    this.touchStartX = e.clientX;
    this.touchStartY = e.clientY;
  };

  OppositeGame.prototype.onMouseUp = function (e) {
    if (!this.isTouching) return;
    this.isTouching = false;
    this.processInput(e.clientX, e.clientY);
  };

  /**
   * 统一处理输入：判断 swipe 还是 tap，分发到对应页面逻辑
   */
  OppositeGame.prototype.processInput = function (clientX, clientY) {
    var start = this.toLogical(this.touchStartX, this.touchStartY);
    var end = this.toLogical(clientX, clientY);
    var deltaX = end.x - start.x;
    var deltaY = end.y - start.y;
    var absDX = Math.abs(deltaX);
    var absDY = Math.abs(deltaY);

    // 判断是否滑动（水平位移 > 垂直位移 且 水平位移 > 阈值）
    var isSwipe = Math.max(absDX, absDY) > SWIPE_THRESHOLD;
    var swipeDir = absDX >= absDY
      ? (deltaX > 0 ? 'swipe_right' : 'swipe_left')
      : (deltaY > 0 ? 'swipe_down' : 'swipe_up');

    switch (this.page) {
      case 'home':
        this.handleHomeInput(end, isSwipe, swipeDir);
        break;
      case 'level_select':
        this.handleLevelSelectInput(end, isSwipe, swipeDir);
        break;
      case 'online_pk':
        this.handleOnlinePkInput(end, isSwipe, swipeDir);
        break;
      case 'tutorial':
        this.handleTutorialInput(end, isSwipe, swipeDir);
        break;
      case 'playing':
        this.handleGameInput(end, isSwipe, swipeDir);
        break;
      case 'result':
        this.handleResultInput(end, isSwipe, swipeDir);
        break;
      case 'pk_transition':
        this.handlePkTransitionInput(end, isSwipe, swipeDir);
        break;
      case 'leaderboard':
        this.handleLeaderboardInput(end, isSwipe, swipeDir);
        break;
    }
  };

  // ─── 页面输入处理 ───────────────────────────────────────

  OppositeGame.prototype.handleHomeInput = function (point, isSwipe, swipeDir) {
    if (isSwipe) return; // 首页不响应滑动
    var btn = this.hitTest(point);
    if (btn && btn.id === 'singleStart') {
      this.homeNotice = '';
      this.gameMode = 'single';
      this.playMode = 'level';
      this.currentPlayer = 'A';
      this.goToPage('level_select');
    } else if (btn && btn.id === 'onlinePkStart') {
      this.homeNotice = '';
      this.goToPage('online_pk');
    } else if (btn && btn.id === 'localPkStart') {
      this.homeNotice = '';
      this.gameMode = 'local_pk';
      this.playMode = 'challenge';
      this.currentPlayer = 'A';
      this.playerAResult = null;
      this.playerBResult = null;
      this.localPkResult = null;
      this.goToPage('tutorial');
    } else if (btn && btn.id === 'practiceStart') {
      this.homeNotice = '';
      this.gameMode = 'single';
      this.playMode = 'practice';
      this.currentPlayer = 'A';
      this.goToPage('tutorial');
    } else if (btn && btn.id === 'shareHome') {
      this.shareGame();
    } else if (btn && btn.id === 'leaderboardBtn') {
      this.goToPage('leaderboard');
    }
  };

  OppositeGame.prototype.handleLevelSelectInput = function (point, isSwipe, swipeDir) {
    if (isSwipe) return;
    var btn = this.hitTest(point);
    if (!btn) return;
    if (btn.id === 'levelBack') {
      this.homeNotice = '';
      this.goToPage('home');
      return;
    }
    if (btn.id.indexOf('level_') !== 0) return;

    var level = Number(btn.id.split('_')[1]);
    if (level > this.getUnlockedLevel()) {
      this.homeNotice = '先通过上一关，正确率达到 60% 即可解锁。';
      this.render();
      return;
    }
    this.homeNotice = '';
    this.selectedLevel = level;
    this.gameMode = 'single';
    this.playMode = 'level';
    this.currentPlayer = 'A';
    this.goToPage('tutorial');
  };

  OppositeGame.prototype.handleOnlinePkInput = function (point, isSwipe, swipeDir) {
    // ── 在线对战进行中：处理游戏操作 ──
    if (this.onlinePkState === 'playing' && !this.questionAnswered && this.question) {
      var q = this.question;
      if (q.type === 'direction' && !(q.options && q.options.length)) {
        if (isSwipe) {
          this.submitOnlineAnswer(swipeDir, Date.now() - this.onlineQuestionStartMs);
        }
      } else {
        if (!isSwipe) {
          var hitBtn = this.hitTest(point);
          if (hitBtn) {
            var ansIdx = hitBtn.action; // 在 drawOnlinePkPlaying 中 action 是索引
            var options = q.options || [];
            if (typeof ansIdx === 'number' && options[ansIdx]) {
              this.submitOnlineAnswer(options[ansIdx].action, Date.now() - this.onlineQuestionStartMs);
            }
          }
        }
      }
      return;
    }

    if (isSwipe) return;
    var btn = this.hitTest(point);
    if (!btn) return;

    // 返回按钮（所有状态通用）
    if (btn.id === 'onlineBack') {
      this.leaveOnlineMatch();
      this.onlinePkState = 'idle';
      this.homeNotice = '';
      this.goToPage('home');
      return;
    }

    // idle: 显示昵称输入，点"开始匹配"打开输入框
    if (btn.id === 'startMatch') {
      this.showPkNameOverlay();
      return;
    }

    // queuing: 取消匹配
    if (btn.id === 'cancelMatch') {
      if (this.socket) this.socket.emit('leave_queue');
      this.onlinePkState = 'idle';
      this.onlineQueuePos = -1;
      this.render();
      return;
    }

    // result: 再来一局
    if (btn.id === 'pkRematch') {
      this.onlinePkState = 'idle';
      this.onlineResult = null;
      this.showPkNameOverlay();
      return;
    }
  };

  OppositeGame.prototype.handleTutorialInput = function (point, isSwipe, swipeDir) {
    if (isSwipe) return;
    var btn = this.hitTest(point);
    if (btn && btn.id === 'tutorialStart') {
      this.startGame();
    }
  };

  OppositeGame.prototype.handleGameInput = function (point, isSwipe, swipeDir) {
    if (this.questionAnswered) return; // 反馈显示期间忽略操作

    var question = this.question;
    if (!question) return;

    var playerAction = null;

    if (question.type === 'motion') return;

    if (question.type === 'direction' && !(question.options && question.options.length)) {
      if (isSwipe) {
        playerAction = swipeDir;
      }
    } else if (question.type === 'action' && question.correct_action === 'wait') {
      if (!isSwipe) playerAction = 'tap';
    } else {
      // 按钮题：只响应 tap（非滑动）
      if (!isSwipe) {
        var hitBtn = this.hitTest(point);
        if (hitBtn) {
          playerAction = hitBtn.action;
        }
      }
    }

    if (playerAction) {
      this.judgeAnswer(playerAction, this.getReactionTime());
    }
  };

  OppositeGame.prototype.handleResultInput = function (point, isSwipe, swipeDir) {
    if (isSwipe) return;
    var btn = this.hitTest(point);
    if (btn && btn.id === 'restart') {
      if (this.gameMode === 'local_pk') {
        this.currentPlayer = 'A';
        this.playerAResult = null;
        this.playerBResult = null;
        this.localPkResult = null;
      }
      this.startGame();
    } else if (btn && btn.id === 'goRanking') {
      this.goToPage('leaderboard');
    } else if (btn && btn.id === 'shareResult') {
      this.shareGame();
    } else if (btn && btn.id === 'goLevels') {
      this.resetGameData();
      this.playMode = 'level';
      this.goToPage('level_select');
    } else if (btn && btn.id === 'goHome') {
      this.resetGameData();
      this.goToPage('home');
    }
  };

  /**
   * 命中测试：遍历当前 buttons 数组，返回命中的按钮对象
   */
  OppositeGame.prototype.hitTest = function (point) {
    for (var i = 0; i < this.buttons.length; i++) {
      var b = this.buttons[i];
      if (point.x >= b.x && point.x <= b.x + b.w &&
          point.y >= b.y && point.y <= b.y + b.h) {
        return b;
      }
    }
    return null;
  };

  // ─── 页面导航 ───────────────────────────────────────────

  OppositeGame.prototype.clearScheduledTransitions = function () {
    if (this.startQuestionTimerId !== null) {
      clearTimeout(this.startQuestionTimerId);
      this.startQuestionTimerId = null;
    }
    if (this.nextQuestionTimerId !== null) {
      clearTimeout(this.nextQuestionTimerId);
      this.nextQuestionTimerId = null;
    }
  };

  OppositeGame.prototype.stopMotionTracking = function () {
    if (typeof this.motionStop === 'function') this.motionStop();
    this.motionStop = null;
    if (window.MotionSupport) window.MotionSupport.stop();
  };

  OppositeGame.prototype.getTotalQuestions = function () {
    if (this.questions && this.questions.length) return this.questions.length;
    if (this.playMode === 'level') return LEVEL_QUESTIONS;
    return this.playMode === 'practice' ? PRACTICE_QUESTIONS : QUESTIONS_PER_GAME;
  };

  OppositeGame.prototype.getLevelConfig = function (level) {
    return LEVEL_CONFIGS[Math.max(1, Math.min(3, Number(level) || 1)) - 1];
  };

  OppositeGame.prototype.getUnlockedLevel = function () {
    try {
      var stored = Number(localStorage.getItem(UNLOCKED_LEVEL_KEY));
      return Math.max(1, Math.min(3, stored || 1));
    } catch (_) {
      return 1;
    }
  };

  OppositeGame.prototype.unlockLevel = function (level) {
    var next = Math.max(this.getUnlockedLevel(), Math.min(3, level));
    try {
      localStorage.setItem(UNLOCKED_LEVEL_KEY, String(next));
    } catch (_) {
      // localStorage 不可用时，本局结果仍正常显示。
    }
    return next;
  };

  OppositeGame.prototype.buildShareText = function () {
    if (this.page === 'result') {
      if (this.playMode === 'level') {
        return '我在《反着来》第 ' + this.selectedLevel + ' 关拿到 ' +
          this.score + '/10，你敢挑战吗？';
      }
      if (this.gameMode === 'local_pk') {
        return '我们刚刚在《反着来》PK 了一局，你也来试试？';
      }
      if (this.playMode === 'practice') {
        return '我在《反着来》练习了一局，手差点背叛我。';
      }
    }
    return '我在《反着来》里被自己的手打败了，你敢试试吗？';
  };

  OppositeGame.prototype.showShareFallback = function (text) {
    var overlay = document.getElementById('shareFallback');
    var textarea = document.getElementById('shareFallbackText');
    if (!overlay || !textarea) return;
    textarea.value = text;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    textarea.focus();
    textarea.select();
  };

  OppositeGame.prototype.hideShareFallback = function () {
    var overlay = document.getElementById('shareFallback');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    this.canvas.focus();
  };

  OppositeGame.prototype.shareGame = async function () {
    var text = this.buildShareText();
    var shareData = {
      title: '反着来',
      text: text,
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        this.shareNotice = '分享面板已打开';
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text + '\n' + window.location.href);
        this.shareNotice = '挑战文案已复制';
        this.render();
        return;
      } catch (_) {
        // Continue to the manual copy fallback.
      }
    }

    this.showShareFallback(text + '\n' + window.location.href);
  };

  // ─── 排行榜存储 ───────────────────────────────────────

  var LEADERBOARD_KEY = 'opposite_leaderboard';
  var LEADERBOARD_MAX = 50;

  OppositeGame.prototype.saveToLeaderboard = function () {
    if (this.playMode !== 'challenge' && this.playMode !== 'level') return;
    try {
      var entry = {
        mode: this.gameMode,
        playMode: this.playMode,
        level: this.playMode === 'level' ? this.selectedLevel : null,
        totalQuestions: this.getTotalQuestions(),
        totalScore: this.getSafeTotalScore(),
        correctCount: this.getSafeNumber(this.score, 0),
        maxCombo: this.getSafeNumber(this.maxCombo, 0),
        fastestReaction: this.getSafeNumber(this.fastestReaction, null),
        title: this.resultTitle || this.getResultTitle(),
        date: new Date().toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        })
      };
      var list = this.loadLeaderboard();
      list.push(entry);
      list.sort(function (a, b) { return b.totalScore - a.totalScore; });
      if (list.length > LEADERBOARD_MAX) {
        list.length = LEADERBOARD_MAX;
      }
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list));
    } catch (_) {
      // localStorage 不可用时静默忽略
    }
  };

  OppositeGame.prototype.loadLeaderboard = function () {
    try {
      var raw = localStorage.getItem(LEADERBOARD_KEY);
      if (!raw) return [];
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      return list;
    } catch (_) {
      return [];
    }
  };

  OppositeGame.prototype.clearLeaderboard = function () {
    try {
      localStorage.removeItem(LEADERBOARD_KEY);
    } catch (_) {
      // 静默忽略
    }
  };

  /**
   * 重置游戏数据，返回首页时调用
   */
  OppositeGame.prototype.resetGameData = function () {
    this.clearScheduledTransitions();
    this.questions = [];
    this.currentIndex = 0;
    this.score = 0;
    this.totalScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.fastestReaction = Infinity;
    this.answers = [];
    this.question = null;
    this.questionStartTime = 0;
    this.timeLimit = DEFAULT_TIME_LIMIT;
    this.timerProgress = 1;
    this.questionAnswered = true;
    this.feedbackLines = [];
    this.feedbackEndTime = 0;
    this.lastRoundScore = 0;
    this.lastSpeedLabel = '';
    this.lastComboBonus = 0;
    this.levelResult = null;
    this.playerAResult = null;
    this.playerBResult = null;
    this.localPkResult = null;
    this.resultTitle = null;
    this.resultWeakness = null;
    this.resultRoast = null;
    this.screenFlashColor = '';
    this.screenFlashEndTime = 0;
    this.hiddenAt = 0;
    this.shareNotice = '';
    this.stopMotionTracking();
  };

  OppositeGame.prototype.goToPage = function (page) {
    var self = this;
    this.page = page;
    if (page !== 'playing') this.stopMotionTracking();
    this.buttons = [];
    this.render();

    // 如果进入游戏页，加载第一题
    if (page === 'playing') {
      if (this.startQuestionTimerId !== null) {
        clearTimeout(this.startQuestionTimerId);
      }
      this.startQuestionTimerId = setTimeout(function () {
        self.startQuestionTimerId = null;
        if (self.page === 'playing') {
          self.nextQuestion();
        }
      }, TRANSITION_DELAY);
    }
  };

  // ─── 游戏流程 ───────────────────────────────────────────

  OppositeGame.prototype.startGame = function () {
    this.clearScheduledTransitions();
    this.stopMotionTracking();

    // ═════════════════════════════════════
    // 音频解锁 + 播放开始音效（队友提供）
    // ═════════════════════════════════════
    if (typeof unlockAllAudio === 'function') {
      unlockAllAudio();
    }
    if (typeof playRandomFromPool === 'function' && typeof AudioManager !== 'undefined') {
      setTimeout(function () {
        playRandomFromPool(AudioManager.startPool);
      }, 100);
    }

    if (this.playMode === 'level') {
      var levelConfig = this.getLevelConfig(this.selectedLevel);
      this.questions = QuestionBank.getLevelQuestions(
        levelConfig.difficulty,
        LEVEL_QUESTIONS,
        levelConfig.timeLimit
      );
    } else {
      this.questions = QuestionBank.getQuestions({
        mode: this.playMode,
        count: this.playMode === 'practice' ? PRACTICE_QUESTIONS : QUESTIONS_PER_GAME
      });
    }
    this.currentIndex = 0;
    this.score = 0;
    this.totalScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.fastestReaction = Infinity;
    this.answers = [];
    this.question = null;
    this.questionStartTime = 0;
    this.timeLimit = DEFAULT_TIME_LIMIT;
    this.timerProgress = 1;
    this.questionAnswered = true;
    this.feedbackLines = [];
    this.feedbackEndTime = 0;
    this.lastRoundScore = 0;
    this.lastSpeedLabel = '';
    this.lastComboBonus = 0;
    this.levelResult = null;
    this.hiddenAt = document.hidden ? Date.now() : 0;
    this.shareNotice = '';
    this.goToPage('playing');
  };

  /**
   * 加载下一题
   */
  OppositeGame.prototype.nextQuestion = function () {
    this.nextQuestionTimerId = null;

    if (this.currentIndex >= this.questions.length) {
      this.endGame();
      return;
    }

    this.question = this.questions[this.currentIndex];
    this.timeLimit = this.question.time_limit_ms || DEFAULT_TIME_LIMIT;
    this.timerProgress = 1;
    this.questionStartTime = Date.now();
    if (document.hidden) {
      this.hiddenAt = this.questionStartTime;
    }
    this.questionAnswered = false;
    this.feedbackLines = [];
    this.currentIndex++;
    this.startMotionTracking();
    this.render();
  };

  OppositeGame.prototype.startMotionTracking = function () {
    this.stopMotionTracking();
    if (!this.question || this.question.type !== 'motion' || !window.MotionSupport) return;
    var self = this;
    this.motionStop = window.MotionSupport.start(function (action) {
      if (self.page === 'playing' && !self.questionAnswered) {
        self.judgeAnswer(action, self.getReactionTime());
      }
    });
  };

  OppositeGame.prototype.getReactionTime = function () {
    var reactionTime = Date.now() - this.questionStartTime;
    if (!isFinite(reactionTime) || reactionTime < 0 || this.questionStartTime <= 0) {
      return this.timeLimit || DEFAULT_TIME_LIMIT;
    }
    return reactionTime;
  };

  /**
   * 根据反应时间获取速度评级和奖励
   */
  OppositeGame.prototype.getSpeedBonus = function (reactionMs) {
    if (reactionMs <= 400) return { bonus: 80, label: 'PERFECT', color: '#FFD700' };
    if (reactionMs <= 650) return { bonus: 50, label: 'FAST',   color: COLOR_PRIMARY };
    if (reactionMs <= 900) return { bonus: 20, label: 'GOOD',   color: COLOR_INFO };
    return                        { bonus: 0,  label: 'OK',     color: COLOR_SECONDARY };
  };

  /**
   * 根据连击数获取奖励
   */
  OppositeGame.prototype.getComboBonus = function (combo) {
    if (combo >= 8) return 80;
    if (combo >= 5) return 40;
    if (combo >= 3) return 20;
    return 0;
  };

  /**
   * 判题
   */
  OppositeGame.prototype.judgeAnswer = function (playerAction, elapsedMs) {
    if (!this.question || this.questionAnswered) return;

    var reactionTime = typeof elapsedMs === 'number' && isFinite(elapsedMs) && elapsedMs >= 0
      ? elapsedMs
      : this.getReactionTime();
    if (reactionTime >= this.timeLimit && this.question.correct_action !== 'keep_still') {
      this.handleTimeout();
      return;
    }

    this.questionAnswered = true;
    this.stopMotionTracking();
    var correct = (playerAction === this.question.correct_action);
    var roundScore = 0;
    var speedLabel = '';
    var comboBonus = 0;

    if (correct) {
      // ── 答对：累积基础分、连击、统计 ──
      this.score++;
      this.combo++;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
      if (reactionTime < this.fastestReaction) {
        this.fastestReaction = reactionTime;
      }

      // 速度奖励
      var speed = this.getSpeedBonus(reactionTime);
      // 连击奖励
      comboBonus = this.getComboBonus(this.combo);
      // 本题得分
      roundScore = 100 + speed.bonus + comboBonus;
      speedLabel = speed.label;
      this.totalScore += roundScore;

      // 构建反馈行
      var lines = [
        { text: '+' + roundScore, color: COLOR_PRIMARY, size: 52 },
        { text: speed.label, color: speed.color, size: 30 }
      ];
      if (this.combo >= 3) {
        lines.push({ text: 'COMBO x' + this.combo, color: COLOR_WARNING, size: 22 });
      }
      this.showFeedback(lines);
      this.showScreenFlash('rgba(0,255,157,0.10)', 180);
      // ════ 音频：答对音效（队友提供）═══
      if (typeof playSound === 'function' && typeof AudioManager !== 'undefined') {
        playSound(AudioManager.gameplay.correct);
      }
    } else {
      // ── 答错：断连击 ──
      this.combo = 0;
      this.showFeedback([
        { text: 'MISS', color: COLOR_DANGER, size: 52 },
        { text: 'COMBO BREAK', color: COLOR_SECONDARY, size: 24 }
      ]);
      this.showScreenFlash('rgba(255,61,90,0.18)', 180);
      // ════ 音频：答错音效（队友提供）═══
      if (typeof playSound === 'function' && typeof AudioManager !== 'undefined') {
        playSound(AudioManager.gameplay.wrong);
      }
    }

    this.lastRoundScore = roundScore;
    this.lastSpeedLabel = speedLabel;
    this.lastComboBonus = comboBonus;

    // 记录答案
    this.answers.push({
      question_type: this.question.type,
      correct: correct,
      reaction_time_ms: reactionTime,
      round_score: roundScore,
      speed_label: speedLabel,
      combo_after: this.combo
    });

    // 延迟进入下一题
    var self = this;
    this.nextQuestionTimerId = setTimeout(function () {
      self.nextQuestionTimerId = null;
      if (self.page === 'playing' && self.questionAnswered) {
        self.nextQuestion();
      }
    }, FEEDBACK_DURATION);
  };

  /**
   * 超时处理（由渲染循环检测）
   */
  OppositeGame.prototype.handleTimeout = function () {
    if (this.questionAnswered) return;
    if (this.question &&
        (this.question.correct_action === 'keep_still' ||
         this.question.correct_action === 'wait')) {
      this.judgeAnswer(this.question.correct_action, Math.max(0, this.timeLimit - 1));
      return;
    }
    this.questionAnswered = true;
    this.stopMotionTracking();
    this.combo = 0;
    this.lastRoundScore = 0;
    this.lastSpeedLabel = 'TIME OUT';
    this.lastComboBonus = 0;
    this.showFeedback([
      { text: 'TIME OUT', color: COLOR_DANGER, size: 48 },
      { text: '反应慢了！', color: COLOR_SECONDARY, size: 22 }
    ]);
    this.showScreenFlash('rgba(255,61,90,0.18)', 180);
    // ════ 音频：超时答错音效 ════
    if (typeof playSound === 'function' && typeof AudioManager !== 'undefined') {
      playSound(AudioManager.gameplay.wrong);
    }

    this.answers.push({
      question_type: this.question.type,
      correct: false,
      reaction_time_ms: this.timeLimit,
      round_score: 0,
      speed_label: 'TIME OUT',
      combo_after: 0
    });

    var self = this;
    this.nextQuestionTimerId = setTimeout(function () {
      self.nextQuestionTimerId = null;
      if (self.page === 'playing' && self.questionAnswered) {
        self.nextQuestion();
      }
    }, FEEDBACK_DURATION);
  };

  /**
   * 保存当前玩家结算快照（local_pk 模式用）
   */
  OppositeGame.prototype.createPlayerResultSnapshot = function (playerLabel) {
    return {
      player: playerLabel,
      correctCount: this.getSafeNumber(this.score, 0),
      totalQuestions: this.getTotalQuestions(),
      totalScore: this.getSafeTotalScore(),
      maxCombo: this.getSafeNumber(this.maxCombo, 0),
      fastestReaction: this.getSafeNumber(this.fastestReaction, null),
      weakness: this.getWeakness(),
      title: this.getResultTitle()
    };
  };

  OppositeGame.prototype.getSafeNumber = function (value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  };

  OppositeGame.prototype.getSafeTotalScore = function () {
    var total = this.getSafeNumber(this.totalScore, null);
    if (total !== null && total >= 0) return total;
    return Math.max(0, this.getSafeNumber(this.score, 0)) * 100;
  };

  /**
   * 生成本地好友 PK 对比结果
   */
  OppositeGame.prototype.generateLocalPkResult = function () {
    var scoreA = this.playerAResult
      ? this.getSafeNumber(this.playerAResult.totalScore, 0)
      : 0;
    var scoreB = this.playerBResult
      ? this.getSafeNumber(this.playerBResult.totalScore, 0)
      : 0;
    var diff = scoreA - scoreB;
    var winner, resultLabel;
    if (diff > 0) {
      winner = 'A';
      resultLabel = '玩家 A 胜出';
    } else if (diff < 0) {
      winner = 'B';
      resultLabel = '玩家 B 胜出';
    } else {
      winner = 'draw';
      resultLabel = '平局';
    }
    return {
      scoreA: scoreA,
      scoreB: scoreB,
      diff: diff,
      winner: winner,
      resultLabel: resultLabel
    };
  };

  /**
   * 游戏结束
   */
  OppositeGame.prototype.endGame = function () {
    this.clearScheduledTransitions();
    this.stopMotionTracking();

    // 缓存结算数据（避免 render 循环中 Math.random() 导致频闪）
    this.resultTitle = this.getResultTitle();
    this.resultWeakness = this.getWeakness();
    this.resultRoast = this.getRoast();

    // ── 本地好友 PK 模式：A→过渡页，B→最终结算 ──
    if (this.gameMode === 'local_pk') {
      if (this.currentPlayer === 'A') {
        // 玩家 A 完成，保存结果并进入过渡页
        this.playerAResult = this.createPlayerResultSnapshot('A');
        this.currentPlayer = 'B';
        this.page = 'pk_transition';
        this.buttons = [];
        this.render();
        return;
      } else {
        // 玩家 B 完成，保存结果并生成最终对比
        this.playerBResult = this.createPlayerResultSnapshot('B');
        this.localPkResult = this.generateLocalPkResult();
        this.page = 'result';
        this.buttons = [];
        // ════ 音频：PK 最终结算音效 ════
        if (typeof playRandomFromPool === 'function' && typeof AudioManager !== 'undefined') {
          var pkWinner = this.localPkResult.winner;
          if (pkWinner === 'draw') {
            playRandomFromPool(AudioManager.successPool);
          } else {
            playRandomFromPool(AudioManager.successPool);
          }
        }
        this.render();
        return;
      }
    }

    if (this.playMode === 'level') {
      var passed = this.score >= LEVEL_PASS_COUNT;
      var beforeUnlock = this.getUnlockedLevel();
      var unlocked = beforeUnlock;
      if (passed && this.selectedLevel < 3) {
        unlocked = this.unlockLevel(this.selectedLevel + 1);
      }
      this.levelResult = {
        passed: passed,
        unlockedNext: passed && this.selectedLevel < 3 && unlocked > beforeUnlock,
        complete: passed && this.selectedLevel === 3
      };
    }

    this.saveToLeaderboard();

    // ════════════════════════════════════════
    // 音频：结算音效（队友提供）
    // ════════════════════════════════════════
    if (typeof playRandomFromPool === 'function' && typeof AudioManager !== 'undefined') {
      var isPassed = false;
      if (this.playMode === 'level') {
        isPassed = this.score >= LEVEL_PASS_COUNT;
      } else {
        isPassed = this.score >= Math.ceil(this.questions.length * 0.6);
      }
      if (isPassed) {
        playRandomFromPool(AudioManager.successPool);
      } else {
        playRandomFromPool(AudioManager.failPool);
      }
    }

    this.page = 'result';
    this.buttons = [];
    this.render();
  };

  // ─── 反馈文案 ───────────────────────────────────────────

  OppositeGame.prototype.showFeedback = function (lines) {
    this.feedbackLines = lines || [];
    this.feedbackEndTime = Date.now() + FEEDBACK_DURATION;
  };

  OppositeGame.prototype.showScreenFlash = function (color, duration) {
    this.screenFlashColor = color;
    this.screenFlashEndTime = Date.now() + duration;
  };

  OppositeGame.prototype.getSuccessText = function () {
    var texts = ['反骨成功！', '漂亮！', '手比脑快！', '完美反向！', '🦴 反骨！', '✓ 正确！'];
    return texts[Math.floor(Math.random() * texts.length)];
  };

  OppositeGame.prototype.getFailText = function () {
    var texts = ['手背叛了你', '想反了吗？', '本能赢了', '× 错了！', '大脑短路', '手太快了'];
    return texts[Math.floor(Math.random() * texts.length)];
  };

  // ─── 结果分析 ───────────────────────────────────────────

  OppositeGame.prototype.getResultTitle = function () {
    var rate = this.score / Math.max(1, this.getTotalQuestions());
    if (rate >= 0.9) return '反骨之王 👑';
    if (rate >= 0.8) return '反向高手';
    if (rate >= 0.7) return '反向达人';
    if (rate >= 0.6) return '渐入佳境';
    if (rate >= 0.5) return '反着来学徒';
    if (rate >= 0.3) return '方向感缺失';
    return '反向小白';
  };

  OppositeGame.prototype.getWeakness = function () {
    var typeMap = {
      direction: '方向题',
      color: '颜色题',
      action: '动作题',
      double_neg: '双重否定',
      combo: '组合题',
      color_stroop: '颜色干扰',
      visual_trap: '视觉陷阱',
      logic_reversal: '逻辑反转',
      chaos: '混沌题',
      motion: '体感题'
    };
    var wrongCount = {};
    var maxWrong = 0;
    var worstType = null;
    for (var i = 0; i < this.answers.length; i++) {
      var a = this.answers[i];
      if (!a.correct) {
        var t = a.question_type;
        wrongCount[t] = (wrongCount[t] || 0) + 1;
        if (wrongCount[t] > maxWrong) {
          maxWrong = wrongCount[t];
          worstType = t;
        }
      }
    }
    return worstType ? (typeMap[worstType] || worstType) : '无';
  };

  OppositeGame.prototype.getRoast = function () {
    var weakness = this.getWeakness();
    var rate = this.score / Math.max(1, this.getTotalQuestions());
    var roasts = {
      perfect: [
        '你天生反骨，大脑和手从来不对付！',
        '反向思维拉满，别人往东你偏往西！'
      ],
      good: [
        '你的手偶尔还是会背叛大脑，不过还好。',
        '继续练，总有一天你会完全不相信自己。'
      ],
      weak: [
        '你的' + weakness + '是短板，大脑还没学会欺骗手。',
        '被本能支配了吧？你需要更多的反骨训练。'
      ],
      bad: [
        '准备好被自己的手打败了吗？答案是：是的。',
        '你的大脑和手达成了某种危险的默契——都做错了。'
      ]
    };
    var pool;
    if (rate >= 0.9) pool = roasts.perfect;
    else if (rate >= 0.7) pool = roasts.good;
    else if (rate >= 0.5) pool = roasts.weak;
    else pool = roasts.bad;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // ─── 渲染循环 ───────────────────────────────────────────

  OppositeGame.prototype.startRenderLoop = function () {
    var self = this;
    function loop() {
      self.render();
      self.animFrameId = requestAnimationFrame(loop);
    }
    loop();
  };

  OppositeGame.prototype.render = function () {
    var ctx = this.ctx;
    if (!ctx) return;
    var sx = this.renderScaleX || this.scale;
    var sy = this.renderScaleY || this.scale;

    ctx.save();
    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    // 清屏
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    this.drawAmbientBackground(ctx);

    // 绘制当前页面
    switch (this.page) {
      case 'home':
        this.drawHomePage(ctx);
        break;
      case 'level_select':
        this.drawLevelSelectPage(ctx);
        break;
      case 'online_pk':
        this.drawOnlinePkPage(ctx);
        break;
      case 'tutorial':
        this.drawTutorialPage(ctx);
        break;
      case 'playing':
        this.drawGamePage(ctx);
        break;
      case 'result':
        this.drawResultPage(ctx);
        break;
      case 'pk_transition':
        this.drawPkTransitionPage(ctx);
        break;
      case 'leaderboard':
        this.drawLeaderboardPage(ctx);
        break;
    }

    if (this.screenFlashColor && Date.now() < this.screenFlashEndTime) {
      ctx.fillStyle = this.screenFlashColor;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    ctx.restore();
  };

  OppositeGame.prototype.drawAmbientBackground = function (ctx) {
    var glow = ctx.createRadialGradient(188, 190, 0, 188, 190, 360);
    glow.addColorStop(0, 'rgba(0,245,160,0.045)');
    glow.addColorStop(1, 'rgba(0,245,160,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CANVAS_W, 560);

    ctx.strokeStyle = 'rgba(255,255,255,0.014)';
    ctx.lineWidth = 1;
    for (var x = 0; x <= CANVAS_W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_H);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0,245,160,0.018)';
    for (var y = 0; y <= CANVAS_H; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(CANVAS_W, y + 0.5);
      ctx.stroke();
    }

    // 参考稿中的像素角标，让画面更像一块独立的游戏终端。
    ctx.fillStyle = 'rgba(0,245,160,0.7)';
    ctx.fillRect(18, 18, 5, 5);
    ctx.fillRect(25, 18, 3, 3);
    ctx.fillRect(18, 25, 3, 3);
    ctx.fillStyle = 'rgba(255,216,92,0.75)';
    ctx.fillRect(CANVAS_W - 23, CANVAS_H - 23, 5, 5);
    ctx.fillRect(CANVAS_W - 28, CANVAS_H - 20, 3, 3);
  };

  // ─── 绘制工具函数 ───────────────────────────────────────

  OppositeGame.prototype.roundRect = function (ctx, x, y, w, h, r) {
    // Canvas arcTo 不会替 CSS 自动约束超大圆角。半径超过短边一半时，
    // Safari/WebKit 会产生自交路径，表现为贯穿整页的巨大多边形。
    r = Math.max(0, Math.min(Number(r) || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };

  OppositeGame.prototype.wrapText = function (ctx, text, maxWidth, maxLines) {
    var chars = String(text || '').split('');
    var lines = [];
    var current = '';

    for (var i = 0; i < chars.length; i++) {
      var candidate = current + chars[i];
      if (current && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = chars[i];
        if (lines.length === maxLines - 1) {
          var remaining = current + chars.slice(i + 1).join('');
          var truncated = false;
          while (remaining && ctx.measureText(remaining + '…').width > maxWidth) {
            remaining = remaining.slice(0, -1);
            truncated = true;
          }
          lines.push(remaining + (truncated ? '…' : ''));
          return lines;
        }
      } else {
        current = candidate;
      }
    }

    if (current) lines.push(current);
    return lines;
  };

  OppositeGame.prototype.drawPanel = function (ctx, x, y, w, h, opts) {
    opts = opts || {};
    var border = opts.border || 'rgba(0,245,160,0.34)';
    var fill = opts.fill || 'rgba(12,18,16,0.92)';
    var radius = Math.max(0, typeof opts.radius === 'number' ? opts.radius : 2);

    ctx.save();
    ctx.fillStyle = opts.shadowColor || 'rgba(0,245,160,0.16)';
    this.roundRect(ctx, x + 6, y + 7, w, h, radius);
    ctx.fill();
    ctx.fillStyle = fill;
    this.roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = opts.lineWidth || 2;
    this.roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();

    if (opts.accent !== false) {
      ctx.fillStyle = opts.accentColor || COLOR_PRIMARY;
      ctx.fillRect(x - 3, y - 3, 10, 10);
      ctx.fillRect(x, y, 22, 3);
      ctx.fillRect(x, y, 3, 22);
      ctx.fillRect(x + w - 7, y + h - 7, 10, 10);
      ctx.fillRect(x + w - 22, y + h - 3, 22, 3);
      ctx.fillRect(x + w - 3, y + h - 22, 3, 22);
    }
    ctx.restore();
  };

  OppositeGame.prototype.drawMicroLabel = function (ctx, text, x, y, align, color) {
    ctx.fillStyle = color || COLOR_PRIMARY;
    ctx.font = 'bold 10px ' + FONT_MONO;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text || '').toUpperCase(), x, y);
  };

  OppositeGame.prototype.setFitFont = function (ctx, text, maxWidth, maxSize, minSize, weight, family) {
    var size = maxSize;
    var content = String(text || '');
    var fontWeight = weight || 'bold';
    var fontFamily = family || FONT_FAMILY;
    while (size > minSize) {
      ctx.font = fontWeight + ' ' + size + 'px ' + fontFamily;
      if (ctx.measureText(content).width <= maxWidth) break;
      size -= 1;
    }
    return size;
  };

  OppositeGame.prototype.getContrastText = function (color) {
    if (!color || color.charAt(0) !== '#' || color.length !== 7) return COLOR_WHITE;
    var red = parseInt(color.slice(1, 3), 16);
    var green = parseInt(color.slice(3, 5), 16);
    var blue = parseInt(color.slice(5, 7), 16);
    var luminance = (red * 299 + green * 587 + blue * 114) / 1000;
    return luminance > 170 ? '#101513' : COLOR_WHITE;
  };

  /**
   * 绘制按钮并注册命中区域
   */
  OppositeGame.prototype.drawBtn = function (ctx, x, y, w, h, text, btnId, action, opts) {
    opts = opts || {};
    var bgColor = opts.bg || COLOR_BTN_BG;
    var borderColor = opts.border || COLOR_PRIMARY;
    var textColor = opts.text || COLOR_PRIMARY;
    var fontSize = opts.fontSize || 20;
    var radius = Math.max(0, typeof opts.radius === 'number' ? opts.radius : BTN_RADIUS);

    ctx.save();
    if (opts.glow && opts.softGlow) {
      ctx.shadowColor = opts.glow;
      ctx.shadowBlur = opts.shadowBlur || 18;
    }

    if (opts.pixelShadow !== false) {
      ctx.fillStyle = opts.shadowColor || 'rgba(0,245,160,0.28)';
      this.roundRect(ctx, x + 6, y + 7, w, h, radius);
      ctx.fill();
    }

    // 背景
    ctx.fillStyle = bgColor;
    this.roundRect(ctx, x, y, w, h, radius);
    ctx.fill();

    // 边框
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = opts.lineWidth || 2;
    this.roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();
    ctx.restore();

    // 文字
    ctx.fillStyle = textColor;
    ctx.font = 'bold ' + fontSize + 'px ' + (opts.mono ? FONT_MONO : FONT_FAMILY);
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = 'middle';
    var textX = opts.align === 'left' ? x + (opts.paddingX || 20) : x + w / 2;
    ctx.fillText(text, textX, y + h / 2);
    if (opts.rightMark) {
      ctx.fillStyle = opts.markColor || textColor;
      ctx.font = 'bold ' + Math.max(12, fontSize - 1) + 'px ' + FONT_MONO;
      ctx.textAlign = 'right';
      ctx.fillText(opts.rightMark, x + w - (opts.paddingX || 20), y + h / 2);
    }

    if (opts.cornerBlocks !== false) {
      ctx.fillStyle = borderColor;
      ctx.fillRect(x - 3, y - 3, 9, 9);
      ctx.fillRect(x + w - 6, y + h - 6, 9, 9);
    }

    // 注册命中区域
    this.buttons.push({ x: x, y: y, w: w, h: h, id: btnId, action: action });
  };

  // ─── 首页渲染 ───────────────────────────────────────────

  OppositeGame.prototype.drawHomePage = function (ctx) {
    this.buttons = [];

    this.drawMicroLabel(ctx, 'OPPOSITE REACTION SYSTEM', CANVAS_W / 2, 54, 'center',
      'rgba(0,245,160,0.72)');
    ctx.save();
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.shadowColor = 'rgba(0,245,160,0.42)';
    ctx.shadowBlur = 22;
    ctx.font = '900 62px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('反着来', CANVAS_W / 2, 130);
    ctx.restore();

    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '15px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.fillText('看到什么，做相反的', CANVAS_W / 2, 184);
    this.drawMicroLabel(ctx, 'THINK OPPOSITE // REACT FAST', CANVAS_W / 2, 214,
      'center', 'rgba(255,255,255,0.34)');

    ctx.strokeStyle = 'rgba(0,245,160,0.22)';
    ctx.beginPath();
    ctx.moveTo(34, 242);
    ctx.lineTo(CANVAS_W - 34, 242);
    ctx.stroke();
    this.drawMicroLabel(ctx, 'SELECT MODE', 34, 264, 'left');

    var btnW = CANVAS_W - 68;
    var btnX = (CANVAS_W - btnW) / 2;
    var btnStartY = 282;

    this.drawBtn(ctx, btnX, btnStartY, btnW, 58,
      '单人闯关  /  SOLO', 'singleStart', 'singleStart', {
        bg: COLOR_PRIMARY,
        border: COLOR_PRIMARY,
        text: '#07110d',
        fontSize: 17,
        radius: BTN_RADIUS,
        shadowColor: 'rgba(0,245,160,0.32)',
        align: 'left',
        paddingX: 18,
        rightMark: '>>>'
      });

    this.drawBtn(ctx, btnX, btnStartY + 72, btnW, 54,
      '在线 PK  /  ONLINE', 'onlinePkStart', 'onlinePkStart', {
        bg: 'rgba(14,22,20,0.96)',
        border: COLOR_INFO,
        text: COLOR_INFO,
        fontSize: 15,
        radius: BTN_RADIUS,
        shadowColor: 'rgba(88,166,255,0.22)',
        align: 'left',
        paddingX: 18,
        rightMark: '>>>'
      });

    var splitGap = 12;
    var splitW = (btnW - splitGap) / 2;
    var splitY = btnStartY + 140;
    this.drawBtn(ctx, btnX, splitY, splitW, 52,
      '本地好友 PK', 'localPkStart', 'localPkStart', {
        bg: 'rgba(14,22,20,0.96)',
        border: COLOR_WARNING,
        text: COLOR_WARNING,
        fontSize: 13,
        radius: BTN_RADIUS,
        shadowColor: 'rgba(255,216,92,0.22)',
        align: 'left',
        paddingX: 14,
        rightMark: '>>'
      });

    this.drawBtn(ctx, btnX + splitW + splitGap, splitY, splitW, 52,
      '练习模式', 'practiceStart', 'practiceStart', {
        bg: 'rgba(14,22,20,0.96)',
        border: 'rgba(0,245,160,0.34)',
        text: COLOR_PRIMARY,
        fontSize: 13,
        radius: BTN_RADIUS,
        shadowColor: 'rgba(0,245,160,0.12)',
        align: 'left',
        paddingX: 14,
        rightMark: '>>'
      });

    var utilityY = splitY + 68;
    this.drawBtn(ctx, btnX, utilityY, splitW, 46,
      '排行榜', 'leaderboardBtn', 'leaderboardBtn', {
        bg: 'rgba(14,22,20,0.92)',
        border: 'rgba(0,245,160,0.26)',
        text: 'rgba(0,245,160,0.72)',
        fontSize: 13,
        radius: BTN_RADIUS,
        shadowColor: 'rgba(0,245,160,0.10)'
      });
    this.drawBtn(ctx, btnX + splitW + splitGap, utilityY, splitW, 44,
      '分享挑战', 'shareHome', 'shareHome', {
        bg: 'rgba(14,22,20,0.92)',
        border: 'rgba(255,255,255,0.20)',
        text: COLOR_SECONDARY,
        fontSize: 13,
        radius: BTN_RADIUS,
        shadowColor: 'rgba(255,255,255,0.08)'
      });

    var notice = this.homeNotice || this.shareNotice;
    if (notice) {
      ctx.fillStyle = COLOR_WARNING;
      ctx.font = '12px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      ctx.fillText(notice, CANVAS_W / 2, utilityY + 76);
    }
    this.drawMicroLabel(ctx, 'ENTER / SPACE : LEVEL SELECT', CANVAS_W / 2, 704,
      'center', 'rgba(255,255,255,0.28)');
  };

  OppositeGame.prototype.drawLevelSelectPage = function (ctx) {
    this.buttons = [];
    var unlocked = this.getUnlockedLevel();

    this.drawMicroLabel(ctx, 'SINGLE PLAYER', 28, 48, 'left');
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.font = 'bold 34px ' + FONT_FAMILY;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('选择关卡', 28, 84);
    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '13px ' + FONT_FAMILY;
    ctx.fillText('每关 10 题，答对 6 题即可解锁下一关', 28, 116);

    for (var i = 0; i < LEVEL_CONFIGS.length; i++) {
      var config = LEVEL_CONFIGS[i];
      var locked = config.level > unlocked;
      var y = 150 + i * 158;
      var border = locked ? 'rgba(255,255,255,0.12)' :
        config.level === 1 ? 'rgba(0,245,160,0.52)' :
        config.level === 2 ? 'rgba(88,166,255,0.48)' : 'rgba(255,216,92,0.48)';
      this.drawPanel(ctx, 28, y, CANVAS_W - 56, 132, {
        border: border,
        fill: locked ? 'rgba(12,15,14,0.78)' : 'rgba(11,17,15,0.96)',
        accent: !locked,
        accentColor: config.level === 3 ? COLOR_WARNING :
          config.level === 2 ? COLOR_INFO : COLOR_PRIMARY
      });
      this.drawMicroLabel(ctx, 'LEVEL 0' + config.level, 46, y + 24, 'left',
        locked ? COLOR_DISABLED : COLOR_PRIMARY);
      ctx.fillStyle = locked ? COLOR_DISABLED : COLOR_WHITE;
      ctx.font = 'bold 22px ' + FONT_FAMILY;
      ctx.textAlign = 'left';
      ctx.fillText(config.title, 46, y + 57);
      ctx.font = '12px ' + FONT_FAMILY;
      ctx.fillStyle = locked ? 'rgba(255,255,255,0.28)' : COLOR_SECONDARY;
      ctx.fillText(config.label + '  ·  10 题  ·  ' + config.timeLimit + 'ms', 46, y + 88);
      ctx.fillStyle = locked ? COLOR_DISABLED : COLOR_PRIMARY;
      ctx.font = 'bold 12px ' + FONT_FAMILY;
      ctx.textAlign = 'right';
      ctx.fillText(locked ? 'LOCKED  需上一关 60%' : '已解锁  →',
        CANVAS_W - 46, y + 108);
      this.buttons.push({
        x: 28, y: y, w: CANVAS_W - 56, h: 132,
        id: 'level_' + config.level, action: 'level_' + config.level
      });
    }

    if (this.homeNotice) {
      ctx.fillStyle = COLOR_WARNING;
      ctx.font = '12px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      ctx.fillText(this.homeNotice, CANVAS_W / 2, 648);
    }
    this.drawBtn(ctx, 28, 690, CANVAS_W - 56, 52,
      '返回首页  /  BACK', 'levelBack', 'levelBack', {
        bg: 'rgba(14,22,20,0.94)',
        border: 'rgba(255,255,255,0.22)',
        text: COLOR_SECONDARY,
        fontSize: 14,
        radius: BTN_RADIUS
      });
  };

  OppositeGame.prototype.drawOnlinePkPage = function (ctx) {
    this.buttons = [];

    switch (this.onlinePkState) {
      case 'queuing':
        this.drawOnlinePkQueuing(ctx);
        break;
      case 'matched':
        this.drawOnlinePkMatched(ctx);
        break;
      case 'playing':
        this.drawOnlinePkPlaying(ctx);
        break;
      case 'result':
        this.drawOnlinePkResult(ctx);
        break;
      default:
        this.drawOnlinePkIdle(ctx);
        break;
    }
  };

  // ── idle：等待用户点击匹配 ──
  OppositeGame.prototype.drawOnlinePkIdle = function (ctx) {
    this.drawMicroLabel(ctx, 'ONLINE MATCH', CANVAS_W / 2, 72, 'center', COLOR_INFO);
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = 'bold 38px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('在线 PK', CANVAS_W / 2, 122);

    // 说明面板
    this.drawPanel(ctx, 34, 170, CANVAS_W - 68, 160, {
      border: 'rgba(88,166,255,0.42)',
      fill: 'rgba(10,16,20,0.94)',
      accentColor: COLOR_INFO
    });
    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '14px ' + FONT_FAMILY;
    ctx.textAlign = 'left';
    var descLines = this.wrapText(ctx,
      '系统将自动为你匹配对手，双方完成 20 道题目，正确率高者获胜。每题限时 8 秒，拼反应、拼速度、拼反骨！',
      CANVAS_W - 104, 5);
    for (var i = 0; i < descLines.length; i++) {
      ctx.fillText(descLines[i], 52, 204 + i * 28);
    }

    // 匹配按钮
    this.drawBtn(ctx, 34, 380, CANVAS_W - 68, 58,
      '开始匹配  /  MATCH', 'startMatch', 'startMatch', {
        bg: COLOR_INFO, border: COLOR_INFO, text: '#081018',
        fontSize: 16, radius: BTN_RADIUS, glow: 'rgba(88,166,255,0.28)'
      });

    if (this.homeNotice) {
      ctx.fillStyle = COLOR_WARNING;
      ctx.font = '13px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      ctx.fillText(this.homeNotice, CANVAS_W / 2, 480);
    }

    this.drawBtn(ctx, 34, 650, CANVAS_W - 68, 52,
      '返回首页  /  BACK', 'onlineBack', 'onlineBack', {
        bg: 'rgba(14,22,20,0.94)',
        border: 'rgba(255,255,255,0.22)',
        text: COLOR_SECONDARY,
        fontSize: 14, radius: BTN_RADIUS
      });
  };

  // ── queuing：匹配中 ──
  OppositeGame.prototype.drawOnlinePkQueuing = function (ctx) {
    this.drawMicroLabel(ctx, 'MATCHMAKING', CANVAS_W / 2, 100, 'center', COLOR_INFO);
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = 'bold 32px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.fillText('寻找对手中...', CANVAS_W / 2, 154);

    // 动画圆点
    var t = Date.now() / 300;
    for (var i = 0; i < 3; i++) {
      var alpha = 0.3 + 0.5 * Math.abs(Math.sin(t + i * 2));
      ctx.fillStyle = 'rgba(88,166,255,' + alpha.toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(CANVAS_W / 2 - 32 + i * 32, 210, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawPanel(ctx, 54, 260, CANVAS_W - 108, 100, {
      border: 'rgba(88,166,255,0.30)',
      fill: 'rgba(10,16,20,0.90)',
      accent: false
    });
    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '13px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.onlineQueuePos > 0) {
      ctx.fillText('队列位置：第 ' + this.onlineQueuePos + ' 位', CANVAS_W / 2, 300);
    } else {
      ctx.fillText('正在等待其他玩家加入...', CANVAS_W / 2, 300);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.font = '11px ' + FONT_FAMILY;
    ctx.fillText('请保持页面打开', CANVAS_W / 2, 326);

    this.drawBtn(ctx, 34, 430, CANVAS_W - 68, 52,
      '取消匹配  /  CANCEL', 'cancelMatch', 'cancelMatch', {
        bg: 'rgba(255,61,90,0.12)',
        border: 'rgba(255,61,90,0.40)',
        text: COLOR_DANGER,
        fontSize: 14, radius: BTN_RADIUS
      });
  };

  // ── matched：匹配成功，等待开始 ──
  OppositeGame.prototype.drawOnlinePkMatched = function (ctx) {
    this.drawMicroLabel(ctx, 'MATCH FOUND', CANVAS_W / 2, 80, 'center', COLOR_PRIMARY);
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = 'bold 36px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('匹配成功！', CANVAS_W / 2, 128);

    this.drawPanel(ctx, 50, 180, CANVAS_W - 100, 160, {
      border: 'rgba(0,245,160,0.48)',
      fill: 'rgba(11,17,15,0.95)'
    });
    this.drawMicroLabel(ctx, 'OPPONENT', CANVAS_W / 2, 214, 'center',
      'rgba(0,245,160,0.58)');
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.font = 'bold 28px ' + FONT_FAMILY;
    ctx.fillText(this.opponentName || '对手', CANVAS_W / 2, 266);
    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '14px ' + FONT_FAMILY;
    ctx.fillText('即将开始...', CANVAS_W / 2, 306);

    // 倒计时动画
    var elapsed = Date.now() - (this._matchFoundTime || Date.now());
    var countdown = Math.max(0, Math.ceil(2 - elapsed / 1000));
    if (countdown > 0) {
      ctx.fillStyle = COLOR_WARNING;
      ctx.font = 'bold 22px ' + FONT_MONO;
      ctx.fillText(countdown + ' 秒后开始', CANVAS_W / 2, 400);
    }

    this.drawBtn(ctx, 34, 520, CANVAS_W - 68, 48,
      '返回首页  /  BACK', 'onlineBack', 'onlineBack', {
        bg: 'rgba(14,22,20,0.94)',
        border: 'rgba(255,255,255,0.18)',
        text: COLOR_SECONDARY,
        fontSize: 13, radius: BTN_RADIUS
      });
  };

  // ── playing：在线对战进行中 ──
  OppositeGame.prototype.drawOnlinePkPlaying = function (ctx) {
    this.buttons = [];
    var q = this.question;
    var self = this;

    // ── 双人对战顶栏 ──
    this.drawMicroLabel(ctx, 'ROUND ' + this.onlineRound + ' / ' + this.onlineTotalRounds,
      22, 28, 'left', COLOR_PRIMARY);
    this.drawMicroLabel(ctx, 'VS ' + (this.opponentName || '对手'),
      CANVAS_W / 2, 28, 'center', COLOR_INFO);
    this.drawMicroLabel(ctx, 'SCORE ' + this.onlineScores.me,
      CANVAS_W - 22, 28, 'right', COLOR_WARNING);

    // 双方分数
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.font = 'bold 13px ' + FONT_MONO;
    ctx.textAlign = 'left';
    ctx.fillText('我: ' + this.onlineScores.me + ' 分', 22, 50);
    ctx.textAlign = 'right';
    ctx.fillText((this.opponentName || '对手') + ': ' + (this.opponentScore || 0) + ' 分',
      CANVAS_W - 22, 50);

    // 分隔线
    ctx.strokeStyle = 'rgba(0,245,160,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(22, 68);
    ctx.lineTo(CANVAS_W - 22, 68);
    ctx.stroke();

    // 题目状态
    if (!q) {
      ctx.fillStyle = COLOR_SECONDARY;
      ctx.font = 'bold 18px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      ctx.fillText('等待题目中...', CANVAS_W / 2, 300);
      return;
    }

    // 连击提示
    if (this.combo >= 3) {
      ctx.fillStyle = COLOR_WARNING;
      ctx.font = 'bold 13px ' + FONT_MONO;
      ctx.textAlign = 'center';
      ctx.fillText('✦ COMBO x' + this.combo + ' ✦', CANVAS_W / 2, 96);
    } else {
      this.drawMicroLabel(ctx, 'DO THE OPPOSITE', CANVAS_W / 2, 96, 'center',
        'rgba(255,255,255,0.34)');
    }

    // 题目卡
    this.drawPanel(ctx, 34, 124, CANVAS_W - 68, 130, {
      border: 'rgba(0,245,160,0.56)',
      fill: 'rgba(11,15,14,0.96)',
      lineWidth: 1.5
    });
    this.drawMicroLabel(ctx, 'INSTRUCTION', 50, 144, 'left',
      'rgba(0,245,160,0.62)');
    ctx.fillStyle = q.prompt_color || COLOR_WHITE;
    var promptLines = this.wrapText(ctx, q.instruction_text, CANVAS_W - 112, 2);
    var promptSize = promptLines.length > 1 ? 28 :
      this.setFitFont(ctx, q.instruction_text, CANVAS_W - 112, 39, 25, 'bold', FONT_FAMILY);
    ctx.font = 'bold ' + promptSize + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var promptStartY = promptLines.length > 1 ? 178 : 190;
    for (var pi = 0; pi < promptLines.length; pi++) {
      ctx.fillText(promptLines[pi], CANVAS_W / 2, promptStartY + pi * 34);
    }
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.font = '12px ' + FONT_FAMILY;
    ctx.fillText('执行相反动作', CANVAS_W / 2, 228);

    // 操作区：方向题=滑动区，其他=按钮
    if (q.type === 'direction' && !(q.options && q.options.length)) {
      var areaY = 390;
      this.drawPanel(ctx, 34, areaY, CANVAS_W - 68, 176, {
        border: 'rgba(255,255,255,0.16)',
        fill: 'rgba(11,15,14,0.76)',
        accent: false
      });
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.font = '38px ' + FONT_MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('‹', 82, areaY + 76);
      ctx.fillText('›', CANVAS_W - 82, areaY + 76);
      ctx.fillText('⌃', CANVAS_W / 2, areaY + 38);
      ctx.fillText('⌄', CANVAS_W / 2, areaY + 124);
      ctx.fillStyle = COLOR_WHITE;
      ctx.font = 'bold 15px ' + FONT_FAMILY;
      ctx.fillText('四向滑动', CANVAS_W / 2, areaY + 78);
      this.drawMicroLabel(ctx, 'SWIPE TO ANSWER', CANVAS_W / 2, areaY + 110,
        'center', 'rgba(0,245,160,0.56)');
    } else {
      var options = q.options || [];
      if (options.length === 2) {
        var bW = 136, bH = 68, gap = 16;
        var totalW = bW * 2 + gap;
        var startX = (CANVAS_W - totalW) / 2;
        this.drawPanel(ctx, 34, 390, CANVAS_W - 68, 176, {
          border: 'rgba(255,255,255,0.14)',
          fill: 'rgba(11,15,14,0.76)', accent: false
        });
        for (var j = 0; j < options.length; j++) {
          var o = options[j];
          var c = o.color || (j === 0 ? '#FF4444' : '#4488FF');
          this.drawBtn(ctx, startX + j * (bW + gap), 438, bW, bH,
            o.label, 'btn_' + j, j, {
              bg: c, border: c, text: this.getContrastText(c),
              fontSize: 20, radius: BTN_RADIUS,
              shadowColor: j === 0 ? 'rgba(255,61,90,0.25)' : 'rgba(88,166,255,0.25)'
            });
        }
      }
    }

    // 反馈
    if (this.feedbackLines && this.feedbackLines.length > 0 && Date.now() < this.feedbackEndTime) {
      var fy = 322;
      for (var k = 0; k < this.feedbackLines.length; k++) {
        var line = this.feedbackLines[k];
        ctx.fillStyle = line.color;
        ctx.font = 'bold ' + (line.size || 36) + 'px ' + FONT_MONO;
        ctx.textAlign = 'center';
        ctx.fillText(line.text, CANVAS_W / 2, fy + k * 34);
      }
    }

    // 倒计时条
    var barW = CANVAS_W - 68;
    var barH = 6;
    var barX = 34;
    var barY = CANVAS_H - 70;
    var progress = this.timerProgress;
    this.drawMicroLabel(ctx, 'TIME', barX, barY - 13, 'left',
      'rgba(255,255,255,0.40)');
    this.drawMicroLabel(ctx, Math.round(progress * 100) + '%',
      barX + barW, barY - 13, 'right',
      progress > 0.3 ? COLOR_PRIMARY : COLOR_DANGER);
    ctx.fillStyle = COLOR_TIMER_BG;
    this.roundRect(ctx, barX, barY, barW, barH, 0);
    ctx.fill();
    if (progress > 0) {
      var fillColor = progress > 0.3 ? COLOR_PRIMARY :
                      progress > 0.15 ? COLOR_WARNING : COLOR_DANGER;
      ctx.fillStyle = fillColor;
      ctx.fillRect(barX, barY, barW * progress, barH);
    }

    // 更新倒计时
    if (!this.questionAnswered && this.onlineQuestionStartMs > 0) {
      var elapsed = Date.now() - this.onlineQuestionStartMs;
      this.timerProgress = Math.max(0, 1 - elapsed / this.onlineTimeLimit);
      if (this.timerProgress <= 0) {
        this.handleOnlineTimeout();
      }
    }
  };

  // ── result：在线对战结果 ──
  OppositeGame.prototype.drawOnlinePkResult = function (ctx) {
    this.buttons = [];
    var res = this.onlineResult || {};

    this.drawMicroLabel(ctx, 'MATCH RESULT', CANVAS_W / 2, 60, 'center', COLOR_INFO);
    var winColor = res.winner === 'draw' ? COLOR_WARNING :
                   res.winner === 'me' ? COLOR_PRIMARY : COLOR_DANGER;
    var winText = res.winner === 'draw' ? '平局！' :
                  res.winner === 'me' ? '你赢了！' : '你输了...';
    ctx.fillStyle = winColor;
    ctx.font = 'bold 36px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(winText, CANVAS_W / 2, 110);

    // 分数对比
    this.drawPanel(ctx, 34, 150, CANVAS_W - 68, 160, {
      border: 'rgba(0,245,160,0.36)',
      fill: 'rgba(11,15,14,0.95)'
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(CANVAS_W / 2, 168);
    ctx.lineTo(CANVAS_W / 2, 292);
    ctx.stroke();

    this.drawMicroLabel(ctx, '我', 100, 180, 'center', COLOR_PRIMARY);
    this.drawMicroLabel(ctx, this.opponentName || '对手',
      CANVAS_W - 100, 180, 'center', COLOR_DANGER);

    ctx.fillStyle = COLOR_WHITE;
    ctx.font = 'bold 44px ' + FONT_MONO;
    ctx.textAlign = 'center';
    ctx.fillText(String(this.onlineScores.me || 0), 100, 230);
    ctx.fillText(String(this.opponentScore || 0), CANVAS_W - 100, 230);

    var diff = (this.onlineScores.me || 0) - (this.opponentScore || 0);
    var diffStr = diff > 0 ? '+' + diff : String(diff);
    var diffColor = diff > 0 ? COLOR_PRIMARY : diff < 0 ? COLOR_DANGER : COLOR_SECONDARY;
    this.drawMicroLabel(ctx, '分差 ' + diffStr, CANVAS_W / 2, 280, 'center', diffColor);

    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '14px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.fillText('完成 ' + this.onlineRound + ' 题', CANVAS_W / 2, 340);

    this.drawBtn(ctx, 34, 430, CANVAS_W - 68, 56,
      '再来一局  /  REMATCH', 'pkRematch', 'pkRematch', {
        bg: COLOR_PRIMARY, border: COLOR_PRIMARY, text: '#07110d',
        fontSize: 15, radius: BTN_RADIUS, glow: 'rgba(0,245,160,0.26)'
      });
    this.drawBtn(ctx, 34, 502, CANVAS_W - 68, 48,
      '返回首页  /  HOME', 'onlineBack', 'onlineBack', {
        bg: 'rgba(14,22,20,0.94)',
        border: 'rgba(255,255,255,0.22)',
        text: COLOR_SECONDARY,
        fontSize: 13, radius: BTN_RADIUS
      });
  };

  // ─── 教学页渲染 ─────────────────────────────────────────

  OppositeGame.prototype.drawTutorialPage = function (ctx) {
    this.buttons = [];

    var isPractice = this.playMode === 'practice';
    var levelConfig = this.playMode === 'level' ? this.getLevelConfig(this.selectedLevel) : null;
    this.drawMicroLabel(ctx, levelConfig ? 'LEVEL 0' + levelConfig.level : 'MISSION TRAINING',
      28, 60, 'left');
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.font = 'bold 29px ' + FONT_MONO;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(levelConfig ? levelConfig.title : isPractice ? '轻松练习' : '训练说明', 28, 96);
    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '13px ' + FONT_FAMILY;
    ctx.fillText(levelConfig
      ? levelConfig.label + ' · 10 题 · 每题 ' + levelConfig.timeLimit + 'ms · 6 题过关'
      : isPractice ? '8 道简单题，时间更宽松' : '读取指令，然后执行相反动作', 28, 126);

    var examples = [
      { from: '向左滑', to: '向右滑', index: 'RULE 01' },
      { from: '点红色', to: '点蓝色', index: 'RULE 02' },
      { from: '别点',   to: '点一下', index: 'RULE 03' }
    ];

    var startY = 164;

    for (var i = 0; i < examples.length; i++) {
      var ex = examples[i];
      var y = startY + i * 104;

      this.drawPanel(ctx, 28, y, CANVAS_W - 56, 82, {
        border: 'rgba(0,245,160,0.30)'
      });
      this.drawMicroLabel(ctx, ex.index, 44, y + 18, 'left',
        'rgba(0,245,160,0.58)');
      ctx.fillStyle = COLOR_WHITE;
      ctx.font = 'bold 18px ' + FONT_FAMILY;
      ctx.textAlign = 'left';
      ctx.fillText(ex.from, 44, y + 48);
      ctx.fillStyle = COLOR_PRIMARY;
      ctx.font = 'bold 15px ' + FONT_FAMILY;
      ctx.textAlign = 'right';
      ctx.fillText('→  ' + ex.to, CANVAS_W - 44, y + 48);
    }

    this.drawMicroLabel(ctx, 'TIP // DON’T TRUST FIRST INSTINCT', 28, 512,
      'left', 'rgba(255,216,92,0.72)');
    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '13px ' + FONT_FAMILY;
    ctx.fillText('反应要快，但别相信第一直觉。', 28, 540);

    var btnW = CANVAS_W - 56, btnH = 54;
    this.drawBtn(ctx, 28, 668, btnW, btnH,
      isPractice ? '开始练习  /  PRACTICE' :
        levelConfig ? '开始第 ' + levelConfig.level + ' 关  /  BEGIN' : '开始任务  /  BEGIN',
      'tutorialStart', 'tutorialStart', {
        bg: COLOR_PRIMARY,
        border: COLOR_PRIMARY,
        text: '#07110d',
        fontSize: 15,
        radius: BTN_RADIUS,
        glow: 'rgba(0,245,160,0.24)'
      });
  };

  // ─── 游戏页渲染 ─────────────────────────────────────────

  OppositeGame.prototype.drawGamePage = function (ctx) {
    this.buttons = [];

    var q = this.question;
    if (!q) return;

    // ── 顶栏 ──
    this.drawTopBar(ctx);

    // ── 顶栏分隔线 ──
    ctx.strokeStyle = 'rgba(0,245,160,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(22, 64);
    ctx.lineTo(CANVAS_W - 22, 64);
    ctx.stroke();

    // ── 连击提示（参考稿的黄色中央状态） ──
    if (this.combo >= 3) {
      ctx.fillStyle = COLOR_WARNING;
      ctx.font = 'bold 14px ' + FONT_MONO;
      ctx.textAlign = 'center';
      ctx.fillText('✦  COMBO  x' + this.combo + '  ✦', CANVAS_W / 2, 96);
    } else {
      this.drawMicroLabel(ctx, 'DO THE OPPOSITE', CANVAS_W / 2, 96, 'center',
        'rgba(255,255,255,0.34)');
    }

    // ── 题目卡 ──
    this.drawPanel(ctx, 34, 124, CANVAS_W - 68, 130, {
      border: 'rgba(0,245,160,0.56)',
      fill: 'rgba(11,15,14,0.96)',
      lineWidth: 1.5
    });
    this.drawMicroLabel(ctx, 'INSTRUCTION', 50, 144, 'left',
      'rgba(0,245,160,0.62)');
    ctx.fillStyle = q.prompt_color || COLOR_WHITE;
    ctx.font = 'bold 32px ' + FONT_FAMILY;
    var promptLines = this.wrapText(ctx, q.instruction_text, CANVAS_W - 112, 2);
    var promptSize = promptLines.length > 1 ? 28 :
      this.setFitFont(ctx, q.instruction_text, CANVAS_W - 112, 39, 25, 'bold', FONT_FAMILY);
    ctx.font = 'bold ' + promptSize + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var promptStartY = promptLines.length > 1 ? 178 : 190;
    for (var promptIndex = 0; promptIndex < promptLines.length; promptIndex++) {
      ctx.fillText(promptLines[promptIndex], CANVAS_W / 2, promptStartY + promptIndex * 34);
    }
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.font = '12px ' + FONT_FAMILY;
    ctx.fillText('执行相反动作', CANVAS_W / 2, 228);

    // ── 操作区域 ──
    if (q.type === 'motion') {
      this.drawMotionArea(ctx, q);
    } else if (q.type === 'direction' && !(q.options && q.options.length)) {
      this.drawSwipeArea(ctx);
    } else {
      this.drawActionButtons(ctx, q);
    }

    // ── 反馈（位于题目与操作区之间，不遮挡按钮） ──
    if (this.feedbackLines && this.feedbackLines.length > 0 && Date.now() < this.feedbackEndTime) {
      var lineCount = this.feedbackLines.length;
      var startY = lineCount > 2 ? 302 : 318;
      for (var i = 0; i < lineCount; i++) {
        var line = this.feedbackLines[i];
        ctx.fillStyle = line.color;
        var feedbackSize = Math.min(line.size || 40, i === 0 ? 42 : 22);
        ctx.font = 'bold ' + feedbackSize + 'px ' + FONT_MONO;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(line.text, CANVAS_W / 2, startY + i * 34);
      }
    }

    // ── 倒计时条 ──
    this.drawTimerBar(ctx);

    // ── 更新倒计时（仅在未回答时） ──
    if (!this.questionAnswered && this.questionStartTime > 0) {
      var elapsed = Date.now() - this.questionStartTime;
      this.timerProgress = Math.max(0, 1 - elapsed / this.timeLimit);
      if (this.timerProgress <= 0) {
        this.handleTimeout();
      }
    }
  };

  /**
   * 绘制顶栏：题号 / 总分 / 连击
   */
  OppositeGame.prototype.drawTopBar = function (ctx) {
    ctx.textBaseline = 'middle';

    this.drawMicroLabel(ctx, 'MISSION ' + ('0' + this.currentIndex).slice(-2),
      22, 28, 'left', COLOR_PRIMARY);
    this.drawMicroLabel(ctx, this.gameMode === 'local_pk'
      ? 'PLAYER ' + this.currentPlayer
      : this.playMode === 'practice' ? 'PRACTICE'
      : this.playMode === 'level' ? 'LEVEL 0' + this.selectedLevel
      : this.gameMode.toUpperCase(), CANVAS_W / 2, 28, 'center',
      'rgba(255,255,255,0.58)');
    this.drawMicroLabel(ctx, 'SCORE ' + this.getSafeTotalScore(),
      CANVAS_W - 22, 28, 'right', COLOR_WARNING);

    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '10px ' + FONT_MONO;
    ctx.textAlign = 'left';
    ctx.fillText(this.currentIndex + ' / ' + this.getTotalQuestions(), 22, 48);
    ctx.textAlign = 'right';
    ctx.fillText('COMBO ' + this.combo, CANVAS_W - 22, 48);
  };

  /**
   * 绘制滑动操作区（direction 题型）
   */
  OppositeGame.prototype.drawSwipeArea = function (ctx) {
    var areaY = 390;
    var areaH = 176;

    this.drawPanel(ctx, 34, areaY, CANVAS_W - 68, areaH, {
      border: 'rgba(255,255,255,0.16)',
      fill: 'rgba(11,15,14,0.76)',
      accent: false
    });
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.font = '38px ' + FONT_MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('‹', 82, areaY + 76);
    ctx.fillText('›', CANVAS_W - 82, areaY + 76);
    ctx.fillText('⌃', CANVAS_W / 2, areaY + 38);
    ctx.fillText('⌄', CANVAS_W / 2, areaY + 124);

    ctx.fillStyle = COLOR_WHITE;
    ctx.font = 'bold 15px ' + FONT_FAMILY;
    ctx.fillText('四向滑动', CANVAS_W / 2, areaY + 78);
    this.drawMicroLabel(ctx, 'SWIPE TO ANSWER', CANVAS_W / 2, areaY + 110,
      'center', 'rgba(0,245,160,0.56)');
  };

  OppositeGame.prototype.drawMotionArea = function (ctx) {
    var areaY = 390;
    var areaH = 176;
    this.drawPanel(ctx, 34, areaY, CANVAS_W - 68, areaH, {
      border: 'rgba(255,216,92,0.34)',
      fill: 'rgba(14,18,14,0.82)',
      accentColor: COLOR_WARNING
    });
    ctx.fillStyle = COLOR_WARNING;
    ctx.font = 'bold 30px ' + FONT_MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MOTION', CANVAS_W / 2, areaY + 56);
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = 'bold 16px ' + FONT_FAMILY;
    ctx.fillText('移动设备完成相反动作', CANVAS_W / 2, areaY + 98);
    this.drawMicroLabel(ctx, 'EXPERIMENTAL · HOLD DEVICE SAFELY',
      CANVAS_W / 2, areaY + 132, 'center', 'rgba(255,216,92,0.62)');
  };

  /**
   * 绘制按钮（color / action / double_neg / combo 题型）
   */
  OppositeGame.prototype.drawActionButtons = function (ctx, question) {
    var options = question.options || [];
    var optsLen = options.length;
    var areaX = 34, areaY = 390, areaW = CANVAS_W - 68, areaH = 176;

    this.drawPanel(ctx, areaX, areaY, areaW, areaH, {
      border: 'rgba(255,255,255,0.14)',
      fill: 'rgba(11,15,14,0.76)',
      accent: false
    });

    if (optsLen === 0 && question.correct_action === 'wait') {
      ctx.fillStyle = COLOR_WARNING;
      ctx.font = 'bold 28px ' + FONT_MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HOLD', CANVAS_W / 2, 448);
      ctx.fillStyle = COLOR_WHITE;
      ctx.font = 'bold 16px ' + FONT_FAMILY;
      ctx.fillText('不要触碰屏幕', CANVAS_W / 2, 486);
      this.drawMicroLabel(ctx, 'WAIT UNTIL TIME ENDS', CANVAS_W / 2, 520,
        'center', 'rgba(255,216,92,0.68)');
    } else if (optsLen === 1) {
      var btnW = 246, btnH = 68;
      var opt = options[0];
      this.drawBtn(ctx, (CANVAS_W - btnW) / 2, 438, btnW, btnH,
        opt.label, 'actionBtn', opt.action, {
          bg: opt.color || COLOR_BTN_BG,
          border: opt.color || COLOR_WARNING,
          text: this.getContrastText(opt.color),
          fontSize: 20,
          radius: BTN_RADIUS,
          shadowColor: 'rgba(255,216,92,0.22)'
        });
    } else if (optsLen === 2) {
      var bW = 136, bH = 68;
      var gap = 16;
      var totalW = bW * 2 + gap;
      var startX = (CANVAS_W - totalW) / 2;

      for (var i = 0; i < options.length; i++) {
        var o = options[i];
        var bx = startX + i * (bW + gap);
        var c = o.color || (i === 0 ? '#FF4444' : '#4488FF');
        this.drawBtn(ctx, bx, 438, bW, bH,
          o.label, 'btn_' + i, o.action, {
            bg: c,
            border: c,
            text: this.getContrastText(c),
            fontSize: 20,
            radius: BTN_RADIUS,
            shadowColor: i === 0
              ? 'rgba(255,61,90,0.25)'
              : 'rgba(88,166,255,0.25)'
          });
      }
    } else if (optsLen === 3) {
      var threeGap = 8;
      var threeW = 92;
      var threeH = 76;
      var threeStartX = (CANVAS_W - (threeW * 3 + threeGap * 2)) / 2;
      for (var optionIndex = 0; optionIndex < options.length; optionIndex++) {
        var option = options[optionIndex];
        var optionColor = option.color || COLOR_BTN_BG;
        this.drawBtn(ctx, threeStartX + optionIndex * (threeW + threeGap), 434,
          threeW, threeH, option.label, 'btn_' + optionIndex, option.action, {
            bg: optionColor,
            border: optionColor,
            text: option.textColor || this.getContrastText(optionColor),
            fontSize: 16,
            radius: BTN_RADIUS,
            shadowColor: 'rgba(0,245,160,0.13)'
          });
      }
    }

    if (optsLen > 0) {
      this.drawMicroLabel(ctx, optsLen === 1 ? 'TAP / ENTER' :
        'TAP / KEY 1 · ' + optsLen, CANVAS_W / 2, 538, 'center',
        'rgba(255,255,255,0.34)');
    }
  };

  /**
   * 绘制倒计时条
   */
  OppositeGame.prototype.drawTimerBar = function (ctx) {
    var barW = CANVAS_W - 68;
    var barH = 6;
    var barX = 34;
    var barY = CANVAS_H - 70;
    var radius = 0;

    this.drawMicroLabel(ctx, 'TIME', barX, barY - 13, 'left',
      'rgba(255,255,255,0.40)');
    this.drawMicroLabel(ctx, Math.round(this.timerProgress * 100) + '%',
      barX + barW, barY - 13, 'right',
      this.timerProgress > 0.3 ? COLOR_PRIMARY : COLOR_DANGER);

    // 底色
    ctx.fillStyle = COLOR_TIMER_BG;
    this.roundRect(ctx, barX, barY, barW, barH, radius);
    ctx.fill();

    // 进度
    var progress = this.timerProgress;
    var fillW = Math.max(0, barW * progress);

    if (fillW > 0) {
      var fillColor = progress > 0.3 ? COLOR_PRIMARY :
                      progress > 0.15 ? COLOR_WARNING : COLOR_DANGER;
      ctx.fillStyle = fillColor;
      ctx.fillRect(barX, barY, fillW, barH);
    }
  };

  // ─── PK 过渡页渲染 ───────────────────────────────────────

  /**
   * 绘制好友 PK 过渡页（玩家 A 完成 → 提示轮到玩家 B）
   */
  OppositeGame.prototype.drawPkTransitionPage = function (ctx) {
    this.buttons = [];

    var scoreA = this.playerAResult
      ? this.getSafeNumber(this.playerAResult.totalScore, 0)
      : 0;

    this.drawMicroLabel(ctx, 'PLAYER SWITCH', CANVAS_W / 2, 94, 'center');
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = 'bold 27px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('玩家 A 已完成', CANVAS_W / 2, 146);

    this.drawPanel(ctx, 58, 190, CANVAS_W - 116, 152, {
      border: 'rgba(0,245,160,0.52)',
      fill: 'rgba(11,15,14,0.96)'
    });
    this.drawMicroLabel(ctx, 'PLAYER A SCORE', CANVAS_W / 2, 222, 'center',
      'rgba(0,245,160,0.66)');
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.font = 'bold 58px ' + FONT_MONO;
    ctx.fillText(String(scoreA), CANVAS_W / 2, 278);
    this.drawMicroLabel(ctx, 'POINTS', CANVAS_W / 2, 320, 'center',
      'rgba(255,255,255,0.40)');

    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '14px ' + FONT_FAMILY;
    ctx.fillText('把设备交给下一位玩家', CANVAS_W / 2, 398);
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = 'bold 22px ' + FONT_FAMILY;
    ctx.fillText('轮到玩家 B', CANVAS_W / 2, 440);
    this.drawMicroLabel(ctx, 'READY WHEN YOU ARE', CANVAS_W / 2, 472, 'center',
      'rgba(255,216,92,0.64)');

    var btnW = CANVAS_W - 76, btnH = 56;
    this.drawBtn(ctx, 38, 570, btnW, btnH,
      '玩家 B 开始  /  BEGIN', 'startPlayerB', 'startPlayerB', {
        bg: COLOR_PRIMARY,
        border: COLOR_PRIMARY,
        text: '#07110d',
        fontSize: 15,
        radius: 3,
        glow: 'rgba(0,245,160,0.28)'
      });
    this.drawMicroLabel(ctx, 'ENTER / SPACE', CANVAS_W / 2, 656, 'center',
      'rgba(255,255,255,0.30)');
  };

  /**
   * 好友 PK 过渡页输入处理
   */
  OppositeGame.prototype.handlePkTransitionInput = function (point, isSwipe, swipeDir) {
    if (isSwipe) return;
    var btn = this.hitTest(point);
    if (btn && btn.id === 'startPlayerB') {
      this.startGame();
    }
  };

  // ═══════════════════════════════════════════════════
  //  在线 PK — Socket.IO 系统
  // ═══════════════════════════════════════════════════

  OppositeGame.prototype.initSocket = function () {
    var self = this;
    var serverUrl = window.location.origin;

    try {
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 1500
      });
    } catch (e) {
      console.log('[PK] Socket.IO 初始化失败，在线 PK 不可用:', e);
      this.socket = null;
      return;
    }

    this.socket.on('connect', function () {
      console.log('[PK] Socket 已连接');
    });

    this.socket.on('disconnect', function () {
      console.log('[PK] Socket 断开');
      if (self.onlinePkState === 'queuing' || self.onlinePkState === 'matched' || self.onlinePkState === 'playing') {
        self.homeNotice = '连接断开，请重试';
        self.onlinePkState = 'idle';
        self.page = 'online_pk';
        self.render();
      }
    });

    // 队列状态
    this.socket.on('queue_status', function (data) {
      self.onlineQueuePos = data.position || -1;
      if (data.status === 'left' || data.status === 'cancelled') {
        self.onlinePkState = 'idle';
        self.onlineQueuePos = -1;
      }
      self.render();
    });

    // 匹配成功
    this.socket.on('match_found', function (data) {
      console.log('[PK] 匹配成功:', data);
      self.roomId = data.room_id;
      self.opponentName = data.opponent || '对手';
      self.onlinePkState = 'matched';
      self.onlineScores.me = 0;
      self.opponentScore = 0;
      self.onlineRound = 0;
      self._matchFoundTime = Date.now();
      self.render();
    });

    // 收到题目
    this.socket.on('new_question', function (data) {
      console.log('[PK] 新题目 round=' + data.round, data);
      var q = data.question;
      // 转换题目格式（后端用 correct_action_index，前端需要 correct_action）
      if (typeof q.correct_action_index !== 'undefined' && q.options && q.options.length) {
        q.correct_action = q.options[q.correct_action_index]
          ? q.options[q.correct_action_index].action
          : q.options[0].action;
      }
      self.question = q;
      self.timeLimit = data.time_limit_ms || 8000;
      self.onlineTimeLimit = data.time_limit_ms || 8000;
      self.timerProgress = 1;
      self.onlineRound = data.round;
      self.onlineTotalRounds = data.total;
      self.onlineQuestionStartMs = data.server_time_ms || Date.now();
      self.questionAnswered = false;
      self.combo = 0;
      self.feedbackLines = [];
      self.onlinePkState = 'playing';
      self.page = 'online_pk';
      self.buttons = [];
      self.render();
    });

    // 分数更新
    this.socket.on('score_update', function (data) {
      var scores = data.scores || {};
      var combos = data.combos || {};
      // 找对手的分数
      var myName = self.onlinePlayerName;
      for (var name in scores) {
        if (name === self.opponentName || name !== myName) {
          self.opponentScore = scores[name];
          self.opponentCombo = combos[name] || 0;
        } else {
          self.onlineScores.me = scores[name];
          self.combo = combos[name] || 0;
        }
      }
      // 如果两人都答完，渲染等待状态
      self.render();
    });

    // 游戏结束
    this.socket.on('game_over', function (data) {
      console.log('[PK] 游戏结束:', data);
      var result = data.result || {};
      var myName = self.onlinePlayerName;
      var myResult = result[myName] || {};
      var opponentResult = null;
      for (var name in result) {
        if (name !== myName) opponentResult = result[name];
      }

      var winner = 'draw';
      if (myResult.is_winner) {
        winner = 'me';
      } else if (opponentResult && opponentResult.is_winner) {
        winner = 'them';
      }

      self.onlineResult = {
        winner: winner,
        myScore: myResult.score || 0,
        opponentScore: (opponentResult ? opponentResult.score : 0) || 0
      };
      self.onlineScores.me = myResult.score || 0;
      self.opponentScore = (opponentResult ? opponentResult.score : 0) || 0;
      self.onlineRound = self.onlineTotalRounds;
      self.onlinePkState = 'result';
      self.page = 'online_pk';
      self.buttons = [];
      self.render();
    });

    // 对手离开
    this.socket.on('player_left', function (data) {
      console.log('[PK] 对手离开:', data);
      if (self.onlinePkState === 'playing' || self.onlinePkState === 'matched') {
        self.homeNotice = data.username + ' 离开了游戏';
        self.onlinePkState = 'idle';
        self.onlineResult = null;
        self.page = 'online_pk';
        self.render();
      }
    });

    // 错误
    this.socket.on('error', function (data) {
      console.warn('[PK] 错误:', data);
      self.homeNotice = data.msg || '发生错误';
      self.render();
    });
  };

  // 离开在线匹配
  OppositeGame.prototype.leaveOnlineMatch = function () {
    if (this.socket) {
      this.socket.emit('leave_queue');
      this.socket.emit('cancel_match');
    }
    this.onlinePkState = 'idle';
    this.roomId = null;
    this.opponentName = '';
    this.onlineScores = { me: 0, opponent: 0 };
    this.onlineResult = null;
    this.isOnlineGame = false;
    this.question = null;
  };

  // 显示昵称输入
  OppositeGame.prototype.showPkNameOverlay = function () {
    var self = this;
    var overlay = document.getElementById('pkNameOverlay');
    var input = document.getElementById('pkNameInput');
    var confirmBtn = document.getElementById('pkNameConfirmBtn');
    var cancelBtn = document.getElementById('pkNameCancelBtn');

    if (!overlay || !input) return;

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    input.value = this.onlinePlayerName || '';
    input.focus();

    var doMatch = function () {
      var name = input.value.trim() || ('玩家' + Math.floor(Math.random() * 9999));
      self.onlinePlayerName = name;
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      self.startOnlineMatchmaking(name);
      cleanup();
    };

    var doCancel = function () {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      self.canvas.focus();
      cleanup();
    };

    var onKey = function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        doMatch();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        doCancel();
      }
    };

    var cleanup = function () {
      confirmBtn.removeEventListener('click', doMatch);
      cancelBtn.removeEventListener('click', doCancel);
      input.removeEventListener('keydown', onKey);
    };

    confirmBtn.addEventListener('click', doMatch);
    cancelBtn.addEventListener('click', doCancel);
    input.addEventListener('keydown', onKey);
  };

  // 开始在线匹配
  OppositeGame.prototype.startOnlineMatchmaking = function (name) {
    if (!this.socket || !this.socket.connected) {
      this.homeNotice = '服务器未连接，请刷新页面后重试';
      this.onlinePkState = 'idle';
      this.render();
      return;
    }
    this.onlinePkState = 'queuing';
    this.onlineQueuePos = 1;
    this.homeNotice = '';
    this.page = 'online_pk';
    this.socket.emit('join_queue', { username: name });
    this.render();
  };

  // 在线提交答案
  OppositeGame.prototype.submitOnlineAnswer = function (action, reactionMs) {
    if (!this.socket || !this.roomId || this.questionAnswered) return;
    var q = this.question;
    if (!q) return;

    // 找到玩家选择的选项索引
    var answerIdx = -1;
    if (q.options && q.options.length) {
      for (var i = 0; i < q.options.length; i++) {
        if (q.options[i].action === action) {
          answerIdx = i;
          break;
        }
      }
    }
    if (answerIdx < 0) answerIdx = 0;

    this.socket.emit('submit_answer', {
      room_id: this.roomId,
      answer: answerIdx,
      reaction_time_ms: reactionMs
    });

    this.questionAnswered = true;

    // 本地反馈
    var isCorrect = (answerIdx === (q.correct_action_index || 0));
    if (isCorrect) {
      this.combo = (this.combo || 0) + 1;
      this.showFeedback([{ text: '✓ 已提交', color: COLOR_PRIMARY, size: 38 }]);
      this.showScreenFlash('rgba(0,255,157,0.10)', 180);
      if (typeof playSound === 'function') playSound(AudioManager.gameplay.correct);
    } else {
      this.combo = 0;
      this.showFeedback([{ text: '✗ 已提交', color: COLOR_DANGER, size: 38 }]);
      this.showScreenFlash('rgba(255,61,90,0.18)', 180);
      if (typeof playSound === 'function') playSound(AudioManager.gameplay.wrong);
    }
    this.render();
  };

  // 在线超时
  OppositeGame.prototype.handleOnlineTimeout = function () {
    if (this.questionAnswered) return;
    this.submitOnlineAnswer('timeout', this.onlineTimeLimit);
  };

  /**
   * 排行榜页输入处理
   */
  OppositeGame.prototype.handleLeaderboardInput = function (point, isSwipe, swipeDir) {
    if (isSwipe) return;
    var btn = this.hitTest(point);
    if (btn && btn.id === 'leaderboardBack') {
      this.goToPage('home');
    } else if (btn && btn.id === 'leaderboardClear') {
      this.clearLeaderboard();
      this.render();
    }
  };

  // ─── 排行榜页渲染 ───────────────────────────────────────

  OppositeGame.prototype.drawLeaderboardPage = function (ctx) {
    this.buttons = [];

    var list = this.loadLeaderboard();
    var hasData = list.length > 0;

    // 标题区
    this.drawMicroLabel(ctx, 'RANKING SYSTEM', CANVAS_W / 2, 48, 'center',
      'rgba(0,245,160,0.66)');
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.font = 'bold 34px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('排行榜', CANVAS_W / 2, 80);
    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '13px ' + FONT_FAMILY;
    ctx.fillText('LEADERBOARD  ·  ' + list.length + ' 条记录', CANVAS_W / 2, 110);

    // 分隔线
    ctx.strokeStyle = 'rgba(0,245,160,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(38, 128);
    ctx.lineTo(CANVAS_W - 38, 128);
    ctx.stroke();

    if (!hasData) {
      // 空状态
      ctx.fillStyle = COLOR_SECONDARY;
      ctx.font = '16px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('尚无记录', CANVAS_W / 2, 370);
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.font = '13px ' + FONT_FAMILY;
      ctx.fillText('快去挑战吧！', CANVAS_W / 2, 400);
    } else {
      // 表头
      var headerY = 148;
      ctx.fillStyle = 'rgba(0,245,160,0.50)';
      ctx.font = '11px ' + FONT_MONO;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('RANK', 40, headerY);
      ctx.fillText('SCORE', 106, headerY);
      ctx.textAlign = 'center';
      ctx.fillText('TITLE', 230, headerY);
      ctx.textAlign = 'right';
      ctx.fillText('MODE', CANVAS_W - 98, headerY);
      ctx.fillText('DATE', CANVAS_W - 42, headerY);

      // 分隔线
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(38, headerY + 16);
      ctx.lineTo(CANVAS_W - 38, headerY + 16);
      ctx.stroke();

      // 列表项
      var itemY = headerY + 32;
      var itemsToShow = Math.min(list.length, 8);

      for (var i = 0; i < itemsToShow; i++) {
        var entry = list[i];
        var rank = i + 1;
        var isTop3 = rank <= 3;

        // 行背景（前三名高亮）
        if (isTop3) {
          var medalColors = [
            'rgba(255,215,0,0.10)',   // 金
            'rgba(192,192,192,0.07)', // 银
            'rgba(205,127,50,0.07)'   // 铜
          ];
          ctx.fillStyle = medalColors[rank - 1];
          ctx.fillRect(34, itemY - 10, CANVAS_W - 68, 48);
          if (rank === 1) {
            ctx.fillStyle = 'rgba(255,215,0,0.28)';
            ctx.fillRect(34, itemY - 10, 3, 48);
          }
        }

        // 排名
        var rankColor = rank === 1 ? '#FFD700' :
                        rank === 2 ? '#C0C0C0' :
                        rank === 3 ? '#CD7F32' : COLOR_SECONDARY;
        ctx.fillStyle = rankColor;
        ctx.font = 'bold ' + (isTop3 ? 16 : 13) + 'px ' + FONT_MONO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        var medal = rank === 1 ? '👑 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : '';
        ctx.fillText(medal + '#' + rank, 40, itemY + 12);

        // 分数（主要信息）
        ctx.fillStyle = COLOR_WHITE;
        ctx.font = 'bold 17px ' + FONT_MONO;
        ctx.fillText(String(entry.totalScore), 106, itemY + 12);
        ctx.fillStyle = COLOR_PRIMARY;
        ctx.font = '9px ' + FONT_MONO;
        ctx.fillText('PTS', 106, itemY + 30);

        // 称号
        ctx.fillStyle = COLOR_WHITE;
        ctx.font = '13px ' + FONT_FAMILY;
        ctx.textAlign = 'center';
        ctx.fillText(entry.title || '--', 230, itemY + 6);

        // 详细信息（正确数 / 连击 / 反应时间）
        var detail = '✓' + (entry.correctCount || 0) + '/' + (entry.totalQuestions || 20);
        if (entry.maxCombo) {
          detail += '  🔥' + entry.maxCombo;
        }
        if (entry.fastestReaction !== null && entry.fastestReaction !== undefined) {
          detail += '  ⚡' + (entry.fastestReaction / 1000).toFixed(2) + 's';
        }
        ctx.fillStyle = COLOR_SECONDARY;
        ctx.font = '10px ' + FONT_MONO;
        ctx.fillText(detail, 230, itemY + 22);

        // 模式
        ctx.fillStyle = COLOR_SECONDARY;
        ctx.font = '10px ' + FONT_FAMILY;
        ctx.textAlign = 'right';
        var modeLabel = entry.playMode === 'level'
          ? '第' + (entry.level || 1) + '关'
          : entry.mode === 'single' ? '单人' :
            entry.mode === 'shadow' ? '在线PK' : entry.mode;
        ctx.fillText(modeLabel, CANVAS_W - 98, itemY + 12);

        // 日期
        ctx.font = '10px ' + FONT_MONO;
        var dateStr = entry.date || '';
        // 只显示月-日 时:分
        ctx.fillText(dateStr.length > 10 ? dateStr.slice(5) : dateStr, CANVAS_W - 42, itemY + 12);

        itemY += 56;
      }
    }

    // 底部分隔线
    var bottomDividerY = 686;
    ctx.strokeStyle = 'rgba(0,245,160,0.18)';
    ctx.beginPath();
    ctx.moveTo(38, bottomDividerY);
    ctx.lineTo(CANVAS_W - 38, bottomDividerY);
    ctx.stroke();

    // 返回按钮
    var bottomBtnW = CANVAS_W - 76, bottomBtnH = 48;
    this.drawBtn(ctx, 38, 702, bottomBtnW, bottomBtnH,
      '返回首页  /  BACK', 'leaderboardBack', 'leaderboardBack', {
        bg: COLOR_PRIMARY,
        border: COLOR_PRIMARY,
        text: '#07110d',
        fontSize: 14,
        radius: BTN_RADIUS,
        glow: 'rgba(0,245,160,0.22)'
      });

    // 清空按钮（有数据时显示）
    if (hasData) {
      this.drawBtn(ctx, 38, 758, bottomBtnW, 36,
        '清空记录  /  CLEAR', 'leaderboardClear', 'leaderboardClear', {
          bg: 'rgba(14,22,20,0.90)',
          border: 'rgba(255,61,90,0.30)',
          text: 'rgba(255,61,90,0.60)',
          fontSize: 11,
          radius: BTN_RADIUS,
          glow: 'rgba(255,61,90,0.04)',
          shadowColor: 'rgba(255,61,90,0.08)',
          pixelShadow: true
        });
    }
  };

  // ─── 结算页渲染 ─────────────────────────────────────────

  OppositeGame.prototype.drawResultPage = function (ctx) {
    this.buttons = [];

    var isLocalPk = this.gameMode === 'local_pk' && this.localPkResult;
    var isLevel = this.playMode === 'level';
    var levelResult = this.levelResult || { passed: false, unlockedNext: false, complete: false };
    var totalQuestions = this.getTotalQuestions();
    var statsY = isLocalPk ? 234 : 208;
    var statsH = 178;
    var roastY = statsY + statsH + 24;

    if (isLocalPk) {
      var lpr = this.localPkResult;
      this.drawMicroLabel(ctx, 'VERSUS RESULT', CANVAS_W / 2, 48, 'center',
        COLOR_WARNING);
      var winColor = lpr.winner === 'draw' ? COLOR_SECONDARY :
                     lpr.winner === 'A' ? COLOR_PRIMARY : COLOR_DANGER;
      ctx.fillStyle = winColor;
      ctx.font = 'bold 25px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lpr.resultLabel, CANVAS_W / 2, 78);

      this.drawPanel(ctx, 32, 104, CANVAS_W - 64, 108, {
        border: 'rgba(255,216,92,0.36)',
        fill: 'rgba(12,17,15,0.95)',
        accentColor: COLOR_WARNING
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(CANVAS_W / 2, 122);
      ctx.lineTo(CANVAS_W / 2, 194);
      ctx.stroke();

      this.drawMicroLabel(ctx, 'PLAYER A', 100, 130, 'center', COLOR_PRIMARY);
      this.drawMicroLabel(ctx, 'PLAYER B', CANVAS_W - 100, 130, 'center', COLOR_DANGER);
      ctx.fillStyle = COLOR_WHITE;
      ctx.font = 'bold 36px ' + FONT_MONO;
      ctx.textAlign = 'center';
      ctx.fillText(String(lpr.scoreA), 100, 166);
      ctx.fillText(String(lpr.scoreB), CANVAS_W - 100, 166);

      var pkDiffStr = lpr.diff > 0 ? '+' + lpr.diff : String(lpr.diff);
      var pkDiffColor = lpr.diff > 0 ? COLOR_PRIMARY :
        lpr.diff < 0 ? COLOR_DANGER : COLOR_SECONDARY;
      this.drawMicroLabel(ctx, 'DIFF ' + pkDiffStr, CANVAS_W / 2, 198,
        'center', pkDiffColor);
    } else {
      var resultLabel = this.playMode === 'practice' ? 'PRACTICE COMPLETE' :
        isLevel ? (levelResult.passed ? 'LEVEL CLEAR' : 'LEVEL FAILED') : 'MISSION CLEAR';
      this.drawMicroLabel(ctx, resultLabel,
        CANVAS_W / 2, 48, 'center',
        isLevel && !levelResult.passed ? COLOR_DANGER : COLOR_PRIMARY);
      ctx.fillStyle = isLevel && !levelResult.passed ? COLOR_DANGER : COLOR_PRIMARY;
      ctx.font = 'bold 54px ' + FONT_MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isLevel ? this.score + '/10' : String(this.getSafeTotalScore()),
        CANVAS_W / 2, 92);
      this.drawMicroLabel(ctx, isLevel ? 'CORRECT ANSWERS' : 'TOTAL POINTS',
        CANVAS_W / 2, 126, 'center',
        'rgba(255,255,255,0.42)');
      ctx.fillStyle = COLOR_WHITE;
      ctx.font = 'bold 17px ' + FONT_FAMILY;
      ctx.fillText(isLevel
        ? '第 ' + this.selectedLevel + ' 关 · ' + this.getLevelConfig(this.selectedLevel).title
        : this.resultTitle, CANVAS_W / 2, 154);
      this.drawMicroLabel(ctx, isLevel
        ? (levelResult.passed ? 'PASS · 达到 60%' : 'RETRY · 还差 ' + (LEVEL_PASS_COUNT - this.score) + ' 题')
        : 'CLEAR ' + this.score + ' / ' + totalQuestions,
        CANVAS_W / 2, 180, 'center', COLOR_WARNING);
    }

    var stats;
    if (isLocalPk) {
      var playerA = this.playerAResult || {};
      var playerB = this.playerBResult || {};
      stats = [
        { label: 'A 正确题数', value: this.getSafeNumber(playerA.correctCount, 0) + ' / ' + totalQuestions },
        { label: 'B 正确题数', value: this.getSafeNumber(playerB.correctCount, 0) + ' / ' + totalQuestions },
        { label: 'A 最长连击', value: this.getSafeNumber(playerA.maxCombo, 0) + ' 次' },
        { label: 'B 最长连击', value: this.getSafeNumber(playerB.maxCombo, 0) + ' 次' }
      ];
    } else {
      var fastest = this.getSafeNumber(this.fastestReaction, null);
      stats = [
        { label: '正确题数', value: this.getSafeNumber(this.score, 0) + ' / ' + totalQuestions },
        { label: '正确率', value: Math.round(this.score / Math.max(1, totalQuestions) * 100) + '%' },
        { label: '最快反应',
          value: fastest === null ? '-- 秒' : (fastest / 1000).toFixed(2) + ' 秒' },
        { label: isLevel ? '关卡状态' : '弱点题型',
          value: isLevel ? (levelResult.passed ? '已通过' : '未通过') : (this.resultWeakness || '无') }
      ];
    }

    this.drawPanel(ctx, 32, statsY, CANVAS_W - 64, statsH, {
      border: 'rgba(0,245,160,0.26)',
      fill: 'rgba(11,15,14,0.93)'
    });
    this.drawMicroLabel(ctx, isLocalPk ? 'MATCH REPORT' : 'SYSTEM REPORT',
      48, statsY + 22, 'left', 'rgba(0,245,160,0.64)');

    var statY = statsY + 50;
    ctx.textBaseline = 'middle';

    for (var i = 0; i < stats.length; i++) {
      var st = stats[i];
      var y = statY + i * 32;

      ctx.fillStyle = COLOR_SECONDARY;
      ctx.font = '13px ' + FONT_FAMILY;
      ctx.textAlign = 'left';
      ctx.fillText(st.label, 48, y);

      ctx.fillStyle = COLOR_WHITE;
      ctx.font = 'bold 14px ' + FONT_MONO;
      ctx.textAlign = 'right';
      ctx.fillText(st.value, CANVAS_W - 48, y);

      if (i < stats.length - 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.055)';
        ctx.beginPath();
        ctx.moveTo(48, y + 15);
        ctx.lineTo(CANVAS_W - 48, y + 15);
        ctx.stroke();
      }
    }

    var roast = isLocalPk
      ? (this.localPkResult.winner === 'draw'
        ? '势均力敌，这局谁也没赢。'
        : this.localPkResult.resultLabel + '，分差 ' + Math.abs(this.localPkResult.diff) + ' 分。')
      : isLevel
        ? (levelResult.complete
          ? '你已经打穿反着来。'
          : levelResult.unlockedNext
            ? '过关！第 ' + (this.selectedLevel + 1) + ' 关已解锁。'
            : levelResult.passed
              ? '过关！这一关已经稳住了。'
              : '再试一次，答对 6 题即可过关。')
        : (this.resultRoast || '再来一局，看看还能不能更快。');
    this.drawMicroLabel(ctx, 'SYSTEM MESSAGE', 40, roastY, 'left',
      'rgba(255,216,92,0.72)');
    ctx.fillStyle = COLOR_SECONDARY;
    ctx.font = '14px ' + FONT_FAMILY;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.fillRect(36, roastY + 18, 2, 48);
    ctx.fillStyle = COLOR_SECONDARY;
    var roastLines = this.wrapText(ctx, '“' + roast + '”', CANVAS_W - 88, 2);
    var roastStartY = roastY + 32;
    for (var lineIndex = 0; lineIndex < roastLines.length; lineIndex++) {
      ctx.fillText(roastLines[lineIndex], 50, roastStartY + lineIndex * 24);
    }

    if (this.shareNotice) {
      ctx.fillStyle = COLOR_WARNING;
      ctx.font = '12px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      ctx.fillText(this.shareNotice, CANVAS_W / 2, 552);
    }

    var btnW = CANVAS_W - 76;
    var restartY = 574;
    this.drawBtn(ctx, 38, restartY, btnW, 56,
      this.playMode === 'practice' ? '再练一次  /  AGAIN' :
        isLevel ? '再试一次  /  RETRY' : '不服，再来一局  /  RESTART',
      'restart', 'restart', {
        bg: COLOR_PRIMARY,
        border: COLOR_PRIMARY,
        text: '#07110d',
        fontSize: 15,
        radius: BTN_RADIUS,
        glow: 'rgba(0,245,160,0.26)'
      });

    var secondaryGap = 12;
    var secondaryW = (btnW - secondaryGap) / 2;
    this.drawBtn(ctx, 38, 646, secondaryW, 48,
      '分享战绩', 'shareResult', 'shareResult', {
        bg: 'rgba(14,22,20,0.94)',
        border: 'rgba(0,245,160,0.32)',
        text: COLOR_PRIMARY,
        fontSize: 14,
        radius: BTN_RADIUS,
        shadowColor: 'rgba(0,245,160,0.12)'
      });
    this.drawBtn(ctx, 38 + secondaryW + secondaryGap, 646, secondaryW, 48,
      isLevel ? '关卡选择' : '返回首页',
      isLevel ? 'goLevels' : 'goHome',
      isLevel ? 'goLevels' : 'goHome', {
        bg: 'rgba(14,22,20,0.96)',
        border: 'rgba(255,255,255,0.22)',
        text: COLOR_SECONDARY,
        fontSize: 14,
        radius: BTN_RADIUS,
        shadowColor: 'rgba(255,255,255,0.08)'
      });

    if (isLevel) {
      this.drawBtn(ctx, 38, 708, btnW, 42,
        '返回首页  /  HOME', 'goHome', 'goHome', {
          bg: 'rgba(14,22,20,0.94)',
          border: 'rgba(255,255,255,0.18)',
          text: COLOR_SECONDARY,
          fontSize: 13,
          radius: BTN_RADIUS,
          shadowColor: 'rgba(255,255,255,0.06)'
        });
    } else if (!isLocalPk && this.playMode === 'challenge') {
      this.drawBtn(ctx, 38, 708, btnW, 42,
        '查看排行榜  /  RANKING', 'goRanking', 'goRanking', {
          bg: 'rgba(14,22,20,0.94)',
          border: 'rgba(0,245,160,0.28)',
          text: 'rgba(0,245,160,0.68)',
          fontSize: 13,
          radius: BTN_RADIUS,
          glow: 'rgba(0,245,160,0.06)',
          shadowColor: 'rgba(0,245,160,0.12)'
        });
    }
  };

  // ─── 启动 ───────────────────────────────────────────────

  // 页面加载完成后启动
  function boot() {
    if (typeof QuestionBank === 'undefined') {
      console.error('[反着来] QuestionBank 未加载，请确认 questions.js 先于 game.js 引入');
      return;
    }
    var game = new OppositeGame();
    window.game = game;

    // 初始化 Socket.IO（在线 PK）
    if (typeof io !== 'undefined') {
      game.initSocket();
    } else {
      console.warn('[反着来] Socket.IO 客户端未加载，在线 PK 不可用');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
