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

const lines = (s) => String(s ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

export function buildPack(data, catalog) {
  const ordered = [...(data.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

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

      return {
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
        buttons: [...copy.matchAll(BUTTON)].map((m) => m[1]),
        copy,
        note: String(s.note ?? ''),
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
    ]),
  );

  // 엑셀은 BOM 이 없으면 한글을 깨서 연다.
  return `﻿${[head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
