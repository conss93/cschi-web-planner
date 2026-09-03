/**
 * 색 대비 계산.
 *
 * 디자인 지침의 색은 모델이 고른다. 예쁜 조합을 내놓아도 글자가 안 읽히면
 * 소용이 없고, 그건 눈으로 봐서는 잘 모른다. 숫자로 재서 미달이면 알려 준다.
 * 고치는 것은 사람이 한다 — 우리가 임의로 색을 바꾸면 고른 이유가 사라진다.
 *
 * 계산은 WCAG 2 의 상대 휘도와 대비비 공식을 그대로 쓴다.
 */

/** "#1d1d1f" → [29, 29, 31]. 형식이 틀리면 null. */
export function parseHex(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 상대 휘도. 0(검정) ~ 1(흰색). */
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 두 색의 대비비. 1(같은 색) ~ 21(검정과 흰색). 형식이 틀리면 null. */
export function contrast(a, b) {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return null;

  const l1 = luminance(x);
  const l2 = luminance(y);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** 소수 한 자리로. 4.53 → "4.5" */
export const ratio = (v) => (v === null ? '?' : v.toFixed(1));

/** 본문 글자에 필요한 최소 대비. WCAG AA 기준. */
export const MIN_BODY = 4.5;
/** 큰 글자(18pt 이상 또는 14pt 굵게)와 경계선에 필요한 최소 대비. */
export const MIN_LARGE = 3;
