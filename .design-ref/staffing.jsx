// ─── Staffing desktop layouts ───
const { useState: stfUseState, useMemo: stfUseMemo, useEffect: stfUseEffect } = React;

function useStaffingState() {
  const [weekStart, setWeekStart] = stfUseState(mondayOf(TODAY));
  const [shifts, setShifts] = stfUseState(SHIFTS_SEED);
  const [timeOff, setTimeOff] = stfUseState(TIME_OFF_SEED);
  const [trades, setTrades] = stfUseState(TRADES_SEED);
  const week = stfUseMemo(() => weekDates(weekStart), [weekStart]);
  const weekShifts = shifts.filter(s => {
    const a = isoDate(week[0]), b = isoDate(week[6]);
    return s.date >= a && s.date <= b;
  });
  const nav = (delta) => {
    const n = new Date(weekStart); n.setDate(n.getDate() + delta * 7); setWeekStart(n);
  };
  const monthYear = week[0].toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { weekStart, setWeekStart, week, shifts, setShifts, weekShifts, timeOff, setTimeOff, trades, setTrades, nav, monthYear };
}

// === Variant A — Main + Right Rail (Requests) — classic ops layout ===
function StaffingA({ state, toast }) {
  const { week, weekShifts, shifts, timeOff, setTimeOff, trades, setTrades, nav, monthYear } = state;
  const [activeTab, setActiveTab] = stfUseState("schedule"); // schedule | my

  const pendingCount = timeOff.filter(r => r.status === "pending").length + trades.filter(t => t.status === "pending").length;

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="px-6 pt-5 pb-3 flex items-center gap-3 border-b border-[var(--border)] bg-white">
          <Segmented
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: "schedule", label: "Schedule" },
              { value: "my",       label: "My Shifts" },
            ]}
          />
          <div className="flex items-center gap-1.5 ml-2">
            <IconBtn icon="chevron-left"  onClick={() => nav(-1)} />
            <button onClick={() => state.setWeekStart(mondayOf(TODAY))} className="h-8 px-3 text-[12px] font-medium border border-[var(--border)] rounded hover:bg-stone-100">Today</button>
            <IconBtn icon="chevron-right" onClick={() => nav( 1)} />
            <div className="ml-3 text-[13px] font-semibold text-stone-800">{monthYear}</div>
            <div className="text-[12px] text-stone-500 ml-1">
              {week[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {week[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" icon="download">Export</Button>
            <Button size="sm" icon="plus" onClick={() => toast("Add-shift flow")}>Add shift</Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {activeTab === "schedule" && <TableGridWide week={week} weekShifts={weekShifts} />}
          {activeTab === "my"       && <MyShiftsDesktop week={week} weekShifts={weekShifts} />}
        </div>
      </div>

      {/* Right rail */}
      <RequestsRail
        timeOff={timeOff} setTimeOff={setTimeOff}
        trades={trades} setTrades={setTrades}
        pendingCount={pendingCount} shifts={shifts} toast={toast}
      />
    </div>
  );
}

// === Variant B — Three-pane: Team list left | week grid | right rail ===
function ShiftChip({ shift, compact, large }) {
  const color = SHIFT_COLORS[shift.shiftType];
  const roleDots = shift.staffRoles.map((rn) => {
    const r = ROLES.find(x => x.name === rn);
    return r ? { color: r.color, name: rn, icon: r.icon } : null;
  }).filter(Boolean);
  return (
    <div className={`group border border-[var(--border)] bg-white hover:border-stone-400 rounded px-1.5 ${compact ? "py-1" : "py-1.5"} cursor-pointer transition-colors`}>
      <div className="flex items-center gap-1 leading-tight">
        <span className="inline-block w-1 h-3.5 rounded-sm" style={{ background: color }} />
        <span className={`font-semibold tabular-nums text-stone-800 ${compact ? "text-[11px]" : "text-[12px]"}`}>
          {formatTimeShort(shift.startTime)}–{formatTimeShort(shift.endTime)}
        </span>
      </div>
      {!compact && shift.staffName && (
        <div className="text-[11px] text-stone-600 truncate mt-0.5">{shift.staffName}</div>
      )}
      <div className="flex items-center gap-1 mt-0.5">
        {roleDots.map((r, i) => (
          <span key={i} className="inline-flex items-center gap-0.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />
            <span className="text-[9.5px] text-stone-500">{r.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TableGridWide({ week, weekShifts, fullBleed }) {
  // Everyone in team (roster view like spreadsheet)
  const staff = TEAM.filter(m => m.status === "active");
  const todayStr = isoDate(TODAY);

  const wrap = fullBleed ? "p-0" : "p-5";
  return (
    <div className={wrap}>
      <div className={`bg-white ${fullBleed ? "" : "border border-[var(--border)] rounded overflow-hidden"}`}>
        <div className="grid sticky top-0 bg-white z-10" style={{ gridTemplateColumns: "180px repeat(7, minmax(0, 1fr)) 68px" }}>
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 border-b border-r border-[var(--border)] bg-stone-50">Staff</div>
          {week.map(d => {
            const isT = isoDate(d) === todayStr;
            return (
              <div key={isoDate(d)} className={`px-2.5 py-2 border-b border-r border-[var(--border)] ${isT ? "bg-stone-900 text-white" : "bg-stone-50 text-stone-700"}`}>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-[10.5px] font-semibold uppercase tracking-wider ${isT ? "text-white/70" : "text-stone-500"}`}>
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className={`text-[14px] font-semibold tabular-nums leading-none ${isT ? "text-white" : ""}`}>{d.getDate()}</span>
                </div>
              </div>
            );
          })}
          <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 border-b border-[var(--border)] bg-stone-50 text-right">Total</div>
        </div>
        {staff.map(m => {
          const myShifts = weekShifts.filter(s => s.memberId === m.id);
          const hours = myShifts.reduce((sum, s) => {
            const [h1, m1] = s.startTime.split(":").map(Number);
            const [h2, m2] = s.endTime.split(":").map(Number);
            return sum + (h2 + m2/60) - (h1 + m1/60);
          }, 0);
          return (
            <div key={m.id} className="grid hover:bg-stone-50/40" style={{ gridTemplateColumns: "180px repeat(7, minmax(0, 1fr)) 68px" }}>
              <div className="px-2.5 py-2 border-b border-r border-[var(--border)] flex items-center gap-2 min-w-0">
                <Avatar name={m.name} size={26} color={m.color} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{m.name}</div>
                  <div className="text-[10.5px] text-stone-500 truncate">{m.roleTitle}</div>
                </div>
              </div>
              {week.map(d => {
                const ds = isoDate(d);
                const cell = myShifts.filter(s => s.date === ds);
                return (
                  <div key={ds} className="border-b border-r border-[var(--border)] p-1.5 min-h-[54px] space-y-1">
                    {cell.length === 0 ? (
                      <button className="w-full h-full min-h-[42px] text-[11px] text-stone-300 hover:text-stone-600 hover:bg-stone-100 rounded border border-dashed border-transparent hover:border-stone-300 transition-colors">+</button>
                    ) : cell.map(s => <ShiftChip key={s.id} shift={s} compact />)}
                  </div>
                );
              })}
              <div className="px-2 py-2 border-b border-[var(--border)] flex items-center justify-end">
                <span className="text-[13px] font-semibold tabular-nums">{hours.toFixed(1)}<span className="text-[10px] font-normal text-stone-500 ml-0.5">h</span></span>
              </div>
            </div>
          );
        })}
        {/* Daily totals */}
        <div className="grid bg-stone-50" style={{ gridTemplateColumns: "180px repeat(7, minmax(0, 1fr)) 68px" }}>
          <div className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 border-r border-[var(--border)]">Total</div>
          {week.map(d => {
            const ds = isoDate(d);
            const dayShifts = weekShifts.filter(s => s.date === ds);
            const hrs = dayShifts.reduce((sum, s) => {
              const [h1, m1] = s.startTime.split(":").map(Number);
              const [h2, m2] = s.endTime.split(":").map(Number);
              return sum + (h2 + m2/60) - (h1 + m1/60);
            }, 0);
            return (
              <div key={ds} className="px-2.5 py-2 border-r border-[var(--border)] text-[12px] tabular-nums">
                <span className="font-semibold text-stone-800">{dayShifts.length}</span>
                <span className="text-stone-400 ml-1">· {hrs.toFixed(0)}h</span>
              </div>
            );
          })}
          <div className="px-2 py-2 text-right text-[12px] font-semibold tabular-nums">
            {weekShifts.reduce((sum, s) => {
              const [h1, m1] = s.startTime.split(":").map(Number);
              const [h2, m2] = s.endTime.split(":").map(Number);
              return sum + (h2 + m2/60) - (h1 + m1/60);
            }, 0).toFixed(0)}h
          </div>
        </div>
      </div>
    </div>
  );
}

// Timeline-style week grid: time axis vertical, days as columns with shift blocks
function MyShiftsDesktop({ week, weekShifts }) {
  const ME = TEAM[0]; // Amelia
  const my = weekShifts.filter(s => s.memberId === ME.id);
  const todayStr = isoDate(TODAY);
  const TASKS = [
    { id: "t1", title: "Check fridge temps (log in binder)", startTime: "07:15", endTime: "07:30", done: true },
    { id: "t2", title: "Restock pastry case",                 startTime: "07:45", endTime: "08:15", done: true },
    { id: "t3", title: "Open till, count float to $200",      startTime: "07:00", endTime: "07:10", done: true },
    { id: "t4", title: "Mid-day pastry bake (check par)",     startTime: "11:00", endTime: "11:30", done: false },
    { id: "t5", title: "Clean espresso group heads",          startTime: "13:30", endTime: "13:45", done: false },
    { id: "t6", title: "Cash drop — lunch rush",              startTime: "14:00", endTime: "14:15", done: false },
  ];
  const doneCount = TASKS.filter(t => t.done).length;

  return (
    <div className="p-5 grid grid-cols-[minmax(0,1fr)_380px] gap-5">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">My shifts this week</h2>
          <div className="text-[12px] text-stone-500">{my.length} shifts · {my.reduce((sum, s) => { const [h1,m1]=s.startTime.split(":").map(Number); const [h2,m2]=s.endTime.split(":").map(Number); return sum + (h2+m2/60)-(h1+m1/60);},0).toFixed(1)}h total</div>
        </div>
        <div className="bg-white border border-[var(--border)] rounded divide-y divide-[var(--border)]">
          {week.map(d => {
            const ds = isoDate(d);
            const dayShifts = my.filter(s => s.date === ds);
            const isT = ds === todayStr;
            return (
              <div key={ds} className="flex items-stretch">
                <div className={`w-24 p-3 ${isT ? "bg-stone-900 text-white" : "bg-stone-50 text-stone-600"} flex flex-col items-center justify-center border-r border-[var(--border)]`}>
                  <div className="text-[10.5px] uppercase font-semibold tracking-wide opacity-70">
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className="text-[22px] font-bold tabular-nums leading-none mt-0.5">{d.getDate()}</div>
                </div>
                <div className="flex-1 p-3">
                  {dayShifts.length === 0 ? (
                    <div className="text-[12px] text-stone-400 italic">Not scheduled</div>
                  ) : dayShifts.map(s => (
                    <div key={s.id} className="flex items-center gap-3 py-1.5">
                      <div className="w-1 h-10 rounded-sm" style={{ background: SHIFT_COLORS[s.shiftType] }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold tabular-nums">{formatTime(s.startTime)} – {formatTime(s.endTime)}</div>
                        <div className="text-[11.5px] text-stone-500 flex items-center gap-2 mt-0.5">
                          <span>{SHIFT_LABELS[s.shiftType]}</span>
                          <span>·</span>
                          {s.staffRoles.map((rn, i) => (
                            <span key={i} className="inline-flex items-center gap-1">
                              <span className="inline-block h-2 w-2 rounded-full" style={{ background: ROLES.find(r=>r.name===rn)?.color ?? "#999" }} />
                              {rn}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" icon="arrow-left-right">Trade</Button>
                        <Button variant="outline" size="sm" icon="user-plus">Cover</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold flex items-center gap-2">
            <Icon name="sun" size={16} />
            Today's tasks
          </h2>
          <Pill>{doneCount}/{TASKS.length}</Pill>
        </div>
        <div className="bg-white border border-[var(--border)] rounded p-3 space-y-0.5">
          {TASKS.map(t => (
            <label key={t.id} className="flex items-start gap-2.5 py-1.5 hover:bg-stone-50 -mx-2 px-2 rounded cursor-pointer">
              <span className={`mt-0.5 h-4 w-4 shrink-0 border rounded flex items-center justify-center ${t.done ? "bg-stone-900 border-stone-900" : "border-stone-400 bg-white"}`}>
                {t.done && <Icon name="check" size={11} className="text-white" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10.5px] text-stone-400 tabular-nums shrink-0">{t.startTime}</span>
                  <span className={`text-[13px] ${t.done ? "line-through text-stone-400" : "text-stone-800"}`}>{t.title}</span>
                </div>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-4 bg-white border border-[var(--border)] rounded p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-semibold">My availability</div>
            <button className="text-[11.5px] text-stone-500 hover:text-stone-800 underline-offset-2 hover:underline">Edit</button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => (
              <span
                key={d}
                className={`px-2 py-0.5 text-[11px] font-medium border rounded ${i < 5 ? "bg-stone-900 text-white border-stone-900" : "border-[var(--border)] text-stone-400"}`}
              >
                {d}
              </span>
            ))}
          </div>
          <div className="text-[11.5px] text-stone-500 mt-2.5">Weekdays 9:00–17:00 · Unavailable weekends</div>
        </div>
      </div>
    </div>
  );
}

function RolesPanelDesktop() {
  const [selected, setSelected] = stfUseState(ROLES[0].id);
  const role = ROLES.find(r => r.id === selected);
  const TASKS_BY_ROLE = {
    r1: [ // Barista
      { id: "b1", title: "Wipe down espresso machine", startTime: "07:00", endTime: "07:15" },
      { id: "b2", title: "Check milk levels in fridge",  startTime: "07:15", endTime: "07:25" },
      { id: "b3", title: "Refill pastry display",        startTime: "07:30", endTime: "07:45" },
      { id: "b4", title: "Backwash group heads",         startTime: "14:00", endTime: "14:15" },
      { id: "b5", title: "Clean steam wands",            startTime: "14:15", endTime: "14:20" },
    ],
    r2: [
      { id: "l1", title: "Open store checklist",         startTime: "06:45", endTime: "07:05" },
      { id: "l2", title: "Count float, open till",       startTime: "07:05", endTime: "07:15" },
      { id: "l3", title: "Brief staff on promos",        startTime: "07:15", endTime: "07:25" },
      { id: "l4", title: "Mid-day cash drop",            startTime: "13:00", endTime: "13:10" },
    ],
    r3: [
      { id: "c1", title: "Pre-bag change, POS on",       startTime: "08:00", endTime: "08:10" },
      { id: "c2", title: "Restock bags & cups",           startTime: "10:00", endTime: "10:15" },
    ],
    r4: [
      { id: "k1", title: "Fire up ovens, proof dough",    startTime: "10:00", endTime: "10:20" },
      { id: "k2", title: "Sandwich prep (20 portions)",  startTime: "10:20", endTime: "11:00" },
    ],
    r5: [
      { id: "x1", title: "Bathroom check",                startTime: null, endTime: null },
      { id: "x2", title: "Mop floors",                     startTime: "21:30", endTime: "21:45" },
    ],
  };
  const tasks = TASKS_BY_ROLE[selected] ?? [];
  const members = TEAM.filter(m => m.status === "active" && m.roleTitle.toLowerCase().includes(role.name.toLowerCase()));

  return (
    <div className="p-5 grid grid-cols-[260px_minmax(0,1fr)] gap-5">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold">Roles</h2>
          <button className="h-7 w-7 border border-[var(--border)] rounded hover:bg-stone-100 flex items-center justify-center"><Icon name="plus" size={14} /></button>
        </div>
        <div className="bg-white border border-[var(--border)] rounded divide-y divide-[var(--border)]">
          {ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${selected === r.id ? "bg-stone-100" : "hover:bg-stone-50"}`}
            >
              <span className="h-7 w-7 rounded flex items-center justify-center text-white shrink-0" style={{ background: r.color }}>
                <Icon name={r.icon} size={13} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{r.name}</div>
                <div className="text-[10.5px] text-stone-500">{(TASKS_BY_ROLE[r.id] ?? []).length} tasks</div>
              </div>
              <Icon name="chevron-right" size={13} className="text-stone-400" />
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-3">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded flex items-center justify-center text-white" style={{ background: role.color }}>
              <Icon name={role.icon} size={16} />
            </span>
            <div>
              <h2 className="text-[16px] font-semibold">{role.name}</h2>
              <div className="text-[11.5px] text-stone-500">{members.length} members assigned</div>
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" icon="pencil">Edit</Button>
              <Button size="sm" icon="plus">Add task</Button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[var(--border)] rounded">
          <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-stone-500">Tasks ({tasks.length})</div>
            <div className="text-[11px] text-stone-400">Assigned to every shift with this role</div>
          </div>
          {tasks.map(t => (
            <div key={t.id} className="px-4 py-2.5 border-b last:border-b-0 border-[var(--border)] flex items-center gap-3 hover:bg-stone-50/50">
              <span className="h-4 w-4 border border-stone-300 rounded shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium">{t.title}</div>
              </div>
              <span className="font-mono text-[11px] text-stone-500 tabular-nums shrink-0">
                {t.startTime ? `${t.startTime.slice(0,5)}–${t.endTime.slice(0,5)}` : "Any time"}
              </span>
              <button className="p-1 hover:bg-stone-100 rounded text-stone-400 hover:text-stone-700"><Icon name="pencil" size={13} /></button>
            </div>
          ))}
        </div>

        <div className="mt-4 bg-white border border-[var(--border)] rounded p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-semibold">Members with this role</div>
            <Button variant="outline" size="sm" icon="user-plus">Assign</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {members.length === 0 ? (
              <div className="text-[12px] text-stone-400">No one assigned</div>
            ) : members.map(m => (
              <div key={m.id} className="inline-flex items-center gap-2 pr-2 pl-0.5 py-0.5 border border-[var(--border)] rounded">
                <Avatar name={m.name} size={22} color={m.color} />
                <span className="text-[12px] font-medium">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Requests right rail — collapsible, defaults collapsed
function RequestsRail({ timeOff, setTimeOff, trades, setTrades, pendingCount, shifts, toast }) {
  const [open, setOpen] = stfUseState(false);

  if (!open) {
    return (
      <aside className="w-10 border-l border-[var(--border)] bg-white shrink-0 flex flex-col items-center py-3 gap-2">
        <button
          onClick={() => setOpen(true)}
          className="relative h-9 w-9 rounded hover:bg-stone-100 flex items-center justify-center text-stone-600"
          title="Open requests"
        >
          <Icon name="inbox" size={16} />
          {pendingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-stone-900 text-white text-[9.5px] font-bold flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 [writing-mode:vertical-rl] rotate-180 mt-1">Requests</div>
      </aside>
    );
  }

  return (
    <aside className="w-[340px] border-l border-[var(--border)] bg-white shrink-0 flex flex-col overflow-hidden">
      <div className="h-12 flex items-center px-4 border-b border-[var(--border)]">
        <Icon name="inbox" size={15} className="text-stone-500" />
        <span className="ml-2 text-[13px] font-semibold">Requests</span>
        {pendingCount > 0 && <Pill tone="dark">{pendingCount}</Pill>}
        <button className="ml-auto p-1 hover:bg-stone-100 rounded text-stone-400" title="Filter"><Icon name="filter" size={14} /></button>
        <button onClick={() => setOpen(false)} className="p-1 hover:bg-stone-100 rounded text-stone-400" title="Collapse"><Icon name="panel-right-close" size={14} /></button>
      </div>
      <div className="flex-1 overflow-auto">
        <RequestsContent timeOff={timeOff} setTimeOff={setTimeOff} trades={trades} setTrades={setTrades} shifts={shifts} toast={toast} />
      </div>
    </aside>
  );
}

function RequestsContent({ timeOff, setTimeOff, trades, setTrades, shifts, toast }) {
  const approveTO = (id) => { setTimeOff(prev => prev.map(r => r.id === id ? { ...r, status: "approved" } : r)); toast("Time off approved"); };
  const denyTO    = (id) => { setTimeOff(prev => prev.map(r => r.id === id ? { ...r, status: "denied" } : r)); toast("Time off denied"); };
  const approveTD = (id) => { setTrades(prev => prev.map(t => t.id === id ? { ...t, status: "accepted" } : t)); toast("Trade accepted"); };
  const denyTD    = (id) => { setTrades(prev => prev.map(t => t.id === id ? { ...t, status: "denied" } : t)); toast("Trade denied"); };

  const pendingTO = timeOff.filter(r => r.status === "pending");
  const pendingTD = trades.filter(t => t.status === "pending");
  const recent    = [...timeOff.filter(r => r.status !== "pending"), ...trades.filter(t => t.status !== "pending")].slice(0, 3);

  return (
    <div className="p-3 space-y-4">
      {pendingTO.length > 0 && (
        <section>
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-stone-500">Time Off</div>
            <Pill>{pendingTO.length}</Pill>
          </div>
          <div className="space-y-2">
            {pendingTO.map(r => (
              <article key={r.id} className="border border-[var(--border)] rounded p-3">
                <div className="flex items-start gap-2.5">
                  <Avatar name={r.staffName} size={28} color={TEAM.find(m=>m.id===r.userId)?.color} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium leading-tight">{r.staffName}</div>
                    <div className="text-[11px] text-stone-500 mt-0.5">
                      {shortDate(r.startDate)}
                      {r.endDate !== r.startDate && ` – ${shortDate(r.endDate)}`}
                      {!r.fullDays && r.startTime && r.endTime && ` · ${formatTime(r.startTime)}–${formatTime(r.endTime)}`}
                    </div>
                    {r.comments && <div className="text-[11.5px] text-stone-600 italic mt-1 line-clamp-2">&ldquo;{r.comments}&rdquo;</div>}
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2.5">
                  <button onClick={() => approveTO(r.id)} className="flex-1 h-7 border border-[var(--border)] hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 rounded inline-flex items-center justify-center gap-1 text-[12px] font-medium text-stone-700">
                    <Icon name="check" size={13} />Approve
                  </button>
                  <button onClick={() => denyTO(r.id)} className="flex-1 h-7 border border-[var(--border)] hover:bg-red-50 hover:border-red-300 hover:text-red-700 rounded inline-flex items-center justify-center gap-1 text-[12px] font-medium text-stone-700">
                    <Icon name="ban" size={13} />Deny
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {pendingTD.length > 0 && (
        <section>
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-stone-500">Shift Trades</div>
            <Pill>{pendingTD.length}</Pill>
          </div>
          <div className="space-y-2">
            {pendingTD.map(t => {
              const shift = shifts.find(s => s.id === t.shiftId);
              const req = TEAM.find(m => m.id === t.requesterId);
              const tgt = t.targetId ? TEAM.find(m => m.id === t.targetId) : null;
              return (
                <article key={t.id} className="border border-[var(--border)] rounded p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Pill tone={t.type === "trade" ? "stone" : "amber"}>{t.type === "trade" ? "Trade" : "Cover"}</Pill>
                    {shift && <span className="text-[10.5px] text-stone-500 font-mono">{shortDate(shift.date)} · {formatTimeShort(shift.startTime)}–{formatTimeShort(shift.endTime)}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <Avatar name={req.name} size={22} color={req.color} />
                    <span className="font-medium">{req.name}</span>
                    <Icon name="arrow-right" size={12} className="text-stone-400" />
                    {tgt ? (
                      <>
                        <Avatar name={tgt.name} size={22} color={tgt.color} />
                        <span className="font-medium">{tgt.name}</span>
                      </>
                    ) : <span className="text-stone-500 italic text-[11.5px]">Anyone available</span>}
                  </div>
                  <div className="flex gap-1.5 mt-2.5">
                    <button onClick={() => approveTD(t.id)} className="flex-1 h-7 border border-[var(--border)] hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 rounded inline-flex items-center justify-center gap-1 text-[12px] font-medium text-stone-700">
                      <Icon name="check" size={13} />Accept
                    </button>
                    <button onClick={() => denyTD(t.id)} className="flex-1 h-7 border border-[var(--border)] hover:bg-red-50 hover:border-red-300 hover:text-red-700 rounded inline-flex items-center justify-center gap-1 text-[12px] font-medium text-stone-700">
                      <Icon name="ban" size={13} />Deny
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {pendingTO.length === 0 && pendingTD.length === 0 && (
        <div className="text-center py-10 text-[12px] text-stone-400">
          <Icon name="check-check" size={22} className="mx-auto mb-1 text-stone-300" />
          <div>All caught up — no pending requests.</div>
        </div>
      )}

      {recent.length > 0 && (
        <section>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-stone-500 px-1 mb-2">Recent</div>
          <div className="space-y-1 text-[11.5px] text-stone-500">
            {recent.map(r => (
              <div key={r.id} className="flex items-center gap-2 px-1">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${r.status === "approved" || r.status === "accepted" ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="flex-1 truncate">
                  {r.staffName ?? TEAM.find(m=>m.id===r.requesterId)?.name ?? "—"} · {r.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

Object.assign(window, {
  useStaffingState, StaffingA,
  TableGridWide, MyShiftsDesktop, RolesPanelDesktop, RequestsRail, ShiftChip,
});
