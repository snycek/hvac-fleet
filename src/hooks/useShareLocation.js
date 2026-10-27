import { useEffect, useRef, useState } from 'react';

const SEND_EVERY_MS = 10000;

/**
 * While the foreman has My Cuts open, send their phone's GPS to the server
 * so the owner's map shows the truck moving.
 * Returns 'live' | 'waiting' | 'denied' | 'unsupported'.
 */
export function useShareLocation(techId, sendLocation) {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext !== false;
  const [status, setStatus] = useState(supported ? 'waiting' : 'unsupported');
  const lastSent = useRef(0);
  const send = useRef(sendLocation);
  useEffect(() => { send.current = sendLocation; }, [sendLocation]);

  useEffect(() => {
    if (!supported || !techId) return undefined;
    lastSent.current = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus('live');
        const now = Date.now();
        if (now - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = now;
        send.current?.(techId, { lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'waiting'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [techId, supported]);

  return status;
}
