// ═══════════════════════════════════════════════════════════
// Training · Trainer view — observe & grade trainees
// ═══════════════════════════════════════════════════════════

const { useState: ttUS } = React;

// Per-day completion counts (mock: "n/4")
const TRAINER_PROGRESS = {
  d01: '4/4', d02: '4/4', d03: '2/4', d04: '0/4', d05: '0/4',
  d06: '0/4', d07: '0/4', d08: '0/4', d09: '0/4', d10: '0/4',
  d11: '0/4', d12: '0/4',
};

// Pre-existing scores for trainees on Day 3
const D3_SCORES = {
  t1: { tampingPass: false, draft: true, rubric: { r1: 3, r2: 4, r3: 2, r4: 3, r5: 4 } },
  t2: { tampingPass: false, draft: false, rubric: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 } },
  t3: null,
  t4: null,
};

function TraineeRow({ t, selected, onSelect, status }) {
  const meta = {
    'review-pending': { label: 'Ready for review', tone: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    'in-progress':    { label: 'In progress',      tone: 'bg-stone-100 text-stone-600 border-stone-200', dot: 'bg-stone-400' },
    'passed':         { label: 'Passed',           tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    'retry':          { label: 'Retry assigned',   tone: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  }[status || t.status];
  return (
    <button
      onClick={() => onSelect(t.id)}
      className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-l-2 transition-colors ${
        selected ? 'bg-stone-50 border-l-stone-900' : 'border-l-transparent hover:bg-stone-50'
      }`}
    >
      <Avatar name={t.name} size={28} />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium leading-tight truncate">{t.name}</div>
        <div className="text-[10.5px] text-stone-500 mt-0.5 flex items-center gap-1.5">
          <span>{t.role}</span>
          <span className="text-stone-300">·</span>
          <span className="font-mono">Day {t.dayProgress}/12</span>
        </div>
      </div>
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${meta.tone}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    </button>
  );
}

// ─── Rubric scoring row (1–5 pips) ──────────────────────────
function RubricRow({ r, value, onChange, locked }) {
  return (
    <div className="px-4 py-3 border-t border-[var(--border)] first:border-t-0">
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-[12.5px] font-medium flex-1">{r.label}</div>
        <div className="font-mono text-[10.5px] text-stone-500">{r.hint}</div>
      </div>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map(n => {
          const filled = value >= n;
          const isTop = value === n;
          return (
            <button
              key={n}
              disabled={locked}
              onClick={() => onChange(n)}
              className={`flex-1 h-7 rounded border text-[11px] font-mono tabular-nums font-semibold transition-colors disabled:cursor-not-allowed ${
                filled
                  ? (isTop ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-800 text-white border-stone-800')
                  : 'bg-white text-stone-400 border-stone-200 hover:border-stone-400'
              }`}
            >
              {n}
            </button>
          );
        })}
        <div className="ml-2 w-[80px] text-right">
          {value > 0 ? (
            <span className="font-mono text-[11px] tabular-nums">
              <span className="text-stone-900 font-semibold">{value}</span>
              <span className="text-stone-400">/5</span>
              <span className="ml-1 text-stone-500">
                {value >= 4 ? 'strong' : value >= 3 ? 'meets' : value >= 2 ? 'develops' : 'below'}
              </span>
            </span>
          ) : (
            <span className="font-mono text-[10.5px] text-stone-400">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

function TrainerView() {
  const [activeId, setActiveId] = ttUS('d03');
  const [traineeId, setTraineeId] = ttUS('t1');
  const initial = D3_SCORES[traineeId];
  const [rubric, setRubric] = ttUS(initial?.rubric || { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 });
  const [verdict, setVerdict] = ttUS(null); // 'pass' | 'retry' | null
  const [notes, setNotes] = ttUS(traineeId === 't1' ? 'Strong on yield and crema. Tamp is tilting slightly to the right — show grip adjustment. Recommend 2 more practice rounds before sign-off.' : '');

  // re-seed when trainee changes
  React.useEffect(() => {
    const s = D3_SCORES[traineeId];
    setRubric(s?.rubric || { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 });
    setNotes(traineeId === 't1' ? 'Strong on yield and crema. Tamp is tilting slightly to the right — show grip adjustment. Recommend 2 more practice rounds before sign-off.' : '');
    setVerdict(null);
  }, [traineeId]);

  const trainee = TRAINEES.find(t => t.id === traineeId);
  const total = Object.values(rubric).reduce((a, b) => a + b, 0);
  const max = 25;

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Left rail: day list */}
      <aside className="w-[260px] shrink-0 border-r border-[var(--border)] bg-white flex flex-col">
        <DayListRail activeId={activeId} onSelect={setActiveId} role="trainer" traineeProgress={TRAINER_PROGRESS} />
      </aside>

      {/* Main: content preview (read-only) */}
      <div className="flex-1 min-w-0 flex flex-col bg-white min-h-0">
        <div className="border-b border-[var(--border)] px-6 py-3 flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500 bg-stone-100 border border-stone-200 rounded px-1.5 py-0.5">D03</span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold tracking-[-0.01em] truncate">Espresso Pull · 25-second window</div>
            <div className="text-[11.5px] text-stone-500 mt-0.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1"><Icon name="clock" size={11} /> 90 min</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><Icon name="shield-check" size={11} /> Required</span>
              <span>·</span>
              <span>You're the assigned trainer · <span className="font-mono">2 of 4</span> ready for review</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider"
                style={{ background: T_ACC_SOFT, border: `1px solid ${T_ACC_BD}`, color: T_ACC }}>
            <Icon name="award" size={11} /> trainer · marcus
          </span>
        </div>

        {/* Read-only module content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
          <div className="max-w-[640px] mx-auto md-body">
            {renderMarkdown(DAY3_MD)}
          </div>
        </div>

        {/* Quick attachment bar */}
        <div className="shrink-0 border-t border-[var(--border)] px-6 py-2.5 flex items-center gap-2 bg-stone-50/40">
          <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">resources</span>
          {DAY3_ATTACHMENTS.slice(0, 4).map(a => (
            <button key={a.id} className="h-7 px-2 rounded border border-[var(--border)] bg-white text-[11.5px] hover:bg-stone-50 inline-flex items-center gap-1.5 max-w-[200px]">
              <Icon name={a.kind === 'video' ? 'play-circle' : a.kind === 'photo' ? 'image' : 'file-text'} size={11} className="text-stone-500" />
              <span className="truncate">{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right rail: trainee roster + grading panel */}
      <aside className="w-[400px] shrink-0 border-l border-[var(--border)] bg-white flex flex-col min-h-0">
        <div className="px-4 pt-4 pb-3 border-b border-[var(--border)] flex items-center gap-2">
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold leading-tight">Trainees on this day</div>
            <div className="text-[10.5px] text-stone-500 mt-0.5">
              <span className="font-mono">4</span> active · <span className="font-mono text-amber-600">1 awaiting you</span>
            </div>
          </div>
          <button className="h-7 w-7 rounded border border-[var(--border)] bg-white inline-flex items-center justify-center text-stone-600 hover:bg-stone-50">
            <Icon name="filter" size={12} />
          </button>
        </div>

        <div className="border-b border-[var(--border)] divide-y divide-[var(--border)] shrink-0">
          {TRAINEES.map(t => (
            <TraineeRow key={t.id} t={t} selected={t.id === traineeId} onSelect={setTraineeId} />
          ))}
        </div>

        {/* Grading panel */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-4 pt-4 pb-3 flex items-center gap-2.5 bg-stone-50/40">
            <Avatar name={trainee.name} size={32} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold leading-tight">{trainee.name}</div>
              <div className="text-[11px] text-stone-500 mt-0.5">
                Day 3 attempt · <span className="font-mono">2nd try</span> · started <span className="font-mono">14m ago</span>
              </div>
            </div>
            <button className="h-7 px-2 rounded border border-[var(--border)] bg-white text-[11px] hover:bg-stone-50 inline-flex items-center gap-1">
              <Icon name="message-square" size={11} /> DM
            </button>
          </div>

          {/* Rubric */}
          <div className="border-y border-[var(--border)]">
            <div className="px-4 py-2 flex items-center gap-2 bg-stone-50/60 border-b border-[var(--border)]">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Rubric</span>
              <div className="flex-1" />
              <span className="font-mono text-[11px] tabular-nums">
                <span className="text-stone-900 font-semibold">{total}</span>
                <span className="text-stone-400">/{max}</span>
              </span>
            </div>
            {DAY3_RUBRIC.map(r => (
              <RubricRow key={r.id} r={r} value={rubric[r.id]} onChange={(v) => setRubric(prev => ({ ...prev, [r.id]: v }))} />
            ))}
          </div>

          {/* Notes */}
          <div className="px-4 py-3">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Notes for trainee</span>
              <div className="flex-1" />
              <span className="text-[10.5px] text-stone-400">visible to {trainee.name.split(' ')[0]}</span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What went well? What to practice next?"
              className="w-full rounded border border-[var(--border)] bg-white p-2.5 text-[12.5px] leading-relaxed outline-none focus:border-stone-400 resize-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Strong tamping', 'Grind adjust needed', 'Channeling visible', 'Solid recovery', 'Ready to advance'].map(c => (
                <button key={c} className="h-6 px-2 rounded-full border border-[var(--border)] bg-white text-[10.5px] text-stone-600 hover:bg-stone-100">+ {c}</button>
              ))}
            </div>
          </div>

          {/* Verdict + submit */}
          <div className="px-4 py-3 border-t border-[var(--border)] bg-stone-50/30">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setVerdict('pass')}
                className={`flex-1 h-9 rounded border text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                  verdict === 'pass'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-stone-700 border-stone-300 hover:border-emerald-400 hover:text-emerald-700'
                }`}
              >
                <Icon name="check-circle-2" size={14} /> Pass · advance to Day 4
              </button>
              <button
                onClick={() => setVerdict('retry')}
                className={`flex-1 h-9 rounded border text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                  verdict === 'retry'
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-stone-700 border-stone-300 hover:border-amber-400 hover:text-amber-700'
                }`}
              >
                <Icon name="rotate-ccw" size={14} /> Assign retry
              </button>
            </div>
            <button
              disabled={!verdict || total === 0}
              className="w-full h-9 rounded bg-stone-900 text-white text-[12.5px] font-medium hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            >
              Submit grade
              <Icon name="arrow-right" size={13} />
            </button>
            <div className="mt-1.5 text-[10.5px] text-stone-500 text-center">
              {trainee.name.split(' ')[0]} will be notified · sign-off recorded in their training file
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

Object.assign(window, { TrainerView });
