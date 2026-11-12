'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Deliberately avoid logging errors: they may contain sensitive runtime context.
    void error;
  }, [error]);

  return <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 24,
    background: '#0e1621', color: '#f5f5f5', textAlign: 'center' }}>
    <div style={{ maxWidth: 350 }}>
      <div style={{ fontSize: 32, marginBottom: 15, color: '#9fbfdf' }}>✦</div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>PXL lost its connection.</h1>
      <p style={{ color: '#9baebe', lineHeight: 1.65, fontSize: 14 }}>Something unexpected happened. Any temporary chat content is not restored.</p>
      <button type="button" onClick={reset} style={{ marginTop: 17, border: 0, borderRadius: 10, background: '#5288c1', color: 'white', padding: '12px 22px', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <RefreshCw size={16}/> Try again
      </button>
    </div>
  </main>;
}
