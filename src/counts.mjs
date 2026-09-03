/**
 * 페이지 구성에서 작업량을 센다.
 *
 * 세는 일은 전부 여기서 한다. 모델에게 세라고 시키면 본문과 요약이 어긋난다
 * (실제로 "톤 커스텀 8종"인데 예산 검토는 "개별 조정 비용이 들지 않는다"고
 * 쓴 적이 있다). 그래서 문서도, 화면도, 예산 판단도 이 함수 하나를 본다.
 */

/**
 * 모든 페이지에 같은 블록으로 들어가는 자리는 전역 요소다.
 * 헤더와 푸터가 대표적인데, 페이지마다 세면 블록 수가 부풀고 견적이 틀어진다.
 */
export function splitGlobals(pages) {
  const usable = pages.filter((p) => p.sections?.length);
  if (usable.length < 2) return { globals: [], pages };

  // 자리까지 같아야 전역이다. 맨 위에 오는 헤더와 맨 아래 푸터가 그렇다.
  // 단순히 "모든 페이지에 있는 블록"으로 잡으면 문의 폼처럼 여러 페이지에
  // 반복되는 본문 블록까지 끌어올려 페이지 구성이 비어 버린다.
  const sameAt = (pick) => {
    const ids = usable.map((p) => pick(p.sections)?.blockId);
    return ids[0] && ids.every((id) => id === ids[0]) ? ids[0] : null;
  };

  const headId = sameAt((sections) => sections[0]);
  const footId = sameAt((sections) => sections[sections.length - 1]);
  const globalIds = new Set([headId, footId].filter(Boolean));
  if (!globalIds.size) return { globals: [], pages };

  const globals = [];
  const trimmed = pages.map((page) => ({
    ...page,
    sections: (page.sections ?? []).filter((s, i, all) => {
      const atEdge = i === 0 || i === all.length - 1;
      if (!atEdge || !globalIds.has(s.blockId)) return true;
      if (!globals.some((g) => g.blockId === s.blockId)) globals.push(s);
      return false;
    }),
  }));

  return { globals, pages: trimmed };
}

export function summarize(data) {
  const raw = data.pages ?? [];
  const { globals, pages } = splitGlobals(raw);

  const all = [...globals, ...pages.flatMap((p) => p.sections ?? [])];
  const placed = all.filter((s) => s.blockId);
  const custom = placed.filter((s) => s.needsCustomTone);

  return {
    pages: raw.length,
    // 서로 다른 블록이 몇 종인지가 실제 작업량이다. 배치 횟수는 참고값.
    blocks: new Set(placed.map((s) => s.blockId)).size,
    placements: placed.length,
    globals: globals.length,
    customTone: new Set(custom.map((s) => s.blockId)).size,
    customPlacements: custom.length,
  };
}

/**
 * 예산과 일정에 실제로 영향을 주는 것만 한 줄로. 예산 검토 단계에 넣어 준다.
 * 모델이 직접 세면 틀리므로, 센 결과를 문장으로 만들어 건네준다.
 */
export function workloadNote(counts) {
  const parts = [
    `페이지 ${counts.pages}개`,
    `블록 ${counts.blocks}종을 ${counts.placements}회 배치`,
    `그중 헤더·푸터처럼 전 페이지 공통 자리 ${counts.globals}개는 한 번만 만듭니다`,
  ];

  if (counts.customTone > 0) {
    parts.push(
      `계열 밖 블록이라 색·여백을 손봐야 하는 자리가 ${counts.customTone}종 ` +
        `${counts.customPlacements}회입니다`,
    );
  } else {
    parts.push('계열 밖 블록이 없어 색·여백을 개별로 손보는 작업이 없습니다');
  }

  return parts.join(', ') + '.';
}
