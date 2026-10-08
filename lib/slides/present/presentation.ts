// One running slideshow's hold on the device (slides.md §9): full screen (or the Capacitor status bar), the screen
// wake lock, and how full screen is left. The presenter overlay owns one per show.
//
// start() runs from the overlay's mount effect, so it still has the click's user activation. Teardown waits one
// task: StrictMode unmounts and remounts effects at once, and a hidden <Activity> (a background browser-shell tab)
// runs the cleanups without unmounting. A start() in the same task cancels the teardown; otherwise the show ends
// (the overlay then reports its exit), since a slideshow must not keep a hidden tab full screen.
//
// A session made with `elementFullscreen: false` never enters element full screen, neither at start nor on F or the
// control bar (the /store tablet, whose about-to-log-out dimmer must stay drawable over the show).
import {
  canUseElementFullscreen, enterPresentation, exitElementFullscreen, exitPresentation, fullscreenElementOf, holdWakeLock,
  requestElementFullscreen, type FullscreenMode,
} from "@/lib/slides/present/fullscreen";

export interface PresentationSessionOptions {
  /** False: the show stays the overlay (default true: element full screen where the device allows it). */
  elementFullscreen?: boolean;
}

export class PresentationSession {
  mode: FullscreenMode = "overlay";
  private active = false;
  private starting: Promise<FullscreenMode> | null = null;
  private releaseWake: (() => void) | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  /** Full screen is being left with F or the button: not a reason to end the show. */
  private leavingOnPurpose = false;
  private readonly elementFullscreen: boolean;

  constructor(private readonly onMode: (mode: FullscreenMode) => void, opts: PresentationSessionOptions = {}) {
    this.elementFullscreen = opts.elementFullscreen !== false;
  }

  get running(): boolean {
    return this.active;
  }

  /** Whether F and the control bar can put `el` in element full screen in this session. */
  canFullscreen(el: HTMLElement): boolean {
    return this.elementFullscreen && canUseElementFullscreen(el);
  }

  /** Enters full screen (when `fullscreen`) and keeps the screen awake. A second call while running does nothing. */
  start(el: HTMLElement, fullscreen: boolean): void {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.active) return;
    this.active = true;
    const starting = fullscreen ? enterPresentation(el, { element: this.elementFullscreen }) : Promise.resolve<FullscreenMode>("overlay");
    this.starting = starting;
    void starting.then((mode) => {
      if (this.starting !== starting) return;
      this.mode = mode;
      this.onMode(mode);
    });
    void holdWakeLock().then((release) => {
      if (this.active && this.releaseWake === null) this.releaseWake = release;
      else release();
    });
  }

  /** Stops on the next task unless start() runs again first; `then` runs after the stop. */
  stopSoon(then: () => void): void {
    if (!this.active || this.stopTimer !== null) return;
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      this.stop();
      then();
    }, 0);
  }

  /** Leaves full screen (or shows the status bar again) and lets the screen sleep. */
  stop(): void {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (!this.active) return;
    this.active = false;
    this.releaseWake?.();
    this.releaseWake = null;
    const starting = this.starting ?? Promise.resolve(this.mode);
    this.starting = null;
    void starting.then((mode) => exitPresentation(mode));
  }

  /** In or out of element full screen (F, the control bar); resolves the new mode. Only out when it is ruled out. */
  async toggleFullscreen(el: HTMLElement): Promise<FullscreenMode> {
    const doc = el.ownerDocument;
    if (fullscreenElementOf(doc)) {
      this.leavingOnPurpose = true;
      await exitElementFullscreen(doc);
      this.mode = "overlay";
    } else if (this.elementFullscreen && (await requestElementFullscreen(el))) {
      this.mode = "element";
    }
    this.onMode(this.mode);
    return this.mode;
  }

  /** On a fullscreenchange: true when the show should end (the browser left full screen itself, e.g. on Esc). */
  fullscreenChanged(doc: Document): boolean {
    if (fullscreenElementOf(doc) !== null) {
      this.mode = "element";
      this.onMode("element");
      return false;
    }
    const wasElement = this.mode === "element";
    const onPurpose = this.leavingOnPurpose;
    this.leavingOnPurpose = false;
    this.mode = "overlay";
    this.onMode("overlay");
    return this.active && wasElement && !onPurpose;
  }
}
