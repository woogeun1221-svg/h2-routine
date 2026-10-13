/**
 * Iron Terminal 도메인 타입 — 단일 진실 소스(SSOT).
 *
 * 모든 다른 모듈(도메인 함수·저장 계층·UI)은 여기서만 타입을 import 한다.
 * 재정의·중복 선언 금지.
 *
 * 설계 원칙: "정의(Def)는 데이터, 기록(Log)은 id로만 참조".
 * 운동 종목의 스펙은 ExerciseDef 에 두고, 실제 세션 기록은 ExerciseId 로만 가리킨다.
 */

// ─────────────────────────────────────────────────────────────
// 식별자 / 열거형
// ─────────────────────────────────────────────────────────────

/** 프로그램 축: 상체(upper) / 하체(lower). 각자 독립 대시보드·차트·히스토리. */
export type ProgramId = "upper" | "lower";

/** 운동 종류: 가중(무게 추적) / 자체중량(횟수만 추적). */
export type ExerciseKind = "weighted" | "bodyweight";

/** 종목 역할: 메인 리프트 / 보조. */
export type ExerciseRole = "main" | "accessory";

/** 운동 종목 식별자 (예: "bench_press"). */
export type ExerciseId = string;

/** 세션 템플릿 식별자 (예: "upper"). */
export type SessionTemplateId = string;

// ─────────────────────────────────────────────────────────────
// 정의(Definition) — 데이터로서의 스펙
// ─────────────────────────────────────────────────────────────

/**
 * 운동 종목 정의.
 * - progressionIncrementKg: 증량 트리거 충족 시 올릴 무게(상체 2.5 / 스쿼트 5 / 자체중량 0).
 * - defaultStartWeightKg: 첫 세션 제안 무게. 자체중량은 null.
 * - allowsAddedWeight: 자체중량이지만 가중(밴드/조끼) 가능 여부(예: 풀업). 진행 규칙엔 미사용.
 */
export interface ExerciseDef {
  id: ExerciseId;
  name: string;
  kind: ExerciseKind;
  role: ExerciseRole;
  setCount: number;
  targetReps: number;
  progressionIncrementKg: number;
  defaultStartWeightKg: number | null;
  allowsAddedWeight?: boolean;
}

/**
 * 세션 템플릿. 그 세션에서 수행할 종목 전체(메인+보조)를 담는다.
 * 상체는 한 세션에 상체 종목 전부, 하체는 스쿼트 하나.
 * exerciseIds 순서 = 입력 화면에 표시되는 순서(메인/복합 리프트 우선).
 */
export interface SessionTemplate {
  id: SessionTemplateId;
  label: string;
  shortLabel: string;
  exerciseIds: ExerciseId[];
}

/**
 * 프로그램. rotation 은 세션 템플릿의 순환 순서.
 * upper = [upper] 단일 상체 세션, lower = [squat] 고정.
 */
export interface Program {
  id: ProgramId;
  label: string;
  rotation: SessionTemplateId[];
}

// ─────────────────────────────────────────────────────────────
// 기록(Log) — id 로만 참조
// ─────────────────────────────────────────────────────────────

/** 개별 세트 기록. 자체중량은 weightKg = null. */
export interface SetLog {
  setIndex: number;
  weightKg: number | null;
  reps: number;
  completedAt: string;
}

/**
 * 한 종목의 세션 내 기록.
 * kindAtLog: 기록 시점의 kind 스냅샷(정의가 나중에 바뀌어도 과거 기록 해석 보존).
 * plannedWeightKg: 기록 시작 시 제안됐던 무게.
 */
export interface ExerciseLog {
  exerciseId: ExerciseId;
  kindAtLog: ExerciseKind;
  plannedWeightKg: number | null;
  sets: SetLog[];
}

/**
 * 워크아웃 세션 = 하루(상체는 상체 종목 전부, 하체는 스쿼트).
 * localDate: 기록 시점에 1회 계산한 로컬 날짜(YYYY-MM-DD, 타임존 드리프트 없음).
 * completedAt: null 이면 진행 중.
 */
export interface WorkoutSession {
  id: string;
  programId: ProgramId;
  templateId: SessionTemplateId;
  localDate: string;
  startedAt: string;
  completedAt: string | null;
  exercises: ExerciseLog[];
  manualWeightOverride?: boolean;
  note?: string;
}

/**
 * 종목별 현재 목표 무게 상태.
 * source: 이 무게가 어떻게 정해졌는지(기본값/자동증량/유지/수동/디로드).
 */
export interface ExerciseWeightState {
  currentTargetKg: number | null;
  source: "default" | "auto_bump" | "hold" | "manual" | "deload";
  updatedAt: string;
}

/** 앱 설정. weeklyGoal 기본 3, unit 는 kg 고정. */
export interface AppSettings {
  activeProgram: ProgramId;
  unit: "kg";
  weeklyGoal: number;
  bodyweightKg?: number;
}

/** localStorage 에 저장되는 단일 루트 blob. */
export interface RootStore {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  exercises: Record<ExerciseId, ExerciseDef>;
  programs: Record<ProgramId, Program>;
  templates: Record<SessionTemplateId, SessionTemplate>;
  sessions: WorkoutSession[];
  weightState: Record<ExerciseId, ExerciseWeightState>;
  settings: AppSettings;
}

/** 현재 스키마 버전. 마이그레이션 기준. */
export const SCHEMA_VERSION = 3;

// ─────────────────────────────────────────────────────────────
// 파생 결과 타입 — 도메인 함수 반환용
// ─────────────────────────────────────────────────────────────

/**
 * 다음 세션 제안 무게.
 * reason: 'first'(첫세션) 'bump'(증량) 'hold'(유지) 'bodyweight'(자체중량) 'manual' 'deload'.
 * isBump: 증량 신호(목표 달성 신호) 여부.
 */
export interface WeightSuggestion {
  exerciseId: ExerciseId;
  suggestedKg: number | null;
  isBump: boolean;
  reason: "first" | "bump" | "hold" | "bodyweight" | "manual" | "deload";
  incrementKg: number;
}

/** 개인 신기록 레코드. */
export interface PRRecord {
  exerciseId: ExerciseId;
  kind: "weight" | "reps" | "e1rm" | "volume";
  value: number;
  sessionId: string;
  achievedAt: string;
}

/** 캘린더 히트맵 셀(하루). */
export interface CalendarCell {
  localDate: string;
  sessionCount: number;
  programIds: ProgramId[];
}

/** 주간 스트릭 요약. 연속 "운동한 주" 기준. */
export interface WeeklyStreak {
  current: number;
  longest: number;
  thisWeekCount: number;
  weeklyGoal: number;
  lastActiveWeek: string | null;
}

/** 대시보드(홈) 요약 — 여러 도메인 함수를 조립한 결과. */
export interface DashboardSummary {
  program: ProgramId;
  next: { template: SessionTemplate; lap: number };
  perExercise: Array<{
    def: ExerciseDef;
    currentKg: number | null;
    lastResult: {
      date: string;
      allHit: boolean;
      topSetKg: number | null;
      topReps: number;
    } | null;
    suggestion: WeightSuggestion;
    best1RM: number | null;
  }>;
  lastSessionVolume: number | null;
  streak: WeeklyStreak;
  recentPRs: PRRecord[];
}
