(function (global) {
  "use strict";

  function showBootFailure(message) {
    var shell = document.getElementById("gameShell");
    var overlay = document.getElementById("introOverlay");
    var heading = overlay && overlay.querySelector("h1");
    var copy = overlay && overlay.querySelector(".intro-copy");
    var startButton = document.getElementById("introStart");
    if (shell) shell.classList.remove("is-intro-pending");
    if (overlay) overlay.hidden = false;
    if (heading) heading.textContent = "启动失败";
    if (copy) copy.innerHTML = "<p>" + message + "</p><strong>请检查网络后重新加载。</strong>";
    if (startButton) {
      startButton.disabled = false;
      startButton.textContent = "重新加载";
      startButton.onclick = function () { global.location.reload(); };
    }
  }

  function boot() {
    if (typeof global.QuestionBank === "undefined") {
      console.error("[反着来] QuestionBank 未加载");
      showBootFailure("题库没有成功加载。");
      return;
    }
    if (typeof global.OppositeGame !== "function") {
      console.error("[反着来] 游戏引擎未加载");
      showBootFailure("游戏引擎没有成功加载。");
      return;
    }

    var game;
    try {
      game = new global.OppositeGame();
    } catch (error) {
      console.error("[反着来] 启动失败", error);
      showBootFailure("当前浏览器未能完成初始化。");
      return;
    }
    if (!game.canvas || !game.ctx) {
      showBootFailure("当前浏览器无法创建游戏画面。");
      return;
    }
    global.game = game;
    if (typeof global.io !== "undefined") {
      game.initSocket();
    } else {
      console.warn("[反着来] Socket.IO 客户端未加载，在线 PK 不可用");
    }
    if (global.IntroAnimation) {
      global.IntroAnimation.play({ canvas: game.canvas });
    } else {
      var shell = document.getElementById("gameShell");
      if (shell) shell.classList.remove("is-intro-pending");
    }

    global.addEventListener("pageshow", function () {
      game.resize();
      game.render();
      if (global.AudioManager) global.AudioManager.unlock();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
