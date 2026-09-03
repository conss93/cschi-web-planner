import { NextResponse } from 'next/server';
import { isSignedIn } from './lib/auth.mjs';

/** 공유 링크와 로그인 화면만 열어 두고 나머지는 막는다. */
export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // 공유 링크는 로그인 없이 열리므로, 그 화면이 쓰는 블록 그림도 열어 둬야 한다.
  // 허용한 곳의 그림만 대신 받아 오므로 열어 둬도 새는 것이 없다.
  if (
    pathname.startsWith('/share/') ||
    pathname.startsWith('/login') ||
    pathname === '/api/login' ||
    pathname === '/api/thumb'
  ) {
    return NextResponse.next();
  }

  if (await isSignedIn(request)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
