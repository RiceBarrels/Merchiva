// ─── Mobile POS — iPhone-style portrait, full flow ───
const { useState: mUS, useEffect: mUE, useMemo: mUM, useRef: mUR } = React;

function VariantMobile({ state }) {
  const [tab, setTab] = mUS("menu"); // menu | cart | more
  const [cartLineFor, setCartLineFor] = mUS(null);  // local line-edit sheet
  const cartCount = state.cart.reduce((s, l) => s + l.qty, 0);

  const onLineClick = (uid) => state.setEditLineUid(uid);

  // When cart goes empty mid-checkout, bounce back to menu tab
  mUE(() => {
    if (state.cart.length === 0 && tab === "cart" && state.stage === "order") setTab("menu");
  }, [state.cart.length, tab, state.stage]);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-white">
      {/* Top bar */}
      <header className="px-4 pt-2 pb-2.5 border-b border-[var(--border)] bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded bg-stone-900 text-white flex items-center justify-center text-[10px] font-bold">bz</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 leading-none">Maple · Oakland</div>
            <div className="text-[13px] font-semibold leading-tight">Register · Amelia</div>
          </div>
          <button className="h-8 w-8 rounded border border-[var(--border)] flex items-center justify-center text-stone-500 hover:bg-stone-50">
            <Icon name="bell" size={14}/>
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === "menu" && <MobileMenu state={state} />}
        {tab === "cart" && <MobileCart state={state} onLineClick={onLineClick} />}
        {tab === "more" && <MobileMore state={state} />}
      </div>

      {/* Sticky CTA above tab bar when cart has items + on menu tab */}
      {tab === "menu" && cartCount > 0 && (
        <div className="px-3 pb-2 shrink-0">
          <button
            onClick={() => setTab("cart")}
            className="w-full h-12 rounded-lg bg-stone-900 hover:bg-stone-800 text-white inline-flex items-center px-4 gap-3 transition-colors"
          >
            <span className="h-6 min-w-6 px-1.5 rounded bg-white/15 text-[12px] font-mono font-semibold tabular-nums flex items-center justify-center">{cartCount}</span>
            <span className="text-[13px] font-semibold">View order</span>
            <span className="ml-auto font-mono tabular-nums text-[14px] font-semibold">{money(state.subtotal + state.tax + state.tip)}</span>
            <Icon name="chevron-right" size={15}/>
          </button>
        </div>
      )}

      {/* Tab bar */}
      <nav className="border-t border-[var(--border)] bg-white shrink-0 grid grid-cols-3 h-14">
        <MobileTab active={tab === "menu"} onClick={() => setTab("menu")} icon="grid-3x3" label="Menu" />
        <MobileTab active={tab === "cart"} onClick={() => setTab("cart")} icon="shopping-bag" label="Cart" badge={cartCount} />
        <MobileTab active={tab === "more"} onClick={() => setTab("more")} icon="more-horizontal" label="More" />
      </nav>
    </div>
  );
}

function MobileTab({ active, icon, label, onClick, badge }) {
  return (
    <button onClick={onClick} className={`relative flex flex-col items-center justify-center gap-0.5 ${active ? "text-stone-900" : "text-stone-400"}`}>
      <div className="relative">
        <Icon name={icon} size={19}/>
        {badge > 0 && (
          <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-stone-900 text-white text-[9px] font-mono font-bold tabular-nums flex items-center justify-center">{badge}</span>
        )}
      </div>
      <div className="text-[10px] font-medium">{label}</div>
    </button>
  );
}

// ─── Mobile menu (browse + add) ───
function MobileMenu({ state }) {
  const filtered = mUM(() => {
    const q = state.search.trim().toLowerCase();
    return POS_PRODUCTS.filter(p => {
      if (q) return p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
      return p.cat === state.activeCat;
    });
  }, [state.search, state.activeCat]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Search + customer pill */}
      <div className="px-3 py-2.5 border-b border-[var(--border)] bg-white shrink-0 space-y-2">
        <div className="relative">
          <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"/>
          <input
            value={state.search}
            onChange={e => state.setSearch(e.target.value)}
            placeholder="Search menu or scan…"
            className="w-full !pl-8 !pr-9 !py-2 !text-[13px]"
          />
          <button className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded hover:bg-stone-100 text-stone-500 flex items-center justify-center">
            <Icon name="scan-line" size={14}/>
          </button>
        </div>
        <button className="w-full h-9 rounded-lg border border-[var(--border)] bg-white hover:bg-stone-50 px-2.5 inline-flex items-center gap-2 text-left">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${state.member.id === "u1" ? "bg-stone-100 text-stone-500" : "bg-stone-900 text-white"}`}>
            {state.member.id === "u1" ? <Icon name="user" size={12}/> : initials(state.member.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold leading-tight truncate">{state.member.name}</div>
            {state.member.tier !== "guest" && <div className="text-[10px] text-stone-500 font-mono tabular-nums">{state.member.tier} · {state.member.points} pts</div>}
          </div>
          <Icon name="chevron-right" size={13} className="text-stone-400"/>
        </button>
      </div>

      {/* Categories — horizontal chips */}
      <div className="border-b border-[var(--border)] bg-white shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1 px-3 py-2 min-w-min">
          {POS_CATEGORIES.map(c => {
            const active = c.id === state.activeCat && !state.search;
            return (
              <button
                key={c.id}
                onClick={() => { state.setCat(c.id); state.setSearch(""); }}
                className={`h-7 px-2.5 rounded inline-flex items-center gap-1.5 text-[12px] font-medium shrink-0 transition-colors ${active ? "bg-stone-900 text-white" : "border border-[var(--border)] text-stone-600 hover:bg-stone-50"}`}
              >
                <Icon name={c.icon} size={12}/> {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product list — 2-col grid */}
      <div className="flex-1 overflow-auto bg-stone-50 p-2.5">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => state.setModalItem(p)}
              className="bg-white border border-[var(--border)] rounded-lg p-2.5 text-left hover:border-stone-400 active:bg-stone-50 transition-colors flex flex-col relative"
            >
              {p.popular && <span className="absolute top-2 right-2 text-[8.5px] font-bold bg-amber-100 text-amber-800 px-1 py-px rounded uppercase tracking-wider">POP</span>}
              <div className="h-9 w-9 rounded flex items-center justify-center text-[18px] mb-2" style={{ background: p.color + "1f" }}>
                <span>{p.tag}</span>
              </div>
              <div className="text-[12.5px] font-semibold leading-tight">{p.name}</div>
              <div className="text-[10.5px] text-stone-500 leading-snug mt-0.5 line-clamp-2">{p.desc}</div>
              <div className="mt-2 flex items-center justify-between">
                <div className="font-mono text-[12.5px] font-semibold tabular-nums">{money(p.price)}</div>
                <div className="h-6 w-6 rounded bg-stone-900 text-white flex items-center justify-center">
                  <Icon name="plus" size={12}/>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile cart ───
function MobileCart({ state, onLineClick }) {
  const { cart, subtotal, tax, tip, tipPct, total, setQty, removeLine, goPay, member } = state;

  if (cart.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-stone-400 p-8 text-center">
        <div className="h-12 w-12 rounded bg-stone-100 flex items-center justify-center mb-3">
          <Icon name="shopping-bag" size={20}/>
        </div>
        <div className="text-[13px] font-medium text-stone-600">Cart is empty</div>
        <div className="text-[11.5px] mt-1 text-stone-500">Add items from the menu</div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-stone-50">
      {/* Customer */}
      <div className="px-3 py-2.5 bg-white border-b border-[var(--border)] shrink-0">
        <button className="w-full h-10 rounded-lg border border-[var(--border)] bg-white hover:bg-stone-50 px-2.5 inline-flex items-center gap-2.5 text-left">
          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${member.id === "u1" ? "bg-stone-100 text-stone-500" : "bg-stone-900 text-white"}`}>
            {member.id === "u1" ? <Icon name="user" size={13}/> : initials(member.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold leading-tight">{member.name}</div>
            {member.tier !== "guest" ? (
              <div className="text-[10.5px] text-stone-500 font-mono tabular-nums">{member.tier} · {member.points} pts</div>
            ) : (
              <div className="text-[10.5px] text-stone-500">Tap to attach customer</div>
            )}
          </div>
          <Icon name="chevron-right" size={13} className="text-stone-400"/>
        </button>
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-auto">
        <div className="px-3 pt-3 pb-1 flex items-baseline gap-2">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500">Ticket #A418</div>
          <div className="text-[10.5px] text-stone-400 font-mono tabular-nums">{cart.length} lines · {cart.reduce((s,l) => s+l.qty, 0)} items</div>
        </div>
        <div className="px-3 pb-3 space-y-2">
          {cart.map(l => {
            const gross = l.price * l.qty;
            const discAmt = l.discount?.pct ? gross * (l.discount.pct / 100)
                          : l.discount?.amount ? Math.min(l.discount.amount, gross) : 0;
            const lineTotal = Math.max(0, gross - discAmt);
            return (
              <div
                key={l.uid}
                onClick={() => onLineClick(l.uid)}
                className="bg-white border border-[var(--border)] rounded-lg p-3 cursor-pointer hover:border-stone-400 active:bg-stone-50"
              >
                <div className="flex items-start gap-2.5">
                  <div className="h-9 w-9 rounded flex items-center justify-center text-[16px] shrink-0" style={{ background: l.color + "1f" }}>{l.tag}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold leading-tight">{l.name}</div>
                    {l.modText && <div className="text-[11px] text-stone-500 mt-0.5 leading-snug">{l.modText}</div>}
                    {l.notes && (
                      <div className="text-[11px] text-amber-700 mt-1 leading-snug flex items-start gap-1">
                        <Icon name="message-square" size={10} className="mt-[2px] shrink-0"/>
                        <span className="break-words">{l.notes}</span>
                      </div>
                    )}
                    {l.discount && (
                      <div className="text-[11px] text-emerald-700 mt-1 leading-snug flex items-start gap-1 font-mono tabular-nums">
                        <Icon name="percent" size={10} className="mt-[2px] shrink-0"/>
                        <span className="break-words">
                          {l.discount.pct ? `${l.discount.pct}% off` : `${money(l.discount.amount)} off`}
                          {l.discount.reason && <span className="text-stone-500 font-sans"> · {l.discount.reason}</span>}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {discAmt > 0 && <div className="text-stone-400 text-[10.5px] line-through font-mono tabular-nums">{money(gross)}</div>}
                    <div className="font-mono text-[13.5px] font-semibold tabular-nums">{money(lineTotal)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2.5" onClick={e => e.stopPropagation()}>
                  <div className="inline-flex items-center border border-[var(--border)] rounded h-7">
                    <button onClick={() => setQty(l.uid, l.qty - 1)} className="h-7 w-7 hover:bg-stone-100 flex items-center justify-center"><Icon name="minus" size={12}/></button>
                    <span className="w-7 text-center text-[12.5px] font-mono font-semibold tabular-nums">{l.qty}</span>
                    <button onClick={() => setQty(l.uid, l.qty + 1)} className="h-7 w-7 hover:bg-stone-100 flex items-center justify-center"><Icon name="plus" size={12}/></button>
                  </div>
                  <button onClick={() => onLineClick(l.uid)} className="ml-auto h-7 px-2 rounded border border-[var(--border)] bg-white hover:bg-stone-50 text-[11.5px] font-medium inline-flex items-center gap-1 text-stone-700">
                    <Icon name="pencil" size={11}/> Edit
                  </button>
                  <button onClick={() => removeLine(l.uid)} className="h-7 w-7 rounded hover:bg-red-50 text-stone-400 hover:text-red-600 flex items-center justify-center">
                    <Icon name="trash-2" size={12}/>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals + charge */}
      <div className="bg-white border-t border-[var(--border)] shrink-0">
        <div className="px-4 py-2.5 space-y-1 text-[12px] font-mono">
          <Row label="Subtotal" value={money(subtotal)} />
          <Row label={`Tip (${tipPct}%)`} value={money(tip)} />
          <Row label="Tax" value={money(tax)} />
        </div>
        <button
          onClick={goPay}
          className="w-full h-13 bg-stone-900 hover:bg-stone-800 text-white inline-flex items-center justify-between px-4 transition-colors"
          style={{ height: 52 }}
        >
          <span className="text-[13px] font-semibold">Charge</span>
          <span className="font-mono tabular-nums text-[15px] font-semibold">{money(total)}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Mobile More tab — surface the rest of the POS surface area ───
function MobileMore({ state }) {
  const items = [
    { icon: "list", label: "Open tickets",       sub: "3 active" },
    { icon: "chef-hat", label: "Kitchen queue",  sub: "6 in progress" },
    { icon: "corner-up-left", label: "Refunds",  sub: "Today: 1 · $24.00" },
    { icon: "file-text", label: "End of day",    sub: "Close shift" },
    { icon: "users", label: "Customers",         sub: `${POS_MEMBERS.length - 1} members` },
    { icon: "settings", label: "Settings",       sub: "Printer · Drawer · Tax" },
  ];
  return (
    <div className="flex-1 overflow-auto bg-stone-50 p-3">
      <div className="bg-white border border-[var(--border)] rounded-lg overflow-hidden">
        {items.map((it, i) => (
          <button key={it.label} className={`w-full h-14 px-3 inline-flex items-center gap-3 hover:bg-stone-50 active:bg-stone-100 text-left ${i < items.length - 1 ? "border-b border-[var(--border)]" : ""}`}>
            <div className="h-8 w-8 rounded bg-stone-100 flex items-center justify-center text-stone-700"><Icon name={it.icon} size={15}/></div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold leading-tight">{it.label}</div>
              <div className="text-[11px] text-stone-500 leading-tight mt-0.5">{it.sub}</div>
            </div>
            <Icon name="chevron-right" size={14} className="text-stone-400"/>
          </button>
        ))}
      </div>
      <div className="mt-4 px-2 text-[10.5px] text-stone-400 font-mono tabular-nums leading-relaxed">
        Register 1 · Maple Coffee · v2.4.1
      </div>
    </div>
  );
}

// ─── Mobile pay overlay — sheet-style, full screen ───
function MobilePay({ state }) {
  const { cart, subtotal, tax, tip, tipPct, setTipPct, total, payMethod, setPayMethod, goBackToOrder, completeOrder } = state;
  const [cashTaken, setCashTaken] = mUS(null);

  const methods = [
    { id: "card",   label: "Card",       icon: "credit-card" },
    { id: "cash",   label: "Cash",       icon: "banknote" },
    { id: "mobile", label: "Mobile Pay", icon: "smartphone" },
    { id: "gift",   label: "Gift Card",  icon: "gift" },
  ];
  const cashOptions = [
    Math.ceil(total),
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
  ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="absolute inset-0 z-30 bg-stone-50 flex flex-col">
      <header className="px-3 py-2.5 bg-white border-b border-[var(--border)] flex items-center gap-2 shrink-0">
        <button onClick={goBackToOrder} className="h-8 w-8 rounded border border-[var(--border)] hover:bg-stone-100 flex items-center justify-center">
          <Icon name="arrow-left" size={14}/>
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500">Checkout</div>
          <div className="text-[13.5px] font-semibold leading-tight">{cart.length} lines · {cart.reduce((s,l)=>s+l.qty, 0)} items</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500">Total</div>
          <div className="text-[16px] font-mono font-semibold tabular-nums leading-tight">{money(total)}</div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        <section>
          <SectionLabelMobile>Tender</SectionLabelMobile>
          <div className="grid grid-cols-2 gap-2">
            {methods.map(m => (
              <button
                key={m.id}
                onClick={() => setPayMethod(m.id)}
                className={`p-3 rounded-lg border text-left transition-colors ${payMethod === m.id ? "bg-stone-900 border-stone-900 text-white" : "bg-white border-[var(--border)] hover:border-stone-400"}`}
              >
                <Icon name={m.icon} size={16}/>
                <div className="text-[13px] font-semibold mt-2">{m.label}</div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionLabelMobile>Tip</SectionLabelMobile>
          <div className="grid grid-cols-5 gap-1">
            {[0, 10, 15, 20, 25].map(p => (
              <button
                key={p}
                onClick={() => setTipPct(p)}
                className={`py-2.5 rounded-lg border text-center transition-colors ${tipPct === p ? "bg-stone-900 border-stone-900 text-white" : "bg-white border-[var(--border)]"}`}
              >
                <div className="text-[12.5px] font-semibold">{p === 0 ? "None" : `${p}%`}</div>
                {p > 0 && <div className={`text-[9.5px] mt-0.5 font-mono tabular-nums ${tipPct === p ? "text-white/70" : "text-stone-500"}`}>{money(subtotal * p / 100)}</div>}
              </button>
            ))}
          </div>
        </section>

        {payMethod === "cash" && (
          <section>
            <SectionLabelMobile>Cash tendered</SectionLabelMobile>
            <div className="grid grid-cols-4 gap-1.5">
              {cashOptions.map(v => (
                <button
                  key={v}
                  onClick={() => setCashTaken(v)}
                  className={`py-2.5 rounded-lg border text-center transition-colors ${cashTaken === v ? "bg-stone-900 border-stone-900 text-white" : "bg-white border-[var(--border)]"}`}
                >
                  <div className="text-[13px] font-mono font-semibold tabular-nums">{money(v)}</div>
                </button>
              ))}
            </div>
            {cashTaken != null && cashTaken >= total && (
              <div className="mt-2.5 rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2.5">
                <Icon name="banknote" size={16} className="text-emerald-700"/>
                <div className="flex-1">
                  <div className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wide">Change owed</div>
                  <div className="text-[18px] font-mono font-bold text-emerald-900 tabular-nums">{money(cashTaken - total)}</div>
                </div>
              </div>
            )}
          </section>
        )}

        <section>
          <SectionLabelMobile>Receipt</SectionLabelMobile>
          <div className="bg-white border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
            {cart.map(l => (
              <div key={l.uid} className="px-3 py-2 flex items-start gap-2 text-[12px]">
                <span>{l.tag}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{l.name}</div>
                  {l.modText && <div className="text-[10.5px] text-stone-500">{l.modText}</div>}
                  <div className="text-[10.5px] text-stone-400 font-mono tabular-nums">× {l.qty}</div>
                </div>
                <div className="font-mono font-semibold tabular-nums">{money(l.price * l.qty)}</div>
              </div>
            ))}
            <div className="px-3 py-2.5 space-y-1 text-[12px] font-mono bg-stone-50">
              <Row label="Subtotal" value={money(subtotal)} />
              <Row label={`Tip (${tipPct}%)`} value={money(tip)} />
              <Row label="Tax" value={money(tax)} />
              <div className="h-px bg-[var(--border)] my-1.5"/>
              <Row label="Total" value={money(total)} bold/>
            </div>
          </div>
        </section>
      </div>

      <div className="border-t border-[var(--border)] bg-white p-3 shrink-0">
        <button
          onClick={completeOrder}
          disabled={payMethod === "cash" && (cashTaken == null || cashTaken < total)}
          className="w-full h-12 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <Icon name="check-circle" size={15}/>
          Charge {money(total)}
        </button>
      </div>
    </div>
  );
}

// ─── Mobile receipt ───
function MobileReceipt({ state }) {
  const { cart, subtotal, tax, tip, tipPct, total, member, newOrder, payMethod } = state;
  const orderId = mUM(() => "#A" + Math.floor(Math.random() * 800 + 400), []);
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const methodLabel = { card: "Card ··4821", cash: "Cash", mobile: "Apple Pay", gift: "Gift Card" }[payMethod] || "Card";

  return (
    <div className="absolute inset-0 z-30 bg-stone-50 overflow-auto">
      <div className="p-4 flex flex-col items-center">
        <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mt-4 mb-3">
          <Icon name="check" size={26} className="text-emerald-700" strokeWidth={2.4}/>
        </div>
        <div className="text-[20px] font-semibold">Paid {money(total)}</div>
        <div className="text-[12px] text-stone-500 mt-0.5 font-mono tabular-nums">Order {orderId} · Sent to bar</div>

        <div className="bg-white border border-[var(--border)] rounded-lg w-full mt-5 p-4 font-mono text-[11px]">
          <div className="text-center border-b border-dashed border-stone-300 pb-2.5 mb-2.5">
            <div className="font-sans text-[13px] font-semibold">Maple Coffee</div>
            <div className="text-[10px] text-stone-500">2344 Piedmont Ave, Oakland</div>
            <div className="text-[10px] text-stone-500 mt-0.5">{now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {timeStr}</div>
            <div className="text-[10px] text-stone-500 mt-0.5">Order {orderId} · {member.name}</div>
          </div>
          <div className="space-y-1">
            {cart.map(l => (
              <div key={l.uid}>
                <div className="flex justify-between gap-2">
                  <span className="truncate">{l.qty}× {l.name}</span>
                  <span className="tabular-nums shrink-0">{money(l.price * l.qty)}</span>
                </div>
                {l.modText && <div className="text-stone-400 pl-3 text-[9.5px]">{l.modText}</div>}
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-stone-300 my-2.5"/>
          <div className="space-y-0.5">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
            <div className="flex justify-between"><span>Tip {tipPct}%</span><span className="tabular-nums">{money(tip)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span className="tabular-nums">{money(tax)}</span></div>
            <div className="flex justify-between font-semibold text-[12px] mt-1 pt-1 border-t border-stone-300"><span>Total</span><span className="tabular-nums">{money(total)}</span></div>
            <div className="flex justify-between text-stone-500"><span>Paid</span><span>{methodLabel}</span></div>
          </div>
          {member.tier !== "guest" && (
            <div className="border-t border-dashed border-stone-300 my-2.5 pt-2.5 text-center">
              <div className="text-[10px] text-stone-500">+{Math.floor(total)} pts · {member.name.split(" ")[0]}</div>
              <div className="font-sans text-[12px] font-semibold mt-0.5 tabular-nums">{(member.points + Math.floor(total)).toLocaleString()} total</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 w-full mt-4">
          <SecondaryAction icon="mail" label="Email"/>
          <SecondaryAction icon="message-square" label="Text"/>
          <SecondaryAction icon="printer" label="Print"/>
        </div>
        <button
          onClick={newOrder}
          className="mt-2 w-full h-12 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[13.5px] font-semibold inline-flex items-center justify-center gap-2"
        >
          <Icon name="plus" size={14}/> New order
        </button>
      </div>
    </div>
  );
}

function SectionLabelMobile({ children }) {
  return <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 mb-1.5">{children}</div>;
}
function SecondaryAction({ icon, label }) {
  return (
    <button className="h-10 rounded-lg border border-[var(--border)] bg-white hover:bg-stone-50 text-[12px] font-medium inline-flex items-center justify-center gap-1.5">
      <Icon name={icon} size={13}/> {label}
    </button>
  );
}

// Wrapper that picks pay/receipt overlay for mobile
function MobileFrame({ state }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <VariantMobile state={state}/>
      {state.stage === "pay"     && <MobilePay state={state}/>}
      {state.stage === "receipt" && <MobileReceipt state={state}/>}
      {state.modalItem && (
        <ModifierModal item={state.modalItem} onClose={() => state.setModalItem(null)} onAdd={(item, opts) => state.addToCart(item, opts)}/>
      )}
      {state.editLineUid && (() => {
        const line = state.cart.find(l => l.uid === state.editLineUid);
        if (!line) return null;
        return (
          <LineEditor
            line={line}
            onClose={() => state.setEditLineUid(null)}
            onSave={(patch) => state.updateLine(state.editLineUid, patch)}
            onRemove={() => state.removeLine(state.editLineUid)}
          />
        );
      })()}
    </div>
  );
}

Object.assign(window, { VariantMobile, MobilePay, MobileReceipt, MobileFrame });
