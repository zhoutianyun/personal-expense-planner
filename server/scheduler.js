const config = require("./config");

let timerId = null;

function startScheduler(runOnce) {
  if (!config.sync.enabled || typeof runOnce !== "function") {
    return;
  }
  if (timerId) {
    clearInterval(timerId);
  }
  timerId = setInterval(function () {
    runOnce().catch(function (error) {
      console.error("[scheduler] sync failed:", error.message);
    });
  }, 60 * 1000);
}

function stopScheduler() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

module.exports = {
  startScheduler,
  stopScheduler
};
