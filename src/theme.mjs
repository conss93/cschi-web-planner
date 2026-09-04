/**
 * 식스샵 테마 설정에 옮겨 적을 값.
 *
 * 디자인 지침과 **같은 값의 다른 보기**다. 따로 만들지 않는다. 두 번 만들면
 * 두 문서가 다른 방향을 가리키게 되고, 그러면 AI 블록이 만든 화면과
 * 마켓플레이스 블록이 서로 안 맞는다. 값은 지침 하나뿐이고 여기서는
 * 식스샵 설정 화면의 칸 이름으로 바꿔 보여 줄 뿐이다.
 *
 * 테마 설정이 주는 칸은 생각보다 좁다.
 * - 색상 구성 최대 5개, 각 구성은 배경·글자·강조 세 칸뿐
 * - 글꼴은 제목 1종·본문 1종, 굵기는 각각 하나씩. 숫자가 아니라 이름으로 고른다
 * - 버튼은 모양 세 가지 중 하나. 모서리 픽셀을 넣는 칸이 없다
 * - 여백·자간·행간은 칸이 아예 없다
 *
 * 그래서 지침의 값 중 일부는 여기로 못 온다. 그건 AI 블록 생성과 AI 수정
 * 프롬프트가 나른다. 무엇이 어디로 가는지는 이 파일과 aiprompt.mjs 가 나눠 안다.
 */

/** 식스샵은 굵기를 숫자가 아니라 이름으로 받는다. */
const WEIGHT_NAMES = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

/** 버튼 모양. 식스샵이 주는 셋이 전부다. */
export const BUTTON_SHAPES = ['직사각형', '둥근 직사각형', '알약'];

/** 등장 효과. 역시 셋이 전부다. */
export const ANIMATIONS = ['없음', '페이드인', '슬라이드인'];

/**
 * 숫자 굵기를 식스샵 이름으로. 100 단위가 아니면 가장 가까운 쪽으로 붙인다.
 * 이름이 아니면 설정 화면에서 고를 수가 없으므로 반드시 하나로 떨어져야 한다.
 */
export function weightName(n) {
  const step = Math.min(900, Math.max(100, Math.round(Number(n) / 100) * 100));
  return WEIGHT_NAMES[step];
}

/**
 * 제목에 쓸 굵기 하나를 고른다.
 *
 * 테마는 제목 굵기를 하나만 받는데 지침은 크기 단계마다 굵기를 적는다.
 * 본문 굵기가 아닌 것 중 가장 많이 쓰인 것을 고른다. 제목이 전부 본문과
 * 같은 굵기면 본문 굵기를 그대로 쓴다.
 */
function headingWeight(t) {
  const counts = new Map();
  for (const step of t.scale ?? []) {
    if (step.weight === t.bodyWeight) continue;
    counts.set(step.weight, (counts.get(step.weight) ?? 0) + 1);
  }
  if (!counts.size) return t.bodyWeight;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/**
 * 색상 구성. 지침이 실제로 가진 색으로만 만든다.
 *
 * 다섯 칸이 있다고 다섯 개를 지어내지 않는다. 쓰지 않는 칸은 비워 두면 되고,
 * 없는 색을 만들어 넣으면 그 색이 화면 어딘가에 실제로 나타난다.
 */
function schemes(c) {
  const out = [
    { name: '기본', use: '대부분의 섹션', background: c.canvas, text: c.ink, accent: c.primary },
  ];

  // 바탕과 다른 면이 있을 때만. 같으면 구성을 하나 더 둘 이유가 없다.
  if (c.surface && c.surface.toLowerCase() !== c.canvas?.toLowerCase()) {
    out.push({
      name: '한 겹 올라온 면',
      use: '카드·표처럼 바탕에서 떠오르는 자리',
      background: c.surface,
      text: c.ink,
      accent: c.primary,
    });
  }

  if (c.primary && c.onPrimary) {
    out.push({
      name: '강조 면',
      use: '강조색을 바탕으로 깔아 눈길을 끄는 섹션',
      background: c.primary,
      text: c.onPrimary,
      accent: c.onPrimary,
    });
  }

  return out;
}

/**
 * 테마 설정 화면의 칸 순서대로. 이 순서로 보여 주어야 옮겨 적기 쉽다.
 */
export function themeChecklist(g) {
  const c = g?.colors ?? {};
  const t = g?.typography ?? {};
  const head = headingWeight(t);

  return {
    schemes: schemes(c),
    // 나머지 크기는 식스샵이 이 값에서 자동으로 파생한다.
    baseFontSize: t.bodySize,
    headingFont: { family: t.headingFont, weight: head, weightName: weightName(head) },
    bodyFont: { family: t.bodyFont, weight: t.bodyWeight, weightName: weightName(t.bodyWeight) },
    buttonShape: g?.buttonShape ?? null,
    animation: g?.animation ?? null,

    // 테마에 칸이 없어 옮겨 적을 수 없는 값. 프롬프트가 나른다는 것을
    // 밝혀 두지 않으면, 지침에 적혀 있으니 다 걸리는 줄 알게 된다.
    notInTheme: [
      c.inkMuted && `보조 글자 ${c.inkMuted}`,
      c.hairline && `경계선 ${c.hairline}`,
      c.primaryHover && `마우스 올렸을 때 ${c.primaryHover}`,
      t.bodyLineHeight && `행간 ${t.bodyLineHeight}`,
      t.bodyLetterSpacing && `자간 ${t.bodyLetterSpacing}`,
      g?.rounded && `모서리 ${roundedSteps(g.rounded).join('·')}px`,
      g?.spacing && `여백 단계 ${Object.values(g.spacing).join('·')}px`,
    ].filter(Boolean),
  };
}

/** pill 은 "완전히 둥근" 이라는 뜻이라 숫자로 세지 않는다. */
export function roundedSteps(rounded) {
  return Object.values(rounded ?? {}).filter((v) => v < 999);
}

/**
 * 체크리스트를 한 덩어리 글로. 설정 화면 옆에 띄워 두고 보라고 만든 것이라
 * 화면 순서 그대로 적는다.
 */
export function themeText(t, { company } = {}) {
  const out = [`${company ? `${company} · ` : ''}식스샵 테마 설정에 넣을 값`, ''];

  out.push('[색상] 색상 구성');
  t.schemes.forEach((s, i) => {
    out.push(`  구성 ${i + 1} — ${s.name} (${s.use})`);
    out.push(`    배경 ${s.background} / 글자 ${s.text} / 강조 ${s.accent}`);
  });

  out.push('');
  out.push('[글자]');
  out.push(`  기본 글자 크기 ${t.baseFontSize}px`);
  out.push(`  제목 글꼴 ${t.headingFont.family} / ${t.headingFont.weightName}`);
  out.push(`  본문 글꼴 ${t.bodyFont.family} / ${t.bodyFont.weightName}`);

  out.push('');
  out.push(`[버튼] 모양 ${t.buttonShape ?? '(지침에 없음)'}`);
  out.push(`[애니메이션] 유형 ${t.animation ?? '(지침에 없음)'}`);

  if (t.notInTheme.length) {
    out.push('');
    out.push('테마에 칸이 없는 값 — AI 수정 프롬프트가 나릅니다');
    for (const x of t.notInTheme) out.push(`  ${x}`);
  }

  return out.join('\n');
}
