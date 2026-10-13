/**
 * Screen — 앱 셸(세이프에어리어 + 헤더 슬롯 + 스크롤 본문 + 하단 네비 슬롯).
 *
 * 레이아웃(styles.css):
 *  .app       : min-h dvh flex column(전체 셸)
 *  header 슬롯 : 상단 sticky(보통 <Header/>)
 *  .screen    : flex:1 스크롤 본문. 하단 네비+세이프에어리어 만큼 패딩 확보(버튼 가림 방지)
 *  bottomNav  : 하단 fixed(보통 <BottomNav/>)
 *
 * 화면별 제목/부제는 선택 — 주면 .screen-title/.screen-sub 로 렌더한다.
 * 세이프에어리어(노치/홈 인디케이터) 대응은 .header/.screen/.bottomnav 의 env() 패딩이 담당.
 */

import type { ReactNode } from "react";

/** Screen props — 최소·명시적. */
export interface ScreenProps {
  /** 상단 헤더 슬롯(보통 <Header/>). sticky 처리는 헤더 자체 CSS. */
  header?: ReactNode;
  /** 하단 네비 슬롯(보통 <BottomNav/>). fixed 처리는 네비 자체 CSS. */
  bottomNav?: ReactNode;
  /** 본문 상단 제목(.screen-title). 없으면 생략. */
  title?: ReactNode;
  /** 제목 아래 부제(.screen-sub). 없으면 생략. */
  subtitle?: ReactNode;
  /** 스크롤 본문 내용. */
  children?: ReactNode;
}

/** 세이프에어리어 셸: 헤더 슬롯 + 스크롤 본문 + 하단 네비 슬롯. */
export function Screen({
  header,
  bottomNav,
  title,
  subtitle,
  children,
}: ScreenProps): React.ReactElement {
  return (
    <div className="app">
      {header}
      <main className="screen">
        {title != null && <h1 className="screen-title">{title}</h1>}
        {subtitle != null && <p className="screen-sub">{subtitle}</p>}
        {children}
      </main>
      {bottomNav}
    </div>
  );
}
