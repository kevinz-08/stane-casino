'use client';

import type { BlackjackEvent, BlackjackPlayerView } from '@casino/game-engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlackjackRound } from '@/lib/api';
import { playSound, vibrate } from '@/lib/sound';
import { speedFactor, useSettingsStore } from '@/stores/settings.store';
import { applyEvent, type Scene, sceneFromView, sceneSignature, settleCards } from './scene';
import { type DealerReaction, stepFor } from './timeline';

const IDLE: DealerReaction = { gesture: 'idle', mood: 'neutral', line: null };

/**
 * Plays the events of each server response as a sequence of animated steps, then makes sure
 * the table matches the server's view exactly. The server decided everything already: this
 * hook only decides WHEN each fact becomes visible.
 */
export function useEventPlayer() {
  const [scene, setScene] = useState<Scene | null>(null);
  const [dealer, setDealer] = useState<DealerReaction>(IDLE);
  const [animating, setAnimating] = useState(false);
  const [celebrations, setCelebrations] = useState(0);

  const sceneRef = useRef<Scene | null>(null);
  const queue = useRef<BlackjackEvent[]>([]);
  const target = useRef<BlackjackPlayerView | null>(null);
  const nextSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Delayed sounds of the current step (cancelled when skipping). */
  const followUps = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const clearFollowUps = () => {
    followUps.current.forEach(clearTimeout);
    followUps.current = [];
  };

  const commit = useCallback((next: Scene | null) => {
    sceneRef.current = next;
    setScene(next);
  }, []);

  /** Ends the animation on the server's version of the truth. */
  const finish = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    clearFollowUps();
    timer.current = null;
    queue.current = [];
    const view = target.current;
    if (view) {
      const authoritative = sceneFromView(view);
      const current = sceneRef.current;
      if (current && sceneSignature(current) === sceneSignature(authoritative)) {
        // Same content: keep our card identities (no re-mount), take the server's actions.
        commit({ ...settleCards(current), allowedActions: authoritative.allowedActions });
      } else {
        if (current) console.warn('[blackjack] animated scene diverged from the server view');
        commit(authoritative);
      }
      nextSeq.current = view.version;
    }
    setAnimating(false);
  }, [commit]);

  const tick = useCallback(() => {
    const event = queue.current.shift();
    if (!event) return finish();
    let after: Scene;
    try {
      after = applyEvent(sceneRef.current, event);
    } catch {
      return finish();
    }
    commit(after);
    nextSeq.current = event.seq + 1;

    const { sound, volume, speed } = useSettingsStore.getState();
    const step = stepFor(event, after);
    if (step.dealer) setDealer(step.dealer);
    const factor = speedFactor(speed);
    if (sound && step.sound) playSound(step.sound, volume);
    if (sound && step.followUp) {
      const { sound: later, afterMs } = step.followUp;
      followUps.current.push(setTimeout(() => playSound(later, volume), afterMs * factor));
    }
    if (step.vibrate) vibrate(step.vibrate);
    if (step.celebrate) setCelebrations((n) => n + 1);
    timer.current = setTimeout(tick, step.durationMs * factor);
  }, [commit, finish]);

  /**
   * Shows a server response. With its new `events`, they are animated in order; without them
   * (page load, reconnect) or with animations off, the final state appears at once.
   */
  const show = useCallback(
    (round: BlackjackRound, options: { animate?: boolean } = {}) => {
      target.current = round.view;
      const events = round.events ?? [];
      const { speed, sound, volume } = useSettingsStore.getState();
      const first = events[0];
      const pendingNext = (queue.current.at(-1)?.seq ?? nextSeq.current - 1) + 1;
      const startsNewRound = first?.type === 'ROUND_STARTED';
      const continues =
        first !== undefined && sceneRef.current !== null && first.seq <= pendingNext;

      if (!options.animate || speed === 'instant' || !(startsNewRound || continues)) {
        // No animation: show the outcome at once (instant mode still sounds and reacts).
        const last = events.at(-1);
        if (options.animate && last?.type === 'ROUND_SETTLED') {
          const step = stepFor(last, sceneFromView(round.view));
          if (sound && step.sound) playSound(step.sound, volume);
          if (step.celebrate) setCelebrations((n) => n + 1);
          if (step.dealer) setDealer(step.dealer);
        }
        sceneRef.current = null;
        return finish();
      }

      if (startsNewRound) {
        queue.current = [];
        sceneRef.current = null;
        nextSeq.current = 0;
      }
      const from = startsNewRound ? 0 : pendingNext;
      queue.current.push(...events.filter((e) => e.seq >= from));
      if (!timer.current) {
        setAnimating(true);
        tick();
      }
    },
    [finish, tick],
  );

  /** Jumps to the end of the current animation. */
  const skip = useCallback(() => {
    if (!timer.current) return;
    finish();
  }, [finish]);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queue.current = [];
    target.current = null;
    nextSeq.current = 0;
    commit(null);
    setDealer(IDLE);
    setAnimating(false);
  }, [commit]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { scene, dealer, animating, celebrations, show, skip, reset };
}
