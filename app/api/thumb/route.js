/**
 * 마켓플레이스 블록 그림을 대신 받아 온다.
 *
 * 그림을 식스샵 서버에서 곧장 부르면, 한 화면에 수십 장이 뜨는 캔버스에서
 * 남의 서버를 그만큼 두드리게 된다. 여기를 거치면 Vercel 앞단이 받아 두고
 * 그다음부터는 식스샵까지 가지 않는다.
 *
 * 대신 아무 주소나 대신 받아 주면 우리 서버가 남의 심부름꾼이 되므로
 * (내부망을 긁는 통로가 되기도 한다) 허용한 곳의 그림만 받는다.
 */

import { NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set(['marketplace.sixshop.io']);

/** 하루. 블록 그림은 주소가 바뀌면 새 주소로 오므로 길게 잡아도 된다. */
const MAX_AGE = 60 * 60 * 24;

export async function GET(request) {
  const src = new URL(request.url).searchParams.get('src');
  if (!src) return new NextResponse('src 없음', { status: 400 });

  let target;
  try {
    target = new URL(src);
  } catch {
    return new NextResponse('주소를 읽을 수 없음', { status: 400 });
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return new NextResponse('허용하지 않는 주소', { status: 403 });
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: { accept: 'image/*' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return new NextResponse('그림을 가져오지 못함', { status: 502 });
  }

  const type = upstream.headers.get('content-type') ?? '';
  if (!upstream.ok || !type.startsWith('image/')) {
    return new NextResponse('그림이 아님', { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      'content-type': type,
      'cache-control': `public, max-age=${MAX_AGE}, s-maxage=${MAX_AGE}, immutable`,
    },
  });
}
