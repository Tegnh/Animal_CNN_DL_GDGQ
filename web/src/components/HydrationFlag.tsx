'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __omqHydrated?: boolean;
  }
}

/** Proof that React hydrated: the inline debug script waits for this flag. */
export function HydrationFlag() {
  useEffect(() => {
    window.__omqHydrated = true;
    document.documentElement.setAttribute('data-hydrated', 'true');
    window.dispatchEvent(new Event('omq-hydrated'));
  }, []);
  return null;
}
