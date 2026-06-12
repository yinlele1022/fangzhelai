(function (global) {
  "use strict";
  var OppositeGame = global.OppositeGame;
  var ui = global.OppositeGameUI;
  var BTN_RADIUS = ui.BTN_RADIUS;
  var CANVAS_W = ui.CANVAS_W;
  var COLOR_PRIMARY = ui.COLOR_PRIMARY;
  var COLOR_SECONDARY = ui.COLOR_SECONDARY;
  var COLOR_WHITE = ui.COLOR_WHITE;
  var FONT_FAMILY = ui.FONT_FAMILY;
  var FONT_MONO = ui.FONT_MONO;

  var cloudLeaderboard = [];
  var cloudLoaded = false;
  var cloudLoading = false;
  var cloudError = '';

  function fitText(ctx, value, maxWidth) {
    var text = String(value || '--');
    if (ctx.measureText(text).width <= maxWidth) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth) {
      text = text.slice(0, -1);
    }
    return text + '…';
  }

  function formatDate(value) {
    var text = String(value || '');
    var match = text.match(/^\s*(?:\d{4}[\/-])?(\d{1,2})[\/-](\d{1,2}).*?(\d{1,2}):(\d{2})/);
    if (match) {
      return ('0' + match[1]).slice(-2) + '/' + ('0' + match[2]).slice(-2) +
        ' ' + ('0' + match[3]).slice(-2) + ':' + match[4];
    }
    return text.length > 11 ? text.slice(-11) : text || '--';
  }

  function leaderboardEntryKey(entry) {
    return [
      String(entry.playerName || ''),
      Number(entry.totalScore) || 0,
      Number(entry.maxCombo) || 0,
      entry.fastestReaction === null || entry.fastestReaction === undefined
        ? ''
        : Number(entry.fastestReaction)
    ].join('|');
  }

  OppositeGame.prototype.invalidateCloudLeaderboard = function () {
    cloudLoaded = false;
    cloudError = '';
  };

  OppositeGame.prototype.mergeLeaderboardData = function (localList, remoteList) {
    var merged = [];
    var entriesByKey = {};

    localList.forEach(function (item) {
      var entry = Object.assign({}, item, {
        playerName: item.playerName || '本机玩家',
        source: 'local'
      });
      var key = leaderboardEntryKey(entry);
      if (entriesByKey[key]) return;
      entriesByKey[key] = entry;
      merged.push(entry);
    });

    remoteList.forEach(function (item) {
      var entry = {
        playerName: item.player_name || '匿名玩家',
        totalScore: Number(item.score) || 0,
        maxCombo: Number(item.max_combo) || 0,
        fastestReaction: item.fastest_reaction_ms === null ||
          item.fastest_reaction_ms === undefined ||
          Number(item.fastest_reaction_ms) >= 999999
          ? null
          : Number(item.fastest_reaction_ms),
        title: '在线记录',
        date: item.created_at || '',
        mode: 'cloud',
        source: 'cloud'
      };
      var key = leaderboardEntryKey(entry);
      if (entriesByKey[key]) {
        entriesByKey[key].source = 'cloud';
        entriesByKey[key].playerName = entry.playerName;
        return;
      }
      entriesByKey[key] = entry;
      merged.push(entry);
    });

    merged.sort(function (a, b) {
      return (Number(b.totalScore) || 0) - (Number(a.totalScore) || 0);
    });
    return merged.slice(0, 20);
  };

  OppositeGame.prototype.loadCloudLeaderboard = function () {
    if (cloudLoaded || cloudLoading) return;
    cloudLoading = true;
    cloudError = '';

    var self = this;
    if (!global.AppApi || typeof global.AppApi.getLeaderboard !== 'function') {
      cloudLoading = false;
      cloudLoaded = true;
      cloudError = '云端服务不可用';
      return;
    }

    global.AppApi.getLeaderboard(function (err, data) {
      cloudLoading = false;
      cloudLoaded = true;
      if (err) {
        cloudError = '云端同步失败';
      } else {
        cloudLeaderboard = data && Array.isArray(data.leaderboard)
          ? data.leaderboard
          : [];
        cloudError = '';
      }
      if (self.page === 'leaderboard') self.render();
    });
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
    } else if (btn && btn.id === 'leaderboardRefresh') {
      cloudLoaded = false;
      cloudError = '';
      this.loadCloudLeaderboard();
      this.render();
    }
  };

  // ─── 排行榜页渲染 ───────────────────────────────────────

  OppositeGame.prototype.drawLeaderboardPage = function (ctx) {
    this.buttons = [];

    this.loadCloudLeaderboard();
    var localList = this.loadLeaderboard();
    var list = this.mergeLeaderboardData(localList, cloudLeaderboard);
    var hasData = list.length > 0;
    var hasLocalData = localList.length > 0;

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
    var syncStatus = cloudLoading
      ? '同步中'
      : cloudError
        ? cloudError
        : cloudLoaded
          ? '在线 ' + cloudLeaderboard.length + ' 条'
          : '等待同步';
    ctx.fillText('LEADERBOARD  ·  ' + syncStatus + '  ·  ' + list.length + ' 条',
      CANVAS_W / 2, 110);

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
      ctx.fillText(cloudLoading ? '正在连接云端排行榜…' : '尚无记录', CANVAS_W / 2, 370);
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.font = '13px ' + FONT_FAMILY;
      ctx.fillText(cloudError ? '请点击下方按钮重试' : '快去挑战吧！', CANVAS_W / 2, 400);
    } else {
      // 表头
      var headerY = 148;
      ctx.fillStyle = 'rgba(0,245,160,0.50)';
      ctx.font = '11px ' + FONT_MONO;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('RANK / SCORE', 40, headerY);
      ctx.fillText('PLAYER / STATS', 150, headerY);
      ctx.textAlign = 'right';
      ctx.fillText('MODE / DATE', CANVAS_W - 40, headerY);

      // 分隔线
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(38, headerY + 16);
      ctx.lineTo(CANVAS_W - 38, headerY + 16);
      ctx.stroke();

      // 列表项
      var itemY = headerY + 22;
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
          ctx.fillRect(34, itemY, CANVAS_W - 68, 54);
          if (rank === 1) {
            ctx.fillStyle = 'rgba(255,215,0,0.28)';
            ctx.fillRect(34, itemY, 3, 54);
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
        ctx.fillText(('0' + rank).slice(-2), 42, itemY + 20);
        if (isTop3) {
          ctx.font = 'bold 8px ' + FONT_MONO;
          ctx.fillText('TOP', 42, itemY + 39);
        }

        // 分数（主要信息）
        ctx.fillStyle = COLOR_WHITE;
        ctx.font = 'bold 16px ' + FONT_MONO;
        ctx.fillText(String(entry.totalScore), 82, itemY + 19);
        ctx.fillStyle = COLOR_PRIMARY;
        ctx.font = '8px ' + FONT_MONO;
        ctx.fillText('PTS', 82, itemY + 39);

        // 玩家
        ctx.fillStyle = COLOR_WHITE;
        ctx.font = 'bold 12px ' + FONT_FAMILY;
        ctx.textAlign = 'left';
        ctx.fillText(fitText(ctx, entry.playerName || '匿名玩家', 100), 150, itemY + 18);

        // 详细信息（称号 / 正确数 / 连击 / 反应时间）
        var detail = entry.title && entry.title !== '在线记录' ? entry.title : '';
        if (entry.correctCount !== null && entry.correctCount !== undefined) {
          detail += (detail ? ' · ' : '') + '正确 ' + entry.correctCount +
            '/' + (entry.totalQuestions || 20);
        }
        if (entry.maxCombo) {
          detail += (detail ? ' · ' : '') + '连击 ' + entry.maxCombo;
        }
        if (entry.fastestReaction !== null && entry.fastestReaction !== undefined) {
          detail += (detail ? ' · ' : '') +
            (entry.fastestReaction / 1000).toFixed(2) + 's';
        }
        ctx.fillStyle = COLOR_SECONDARY;
        ctx.font = '9px ' + FONT_FAMILY;
        ctx.fillText(fitText(ctx, detail, 104), 150, itemY + 39);

        // 模式
        ctx.fillStyle = COLOR_SECONDARY;
        ctx.font = '10px ' + FONT_FAMILY;
        ctx.textAlign = 'right';
        var modeLabel = entry.playMode === 'level'
          ? '第' + (entry.level || 1) + '关'
          : entry.mode === 'single' ? '单人' :
            entry.mode === 'shadow' ? '在线PK' :
              entry.source === 'cloud' ? '云端' : entry.mode;
        ctx.fillText(fitText(ctx, modeLabel, 66), CANVAS_W - 40, itemY + 18);

        // 日期
        ctx.fillStyle = 'rgba(255,255,255,0.38)';
        ctx.font = '9px ' + FONT_MONO;
        ctx.fillText(formatDate(entry.date), CANVAS_W - 40, itemY + 39);

        if (i < itemsToShow - 1) {
          ctx.strokeStyle = 'rgba(255,255,255,0.045)';
          ctx.beginPath();
          ctx.moveTo(40, itemY + 58);
          ctx.lineTo(CANVAS_W - 40, itemY + 58);
          ctx.stroke();
        }
        itemY += 61;
      }
    }

    // 底部分隔线
    var bottomDividerY = 670;
    ctx.strokeStyle = 'rgba(0,245,160,0.18)';
    ctx.beginPath();
    ctx.moveTo(38, bottomDividerY);
    ctx.lineTo(CANVAS_W - 38, bottomDividerY);
    ctx.stroke();

    // 返回按钮
    var bottomBtnW = CANVAS_W - 76, bottomBtnH = 48;
    this.drawBtn(ctx, 38, 686, bottomBtnW, bottomBtnH,
      '返回首页  /  BACK', 'leaderboardBack', 'leaderboardBack', {
        bg: COLOR_PRIMARY,
        border: COLOR_PRIMARY,
        text: '#07110d',
        fontSize: 14,
        radius: BTN_RADIUS,
        glow: 'rgba(0,245,160,0.22)'
      });

    var actionGap = 8;
    var actionBtnW = hasLocalData ? (bottomBtnW - actionGap) / 2 : bottomBtnW;
    this.drawBtn(ctx, 38, 746, actionBtnW, 36,
      cloudLoading ? '正在同步…' : '刷新在线榜', 'leaderboardRefresh', 'leaderboardRefresh', {
        bg: 'rgba(0,245,160,0.08)',
        border: 'rgba(0,245,160,0.25)',
        text: cloudLoading ? 'rgba(255,255,255,0.35)' : 'rgba(0,245,160,0.70)',
        fontSize: 11,
        radius: BTN_RADIUS
      });

    // 只清除当前设备上的历史，云端成绩不受影响
    if (hasLocalData) {
      this.drawBtn(ctx, 38 + actionBtnW + actionGap, 746, actionBtnW, 36,
        '清空本机记录', 'leaderboardClear', 'leaderboardClear', {
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

})(window);
