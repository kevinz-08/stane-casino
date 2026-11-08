/**
 * Table sounds synthesised with the Web Audio API: no audio files to download or license.
 * The AudioContext is created lazily on the first sound (browsers only allow audio after a
 * user gesture, and every sound here follows a click).
 */
export type SoundName = 'deal' | 'flip' | 'chip' | 'chips' | 'win' | 'blackjack' | 'lose' | 'push';

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; // audio only, not game RNG
  return noise;
}

/** Filtered noise burst: paper sliding on felt. */
function swish(ctx: AudioContext, out: AudioNode, at: number, length: number, freq: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(freq, at);
  filter.frequency.exponentialRampToValueAtTime(freq * 0.4, at + length);
  filter.Q.value = 0.9;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.9, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(filter).connect(gain).connect(out);
  src.start(at);
  src.stop(at + length + 0.02);
}

/** Short bright tone: clay chips touching. */
function click(ctx: AudioContext, out: AudioNode, at: number, freq: number, length = 0.05) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.7, at + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

function tone(ctx: AudioContext, out: AudioNode, at: number, freq: number, length: number) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, at);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

/**
 * Creating an AudioContext can block the main thread for a few hundred ms (opening the audio
 * device). Do it while the page is idle, so the first sound never stalls an animation. It
 * starts suspended (no user gesture yet) and is resumed by the first `playSound`.
 */
export function warmUpAudio(): void {
  if (typeof window === 'undefined' || context) return;
  const create = () => {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor && !context) context = new Ctor();
    } catch {
      // no audio
    }
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(create, { timeout: 3000 });
  else setTimeout(create, 1000);
}

export function playSound(name: SoundName, volume: number): void {
  const ctx = audio();
  if (!ctx || volume <= 0) return;
  const out = ctx.createGain();
  out.gain.value = Math.min(1, volume) * 0.8;
  out.connect(ctx.destination);
  const t = ctx.currentTime + 0.005;
  switch (name) {
    case 'deal':
      swish(ctx, out, t, 0.16, 3200);
      break;
    case 'flip':
      swish(ctx, out, t, 0.08, 4500);
      click(ctx, out, t + 0.06, 900, 0.03);
      break;
    case 'chip':
      click(ctx, out, t, 2600);
      click(ctx, out, t + 0.035, 3100, 0.04);
      break;
    case 'chips':
      for (let i = 0; i < 6; i++) click(ctx, out, t + i * 0.04, 2300 + ((i * 397) % 900), 0.04);
      break;
    case 'win':
      [523, 659, 784].forEach((f, i) => tone(ctx, out, t + i * 0.09, f, 0.35));
      break;
    case 'blackjack':
      [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, t + i * 0.08, f, 0.5));
      break;
    case 'lose':
      tone(ctx, out, t, 220, 0.35);
      tone(ctx, out, t + 0.16, 174, 0.45);
      break;
    case 'push':
      tone(ctx, out, t, 440, 0.3);
      break;
  }
}

/** Short vibration on phones (ignored where unsupported). */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported
  }
}
