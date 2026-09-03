'use client';

/**
 * 자리 하나를 고치는 칸. 목록형 편집 화면과 캔버스 옆 패널이 같이 쓴다.
 *
 * 끌어 놓는 방식은 쓰지 않는다. 확대·이동이 걸린 화면에서 마우스 좌표를
 * 되짚는 계산이 붙고 거기가 버그가 제일 잘 나는 곳이라, 위·아래 버튼과
 * 페이지 고르기로 같은 일을 한다.
 */

export default function SlotForm({
  section,
  at,
  total,
  page,
  pages,
  onMove,
  onRemove,
  onPatch,
  onMoveToPage,
  onPick,
}) {
  const set = (fields) => onPatch(page.index, at, fields);

  return (
    <div className="slotform">
      <input
        type="text"
        className="purpose"
        value={section.purpose ?? ''}
        onChange={(e) => set({ purpose: e.target.value })}
        placeholder="이 자리가 하는 일"
      />

      <div className="blockline">
        <button type="button" className="blockchip" onClick={() => onPick(at)}>
          {section.blockId
            ? `${section.blockName ?? section.blockId}${section.blockStyle ? ` (${section.blockStyle})` : ''}${section.officialPartner ? ' ★' : ''}`
            : '식스샵 기본 기능 — 블록 고르기'}
        </button>
        <label className="tonebox">
          <input
            type="checkbox"
            checked={Boolean(section.needsCustomTone)}
            onChange={(e) => set({ needsCustomTone: e.target.checked })}
          />
          톤 커스텀 필요
        </label>
      </div>

      <textarea
        value={section.note ?? ''}
        onChange={(e) => set({ note: e.target.value })}
        placeholder="제작 메모 — 왜 이 자리인지, 무엇을 조심할지"
        rows={2}
      />
      <textarea
        className="copy"
        value={section.copy ?? ''}
        onChange={(e) => set({ copy: e.target.value })}
        placeholder="들어갈 문구 초안"
        rows={3}
      />

      <div className="slotactions">
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
          disabled={at === total - 1}
          aria-label="아래로"
        >
          ↓
        </button>

        {pages.length > 1 && (
          <select
            className="sendto"
            value=""
            onChange={(e) => e.target.value && onMoveToPage(page.index, at, Number(e.target.value))}
            aria-label="다른 페이지로 보내기"
          >
            <option value="">다른 페이지로…</option>
            {pages
              .filter((p) => p.index !== page.index)
              .map((p) => (
                <option key={p.index} value={p.index}>
                  {p.title} 맨 아래로
                </option>
              ))}
          </select>
        )}

        <button
          type="button"
          className="icon danger"
          onClick={() => onRemove(page.index, at)}
        >
          빼기
        </button>
      </div>
    </div>
  );
}
