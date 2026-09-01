'use client';

import { useState } from 'react';
import form from '../../data/brief-form.json';

/** 폼 값을 파이프라인이 읽을 텍스트로 바꾼다. 빈 항목은 미확인으로 남긴다. */
function toBriefText(values) {
  const lines = [];
  for (const section of form.sections) {
    const entries = section.fields
      .map((field) => [field, values[field.id]])
      .filter(([, v]) => v && String(v).trim());

    if (!entries.length) continue;
    lines.push(`[${section.label}]`);
    for (const [field, value] of entries) {
      lines.push(`${field.label}: ${Array.isArray(value) ? value.join(', ') : value}`);
    }
    lines.push('');
  }

  const missing = form.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.required && !String(values[f.id] ?? '').trim())
    .map((f) => f.label);

  if (missing.length) lines.push(`[상담에서 확인하지 못한 항목]\n${missing.join(', ')}`);
  return lines.join('\n');
}

function Field({ field, value, onChange }) {
  const common = {
    value: value ?? '',
    onChange: (e) => onChange(field.id, e.target.value),
  };

  return (
    <label>
      <span className="name">
        {field.label}
        {field.required && <span className="req">필수</span>}
      </span>
      {field.help && <span className="help">{field.help}</span>}

      {field.type === 'select' ? (
        <select {...common}>
          <option value="">선택 안 함</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === 'multiselect' ? (
        <select
          multiple
          size={Math.min(field.options.length, 6)}
          value={value ?? []}
          onChange={(e) => onChange(field.id, [...e.target.selectedOptions].map((o) => o.value))}
        >
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === 'multiline' || field.type === 'list' ? (
        <textarea {...common} />
      ) : (
        <input type="text" {...common} />
      )}

      {field.affects && <span className="affects">{field.affects}</span>}
    </label>
  );
}

export default function NewPlanPage() {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (id, value) => setValues((v) => ({ ...v, [id]: value }));

  const missing = form.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.required && !String(values[f.id] ?? '').trim());

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const res = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ briefText: toBriefText(values) }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? '만들지 못했습니다.');
      setBusy(false);
      return;
    }
    const plan = await res.json();
    location.href = `/plans/${plan.id}`;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>새 기획서</h1>
        <nav><a href="/">목록</a></nav>
      </header>

      <p style={{ color: 'var(--muted)', maxWidth: '62ch' }}>
        상담 중에 아는 만큼만 채우세요. 빈 항목이 있어도 만들 수 있습니다.
        빠진 것은 기획서 첫머리에 확인할 질문으로 올라갑니다.
      </p>

      <form onSubmit={submit} style={{ marginTop: 28 }}>
        {form.sections.map((section) => (
          <fieldset key={section.id}>
            <legend>{section.label}</legend>
            {section.fields.map((field) => (
              <Field key={field.id} field={field} value={values[field.id]} onChange={set} />
            ))}
          </fieldset>
        ))}

        {error && <p className="notice">{error}</p>}

        {missing.length > 0 && (
          <p className="notice">
            비어 있는 필수 항목 {missing.length}개: {missing.map((f) => f.label).join(', ')}
            <br />그대로 진행해도 됩니다. 확인할 질문으로 정리됩니다.
          </p>
        )}

        <button className="btn" disabled={busy}>
          {busy ? '만드는 중' : '기획서 만들기'}
        </button>
      </form>
    </div>
  );
}
