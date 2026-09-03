'use client';

/**
 * 섹션 편집 — 목록형.
 *
 * 모델이 짠 구성을 손으로 다듬는 곳이다. 자리를 옮기고, 빼고, 사이에 끼워
 * 넣고, 다른 블록으로 바꾸고, 문구를 고친다. 페이지를 새로 만들거나 지우는
 * 일은 여기서 하지 않는다. 그건 사이트맵이 정하는 것이고, 바꾸려면 상담
 * 내용을 고쳐 다시 만드는 쪽이 맞다.
 *
 * 같은 일을 캔버스에서도 할 수 있다. 규칙과 저장은 usePlanPages 가 맡는다.
 */

import { useState, use } from 'react';
import { usePlanPages } from '../usePlanPages';
import SlotForm from '../SlotForm';
import BlockPicker, { Shot } from './BlockPicker';

export default function EditPage({ params }) {
  const { id } = use(params);
  const p = usePlanPages(id);
  const [picking, setPicking] = useState(null); // { page, section }

  if (p.error && !p.plan) {
    return (
      <div className="shell">
        <header className="topbar">
          <h1>섹션 편집</h1>
          <nav><a className="btn ghost" href="/">목록</a></nav>
        </header>
        <p className="notice">{p.error}</p>
      </div>
    );
  }

  if (!p.plan) return <div className="shell"><p style={{ paddingTop: 40 }}>불러오는 중…</p></div>;

  const total = p.pages.reduce((n, page) => n + (page.sections?.length ?? 0), 0);

  return (
    <div className="shell">
      <header className="topbar">
        <h1>{p.plan.company || '기획서'} · 섹션 편집</h1>
        <nav>
          <a className="btn ghost" href={`/plans/${id}`}>기획서로</a>
          <a className="btn ghost" href={`/plans/${id}/canvas`}>캔버스</a>
          {p.dirty && <button className="btn ghost" onClick={p.revert}>되돌리기</button>}
          <button className="btn" onClick={p.save} disabled={p.saving || !p.dirty}>
            {p.saving ? '저장 중' : p.dirty ? '저장' : '저장됨'}
          </button>
        </nav>
      </header>

      {p.error && <p className="notice">{p.error}</p>}
      {p.saved && <p className="notice">{p.saved}</p>}

      <p style={{ color: 'var(--muted)', maxWidth: '62ch' }}>
        자리를 옮기고, 빼고, 다른 블록으로 바꾸고, 문구를 고칩니다.
        지금 {p.pages.length}개 페이지에 자리 {total}개.
        저장하면 기획서 본문과 공유 링크에 바로 반영됩니다.
      </p>

      {p.pages.map((page) => (
        <section key={page.index} style={{ marginTop: 48 }}>
          <div className="page-bar">
            <h2 style={{ margin: 0 }}>{page.title}</h2>
            <span className="path">{page.slug}</span>
            <span className="count">자리 {page.sections?.length ?? 0}개</span>
          </div>

          {(page.sections?.length ?? 0) === 0 && (
            <button type="button" className="btn ghost" onClick={() => p.insert(page.index, 0)}>
              자리 추가
            </button>
          )}

          <ol className="slots">
            {(page.sections ?? []).map((s, at) => (
              <li key={at}>
                <div className="ord">{String(at + 1).padStart(2, '0')}</div>
                <Shot src={s.thumbnail} className="slotshot" />
                <SlotForm
                  section={s}
                  at={at}
                  total={page.sections.length}
                  page={page}
                  pages={p.pages}
                  onMove={p.move}
                  onRemove={p.remove}
                  onPatch={p.patch}
                  onMoveToPage={p.moveToPage}
                  onPick={(index) => setPicking({ page: page.index, section: index })}
                />
                <button
                  type="button"
                  className="between"
                  onClick={() => p.insert(page.index, at + 1)}
                >
                  + 여기에 자리 추가
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {picking && (
        <BlockPicker
          style={p.plan.data.strategy?.style ?? null}
          current={
            p.pages.find((x) => x.index === picking.page)?.sections?.[picking.section]?.blockId ?? ''
          }
          onClose={() => setPicking(null)}
          onPick={(block) => {
            p.patch(picking.page, picking.section, {
              blockId: block?.blockId ?? '',
              blockName: block?.name ?? null,
              blockStyle: block?.style ?? null,
              officialPartner: block?.officialPartner ?? false,
              thumbnail: block?.thumbnail ?? null,
              previewUrl: block?.previewUrl ?? null,
              needsCustomTone: Boolean(block && !block.style),
            });
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
