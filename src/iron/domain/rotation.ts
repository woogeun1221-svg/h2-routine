/**
 * 로테이션 — 다음 워크아웃 결정.
 *
 * 프로그램의 rotation(세션 템플릿 순환 순서)을 기준으로,
 * "완료된" 세션 기록만 보고 다음에 할 Day 를 계산한다.
 * 진행 중(completedAt === null) 세션은 무시한다.
 */

import type {
  Program,
  SessionTemplate,
  SessionTemplateId,
  WorkoutSession,
} from "./types.js";

/**
 * 다음에 수행할 세션 템플릿과 lap(순환 바퀴 수)을 반환한다.
 *
 * 규칙:
 * - program.id 와 일치하고 completedAt !== null 인 세션만 대상.
 * - completedAt 오름차순 정렬 후 마지막 세션의 templateId 를 찾아,
 *   rotation 내 그 인덱스의 "다음"(순환)을 다음 템플릿으로 한다.
 * - 완료 기록이 없으면 rotation[0], lap 0.
 * - lap = floor(완료 세션 수 / rotation.length).
 * - lower 는 rotation 이 [lower_day] 하나뿐이라 항상 lower_day 로 귀결된다.
 *
 * @param program   대상 프로그램(rotation 보유)
 * @param templates 템플릿 조회용 레코드
 * @param sessions  전체 세션(프로그램/완료 여부는 내부에서 필터)
 * @returns 다음 세션 템플릿과 lap
 */
export function nextWorkout(
  program: Program,
  templates: Record<SessionTemplateId, SessionTemplate>,
  sessions: WorkoutSession[],
): { template: SessionTemplate; lap: number } {
  const rotation = program.rotation;

  // rotation 이 비어 있으면 진행 불가 — 방어적 처리.
  if (rotation.length === 0) {
    throw new Error(`program "${program.id}" has an empty rotation`);
  }

  // 이 프로그램의 완료된 세션만 완료 시각 오름차순 정렬.
  const completed = sessions
    .filter((s) => s.programId === program.id && s.completedAt !== null)
    .sort((a, b) => {
      // 위 필터로 completedAt 은 non-null 이 보장되지만 타입상 좁혀지지 않아 폴백 사용.
      const at = a.completedAt ?? "";
      const bt = b.completedAt ?? "";
      return at < bt ? -1 : at > bt ? 1 : 0;
    });

  const completedCount = completed.length;
  const lap = Math.floor(completedCount / rotation.length);

  // 기록이 없으면 로테이션 첫 번째부터.
  const firstTemplateId = rotation[0];
  if (firstTemplateId === undefined) {
    throw new Error(`program "${program.id}" has an empty rotation`);
  }

  if (completedCount === 0) {
    return { template: resolveTemplate(templates, firstTemplateId), lap };
  }

  const last = completed[completedCount - 1];
  const lastTemplateId = last?.templateId;

  // 마지막 세션의 templateId 가 rotation 에 없으면(데이터 이상) 첫 번째로 폴백.
  const lastIndex =
    lastTemplateId === undefined ? -1 : rotation.indexOf(lastTemplateId);
  const nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % rotation.length;
  const nextTemplateId = rotation[nextIndex] ?? firstTemplateId;

  return { template: resolveTemplate(templates, nextTemplateId), lap };
}

/** 템플릿 id → SessionTemplate 조회. 없으면 명시적으로 실패(무결성 보장). */
function resolveTemplate(
  templates: Record<SessionTemplateId, SessionTemplate>,
  id: SessionTemplateId,
): SessionTemplate {
  const template = templates[id];
  if (template === undefined) {
    throw new Error(`unknown session template "${id}"`);
  }
  return template;
}
