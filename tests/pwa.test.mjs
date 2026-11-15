import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const file = (path) => readFileSync(new URL(path, root), 'utf8');

function pngSize(path) {
  const data = readFileSync(new URL(path, root));
  assert.equal(data.subarray(1, 4).toString(), 'PNG');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

test('PXL manifest has standalone identity and install assets', () => {
  const manifest = file('app/manifest.ts');
  assert.match(manifest, /short_name:\s*'PXL'/);
  assert.match(manifest, /display:\s*'standalone'/);
  assert.match(manifest, /start_url:\s*'\/'/);
  assert.match(manifest, /icon-maskable-512\.png/);
  assert.deepEqual(pngSize('public/icons/icon-192.png'), [192, 192]);
  assert.deepEqual(pngSize('public/icons/icon-512.png'), [512, 512]);
  assert.deepEqual(pngSize('public/icons/icon-maskable-512.png'), [512, 512]);
  assert.deepEqual(pngSize('public/icons/apple-touch-icon.png'), [180, 180]);
});

test('PWA service worker never caches application content or intercepts fetch', () => {
  const sw = file('public/sw.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(sw, /addEventListener\('install'/);
  assert.match(sw, /addEventListener\('activate'/);
  assert.doesNotMatch(sw, /caches\.|cache\.put|addEventListener\('fetch'|pushManager|indexedDB|localStorage|sessionStorage|addEventListener\(['\"]sync['\"]/i);
});

test('PWA registration survives login and PXL branding replaces original title', () => {
  assert.match(file('app/layout.tsx'), /PwaProvider/);
  assert.match(file('components/pwa-install-button.tsx'), /serviceWorker\.register\('\/sw\.js'/);
  assert.match(file('components/pwa-install-button.tsx'), /beforeinstallprompt/);
  assert.match(file('components/pwa-install-button.tsx'), /Add to Home Screen/);
  assert.match(file('app/layout.tsx'), /PXL — Character Collection/);
  assert.match(file('components/collection-app.tsx'), /INSTALL PXL|PwaInstallButton/);
  assert.match(file('next.config.ts'), /source: '\/sw\.js'/);
});
