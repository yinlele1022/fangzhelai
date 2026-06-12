(function (global) {
  "use strict";

  function play(options) {
    options = options || {};
    var overlay = document.getElementById("introOverlay");
    var shell = document.getElementById("gameShell");
    var startButton = document.getElementById("introStart");
    var canvas = options.canvas || document.getElementById("gameCanvas");
    var onComplete = typeof options.onComplete === "function"
      ? options.onComplete
      : function () {};
    var finished = false;
    var connecting = false;
    var timeline = null;
    var connectionTimeline = null;
    var warningTween = null;
    var connectionFallbackTimer = null;

    function startIntroMusic() {
      if (!global.AudioManager) return;
      global.AudioManager.playBGM("theme", {
        volume: 0.22,
        fadeInMs: 80,
        fadeOutMs: 100
      });
      global.AudioManager.unlock();
    }

    if (!overlay) {
      if (shell) shell.classList.remove("is-intro-pending");
      onComplete();
      return null;
    }

    function finish() {
      if (finished) return;
      finished = true;
      document.removeEventListener("keydown", onKeyDown);
      if (timeline) timeline.kill();
      if (connectionTimeline) connectionTimeline.kill();
      if (warningTween) warningTween.kill();
      if (connectionFallbackTimer) global.clearTimeout(connectionFallbackTimer);

      if (global.gsap) {
        global.gsap.to(overlay, {
          autoAlpha: 0,
          duration: 0.28,
          ease: "power2.out",
          onComplete: revealGame
        });
      } else {
        revealGame();
      }
    }

    function revealGame() {
      overlay.hidden = true;
      if (shell) shell.classList.remove("is-intro-pending");
      if (canvas && global.gsap) {
        global.gsap.fromTo(canvas,
          { autoAlpha: 0, scale: 0.985 },
          { autoAlpha: 1, scale: 1, duration: 0.38, ease: "power2.out", clearProps: "transform" }
        );
      } else if (canvas) {
        canvas.style.opacity = "1";
        canvas.style.transform = "none";
      }
      if (canvas) canvas.focus();
      if (global.AudioManager) global.AudioManager.setBGVolume(0.22);
      onComplete();
    }

    function beginConnection() {
      if (finished || connecting) return;
      connecting = true;
      startIntroMusic();
      connectionFallbackTimer = global.setTimeout(finish, 2200);

      if (startButton) {
        startButton.disabled = true;
        startButton.textContent = "神经接通中...";
      }
      if (warningTween) {
        warningTween.kill();
        warningTween = null;
      }

      if (!global.gsap) {
        global.setTimeout(finish, 1400);
        return;
      }

      connectionTimeline = global.gsap.timeline({
        defaults: { ease: "power2.inOut" },
        onComplete: finish
      });
      connectionTimeline
        .to(".intro-progress span", { scaleX: 1, duration: 1.4, ease: "none" }, 0)
        .to(".intro-alert", {
          scale: 1.025,
          boxShadow: "0 0 0 1px rgba(255,255,255,0.12) inset, 0 0 76px rgba(255,0,0,0.34)",
          duration: 0.72
        }, 0)
        .to(".intro-warning", {
          scale: 1.16,
          rotation: 0,
          duration: 0.72
        }, 0)
        .to(".intro-alert", { scale: 1, duration: 0.68 }, 0.72)
        .to(".intro-warning", { scale: 1, duration: 0.68 }, 0.72);
    }

    function onKeyDown(event) {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        beginConnection();
      }
    }

    if (startButton) startButton.addEventListener("click", beginConnection, { once: true });
    document.addEventListener("keydown", onKeyDown);

    if (!global.gsap) {
      return { finish: beginConnection };
    }

    var reduceMotion = global.matchMedia &&
      global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      global.gsap.set(".intro-alert, .intro-warning, .intro-copy > *, .intro-start", {
        autoAlpha: 1,
        clearProps: "transform"
      });
      global.gsap.to(".intro-progress span", {
        scaleX: 0.35,
        duration: 0.45,
        ease: "none"
      });
      return { finish: beginConnection };
    }

    global.gsap.set(".intro-alert", { scale: 0.92 });
    global.gsap.set(".intro-warning", { y: -18, scale: 0.55, rotation: -8 });
    global.gsap.set(".intro-alert h1, .intro-copy > *, .intro-start, .intro-code", {
      y: 12
    });

    timeline = global.gsap.timeline({
      defaults: { ease: "power3.out" }
    });
    timeline
      .to(".intro-alert", { autoAlpha: 1, scale: 1, duration: 0.34 }, 0.08)
      .to(".intro-warning", {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        rotation: 0,
        duration: 0.34,
        ease: "back.out(2.4)"
      }, 0.22)
      .to(".intro-alert h1", { autoAlpha: 1, y: 0, duration: 0.32 }, 0.48)
      .to(".intro-copy > *", {
        autoAlpha: 1,
        y: 0,
        duration: 0.3,
        stagger: 0.12
      }, 0.72)
      .to(".intro-start", { autoAlpha: 1, y: 0, duration: 0.28 }, 1.18)
      .to(".intro-code", { autoAlpha: 1, y: 0, duration: 0.22 }, 1.28)
      .to(".intro-progress span", { scaleX: 0.35, duration: 1.2, ease: "none" }, 0.18)
      .to(".intro-alert", { scale: 1.01, duration: 0.18, ease: "power1.inOut" }, 1.54)
      .to(".intro-alert", { scale: 1, duration: 0.18, ease: "power1.inOut" });

    warningTween = global.gsap.to(".intro-warning", {
      x: 2,
      y: -2,
      rotation: 2.4,
      duration: 0.065,
      repeat: -1,
      yoyo: true,
      ease: "none",
      delay: 0.62
    });

    return { finish: beginConnection };
  }

  global.IntroAnimation = { play: play };
})(window);
