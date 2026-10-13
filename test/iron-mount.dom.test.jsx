// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import { mountIron, unmountIron } from '../src/iron/mount.tsx';

/* 헬스 탭 컨테이너에 Iron 이 embedded 모드로 뜨는지 — 헤더(상체/하체) + 보조 메뉴가 있고
   호스트 탭바와 겹치는 Iron 하단 네비·설치 안내는 없어야 한다. */
describe('헬스 탭 마운트', () => {
  afterEach(() => { unmountIron(); document.body.innerHTML = ''; try { localStorage.removeItem('ironterminal:v1'); } catch (e) {} });

  it('컨테이너에 .iron-root 를 붙이고 embedded 셸을 렌더한다', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    host.id = 'screen-iron';
    document.body.appendChild(host);
    await act(async () => { mountIron(host); });
    expect(host.classList.contains('iron-root')).toBe(true);
    expect(host.querySelector('.iron-top .header')).not.toBeNull();
    expect(host.querySelectorAll('.iron-subnav .iron-subnav-item').length).toBe(5);
    expect(host.querySelector('.bottomnav')).toBeNull();
    expect(host.querySelector('.install-prompt')).toBeNull();
    expect(host.textContent).toContain('상체');
  });

  it('두 번 호출해도 루트는 하나다', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.appendChild(host);
    let first, second;
    await act(async () => { first = mountIron(host); second = mountIron(host); });
    expect(first).toBe(second);
    expect(host.querySelectorAll('.iron-top').length).toBe(1);
  });
});
