/**
 * 콘텐츠 팩 — 식스샵에서 실제로 조립할 때 옆에 두고 보는 목록.
 *
 * 기획서는 왜 이렇게 만드는지를 설명하는 문서라 읽기 좋게 짜여 있다.
 * 조립할 때 필요한 것은 다르다. 자리마다 어떤 블록을 찾아 넣고, 무슨 문구를
 * 붙여 넣고, 무엇이 아직 안 정해졌는지가 한 줄씩 있어야 한다.
 *
 * 이미지 규격(가로·세로 픽셀)은 마켓플레이스 자료에 없다. 없는 것을 지어내면
 * 그대로 잘못 촬영하게 되므로, 이미지가 들어가는 자리라는 것만 표시하고
 * 규격은 블록을 직접 열어 확인하도록 미리보기 링크를 함께 둔다.
 */

import { blockLabel, previewUrls } from './catalog.mjs';
import { aiPrompt, aiSpec, hasSpec } from './aiprompt.mjs';

/** 이 분류의 블록은 그림이 있어야 자리가 찬다. */
export const IMAGE_CATEGORIES = new Set([
  '메인 배너',
  '갤러리',
  '상품',
  '인스타그램',
  '띠배너',
  '팝업',
]);

/** 아직 고객사 자료를 못 받아 비워 둔 자리인지. 문구에 그렇게 적어 두었다. */
const PENDING = /확인\s*필요|확정\s*후|확정\s*자료|미확정/;

/** 문구 안의 [버튼] 표기. 조립할 때 링크를 걸어야 하는 자리다. */
const BUTTON = /\[([^\]\n]{1,40})\]/g;

/**
 * 대괄호 안에 들어 있어도 버튼이 아닌 것.
 *
 * 대괄호가 두 가지로 쓰이고 있었다. 버튼 표기이기도 하고 "[확인 필요]",
 * "[메뉴명 1]" 처럼 아직 안 정해진 값의 자리이기도 했다. 그대로 두면
 * AI 블록 프롬프트가 "'확인 필요' 라는 글자는 버튼입니다" 라고 시키게 된다.
 * 실제로 '버튼 · 버튼', '확인 필요 · 확인 필요' 같은 것이 버튼으로 세어졌다.
 */
const NOT_BUTTON = [
  PENDING,                       // 확인 필요 · 확정 후 · 미확정
  /^버튼\s*\d*$/,                 // [버튼] 이라고 쓴 자리 표시 그 자체
  /^[^\s]*(명|이름|번호|주소|산지|시간|일자|날짜)\s*\d*$/, // [메뉴명 1] [원두명] [산지]
  /^○+|^[-–—\s]*$/,              // ○○ 같은 빈칸 표시
];

/** 이 대괄호가 실제로 누르는 자리를 뜻하는가. */
export function isButton(label) {
  const s = String(label ?? '').trim();
  return s.length > 0 && !NOT_BUTTON.some((re) => re.test(s));
}

const lines = (s) => String(s ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

export function buildPack(data, catalog, { company = '' } = {}) {
  const ordered = [...(data.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const guideline = data.guideline ?? null;

  const pages = ordered.map((page) => ({
    index: page.index,
    title: page.title,
    slug: page.slug,
    goal: page.goal ?? '',
    sections: (page.sections ?? []).map((s, at) => {
      const block = s.blockId ? catalog.byId.get(s.blockId) : null;
      const categories = block?.categories ?? [];
      const copy = String(s.copy ?? '');
      // fill 이 없는 것은 이 기능이 생기기 전에 만든 기획서다.
      const fill = s.fill ?? (s.blockId ? '마켓플레이스 블록' : '식스샵 기본 기능');

      const row = {
        at: at + 1,
        purpose: s.purpose ?? '',
        fill,
        blockId: s.blockId ?? '',
        blockName: s.blockName ?? block?.name ?? '',
        blockStyle: s.blockStyle ?? block?.style ?? null,
        officialPartner: Boolean(s.officialPartner ?? block?.officialPartner),
        label:
          fill === '마켓플레이스 블록'
            ? blockLabel(
                s.blockName ?? block?.name,
                s.blockStyle ?? block?.style,
                Boolean(s.officialPartner ?? block?.officialPartner),
              )
            : fill,
        previews: previewUrls(s.previewUrl ?? block?.previewUrl),
        thumbnail: s.thumbnail ?? block?.thumbnail ?? null,
        categories,
        needsCustomTone: Boolean(s.needsCustomTone),
        needsImage: categories.some((c) => IMAGE_CATEGORIES.has(c)),
        pending: PENDING.test(copy) || PENDING.test(String(s.note ?? '')),
        buttons: [...copy.matchAll(BUTTON)].map((m) => m[1].trim()).filter(isButton),
        copy,
        note: String(s.note ?? ''),
      };

      if (fill !== 'AI 블록') return row;

      // AI 블록 자리에만 프롬프트가 붙는다. 색·모서리는 지침에서 오고,
      // 지침이 아직 없으면 그 줄이 빠진 채로 나온다. 색을 지어내지 않는다.
      return {
        ...row,
        spec: aiSpec(s),
        // 배치 지시 없이 목적·메모만으로 만든 프롬프트인지. 손볼 자리다.
        thinPrompt: !hasSpec(s),
        prompt: aiPrompt({ ...row, ai: s.ai }, { guideline, company, page }),
      };
    }),
  }));

  const all = pages.flatMap((p) => p.sections);

  return {
    pages,
    summary: {
      pages: pages.length,
      slots: all.length,
      blocks: new Set(all.filter((s) => s.blockId).map((s) => s.blockId)).size,
      ai: all.filter((s) => s.fill === 'AI 블록').length,
      // 배치 지시가 없어 목적·메모만으로 만든 프롬프트. 넣기 전에 손봐야 한다.
      thinPrompts: all.filter((s) => s.thinPrompt).length,
      guideline: Boolean(guideline),
      basic: all.filter((s) => s.fill === '식스샵 기본 기능').length,
      images: all.filter((s) => s.needsImage).length,
      tone: all.filter((s) => s.needsCustomTone).length,
      pending: all.filter((s) => s.pending).length,
      buttons: all.reduce((n, s) => n + s.buttons.length, 0),
    },
  };
}

/* ── 내보내기 ─────────────────────────────────────────────── */

const flags = (s) =>
  [
    s.needsImage ? '이미지 필요' : null,
    s.needsCustomTone ? '톤 커스텀' : null,
    s.pending ? '자료 미확정' : null,
  ].filter(Boolean);

export function packMarkdown(pack, { company, style, assets = [] } = {}) {
  const out = [];
  const n = pack.summary;

  out.push(`# ${company || '기획서'} 콘텐츠 팩`);
  out.push('');
  out.push(
    `페이지 ${n.pages} · 자리 ${n.slots} · 블록 ${n.blocks}종` +
      (style ? ` · ${style} 계열` : ''),
  );
  out.push(
    `AI 블록으로 만들 자리 ${n.ai} · 식스샵 기본 기능 ${n.basic}`,
  );
  if (n.ai > 0) {
    out.push(
      n.guideline
        ? 'AI 블록 자리에는 프롬프트를 붙여 두었습니다. 스타일 참조에 디자인 지침을 물린 상태로 넣으세요.'
        : '디자인 지침이 아직 없어 프롬프트에 색·모서리 값이 빠져 있습니다.',
    );
    if (n.thinPrompts > 0) {
      out.push(`이 중 ${n.thinPrompts}개는 배치 지시 없이 만든 얇은 프롬프트입니다.`);
    }
  }
  out.push(
    `이미지 필요 ${n.images} · 톤 커스텀 ${n.tone} · 자료 미확정 ${n.pending} · 버튼 ${n.buttons}`,
  );
  out.push('');
  out.push(
    '이미지 규격(가로·세로 픽셀)은 마켓플레이스 자료에 없습니다. ' +
      '블록 미리보기를 열어 직접 확인하세요.',
  );

  if (assets.length) {
    out.push('');
    out.push('## 고객사에서 받아야 할 자료');
    out.push('');
    for (const a of assets) out.push(`- [ ] ${a}`);
  }

  for (const page of pack.pages) {
    out.push('');
    out.push(`## ${page.title} \`${page.slug}\``);
    if (page.goal) out.push(`\n${page.goal}`);

    for (const s of page.sections) {
      const mark = flags(s);
      out.push('');
      out.push(`### ${String(s.at).padStart(2, '0')}. ${s.purpose}`);
      out.push('');

      out.push(
        `- 채우는 법: ${s.label}` +
          (s.fill === 'AI 블록' ? ' — 마켓플레이스에 맞는 블록이 없어 새로 만듭니다' : '') +
          (s.fill === '식스샵 기본 기능' ? ' — 마켓플레이스 블록 아님' : ''),
      );
      if (s.blockId) out.push(`- blockId: \`${s.blockId}\``);
      for (const url of s.previews) out.push(`- 미리보기: ${url}`);
      if (mark.length) out.push(`- 확인: ${mark.join(' · ')}`);
      if (s.buttons.length) out.push(`- 버튼: ${s.buttons.join(' · ')}`);
      if (s.note) out.push(`- 메모: ${s.note}`);

      if (s.copy) {
        out.push('');
        out.push('```');
        out.push(...lines(s.copy));
        out.push('```');
      }

      if (s.prompt) {
        out.push('');
        out.push(
          s.thinPrompt
            ? '**AI 블록 프롬프트** — 배치 지시 없이 만든 것이라 얇습니다. 넣기 전에 손보세요.'
            : '**AI 블록 프롬프트** — 식스샵 AI 블록 입력칸에 그대로 넣습니다.',
        );
        out.push('');
        out.push('```');
        out.push(...s.prompt.split('\n'));
        out.push('```');
      }
    }
  }

  out.push('');
  return out.join('\n');
}

const cell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function packCsv(pack) {
  const head = [
    '페이지', '순번', '자리', '채우는법', '블록', '계열', '공식파트너',
    '이미지필요', '톤커스텀', '자료미확정', '버튼', '문구', '메모', 'blockId', '미리보기',
    'AI프롬프트',
  ];

  const rows = pack.pages.flatMap((page) =>
    page.sections.map((s) => [
      page.title,
      s.at,
      s.purpose,
      s.fill,
      s.fill === '마켓플레이스 블록' ? s.label : '',
      s.blockStyle ?? '',
      s.officialPartner ? 'Y' : '',
      s.needsImage ? 'Y' : '',
      s.needsCustomTone ? 'Y' : '',
      s.pending ? 'Y' : '',
      s.buttons.join(' / '),
      s.copy,
      s.note,
      s.blockId,
      s.previews.join(' '),
      s.prompt ?? '',
    ]),
  );

  // 엑셀은 BOM 이 없으면 한글을 깨서 연다.
  return `﻿${[head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
