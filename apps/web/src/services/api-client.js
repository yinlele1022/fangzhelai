/**
 * 《反着来》API 客户端
 * 同源 API 客户端。供页面功能和调试工具复用。
 */
(function () {
  'use strict';

  var API_BASE = '';  // 同源请求，Flask 托管时无 CORS 问题

  // ── 获取题目（核心接口）────────────────────────────
  function fetchQuestion(difficulty, excludeTypes, forceType, callback) {
    var url = API_BASE + '/api/generate-question';
    var body = {
      difficulty: difficulty || 1,
      exclude_types: excludeTypes || [],
      type: forceType || 'any'
    };

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      callback(null, data);
    })
    .catch(function (err) {
      callback(err, null);
    });
  }

  // ── 分析表现 ───────────────────────────────────
  function analyzePerformance(answers, callback) {
    fetch(API_BASE + '/api/analyze-performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: answers })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) { callback(null, data); })
    .catch(function (err) { callback(err, null); });
  }

  // ── 生成分享文案 ───────────────────────────────
  function generateShareText(score, maxCombo, fastestMs, weakness, callback) {
    fetch(API_BASE + '/api/generate-share-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score: score,
        max_combo: maxCombo,
        fastest_reaction_ms: fastestMs,
        weakness: weakness
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) { callback(null, data); })
    .catch(function (err) { callback(err, null); });
  }

  // ── 创建挑战 ───────────────────────────────────
  function createChallenge(playerName, score, questions, callback) {
    fetch(API_BASE + '/api/create-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_name: playerName,
        score: score,
        questions: questions
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) { callback(null, data); })
    .catch(function (err) { callback(err, null); });
  }

  // ── 获取挑战 ───────────────────────────────────
  function getChallenge(code, callback) {
    fetch(API_BASE + '/api/challenge/' + encodeURIComponent(code))
      .then(function (res) { return res.json(); })
      .then(function (data) { callback(null, data); })
      .catch(function (err) { callback(err, null); });
  }

  function health(callback) {
    fetch(API_BASE + '/health')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) { callback(null, data); })
      .catch(function (err) { callback(err, null); });
  }

  function submitLeaderboard(entry, callback) {
    fetch(API_BASE + '/api/leaderboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_name: entry.playerName,
        score: entry.totalScore,
        max_combo: entry.maxCombo,
        fastest_reaction_ms: entry.fastestReaction === null ||
          entry.fastestReaction === undefined
          ? 999999
          : entry.fastestReaction,
        answers: entry.answers || []
      })
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) { callback(null, data); })
    .catch(function (err) { callback(err, null); });
  }

  function getLeaderboard(callback) {
    fetch(API_BASE + '/api/leaderboard/top')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) { callback(null, data); })
      .catch(function (err) { callback(err, null); });
  }

  // 暴露到全局
  window.AppApi = {
    fetchQuestion: fetchQuestion,
    analyzePerformance: analyzePerformance,
    generateShareText: generateShareText,
    createChallenge: createChallenge,
    getChallenge: getChallenge,
    health: health,
    submitLeaderboard: submitLeaderboard,
    getLeaderboard: getLeaderboard
  };

  console.log('[反着来] API Client 加载完成，BASE =', API_BASE);

})();
