import { useSyncExternalStore } from 'react';

// Phone-sized screen (the Owner Hub switches to its bottom-tab layout).
const QUERY = '(max-width: 760px)';
const subscribe = cb => {
  const m = window.matchMedia(QUERY);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
export const useIsPhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
