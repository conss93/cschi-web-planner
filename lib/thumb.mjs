/**
 * 블록 그림 주소를 우리 쪽 경유 주소로 바꾼다.
 * 허용 목록 밖이거나 주소가 아니면 그대로 둔다(그쪽에서 알아서 실패한다).
 */
export function thumbUrl(src) {
  if (!src) return null;
  if (!src.startsWith('https://marketplace.sixshop.io/')) return src;
  return `/api/thumb?src=${encodeURIComponent(src)}`;
}
