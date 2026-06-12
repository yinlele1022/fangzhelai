/**
 * 离线版兼容层
 * 提供在线 PK 和云端排行榜的 stub 实现，确保离线版本不报错。
 */
(function (global) {
  "use strict";

  var OppositeGame = global.OppositeGame;
  if (!OppositeGame) return;

  // ── 在线 PK stub 方法 ──────────────────────────────────

  OppositeGame.prototype.initSocket = function () {
    console.log("[离线版] 在线 PK 功能不可用");
    this.socket = null;
  };

  OppositeGame.prototype.leaveOnlineMatch = function () {
    this.onlinePkState = "idle";
    this.roomId = null;
    this.opponentName = "";
    this.opponentSid = "";
    this.onlineRoundToken = "";
    this.onlineScores = { me: 0, opponent: 0 };
    this.onlineResult = null;
    this.isOnlineGame = false;
    this.question = null;
  };

  OppositeGame.prototype.showPkNameOverlay = function () {
    this.homeNotice = "在线对战需要服务器支持，离线版暂不可用。";
    this.render();
  };

  OppositeGame.prototype.startOnlineMatchmaking = function () {
    this.homeNotice = "在线匹配需要服务器支持，离线版暂不可用。";
    this.onlinePkState = "idle";
    this.render();
  };

  OppositeGame.prototype.submitOnlineAnswer = function () {
    // no-op
  };

  OppositeGame.prototype.handleOnlineTimeout = function () {
    // no-op
  };

  // ── 排行榜 stub（仅本地存储，无云端同步） ──────────────

  OppositeGame.prototype.invalidateCloudLeaderboard = function () {
    // 离线版无需云端缓存
  };

  OppositeGame.prototype.loadCloudLeaderboard = function () {
    // 离线版无需云端数据
  };

  OppositeGame.prototype.mergeLeaderboardData = function (localList) {
    return (localList || []).slice(0, 20);
  };

  OppositeGame.prototype.handleLeaderboardInput = function (point, isSwipe) {
    if (isSwipe) return;
    var btn = this.hitTest(point);
    if (btn && btn.id === "leaderboardBack") {
      this.goToPage("home");
    } else if (btn && btn.id === "leaderboardClear") {
      this.clearLeaderboard();
      this.render();
    }
  };

  // 简化版排行榜渲染（仅本地数据）
  OppositeGame.prototype.drawLeaderboardPage = function (ctx) {
    this.buttons = [];

    var list = this.loadLeaderboard();
    var hasData = list.length > 0;

    // 标题
    ctx.fillStyle = "rgba(0,245,160,0.66)";
    ctx.font = "bold 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("RANKING SYSTEM", 187, 48);

    ctx.fillStyle = "#00F5A0";
    ctx.font = "bold 34px \"Alibaba PuHuiTi\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
    ctx.fillText("排行榜", 187, 80);

    ctx.fillStyle = "#95A29D";
    ctx.font = "13px \"Alibaba PuHuiTi\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
    ctx.fillText("LEADERBOARD  ·  本机记录  ·  " + list.length + " 条", 187, 110);

    // 分隔线
    ctx.strokeStyle = "rgba(0,245,160,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(38, 128);
    ctx.lineTo(337, 128);
    ctx.stroke();

    if (!hasData) {
      ctx.fillStyle = "#95A29D";
      ctx.font = "16px \"Alibaba PuHuiTi\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("尚无记录，快去挑战吧！", 187, 370);
    } else {
      // 表头
      ctx.fillStyle = "rgba(0,245,160,0.50)";
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.fillText("RANK / SCORE", 40, 148);
      ctx.fillText("PLAYER / STATS", 150, 148);
      ctx.textAlign = "right";
      ctx.fillText("MODE / DATE", 335, 148);

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(38, 164);
      ctx.lineTo(337, 164);
      ctx.stroke();

      var itemsToShow = Math.min(list.length, 8);
      var itemY = 170;

      for (var i = 0; i < itemsToShow; i++) {
        var entry = list[i];
        var rank = i + 1;
        var isTop3 = rank <= 3;

        if (isTop3) {
          var medalColors = [
            "rgba(255,215,0,0.10)",
            "rgba(192,192,192,0.07)",
            "rgba(205,127,50,0.07)"
          ];
          ctx.fillStyle = medalColors[rank - 1];
          ctx.fillRect(34, itemY, 307, 54);
          if (rank === 1) {
            ctx.fillStyle = "rgba(255,215,0,0.28)";
            ctx.fillRect(34, itemY, 3, 54);
          }
        }

        var rankColor = rank === 1 ? "#FFD700" :
                        rank === 2 ? "#C0C0C0" :
                        rank === 3 ? "#CD7F32" : "#95A29D";
        ctx.fillStyle = rankColor;
        ctx.font = "bold " + (isTop3 ? 16 : 13) + "px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(("0" + rank).slice(-2), 42, itemY + 20);

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.fillText(String(entry.totalScore || 0), 82, itemY + 19);
        ctx.fillStyle = "#00F5A0";
        ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.fillText("PTS", 82, itemY + 39);

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 12px \"Alibaba PuHuiTi\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
        ctx.fillText((entry.playerName || "玩家").slice(0, 8), 150, itemY + 18);

        var detail = (entry.title || "") +
          (entry.correctCount != null ? " · 正确 " + entry.correctCount + "/" + (entry.totalQuestions || 20) : "") +
          (entry.maxCombo ? " · 连击 " + entry.maxCombo : "") +
          (entry.fastestReaction != null ? " · " + (entry.fastestReaction / 1000).toFixed(2) + "s" : "");
        ctx.fillStyle = "#95A29D";
        ctx.font = "9px \"Alibaba PuHuiTi\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
        ctx.fillText(detail.slice(0, 20), 150, itemY + 39);

        ctx.fillStyle = "#95A29D";
        ctx.font = "10px \"Alibaba PuHuiTi\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
        ctx.textAlign = "right";
        var modeLabel = entry.playMode === "level" ? "第" + (entry.level || 1) + "关" : entry.mode || "单人";
        ctx.fillText(modeLabel, 335, itemY + 18);

        ctx.fillStyle = "rgba(255,255,255,0.38)";
        ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.fillText((entry.date || "").slice(-11) || "--", 335, itemY + 39);

        if (i < itemsToShow - 1) {
          ctx.strokeStyle = "rgba(255,255,255,0.045)";
          ctx.beginPath();
          ctx.moveTo(40, itemY + 58);
          ctx.lineTo(335, itemY + 58);
          ctx.stroke();
        }
        itemY += 61;
      }
    }

    // 分隔线
    ctx.strokeStyle = "rgba(0,245,160,0.18)";
    ctx.beginPath();
    ctx.moveTo(38, 670);
    ctx.lineTo(337, 670);
    ctx.stroke();

    // 返回按钮
    ctx.fillStyle = "#00F5A0";
    ctx.beginPath();
    ctx.moveTo(38 + 2, 686);
    ctx.lineTo(38 + 307, 686);
    ctx.lineTo(38 + 307, 686 + 48);
    ctx.lineTo(38 + 2, 686 + 48);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#07110d";
    ctx.font = "bold 14px \"Alibaba PuHuiTi\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("返回首页  /  BACK", 187, 710);
    this.buttons.push({ x: 38, y: 686, w: 299, h: 48, id: "leaderboardBack", action: "leaderboardBack" });

    // 清空按钮
    if (hasData) {
      ctx.fillStyle = "rgba(14,22,20,0.90)";
      ctx.beginPath();
      ctx.moveTo(38 + 2, 746);
      ctx.lineTo(38 + 307, 746);
      ctx.lineTo(38 + 307, 746 + 36);
      ctx.lineTo(38 + 2, 746 + 36);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,61,90,0.30)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "rgba(255,61,90,0.60)";
      ctx.font = "bold 11px \"Alibaba PuHuiTi\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
      ctx.fillText("清空本机记录", 187, 764);
      this.buttons.push({ x: 38, y: 746, w: 299, h: 36, id: "leaderboardClear", action: "leaderboardClear" });
    }
  };

})(window);
