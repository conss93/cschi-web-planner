/**
 * 식스샵 AI 입력칸에 그대로 붙여넣는 글. 두 가지가 있다.
 *
 * **AI 블록 생성** — 마켓플레이스에 맞는 블록이 없는 자리를 새로 만든다.
 * "인물 소개 섹션 만들어줘" 라고만 쓰면 매번 다른 것이 나오므로, 배치·이미지
 * 비율·모바일에서 접히는 모양까지 적는다. 이쪽은 스타일 참조로 **디자인
 * 지침을 물릴 수 있어서** 프롬프트가 색·굵기를 길게 늘어놓지 않아도 된다.
 *
 * **AI 수정** — 이미 넣은 마켓플레이스 블록을 지침에 맞게 고친다. 이쪽은
 * 지침을 붙일 수가 없다. 그래서 **프롬프트가 지침 노릇까지 해야 한다.**
 * 색·글꼴·굵기·모서리·여백·금지 규칙을 전부 싣는다. 생성 쪽과 값이 갈리면
 * 같은 화면에서 두 블록이 달라 보이므로, 둘 다 지침 하나에서만 값을 읽는다.
 *
 * 어느 쪽이든 색과 굵기는 **모델이 아니라 코드가** 넣는다. 모델이 프롬프트에
 * 다른 색을 적으면 두 문서가 어긋난다. 지침이 아직 없으면 그 줄을 아예 빼고
 * 지어내지 않는다. 문구도 코드가 원문 그대로 넣는다.
 */

import { weightName, roundedSteps } from './theme.mjs';

/**
 * 생성 프롬프트에 넣을 금지 규칙 수. 지침이 따로 붙으니 몇 개만 짚어 준다.
 * 다 넣으면 정작 만들 것이 묻힌다. 수정 프롬프트는 기댈 지침이 없으므로
 * 이 상한을 쓰지 않고 전부 싣는다.
 */
const MAX_DONTS = 4;

const clean = (v) => String(v ?? '').trim();

/** 문구 안의 [버튼] 표기. 콘텐츠 팩이 쓰는 것과 같은 규칙이다. */
const BUTTON = /\[([^\]\n]{1,40})\]/g;

/**
 * 버튼으로 가려낸 것만 대괄호를 턴다.
 *
 * "[확인 필요]" 처럼 아직 안 정해진 값의 자리는 괄호를 남겨 둔다. 괄호를
 * 떼면 '확인 필요' 가 진짜 넣을 글자처럼 보인다.
 */
function stripButtonBrackets(copy, buttons) {
  const real = new Set(buttons.map((b) => String(b).trim()));
  return copy.replace(BUTTON, (whole, inner) =>
    real.has(inner.trim()) ? inner.trim() : whole,
  );
}

/** 한 자리를 만들 때 쓸 배치 지시. 옛 기획서에는 없다. */
export function aiSpec(section) {
  const a = section?.ai ?? {};
  return {
    layout: clean(a.layout),
    media: clean(a.media),
    mobile: clean(a.mobile),
    interaction: clean(a.interaction),
  };
}

/** 이 자리에 배치 지시가 하나라도 있는지. 없으면 목적과 메모만으로 쓴다. */
export function hasSpec(section) {
  return Object.values(aiSpec(section)).some(Boolean);
}

/**
 * 자리 하나의 프롬프트.
 *
 * @param section 콘텐츠 팩이 만든 자리(또는 pipeline 의 섹션)
 * @param guideline 디자인 지침. 없으면 색·모서리 줄을 넣지 않는다.
 */
export function aiPrompt(section, { guideline = null, company = '', page = null } = {}) {
  const spec = aiSpec(section);
  const purpose = clean(section?.purpose) || '섹션';
  const out = [];

  out.push(`${purpose} 섹션을 만들어 주세요.`);
  out.push('');

  const where = [company && `${company} 웹사이트`, page?.title && `${page.title} 페이지`]
    .filter(Boolean)
    .join(' · ');
  if (where) out.push(`- 어디에 쓰나: ${where}`);

  const note = clean(section?.note);
  if (note) out.push(`- 이 자리가 하는 일: ${note}`);

  if (spec.layout) out.push(`- 배치: ${spec.layout}`);
  if (spec.media) out.push(`- 이미지: ${spec.media}`);
  if (spec.mobile) out.push(`- 모바일: ${spec.mobile}`);
  if (spec.interaction) out.push(`- 동작: ${spec.interaction}`);

  const buttons = section?.buttons ?? [];
  if (buttons.length) {
    out.push(
      `- 버튼: ${buttons.join(' · ')} — 이 글자는 버튼입니다. ` +
        '누르는 자리만 만들고 링크는 제가 겁니다.',
    );
  }

  if (guideline?.colors) {
    const c = guideline.colors;
    out.push('');
    out.push(
      `- 색: 강조 ${c.primary}, 글자 ${c.ink}, 보조 글자 ${c.inkMuted}, ` +
        `바탕 ${c.canvas}, 강조색 위 글자 ${c.onPrimary}`,
    );
    if (guideline.rounded) {
      // 어느 값이 버튼이고 어느 값이 카드인지는 지침의 구성 요소가 정한다.
      // 여기서 다시 정하면 두 문서가 어긋난다 — 실제로 지침은 버튼을 md 로
      // 두었는데 프롬프트는 sm 이라고 적어 내보낸 적이 있다. 쓸 수 있는
      // 값만 알려 주고 배정은 지침에 맡긴다.
      out.push(
        `- 모서리: ${roundedSteps(guideline.rounded).join('·')}px 과 완전한 둥근 모서리만 씁니다`,
      );
    }
    const t = guideline.typography;
    if (t) {
      out.push(
        `- 글자: 본문 ${t.bodySize}px 굵기 ${t.bodyWeight}, ` +
          `굵기는 ${(t.weights ?? []).join('·')} 만 씁니다`,
      );
    }
  }

  const copy = clean(section?.copy);
  if (copy) {
    out.push('');
    out.push('아래가 이 자리에 들어갈 문구입니다. 글자를 늘리거나 바꾸지 마세요.');
    // 줄 앞의 "제목:" "설명:" "카드1 —" 은 그 줄이 무슨 역할인지 적어 둔 것이지
    // 화면에 찍을 글자가 아니다. 말해 두지 않으면 그대로 찍힌다.
    out.push('줄 앞의 `제목:` `설명:` `항목1 —` `카드1 —` 같은 말은 그 줄이 무슨');
    out.push('역할인지 알려 주는 표시입니다. 화면에 찍지 마세요.');
    out.push('"""');
    // [ ] 는 버튼 표기다. 그대로 두면 대괄호까지 찍힌다. 다만 아직 안 정해진
    // 값의 자리에도 대괄호가 쓰이므로, 버튼으로 가려낸 것만 괄호를 턴다.
    out.push(...stripButtonBrackets(copy, buttons).split('\n').map((l) => l.trimEnd()));
    out.push('"""');
  } else {
    out.push('');
    out.push('문구는 아직 정하지 않았습니다. 자리 표시용으로 짧게 채워 주세요.');
  }

  const donts = (guideline?.donts ?? []).slice(0, MAX_DONTS);
  if (donts.length) {
    out.push('');
    out.push('하지 말 것:');
    for (const d of donts) out.push(`- ${d}`);
  }

  if (guideline?.name) {
    out.push('');
    out.push(
      `스타일 참조에서 디자인 지침 「${guideline.name}」 을 고른 상태로 실행하세요.`,
    );
  }

  return out.join('\n');
}

/* ── AI 수정 — 이미 넣은 마켓플레이스 블록을 지침에 맞게 ───────── */

/**
 * 지켜야 할 기준. 자리마다 똑같은 부분이라 한 번 만들어 돌려 쓴다.
 *
 * AI 수정에는 디자인 지침을 붙일 수 없다. 그래서 지침이 말하던 것을 여기서
 * 전부 다시 말해야 한다. 하나라도 빠지면 그 항목만 식스샵 기본값으로 남아,
 * 옆에 놓인 AI 블록과 어긋난다.
 */
export function styleSpec(guideline) {
  if (!guideline) return [];

  const c = guideline.colors ?? {};
  const t = guideline.typography ?? {};
  const out = [];

  const colors = [
    c.canvas && `바탕 ${c.canvas}`,
    c.ink && `글자 ${c.ink}`,
    c.inkMuted && `보조 글자 ${c.inkMuted}`,
    c.primary && `강조 ${c.primary}`,
    c.onPrimary && `강조색 위 글자 ${c.onPrimary}`,
    c.hairline && `경계선 ${c.hairline}`,
  ].filter(Boolean);
  if (colors.length) out.push(`- 색: ${colors.join(', ')}`);

  if (t.bodyFont) {
    const weights = (t.weights ?? [])
      .map((w) => `${weightName(w)}(${w})`)
      .join('·');
    out.push(
      `- 글자: ${t.bodyFont} 본문 ${t.bodySize}px ${weightName(t.bodyWeight)}` +
        (weights ? `. 쓰는 굵기는 ${weights} 뿐이고 그 사이 값은 쓰지 않습니다` : ''),
    );
  }
  if (t.bodyLineHeight) {
    out.push(`- 행간 ${t.bodyLineHeight}, 자간 ${t.bodyLetterSpacing ?? '0'}`);
  }

  const steps = roundedSteps(guideline.rounded);
  if (steps.length) out.push(`- 모서리: ${steps.join('·')}px 만 씁니다`);

  const s = guideline.spacing ?? {};
  if (s.section) {
    out.push(`- 여백: 섹션 사이 ${s.section}px, 요소 묶음 사이 ${s.lg ?? s.md}px`);
  }

  if (guideline.animation) {
    out.push(
      guideline.animation === '없음'
        ? '- 나타나는 효과나 움직임은 넣지 않습니다'
        : `- 등장 효과는 ${guideline.animation} 하나만 씁니다`,
    );
  }

  // 수정 쪽은 기댈 지침이 없으니 금지 규칙을 줄이지 않는다.
  const donts = guideline.donts ?? [];
  if (donts.length) {
    out.push('- 하지 말 것:');
    for (const d of donts) out.push(`  · ${d}`);
  }

  return out;
}

/**
 * 자리 하나를 무엇 때문에 고치는가. 기준을 뺀 나머지 부분이다.
 * 문서에 기준을 한 번만 싣고 자리마다 이 부분만 적을 수 있게 갈라 둔다.
 */
export function modifyBody(section, { company = '', page = null } = {}) {
  const out = [];
  const purpose = clean(section?.purpose) || '이 자리';

  out.push(`"${purpose}" 자리에 넣은 블록을 아래 기준에 맞게 바꿔 주세요.`);
  out.push('');
  // 폼 응답 저장이나 게시판 목록처럼 기능이 걸린 블록이 있다. 겉모습만
  // 바꾸라고 못박아 두지 않으면 고쳐 놓고 다시 붙여야 한다.
  out.push('- 구조와 기능은 그대로 둡니다. 색·굵기·여백·모서리만 바꿉니다.');
  out.push('- 이미 넣어 둔 문구와 사진은 건드리지 않습니다.');

  const where = [company && `${company} 웹사이트`, page?.title && `${page.title} 페이지`]
    .filter(Boolean)
    .join(' · ');
  if (where) out.push(`- 어디에 쓰나: ${where}`);

  const note = clean(section?.note);
  if (note) out.push(`- 이 자리가 하는 일: ${note}`);

  if (section?.needsCustomTone) {
    out.push('- 이 블록은 사이트 계열 밖이라 색과 여백이 특히 어긋나 있습니다.');
  }

  return out.join('\n');
}

/** 붙여넣기 한 번으로 끝나도록 기준까지 합친 전문. */
export function modifyPrompt(section, { guideline = null, company = '', page = null } = {}) {
  const spec = styleSpec(guideline);
  const body = modifyBody(section, { company, page });
  if (!spec.length) return body;
  return `${body}\n\n지켜야 할 기준:\n${spec.join('\n')}`;
}
