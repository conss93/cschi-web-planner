/**
 * 디자인 지침 — 식스샵 "디자인 지침" 에 그대로 붙여넣는 문서.
 *
 * 식스샵 프로의 AI 블록 생성에는 스타일 참조로 "디자인 지침" 을 물릴 수
 * 있다. 색·글꼴·레이아웃 기준을 적어 두면 블록마다 제각각 나오지 않는다.
 * 대표 양식이 DESIGN.md 이고, Airbnb·Apple 같은 프리셋이 그 형식으로
 * 들어 있다. 여기서 만드는 것도 같은 형식이다.
 *
 * 이 문서의 핵심은 색 목록이 아니라 **금지 규칙**이다. 생성형 도구가 만든
 * 화면에서 "AI 티" 가 나는 것은 절제가 없어서다. 그라디언트를 넣고, 그림자를
 * 겹치고, 굵기를 다섯 단계 쓰고, 색을 여섯 개 쓴다. 무엇을 하지 말지가
 * 적혀 있어야 그게 멈춘다.
 */

import { contrast, ratio, MIN_BODY, MIN_LARGE } from './color.mjs';

/**
 * 읽을 수 있는 조합인지 잰다. 미달이면 무엇이 얼마나 모자란지 알려 준다.
 * 색을 우리가 고쳐 주지는 않는다. 고른 이유가 사라지기 때문이다.
 */
export function checkContrast(g) {
  const c = g?.colors ?? {};
  const pairs = [
    ['본문 글자', c.ink, '바탕', c.canvas, MIN_BODY],
    ['본문 글자', c.ink, '올라간 면', c.surface, MIN_BODY],
    ['보조 글자', c.inkMuted, '바탕', c.canvas, MIN_BODY],
    ['강조색 위 글자', c.onPrimary, '강조색', c.primary, MIN_BODY],
    ['강조색', c.primary, '바탕', c.canvas, MIN_LARGE],
    ['경계선', c.hairline, '바탕', c.canvas, 1.2],
  ];

  const problems = [];
  for (const [aName, a, bName, b, min] of pairs) {
    const v = contrast(a, b);
    if (v === null) {
      problems.push(`${aName}(${a ?? '없음'}) 과 ${bName}(${b ?? '없음'}) — 색 값을 읽을 수 없습니다`);
      continue;
    }
    if (v < min) {
      problems.push(
        `${aName} ${a} 과 ${bName} ${b} 의 대비가 ${ratio(v)}:1 입니다. ` +
          `${min}:1 이상이어야 읽힙니다`,
      );
    }
  }
  return problems;
}

/** 색이 몇 개인지. 강조색은 하나여야 한다는 규칙을 지켰는지 본다. */
export function countAccents(g) {
  const c = g?.colors ?? {};
  return new Set([c.primary, c.primaryHover].filter(Boolean)).size;
}

/* ── 식스샵 형식 마크다운 ─────────────────────────────────── */

const yamlText = (s) => `"${String(s ?? '').replace(/"/g, '\\"')}"`;

export function guidelineMarkdown(g, { company } = {}) {
  const t = g.typography;
  const out = [];

  out.push('---');
  out.push(`version: alpha`);
  out.push(`name: ${g.name}`);
  out.push(`description: ${g.description}`);
  out.push('');

  out.push('colors:');
  for (const [k, v] of Object.entries(g.colors)) out.push(`  ${k}: ${yamlText(v)}`);
  out.push('');

  out.push('typography:');
  out.push('  body:');
  out.push(`    fontFamily: ${yamlText(t.bodyFont)}`);
  out.push(`    fontSize: ${t.bodySize}px`);
  out.push(`    fontWeight: ${t.bodyWeight}`);
  out.push(`    lineHeight: ${t.bodyLineHeight}`);
  out.push(`    letterSpacing: ${t.bodyLetterSpacing}`);
  for (const step of t.scale) {
    out.push(`  ${step.role}:`);
    out.push(`    fontFamily: ${yamlText(t.headingFont)}`);
    out.push(`    fontSize: ${step.size}px`);
    out.push(`    fontWeight: ${step.weight}`);
  }
  out.push('');

  out.push('rounded:');
  for (const [k, v] of Object.entries(g.rounded)) out.push(`  ${k}: ${v}px`);
  out.push('');

  out.push('spacing:');
  for (const [k, v] of Object.entries(g.spacing)) out.push(`  ${k}: ${v}px`);
  out.push('');

  out.push('components:');
  for (const c of g.components) {
    out.push(`  ${c.name}:`);
    out.push(`    spec: ${yamlText(c.spec)}`);
  }
  out.push('---');
  out.push('');

  out.push(`# ${company ? `${company} ` : ''}디자인 지침`);
  out.push('');
  out.push(g.description);
  out.push('');
  out.push(`인상: ${g.mood.join(' · ')}`);
  out.push('');

  out.push('## 색');
  out.push('');
  out.push('| 이름 | 값 | 쓰는 곳 |');
  out.push('| --- | --- | --- |');
  for (const [k, v] of Object.entries(g.colors)) {
    out.push(`| ${k} | \`${v}\` | ${COLOR_ROLE[k] ?? ''} |`);
  }
  out.push('');
  out.push('강조색은 하나뿐입니다. 누를 수 있는 것은 전부 이 색이고, 그 밖의 것은 이 색을 쓰지 않습니다.');
  out.push('');

  out.push('## 글자');
  out.push('');
  out.push(`- 본문: ${t.bodyFont} ${t.bodySize}px / 굵기 ${t.bodyWeight} / 행간 ${t.bodyLineHeight} / 자간 ${t.bodyLetterSpacing}`);
  out.push(`- 제목: ${t.headingFont}`);
  for (const step of t.scale) out.push(`  - ${step.role}: ${step.size}px / 굵기 ${step.weight}`);
  out.push(`- 쓰는 굵기는 ${t.weights.join(' · ')} 뿐입니다. 그 사이 값은 쓰지 않습니다.`);
  out.push('');

  out.push('## 모서리와 간격');
  out.push('');
  out.push(`- 모서리: ${Object.entries(g.rounded).map(([k, v]) => `${k} ${v}px`).join(' · ')}`);
  out.push(`- 간격: ${Object.entries(g.spacing).map(([k, v]) => `${k} ${v}px`).join(' · ')}`);
  out.push('- 이 값 사이의 임의 숫자는 쓰지 않습니다.');
  out.push('');

  out.push('## 구성 요소');
  out.push('');
  for (const c of g.components) out.push(`- **${c.name}** — ${c.spec}`);
  out.push('');

  out.push('## 이렇게 합니다');
  out.push('');
  for (const d of g.dos) out.push(`- ${d}`);
  out.push('');

  out.push('## 이렇게 하지 않습니다');
  out.push('');
  for (const d of g.donts) out.push(`- ${d}`);
  out.push('');

  const problems = checkContrast(g);
  if (problems.length) {
    out.push('## 확인이 필요한 색 조합');
    out.push('');
    out.push('아래 조합은 대비가 모자라 글자가 잘 안 읽힙니다. 쓰기 전에 고치세요.');
    out.push('');
    for (const p of problems) out.push(`- ${p}`);
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(
    '글꼴은 식스샵에서 실제로 쓸 수 있는지 확인한 뒤 넣으세요. ' +
      '없으면 비슷한 굵기 단계를 가진 글꼴로 바꾸고, 굵기 목록도 함께 맞추세요.',
  );
  out.push('');

  return out.join('\n');
}

const COLOR_ROLE = {
  primary: '누를 수 있는 것 — 버튼, 링크, 활성 표시',
  primaryHover: '그 위에 마우스를 올렸을 때',
  ink: '본문 글자',
  inkMuted: '보조 설명, 캡션',
  hairline: '경계선, 구분선',
  canvas: '바탕',
  surface: '바탕에서 한 겹 올라온 면 — 카드, 표',
  onPrimary: '강조색 위에 얹는 글자',
};
