import { NextResponse } from 'next/server';
import { isSignedIn } from './lib/auth.mjs';

/** 공유 링크와 로그인 화면만 열어 두고 나머지는 막는다. */
export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/share/') || pathname.startsWith('/login') || pathname === '/api/login') {
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
