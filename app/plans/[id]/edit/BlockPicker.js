'use client';

/**
 * 블록 고르기 창.
 *
 * 톤 계열이 정해져 있으면 그 계열과 커뮤니티 블록만 보여준다. 다른 계열을
 * 섞으면 여백과 글자 크기가 어긋나 손질이 늘기 때문이다. 골라야 할 것은
 * 이름보다 생김새라 미리보기 그림을 크게 둔다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { thumbUrl } from '../../../../lib/thumb.mjs';
import { previewUrls } from '../../../../src/catalog.mjs';

/** 마켓플레이스 그림. 못 불러오면 깨진 아이콘 대신 빈 칸으로 둔다. */
export function Shot({ src, className = 'shot' }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return <span className={className}><span className="noshot">미리보기 없음</span></span>;
  return (
    <span className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl(src)}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

export default function BlockPicker({ style, current, onPick, onClose }) {
  const [blocks, setBlocks] = useState(null);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const box = useRef(null);

  useEffect(() => {
    fetch(`/api/blocks${style ? `?style=${encodeURIComponent(style)}` : ''}`)
      .then((r) => r.json())
      .then((body) => {
        setBlocks(body.blocks);
        setCategories(body.categories);
      })
      .catch(() => setBlocks([]));
  }, [style]);

  useEffect(() => {
    const key = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [onClose]);

  const shown = useMemo(() => {
    if (!blocks) return [];
    const q = query.trim().toLowerCase();
    return blocks.filter((b) => {
      if (category && !b.categories.includes(category)) return false;
      if (!q) return true;
      return `${b.name} ${b.summary} ${b.categories.join(' ')}`.toLowerCase().includes(q);
    });
  }, [blocks, query, category]);

  return (
    <div
      className="sheet"
      onMouseDown={(e) => e.target === box.current && onClose()}
      ref={box}
      role="dialog"
      aria-label="블록 고르기"
    >
      <div className="panel">
        <div className="panel-head">
          <strong>블록 고르기</strong>
          <span className="muted">
            {style ? `${style} 계열 + 커뮤니티 블록` : '전체 블록'}
            {blocks ? ` · ${shown.length}개` : ''}
          </span>
          <button type="button" className="btn ghost" onClick={onClose}>닫기</button>
        </div>

        <div className="panel-filter">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름이나 설명으로 찾기"
            autoFocus
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">전체 분류</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" className="btn ghost" onClick={() => onPick(null)}>
            블록 없이 (식스샵 기본 기능)
          </button>
        </div>

        <div className="panel-body">
          {!blocks && <p className="muted">불러오는 중…</p>}
          {blocks && shown.length === 0 && <p className="muted">해당하는 블록이 없습니다.</p>}

          <ul className="blockgrid">
            {shown.map((b) => (
              <li key={b.blockId}>
                <button
                  type="button"
                  className={b.blockId === current ? 'blockcard on' : 'blockcard'}
                  onClick={() => onPick(b)}
                >
                  <Shot src={b.thumbnail} />
                  <span className="blockname">
                    {b.name}
                    {b.officialPartner && <span className="star" title="식스샵 공식 파트너"> ★</span>}
                  </span>
                  <span className="blockmeta">
                    {b.style ?? '스타일 없음'}
                    {b.categories.length ? ` · ${b.categories.join('·')}` : ''}
                  </span>
                  {b.summary && <span className="blocksum">{b.summary}</span>}
                </button>
                {previewUrls(b.previewUrl).map((url, i, all) => (
                  <a
                    key={url}
                    className="preview"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {all.length > 1 ? `실제 화면에서 보기 ${i + 1}` : '실제 화면에서 보기'}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
