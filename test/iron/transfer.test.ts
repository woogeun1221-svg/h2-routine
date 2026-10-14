/** 이사 코드 인코딩/디코딩 — gz·b64 왕복, 공백 내성, 형식 오류, 해시 파싱. */
import { describe, it, expect } from "vitest";
import {
  TRANSFER_PARAM,
  TRANSFER_PREFIX,
  buildTransferUrl,
  decodeTransfer,
  encodeTransfer,
  readTransferFromHash,
} from "../../src/iron/storage/transfer.js";

const SAMPLE = JSON.stringify({ format: "ironterminal-export", data: { sessions: [], note: "한글 ✓" } });

describe("transfer", () => {
  it("gzip 왕복", async () => {
    const code = await encodeTransfer(SAMPLE);
    expect(code.startsWith(`${TRANSFER_PREFIX}.gz.`)).toBe(true);
    expect(await decodeTransfer(code)).toBe(SAMPLE);
  });

  it("비압축 왕복 + 클립보드 줄바꿈 내성", async () => {
    const code = await encodeTransfer(SAMPLE, { compress: false });
    expect(code.startsWith(`${TRANSFER_PREFIX}.b64.`)).toBe(true);
    const wrapped = code.replace(/(.{20})/g, "$1\n ");
    expect(await decodeTransfer(wrapped)).toBe(SAMPLE);
  });

  it("형식이 아니면 거부", async () => {
    await expect(decodeTransfer("not-a-code")).rejects.toThrow("이사 코드 형식");
    await expect(decodeTransfer(`${TRANSFER_PREFIX}.zip.abc`)).rejects.toThrow("알 수 없는");
  });

  it("URL 해시에서 페이로드를 꺼낸다", async () => {
    const url = await buildTransferUrl(SAMPLE, "https://example.test/app/");
    expect(url.startsWith(`https://example.test/app/#${TRANSFER_PARAM}=`)).toBe(true);
    const payload = readTransferFromHash(new URL(url).hash);
    expect(payload).not.toBeNull();
    expect(await decodeTransfer(payload!)).toBe(SAMPLE);
    expect(readTransferFromHash("#reminder=abc")).toBeNull();
    expect(readTransferFromHash("")).toBeNull();
  });
});
