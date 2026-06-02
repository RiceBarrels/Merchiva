// ─── Three POS register variants ───
const { useState: vUS, useMemo: vUM } = React;

// Shared: build filtered product list by active cat + search
function useFilteredProducts(state) {
  return vUM(() => {
    const q = state.search.trim().toLowerCase();
    return POS_PRODUCTS.filter(p => {
      if (q) return p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
      return p.cat === state.activeCat;
    });
  }, [state.search, state.activeCat]);
}

// ═══════════════════════════════════════════════════════════════
// Variant A — "Classic POS" — dense grid, compact tiles, side cart
// ═══════════════════════════════════════════════════════════════
function VariantClassic({ state }) {
  const filtered = useFilteredProducts(state);
  const current = POS_CATEGORIES.find(c => c.id === state.activeCat);

  return (
    <div className="h-full w-full bg-stone-100 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="h-14 bg-white border-b border-[var(--border)] flex items-center px-4 gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-stone-900 text-white flex items-center justify-center font-bold text-[10px]">bz</div>
          <div>
            <div className="text-[12px] font-semibold leading-tight">Register 1</div>
            <div className="text-[10.5px] text-stone-500 leading-tight">Maple · Oakland</div>
          </div>
        </div>
        <div className="h-8 w-px bg-[var(--border)] mx-2" />
        <div className="relative flex-1 max-w-[340px]">
          <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={state.search} onChange={e => state.setSearch(e.target.value)} placeholder="Search or scan…" className="w-full !pl-8 !py-1.5 !text-[13px]" />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <ClassicBtn icon="user-plus" label={state.member.name} onClick={() => state.setCat(state.activeCat) /* dummy */} />
          <ClassicBtn icon="scan-line" label="Scan" />
          <ClassicBtn icon="percent" label="Discount" />
          <ClassicBtn icon="refresh-cw" label="Clear" onClick={state.clearCart} />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[140px_1fr_340px] min-h-0 overflow-hidden">
        {/* Categories rail */}
        <nav className="bg-stone-900 flex flex-col py-2 overflow-auto">
          {POS_CATEGORIES.map(c => {
            const active = c.id === state.activeCat;
            const count = POS_PRODUCTS.filter(p => p.cat === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => { state.setCat(c.id); state.setSearch(""); }}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors border-l-[3px] ${active ? "bg-stone-800 border-white text-white" : "border-transparent text-stone-400 hover:text-white hover:bg-stone-800"}`}
              >
                <Icon name={c.icon} size={15} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium">{c.name}</div>
                  <div className="text-[10px] opacity-70 tabular-nums">{count}</div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Product grid */}
        <div className="bg-stone-100 overflow-auto p-3">
          <div className="flex items-baseline gap-2 px-1 mb-2">
            <div className="text-[13px] font-semibold">{current?.name}</div>
            <div className="text-[11px] text-stone-500">{filtered.length} items</div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => state.setModalItem(p)}
                className="bg-white border border-stone-300 rounded p-2.5 text-left hover:border-stone-900 hover:shadow-sm transition-all flex flex-col aspect-[4/3] min-h-[92px]"
              >
                <div className="flex items-start gap-1.5">
                  <span className="h-7 w-7 rounded flex items-center justify-center text-[14px] shrink-0" style={{ background: p.color + "22" }}>{p.tag}</span>
                  {p.popular && <span className="ml-auto text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded">POP</span>}
                </div>
                <div className="text-[12.5px] font-semibold leading-tight mt-auto">{p.name}</div>
                <div className="text-[10.5px] text-stone-500 truncate">{p.desc}</div>
                <div className="text-[12px] font-mono font-semibold tabular-nums text-stone-900 mt-0.5">{money(p.price)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Cart */}
        <ClassicCart state={state} />
      </div>
    </div>
  );
}

function ClassicBtn({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="h-8 px-2.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-[11.5px] font-medium inline-flex items-center gap-1.5">
      <Icon name={icon} size={13} /> {label}
    </button>
  );
}

function ClassicCart({ state }) {
  const { cart, subtotal, tax, total, setQty, removeLine, goPay, member } = state;
  return (
    <aside className="bg-white border-l border-stone-300 flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-stone-300 flex items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Ticket</div>
        <div className="font-mono text-[11px] text-stone-400">#A418</div>
        <div className="ml-auto text-[11px] text-stone-500">{cart.length} items</div>
      </div>
      <button className="px-4 py-2 border-b border-stone-300 hover:bg-stone-50 flex items-center gap-2 text-left">
        <Icon name="user" size={14} className="text-stone-500" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium">{member.name}</div>
          {member.tier !== "guest" && <div className="text-[10.5px] text-stone-500">{member.tier} · {member.points} pts</div>}
        </div>
        <Icon name="chevron-right" size={13} className="text-stone-400" />
      </button>
      <div className="flex-1 overflow-auto">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 p-6 text-center">
            <Icon name="shopping-bag" size={24} className="mb-2" />
            <div className="text-[12px]">No items yet</div>
            <div className="text-[11px] mt-0.5">Tap a product to add</div>
          </div>
        ) : cart.map(l => (
          <div key={l.uid} className="px-3 py-2 border-b border-stone-200 hover:bg-stone-50">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold leading-tight">{l.name}</div>
                {l.modText && <div className="text-[10.5px] text-stone-500 mt-0.5 truncate">{l.modText}</div>}
              </div>
              <div className="text-[12.5px] font-mono font-semibold tabular-nums">{money(l.price * l.qty)}</div>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <button onClick={() => setQty(l.uid, l.qty - 1)} className="h-6 w-6 rounded border border-stone-300 hover:bg-stone-100 flex items-center justify-center"><Icon name="minus" size={11}/></button>
              <span className="text-[12px] font-semibold tabular-nums w-6 text-center">{l.qty}</span>
              <button onClick={() => setQty(l.uid, l.qty + 1)} className="h-6 w-6 rounded border border-stone-300 hover:bg-stone-100 flex items-center justify-center"><Icon name="plus" size={11}/></button>
              <button onClick={() => removeLine(l.uid)} className="ml-auto h-6 w-6 rounded hover:bg-red-50 text-stone-400 hover:text-red-600 flex items-center justify-center"><Icon name="trash-2" size={11}/></button>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-stone-300 space-y-1 text-[12px]">
        <Row label="Subtotal" value={money(subtotal)} />
        <Row label="Tax" value={money(tax)} />
      </div>
      <button
        onClick={goPay}
        disabled={!cart.length}
        className="h-14 bg-stone-900 text-white disabled:bg-stone-300 hover:bg-stone-800 text-[15px] font-semibold inline-flex items-center justify-between px-5 transition-colors"
      >
        <span>Charge</span>
        <span className="tabular-nums">{money(total)}</span>
      </button>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════
// Variant B — "Soft" (balanced default) — card-based, breathable
// ═══════════════════════════════════════════════════════════════
function VariantSoft({ state, cartPos = "right", density = "comfy" }) {
  const filtered = useFilteredProducts(state);
  const current = POS_CATEGORIES.find(c => c.id === state.activeCat);

  const cart = <SoftCart state={state} />;
  const main = (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Top bar — matches bizops PageHeader h-14 */}
      <div className="h-14 bg-white border-b border-[var(--border)] px-5 flex items-center gap-3 shrink-0">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-tight">New order</div>
          <div className="text-[11.5px] text-stone-500 leading-tight">Register · Amelia</div>
        </div>
        <div className="relative flex-1 max-w-[360px] ml-6">
          <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={state.search}
            onChange={e => state.setSearch(e.target.value)}
            placeholder="Search menu or scan…"
            className="w-full !pl-8 !py-1.5 !text-[13px]"
          />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <IconBtn icon="scan-line" title="Scan" />
          <IconBtn icon="percent" title="Discount" />
          <IconBtn icon="more-horizontal" />
        </div>
      </div>

      {/* Category tabs — flat, stone-900 active, no rounded-full */}
      <div className="bg-white border-b border-[var(--border)] px-5 flex items-center gap-0 overflow-x-auto shrink-0">
        {POS_CATEGORIES.map(c => {
          const active = c.id === state.activeCat && !state.search;
          return (
            <button
              key={c.id}
              onClick={() => { state.setCat(c.id); state.setSearch(""); }}
              className={`h-10 px-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium shrink-0 transition-colors border-b-2 ${active ? "text-stone-900 border-stone-900" : "text-stone-500 border-transparent hover:text-stone-800"}`}
            >
              <Icon name={c.icon} size={13} />
              {c.name}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto bg-stone-50 p-5">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="text-[13px] font-semibold">{state.search ? `Matches for "${state.search}"` : current?.name}</h2>
          <span className="text-[11.5px] text-stone-500">{filtered.length} items</span>
        </div>
        <div className={`grid gap-2 ${density === "dense" ? "grid-cols-6" : "grid-cols-4"}`}>
          {filtered.map(p => (
            <SoftCard key={p.id} p={p} onClick={() => state.setModalItem(p)} />
          ))}
        </div>
      </div>
    </div>
  );

  if (cartPos === "right")
    return <div className="h-full w-full flex bg-stone-50">{main}{cart}</div>;
  if (cartPos === "left")
    return <div className="h-full w-full flex bg-stone-50">{cart}{main}</div>;
  // bottom
  return (
    <div className="h-full w-full flex flex-col bg-stone-50">
      {main}
      <div className="h-[240px] border-t border-[var(--border)] bg-white shrink-0 overflow-hidden">
        <SoftCart state={state} horizontal />
      </div>
    </div>
  );
}

function SoftCard({ p, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group bg-white border border-[var(--border)] rounded p-2.5 text-left hover:border-stone-400 hover:shadow-sm transition-all flex flex-col relative"
    >
      {p.popular && <span className="absolute top-2 right-2 text-[9px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-1 py-px rounded uppercase tracking-wider">Pop</span>}
      <div className="h-9 w-9 rounded flex items-center justify-center text-[18px] mb-2" style={{ background: p.color + "1f" }}>
        <span>{p.tag}</span>
      </div>
      <div className="text-[13px] font-semibold leading-tight">{p.name}</div>
      <div className="text-[11px] text-stone-500 mt-0.5 leading-snug line-clamp-2">{p.desc}</div>
      <div className="mt-2 flex items-center justify-between">
        <div className="font-mono text-[12.5px] font-semibold tabular-nums text-stone-900">{money(p.price)}</div>
        <div className="h-6 w-6 rounded border border-[var(--border)] bg-white group-hover:bg-stone-900 group-hover:text-white group-hover:border-stone-900 flex items-center justify-center transition-colors">
          <Icon name="plus" size={11} />
        </div>
      </div>
    </button>
  );
}

function SoftCart({ state, horizontal }) {
  const { cart, subtotal, tax, tip, tipPct, total, setQty, removeLine, goPay, member, setModalItem } = state;
  return (
    <aside className={`${horizontal ? "h-full flex flex-row" : "w-[340px] flex flex-col h-full shrink-0 border-l border-[var(--border)]"} bg-white overflow-hidden`}>
      <div className={`${horizontal ? "w-[240px] border-r border-[var(--border)]" : ""} px-3 py-2.5 ${horizontal ? "" : "border-b border-[var(--border)]"} shrink-0 flex items-center gap-2`}>
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-stone-500">Ticket</div>
        <div className="font-mono text-[10.5px] text-stone-400">#A418</div>
        <div className="ml-auto text-[10.5px] text-stone-500">{cart.length} items</div>
      </div>
      <button onClick={() => {}} className={`${horizontal ? "w-[240px] border-r border-[var(--border)]" : ""} flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] hover:bg-stone-50 text-left shrink-0`}>
        <Avatar name={member.name} size={24} color={member.id === "u1" ? "bg-stone-200 text-stone-500" : "bg-stone-900 text-white"} />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium leading-tight">{member.name}</div>
          <div className="text-[10.5px] text-stone-500 leading-tight">
            {member.tier === "guest" ? "Attach customer" : `${member.tier} · ${member.points.toLocaleString()} pts`}
          </div>
        </div>
        <Icon name="chevron-right" size={13} className="text-stone-400" />
      </button>

      <div className={`${horizontal ? "flex-1 border-r border-[var(--border)]" : "flex-1"} overflow-auto`}>
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 p-6 text-center">
            <div className="h-10 w-10 rounded bg-stone-100 flex items-center justify-center mb-2">
              <Icon name="shopping-bag" size={16} />
            </div>
            <div className="text-[12px] font-medium text-stone-500">Cart is empty</div>
            <div className="text-[11px] mt-0.5">Tap an item to start</div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {cart.map(l => {
              const gross = l.price * l.qty;
              const discAmt = l.discount?.pct ? gross * (l.discount.pct / 100)
                            : l.discount?.amount ? Math.min(l.discount.amount, gross) : 0;
              const lineTotal = Math.max(0, gross - discAmt);
              return (
                <div
                  key={l.uid}
                  onClick={() => state.setEditLineUid(l.uid)}
                  className="px-3 py-2 hover:bg-stone-50 group cursor-pointer"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold leading-tight">{l.name}</div>
                      {l.modText && <div className="text-[10.5px] text-stone-500 mt-0.5 leading-snug">{l.modText}</div>}
                      {l.notes && (
                        <div className="text-[10.5px] text-amber-700 mt-1 leading-snug flex items-start gap-1">
                          <Icon name="message-square" size={10} className="mt-[1px] shrink-0"/>
                          <span className="break-words">{l.notes}</span>
                        </div>
                      )}
                      {l.discount && (
                        <div className="text-[10.5px] text-emerald-700 mt-1 leading-snug flex items-start gap-1 font-mono tabular-nums">
                          <Icon name="percent" size={10} className="mt-[1px] shrink-0"/>
                          <span className="break-words">
                            {l.discount.pct ? `${l.discount.pct}% off` : `${money(l.discount.amount)} off`}
                            {l.discount.reason && <span className="text-stone-500 font-sans"> · {l.discount.reason}</span>}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {discAmt > 0 && <div className="text-stone-400 text-[10.5px] line-through font-mono tabular-nums">{money(gross)}</div>}
                      <div className="font-mono text-[12.5px] font-semibold tabular-nums">{money(lineTotal)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setQty(l.uid, l.qty - 1)} className="h-6 w-6 rounded border border-[var(--border)] hover:bg-stone-100 flex items-center justify-center"><Icon name="minus" size={11}/></button>
                    <span className="text-[11.5px] font-semibold tabular-nums w-6 text-center">{l.qty}</span>
                    <button onClick={() => setQty(l.uid, l.qty + 1)} className="h-6 w-6 rounded border border-[var(--border)] hover:bg-stone-100 flex items-center justify-center"><Icon name="plus" size={11}/></button>
                    <button onClick={() => state.setEditLineUid(l.uid)} className="ml-auto h-6 px-1.5 rounded border border-[var(--border)] bg-white hover:bg-stone-100 text-[10px] font-medium inline-flex items-center gap-1 text-stone-600"><Icon name="pencil" size={10}/>Edit</button>
                    <button onClick={() => removeLine(l.uid)} className="h-6 w-6 rounded hover:bg-red-50 text-stone-400 hover:text-red-600 flex items-center justify-center"><Icon name="trash-2" size={11}/></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={`${horizontal ? "w-[260px]" : ""} shrink-0 flex flex-col border-t border-[var(--border)]`}>
        <div className="px-4 py-2.5 space-y-1 text-[12px] font-mono">
          <Row label="Subtotal" value={money(subtotal)} />
          <Row label={`Tip (${tipPct}%)`} value={money(tip)} />
          <Row label="Tax" value={money(tax)} />
        </div>
        <button
          onClick={goPay}
          disabled={!cart.length}
          className="h-12 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:text-stone-100 text-white text-[13px] font-semibold inline-flex items-center justify-between px-4 transition-colors"
        >
          <span>Charge</span>
          <span className="font-mono tabular-nums text-[15px]">{money(total)}</span>
        </button>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════
// Variant C — "Editorial" — bold, menu-forward, big typography
// ═══════════════════════════════════════════════════════════════
function VariantEditorial({ state }) {
  const filtered = useFilteredProducts(state);
  const current = POS_CATEGORIES.find(c => c.id === state.activeCat);

  return (
    <div className="h-full w-full bg-[#f5f1ea] flex overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Left category nav — vertical labels */}
      <nav className="w-[200px] bg-[#1c1917] text-stone-200 flex flex-col py-8 shrink-0">
        <div className="px-6 mb-8">
          <div className="text-[10.5px] uppercase tracking-[0.2em] opacity-60">Maple</div>
          <div className="font-serif text-[20px] leading-tight mt-0.5" style={{ fontFamily: "'Fraunces', 'DM Serif Display', serif" }}>Coffee Bar</div>
        </div>
        {POS_CATEGORIES.map(c => {
          const active = c.id === state.activeCat && !state.search;
          return (
            <button
              key={c.id}
              onClick={() => { state.setCat(c.id); state.setSearch(""); }}
              className={`px-6 py-3.5 text-left transition-all ${active ? "bg-[#2a2623] text-white" : "text-stone-400 hover:text-white hover:bg-[#252220]"}`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`h-[2px] transition-all ${active ? "w-6 bg-[#d4a867]" : "w-2 bg-stone-600"}`} />
                <span className="text-[13px] font-medium">{c.name}</span>
              </div>
            </button>
          );
        })}
        <div className="mt-auto px-6 pt-6 border-t border-stone-800">
          <div className="text-[10.5px] uppercase tracking-wider text-stone-500">Cashier</div>
          <div className="text-[12.5px] font-medium mt-0.5">Amelia Chen</div>
          <div className="text-[10.5px] text-stone-500 mt-0.5">07:00 – 15:00</div>
        </div>
      </nav>

      {/* Menu column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header with serif title */}
        <div className="px-10 pt-8 pb-5 shrink-0">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Now serving</div>
              <h1 className="mt-1 text-[40px] leading-[1.05] tracking-tight" style={{ fontFamily: "'Fraunces', 'DM Serif Display', serif", fontWeight: 500 }}>
                {current?.name}
              </h1>
            </div>
            <div className="relative w-[300px]">
              <Icon name="search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                value={state.search}
                onChange={e => state.setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full !pl-10 !py-2.5 !text-[13px] !rounded-full bg-white/70 !border-stone-300"
              />
            </div>
          </div>
        </div>

        {/* Product list — menu style */}
        <div className="flex-1 overflow-auto px-10 pb-10">
          <div className="grid grid-cols-2 gap-x-12 gap-y-1">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => state.setModalItem(p)}
                className="group flex items-start gap-4 py-4 border-b border-stone-300 text-left hover:pl-2 transition-[padding]"
              >
                <div className="h-12 w-12 rounded-full flex items-center justify-center text-[22px] shrink-0" style={{ background: p.color + "33" }}>{p.tag}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3">
                    <div className="text-[17px] font-semibold" style={{ fontFamily: "'Fraunces', 'DM Serif Display', serif", fontWeight: 500 }}>{p.name}</div>
                    <div className="flex-1 border-b border-dotted border-stone-400 translate-y-[-4px]" />
                    <div className="text-[15px] font-semibold tabular-nums">{money(p.price)}</div>
                  </div>
                  <div className="text-[12.5px] text-stone-600 mt-0.5 italic">{p.desc}</div>
                  {p.popular && <div className="text-[10px] text-[#b8863d] tracking-[0.14em] uppercase font-semibold mt-1">— Most loved</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Editorial cart */}
      <EditorialCart state={state} />
    </div>
  );
}

function EditorialCart({ state }) {
  const { cart, subtotal, tax, tip, tipPct, total, setQty, removeLine, goPay, member } = state;
  return (
    <aside className="w-[380px] bg-white shrink-0 flex flex-col border-l border-stone-300 overflow-hidden">
      <div className="px-6 pt-8 pb-4 shrink-0">
        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Order 0418</div>
        <div className="text-[26px] mt-1 leading-tight" style={{ fontFamily: "'Fraunces', 'DM Serif Display', serif", fontWeight: 500 }}>
          {cart.length === 0 ? "An empty cup" : `${cart.length} item${cart.length > 1 ? "s" : ""}`}
        </div>
      </div>

      <button className="mx-6 mb-4 flex items-center gap-3 p-3 rounded-lg border border-stone-200 hover:bg-stone-50 text-left shrink-0">
        <div className={`h-9 w-9 rounded-full flex items-center justify-center font-semibold text-[13px] ${member.id === "u1" ? "bg-stone-100 text-stone-500" : "bg-[#1c1917] text-white"}`}>
          {member.id === "u1" ? <Icon name="user" size={14} /> : initials(member.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">{member.name}</div>
          {member.tier !== "guest" && <div className="text-[11px] text-[#b8863d]">{member.tier.toUpperCase()} · {member.points} pts</div>}
        </div>
      </button>

      <div className="flex-1 overflow-auto px-6">
        {cart.length === 0 ? (
          <div className="py-16 text-center text-stone-400 text-[13px] italic" style={{ fontFamily: "'Fraunces', serif" }}>
            Pour something in…
          </div>
        ) : (
          <div className="divide-y divide-stone-200">
            {cart.map(l => (
              <div key={l.uid} className="py-3.5 group">
                <div className="flex items-baseline gap-2">
                  <div className="text-[15px] font-semibold leading-tight flex-1" style={{ fontFamily: "'Fraunces', serif", fontWeight: 500 }}>
                    {l.name}
                  </div>
                  <div className="text-[14px] font-semibold tabular-nums">{money(l.price * l.qty)}</div>
                </div>
                {l.modText && <div className="text-[11.5px] text-stone-500 italic mt-0.5">{l.modText}</div>}
                <div className="flex items-center gap-1 mt-2">
                  <button onClick={() => setQty(l.uid, l.qty - 1)} className="h-7 w-7 rounded-full border border-stone-300 hover:bg-stone-100 flex items-center justify-center"><Icon name="minus" size={11}/></button>
                  <span className="text-[12.5px] font-semibold tabular-nums w-6 text-center">{l.qty}</span>
                  <button onClick={() => setQty(l.uid, l.qty + 1)} className="h-7 w-7 rounded-full border border-stone-300 hover:bg-stone-100 flex items-center justify-center"><Icon name="plus" size={11}/></button>
                  <button onClick={() => removeLine(l.uid)} className="ml-auto text-[11px] text-stone-400 hover:text-red-600">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 py-5 border-t border-stone-200 shrink-0">
        <div className="space-y-1.5 text-[13px] mb-4">
          <Row label="Subtotal" value={money(subtotal)} />
          <Row label={`Gratuity ${tipPct}%`} value={money(tip)} />
          <Row label="Tax" value={money(tax)} />
        </div>
        <button
          onClick={goPay}
          disabled={!cart.length}
          className="w-full h-14 rounded-full bg-[#1c1917] hover:bg-[#2a2623] disabled:bg-stone-200 disabled:text-stone-400 text-white text-[14px] font-semibold inline-flex items-center justify-between px-6 transition-colors"
        >
          <span className="tracking-wide uppercase text-[12px]">Ring up</span>
          <span className="tabular-nums text-[17px]">{money(total)}</span>
        </button>
      </div>
    </aside>
  );
}

Object.assign(window, { VariantClassic, VariantSoft, VariantEditorial });
