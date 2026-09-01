'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      const next = new URLSearchParams(location.search).get('next') || '/';
      location.href = next;
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? '들어갈 수 없습니다.');
    setBusy(false);
  }

  return (
    <div className="shell" style={{ maxWidth: 380, paddingTop: 120 }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 22, marginBottom: 24 }}>
        웹사이트 기획 에이전트
      </h1>
      <form onSubmit={submit}>
        <label>
          <span className="name">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </label>
        {error && <p className="notice">{error}</p>}
        <button className="btn" disabled={busy || !password}>
          {busy ? '확인 중' : '들어가기'}
        </button>
      </form>
    </div>
  );
}
