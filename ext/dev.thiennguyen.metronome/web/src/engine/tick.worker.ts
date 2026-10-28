// The scheduler's heartbeat, off the page's main thread: a timer here keeps
// its 25 ms while the page is busy drawing, and is throttled less than the
// page's own when Settings sits behind another app. It only says "look
// ahead now"; every note is still placed on the AudioContext's clock.
let timer: ReturnType<typeof setInterval> | undefined;

self.onmessage = (event: MessageEvent<"start" | "stop">) => {
  if (timer !== undefined) clearInterval(timer);
  timer = event.data === "start" ? setInterval(() => self.postMessage("tick"), 25) : undefined;
};
