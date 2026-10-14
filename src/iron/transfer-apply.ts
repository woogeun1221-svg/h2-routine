/**
 * 이사 코드를 받아 Iron 스토어에 넣는다 — URL 해시(main.js)와 설정 화면 붙여넣기가 함께 쓴다.
 * 교체 전 현재 데이터를 preimport 백업 키로 남긴다(useAppState.importData 와 같은 규칙).
 */

import { LocalStorageAdapter } from "./storage/adapter.js";
import { parseImport, type ImportMode } from "./storage/exchange.js";
import { CORRUPT_KEY_PREFIX } from "./storage/store.js";
import { decodeTransfer } from "./storage/transfer.js";
import { store } from "./ui/useStore.js";

export interface TransferOutcome {
  ok: boolean;
  summary?: string;
  error?: string;
  /** 현재 기록이 있어 사용자 확인이 필요해 중단됨. */
  cancelled?: boolean;
}

export interface TransferOptions {
  /** 현재 세션이 있을 때 교체 여부를 묻는다. false 면 취소. 기본은 교체. */
  confirmReplace?: (currentSessions: number, incomingSummary: string) => boolean;
  mode?: ImportMode;
}

export async function applyTransferPayload(payload: string, options: TransferOptions = {}): Promise<TransferOutcome> {
  let json: string;
  try {
    json = await decodeTransfer(payload);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const current = store.getState();
  const mode = options.mode ?? "replace";
  const result = parseImport(json, mode, current);
  if (!result.ok || !result.store) return { ok: false, error: result.error ?? "가져오기 실패" };
  if (mode === "replace" && current.sessions.length > 0 && options.confirmReplace) {
    if (!options.confirmReplace(current.sessions.length, result.summary ?? "")) {
      return { ok: false, cancelled: true, error: "취소했습니다." };
    }
  }
  if (mode === "replace") {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      new LocalStorageAdapter().writeKey(CORRUPT_KEY_PREFIX + "preimport-" + ts, JSON.stringify(current));
    } catch {
      // 백업 실패해도 사용자가 명시한 이사는 진행
    }
  }
  const next = result.store;
  store.setState(() => next);
  return { ok: true, summary: result.summary };
}
