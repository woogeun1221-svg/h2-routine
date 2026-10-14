/**
 * 기기 간 '이사' 페이로드 — 예전 Iron(맥미니 /iron/) → 루틴 앱 헬스 탭.
 *
 * 포맷: "IRONMOVE1." + ("gz" | "b64") + "." + base64url(bytes)
 *   gz  = gzip(utf8(json))  (CompressionStream 지원 시, 보통 1/5 크기)
 *   b64 = utf8(json)
 * json 은 exchange.exportJson 의 봉투 그대로라 parseImport 로 검증·마이그레이션된다.
 *
 * 전달 경로 둘:
 *   1) 클립보드 — 예전 앱 '이사 코드 복사' → 새 앱 헬스 탭 설정 '이사 코드 붙여넣기'.
 *      iOS 홈 화면 PWA 는 Safari 와 저장소가 분리돼 URL 로는 못 넘기므로 이 경로가 기본.
 *   2) URL 해시 — 새 앱 주소 뒤 `#iron-import=<payload>` (Safari 탭·데스크톱에서 한 번에).
 * 어느 경로든 알파센스/외부 서버를 거치지 않고 기기 안에서만 움직인다.
 */

export const TRANSFER_PREFIX = "IRONMOVE1";
export const TRANSFER_PARAM = "iron-import";
export const NEW_APP_URL = "https://woogeun1221-svg.github.io/h2-routine/";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  // lib.dom 은 (De)CompressionStream.writable 을 WritableStream<BufferSource> 로 선언해
  // pipeThrough<Uint8Array> 와 어긋난다. 런타임은 Uint8Array 청크를 그대로 받는다.
  const transform = stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(source).arrayBuffer());
}

function hasCompression(): boolean {
  return typeof CompressionStream === "function" && typeof DecompressionStream === "function";
}

/** JSON 문자열 → 이사 코드. */
export async function encodeTransfer(json: string, { compress = true }: { compress?: boolean } = {}): Promise<string> {
  const bytes = new TextEncoder().encode(json);
  if (compress && hasCompression()) {
    const gz = await pipe(bytes, new CompressionStream("gzip"));
    return `${TRANSFER_PREFIX}.gz.${toBase64Url(gz)}`;
  }
  return `${TRANSFER_PREFIX}.b64.${toBase64Url(bytes)}`;
}

/** 이사 코드 → JSON 문자열. 형식이 아니면 Error. 공백·줄바꿈은 무시한다(클립보드 래핑 대응). */
export async function decodeTransfer(payload: string): Promise<string> {
  const compact = (payload ?? "").replace(/\s+/g, "");
  const parts = compact.split(".");
  if (parts.length !== 3 || parts[0] !== TRANSFER_PREFIX || !parts[2]) {
    throw new Error("이사 코드 형식이 아닙니다. 예전 앱의 '이사 코드 복사'로 만든 코드를 붙여넣어 주세요.");
  }
  const mode = parts[1];
  const bytes = fromBase64Url(parts[2]);
  if (mode === "b64") return new TextDecoder().decode(bytes);
  if (mode === "gz") {
    if (!hasCompression()) throw new Error("이 브라우저는 압축 해제를 지원하지 않습니다. 최신 iOS/Safari 로 열어 주세요.");
    return new TextDecoder().decode(await pipe(bytes, new DecompressionStream("gzip")));
  }
  throw new Error(`알 수 없는 이사 코드 방식: ${mode}`);
}

/** `#iron-import=<payload>` 해시에서 페이로드를 꺼낸다(없으면 null). */
export function readTransferFromHash(hash: string): string | null {
  const value = new URLSearchParams((hash ?? "").replace(/^#/, "")).get(TRANSFER_PARAM);
  return value && value.trim() ? value.trim() : null;
}

/** 새 앱으로 바로 넘기는 URL. */
export async function buildTransferUrl(json: string, base: string = NEW_APP_URL): Promise<string> {
  return `${base}#${TRANSFER_PARAM}=${await encodeTransfer(json)}`;
}
