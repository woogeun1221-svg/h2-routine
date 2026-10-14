/**
 * SettingsScreen — 데이터 관리·설정 화면.
 *
 * 기능:
 *  1) JSON 내보내기: exportJson(store) → Blob → 파일 다운로드(기기 이전/백업).
 *  2) JSON 가져오기: 파일 선택 → 텍스트 읽기 → parseImport(replace|merge) 확인 → 반영.
 *  3) 시작 무게 편집: 가중 종목별 weightState.currentTargetKg 를 수동(manual) 갱신.
 *  4) 주간 목표(weeklyGoal) 편집: settings 갱신.
 *  5) 데이터 초기화: 확인 후 전체 초기화(App 이 initialStore 로 대체).
 *
 * 이 화면은 순수 프레젠테이션 — 브라우저/스토어 접근은 props 로 주입된 액션에만 의존한다.
 * (exportJson 은 순수 직렬화라 storage/exchange 에서 직접 import; 실제 저장/가져오기 반영은 props.)
 */

import { useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  ExerciseDef,
  ExerciseId,
  ExerciseWeightState,
  RootStore,
} from "../../domain/types.js";
import type { ImportMode, ImportResult } from "../../storage/exchange.js";
import { exportJson } from "../../storage/exchange.js";
import { MAX_SETS, MIN_SETS } from "../../domain/sets.js";
import { Card } from "../components/Card.js";
import { fmtKg } from "../format/num.js";

/** SettingsScreen props — App 계층(useAppState)에서 주입. */
export interface SettingsScreenProps {
  /** 현재 전체 스토어(표시·내보내기 원본). */
  store: RootStore;
  /** JSON 가져오기(replace 시 현재 데이터 자동 백업). 결과를 반환. */
  importData: (text: string, mode: ImportMode) => ImportResult;
  /** 예전 Iron(/iron/)에서 복사한 이사 코드 적용. embedded(루틴 앱) 에서만 주입. */
  importTransfer?: (payload: string) => Promise<{ ok: boolean; summary?: string; error?: string }>;
  /** 종목별 목표 무게 상태 수동 갱신. */
  updateWeightState: (
    exerciseId: ExerciseId,
    next: ExerciseWeightState,
  ) => void;
  /** 앱 설정 부분 갱신(예: weeklyGoal). */
  updateSettings: (patch: Partial<AppSettings>) => void;
  /** 종목 기본 세트 수 갱신(기록 화면 초기 세트 수). */
  updateSetCount: (exerciseId: ExerciseId, setCount: number) => void;
  /** 전체 데이터 초기화(프리셋 상태로 대체). */
  resetData: () => void;
}

/** 잠깐 뜨는 상태 메시지(성공/오류). */
interface FlashMsg {
  kind: "ok" | "error";
  text: string;
}

/**
 * RootStore 를 envelope JSON 으로 직렬화해 파일로 내려받는다.
 * 파일명: ironterminal-backup-YYYY-MM-DD.json
 */
function downloadExport(store: RootStore): void {
  const json = exportJson(store);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ironterminal-backup-${today}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 다음 틱에 해제(일부 브라우저가 즉시 해제 시 다운로드 취소).
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * 가중(weighted) 종목만 시작/목표 무게 편집 대상.
 * 자체중량은 무게 개념이 없어 제외한다.
 */
function editableExercises(store: RootStore): ExerciseDef[] {
  return Object.values(store.exercises)
    .filter((d) => d.kind === "weighted")
    .sort((a, b) => {
      // main 먼저, 그다음 이름순(안정적 표시 순서).
      if (a.role !== b.role) return a.role === "main" ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
}

/** 종목의 현재 목표 무게(없으면 defaultStartWeightKg). */
function currentTarget(
  def: ExerciseDef,
  state: ExerciseWeightState | undefined,
): number | null {
  if (state && state.currentTargetKg != null) return state.currentTargetKg;
  return def.defaultStartWeightKg;
}

/** SettingsScreen 본체. */
export function SettingsScreen({
  store,
  importData,
  importTransfer,
  updateWeightState,
  updateSettings,
  updateSetCount,
  resetData,
}: SettingsScreenProps): React.ReactElement {
  const [flash, setFlash] = useState<FlashMsg | null>(null);
  const [transferCode, setTransferCode] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  async function runTransfer(): Promise<void> {
    if (!importTransfer) return;
    setTransferBusy(true);
    try {
      const result = await importTransfer(transferCode);
      if (result.ok) {
        setTransferCode("");
        setFlash({ kind: "ok", text: "이사 완료 — " + (result.summary ?? "") });
      } else {
        setFlash({ kind: "error", text: result.error ?? "이사 실패" });
      }
    } finally {
      setTransferBusy(false);
    }
  }
  const [pendingImport, setPendingImport] = useState<{
    text: string;
    fileName: string;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const exercises = useMemo(() => editableExercises(store), [store]);
  const allExercises = useMemo(() => Object.values(store.exercises), [store.exercises]);

  // ── 내보내기 ──
  function handleExport(): void {
    try {
      downloadExport(store);
      setFlash({ kind: "ok", text: "백업 파일을 내려받았습니다." });
    } catch (e) {
      setFlash({
        kind: "error",
        text: `내보내기 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  // ── 가져오기: 파일 선택 → 텍스트 로드 → 확인 대기 ──
  function handleFilePicked(ev: React.ChangeEvent<HTMLInputElement>): void {
    const file = ev.target.files?.[0];
    // 같은 파일 재선택도 change 가 발생하도록 값 리셋.
    ev.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setPendingImport({ text, fileName: file.name });
      setFlash(null);
    };
    reader.onerror = () => {
      setFlash({ kind: "error", text: "파일을 읽지 못했습니다." });
    };
    reader.readAsText(file);
  }

  /** 확인된 가져오기를 mode 로 실행. */
  function runImport(mode: ImportMode): void {
    if (!pendingImport) return;
    const result = importData(pendingImport.text, mode);
    if (result.ok) {
      setFlash({
        kind: "ok",
        text: `가져오기 완료 — ${result.summary ?? ""}`.trim(),
      });
      setPendingImport(null);
    } else {
      setFlash({
        kind: "error",
        text: `가져오기 실패: ${result.error ?? "알 수 없는 오류"}`,
      });
    }
  }

  // ── 시작 무게 편집 ──
  function handleWeightChange(def: ExerciseDef, raw: string): void {
    const trimmed = raw.trim();
    if (trimmed === "") return; // 빈 입력은 무시(사용자가 지우는 중).
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setFlash({ kind: "error", text: `${def.name}: 올바른 무게가 아닙니다.` });
      return;
    }
    updateWeightState(def.id, {
      currentTargetKg: parsed,
      source: "manual",
      updatedAt: new Date().toISOString(),
    });
    setFlash({ kind: "ok", text: `${def.name} 목표 무게를 ${fmtKg(parsed)}kg 로 설정했습니다.` });
  }

  // ── 주간 목표 편집 ──
  function handleWeeklyGoalChange(raw: string): void {
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 7) {
      setFlash({ kind: "error", text: "주간 목표는 1~7 사이여야 합니다." });
      return;
    }
    updateSettings({ weeklyGoal: parsed });
    setFlash({ kind: "ok", text: `주간 목표를 ${parsed}회로 설정했습니다.` });
  }

  function handleSetCountChange(def: ExerciseDef, raw: string): void {
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed) || parsed < MIN_SETS || parsed > MAX_SETS) {
      setFlash({ kind: "error", text: `세트 수는 ${MIN_SETS}~${MAX_SETS} 사이여야 합니다.` });
      return;
    }
    updateSetCount(def.id, parsed);
    setFlash({ kind: "ok", text: `${def.name} 기본 세트 수를 ${parsed}세트로 설정했습니다.` });
  }

  // ── 초기화 ──
  function handleReset(): void {
    resetData();
    setConfirmReset(false);
    setPendingImport(null);
    setFlash({ kind: "ok", text: "모든 데이터를 초기화했습니다." });
  }

  const sessionCount = store.sessions.length;

  return (
    <div className="col" style={{ gap: 16 }}>
      {flash && (
        <div
          className={`card ${flash.kind === "error" ? "" : ""}`}
          role="status"
          style={{
            borderColor:
              flash.kind === "error" ? "var(--up)" : "var(--line)",
            color: flash.kind === "error" ? "var(--up)" : "var(--text)",
          }}
        >
          {flash.text}
        </div>
      )}

      {/* ── 예전 Iron 기록 이사 (루틴 앱 안에서만) ── */}
      {importTransfer && (
        <Card title="예전 기록 이사" accessory={<span className="dim">iron/ → 헬스</span>}>
          <p className="dim" style={{ fontSize: 13, marginBottom: 10 }}>
            예전 Iron 화면의 <strong style={{ color: "var(--text)" }}>이사 코드 복사</strong>를 누른 뒤
            여기 붙여넣으면 기록이 그대로 들어옵니다. 현재 기록이 있으면 교체 전에 확인합니다.
          </p>
          <textarea
            className="iron-transfer-code"
            value={transferCode}
            onChange={(e) => setTransferCode(e.target.value)}
            placeholder="IRONMOVE1.gz.…"
            rows={4}
            spellCheck={false}
          />
          <div className="row wrap" style={{ gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="btn primary"
              disabled={!transferCode.trim() || transferBusy}
              onClick={() => void runTransfer()}
            >
              이사 코드 가져오기
            </button>
          </div>
        </Card>
      )}

      {/* ── 백업 · 이전 ── */}
      <Card
        title="백업 · 기기 이전"
        accessory={<span className="dim">JSON</span>}
      >
        <p className="dim" style={{ fontSize: 13, marginBottom: 12 }}>
          현재 세션 {sessionCount}개. 내보낸 JSON 이 최종 백업 수단입니다 —
          새 기기에서 그대로 가져올 수 있습니다.
        </p>
        <div className="row wrap" style={{ gap: 10 }}>
          <button
            type="button"
            className="btn primary"
            onClick={handleExport}
          >
            내보내기 (다운로드)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => fileInputRef.current?.click()}
          >
            파일에서 가져오기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFilePicked}
            style={{ display: "none" }}
          />
        </div>

        {pendingImport && (
          <div
            className="col"
            style={{
              gap: 10,
              marginTop: 14,
              padding: 12,
              border: "1px solid var(--up-line)",
              borderRadius: "var(--r-sm)",
              background: "var(--up-soft)",
            }}
          >
            <div className="row between">
              <strong>가져오기 확인</strong>
              <span className="dim" style={{ fontSize: 12 }}>
                {pendingImport.fileName}
              </span>
            </div>
            <p className="dim" style={{ fontSize: 13 }}>
              <strong style={{ color: "var(--text)" }}>교체</strong>는 현재
              데이터를 완전히 대체하고(자동 백업됨),{" "}
              <strong style={{ color: "var(--text)" }}>병합</strong>은 세션을
              합칩니다.
            </p>
            <div className="row wrap" style={{ gap: 10 }}>
              <button
                type="button"
                className="btn primary"
                onClick={() => runImport("replace")}
              >
                교체
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => runImport("merge")}
              >
                병합
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setPendingImport(null)}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ── 시작 · 목표 무게 편집 ── */}
      <Card title="목표 무게 조정">
        <p className="dim" style={{ fontSize: 13, marginBottom: 12 }}>
          가중 종목의 현재 목표 무게를 직접 조정합니다(수동). 이후 진행 규칙은
          이 값 위에서 계속 적용됩니다.
        </p>
        <div className="col" style={{ gap: 12 }}>
          {exercises.map((def) => {
            const cur = currentTarget(def, store.weightState[def.id]);
            return (
              <div key={def.id} className="row between" style={{ gap: 12 }}>
                <div className="col" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 700 }}>{def.name}</span>
                  <span className="dim" style={{ fontSize: 12 }}>
                    {def.role === "main" ? "메인" : "보조"} · +
                    {fmtKg(def.progressionIncrementKg)}kg 증량
                  </span>
                </div>
                <div className="row" style={{ gap: 6, flex: "0 0 auto" }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input num"
                    style={{ width: 96 }}
                    defaultValue={cur ?? ""}
                    step={def.progressionIncrementKg || 2.5}
                    min={0}
                    aria-label={`${def.name} 목표 무게(kg)`}
                    onBlur={(e) => handleWeightChange(def, e.target.value)}
                  />
                  <span className="dim" style={{ fontSize: 13 }}>
                    kg
                  </span>
                </div>
              </div>
            );
          })}
          {exercises.length === 0 && (
            <span className="dim">조정할 가중 종목이 없습니다.</span>
          )}
        </div>
      </Card>

      {/* ── 기본 세트 수 ── */}
      <Card title="기본 세트 수">
        <p className="dim" style={{ fontSize: 13, marginBottom: 12 }}>
          기록 화면에 처음 뜨는 세트 수입니다. 기록 중에는 ＋ 세트 추가 / × 로 그날그날 바꿀 수 있고,
          다음 기록은 마지막에 실제로 한 세트 수로 시작합니다.
        </p>
        <div className="col" style={{ gap: 12 }}>
          {allExercises.map((def) => (
            <div key={def.id} className="row between" style={{ gap: 12 }}>
              <span style={{ fontWeight: 700 }}>{def.name}</span>
              <div className="row" style={{ gap: 6, flex: "0 0 auto" }}>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input num"
                  style={{ width: 72 }}
                  defaultValue={def.setCount}
                  min={MIN_SETS}
                  max={MAX_SETS}
                  step={1}
                  aria-label={`${def.name} 기본 세트 수`}
                  onBlur={(e) => handleSetCountChange(def, e.target.value)}
                />
                <span className="dim" style={{ fontSize: 13 }}>
                  세트
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 주간 목표 ── */}
      <Card title="주간 목표">
        <div className="row between">
          <span className="dim" style={{ fontSize: 13 }}>
            스트릭 유지를 위한 주당 목표 세션 수(1~7).
          </span>
          <div className="row" style={{ gap: 6, flex: "0 0 auto" }}>
            <input
              type="number"
              inputMode="numeric"
              className="input num"
              style={{ width: 72 }}
              defaultValue={store.settings.weeklyGoal}
              min={1}
              max={7}
              step={1}
              aria-label="주간 목표 세션 수"
              onBlur={(e) => handleWeeklyGoalChange(e.target.value)}
            />
            <span className="dim" style={{ fontSize: 13 }}>
              회/주
            </span>
          </div>
        </div>
      </Card>

      {/* ── 위험 구역: 초기화 ── */}
      <Card title="데이터 초기화" accessory={<span className="up">위험</span>}>
        <p className="dim" style={{ fontSize: 13, marginBottom: 12 }}>
          모든 세션·기록·무게 상태를 지우고 초기 상태로 되돌립니다. 되돌릴 수
          없으니 먼저 내보내기로 백업하세요.
        </p>
        {!confirmReset ? (
          <button
            type="button"
            className="btn hold full"
            onClick={() => setConfirmReset(true)}
          >
            데이터 초기화…
          </button>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            <strong className="up">정말 초기화할까요? 되돌릴 수 없습니다.</strong>
            <div className="row wrap" style={{ gap: 10 }}>
              <button
                type="button"
                className="btn primary"
                onClick={handleReset}
              >
                초기화 확정
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirmReset(false)}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
