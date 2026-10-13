/**
 * 루틴 앱 '헬스' 탭에 Iron Terminal(React)을 마운트한다.
 *
 * - 처음 탭을 열 때 main.js 가 동적 import 하므로 초기 번들은 루틴 그대로다.
 * - 컨테이너에 .iron-root 를 붙인다. Iron 의 모든 CSS 는 빌드 시 이 클래스 아래로
 *   접두사 처리돼 루틴 화면(버튼·입력·토큰)을 덮지 않는다.
 * - 설치 안내·SW 갱신 토스트는 호스트 PWA 가 맡으므로 embedded 모드에서 꺼진다.
 * - 저장 키는 Iron 그대로(ironterminal:v1). 루틴 기록(h2-routine-v1)과 섞이지 않는다.
 */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import "@fontsource/ibm-plex-mono/400.css";
import "./ui/styles.css";
import "./ui/embedded.css";
import { App } from "./ui/App.js";

let root: Root | null = null;

export function mountIron(container: HTMLElement): Root {
  if (root) return root;
  container.classList.add("iron-root");
  root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App embedded />
    </React.StrictMode>,
  );
  return root;
}

/** 테스트용 — 마운트 해제. */
export function unmountIron(): void {
  if (!root) return;
  root.unmount();
  root = null;
}
