/**
 * ProgramTabs — 상단 [ 상체 | 하체 ] 세그먼트 컨트롤.
 *
 * 활성 프로그램을 전환하는 2칸 세그먼트. 선택 탭은 up-red(styles.css .program-tab).
 * 화면(route)은 건드리지 않는다 — 전환해도 현재 화면이 유지되어 상체↔하체 비교가 가능.
 * role=tablist/tab + aria-selected 로 접근성 상태를 노출한다.
 */

import type { Program, ProgramId } from "../../domain/types.js";

/** ProgramTabs props — 최소·명시적. */
export interface ProgramTabsProps {
  /** 상체/하체 프로그램 정의(라벨 표기용, rotation 순서 무관). */
  programs: Program[];
  /** 현재 활성 프로그램. */
  active: ProgramId;
  /** 탭 선택 시 활성 프로그램 전환. */
  onSelect: (id: ProgramId) => void;
}

/** [ 상체 | 하체 ] 세그먼트. */
export function ProgramTabs({
  programs,
  active,
  onSelect,
}: ProgramTabsProps): React.ReactElement {
  return (
    <div className="program-tabs" role="tablist" aria-label="프로그램 선택">
      {programs.map((p) => {
        const selected = p.id === active;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className="program-tab"
            onClick={() => {
              if (!selected) onSelect(p.id);
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
