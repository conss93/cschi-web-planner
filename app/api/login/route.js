import { NextResponse } from 'next/server';
import { COOKIE, sessionToken, safeEqual } from '../../../lib/auth.mjs';

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));

  if (!process.env.PLANNER_PASSWORD) {
    return NextResponse.json({ error: 'PLANNER_PASSWORD 가 설정되지 않았습니다.' }, { status: 500 });
  }
  if (!safeEqual(password ?? '', process.env.PLANNER_PASSWORD)) {
    return NextResponse.json({ error: '비밀번호가 맞지 않습니다.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, await sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
