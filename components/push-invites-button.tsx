'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';

type PushStatus = 'checking' | 'off' | 'on' | 'blocked' | 'unsupported' | 'working';

type ServerResponse = { publicKey: string };

function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const raw = atob((base64url + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const result = await fetch('/api/push/subscription', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() })
  });
  if (!result.ok) throw new Error('Unable to register notifications.');
}

export default function PushInvitesButton() {
  const [status, setStatus] = useState<PushStatus>('checking');
  const [hint, setHint] = useState('');

  useEffect(() => {
    let live = true;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) ||
        !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported'); return;
    }
    if (Notification.permission === 'denied') { setStatus('blocked'); return; }
    if (Notification.permission !== 'granted') { setStatus('off'); return; }
    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      if (!live) return;
      if (!existing) { setStatus('off'); return; }
      // An existing opt-in can move to the newly logged-in character on this device.
      try { await registerSubscription(existing); if (live) setStatus('on'); }
      catch { if (live) { setStatus('off'); setHint('Could not connect alerts. Tap to retry.'); } }
    }).catch(() => { if (live) setStatus('unsupported'); });
    return () => { live = false; };
  }, []);

  const toggle = useCallback(async () => {
    if (status === 'working') return;
    if (status === 'unsupported') { setHint('On iPhone, install PXL to Home Screen first. Otherwise use a push-capable browser.'); return; }
    if (status === 'blocked') { setHint('Allow PXL notifications in your device/browser settings.'); return; }
    // Begin permission request from the direct click gesture, before awaiting other work.
    const permissionPromise = status === 'off' && Notification.permission === 'default'
      ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    setStatus('working'); setHint('');
    try {
      const permission = await permissionPromise;
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      const existing = await reg.pushManager.getSubscription();
      if (status === 'on') {
        if (existing) {
          const response = await fetch('/api/push/subscription', {
            method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: existing.toJSON() })
          });
          if (!response.ok) throw new Error('Could not disable alerts.');
          await existing.unsubscribe();
        }
        setStatus('off'); setHint('Invitations disabled on this device.');
      } else {
        const subscription = existing ?? await (async () => {
          const response = await fetch('/api/push/vapid', { cache: 'no-store' });
          if (!response.ok) throw new Error('Notifications are not configured yet.');
          const { publicKey } = await response.json() as ServerResponse;
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
        })();
        await registerSubscription(subscription);
        setStatus('on'); setHint('PXL invites enabled on this device.');
      }
    } catch (error) {
      setStatus('off');
      setHint(error instanceof Error ? error.message : 'Could not update notifications.');
    }
  }, [status]);

  if (status === 'checking') return null;
  return <div className="push-control">
    <button type="button" className="push-toggle" disabled={status === 'working'}
      onClick={toggle} title={status === 'on' ? 'Turn off game invites' : 'Allow game invites on this device'}
      aria-label={status === 'on' ? 'Disable game invitations' : 'Enable game invitations'}>
      {status === 'on' ? <Bell size={16} /> : <BellOff size={16} />}
      <span>{status === 'on' ? 'INVITES ON' : status === 'working' ? 'SETTING UP…' : 'ENABLE INVITES'}</span>
    </button>
    {hint && <span className="push-hint" role="status">{hint}</span>}
  </div>;
}
