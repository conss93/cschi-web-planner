/**
 * 내부 도구라 사용자는 한 명이다. 계정 체계를 만들 이유가 없어
 * 비밀번호 하나와 서명된 쿠키로 끝낸다.
 *
 * 고객 공유 링크는 이 인증을 거치지 않는다. 대신 추측할 수 없는 토큰을 쓴다.
 */

export const COOKIE = 'planner_session';

/** 비밀번호에서 쿠키 값을 만든다. 미들웨어(엣지)와 서버 양쪽에서 도는 Web Crypto 를 쓴다. */
export async function sessionToken() {
  const password = process.env.PLANNER_PASSWORD;
  if (!password) throw new Error('PLANNER_PASSWORD 가 설정되지 않았습니다.');

  const bytes = new TextEncoder().encode(`cschi-web-planner:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 길이가 달라도 시간이 새지 않도록 전체를 훑어 비교한다. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function isSignedIn(request) {
  try {
    const cookie = request.cookies.get(COOKIE)?.value;
    return safeEqual(cookie ?? '', await sessionToken());
  } catch {
    return false;
  }
}
