'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, MonitorDown, X } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type InstallContextValue = {
  installEvent: InstallPromptEvent | null;
  clearInstallEvent: () => void;
  installed: boolean;
  ios: boolean;
};
const PwaContext = createContext<InstallContextValue | null>(null);

function installedOnDevice(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

// Runs on the login screen as well as the gallery, so install prompts are not lost during login.
export function PwaProvider({ children }: { children: ReactNode }) {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => { /* Still usable as a normal website if registration fails. */ });
    }
    setInstalled(installedOnDevice());
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return <PwaContext.Provider value={{ installEvent, clearInstallEvent: () => setInstallEvent(null), installed, ios }}>
    {children}
  </PwaContext.Provider>;
}

export default function PwaInstallButton() {
  const install = useContext(PwaContext);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!install || install.installed) return null;

  const handleInstall = async () => {
    if (!install.installEvent) { setHelpOpen((open) => !open); return; }
    setBusy(true);
    try {
      await install.installEvent.prompt();
      const result = await install.installEvent.userChoice;
      if (result.outcome === 'accepted') setHelpOpen(false);
      install.clearInstallEvent();
    } catch { setHelpOpen(true); }
    finally { setBusy(false); }
  };

  return <div className="pwa-install-wrap">
    <button className="pwa-install-button" type="button" onClick={handleInstall}
      aria-label="Install PXL" title="Install PXL" disabled={busy}>
      <Download size={16} /><span>INSTALL PXL</span>
    </button>
    {helpOpen && <div className="pwa-install-help" role="dialog" aria-label="Install instructions">
      <button type="button" className="pwa-install-close" onClick={() => setHelpOpen(false)} aria-label="Close install instructions"><X size={16}/></button>
      <MonitorDown size={18}/>
      <strong>Add PXL to your device</strong>
      <p>{install.ios
        ? 'Open PXL in Safari, tap Share, choose Add to Home Screen, then confirm Add.'
        : 'In your browser menu, select Install PXL or Add to Home Screen. You need HTTPS, or localhost for testing.'}</p>
      <small>Internet is required for login, presence and chat. Messages are not cached for offline use.</small>
    </div>}
  </div>;
}
