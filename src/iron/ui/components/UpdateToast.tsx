/**
 * UpdateToast — 서비스워커 업데이트 안내 토스트.
 *
 * vite-plugin-pwa 의 useRegisterSW(onNeedRefresh)로 새 SW 대기 상태를 감지해
 * "업데이트됨 · 새로고침" 토스트를 띄운다. 누르면 updateServiceWorker(true)로
 * 새 워커를 활성화하고 페이지를 리로드한다.
 * (registerType:"autoUpdate" 에선 대개 자동 활성화되나, 대기가 감지되면 최소 안내를 제공.)
 * InstallPrompt 와 동일한 .install-prompt 토큰을 재사용해 룩을 맞춘다.
 */
import { RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

/** SW 업데이트 대기 시 새로고침 토스트. 대기 없으면 아무것도 렌더하지 않음. */
export function UpdateToast(): React.ReactElement | null {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="install-prompt" role="dialog" aria-label="앱 업데이트">
      <div className="ip-text">
        업데이트됨
        <small>새로고침하면 최신 버전으로 전환됩니다</small>
      </div>
      <button
        className="btn primary"
        onClick={() => void updateServiceWorker(true)}
      >
        <RefreshCw size={16} strokeWidth={2.5} />
        새로고침
      </button>
    </div>
  );
}
