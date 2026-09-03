'use client';

/**
 * 페이지 전체를 한눈에 보는 캔버스.
 *
 * 페이지마다 블록 그림을 위에서 아래로 쌓아 나란히 늘어놓고, 휠과 드래그로
 * 훑어본다. 보기 전용이다. 고치는 것은 섹션 편집에서 한다.
 *
 * 여기 깔리는 그림은 마켓플레이스의 블록 예시 이미지지 이 고객의 사진이
 * 아니다. 시안으로 오해하기 쉬운 화면이라 그 사실을 계속 붙여 둔다.
 */

import { useCallback, useEffect, useRef, useState, use } from 'react';
import { thumbUrl } from '../../../../lib/thumb.mjs';

const MIN = 0.15;
const MAX = 2;
const clamp = (v) => Math.min(MAX, Math.max(MIN, v));

/** 페이지 카드 한 장의 폭. 블록 그림도 이 폭에 맞춘다. */
const CARD = 320;
const GAP = 56;

export default function CanvasPage({ params }) {
  const { id } = use(params);

  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [labels, setLabels] = useState(true);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });

  const frame = useRef(null);
  const stage = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    fetch(`/api/plans/${id}?raw=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('기획서를 찾지 못했습니다.'))))
      .then(setPlan)
      .catch((err) => setError(err.message));
  }, [id]);

  const pages = plan
    ? [...(plan.data.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    : [];

  /** 전체가 화면에 들어오도록 맞춘다. */
  const fit = useCallback(() => {
    const box = frame.current?.getBoundingClientRect();
    const inner = stage.current;
    if (!box || !inner) return;

    const w = inner.scrollWidth;
    const h = inner.scrollHeight;
    if (!w || !h) return;

    const scale = clamp(Math.min((box.width - 48) / w, (box.height - 48) / h));
    setView({
      x: (box.width - w * scale) / 2,
      y: Math.min(24, (box.height - h * scale) / 2),
      scale,
    });
  }, []);

  // 카드 높이는 그림이 떠야 정해진다. 한 번 대충 맞춰 두고, 그림이 다 뜨면
  // 다시 맞춘다. 그림이 안 뜨는 것이 있어도 언젠가는 끝나도록 시한을 둔다.
  useEffect(() => {
    if (!pages.length) return undefined;
    let alive = true;

    const first = setTimeout(fit, 200);
    const deadline = setTimeout(() => alive && fit(), 6000);

    const images = [...(stage.current?.querySelectorAll('img') ?? [])];
    Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((done) => {
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
            }),
      ),
    ).then(() => {
      if (alive) fit();
    });

    return () => {
      alive = false;
      clearTimeout(first);
      clearTimeout(deadline);
    };
  }, [pages.length, fit]);

  /** 커서를 축으로 확대한다. 커서 아래에 있던 지점이 제자리에 남는다. */
  const zoomAt = useCallback((factor, cx, cy) => {
    setView((v) => {
      const scale = clamp(v.scale * factor);
      const k = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  /** 버튼과 키로 확대할 때는 화면 한가운데를 축으로 삼는다. */
  const zoomMid = useCallback(
    (factor) => {
      const box = frame.current?.getBoundingClientRect();
      if (box) zoomAt(factor, box.width / 2, box.height / 2);
    },
    [zoomAt],
  );

  /**
   * 휠은 직접 붙인다. React 의 onWheel 은 기본 동작을 막을 수 없어서, 그대로
   * 두면 캔버스가 움직이는 동시에 브라우저 화면도 같이 움직이거나 확대된다.
   *
   * plan 을 의존성에 두는 것이 중요하다. 불러오는 동안에는 캔버스 자체가
   * 화면에 없어서, 한 번만 붙이면 붙을 대상이 없는 채로 끝난다.
   */
  useEffect(() => {
    const el = frame.current;
    if (!el) return undefined;

    const onWheel = (e) => {
      e.preventDefault();

      // 휠 한 칸을 픽셀로 주는 기기도, 줄 수로 주는 기기도 있다.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;

      if (e.ctrlKey || e.metaKey) {
        const box = el.getBoundingClientRect();
        // 휠 한 칸(100)에 약 1.2배. 더 가파르면 몇 칸에 끝까지 가 버린다.
        zoomAt(Math.exp(-dy / 550), e.clientX - box.left, e.clientY - box.top);
        return;
      }

      // Shift+휠은 가로 이동이다. 브라우저에 따라 deltaX 로 오기도 하고
      // deltaY 에 shiftKey 만 붙어 오기도 해서 둘 다 받는다.
      if (e.shiftKey && !dx) {
        setView((v) => ({ ...v, x: v.x - dy }));
        return;
      }
      setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [plan, zoomAt]);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }));
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  useEffect(() => {
    const key = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === '=' || e.key === '+') zoomMid(1.2);
      if (e.key === '-' || e.key === '_') zoomMid(1 / 1.2);
      if (e.key === '0') fit();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [zoomMid, fit]);

  if (error) {
    return (
      <div className="shell">
        <header className="topbar">
          <h1>캔버스</h1>
          <nav><a className="btn ghost" href="/">목록</a></nav>
        </header>
        <p className="notice">{error}</p>
      </div>
    );
  }

  if (!plan) return <div className="shell"><p style={{ paddingTop: 40 }}>불러오는 중…</p></div>;

  const zoom = Math.round(view.scale * 100);

  return (
    <div className="canvas-shell">
      <header className="topbar">
        <h1>{plan.company || '기획서'} · 캔버스</h1>
        <nav>
          <a className="btn ghost" href={`/plans/${id}`}>기획서로</a>
          <a className="btn ghost" href={`/plans/${id}/edit`}>섹션 편집</a>
        </nav>
      </header>

      <div className="canvas-bar">
        <span className="warnline">
          블록 예시 이미지입니다. 실제 사진과 문구는 다릅니다.
        </span>
        <label className="tonebox">
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
          자리 이름 보기
        </label>
        <div className="zoomer">
          <button type="button" className="icon" onClick={() => zoomMid(1 / 1.2)} aria-label="축소">−</button>
          <span className="pct">{zoom}%</span>
          <button type="button" className="icon" onClick={() => zoomMid(1.2)} aria-label="확대">+</button>
          <button type="button" className="btn ghost" onClick={fit}>전체 보기</button>
        </div>
      </div>

      <div
        className="canvas-frame"
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="canvas-stage"
          ref={stage}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            gap: GAP,
          }}
        >
          {pages.map((page) => (
            <PageCard key={page.index} page={page} labels={labels} />
          ))}
        </div>
      </div>

      <p className="canvas-help">
        휠로 이동 · Ctrl(⌘)+휠로 확대 · 드래그로 옮기기 · 0 키로 전체 보기.
        블록 높이는 예시 그림 높이라 실제 페이지 비율과 다릅니다.
      </p>
    </div>
  );
}

function PageCard({ page, labels }) {
  const sections = page.sections ?? [];

  return (
    <div className="pagecard" style={{ width: CARD }}>
      <div className="pagecard-head">
        <strong>{page.title}</strong>
        <span className="path">{page.slug}</span>
        <span className="n">{sections.length}</span>
      </div>

      <div className="pagecard-body">
        {sections.length === 0 && <p className="empty">자리 없음</p>}
        {sections.map((s, i) => (
          <div className="slab" key={i}>
            {/* 이름표는 그림 위에 둔다. 아래에 두면 다음 블록의 이름처럼 읽힌다. */}
            {labels && (
              <div className="slab-label">
                <span className="i">{String(i + 1).padStart(2, '0')}</span>
                <span className="what">{s.purpose}</span>
                {s.needsCustomTone && <span className="tone">톤</span>}
              </div>
            )}
            <Slab src={s.thumbnail} blockId={s.blockId} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Slab({ src, blockId }) {
  const [failed, setFailed] = useState(false);
  const url = thumbUrl(src);

  if (!url || failed) {
    return (
      <div className="slab-blank">
        {blockId ? '그림 없음' : '식스샵 기본 기능'}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="slab-img"
      src={url}
      alt=""
      loading="lazy"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
