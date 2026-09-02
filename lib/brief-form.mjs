/**
 * 상담 폼 값과 상담 텍스트 사이를 오간다.
 *
 * 파이프라인은 텍스트를 읽고, 화면은 항목별 값을 다룬다. 두 방향이 어긋나면
 * 예전에 만든 기획서의 상담 내용을 다시 열 수 없게 되므로 한곳에 모아 둔다.
 */

import form from '../data/brief-form.json' with { type: 'json' };

export { form };

// 입력이 아니라 계산해서 붙이는 묶음. 되돌릴 때는 통째로 건너뛴다.
// 그러지 않으면 이 목록이 자유 메모로 섞여 들어가 되돌릴수록 메모가 불어난다.
const DERIVED_SECTION = '상담에서 확인하지 못한 항목';

/** 폼 값을 파이프라인이 읽을 텍스트로. 빈 항목은 미확인으로 남긴다. */
export function toBriefText(values) {
  const lines = [];

  for (const section of form.sections) {
    const entries = section.fields
      .map((field) => [field, values[field.id]])
      .filter(([, v]) => v && String(v).trim());

    if (!entries.length) continue;
    lines.push(`[${section.label}]`);
    for (const [field, value] of entries) {
      lines.push(`${field.label}: ${Array.isArray(value) ? value.join(', ') : value}`);
    }
    lines.push('');
  }

  const missing = form.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.required && !String(values[f.id] ?? '').trim())
    .map((f) => f.label);

  if (missing.length) lines.push(`[${DERIVED_SECTION}]\n${missing.join(', ')}`);
  return lines.join('\n');
}

/**
 * 텍스트를 폼 값으로 되돌린다.
 *
 * 폼 값을 따로 저장하기 전에 만든 기획서도 열 수 있어야 한다. 라벨을 실마리로
 * 되짚고, 못 알아본 줄은 버리지 않고 자유 메모에 모아 둔다.
 */
export function parseBriefText(text) {
  const byLabel = new Map();
  for (const section of form.sections) {
    for (const field of section.fields) byLabel.set(field.label, field);
  }

  const values = {};
  const leftovers = [];
  let skipping = false;

  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const header = trimmed.match(/^\[(.*)\]$/);
    if (header) {
      skipping = header[1] === DERIVED_SECTION;
      continue;
    }
    if (skipping) continue;

    const at = trimmed.indexOf(':');
    const field = at > 0 ? byLabel.get(trimmed.slice(0, at).trim()) : null;
    if (!field) {
      leftovers.push(trimmed);
      continue;
    }

    const raw = trimmed.slice(at + 1).trim();
    values[field.id] = field.type === 'multiselect' ? raw.split(/,\s*/).filter(Boolean) : raw;
  }

  const notes = leftovers.join('\n').trim();
  if (notes) values.rawNotes = [values.rawNotes, notes].filter(Boolean).join('\n');
  return values;
}

/** 아직 못 채운 필수 항목. */
export function missingRequired(values) {
  return form.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.required && !String(values[f.id] ?? '').trim());
}
