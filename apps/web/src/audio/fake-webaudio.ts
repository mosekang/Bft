/**
 * Minimal Web Audio fakes for unit tests (jsdom has no Web Audio). Test-only:
 * nothing in the app imports this. Mirrors the validation real browsers do
 * that matters here (exponential ramps must target positive values).
 */

export class FakeParam {
  value = 0;
  /** Last value set via setTargetAtTime / setValueAtTime / ramps. */
  target: number | undefined;
  private check(v: number, t: number): void {
    if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) throw new RangeError(`bad automation ${v}@${t}`);
    this.target = v;
  }
  setValueAtTime(v: number, t: number): this {
    this.check(v, t);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.check(v, t);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    if (!(v > 0)) throw new RangeError(`exponential ramp to ${v}`);
    this.check(v, t);
    return this;
  }
  setTargetAtTime(v: number, t: number, c: number): this {
    if (!(c > 0)) throw new RangeError("time constant");
    this.check(v, t);
    return this;
  }
}

export class FakeNode {
  connections: FakeNode[] = [];
  connect<T>(n: T): T {
    this.connections.push(n as unknown as FakeNode);
    return n;
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeScheduled extends FakeNode {
  startedAt: number | undefined;
  start(t = 0): void {
    if (t < 0) throw new RangeError("start");
    this.startedAt = t;
  }
  stop(t = 0): void {
    if (t < 0) throw new RangeError("stop");
  }
}

class FakeOsc extends FakeScheduled {
  type = "sine";
  frequency = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = "lowpass";
  Q = new FakeParam();
  frequency = new FakeParam();
}

export class FakeBuffer {
  private data: Float32Array;
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeSource extends FakeScheduled {
  buffer: FakeBuffer | null = null;
  loop = false;
  playbackRate = new FakeParam();
  constructor(private readonly onStart: (s: FakeSource) => void) {
    super();
  }
  override start(t = 0): void {
    super.start(t);
    this.onStart(this);
  }
}

class FakeBaseContext {
  currentTime = 0;
  destination = new FakeNode();
  started: FakeSource[] = [];
  constructor(readonly sampleRate: number) {}
  createGain(): FakeGain {
    return new FakeGain();
  }
  createOscillator(): FakeOsc {
    return new FakeOsc();
  }
  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }
  createBuffer(ch: number, length: number, sr: number): FakeBuffer {
    if (length < 1) throw new RangeError("buffer length");
    return new FakeBuffer(ch, length, sr);
  }
  createBufferSource(): FakeSource {
    return new FakeSource((s) => this.started.push(s));
  }
  createStereoPanner(): FakeNode & { pan: FakeParam } {
    return Object.assign(new FakeNode(), { pan: new FakeParam() });
  }
}

/** Offline fake: "renders" a buffer holding a loud constant so peak limiting is exercised. */
export class FakeOfflineAudioContext extends FakeBaseContext {
  oncomplete: ((e: { renderedBuffer: FakeBuffer }) => void) | null = null;
  constructor(
    ch: number,
    readonly length: number,
    sampleRate: number,
  ) {
    super(sampleRate);
  }
  startRendering(): Promise<FakeBuffer> {
    const b = new FakeBuffer(1, this.length, this.sampleRate);
    b.getChannelData().fill(1.5);
    return Promise.resolve(b);
  }
}

export class FakeAudioContext extends FakeBaseContext {
  state: "suspended" | "running" = "suspended";
  constructor() {
    super(48000);
  }
  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = "suspended";
    return Promise.resolve();
  }
}
