import React, { useEffect, useState } from 'react';

type BIPEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function PWAInstall() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [open, setOpen] = useState(false);

  const isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as any).standalone === true;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setOpen(true);
    };
    const onInstalled = () => setOpen(false);

    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isStandalone) return null; // already installed

  if (isIOS) {
    return (
      <div className="install-banner">
        <span>Install: tap Share ▸ “Add to Home Screen”.</span>
        <style>{bannerCss}</style>
      </div>
    );
  }

  if (!open || !deferred) return null;

  return (
    <div className="install-banner">
      <span>Install Salon Booking?</span>
      <div className="actions">
        <button
          onClick={async () => {
            setOpen(false);
            deferred.prompt();
            try { await deferred.userChoice; } finally { setDeferred(null); }
          }}
        >
          Install
        </button>
        <button onClick={() => setOpen(false)}>Not now</button>
      </div>
      <style>{bannerCss}</style>
    </div>
  );
}

const bannerCss = `
.install-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:9999;background:#111827;color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.2);display:flex;gap:12px;align-items:center}
.actions button{margin-left:8px;padding:6px 10px;border-radius:8px;border:none;cursor:pointer}
.actions button:first-of-type{background:#10b981;color:#0b1b13}
`;
