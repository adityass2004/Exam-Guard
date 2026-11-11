// Web Worker for accurate, off-main-thread ticks unthrottled by background tab inactive status

let timerId: ReturnType<typeof setInterval> | null = null;
let currentIntervalMs = 1500;

function sendTick() {
  self.postMessage({ type: 'TICK', timestamp: Date.now() });
}

self.onmessage = (e: MessageEvent) => {
  const { type, intervalMs } = e.data || {};

  if (type === 'START') {
    if (typeof intervalMs === 'number' && intervalMs > 0) {
      currentIntervalMs = intervalMs;
    }
    if (timerId !== null) {
      clearInterval(timerId);
    }
    timerId = setInterval(sendTick, currentIntervalMs);
  } else if (type === 'UPDATE_INTERVAL') {
    if (typeof intervalMs === 'number' && intervalMs > 0 && intervalMs !== currentIntervalMs) {
      currentIntervalMs = intervalMs;
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = setInterval(sendTick, currentIntervalMs);
      }
    }
  } else if (type === 'STOP') {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }
};

