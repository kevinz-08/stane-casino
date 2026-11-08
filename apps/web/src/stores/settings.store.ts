import { create } from 'zustand';

/** How fast the table animates the server's events. `instant` skips animations entirely. */
export type AnimationSpeed = 'normal' | 'fast' | 'instant';

export interface Settings {
  sound: boolean;
  volume: number;
  speed: AnimationSpeed;
  /** Show the illustrated dealer (off = "clean table" mode). */
  showDealer: boolean;
}

interface SettingsState extends Settings {
  /** Loads saved settings; call once after mount (SSR renders the defaults). */
  hydrate: () => void;
  update: (patch: Partial<Settings>) => void;
}

/**
 * v2: "normal" became slower and is now the default for everyone; v1 could have stored
 * "instant" just because the OS asked for reduced motion.
 */
const STORAGE_KEY = 'casino.settings.v2';

export function defaultSettings(): Settings {
  return {
    sound: true,
    volume: 0.6,
    // Reduced motion is honoured by <MotionConfig reducedMotion="user"> (no movement, only
    // fades) while keeping the card-by-card sequence; "instant" is an explicit choice.
    speed: 'normal',
    showDealer: true,
  };
}

/** Per-viewer convenience only: storage may be unavailable (private mode), so never required. */
function load(): Settings {
  const defaults = defaultSettings();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : defaults.sound,
      volume:
        typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1
          ? parsed.volume
          : defaults.volume,
      speed: ['normal', 'fast', 'instant'].includes(parsed.speed as string)
        ? (parsed.speed as AnimationSpeed)
        : defaults.speed,
      showDealer: typeof parsed.showDealer === 'boolean' ? parsed.showDealer : defaults.showDealer,
    };
  } catch {
    return defaults;
  }
}

function save(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings just won't persist.
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  sound: true,
  volume: 0.6,
  speed: 'normal',
  showDealer: true,
  hydrate: () => set(load()),
  update: (patch) => {
    set(patch);
    const { sound, volume, speed, showDealer } = get();
    save({ sound, volume, speed, showDealer });
  },
}));

/** Multiplier applied to every animation duration. 0 = no animation. */
export function speedFactor(speed: AnimationSpeed): number {
  return speed === 'normal' ? 1 : speed === 'fast' ? 0.45 : 0;
}
