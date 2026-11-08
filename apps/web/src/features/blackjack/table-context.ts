'use client';

import { createContext, type RefObject, useContext } from 'react';

/** Anchors on the table that animations fly from or to. */
export interface TableAnchors {
  shoe: RefObject<HTMLDivElement | null>;
  dealerTray: RefObject<HTMLDivElement | null>;
  /** 1 = normal speed, 0.45 = fast, 0 = no animation. */
  speed: number;
}

export const TableContext = createContext<TableAnchors | null>(null);

export function useTable(): TableAnchors {
  const value = useContext(TableContext);
  if (!value) throw new Error('useTable must be used inside <TableContext.Provider>');
  return value;
}

/** Offset (px) from an element's centre to an anchor's centre. */
export function offsetTo(el: Element, anchor: Element | null | undefined) {
  if (!anchor) return { x: 0, y: -240 };
  const a = anchor.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return {
    x: a.left + a.width / 2 - (b.left + b.width / 2),
    y: a.top + a.height / 2 - (b.top + b.height / 2),
  };
}
