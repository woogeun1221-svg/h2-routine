/**
 * InstallPrompt — PWA 홈 화면 추가 안내 바텀시트.
 *
 * `beforeinstallprompt` 이벤트를 캡처(브라우저 기본 배너 억제)했다가,
 * 사용자가 "홈에 추가"를 누르면 저장해 둔 이벤트의 prompt() 를 호출한다.
 * 이미 설치(standalone) 상태이거나 이벤트가 없으면 아무것도 렌더하지 않는다.
 * 브라우저 API(window/navigator)를 쓰는 몇 안 되는 컴포넌트 — effect 안에서만 접근.
 * .install-prompt / .ip-text / .btn 토큰 사용.
 */
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

/**
 * beforeinstallprompt 이벤트 — 표준 lib.dom 에 없어 최소 형태로 정의.
 * prompt() 로 네이티브 설치 UI 를 띄우고, userChoice 로 결과를 받는다.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

/** InstallPrompt props (전부 선택 · 카피 커스터마이즈용). */
export interface InstallPromptProps {
  /** 안내 제목. */
  title?: string;
  /** 안내 서브. */
  sub?: string;
}

/** standalone(설치됨) 여부 감지 — SSR 안전. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari 는 navigator.standalone 비표준 프로퍼티 사용.
  const iosStandalone = (
    window.navigator as unknown as { standalone?: boolean }
  ).standalone;
  return Boolean(mm || iosStandalone);
}

/** 홈 화면 추가 안내 바텀시트. */
export function InstallPrompt({
  title = "홈 화면에 추가",
  sub = "앱처럼 열고 오프라인에서도 기록하세요",
}: InstallPromptProps): React.ReactElement | null {
  const [deferred, setDeferred] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const onBip = (e: Event) => {
      // 브라우저 기본 미니 인포바 억제 후 우리 UI 로 대체.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (dismissed || deferred == null) return null;

  const onInstall = async () => {
    const ev = deferred;
    setDeferred(null);
    try {
      await ev.prompt();
      await ev.userChoice;
    } catch {
      // 사용자가 취소했거나 브라우저가 거부 — 조용히 무시.
    }
  };

  return (
    <div className="install-prompt" role="dialog" aria-label={title}>
      <div className="ip-text">
        {title}
        <small>{sub}</small>
      </div>
      <button className="btn primary" onClick={onInstall}>
        <Plus size={16} strokeWidth={2.5} />
        추가
      </button>
      <button
        className="btn ghost"
        aria-label="닫기"
        onClick={() => setDismissed(true)}
        style={{ minHeight: 44, padding: "0 10px" }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
