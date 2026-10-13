import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import prefixSelector from 'postcss-prefix-selector';

/* Iron Terminal(헬스 탭, React)의 CSS 는 전역 셀렉터(:root/html/body/button/input/*)를 쓴다.
   그대로 두면 루틴 화면의 버튼·입력·토큰을 덮으므로 src/iron/ 아래 CSS 만 .iron-root 로 접두사 처리.
   :root/html/body 는 컨테이너 자신(.iron-root)으로 바꿔 토큰·폰트·배경이 그 안에서만 산다. */
const ironScope = prefixSelector({
  prefix: '.iron-root',
  includeFiles: [/src\/iron\//],
  transform(prefix, selector, prefixedSelector) {
    const s = selector.trim();
    if (s === ':root' || s === 'html' || s === 'body') return prefix;
    return prefixedSelector;
  }
});

export default defineConfig({
  base: '/h2-routine/',
  css: { postcss: { plugins: [ironScope] } },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'H2 강제 루틴',
        short_name: 'H2 루틴',
        description: 'H2 강제 루틴 트래커 — 지덕체',
        lang: 'ko',
        display: 'standalone',
        theme_color: '#0F1317',
        background_color: '#0F1317',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        /* 한글 폰트는 unicode-range 서브셋이 수백 개라 프리캐시 대신 런타임 캐시 —
           첫 렌더에 쓰인 서브셋부터 캐시되므로 평소 쓰는 화면은 오프라인에서 폰트까지 동일 */
        runtimeCaching: [
          {
            urlPattern: /\.woff2?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ]
});
