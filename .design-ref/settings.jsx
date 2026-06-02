// ─── Settings desktop ───
const { useState: setUseState, useMemo: setUseMemo } = React;

const SETTINGS_SECTIONS = [
  { group: "Business",  items: [
    { id: "business",   label: "Business info",     icon: "building-2",    desc: "Name, address, hours" },
    { id: "locations",  label: "Locations",         icon: "map-pin",       desc: "1 location · Oakland" },
    { id: "hours",      label: "Operating hours",   icon: "clock",         desc: "Tue–Sun · 7am–6pm" },
    { id: "billing",    label: "Plan & billing",    icon: "credit-card",   desc: "Business Plus · $49/mo" },
  ]},
  { group: "People",    items: [
    { id: "team",       label: "Team",              icon: "users",         desc: "12 active members" },
    { id: "roles",      label: "Roles & permissions", icon: "shield",      desc: "5 roles" },
    { id: "payroll",    label: "Payroll",           icon: "banknote",      desc: "Gusto · next run Oct 29" },
  ]},
  { group: "Operations", items: [
    { id: "pos",        label: "POS & payments",    icon: "credit-card",   desc: "Square · connected" },
    { id: "inventory",  label: "Inventory rules",   icon: "package",       desc: "Low-stock alerts" },
    { id: "notifs",     label: "Notifications",     icon: "bell",          desc: "Email + Slack" },
    { id: "integrations", label: "Integrations",    icon: "plug",          desc: "3 connected" },
  ]},
  { group: "Account",   items: [
    { id: "profile",    label: "Your profile",      icon: "user",          desc: "Amelia Chen" },
    { id: "security",   label: "Security",          icon: "lock",          desc: "2FA enabled" },
    { id: "api",        label: "API & webhooks",    icon: "code",          desc: "0 keys" },
  ]},
];

function useSettingsState() {
  const [values, setValues] = setUseState({
    name: "Maple Coffee Co.",
    legal: "Maple Coffee Company LLC",
    phone: "(510) 555-0142",
    email: "hi@maplecoffee.co",
    address1: "412 Grand Ave",
    city: "Oakland", state: "CA", zip: "94610",
    timezone: "America/Los_Angeles",
    currency: "USD",
    weekStart: "Monday",
    overtimeAfter: 40,
    clockInGrace: 5,
    breakRule: "auto",
    autoPublishSchedule: true,
    requireSwapApproval: true,
    notifyShiftChanges: true,
    notifyRequestsEmail: true,
    notifyRequestsSlack: false,
    notifyLowStock: true,
  });
  const set = (k, v) => setValues(prev => ({ ...prev, [k]: v }));
  return { values, setValues, set };
}

// ─── Variant A — Classic two-pane: grouped nav + detail ───
function SettingsB({ state, toast }) {
  const [selected, setSelected] = setUseState(null);
  const { values, set } = state;

  if (selected) {
    const allItems = SETTINGS_SECTIONS.flatMap(g => g.items);
    const item = allItems.find(i => i.id === selected);
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-6">
          <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1.5 text-[12px] text-stone-500 hover:text-stone-900 mb-4">
            <Icon name="arrow-left" size={13} /> All settings
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded bg-stone-100 flex items-center justify-center">
              <Icon name={item.icon} size={18} />
            </div>
            <div>
              <h1 className="text-[22px] font-bold tracking-tight">{item.label}</h1>
              <div className="text-[12px] text-stone-500">{item.desc}</div>
            </div>
          </div>
          <SettingsDetailBody id={selected} values={values} set={set} toast={toast} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-stone-50">
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h1 className="text-[24px] font-bold tracking-tight">Settings</h1>
          <p className="text-[13px] text-stone-500 mt-1">Configure how Maple Coffee runs in bizops.</p>
        </div>
        <div className="space-y-7">
          {SETTINGS_SECTIONS.map(group => (
            <section key={group.group}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 mb-3">{group.group}</div>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {group.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item.id)}
                    className="group text-left bg-white border border-[var(--border)] rounded p-4 hover:border-stone-400 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded bg-stone-100 group-hover:bg-stone-900 group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                        <Icon name={item.icon} size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold truncate">{item.label}</div>
                        <div className="text-[11.5px] text-stone-500 mt-0.5 truncate">{item.desc}</div>
                      </div>
                      <Icon name="arrow-up-right" size={14} className="text-stone-300 group-hover:text-stone-900 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Variant C — Long scroll single page with sticky nav (Stripe-style) ───
function SettingsDetail({ id, values, set, toast }) {
  const allItems = SETTINGS_SECTIONS.flatMap(g => g.items);
  const item = allItems.find(i => i.id === id);
  return (
    <div className="max-w-4xl mx-auto px-8 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[22px] font-bold tracking-tight">{item.label}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm">Cancel</Button>
          <Button size="sm" icon="check" onClick={() => toast("Saved")}>Save changes</Button>
        </div>
      </div>
      <div className="text-[12.5px] text-stone-500 mb-6">{item.desc}</div>
      <SettingsDetailBody id={id} values={values} set={set} toast={toast} />
    </div>
  );
}

// ─── Section bodies ───
function SettingsDetailBody({ id, values, set, toast }) {
  switch (id) {
    case "business":   return <BusinessBody values={values} set={set} />;
    case "hours":      return <HoursBody />;
    case "locations":  return <LocationsBody />;
    case "billing":    return <BillingBody />;
    case "team":       return <TeamBody toast={toast} />;
    case "roles":      return <RolesMiniBody />;
    case "payroll":    return <PayrollBody values={values} set={set} />;
    case "pos":        return <POSBody />;
    case "inventory":  return <InventoryRulesBody />;
    case "notifs":     return <NotificationsBody values={values} set={set} />;
    case "integrations": return <IntegrationsBody />;
    case "profile":    return <ProfileBody />;
    case "security":   return <SecurityBody />;
    case "api":        return <APIBody toast={toast} />;
    default:           return null;
  }
}

// Reusable form primitives
function Field({ label, hint, children, cols = 1 }) {
  return (
    <div className={`${cols === 2 ? "col-span-2" : ""} grid grid-cols-[180px_minmax(0,1fr)] gap-4 items-start py-3 border-b last:border-b-0 border-[var(--border)]`}>
      <div>
        <label className="text-[13px] font-medium text-stone-800">{label}</label>
        {hint && <div className="text-[11.5px] text-stone-500 mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}
function Card({ title, desc, children, right }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded">
      {(title || right) && (
        <div className="px-5 py-3 flex items-center justify-between border-b border-[var(--border)]">
          <div>
            {title && <div className="text-[14px] font-semibold">{title}</div>}
            {desc && <div className="text-[11.5px] text-stone-500 mt-0.5">{desc}</div>}
          </div>
          {right}
        </div>
      )}
      <div className="px-5">{children}</div>
    </div>
  );
}
function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 py-2.5 cursor-pointer">
      <button
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        className={`mt-0.5 inline-flex h-[18px] w-8 items-center rounded-full transition-colors shrink-0 ${checked ? "bg-stone-900" : "bg-stone-300"}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? "translate-x-[16px]" : "translate-x-[2px]"}`} />
      </button>
      {(label || hint) && (
        <div className="flex-1 min-w-0">
          {label && <div className="text-[13px] font-medium text-stone-800">{label}</div>}
          {hint && <div className="text-[11.5px] text-stone-500 mt-0.5">{hint}</div>}
        </div>
      )}
    </label>
  );
}

// ── Bodies ──
function BusinessBody({ values, set }) {
  return (
    <div className="space-y-5">
      <Card title="Business information">
        <Field label="Display name"><input className="w-full" value={values.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Legal name" hint="Shown on receipts and invoices"><input className="w-full" value={values.legal} onChange={(e) => set("legal", e.target.value)} /></Field>
        <Field label="Phone"><input className="w-full" value={values.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email"><input className="w-full" value={values.email} onChange={(e) => set("email", e.target.value)} /></Field>
      </Card>
      <Card title="Address">
        <Field label="Street"><input className="w-full" value={values.address1} onChange={(e) => set("address1", e.target.value)} /></Field>
        <Field label="City / State / Zip">
          <div className="grid grid-cols-[minmax(0,1fr)_90px_120px] gap-2">
            <input value={values.city} onChange={(e) => set("city", e.target.value)} />
            <input value={values.state} onChange={(e) => set("state", e.target.value)} />
            <input value={values.zip} onChange={(e) => set("zip", e.target.value)} />
          </div>
        </Field>
      </Card>
      <Card title="Localization">
        <Field label="Timezone"><select value={values.timezone} onChange={(e) => set("timezone", e.target.value)} className="w-72"><option>America/Los_Angeles</option><option>America/Denver</option><option>America/Chicago</option><option>America/New_York</option></select></Field>
        <Field label="Currency"><select value={values.currency} onChange={(e) => set("currency", e.target.value)} className="w-72"><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option></select></Field>
        <Field label="Week starts on"><select value={values.weekStart} onChange={(e) => set("weekStart", e.target.value)} className="w-72"><option>Monday</option><option>Sunday</option></select></Field>
      </Card>
    </div>
  );
}

function HoursBody() {
  const days = [
    { d: "Monday",    closed: true,  o: "",      c: "" },
    { d: "Tuesday",   closed: false, o: "07:00", c: "18:00" },
    { d: "Wednesday", closed: false, o: "07:00", c: "18:00" },
    { d: "Thursday",  closed: false, o: "07:00", c: "18:00" },
    { d: "Friday",    closed: false, o: "07:00", c: "19:00" },
    { d: "Saturday",  closed: false, o: "08:00", c: "19:00" },
    { d: "Sunday",    closed: false, o: "08:00", c: "16:00" },
  ];
  return (
    <Card title="Operating hours" desc="Shown on receipts and customer-facing pages" right={<Button variant="outline" size="sm" icon="copy">Copy weekday</Button>}>
      {days.map(r => (
        <div key={r.d} className="grid grid-cols-[140px_80px_minmax(0,1fr)] gap-3 items-center py-2.5 border-b last:border-b-0 border-[var(--border)]">
          <div className="text-[13px] font-medium">{r.d}</div>
          <Toggle checked={!r.closed} onChange={() => {}} />
          {r.closed ? (
            <div className="text-[12.5px] text-stone-400">Closed</div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="time" defaultValue={r.o} className="w-28" />
              <span className="text-stone-400 text-[12px]">to</span>
              <input type="time" defaultValue={r.c} className="w-28" />
              <button className="ml-auto text-[11.5px] text-stone-500 hover:text-stone-900">+ Add break</button>
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}

function LocationsBody() {
  const locs = [
    { id: "l1", name: "Oakland", addr: "412 Grand Ave, Oakland CA", primary: true, staff: 12 },
  ];
  return (
    <Card title="Locations" right={<Button size="sm" icon="plus">Add location</Button>}>
      {locs.map(l => (
        <div key={l.id} className="py-3 border-b last:border-b-0 border-[var(--border)] flex items-center gap-3">
          <div className="h-10 w-10 rounded bg-stone-100 flex items-center justify-center"><Icon name="map-pin" size={16} /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-[13.5px] font-semibold">{l.name}</div>
              {l.primary && <Pill>Primary</Pill>}
            </div>
            <div className="text-[11.5px] text-stone-500 truncate">{l.addr} · {l.staff} staff</div>
          </div>
          <Button variant="outline" size="sm">Manage</Button>
        </div>
      ))}
      <div className="py-8 border-t border-dashed border-[var(--border)] flex flex-col items-center justify-center text-[12px] text-stone-400">
        <Icon name="plus-circle" size={18} className="mb-1.5" />
        Add a second location to split schedules and inventory.
      </div>
    </Card>
  );
}

function BillingBody() {
  return (
    <div className="space-y-5">
      <div className="bg-white border border-[var(--border)] rounded p-5">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded bg-stone-900 text-white flex items-center justify-center">
            <Icon name="zap" size={20} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="text-[16px] font-semibold">Business Plus</div>
              <Pill tone="emerald">Active</Pill>
            </div>
            <div className="text-[12px] text-stone-500">$49/mo · billed monthly · renews Nov 12</div>
          </div>
          <Button variant="outline" size="sm">Change plan</Button>
          <Button variant="ghost" size="sm">Cancel</Button>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-[var(--border)]">
          {[
            { label: "Staff members", val: "12/25", sub: "25 included" },
            { label: "Locations",    val: "1/3",  sub: "3 included" },
            { label: "This month",   val: "$49.00", sub: "Next charge Nov 12" },
          ].map((x,i) => (
            <div key={i}>
              <div className="text-[10.5px] uppercase tracking-wider text-stone-500 font-semibold">{x.label}</div>
              <div className="text-[19px] font-bold tabular-nums mt-0.5">{x.val}</div>
              <div className="text-[11px] text-stone-500">{x.sub}</div>
            </div>
          ))}
        </div>
      </div>
      <Card title="Payment method">
        <div className="py-3 flex items-center gap-3">
          <div className="h-9 w-14 rounded bg-stone-900 text-white flex items-center justify-center text-[10px] font-bold">VISA</div>
          <div className="flex-1">
            <div className="text-[13px] font-medium">Visa •••• 4242</div>
            <div className="text-[11.5px] text-stone-500">Expires 08/2027</div>
          </div>
          <Button variant="outline" size="sm">Update</Button>
        </div>
      </Card>
      <Card title="Invoices" right={<Button variant="ghost" size="sm" icon="download">Download all</Button>}>
        {[
          { n: "INV-0125", date: "Oct 12, 2026", amt: "$49.00" },
          { n: "INV-0124", date: "Sep 12, 2026", amt: "$49.00" },
          { n: "INV-0123", date: "Aug 12, 2026", amt: "$49.00" },
        ].map(inv => (
          <div key={inv.n} className="py-2.5 border-b last:border-b-0 border-[var(--border)] grid grid-cols-[1fr_180px_100px_40px] items-center text-[13px]">
            <div className="font-mono">{inv.n}</div>
            <div className="text-stone-500">{inv.date}</div>
            <div className="tabular-nums font-semibold">{inv.amt}</div>
            <button className="justify-self-end p-1 hover:bg-stone-100 rounded"><Icon name="download" size={14} /></button>
          </div>
        ))}
      </Card>
    </div>
  );
}

function TeamBody({ toast }) {
  return (
    <Card title="Team members" desc={`${TEAM.filter(m=>m.status==='active').length} active · ${TEAM.filter(m=>m.status==='pending').length} pending`} right={<Button size="sm" icon="user-plus" onClick={() => toast("Invite sent (demo)")}>Invite member</Button>}>
      <div className="grid grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_40px] gap-3 items-center py-2 border-b border-[var(--border)] text-[10.5px] uppercase tracking-wide text-stone-500 font-semibold">
        <div className="pl-0" />
        <div>Name</div>
        <div>Role</div>
        <div>Contact</div>
        <div>Status</div>
        <div />
      </div>
      {TEAM.map(m => (
        <div key={m.id} className="grid grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_40px] gap-3 items-center py-3 border-b last:border-b-0 border-[var(--border)] hover:bg-stone-50/60">
          <Avatar name={m.name} size={30} color={m.color} />
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">{m.name}</div>
            <div className="text-[11px] text-stone-500">@{m.name.toLowerCase().split(' ')[0]}</div>
          </div>
          <div className="text-[12.5px] text-stone-700 truncate">{m.roleTitle}</div>
          <div className="text-[12px] text-stone-500 truncate font-mono">{m.email ?? `${m.name.toLowerCase().split(' ')[0]}@maplecoffee.co`}</div>
          <Pill tone={m.status === "active" ? "emerald" : "amber"}>{m.status}</Pill>
          <button className="justify-self-end p-1 hover:bg-stone-100 rounded"><Icon name="more-horizontal" size={14} /></button>
        </div>
      ))}
    </Card>
  );
}

function RolesMiniBody() {
  return (
    <Card title="Roles & permissions" right={<Button size="sm" icon="plus">New role</Button>}>
      {ROLES.map(r => (
        <div key={r.id} className="py-3 border-b last:border-b-0 border-[var(--border)] flex items-center gap-3">
          <div className="h-9 w-9 rounded flex items-center justify-center text-white shrink-0" style={{ background: r.color }}>
            <Icon name={r.icon} size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold">{r.name}</div>
            <div className="text-[11.5px] text-stone-500">{TEAM.filter(m => m.roleTitle.toLowerCase().includes(r.name.toLowerCase())).length} members · {r.permissions?.join(', ') ?? 'Schedule, POS, Inventory'}</div>
          </div>
          <Button variant="outline" size="sm" icon="pencil">Edit</Button>
        </div>
      ))}
    </Card>
  );
}

function PayrollBody({ values, set }) {
  return (
    <div className="space-y-5">
      <Card title="Provider">
        <div className="py-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-[11px]">G</div>
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold">Gusto</div>
            <div className="text-[11.5px] text-stone-500">Connected · next run Oct 29, 2026</div>
          </div>
          <Pill tone="emerald">Synced</Pill>
          <Button variant="outline" size="sm">Manage</Button>
        </div>
      </Card>
      <Card title="Pay rules">
        <Field label="Overtime after" hint="Weekly hours before overtime (1.5x) kicks in"><input type="number" value={values.overtimeAfter} onChange={(e) => set("overtimeAfter", +e.target.value)} className="w-24" /> hrs/week</Field>
        <Field label="Clock-in grace period" hint="Minutes early staff can clock in before shift"><input type="number" value={values.clockInGrace} onChange={(e) => set("clockInGrace", +e.target.value)} className="w-24" /> minutes</Field>
        <Field label="Break rule">
          <div className="flex flex-col gap-2">
            {[
              { v: "auto",   t: "Auto-deduct 30 min break on shifts > 5 hrs" },
              { v: "manual", t: "Require staff to clock out for breaks" },
              { v: "none",   t: "No break deductions" },
            ].map(opt => (
              <label key={opt.v} className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                <input type="radio" checked={values.breakRule === opt.v} onChange={() => set("breakRule", opt.v)} />
                {opt.t}
              </label>
            ))}
          </div>
        </Field>
      </Card>
    </div>
  );
}

function POSBody() {
  return (
    <div className="space-y-5">
      <Card title="Connected POS">
        <div className="py-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded bg-stone-900 text-white flex items-center justify-center font-bold text-[10px]">SQ</div>
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold">Square</div>
            <div className="text-[11.5px] text-stone-500">Connected Oct 3, 2026 · Terminal T2 · last sync 2 min ago</div>
          </div>
          <Pill tone="emerald">Healthy</Pill>
          <Button variant="outline" size="sm" icon="refresh-cw">Sync now</Button>
        </div>
      </Card>
      <Card title="Tipping">
        <Field label="Suggested tips" hint="Prompts shown on terminal"><div className="flex gap-2">{["15%", "18%", "20%", "25%"].map(t => <input key={t} defaultValue={t} className="w-16 text-center" />)}</div></Field>
        <Field label="Tip pooling"><Toggle checked={true} onChange={()=>{}} label="Pool tips across all staff on shift" hint="Split by hours worked at end of day" /></Field>
      </Card>
      <Card title="Tax">
        <Field label="Sales tax rate"><input defaultValue="8.75%" className="w-24" /></Field>
        <Field label="Tax-included pricing"><Toggle checked={false} onChange={()=>{}} label="Include tax in menu prices" /></Field>
      </Card>
    </div>
  );
}

function InventoryRulesBody() {
  return (
    <Card title="Stock alerts & auto-reorder">
      <Field label="Low-stock threshold" hint="Default for new products (can override per-SKU)"><input defaultValue="10" className="w-24" /> units</Field>
      <Field label="Alert recipients">
        <div className="flex flex-wrap gap-1.5">
          {TEAM.filter(m=>m.roleTitle==="Lead" || m.roleTitle==="Owner").map(m => (
            <span key={m.id} className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 border border-[var(--border)] rounded">
              <Avatar name={m.name} size={20} color={m.color} />
              <span className="text-[11.5px] font-medium">{m.name}</span>
              <button className="text-stone-400 hover:text-stone-700"><Icon name="x" size={11} /></button>
            </span>
          ))}
          <button className="inline-flex items-center gap-1 px-2 py-0.5 border border-dashed border-[var(--border)] rounded text-[11.5px] text-stone-500 hover:text-stone-900 hover:border-stone-400">+ Add</button>
        </div>
      </Field>
      <Field label="Auto-reorder"><Toggle checked={true} onChange={()=>{}} label="Create draft purchase orders when stock hits threshold" hint="You'll still need to approve before sending" /></Field>
      <Field label="Weekly stock take"><Toggle checked={true} onChange={()=>{}} label="Remind lead to do a stock take every Monday morning" /></Field>
    </Card>
  );
}

function NotificationsBody({ values, set }) {
  const rows = [
    { id: "notifyShiftChanges", label: "Shift changes",      hint: "When admins edit or publish the schedule" },
    { id: "autoPublishSchedule",label: "Auto-publish",       hint: "Publish drafted schedule at a set time each week" },
    { id: "requireSwapApproval",label: "Trade approvals",    hint: "Require admin approval before shift trades complete" },
    { id: "notifyRequestsEmail",label: "Requests via email", hint: "Time-off + trade requests sent to email" },
    { id: "notifyRequestsSlack",label: "Requests via Slack", hint: "Time-off + trade requests sent to #ops in Slack" },
    { id: "notifyLowStock",     label: "Low stock alerts",   hint: "When an item falls below its threshold" },
  ];
  return (
    <Card title="Notifications" desc="Choose what bizops sends you and your team">
      {rows.map(r => (
        <div key={r.id} className="py-1 border-b last:border-b-0 border-[var(--border)]">
          <Toggle checked={values[r.id]} onChange={(v) => set(r.id, v)} label={r.label} hint={r.hint} />
        </div>
      ))}
    </Card>
  );
}

function IntegrationsBody() {
  const all = [
    { n: "Square",         d: "POS + payments",    connected: true,  icon: "credit-card", tone: "emerald" },
    { n: "Gusto",          d: "Payroll",           connected: true,  icon: "banknote",    tone: "emerald" },
    { n: "Slack",          d: "Team messaging",    connected: true,  icon: "message-square", tone: "emerald" },
    { n: "QuickBooks",     d: "Accounting",        connected: false, icon: "book" },
    { n: "Mailchimp",      d: "Customer email",    connected: false, icon: "mail" },
    { n: "Google Workspace", d: "Calendar + Drive", connected: false, icon: "calendar" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {all.map(x => (
        <div key={x.n} className="bg-white border border-[var(--border)] rounded p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded bg-stone-100 flex items-center justify-center shrink-0"><Icon name={x.icon} size={16} /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-[13.5px] font-semibold">{x.n}</div>
                {x.connected && <Pill tone="emerald">Connected</Pill>}
              </div>
              <div className="text-[11.5px] text-stone-500 mt-0.5">{x.d}</div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant={x.connected ? "outline" : "default"} size="sm">{x.connected ? "Configure" : "Connect"}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileBody() {
  return (
    <div className="space-y-5">
      <Card title="Profile">
        <Field label="Avatar">
          <div className="flex items-center gap-3">
            <Avatar name="Amelia Chen" size={56} color={TEAM[0].color} />
            <Button variant="outline" size="sm" icon="upload">Upload photo</Button>
            <Button variant="ghost" size="sm">Remove</Button>
          </div>
        </Field>
        <Field label="Full name"><input defaultValue="Amelia Chen" className="w-full" /></Field>
        <Field label="Email"><input defaultValue="amelia@maplecoffee.co" className="w-full" /></Field>
        <Field label="Phone"><input defaultValue="(510) 555-0142" className="w-full" /></Field>
        <Field label="Role">
          <div className="text-[13px] py-1">Owner · <span className="text-stone-500">full access</span></div>
        </Field>
      </Card>
      <Card title="Preferences">
        <Field label="Theme">
          <div className="flex gap-2">
            {[{ v: "light", l: "Light" }, { v: "dim", l: "Dim" }, { v: "dark", l: "Dark" }].map(x => (
              <button key={x.v} className={`px-3 h-8 text-[12.5px] font-medium border rounded ${x.v === "light" ? "bg-stone-900 text-white border-stone-900" : "bg-white border-[var(--border)] text-stone-700 hover:bg-stone-50"}`}>{x.l}</button>
            ))}
          </div>
        </Field>
        <Field label="Default landing page">
          <select className="w-72" defaultValue="Dashboard">
            <option>Dashboard</option><option>Staffing</option><option>Sales</option><option>POS</option>
          </select>
        </Field>
      </Card>
    </div>
  );
}

function SecurityBody() {
  return (
    <div className="space-y-5">
      <Card title="Password">
        <div className="py-3 flex items-center gap-4">
          <div>
            <div className="text-[13px] font-medium">Password</div>
            <div className="text-[11.5px] text-stone-500">Last changed 62 days ago</div>
          </div>
          <Button variant="outline" size="sm" className="ml-auto">Change password</Button>
        </div>
      </Card>
      <Card title="Two-factor authentication">
        <Field label="Authenticator app" hint="Use an app like 1Password or Authy">
          <div className="flex items-center gap-3">
            <Pill tone="emerald">Enabled</Pill>
            <Button variant="ghost" size="sm">Reconfigure</Button>
            <Button variant="danger" size="sm">Remove</Button>
          </div>
        </Field>
        <Field label="SMS backup" hint="Send a code to your phone as a fallback">
          <div className="flex items-center gap-3">
            <Pill tone="amber">Off</Pill>
            <Button variant="outline" size="sm">Enable</Button>
          </div>
        </Field>
      </Card>
      <Card title="Active sessions" right={<Button variant="danger" size="sm">Sign out everywhere</Button>}>
        {[
          { dev: "MacBook Pro · Chrome", where: "Oakland, CA",  when: "Active now", current: true },
          { dev: "iPhone · bizops app",  where: "Oakland, CA",  when: "2 hours ago" },
          { dev: "iPad · Safari",         where: "Oakland, CA",  when: "3 days ago" },
        ].map((s, i) => (
          <div key={i} className="py-3 border-b last:border-b-0 border-[var(--border)] flex items-center gap-3">
            <Icon name={s.dev.startsWith("MacBook") ? "laptop" : s.dev.startsWith("iPhone") ? "smartphone" : "tablet"} size={16} className="text-stone-400" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium flex items-center gap-2">{s.dev}{s.current && <Pill tone="emerald">This device</Pill>}</div>
              <div className="text-[11.5px] text-stone-500">{s.where} · {s.when}</div>
            </div>
            {!s.current && <Button variant="ghost" size="sm">Sign out</Button>}
          </div>
        ))}
      </Card>
    </div>
  );
}

function APIBody({ toast }) {
  const [keys, setKeys] = setUseState([
    { id: "k1", name: "Website order widget", scope: "Orders · read/write", created: "Jun 2, 2026", last: "2 days ago" },
    { id: "k2", name: "Internal reporting",   scope: "Sales · read",        created: "Mar 14, 2026", last: "2 min ago"  },
  ]);
  return (
    <div className="space-y-5">
      <Card title="API keys" desc="Use these to integrate bizops with other tools" right={<Button size="sm" icon="plus" onClick={() => toast("Key created (demo)")}>New key</Button>}>
        {keys.map(k => (
          <div key={k.id} className="py-3 border-b last:border-b-0 border-[var(--border)]">
            <div className="flex items-center gap-3">
              <Icon name="key" size={14} className="text-stone-400" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold">{k.name}</div>
                <div className="text-[11.5px] text-stone-500">{k.scope} · created {k.created} · last used {k.last}</div>
                <div className="font-mono text-[11px] text-stone-400 mt-1">bzk_live_••••••••••••{k.id.slice(-4)}</div>
              </div>
              <Button variant="ghost" size="sm" icon="copy">Copy</Button>
              <Button variant="danger" size="sm">Revoke</Button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Webhooks" right={<Button variant="outline" size="sm" icon="plus">Add endpoint</Button>}>
        <div className="py-3">
          <div className="text-[12.5px] text-stone-500">No webhooks configured.</div>
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { SETTINGS_SECTIONS, useSettingsState, SettingsB });
