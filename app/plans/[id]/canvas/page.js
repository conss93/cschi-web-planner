'use client';

/**
 * 페이지 전체를 한눈에 보는 캔버스.
 *
 * 페이지마다 블록 그림을 위에서 아래로 쌓아 나란히 늘어놓고, 휠과 드래그로
 * 훑어본다. 블록을 누르면 옆 패널이 열려 그 자리를 고칠 수 있다.
 *
 * 끌어 놓는 방식은 쓰지 않는다. 확대·이동이 걸린 화면에서 마우스 좌표를
 * 되짚는 계산이 붙고 거기가 버그가 제일 잘 나는 곳이다. 캔버스와 편집이
 * 만나는 지점은 '눌렀다' 한 번뿐이라 계산할 것이 없다.
 *
 * 여기 깔리는 그림은 마켓플레이스의 블록 예시 이미지지 이 고객의 사진이
 * 아니다. 시안으로 오해하기 쉬운 화면이라 그 사실을 계속 붙여 둔다.
 */

import { useCallback, useEffect, useRef, useState, use } from 'react';
import { thumbUrl } from '../../../../lib/thumb.mjs';
import { usePlanPages } from '../usePlanPages';
import SlotForm from '../SlotForm';
import BlockPicker from '../edit/BlockPicker';

const MIN = 0.15;
const MAX = 2;
const clamp = (v) => Math.min(MAX, Math.max(MIN, v));

/** 페이지 카드 한 장의 폭. 블록 그림도 이 폭에 맞춘다. */
const CARD = 320;
const GAP = 56;

export default function CanvasPage({ params }) {
  const { id } = use(params);

  const p = usePlanPages(id);
  const { plan, pages, error } = p;

  const [labels, setLabels] = useState(true);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [chosen, setChosen] = useState(null); // { page, at }
  const [picking, setPicking] = useState(false);

  const frame = useRef(null);
  const stage = useRef(null);
  const drag = useRef(null);

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
    // 누른 대상은 지금 적어 둔다. 아래에서 포인터를 붙잡고 나면 그다음
    // 이벤트의 대상이 전부 캔버스로 바뀌어, 뗄 때는 무엇을 눌렀는지 알 수 없다.
    drag.current = {
      x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: 0,
      hit: e.target.closest?.('[data-slot]') ?? null,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };

  /**
   * 캔버스를 옮기려던 것인지 블록을 누른 것인지 가른다. 손가락이나 마우스는
   * 누르는 순간에도 몇 픽셀씩 흔들리므로, 조금 움직인 것은 클릭으로 본다.
   */
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved > 4) return;

    if (!d.hit) {
      setChosen(null);
      return;
    }
    const [page, at] = d.hit.dataset.slot.split(':').map(Number);
    setChosen({ page, at });
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
  const chosenPage = chosen ? pages.find((x) => x.index === chosen.page) : null;
  const chosenSection = chosenPage?.sections?.[chosen?.at];

  return (
    <div className="canvas-shell">
      <header className="topbar">
        <h1>{plan.company || '기획서'} · 캔버스</h1>
        <nav>
          <a className="btn ghost" href={`/plans/${id}`}>기획서로</a>
          <a className="btn ghost" href={`/plans/${id}/edit`}>섹션 편집</a>
          {p.dirty && <button className="btn ghost" onClick={p.revert}>되돌리기</button>}
          <button className="btn" onClick={p.save} disabled={p.saving || !p.dirty}>
            {p.saving ? '저장 중' : p.dirty ? '저장' : '저장됨'}
          </button>
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
            <PageCard key={page.index} page={page} labels={labels} chosen={chosen} />
          ))}
        </div>

        {chosenPage && chosenSection && (
          <aside className="slotpanel" onPointerDown={(e) => e.stopPropagation()}>
            <div className="slotpanel-head">
              <span className="where">
                {chosenPage.title} · {String(chosen.at + 1).padStart(2, '0')}
              </span>
              <button type="button" className="btn ghost" onClick={() => setChosen(null)}>
                닫기
              </button>
            </div>
            <div className="slotpanel-body">
              <SlotForm
                section={chosenSection}
                at={chosen.at}
                total={chosenPage.sections.length}
                page={chosenPage}
                pages={pages}
                onMove={(pi, at, to) => {
                  p.move(pi, at, to);
                  setChosen({ page: pi, at: Math.max(0, Math.min(chosenPage.sections.length - 1, to)) });
                }}
                onRemove={(pi, at) => {
                  p.remove(pi, at);
                  setChosen(null);
                }}
                onPatch={p.patch}
                onMoveToPage={(from, at, to) => {
                  p.moveToPage(from, at, to);
                  setChosen(null);
                }}
                onPick={() => setPicking(true)}
              />
              <button
                type="button"
                className="btn ghost"
                onClick={() => p.insert(chosen.page, chosen.at + 1)}
              >
                아래에 자리 추가
              </button>
            </div>
          </aside>
        )}
      </div>

      <p className="canvas-help">
        휠로 이동 · Shift+휠로 가로 이동 · Ctrl(⌘)+휠로 확대 · 드래그로 옮기기 ·
        0 키로 전체 보기 · 블록을 누르면 그 자리를 고칩니다.
        블록 높이는 예시 그림 높이라 실제 페이지 비율과 다릅니다.
      </p>

      {picking && (
        <BlockPicker
          style={plan.data.strategy?.style ?? null}
          current={chosenSection?.blockId ?? ''}
          onClose={() => setPicking(false)}
          onPick={(block) => {
            p.patch(chosen.page, chosen.at, {
              fill: block ? '마켓플레이스 블록' : '식스샵 기본 기능',
              blockId: block?.blockId ?? '',
              blockName: block?.name ?? null,
              blockStyle: block?.style ?? null,
              officialPartner: block?.officialPartner ?? false,
              thumbnail: block?.thumbnail ?? null,
              previewUrl: block?.previewUrl ?? null,
              needsCustomTone: Boolean(block && !block.style),
            });
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

function PageCard({ page, labels, chosen }) {
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
          <div
            className={
              chosen?.page === page.index && chosen?.at === i ? 'slab on' : 'slab'
            }
            data-slot={`${page.index}:${i}`}
            key={i}
          >
            {/* 이름표는 그림 위에 둔다. 아래에 두면 다음 블록의 이름처럼 읽힌다. */}
            {labels && (
              <div className="slab-label">
                <span className="i">{String(i + 1).padStart(2, '0')}</span>
                <span className="what">{s.purpose}</span>
                {s.needsCustomTone && <span className="tone">톤</span>}
              </div>
            )}
            <Slab src={s.thumbnail} fill={s.fill} blockId={s.blockId} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Slab({ src, fill, blockId }) {
  const [failed, setFailed] = useState(false);
  const url = thumbUrl(src);
  const how = fill ?? (blockId ? '마켓플레이스 블록' : '식스샵 기본 기능');

  if (!url || failed) {
    return (
      <div className={how === 'AI 블록' ? 'slab-blank ai' : 'slab-blank'}>
        {how === '마켓플레이스 블록' ? '그림 없음' : how}
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
