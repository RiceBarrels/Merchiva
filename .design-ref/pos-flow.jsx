// ─── Pay flow + receipt + auxiliary screens ───
const { useState: payUS, useEffect: payUE, useRef: payUR } = React;

// Pay overlay — full-screen, works for all variants
function PayOverlay({ state, variant = "soft" }) {
  const { cart, subtotal, tax, tip, tipPct, setTipPct, total, payMethod, setPayMethod, goBackToOrder, completeOrder, member } = state;
  const [splits, setSplits] = payUS(1);
  const [cashTaken, setCashTaken] = payUS(null);

  const methods = [
    { id: "card",   label: "Card",        icon: "credit-card",  sub: "Tap, insert, or swipe" },
    { id: "cash",   label: "Cash",        icon: "banknote",     sub: "Open drawer" },
    { id: "mobile", label: "Mobile Pay",  icon: "smartphone",   sub: "Apple / Google Pay" },
    { id: "gift",   label: "Gift Card",   icon: "gift",         sub: "Scan or enter code" },
  ];
  const cashOptions = [
    Math.ceil(total),
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
  ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="absolute inset-0 z-30 bg-stone-50 flex flex-col">
      {/* Header */}
      <div className="h-16 border-b border-[var(--border)] bg-white flex items-center px-6 gap-4 shrink-0">
        <button onClick={goBackToOrder} className="h-10 px-3 rounded-lg border border-[var(--border)] hover:bg-stone-100 inline-flex items-center gap-2 text-[13px] font-medium">
          <Icon name="arrow-left" size={15} /> Back to order
        </button>
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500">Checkout</div>
          <div className="text-[15px] font-semibold">{cart.length} items · {member.name}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500">Total</div>
          <div className="text-[22px] font-semibold tabular-nums">{money(total)}</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto grid grid-cols-[1fr_380px] min-h-0">
        {/* Left: method + tip + split */}
        <div className="p-8 overflow-auto">
          <div className="max-w-[640px] mx-auto space-y-8">
            <section>
              <SectionLabel>Tender</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                {methods.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setPayMethod(m.id)}
                    className={`p-5 rounded-2xl border-2 text-left transition-colors ${payMethod === m.id ? "border-stone-900 bg-stone-900 text-white" : "border-[var(--border)] bg-white hover:border-stone-400"}`}
                  >
                    <Icon name={m.icon} size={22} />
                    <div className="text-[15px] font-semibold mt-3">{m.label}</div>
                    <div className={`text-[11.5px] mt-0.5 ${payMethod === m.id ? "text-white/70" : "text-stone-500"}`}>{m.sub}</div>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <SectionLabel>Tip</SectionLabel>
              <div className="grid grid-cols-5 gap-2">
                {[0, 10, 15, 20, 25].map(p => (
                  <button
                    key={p}
                    onClick={() => setTipPct(p)}
                    className={`py-4 rounded-xl border text-center transition-colors ${tipPct === p ? "bg-stone-900 border-stone-900 text-white" : "bg-white border-[var(--border)] hover:border-stone-400"}`}
                  >
                    <div className="text-[16px] font-semibold">{p === 0 ? "None" : `${p}%`}</div>
                    {p > 0 && <div className={`text-[11px] mt-0.5 tabular-nums ${tipPct === p ? "text-white/70" : "text-stone-500"}`}>{money(subtotal * p / 100)}</div>}
                  </button>
                ))}
              </div>
            </section>

            {payMethod === "cash" && (
              <section>
                <SectionLabel>Cash tendered</SectionLabel>
                <div className="grid grid-cols-4 gap-2">
                  {cashOptions.map(v => (
                    <button
                      key={v}
                      onClick={() => setCashTaken(v)}
                      className={`py-4 rounded-xl border text-center transition-colors ${cashTaken === v ? "bg-stone-900 border-stone-900 text-white" : "bg-white border-[var(--border)] hover:border-stone-400"}`}
                    >
                      <div className="text-[16px] font-semibold tabular-nums">{money(v)}</div>
                    </button>
                  ))}
                </div>
                {cashTaken != null && cashTaken >= total && (
                  <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
                    <Icon name="banknote" size={20} className="text-emerald-700" />
                    <div>
                      <div className="text-[12px] text-emerald-700 font-semibold uppercase tracking-wide">Change owed</div>
                      <div className="text-[22px] font-bold text-emerald-900 tabular-nums">{money(cashTaken - total)}</div>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section>
              <SectionLabel>Split</SectionLabel>
              <div className="flex items-center gap-2">
                {[1,2,3,4].map(n => (
                  <button
                    key={n}
                    onClick={() => setSplits(n)}
                    className={`flex-1 py-3 rounded-xl border text-center ${splits === n ? "bg-stone-900 border-stone-900 text-white" : "bg-white border-[var(--border)] hover:border-stone-400"}`}
                  >
                    <div className="text-[14px] font-semibold">{n === 1 ? "Single" : `${n} ways`}</div>
                    {n > 1 && <div className="text-[11px] tabular-nums mt-0.5 opacity-70">{money(total / n)} each</div>}
                  </button>
                ))}
                <button className="flex-1 py-3 rounded-xl border border-dashed border-[var(--border)] text-[13px] text-stone-600 hover:bg-stone-50">Custom…</button>
              </div>
            </section>
          </div>
        </div>

        {/* Right: summary */}
        <aside className="border-l border-[var(--border)] bg-white flex flex-col overflow-hidden">
          <div className="p-5 border-b border-[var(--border)]">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500">Order summary</div>
          </div>
          <div className="flex-1 overflow-auto divide-y divide-[var(--border)]">
            {cart.map(l => (
              <div key={l.uid} className="px-5 py-3 flex items-start gap-3">
                <span className="text-[14px]">{l.tag}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{l.name}</div>
                  {l.modText && <div className="text-[11px] text-stone-500 mt-0.5">{l.modText}</div>}
                  <div className="text-[11px] text-stone-400 mt-0.5">× {l.qty}</div>
                </div>
                <div className="text-[13px] font-semibold tabular-nums">{money(l.price * l.qty)}</div>
              </div>
            ))}
          </div>
          <div className="px-5 py-4 space-y-1.5 text-[13px] border-t border-[var(--border)] bg-stone-50">
            <Row label="Subtotal" value={money(subtotal)} />
            <Row label={`Tip (${tipPct}%)`} value={money(tip)} />
            <Row label="Tax (8.75%)" value={money(tax)} />
            <div className="h-px bg-[var(--border)] my-2" />
            <Row label="Total" value={money(total)} bold big />
          </div>
          <button
            onClick={completeOrder}
            disabled={payMethod === "cash" && (cashTaken == null || cashTaken < total)}
            className="h-16 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white text-[16px] font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Icon name="check-circle" size={18} />
            Charge {money(total)}
          </button>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, bold, big }) {
  return (
    <div className="flex items-center justify-between">
      <div className={`${bold ? "font-semibold" : "text-stone-600"} ${big ? "text-[15px]" : ""}`}>{label}</div>
      <div className={`tabular-nums ${bold ? "font-semibold" : ""} ${big ? "text-[18px]" : ""}`}>{value}</div>
    </div>
  );
}
function SectionLabel({ children }) {
  return <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-stone-500 mb-3">{children}</div>;
}

// ─── Receipt / success ───
function ReceiptOverlay({ state }) {
  const { cart, subtotal, tax, tip, tipPct, total, member, newOrder, payMethod } = state;
  const orderId = posUM(() => "#A" + Math.floor(Math.random() * 800 + 400), []);
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const methodLabel = { card: "Card ··4821", cash: "Cash", mobile: "Apple Pay", gift: "Gift Card" }[payMethod] || "Card";

  return (
    <div className="absolute inset-0 z-30 bg-stone-50 flex flex-col items-center justify-center p-8 overflow-auto">
      <div className="w-full max-w-[420px] flex flex-col items-center">
        <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
          <Icon name="check" size={36} className="text-emerald-700" strokeWidth={2.4} />
        </div>
        <div className="text-[24px] font-semibold">Paid {money(total)}</div>
        <div className="text-[14px] text-stone-500 mt-1">Order {orderId} · Sent to bar</div>

        {/* Receipt card */}
        <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm w-full mt-6 p-5 font-mono text-[12px]">
          <div className="text-center border-b border-dashed border-stone-300 pb-3 mb-3">
            <div className="font-sans text-[14px] font-semibold">Maple Coffee</div>
            <div className="text-[11px] text-stone-500">Oakland · 2344 Piedmont Ave</div>
            <div className="text-[11px] text-stone-500 mt-0.5">{now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {timeStr}</div>
            <div className="text-[11px] text-stone-500 mt-0.5">Order {orderId} · {member.name}</div>
          </div>
          <div className="space-y-1.5">
            {cart.map(l => (
              <div key={l.uid}>
                <div className="flex justify-between">
                  <span className="truncate">{l.qty}× {l.name}</span>
                  <span className="tabular-nums">{money(l.price * l.qty)}</span>
                </div>
                {l.modText && <div className="text-stone-400 pl-3 text-[10.5px]">{l.modText}</div>}
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-stone-300 my-3" />
          <div className="space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
            <div className="flex justify-between"><span>Tip {tipPct}%</span><span className="tabular-nums">{money(tip)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span className="tabular-nums">{money(tax)}</span></div>
            <div className="flex justify-between font-semibold text-[13px] mt-1 pt-1 border-t border-stone-300"><span>Total</span><span className="tabular-nums">{money(total)}</span></div>
            <div className="flex justify-between text-stone-500"><span>Paid</span><span>{methodLabel}</span></div>
          </div>
          {member.tier !== "guest" && (
            <div className="border-t border-dashed border-stone-300 my-3 pt-3 text-center">
              <div className="text-[11px] text-stone-500">+{Math.floor(total)} points earned · {member.name.split(" ")[0]}</div>
              <div className="font-sans text-[13px] font-semibold mt-0.5">{(member.points + Math.floor(total)).toLocaleString()} total</div>
            </div>
          )}
          <div className="text-center text-[10.5px] text-stone-400 mt-3 font-sans">Thanks — see you tomorrow ☕</div>
        </div>

        <div className="flex gap-2 mt-6 w-full">
          <button className="flex-1 h-12 rounded-xl border border-[var(--border)] bg-white hover:bg-stone-50 text-[13px] font-medium inline-flex items-center justify-center gap-2">
            <Icon name="mail" size={15} /> Email
          </button>
          <button className="flex-1 h-12 rounded-xl border border-[var(--border)] bg-white hover:bg-stone-50 text-[13px] font-medium inline-flex items-center justify-center gap-2">
            <Icon name="message-square" size={15} /> Text
          </button>
          <button className="flex-1 h-12 rounded-xl border border-[var(--border)] bg-white hover:bg-stone-50 text-[13px] font-medium inline-flex items-center justify-center gap-2">
            <Icon name="printer" size={15} /> Print
          </button>
        </div>
        <button
          onClick={newOrder}
          className="mt-3 w-full h-14 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2"
        >
          <Icon name="plus" size={16} /> New order
        </button>
      </div>
    </div>
  );
}

// ─── Kitchen / bar queue ───
function KitchenView() {
  const [tickets, setTickets] = payUS(POS_TICKETS);
  const [filter, setFilter]   = payUS("all");
  const filtered = tickets.filter(t => filter === "all" || t.station === filter);
  const adv = (id) => setTickets(prev => prev.map(t => {
    if (t.id !== id) return t;
    const next = { new: "making", making: "ready", ready: "done" }[t.state] ?? "done";
    return { ...t, state: next };
  }).filter(t => t.state !== "done"));

  return (
    <div className="h-full flex flex-col bg-stone-900 text-stone-100">
      <div className="h-14 border-b border-stone-800 flex items-center px-5 gap-4 shrink-0">
        <div className="text-[15px] font-semibold">Queue</div>
        <div className="text-[12px] text-stone-400">{filtered.length} active</div>
        <div className="ml-auto inline-flex rounded-lg overflow-hidden border border-stone-700">
          {[{id:"all",label:"All"},{id:"bar",label:"Bar"},{id:"kitchen",label:"Kitchen"}].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`px-3 py-1.5 text-[12px] font-medium ${filter === f.id ? "bg-white text-stone-900" : "bg-stone-800 text-stone-300 hover:bg-stone-700"}`}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-5 grid grid-cols-3 gap-4 auto-rows-max">
        {filtered.map(t => {
          const stateTone = { new: "bg-amber-500", making: "bg-sky-500", ready: "bg-emerald-500" }[t.state];
          const stateLabel = { new: "New", making: "Making", ready: "Ready" }[t.state];
          return (
            <div key={t.id} className="bg-stone-800 rounded-xl overflow-hidden border border-stone-700 flex flex-col">
              <div className="px-4 py-3 border-b border-stone-700 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${stateTone}`} />
                <span className="text-[11px] font-semibold uppercase tracking-wider">{stateLabel}</span>
                <span className="ml-auto text-[12px] text-stone-400 font-mono">{t.time}</span>
              </div>
              <div className="px-4 py-3 flex items-baseline gap-2">
                <span className="text-[20px] font-bold font-mono">{t.id}</span>
                <span className="text-[11.5px] text-stone-400">{t.cust}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-stone-500">{t.station}</span>
              </div>
              <div className="px-4 pb-3 space-y-1.5 flex-1">
                {t.items.map((it, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-[14px]">
                    <span className="font-bold text-stone-300 tabular-nums">{it.qty}</span>
                    <div className="flex-1">
                      <div className="font-medium">{it.name}</div>
                      {it.notes && <div className="text-[11.5px] text-amber-300 italic">› {it.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => adv(t.id)}
                className={`h-11 text-[13px] font-semibold ${t.state === "ready" ? "bg-emerald-500 hover:bg-emerald-400 text-stone-900" : "bg-stone-700 hover:bg-stone-600 text-white"}`}
              >
                {t.state === "ready" ? "✓ Mark handed off" : t.state === "making" ? "Mark ready" : "Start making"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Refunds / recent transactions ───
function RefundsView() {
  const [selected, setSelected] = payUS(POS_RECENT_TX[0]);
  const [refunding, setRefunding] = payUS(false);
  return (
    <div className="h-full grid grid-cols-[360px_1fr] bg-white">
      <div className="border-r border-[var(--border)] flex flex-col overflow-hidden">
        <div className="h-14 border-b border-[var(--border)] flex items-center px-4 gap-2 shrink-0">
          <Icon name="receipt" size={15} className="text-stone-500" />
          <div className="text-[14px] font-semibold">Recent transactions</div>
          <div className="ml-auto text-[11px] text-stone-500">Today</div>
        </div>
        <div className="p-3 border-b border-[var(--border)]">
          <div className="relative">
            <Icon name="search" size={15} className="text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search tx id, card last 4…" className="w-full !pl-9 !py-2 !text-[13px]" />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {POS_RECENT_TX.map(t => (
            <button
              key={t.id}
              onClick={() => { setSelected(t); setRefunding(false); }}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b last:border-b-0 border-[var(--border)] ${selected?.id === t.id ? "bg-stone-100" : "hover:bg-stone-50"}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[12.5px] font-semibold">{t.id}</span>
                  <span className="text-[11px] text-stone-500">{t.time}</span>
                </div>
                <div className="text-[12px] text-stone-600 truncate mt-0.5">{t.cust} · {t.paid}</div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-semibold tabular-nums">{money(t.total)}</div>
                <div className="text-[10.5px] text-stone-500">{t.items} items</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-auto">
        {selected && (
          <div className="max-w-[680px] mx-auto p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-xl bg-stone-100 flex items-center justify-center"><Icon name="receipt" size={20} /></div>
              <div className="flex-1">
                <div className="text-[20px] font-semibold font-mono">{selected.id}</div>
                <div className="text-[12.5px] text-stone-500">{selected.time} · {selected.cashier} · {selected.paid}</div>
              </div>
              <button className="h-10 px-3 rounded-lg border border-[var(--border)] bg-white hover:bg-stone-50 text-[12.5px] font-medium inline-flex items-center gap-2"><Icon name="printer" size={14} />Reprint</button>
            </div>

            <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border)] bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-500 flex">
                <div className="flex-1">Line items</div>
                <div className="w-16 text-right">Qty</div>
                <div className="w-24 text-right">Total</div>
                <div className="w-24 text-right">Refund</div>
              </div>
              {[
                { n: "Latte · Oat", q: 1, t: 6.00 },
                { n: "Matcha Latte · Large", q: 1, t: 6.50 },
                { n: "Butter Croissant", q: 1, t: 4.25 },
                { n: "Tax + Tip", q: 1, t: 1.50 },
              ].map((l, i) => (
                <div key={i} className="px-5 py-3 border-b last:border-b-0 border-[var(--border)] flex items-center">
                  <div className="flex-1 text-[13.5px]">{l.n}</div>
                  <div className="w-16 text-right tabular-nums text-[13px]">{l.q}</div>
                  <div className="w-24 text-right tabular-nums text-[13px] font-medium">{money(l.t)}</div>
                  <div className="w-24 text-right">
                    <input type="checkbox" className="!w-4 !h-4" defaultChecked={refunding} />
                  </div>
                </div>
              ))}
            </div>

            {!refunding ? (
              <div className="mt-6 flex items-center gap-2">
                <button onClick={() => setRefunding(true)} className="h-11 px-4 rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 text-[13px] font-semibold inline-flex items-center gap-2">
                  <Icon name="corner-up-left" size={15} /> Issue refund
                </button>
                <button className="h-11 px-4 rounded-lg border border-[var(--border)] bg-white hover:bg-stone-50 text-[13px] font-medium inline-flex items-center gap-2">
                  <Icon name="percent" size={14} /> Adjust
                </button>
                <div className="ml-auto text-right">
                  <div className="text-[11px] text-stone-500">Paid</div>
                  <div className="text-[22px] font-semibold tabular-nums">{money(selected.total)}</div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
                <div className="flex items-start gap-3">
                  <Icon name="alert-triangle" size={18} className="text-red-700 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-[14px] font-semibold text-red-900">Refunding {money(selected.total)} to {selected.paid}</div>
                    <div className="text-[12px] text-red-700 mt-0.5">This action is logged. Reason required.</div>
                    <select className="mt-3 w-full !py-2 !text-[13px] bg-white">
                      <option>Customer request — didn't like drink</option>
                      <option>Made incorrectly</option>
                      <option>Duplicate charge</option>
                      <option>Other (add note)</option>
                    </select>
                    <div className="flex gap-2 mt-4">
                      <button className="h-10 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[13px] font-semibold">Confirm refund {money(selected.total)}</button>
                      <button onClick={() => setRefunding(false)} className="h-10 px-4 rounded-lg border border-[var(--border)] bg-white hover:bg-stone-50 text-[13px] font-medium">Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── End of day ───
function EODView() {
  const e = POS_EOD;
  return (
    <div className="h-full overflow-auto bg-stone-50">
      <div className="max-w-[960px] mx-auto p-8">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-2xl bg-stone-900 text-white flex items-center justify-center">
            <Icon name="file-text" size={22} />
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500">Shift close</div>
            <div className="text-[24px] font-semibold">{e.date}</div>
            <div className="text-[13px] text-stone-600 mt-0.5">{e.shift} · {e.cashier}</div>
          </div>
          <button className="h-11 px-4 rounded-lg border border-[var(--border)] bg-white hover:bg-stone-50 text-[13px] font-medium inline-flex items-center gap-2"><Icon name="download" size={14} />Export</button>
          <button className="h-11 px-4 rounded-lg bg-stone-900 text-white text-[13px] font-semibold inline-flex items-center gap-2"><Icon name="lock" size={14} />Close shift</button>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-8">
          <Metric label="Transactions" value={e.txCount} />
          <Metric label="Gross" value={money(e.gross)} />
          <Metric label="Tips" value={money(e.tips)} tone="emerald" />
          <Metric label="Net" value={money(e.net)} big />
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="bg-white rounded-2xl border border-[var(--border)] p-5">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-4">Tenders</div>
            <div className="space-y-3">
              {e.tenders.map(t => (
                <div key={t.method}>
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="text-[13px] font-medium">{t.method}</div>
                    <div className="text-[13px] tabular-nums font-semibold">{money(t.amount)}</div>
                  </div>
                  <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                    <div className="h-full bg-stone-900" style={{ width: `${(t.amount / e.gross) * 100}%` }} />
                  </div>
                  <div className="text-[11px] text-stone-500 mt-1">{t.count} transactions</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[var(--border)] p-5">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-4">Cash drawer</div>
            <div className="space-y-2 text-[13px]">
              <Row label="Opening float" value={money(e.cashDrawer.opening)} />
              <Row label="Cash sales" value={money(326)} />
              <Row label="Refunds" value={`− ${money(e.refunds)}`} />
              <div className="h-px bg-[var(--border)] my-2" />
              <Row label="Expected in drawer" value={money(e.cashDrawer.expected)} bold />
              <Row label="Counted" value={money(e.cashDrawer.counted)} />
              <div className={`flex items-center justify-between mt-2 p-3 rounded-lg ${e.cashDrawer.variance < 0 ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
                <div className="text-[12px] font-semibold uppercase tracking-wide">Variance</div>
                <div className="text-[15px] font-semibold tabular-nums">{e.cashDrawer.variance >= 0 ? "+" : ""}{money(e.cashDrawer.variance)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[var(--border)] p-5 mt-4">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-4">Top items</div>
          <div className="space-y-3">
            {e.topItems.map(it => (
              <div key={it.name}>
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-[13px] font-medium">{it.name}</div>
                  <div className="text-[12px] tabular-nums text-stone-600">{it.qty} sold</div>
                </div>
                <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div className="h-full bg-stone-800" style={{ width: `${(it.qty / e.topItems[0].qty) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone, big }) {
  const tones = { emerald: "text-emerald-700", default: "" };
  return (
    <div className={`bg-white rounded-2xl border border-[var(--border)] p-5 ${big ? "bg-stone-900 text-white border-stone-900" : ""}`}>
      <div className={`text-[10.5px] uppercase tracking-wider font-semibold ${big ? "text-white/60" : "text-stone-500"}`}>{label}</div>
      <div className={`${big ? "text-[28px]" : "text-[22px]"} font-semibold tabular-nums mt-1 ${tones[tone] || ""}`}>{value}</div>
    </div>
  );
}

Object.assign(window, { PayOverlay, ReceiptOverlay, KitchenView, RefundsView, EODView, Row, Metric });
