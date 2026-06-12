(function (global) {
  "use strict";

  var cleanup = null;

  function getCapabilities() {
    var mobileLike = (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in global;
    return {
      motion: mobileLike && typeof global.DeviceMotionEvent !== "undefined",
      orientation: mobileLike && typeof global.DeviceOrientationEvent !== "undefined",
      mobileLike: mobileLike,
      needsPermission:
        typeof global.DeviceMotionEvent !== "undefined" &&
        typeof global.DeviceMotionEvent.requestPermission === "function",
    };
  }

  async function requestPermission() {
    var capabilities = getCapabilities();
    if (!capabilities.motion && !capabilities.orientation) {
      return { supported: false, granted: false, reason: "unsupported" };
    }

    try {
      if (capabilities.needsPermission) {
        var motionState = await global.DeviceMotionEvent.requestPermission();
        if (motionState !== "granted") {
          return { supported: true, granted: false, reason: "denied" };
        }
      }

      if (
        typeof global.DeviceOrientationEvent !== "undefined" &&
        typeof global.DeviceOrientationEvent.requestPermission === "function"
      ) {
        var orientationState = await global.DeviceOrientationEvent.requestPermission();
        if (orientationState !== "granted") {
          return { supported: true, granted: false, reason: "denied" };
        }
      }

      return { supported: true, granted: true };
    } catch (_) {
      return { supported: true, granted: false, reason: "error" };
    }
  }

  function stop() {
    if (cleanup) cleanup();
    cleanup = null;
  }

  function start(onAction) {
    stop();
    var lastShakeAt = 0;
    var lastActionAt = 0;

    function emit(action) {
      var now = Date.now();
      if (now - lastActionAt < 450) return;
      lastActionAt = now;
      onAction(action);
    }

    function onMotion(event) {
      var acceleration = event.accelerationIncludingGravity || event.acceleration;
      if (!acceleration) return;
      var x = Number(acceleration.x) || 0;
      var y = Number(acceleration.y) || 0;
      var z = Number(acceleration.z) || 0;
      var magnitude = Math.sqrt(x * x + y * y + z * z);
      if (magnitude > 18 && Date.now() - lastShakeAt > 700) {
        lastShakeAt = Date.now();
        emit("shake");
      }
    }

    function onOrientation(event) {
      var gamma = Number(event.gamma) || 0;
      var beta = Number(event.beta) || 0;
      if (gamma > 24) emit("tilt_right");
      else if (gamma < -24) emit("tilt_left");
      else if (beta > 42) emit("tilt_forward");
      else if (beta < -12) emit("tilt_back");
    }

    global.addEventListener("devicemotion", onMotion);
    global.addEventListener("deviceorientation", onOrientation);
    cleanup = function () {
      global.removeEventListener("devicemotion", onMotion);
      global.removeEventListener("deviceorientation", onOrientation);
    };
    return stop;
  }

  global.MotionSupport = {
    getCapabilities: getCapabilities,
    requestPermission: requestPermission,
    start: start,
    stop: stop,
  };
})(window);
