// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { initialStore } from '../src/iron/domain/presets.ts';
import { exportJson } from '../src/iron/storage/exchange.ts';
import { encodeTransfer } from '../src/iron/storage/transfer.ts';
import { applyTransferPayload } from '../src/iron/transfer-apply.ts';
import { store } from '../src/iron/ui/useStore.ts';

/* 이사 코드 → 스토어 반영. 스토어 싱글턴은 localStorage(happy-dom)에 영속한다. */
describe('applyTransferPayload', () => {
  beforeEach(() => { store.setState(() => initialStore()); });

  it('유효한 코드는 교체되고 요약을 돌려준다', async () => {
    const incoming = initialStore();
    incoming.settings = { ...incoming.settings, weeklyGoal: 5 };
    const result = await applyTransferPayload(await encodeTransfer(exportJson(incoming)));
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('세션 0개');
    expect(store.getState().settings.weeklyGoal).toBe(5);
  });

  it('형식이 아니면 ok=false 와 이유', async () => {
    const result = await applyTransferPayload('garbage');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('이사 코드 형식');
  });
});
