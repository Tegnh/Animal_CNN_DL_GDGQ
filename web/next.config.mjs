import { readFileSync } from 'node:fs';

// The wasm runtime is fetched from jsDelivr at exactly the installed version.
const ortVersion = JSON.parse(
  readFileSync(new URL('./node_modules/onnxruntime-web/package.json', import.meta.url), 'utf8'),
).version;

// `next dev` refuses /_next requests (including the HMR socket the client waits for)
// from any host except localhost, which leaves a page opened from a phone on the LAN
// rendered but dead. These private ranges are allowed so a phone can test the dev server.
// Dev only: the static export ignores this. Extra hosts: ALLOWED_DEV_ORIGINS=a.b.c.d,host.local
const allowedDevOrigins = [
  '192.168.*.*',
  '10.*.*.*',
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
  '*.local',
  ...(process.env.ALLOWED_DEV_ORIGINS ?? '').split(',').map((host) => host.trim()).filter(Boolean),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  allowedDevOrigins,
  env: { NEXT_PUBLIC_ORT_VERSION: ortVersion },
};

export default nextConfig;
