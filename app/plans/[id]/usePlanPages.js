'use client';

/**
 * 페이지 구성을 손으로 고치는 한 벌의 상태.
 *
 * 목록형 편집 화면과 캔버스가 같은 규칙으로 고치고 같은 곳에 저장해야 하므로
 * 여기 모아 둔다. 저장은 버튼을 눌러야 한 번에 나간다. 캔버스에서 이 블록
 * 저 블록 눌러 가며 고치는 동안 요청이 계속 나가면 곤란하다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** 저장하지 않은 변경이 있는지 비교한다. 자리 순서까지 그대로 봐야 한다. */
const fingerprint = (pages) =>
  JSON.stringify(
    pages.map((p) => [
      p.index,
      (p.sections ?? []).map((s) => [s.fill, s.blockId, s.purpose, s.note, s.copy, s.needsCustomTone]),
    ]),
  );

export const EMPTY_SECTION = {
  purpose: '새 자리',
  fill: '마켓플레이스 블록',
  blockId: '',
  note: '',
  copy: '',
  needsCustomTone: false,
};

const sortPages = (pages) => [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

export function usePlanPages(id) {
  const [plan, setPlan] = useState(null);
  const [pages, setPages] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const original = useRef('');

  useEffect(() => {
    fetch(`/api/plans/${id}?raw=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('기획서를 찾지 못했습니다.'))))
      .then((row) => {
        const ordered = sortPages(row.data.pages ?? []);
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

  // 저장하지 않은 변경이 있으면 나가려 할 때 붙잡는다.
  useEffect(() => {
    if (!dirty) return undefined;
    const stop = (e) => e.preventDefault();
    addEventListener('beforeunload', stop);
    return () => removeEventListener('beforeunload', stop);
  }, [dirty]);

  const edit = useCallback((pageIndex, fn) => {
    setSaved('');
    setPages((all) =>
      all.map((p) => (p.index === pageIndex ? { ...p, sections: fn(p.sections ?? []) } : p)),
    );
  }, []);

  const move = useCallback(
    (pageIndex, at, to) =>
      edit(pageIndex, (sections) => {
        if (to < 0 || to >= sections.length) return sections;
        const next = [...sections];
        const [item] = next.splice(at, 1);
        next.splice(to, 0, item);
        return next;
      }),
    [edit],
  );

  const remove = useCallback(
    (pageIndex, at) => edit(pageIndex, (sections) => sections.filter((_, i) => i !== at)),
    [edit],
  );

  const patch = useCallback(
    (pageIndex, at, fields) =>
      edit(pageIndex, (sections) => sections.map((s, i) => (i === at ? { ...s, ...fields } : s))),
    [edit],
  );

  const insert = useCallback(
    (pageIndex, at) =>
      edit(pageIndex, (sections) => [
        ...sections.slice(0, at),
        { ...EMPTY_SECTION },
        ...sections.slice(at),
      ]),
    [edit],
  );

  /** 자리 하나를 다른 페이지 맨 아래로 옮긴다. 끌어 옮기는 대신 쓰는 길이다. */
  const moveToPage = useCallback((fromIndex, at, toIndex) => {
    if (fromIndex === toIndex) return;
    setSaved('');
    setPages((all) => {
      const from = all.find((p) => p.index === fromIndex);
      const item = from?.sections?.[at];
      if (!item) return all;
      return all.map((p) => {
        if (p.index === fromIndex) {
          return { ...p, sections: p.sections.filter((_, i) => i !== at) };
        }
        if (p.index === toIndex) return { ...p, sections: [...(p.sections ?? []), item] };
        return p;
      });
    });
  }, []);

  const save = useCallback(async () => {
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
      return false;
    }

    // 서버가 카탈로그로 다시 채운 값(블록 이름·계열)을 그대로 받는다.
    // 없는 블록을 넣었으면 그 자리는 빠진 채로 돌아온다.
    const back = sortPages(body.pages ?? []);
    original.current = fingerprint(back);
    setPages(back);
    setSaved(
      `저장했습니다. 페이지 ${back.length}개 · 블록 ${body.counts?.blocks ?? 0}종 · 배치 ${body.counts?.placements ?? 0}회.` +
        (body.problems?.length ? ` 없는 블록 ${body.problems.length}건은 빠졌습니다.` : ''),
    );
    return true;
  }, [id, pages]);

  const revert = useCallback(() => {
    if (!plan) return;
    const ordered = sortPages(plan.data.pages ?? []);
    setPages(ordered);
    original.current = fingerprint(ordered);
    setSaved('');
  }, [plan]);

  return {
    plan, pages, dirty, saving, saved, error, setError,
    move, remove, patch, insert, moveToPage, save, revert,
  };
}
