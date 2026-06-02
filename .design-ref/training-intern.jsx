// ═══════════════════════════════════════════════════════════
// Training · Intern view — consume the content & practice
// ═══════════════════════════════════════════════════════════

const { useState: tiUS } = React;

// Practice tasks the intern needs to check off
const INTERN_TASKS = [
  { id: 'p1', label: 'Pull 5 shots back-to-back within ±2 s', done: true },
  { id: 'p2', label: 'Recover from a "blonde" shot — grind one notch finer', done: true },
  { id: 'p3', label: 'Identify channeling in a deliberately bad tamp', done: false },
  { id: 'p4', label: 'Pull 3 shots in front of trainer (Marcus)', done: false },
];

const INTERN_QUIZ = [
  { id: 'q1', q: 'What is the target window for first drip?', a: '7–9 seconds' },
  { id: 'q2', q: 'A blonde shot means the grind is too…', a: 'Coarse — adjust finer' },
];

// ─── Embedded video card ────────────────────────────────────
function VideoEmbed() {
  const [playing, setPlaying] = tiUS(false);
  return (
    <div className="rounded-lg overflow-hidden border border-[var(--border)] bg-stone-900 my-3">
      <div
        className="relative aspect-video flex items-center justify-center cursor-pointer group"
        style={{
          background: `linear-gradient(135deg, #2a2520 0%, #1c1917 60%, #44403c 100%)`,
        }}
        onClick={() => setPlaying(p => !p)}
      >
        {/* faux grain */}
        <div className="absolute inset-0 opacity-30" style={{
          background: 'radial-gradient(circle at 30% 40%, rgba(217,119,6,0.18) 0%, transparent 50%)',
        }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <button className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
            <Icon name={playing ? 'pause' : 'play'} size={22} className="text-stone-900 ml-0.5" />
          </button>
        </div>
        <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-black/50 backdrop-blur text-white font-mono text-[10px] uppercase tracking-wider">
          <Icon name="play-circle" size={11} /> demo · 4:12
        </div>
        <div className="absolute bottom-0 inset-x-0 p-3">
          <div className="h-1 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-white" style={{ width: playing ? '38%' : '0%', transition: 'width 0.5s' }} />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-white text-[11px] font-mono">
            <span className="opacity-80">{playing ? '1:34' : '0:00'} / 4:12</span>
            <div className="flex items-center gap-2 opacity-80">
              <Icon name="volume-2" size={12} />
              <Icon name="captions" size={12} />
              <Icon name="maximize" size={12} />
            </div>
          </div>
        </div>
      </div>
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[13px] font-medium text-white">The 25-second pour — anatomy</div>
          <div className="text-[11px] text-stone-400 mt-0.5">Filmed at Maple · narrated by Priya</div>
        </div>
        <button className="h-7 px-2 rounded text-[11px] text-white hover:bg-white/10 inline-flex items-center gap-1">
          <Icon name="bookmark" size={11} /> Save
        </button>
      </div>
    </div>
  );
}

// ─── Top progress strip ─────────────────────────────────────
function InternProgressStrip() {
  return (
    <div className="border-b border-[var(--border)] bg-white">
      <div className="px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">progress</span>
          <span className="text-[13px] font-semibold">Day 3 of 12</span>
        </div>
        <div className="flex-1 max-w-[420px]">
          <div className="flex items-center gap-0.5">
            {CURRICULUM.map(d => {
              const done = d.day < 3;
              const active = d.day === 3;
              return (
                <div key={d.id} className="flex-1 h-1.5 rounded-sm" style={{
                  background: done ? '#1c1917' : active ? T_ACC : '#e7e5e4',
                }} />
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[10.5px] text-stone-500 font-mono">
            <span>2 done</span>
            <span className="text-stone-900 font-semibold">25%</span>
            <span>9 remaining</span>
          </div>
        </div>
        <div className="flex-1" />
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded font-mono text-[10.5px]"
             style={{ background: T_ACC_SOFT, border: `1px solid ${T_ACC_BD}`, color: T_ACC }}>
          <Icon name="flame" size={12} />
          <span className="uppercase tracking-wider">3-day streak</span>
        </div>
        <div className="flex items-center gap-2 pl-1">
          <Avatar name="Maya Wu" size={28} />
          <div className="leading-tight">
            <div className="text-[12.5px] font-medium">Maya Wu</div>
            <div className="text-[10.5px] text-stone-500">Trainee · started Apr 8</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Embedded video replacing the markdown video link in body ─
function injectVideoInMd(blocks) {
  // Find the paragraph that contains the video link and replace it with VideoEmbed
  const out = [];
  for (const b of blocks) {
    out.push(b);
    // After the first heading "Demonstration" (h2), inject video
  }
  return out;
}

function TaskCheckbox({ done, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`shrink-0 w-5 h-5 rounded border inline-flex items-center justify-center transition-colors ${
        done ? 'bg-stone-900 border-stone-900 text-white' : 'bg-white border-stone-300 hover:border-stone-500'
      }`}
    >
      {done && <Icon name="check" size={12} />}
    </button>
  );
}

function InternView() {
  const [activeId, setActiveId] = tiUS('d03');
  const [tasks, setTasks] = tiUS(INTERN_TASKS);
  const [revealed, setRevealed] = tiUS({});
  const [reviewRequested, setReviewRequested] = tiUS(false);

  const doneCount = tasks.filter(t => t.done).length;
  const allDone = doneCount === tasks.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <InternProgressStrip />

      <div className="flex-1 min-h-0 flex">
        {/* Left rail: day list */}
        <aside className="w-[260px] shrink-0 border-r border-[var(--border)] bg-white flex flex-col">
          <DayListRail activeId={activeId} onSelect={setActiveId} role="intern" />
        </aside>

        {/* Center: content */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-white">
          <div className="max-w-[680px] mx-auto px-8 py-8">
            {/* Crumb */}
            <div className="flex items-center gap-2 text-[11.5px] text-stone-500 mb-5">
              <span className="font-mono uppercase tracking-wider text-stone-400">Day 3</span>
              <span className="text-stone-300">·</span>
              <span>Practice</span>
              <span className="text-stone-300">·</span>
              <span className="inline-flex items-center gap-1"><Icon name="clock" size={11} /> 90 min · est. 1.5h</span>
              <span className="text-stone-300">·</span>
              <span className="inline-flex items-center gap-1 text-amber-700"><Icon name="shield-check" size={11} /> required</span>
            </div>

            <div className="md-body">
              <h1>Pulling the perfect espresso shot</h1>
              <p>A 25-second window decides whether the shot is dialed in. This is the most repeatable skill behind the bar — get it right and everything else falls into place.</p>

              <h2>What you'll learn</h2>
              <ul>
                <li>Reading the grinder and adjusting <strong>dose</strong></li>
                <li>Tamping consistently — aim for ~30 lb of pressure</li>
                <li>Recognizing the <strong>first drip</strong> (8 s) and <strong>end of pour</strong> (25 s)</li>
                <li>Visual cues: tiger striping, blonde shot, channeling</li>
              </ul>

              <h2>The 25-second window</h2>
              <table>
                <thead><tr><th>Stage</th><th>Time</th><th>What you see</th></tr></thead>
                <tbody>
                  <tr><td>First drip</td><td>7–9 s</td><td>Dark, slow droplets</td></tr>
                  <tr><td>Body forms</td><td>12–18 s</td><td>Honey-thick stream</td></tr>
                  <tr><td>End of pour</td><td>23–27 s</td><td>Stream lightens — cut shot</td></tr>
                </tbody>
              </table>

              <h2>Demonstration</h2>
            </div>

            <VideoEmbed />

            <div className="md-body">
              <blockquote>Watch Priya pull a textbook shot, then a deliberately channeled one. Compare the crema and stream color.</blockquote>

              <h2>Reference photo</h2>
            </div>

            <div className="my-4 rounded-lg border border-[var(--border)] overflow-hidden">
              <div className="relative aspect-[16/9]" style={{
                background: `repeating-linear-gradient(135deg, #efe9dd 0 12px, #e8e1d2 12px 24px)`,
              }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-stone-600 bg-white/85 border border-stone-300 rounded px-2.5 py-1.5">photo · espresso anatomy</span>
                </div>
              </div>
              <div className="px-3 py-2 text-[11.5px] text-stone-500 italic border-t border-[var(--border)]">
                Espresso pour anatomy — labelled cross-section
              </div>
            </div>

            <div className="md-body">
              <h2>Common mistakes</h2>
              <ul>
                <li>Tamping unevenly — one side noticeably higher than the other</li>
                <li>Skipping pre-infusion on a thirsty grinder</li>
                <li>Cutting the shot by time alone, ignoring color and stream</li>
              </ul>

              <blockquote>
                "Espresso is a conversation between you, the grinder, and the bean. Stay curious — every shot teaches you something."
                <cite>— Priya Nair, Shift Lead</cite>
              </blockquote>
            </div>

            {/* Pace control */}
            <div className="mt-8 mb-2 flex items-center gap-3 pt-5 border-t border-[var(--border)]">
              <button className="h-9 px-3 rounded border border-[var(--border)] bg-white text-[12.5px] font-medium text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5">
                <Icon name="arrow-left" size={13} /> Day 2 · Beans
              </button>
              <div className="flex-1" />
              <button className="h-9 px-3 rounded border border-[var(--border)] bg-white text-[12.5px] font-medium text-stone-500 inline-flex items-center gap-1.5">
                Day 4 · Milk
                <Icon name="lock" size={12} />
              </button>
            </div>
          </div>
        </main>

        {/* Right rail: practice + checklist + ask trainer */}
        <aside className="w-[340px] shrink-0 border-l border-[var(--border)] bg-stone-50/40 flex flex-col min-h-0 overflow-y-auto">
          {/* Practice checklist */}
          <div className="bg-white border-b border-[var(--border)]">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">practice</span>
                <span className="ml-auto font-mono text-[11px] tabular-nums">
                  <span className="text-stone-900 font-semibold">{doneCount}</span>
                  <span className="text-stone-400">/{tasks.length}</span>
                </span>
              </div>
              <div className="text-[13.5px] font-semibold leading-tight mt-1">Tasks for today</div>
              <div className="text-[11px] text-stone-500 mt-0.5">Check each off as you complete it. Trainer reviews the last one.</div>
            </div>
            <div className="px-4 pb-3">
              {tasks.map(t => (
                <div key={t.id} className="flex items-start gap-2.5 py-2 border-t border-stone-100 first:border-t-0">
                  <TaskCheckbox
                    done={t.done}
                    onToggle={() => setTasks(prev => prev.map(p => p.id === t.id ? { ...p, done: !p.done } : p))}
                  />
                  <div className={`text-[12.5px] leading-snug flex-1 pt-0.5 ${t.done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{t.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick check */}
          <div className="bg-white border-b border-[var(--border)]">
            <div className="px-4 pt-3 pb-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">quick check</span>
              <div className="text-[13.5px] font-semibold leading-tight mt-1">Test yourself</div>
            </div>
            <div className="px-4 pb-3">
              {INTERN_QUIZ.map(q => (
                <div key={q.id} className="py-2 border-t border-stone-100 first:border-t-0">
                  <div className="text-[12.5px] font-medium text-stone-800 mb-1.5">{q.q}</div>
                  {revealed[q.id] ? (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-[11.5px] text-emerald-700">
                      <Icon name="check-circle-2" size={12} />
                      {q.a}
                    </div>
                  ) : (
                    <button
                      onClick={() => setRevealed(r => ({ ...r, [q.id]: true }))}
                      className="text-[11.5px] text-stone-500 hover:text-stone-900 inline-flex items-center gap-1"
                    >
                      Reveal answer <Icon name="eye" size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div className="bg-white border-b border-[var(--border)]">
            <div className="px-4 pt-3 pb-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">resources</span>
            </div>
            <div className="px-4 pb-3 flex flex-col gap-1.5">
              {DAY3_ATTACHMENTS.map(a => (
                <button key={a.id} className="w-full h-9 px-2.5 rounded border border-[var(--border)] bg-white hover:bg-stone-50 inline-flex items-center gap-2 text-left">
                  <Icon name={a.kind === 'video' ? 'play-circle' : a.kind === 'photo' ? 'image' : 'file-text'} size={13} className="text-stone-500 shrink-0" />
                  <span className="text-[12px] truncate flex-1">{a.name}</span>
                  <span className="font-mono text-[9.5px] text-stone-400 tabular-nums shrink-0">{a.size}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ask trainer / review */}
          <div className="bg-white p-4">
            {!reviewRequested ? (
              <>
                <button
                  onClick={() => setReviewRequested(true)}
                  disabled={!allDone}
                  className="w-full h-10 rounded bg-stone-900 text-white text-[13px] font-medium hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  Request trainer review
                  <Icon name="arrow-right" size={13} />
                </button>
                <div className="mt-1.5 text-[10.5px] text-stone-500 text-center">
                  {allDone ? 'Marcus is on shift now · ETA <5 min' : `Complete ${tasks.length - doneCount} more task${tasks.length - doneCount === 1 ? '' : 's'} to request review`}
                </div>
              </>
            ) : (
              <div className="rounded border p-3" style={{ background: T_ACC_SOFT, borderColor: T_ACC_BD }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: T_ACC }} />
                  <span className="font-mono text-[10.5px] uppercase tracking-wider" style={{ color: T_ACC }}>awaiting review</span>
                </div>
                <div className="text-[12.5px] mt-1.5 text-stone-700">Marcus will come over for live grading. Stay near the bar.</div>
              </div>
            )}

            <button className="w-full h-9 mt-2 rounded border border-[var(--border)] bg-white text-[12.5px] text-stone-600 hover:bg-stone-50 inline-flex items-center justify-center gap-1.5">
              <Icon name="message-square" size={12} /> Ask Marcus a question
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { InternView });
