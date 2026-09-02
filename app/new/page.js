'use client';

import { useEffect, useRef, useState } from 'react';
import { form, toBriefText, parseBriefText, missingRequired } from '../../lib/brief-form.mjs';

const DRAFT_KEY = 'planner:brief-draft';

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

const filled = (values) =>
  Object.values(values ?? {}).filter((v) => (Array.isArray(v) ? v.length : String(v ?? '').trim()))
    .length;

export default function NewPlanPage() {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [from, setFrom] = useState(null);
  // 쓰다 만 내용이 있으면 여기에 담아 두고 물어본다. 폼에 바로 채우지는 않는다.
  const [draft, setDraft] = useState(null);
  const submitting = useRef(false);

  // 작성 중인 내용을 이 브라우저에 남긴다. 실수로 나가도 되살릴 수 있다.
  useEffect(() => {
    const from = new URLSearchParams(location.search).get('from');
    setFrom(from);

    if (from) {
      fetch(`/api/plans/${from}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((row) => {
          // 폼 값을 저장하기 전에 만든 기획서는 상담 텍스트에서 되살린다.
          if (row?.data?.form) setValues(row.data.form);
          else if (row?.brief_text) setValues(parseBriefText(row.brief_text));
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
      return;
    }

    // 새 기획서는 늘 빈 폼으로 연다. 쓰다 만 것이 있으면 되살릴지 물어본다.
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (filled(parsed)) setDraft(parsed);
    } catch {
      // 브라우저가 저장을 막아 둔 경우
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    // 아직 아무것도 안 썼으면 저장하지 않는다. 빈 폼이 이전 초안을 지우면 안 된다.
    // 이전 기획서를 고치는 중이면 그 내용은 이미 서버에 있으므로 남기지 않는다.
    if (!loaded || from || !filled(values)) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch {
      // 저장 못 해도 작성은 계속된다
    }
  }, [values, loaded, from]);

  function dropDraft() {
    setDraft(null);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // 지우지 못해도 다음 작성에서 덮어쓴다
    }
  }

  const set = (id, value) => setValues((v) => ({ ...v, [id]: value }));

  const missing = missingRequired(values);

  async function submit(event) {
    event.preventDefault();
    // 버튼을 직접 누르지 않은 제출은 무시한다. 입력칸에서 Enter 를 치거나
    // Tab 으로 옮겨간 뒤 눌러 실수로 만들어지는 일이 있었다.
    if (!submitting.current) return;
    submitting.current = false;

    setBusy(true);
    setError('');

    const res = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ briefText: toBriefText(values), form: values }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? '만들지 못했습니다.');
      setBusy(false);
      return;
    }
    const plan = await res.json();
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // 지우지 못해도 다음 작성에서 덮어쓴다
    }
    location.href = `/plans/${plan.id}`;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>새 기획서</h1>
        <nav><a className="btn ghost" href="/">목록</a></nav>
      </header>

      <p style={{ color: 'var(--muted)', maxWidth: '62ch' }}>
        상담 중에 아는 만큼만 채우세요. 빈 항목이 있어도 만들 수 있습니다.
        빠진 것은 기획서 첫머리에 확인할 질문으로 올라갑니다.
      </p>

      {from && loaded && (
        <p className="notice">
          이전 기획서의 상담 내용을 불러왔습니다. 빈칸을 채우거나 고친 뒤 다시 만드세요.
          기존 기획서는 그대로 남습니다.
        </p>
      )}

      {draft && (
        <div className="notice">
          이 브라우저에 쓰다 만 상담 내용이 있습니다({filled(draft)}개 항목).
          불러오지 않으면 빈 폼으로 시작합니다.
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setValues(draft);
                setDraft(null);
              }}
            >
              이어서 쓰기
            </button>
            <button type="button" className="btn ghost" onClick={dropDraft}>
              지우고 새로 쓰기
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
        }}
        style={{ marginTop: 28 }}
      >
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

        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            submitting.current = true;
          }}
        >
          {busy ? '만드는 중' : '기획서 만들기'}
        </button>
        <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 10 }}>
          {from
            ? '이 화면의 내용은 따로 저장되지 않습니다. 원래 기획서는 그대로 남아 있습니다.'
            : '작성 중인 내용은 이 브라우저에 자동으로 저장됩니다. 나갔다 돌아오면 이어서 쓸지 물어봅니다.'}
        </p>
      </form>
    </div>
  );
}
