/* 앱 아이콘 생성 — 14일 캔들 스트립 모티프 (정상=빨강, 최소=황동, 미달=파랑).
   글자 없는 도형만 사용 (SVG 텍스트는 렌더 환경 폰트에 좌우되므로). */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';

const BG = '#0F1317';

// scale: 마스커블 안전영역 확보용 — 캔들 묶음을 중심 기준으로 축소
function iconSvg(scale = 1) {
  const bars = `
    <rect x="122" y="122" width="76" height="268" rx="22" fill="#E8483F"/>
    <rect x="218" y="210" width="76" height="180" rx="22" fill="#D9A441"/>
    <rect x="314" y="282" width="76" height="108" rx="22" fill="#5B8DEF"/>`;
  const body = scale === 1
    ? bars
    : `<g transform="translate(${256 * (1 - scale)} ${256 * (1 - scale)}) scale(${scale})">${bars}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${BG}"/>${body}</svg>`;
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/favicon.svg', iconSvg());

const jobs = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.72 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.9 }
];

for (const j of jobs) {
  await sharp(Buffer.from(iconSvg(j.scale)))
    .resize(j.size, j.size)
    .png()
    .toFile(`public/icons/${j.file}`);
  console.log(`public/icons/${j.file} (${j.size}px)`);
}
