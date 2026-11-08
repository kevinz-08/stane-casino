'use client';

import { type AnimationSpeed, useSettingsStore } from '@/stores/settings.store';

const SPEEDS: Array<{ value: AnimationSpeed; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Rápida' },
  { value: 'instant', label: 'Sin animación' },
];

/** Sound, animation speed and dealer visibility (saved in this browser). */
export function SettingsBar() {
  const { sound, volume, speed, showDealer, update } = useSettingsStore();

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-cream/80">
      <button
        type="button"
        onClick={() => update({ sound: !sound })}
        className="rounded-full bg-white/10 px-3 py-1.5 hover:bg-white/20"
        aria-pressed={sound}
        title={sound ? 'Silenciar' : 'Activar sonido'}
      >
        {sound ? '🔊 Sonido' : '🔇 Silencio'}
      </button>
      {sound && (
        <label className="hidden items-center gap-1 sm:flex">
          <span className="sr-only">Volumen</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => update({ volume: Number(e.target.value) })}
            className="w-20 accent-brass"
          />
        </label>
      )}
      <label className="flex items-center gap-1">
        <span>Velocidad</span>
        <select
          value={speed}
          onChange={(e) => update({ speed: e.target.value as AnimationSpeed })}
          className="rounded bg-white/10 px-2 py-1"
        >
          {SPEEDS.map((s) => (
            <option key={s.value} value={s.value} className="bg-slate-900">
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={showDealer}
          onChange={(e) => update({ showDealer: e.target.checked })}
          className="accent-brass"
        />
        Crupier
      </label>
    </div>
  );
}
