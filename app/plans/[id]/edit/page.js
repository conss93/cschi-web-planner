'use client';

/**
 * 섹션 편집 화면.
 *
 * 모델이 짠 구성을 손으로 다듬는 곳이다. 자리를 옮기고, 빼고, 다른 블록으로
 * 바꾸고, 문구를 고친다. 페이지를 새로 만들거나 지우는 일은 여기서 하지
 * 않는다. 그건 사이트맵이 정하는 것이고, 바꾸려면 상담 내용을 고쳐 다시
 * 만드는 쪽이 맞다.
 */

import { useCallback, useEffect, useMemo, useRef, useState, use } from 'react';
import BlockPicker, { Shot } from './BlockPicker';

/** 저장하지 않은 변경이 있는지 비교할 때 쓴다. 자리 순서까지 그대로 봐야 한다. */
const fingerprint = (pages) =>
  JSON.stringify(
    pages.map((p) => [
      p.index,
      (p.sections ?? []).map((s) => [s.blockId, s.purpose, s.note, s.copy, s.needsCustomTone]),
    ]),
  );

const EMPTY = { purpose: '새 자리', blockId: '', note: '', copy: '', needsCustomTone: false };

export default function EditPage({ params }) {
  const { id } = use(params);

  const [plan, setPlan] = useState(null);
  const [pages, setPages] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [picking, setPicking] = useState(null); // { page, section }
  const original = useRef('');

  useEffect(() => {
    fetch(`/api/plans/${id}?raw=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('기획서를 찾지 못했습니다.'))))
      .then((row) => {
        const ordered = [...(row.data.pages ?? [])].sort((a, b) => a.index - b.index);
        setPlan(row);
        setPages(ordered);
        original.current = fingerprint(ordered);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const dirty = useMemo(
    () => Boolean(plan) && fingerprint(pages) !== original.current,
    [pages, plan],
  );

  // 나가려 할 때 저장하지 않은 변경이 있으면 붙잡는다.
  useEffect(() => {
    if (!dirty) return;
    const stop = (e) => e.preventDefault();
    addEventListener('beforeunload', stop);
    return () => removeEventListener('beforeunload', stop);
  }, [dirty]);

  /** 한 페이지의 자리 목록을 바꾼다. */
  const edit = useCallback((pageIndex, fn) => {
    setSaved('');
    setPages((all) =>
      all.map((p) => (p.index === pageIndex ? { ...p, sections: fn(p.sections ?? []) } : p)),
    );
  }, []);

  const move = (pageIndex, at, to) =>
    edit(pageIndex, (sections) => {
      if (to < 0 || to >= sections.length) return sections;
      const next = [...sections];
      const [item] = next.splice(at, 1);
      next.splice(to, 0, item);
      return next;
    });

  const remove = (pageIndex, at) =>
    edit(pageIndex, (sections) => sections.filter((_, i) => i !== at));

  const patch = (pageIndex, at, fields) =>
    edit(pageIndex, (sections) =>
      sections.map((s, i) => (i === at ? { ...s, ...fields } : s)),
    );

  const insert = (pageIndex, at) =>
    edit(pageIndex, (sections) => [
      ...sections.slice(0, at),
      { ...EMPTY },
      ...sections.slice(at),
    ]);

  async function save() {
    setSaving(true);
    setError('');
    const res = await fetch(`/api/plans/${id}/pages`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pages }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? '저장하지 못했습니다.');
      return;
    }
    // 서버가 카탈로그로 다시 채운 값(블록 이름·계열)을 그대로 받는다.
    // 없는 블록을 넣었으면 그 자리는 빠진 채로 돌아온다.
    const back = [...(body.pages ?? [])].sort((a, b) => a.index - b.index);
    original.current = fingerprint(back);
    setPages(back);
    setSaved(
      `저장했습니다. 페이지 ${back.length}개 · 블록 ${body.counts?.blocks ?? 0}종 · 배치 ${body.counts?.placements ?? 0}회.` +
        (body.problems?.length ? ` 없는 블록 ${body.problems.length}건은 빠졌습니다.` : ''),
    );
  }

  function revert() {
    if (!plan) return;
    const ordered = [...(plan.data.pages ?? [])].sort((a, b) => a.index - b.index);
    setPages(ordered);
    original.current = fingerprint(ordered);
    setSaved('');
  }

  if (error && !plan) {
    return (
      <div className="shell">
        <header className="topbar">
          <h1>섹션 편집</h1>
          <nav><a className="btn ghost" href="/">목록</a></nav>
        </header>
        <p className="notice">{error}</p>
      </div>
    );
  }

  if (!plan) return <div className="shell"><p style={{ paddingTop: 40 }}>불러오는 중…</p></div>;

  const total = pages.reduce((n, p) => n + (p.sections?.length ?? 0), 0);

  return (
    <div className="shell">
      <header className="topbar">
        <h1>{plan.company || '기획서'} · 섹션 편집</h1>
        <nav>
          <a className="btn ghost" href={`/plans/${id}`}>기획서로</a>
          {dirty && <button className="btn ghost" onClick={revert}>되돌리기</button>}
          <button className="btn" onClick={save} disabled={saving || !dirty}>
            {saving ? '저장 중' : dirty ? '저장' : '저장됨'}
          </button>
        </nav>
      </header>

      {error && <p className="notice">{error}</p>}
      {saved && <p className="notice">{saved}</p>}

      <p style={{ color: 'var(--muted)', maxWidth: '62ch' }}>
        자리를 옮기고, 빼고, 다른 블록으로 바꾸고, 문구를 고칩니다.
        지금 {pages.length}개 페이지에 자리 {total}개.
        저장하면 기획서 본문과 공유 링크에 바로 반영됩니다.
      </p>

      {pages.map((page) => (
        <PageEditor
          key={page.index}
          page={page}
          onMove={move}
          onRemove={remove}
          onPatch={patch}
          onInsert={insert}
          onPick={(at) => setPicking({ page: page.index, section: at })}
        />
      ))}

      {picking && (
        <BlockPicker
          style={plan.data.strategy?.style ?? null}
          current={
            pages.find((p) => p.index === picking.page)?.sections?.[picking.section]?.blockId ?? ''
          }
          onClose={() => setPicking(null)}
          onPick={(block) => {
            patch(picking.page, picking.section, {
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

function PageEditor({ page, onMove, onRemove, onPatch, onInsert, onPick }) {
  const sections = page.sections ?? [];

  return (
    <section style={{ marginTop: 48 }}>
      <div className="page-bar">
        <h2 style={{ margin: 0 }}>{page.title}</h2>
        <span className="path">{page.slug}</span>
        <span className="count">자리 {sections.length}개</span>
      </div>

      {sections.length === 0 && (
        <p style={{ color: 'var(--faint)' }}>자리가 없습니다. 아래에서 추가하세요.</p>
      )}

      <ol className="slots">
        {sections.map((s, at) => (
          <li key={at}>
            <div className="ord">
              <span>{String(at + 1).padStart(2, '0')}</span>
              <button
                type="button"
                className="icon"
                onClick={() => onMove(page.index, at, at - 1)}
                disabled={at === 0}
                aria-label="위로"
              >
                ↑
              </button>
              <button
                type="button"
                className="icon"
                onClick={() => onMove(page.index, at, at + 1)}
                disabled={at === sections.length - 1}
                aria-label="아래로"
              >
                ↓
              </button>
            </div>

            <Shot src={s.thumbnail} className="slotshot" />

            <div className="body">
              <input
                type="text"
                className="purpose"
                value={s.purpose ?? ''}
                onChange={(e) => onPatch(page.index, at, { purpose: e.target.value })}
                placeholder="이 자리가 하는 일"
              />

              <div className="blockline">
                <button type="button" className="blockchip" onClick={() => onPick(at)}>
                  {s.blockId
                    ? `${s.blockName ?? s.blockId}${s.blockStyle ? ` (${s.blockStyle})` : ''}${s.officialPartner ? ' ★' : ''}`
                    : '식스샵 기본 기능 — 블록 고르기'}
                </button>
                <label className="tonebox">
                  <input
                    type="checkbox"
                    checked={Boolean(s.needsCustomTone)}
                    onChange={(e) => onPatch(page.index, at, { needsCustomTone: e.target.checked })}
                  />
                  톤 커스텀 필요
                </label>
                <button
                  type="button"
                  className="icon danger"
                  onClick={() => onRemove(page.index, at)}
                  aria-label="이 자리 빼기"
                >
                  빼기
                </button>
              </div>

              <textarea
                value={s.note ?? ''}
                onChange={(e) => onPatch(page.index, at, { note: e.target.value })}
                placeholder="제작 메모 — 왜 이 자리인지, 무엇을 조심할지"
                rows={2}
              />
              <textarea
                className="copy"
                value={s.copy ?? ''}
                onChange={(e) => onPatch(page.index, at, { copy: e.target.value })}
                placeholder="들어갈 문구 초안"
                rows={3}
              />
            </div>

            <button
              type="button"
              className="between"
              onClick={() => onInsert(page.index, at + 1)}
              aria-label="여기에 자리 추가"
            >
              + 여기에 자리 추가
            </button>
          </li>
        ))}
      </ol>

      {sections.length === 0 && (
        <button type="button" className="btn ghost" onClick={() => onInsert(page.index, 0)}>
          자리 추가
        </button>
      )}
    </section>
  );
}
