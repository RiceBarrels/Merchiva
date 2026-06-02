// ─── POS shared state + modal components ───
const { useState: posUS, useMemo: posUM, useEffect: posUE, useRef: posUR } = React;

// Global POS state hook — shared across variants so cart/member/flow persist
function usePOSState() {
  const [cart, setCart]       = posUS([]);
  const [member, setMember]   = posUS(POS_MEMBERS[0]);  // Walk-in by default
  const [activeCat, setCat]   = posUS("espresso");
  const [search, setSearch]   = posUS("");
  const [stage, setStage]     = posUS("order");        // order | pay | receipt
  const [tipPct, setTipPct]   = posUS(15);
  const [payMethod, setPayMethod] = posUS("card");
  const [modalItem, setModalItem] = posUS(null);       // item being configured
  const [editLineUid, setEditLineUid] = posUS(null);   // existing cart line being edited
  const [page, setPage]       = posUS("register");     // register | kitchen | refunds | eod

  // Effective per-line total honors line.discount ({pct} or {amount} per unit)
  const lineTotal = (l) => {
    const gross = l.price * l.qty;
    if (!l.discount) return gross;
    if (l.discount.pct) return Math.max(0, gross * (1 - l.discount.pct / 100));
    if (l.discount.amount) return Math.max(0, gross - l.discount.amount);
    return gross;
  };
  const subtotal = cart.reduce((s, it) => s + lineTotal(it), 0);
  const tax      = subtotal * 0.0875;
  const tip      = subtotal * (tipPct / 100);
  const total    = subtotal + tax + tip;

  const addToCart = (product, opts = {}) => {
    const modText = buildModText(opts);
    const modDelta = buildModDelta(opts);
    const line = {
      uid: `l-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      productId: product.id,
      name: product.name,
      tag: product.tag,
      color: product.color,
      basePrice: product.price,
      price: product.price + modDelta,
      qty: 1,
      mods: opts,
      modText,
      notes: opts.notes || null,
      discount: null,
    };
    setCart(prev => [...prev, line]);
  };

  const setQty = (uid, q) => setCart(prev =>
    q <= 0 ? prev.filter(l => l.uid !== uid) : prev.map(l => l.uid === uid ? { ...l, qty: q } : l)
  );
  const removeLine = (uid) => setCart(prev => prev.filter(l => l.uid !== uid));
  const clearCart = () => setCart([]);
  const updateLine = (uid, patch) => setCart(prev => prev.map(l => {
    if (l.uid !== uid) return l;
    const merged = { ...l, ...patch };
    if (patch.mods) merged.modText = buildModText(patch.mods);
    if (patch.mods) {
      const product = POS_PRODUCTS.find(p => p.id === l.productId);
      const base = product ? product.price : l.basePrice;
      merged.basePrice = base;
      merged.price = base + buildModDelta(patch.mods);
    }
    return merged;
  }));

  const goPay = () => { if (cart.length) setStage("pay"); };
  const goBackToOrder = () => setStage("order");
  const completeOrder = () => setStage("receipt");
  const newOrder = () => { setCart([]); setMember(POS_MEMBERS[0]); setStage("order"); };

  return {
    cart, setCart, addToCart, setQty, removeLine, updateLine, clearCart,
    member, setMember, activeCat, setCat, search, setSearch,
    stage, setStage, goPay, goBackToOrder, completeOrder, newOrder,
    tipPct, setTipPct, payMethod, setPayMethod,
    subtotal, tax, tip, total,
    modalItem, setModalItem,
    editLineUid, setEditLineUid,
    page, setPage,
  };
}

function buildModText(opts) {
  const parts = [];
  if (opts.size && opts.size.name)  parts.push(opts.size.name);
  if (opts.temp && opts.temp.name)  parts.push(opts.temp.name);
  if (opts.milk && opts.milk.name)  parts.push(opts.milk.name);
  if (opts.shots && opts.shots.name) parts.push(opts.shots.name);
  if (opts.notes) parts.push(`"${opts.notes}"`);
  return parts.join(" · ");
}
function buildModDelta(opts) {
  let d = 0;
  ["size","milk","shots","temp"].forEach(k => { if (opts[k]?.delta) d += opts[k].delta; });
  return d;
}
function money(n) { return `$${n.toFixed(2)}`; }

// ─── Product modifier modal ───
function ModifierModal({ item, onClose, onAdd }) {
  const isDrink = ["espresso","brewed","tea","cold"].includes(item?.cat ?? "");
  const [size, setSize]   = posUS(POS_MODIFIERS.size.find(s => s.default));
  const [milk, setMilk]   = posUS(POS_MODIFIERS.milk[0]);
  const [shots, setShots] = posUS(POS_MODIFIERS.shots.find(s => s.default));
  const [temp, setTemp]   = posUS(POS_MODIFIERS.temp.find(t => t.default));
  const [notes, setNotes] = posUS("");

  if (!item) return null;
  const modDelta =
    (size?.delta ?? 0) + (milk?.delta ?? 0) + (shots?.delta ?? 0) + (temp?.delta ?? 0);
  const total = item.price + modDelta;

  return (
    <div className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-4 p-6 border-b border-[var(--border)]">
          <div className="h-16 w-16 rounded-xl flex items-center justify-center text-3xl shrink-0" style={{ background: item.color + "22" }}>
            <span>{item.tag}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[19px] font-semibold">{item.name}</div>
            <div className="text-[13px] text-stone-500 mt-0.5">{item.desc}</div>
            <div className="text-[13px] text-stone-800 mt-1 font-semibold tabular-nums">{money(item.price)}</div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-800 flex items-center justify-center">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {isDrink && (
            <>
              <ModRow label="Size">
                {POS_MODIFIERS.size.map(s => (
                  <ModChip key={s.id} active={size?.id === s.id} onClick={() => setSize(s)}>
                    <div className="font-semibold">{s.name}</div>
                    {s.delta !== 0 && <div className="text-[10.5px] text-stone-500 tabular-nums">{s.delta > 0 ? "+" : ""}{money(s.delta)}</div>}
                  </ModChip>
                ))}
              </ModRow>
              <ModRow label="Temperature">
                {POS_MODIFIERS.temp.map(t => (
                  <ModChip key={t.id} active={temp?.id === t.id} onClick={() => setTemp(t)}>{t.name}</ModChip>
                ))}
              </ModRow>
              <ModRow label="Milk">
                {POS_MODIFIERS.milk.map(m => (
                  <ModChip key={m.id} active={milk?.id === m.id} onClick={() => setMilk(m)}>
                    <div className="font-semibold">{m.name}</div>
                    {m.delta > 0 && <div className="text-[10.5px] text-stone-500 tabular-nums">+{money(m.delta)}</div>}
                  </ModChip>
                ))}
              </ModRow>
              <ModRow label="Shots">
                {POS_MODIFIERS.shots.map(s => (
                  <ModChip key={s.id} active={shots?.id === s.id} onClick={() => setShots(s)}>
                    <div className="font-semibold">{s.name}</div>
                    {s.delta > 0 && <div className="text-[10.5px] text-stone-500 tabular-nums">+{money(s.delta)}</div>}
                  </ModChip>
                ))}
              </ModRow>
            </>
          )}
          <ModRow label="Notes (for barista)">
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Extra hot, name on cup, for here…"
              className="w-full !text-[13px] !py-2 !px-3"
            />
          </ModRow>
        </div>

        <div className="p-4 border-t border-[var(--border)] bg-stone-50 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[11px] text-stone-500">Total</div>
            <div className="text-[20px] font-semibold tabular-nums">{money(total)}</div>
          </div>
          <button onClick={onClose} className="h-11 px-4 rounded-lg border border-[var(--border)] bg-white hover:bg-stone-100 text-[13px] font-medium">Cancel</button>
          <button
            onClick={() => { onAdd(item, { size, milk: isDrink ? milk : null, shots: isDrink ? shots : null, temp: isDrink ? temp : null, notes: notes || null }); onClose(); }}
            className="h-11 px-5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[13px] font-semibold inline-flex items-center gap-2"
          >
            <Icon name="plus" size={15} /> Add to order
          </button>
        </div>
      </div>
    </div>
  );
}

function ModRow({ label, children }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-stone-500 mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
function ModChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg border text-[12.5px] leading-tight transition-colors min-w-[66px] ${active ? "bg-stone-900 text-white border-stone-900" : "bg-white border-[var(--border)] hover:border-stone-400 text-stone-700"}`}
    >
      {children}
    </button>
  );
}

// ─── Member picker ───
function MemberPicker({ current, onPick, onClose }) {
  const [q, setQ] = posUS("");
  const filtered = POS_MEMBERS.filter(m => {
    if (m.id === "u1") return true;
    if (!q) return true;
    return m.name.toLowerCase().includes(q.toLowerCase()) || (m.phone || "").includes(q);
  });
  return (
    <div className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-full overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-[var(--border)] flex items-center gap-3">
          <Icon name="user" size={18} className="text-stone-500" />
          <div className="text-[16px] font-semibold flex-1">Attach customer</div>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-stone-100 text-stone-400 flex items-center justify-center"><Icon name="x" size={16} /></button>
        </div>
        <div className="p-4 border-b border-[var(--border)]">
          <div className="relative">
            <Icon name="search" size={16} className="text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or phone…" className="w-full !py-2.5 !pl-9 !text-[14px]" />
          </div>
        </div>
        <div className="max-h-[340px] overflow-auto">
          {filtered.map(m => (
            <button
              key={m.id}
              onClick={() => { onPick(m); onClose(); }}
              className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-stone-50 ${current?.id === m.id ? "bg-stone-50" : ""} border-b last:border-b-0 border-[var(--border)]`}
            >
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold text-[13px] ${m.id === "u1" ? "bg-stone-100 text-stone-500" : "bg-stone-900 text-white"}`}>
                {m.id === "u1" ? <Icon name="user" size={16} /> : initials(m.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium">{m.name}</div>
                <div className="text-[11.5px] text-stone-500 flex items-center gap-2">
                  {m.phone && <span className="font-mono">{m.phone}</span>}
                  {m.tier !== "guest" && (
                    <>
                      <span className="text-stone-300">·</span>
                      <span className={m.tier === "gold" ? "text-amber-700" : "text-stone-500"}>
                        {m.tier === "gold" ? "★" : "◆"} {m.points.toLocaleString()} pts
                      </span>
                    </>
                  )}
                  {m.fav && <><span className="text-stone-300">·</span><span className="italic truncate">{m.fav}</span></>}
                </div>
              </div>
              {current?.id === m.id && <Icon name="check" size={16} className="text-stone-900" />}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-[var(--border)] bg-stone-50 flex gap-2">
          <button className="flex-1 h-10 rounded-lg border border-[var(--border)] bg-white hover:bg-stone-50 text-[13px] font-medium inline-flex items-center justify-center gap-1.5">
            <Icon name="user-plus" size={15} /> New customer
          </button>
          <button className="flex-1 h-10 rounded-lg border border-[var(--border)] bg-white hover:bg-stone-50 text-[13px] font-medium inline-flex items-center justify-center gap-1.5">
            <Icon name="scan-line" size={15} /> Scan QR
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Line editor (edit existing cart line: mods + discount + notes) ───
function LineEditor({ line, onClose, onSave, onRemove }) {
  if (!line) return null;
  const product = POS_PRODUCTS.find(p => p.id === line.productId) || {};
  const isDrink = ["espresso","brewed","tea","cold"].includes(product.cat ?? "");

  const [size,  setSize]  = posUS(line.mods?.size  ?? POS_MODIFIERS.size.find(s => s.default));
  const [milk,  setMilk]  = posUS(line.mods?.milk  ?? POS_MODIFIERS.milk[0]);
  const [shots, setShots] = posUS(line.mods?.shots ?? POS_MODIFIERS.shots.find(s => s.default));
  const [temp,  setTemp]  = posUS(line.mods?.temp  ?? POS_MODIFIERS.temp.find(t => t.default));
  const [notes, setNotes] = posUS(line.notes ?? line.mods?.notes ?? "");
  const [qty,   setQty]   = posUS(line.qty);

  // Discount: { kind: "none" | "pct" | "amount", value: number, reason?: string }
  const initialDiscount = line.discount
    ? (line.discount.pct ? { kind: "pct", value: line.discount.pct, reason: line.discount.reason || "" }
                         : { kind: "amount", value: line.discount.amount, reason: line.discount.reason || "" })
    : { kind: "none", value: 0, reason: "" };
  const [discount, setDiscount] = posUS(initialDiscount);

  const newMods = { size, milk: isDrink ? milk : null, shots: isDrink ? shots : null, temp: isDrink ? temp : null, notes };
  const base = product.price ?? line.basePrice ?? line.price;
  const unitPrice = base + buildModDelta(newMods);
  const grossLine = unitPrice * qty;
  const discountAmt = discount.kind === "pct"     ? grossLine * (discount.value / 100)
                    : discount.kind === "amount"  ? Math.min(discount.value, grossLine)
                    : 0;
  const finalLine   = Math.max(0, grossLine - discountAmt);

  const presets = [10, 15, 20, 50];

  return (
    <div className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl border border-[var(--border)] w-[560px] max-w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-[var(--border)]">
          <div className="h-11 w-11 rounded flex items-center justify-center text-[20px] shrink-0 border border-[var(--border)]" style={{ background: (product.color || line.color || "#000") + "1f" }}>
            <span>{line.tag}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500">Edit line</div>
            <div className="text-[15px] font-semibold leading-tight">{line.name}</div>
            <div className="text-[11.5px] text-stone-500 mt-0.5 font-mono tabular-nums">Base {money(base)} · Now {money(unitPrice)}/ea</div>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-800 flex items-center justify-center">
            <Icon name="x" size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {isDrink && (
            <>
              <ModRow label="Size">
                {POS_MODIFIERS.size.map(s => (
                  <ModChip key={s.id} active={size?.id === s.id} onClick={() => setSize(s)}>
                    <div className="font-semibold">{s.name}</div>
                    {s.delta !== 0 && <div className="text-[10px] text-stone-500 font-mono tabular-nums">{s.delta > 0 ? "+" : ""}{money(s.delta)}</div>}
                  </ModChip>
                ))}
              </ModRow>
              <ModRow label="Temperature">
                {POS_MODIFIERS.temp.map(t => (
                  <ModChip key={t.id} active={temp?.id === t.id} onClick={() => setTemp(t)}>{t.name}</ModChip>
                ))}
              </ModRow>
              <ModRow label="Milk">
                {POS_MODIFIERS.milk.map(m => (
                  <ModChip key={m.id} active={milk?.id === m.id} onClick={() => setMilk(m)}>
                    <div className="font-semibold">{m.name}</div>
                    {m.delta > 0 && <div className="text-[10px] text-stone-500 font-mono tabular-nums">+{money(m.delta)}</div>}
                  </ModChip>
                ))}
              </ModRow>
              <ModRow label="Shots">
                {POS_MODIFIERS.shots.map(s => (
                  <ModChip key={s.id} active={shots?.id === s.id} onClick={() => setShots(s)}>
                    <div className="font-semibold">{s.name}</div>
                    {s.delta > 0 && <div className="text-[10px] text-stone-500 font-mono tabular-nums">+{money(s.delta)}</div>}
                  </ModChip>
                ))}
              </ModRow>
            </>
          )}

          {/* Quantity */}
          <ModRow label="Quantity">
            <div className="inline-flex items-center border border-[var(--border)] rounded">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="h-8 w-8 hover:bg-stone-100 flex items-center justify-center"><Icon name="minus" size={13}/></button>
              <span className="w-10 text-center text-[13px] font-mono font-semibold tabular-nums">{qty}</span>
              <button onClick={() => setQty(q => q + 1)} className="h-8 w-8 hover:bg-stone-100 flex items-center justify-center"><Icon name="plus" size={13}/></button>
            </div>
          </ModRow>

          {/* Notes / 詳情 */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 mb-1.5 flex items-center gap-1.5">
              <Icon name="message-square" size={11} /> Notes for kitchen / bar
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Allergies, prep instructions, name on cup, for here vs to-go…"
              rows={2}
              className="w-full !text-[13px] !py-2 !px-2.5 resize-none"
            />
          </div>

          {/* Discount */}
          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-stone-50 border-b border-[var(--border)] flex items-center gap-2">
              <Icon name="percent" size={12} className="text-stone-500" />
              <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500">Line discount</div>
              {discount.kind !== "none" && (
                <span className="ml-auto text-[11px] font-mono tabular-nums text-emerald-700 font-semibold">− {money(discountAmt)}</span>
              )}
            </div>
            <div className="p-3 space-y-2.5">
              <div className="grid grid-cols-3 gap-1.5">
                <ModChip active={discount.kind === "none"}    onClick={() => setDiscount({ kind: "none",   value: 0, reason: discount.reason })}>None</ModChip>
                <ModChip active={discount.kind === "pct"}     onClick={() => setDiscount({ kind: "pct",    value: discount.value || 10, reason: discount.reason })}>% off</ModChip>
                <ModChip active={discount.kind === "amount"}  onClick={() => setDiscount({ kind: "amount", value: discount.value || 1,  reason: discount.reason })}>$ off</ModChip>
              </div>
              {discount.kind !== "none" && (
                <>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 inline-flex items-center border border-[var(--border)] rounded h-8 overflow-hidden bg-white">
                      <span className="px-2 text-stone-400 text-[12px] font-mono">{discount.kind === "pct" ? "%" : "$"}</span>
                      <input
                        type="number" step="any" min="0"
                        value={discount.value}
                        onChange={e => setDiscount(d => ({ ...d, value: parseFloat(e.target.value) || 0 }))}
                        className="!border-0 !rounded-none !py-0 !px-1 flex-1 !text-[13px] font-mono tabular-nums"
                      />
                    </div>
                    {discount.kind === "pct" && (
                      <div className="inline-flex border border-[var(--border)] rounded overflow-hidden">
                        {presets.map(p => (
                          <button key={p} onClick={() => setDiscount(d => ({ ...d, value: p }))}
                            className={`h-8 px-2 text-[11.5px] font-mono tabular-nums ${discount.value === p ? "bg-stone-900 text-white" : "bg-white hover:bg-stone-50"} ${p !== presets[presets.length-1] ? "border-r border-[var(--border)]" : ""}`}>
                            {p}%
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <select
                    value={discount.reason}
                    onChange={e => setDiscount(d => ({ ...d, reason: e.target.value }))}
                    className="w-full !text-[12.5px] !py-1.5"
                  >
                    <option value="">Reason (optional)…</option>
                    <option value="staff">Staff discount</option>
                    <option value="loyalty">Loyalty reward</option>
                    <option value="comp">Comp / on the house</option>
                    <option value="damaged">Made incorrectly</option>
                    <option value="manager">Manager override</option>
                  </select>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--border)] bg-stone-50 flex items-center gap-2">
          <button
            onClick={() => { onRemove(); onClose(); }}
            className="h-8 px-2.5 rounded-lg border border-[var(--border)] bg-white hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 text-[12px] font-medium inline-flex items-center gap-1.5"
            style={{ "--destructive": "oklch(0.577 0.245 27.325)" }}
          >
            <Icon name="trash-2" size={12} /> Remove
          </button>
          <div className="ml-auto text-right">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">Line total</div>
            <div className="text-[15px] font-mono font-semibold tabular-nums">
              {discount.kind !== "none" && <span className="text-stone-400 line-through font-normal mr-1.5 text-[12px]">{money(grossLine)}</span>}
              {money(finalLine)}
            </div>
          </div>
          <button
            onClick={() => {
              const patch = { mods: newMods, notes, qty };
              if (discount.kind === "pct")    patch.discount = { pct: discount.value, reason: discount.reason };
              else if (discount.kind === "amount") patch.discount = { amount: discount.value, reason: discount.reason };
              else patch.discount = null;
              onSave(patch);
              onClose();
            }}
            className="h-8 px-3 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[12px] font-semibold inline-flex items-center gap-1.5"
          >
            <Icon name="check" size={13} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { usePOSState, money, ModifierModal, MemberPicker, LineEditor });
