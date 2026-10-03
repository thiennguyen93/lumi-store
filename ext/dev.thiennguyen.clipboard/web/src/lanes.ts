// How the page spends the extension's runs.
//
// Lumi lets one extension run four things at once and refuses a fifth, so a
// page that starts work faster than the extension finishes it ends up
// refusing itself — and the refusal lands on whichever request was fifth,
// which may be the paste somebody just pressed. The work that is *not* a
// person's press (reading the unread images, finding the words on the
// picture being shown) therefore goes through lanes that keep it to one run
// at a time, and the background lane steps aside while a person's own
// request is in flight. What is left is three runs for what the person
// does, however busy the background is.
//
// No DOM in here, so `node --test` can reach it.

/** Requests the person made, counted so background work can wait them out. */
export class Foreground {
  private count = 0;
  private waiting: Array<() => void> = [];

  enter(): void {
    this.count++;
  }

  leave(): void {
    this.count = Math.max(0, this.count - 1);
    if (this.count === 0) {
      const going = this.waiting;
      this.waiting = [];
      for (const wake of going) wake();
    }
  }

  get busy(): boolean {
    return this.count > 0;
  }

  /** Resolves when nothing the person asked is running — or after `most`
   *  milliseconds regardless, so a request that sits at the extension's
   *  whole budget cannot starve background work for good. */
  idle(most: number): Promise<void> {
    if (this.count === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.waiting = this.waiting.filter((one) => one !== wake);
        resolve();
      }, most);
      this.waiting.push(wake);
    });
  }
}

/** One task at a time, in the order they came. A failure ends that task and
 *  not the lane. */
export function serial(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.then(
      () => {},
      () => {},
    );
    return run;
  };
}

/** Thrown to a task that was replaced by a newer one before it started. */
export class Superseded extends Error {
  constructor() {
    super("superseded");
  }
}

/** One task at a time, and only the newest waits: a task still queued when
 *  another arrives is dropped with `Superseded`. For asking about whatever
 *  is on screen, where an answer about the row that was selected a moment
 *  ago is worth nothing, and the extension need not be asked it. */
export function newest(): <T>(task: () => Promise<T>) => Promise<T> {
  const lane = serial();
  let latest = 0;
  return (task) => {
    const mine = ++latest;
    return lane(async () => {
      if (mine !== latest) throw new Superseded();
      return task();
    });
  };
}

/** Whether Lumi refused a request because the extension was full — HTTP 503
 *  from the bridge, which is what that refusal is and nothing else is. */
export function isBusy(status: number): boolean {
  return status === 503;
}

/** How long to wait before retry number `attempt` (0-based) of a refused
 *  request, or `null` when it has had its turn. About a second in all: a
 *  press that runs later than that is not the press anybody made. */
export function backoff(attempt: number): number | null {
  return attempt < 3 ? 150 * 2 ** attempt : null;
}
