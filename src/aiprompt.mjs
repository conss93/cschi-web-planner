/**
 * AI 블록 프롬프트 — 식스샵 "AI 블록 생성" 입력칸에 그대로 붙여넣는 글.
 *
 * 마켓플레이스에 맞는 블록이 없는 자리는 AI 블록으로 만든다. 그때 입력칸에
 * "인물 소개 섹션 만들어줘" 라고만 쓰면 매번 다른 것이 나온다. 배치·이미지
 * 비율·모바일에서 접히는 모양까지 적어야 두 번 세 번 다시 돌리지 않는다.
 *
 * 색과 모서리 값은 **모델이 아니라 코드가** 넣는다. 디자인 지침에 이미 정해
 * 둔 값이 있는데 모델이 프롬프트에 다른 색을 적으면 두 문서가 어긋난다.
 * 지침이 아직 없으면 색 줄을 아예 빼고, 지어내지 않는다.
 *
 * 문구도 코드가 원문 그대로 넣는다. 모델에게 다시 쓰게 하면 브리프에 없는
 * 수치가 슬며시 끼어든다.
 */

/** 프롬프트에 넣을 금지 규칙 수. 다 넣으면 정작 만들 것이 묻힌다. */
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
      const steps = Object.values(guideline.rounded).filter((v) => v < 999);
      out.push(`- 모서리: ${steps.join('·')}px 과 완전한 둥근 모서리만 씁니다`);
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
