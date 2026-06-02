// ═══════════════════════════════════════════════════════════
// Training · curriculum data + minimal markdown renderer
// ═══════════════════════════════════════════════════════════

const { useState: tdUS, useMemo: tdUM, useEffect: tdUE, useRef: tdUR } = React;

const T_ACC      = 'oklch(0.55 0.09 55)';
const T_ACC_SOFT = '#faf5ec';
const T_ACC_BD   = '#ecd9b8';

// ─── Trainees ───────────────────────────────────────────────
const TRAINEES = [
  { id: 't1', name: 'Devon Ray',    role: 'Cashier', startDate: 'Apr 8',  dayProgress: 3, status: 'in-progress', color: 'bg-cyan-100 text-cyan-800' },
  { id: 't2', name: 'Maya Wu',      role: 'Barista', startDate: 'Apr 8',  dayProgress: 3, status: 'review-pending', color: 'bg-violet-100 text-violet-800' },
  { id: 't3', name: 'Leo Park',     role: 'Barista', startDate: 'Apr 15', dayProgress: 2, status: 'in-progress', color: 'bg-rose-100 text-rose-800' },
  { id: 't4', name: 'Iris Tanaka',  role: 'Kitchen', startDate: 'Apr 1',  dayProgress: 7, status: 'in-progress', color: 'bg-amber-100 text-amber-800' },
];

// ─── Curriculum: 12-day program ─────────────────────────────
const CURRICULUM = [
  { id: 'd01', day: 1,  title: 'Welcome & Cafe Tour',          mins: 45,  req: true,  type: 'orientation' },
  { id: 'd02', day: 2,  title: 'Coffee Basics & Beans',        mins: 60,  req: true,  type: 'theory'      },
  { id: 'd03', day: 3,  title: 'Espresso Pull',                mins: 90,  req: true,  type: 'practice',  active: true },
  { id: 'd04', day: 4,  title: 'Milk Steaming',                mins: 75,  req: true,  type: 'practice' },
  { id: 'd05', day: 5,  title: 'Latte Art Fundamentals',       mins: 90,  req: false, type: 'practice' },
  { id: 'd06', day: 6,  title: 'POS & Cash Handling',          mins: 60,  req: true,  type: 'system' },
  { id: 'd07', day: 7,  title: 'Customer Service Standards',   mins: 45,  req: true,  type: 'theory' },
  { id: 'd08', day: 8,  title: 'Food Safety & Hygiene',        mins: 60,  req: true,  type: 'compliance' },
  { id: 'd09', day: 9,  title: 'Closing Procedures',           mins: 45,  req: true,  type: 'practice' },
  { id: 'd10', day: 10, title: 'Opening Procedures',           mins: 45,  req: true,  type: 'practice' },
  { id: 'd11', day: 11, title: 'Advanced Drinks',              mins: 90,  req: false, type: 'practice' },
  { id: 'd12', day: 12, title: 'Final Assessment',             mins: 120, req: true,  type: 'assessment' },
];

// ─── Day 3 content (markdown) ───────────────────────────────
const DAY3_MD = `# Pulling the perfect espresso shot

A 25-second window decides whether the shot is dialed in. This is the most repeatable skill behind the bar — get it right and everything else falls into place.

## What you'll learn

- Reading the grinder and adjusting **dose**
- Tamping consistently — aim for ~30 lb of pressure
- Recognizing the **first drip** (8 s) and **end of pour** (25 s)
- Visual cues: tiger striping, blonde shot, channeling

## The 25-second window

| Stage        | Time      | What you see                |
|--------------|-----------|-----------------------------|
| First drip   | 7–9 s     | Dark, slow droplets         |
| Body forms   | 12–18 s   | Honey-thick stream          |
| End of pour  | 23–27 s   | Stream lightens — cut shot  |

## Demonstration

![Espresso pour anatomy — labelled cross-section](:photo:espresso-anatomy)

> Watch Priya pull a textbook shot, then a deliberately channeled one. Compare the crema and stream color.

🎥 [The 25-second pour — 4:12](:video:pour-anatomy)

## Practice tasks

1. Pull **5 shots back-to-back**, each within ±2 seconds of target
2. Recover from a "blonde" shot by adjusting grind one notch finer
3. Identify channeling in a deliberately bad tamp

## Common mistakes

- Tamping unevenly — one side noticeably higher than the other
- Skipping pre-infusion on a thirsty grinder
- Cutting the shot by time alone, ignoring color and stream

> "Espresso is a conversation between you, the grinder, and the bean. Stay curious — every shot teaches you something."
> — Priya Nair, Shift Lead`;

// ─── Attachments for Day 3 ──────────────────────────────────
const DAY3_ATTACHMENTS = [
  { id: 'a1', kind: 'video', name: 'pour-anatomy.mp4',  size: '48.2 MB', duration: '4:12', thumb: 'video' },
  { id: 'a2', kind: 'photo', name: 'espresso-anatomy.jpg', size: '1.4 MB', thumb: 'photo' },
  { id: 'a3', kind: 'photo', name: 'tamp-grip.jpg',     size: '820 KB', thumb: 'photo' },
  { id: 'a4', kind: 'photo', name: 'channeling-vs-good.jpg', size: '1.1 MB', thumb: 'photo' },
  { id: 'a5', kind: 'doc',   kind2: 'pdf', name: 'grinder-cheatsheet.pdf', size: '210 KB', thumb: 'doc' },
];

// ─── Rubric for Day 3 ───────────────────────────────────────
const DAY3_RUBRIC = [
  { id: 'r1', label: 'Tamping consistency',  hint: 'Even pressure, flat surface' },
  { id: 'r2', label: 'Yield (g out)',        hint: 'Target 36g ±1g' },
  { id: 'r3', label: 'Time (s)',             hint: 'Target 25s ±2s' },
  { id: 'r4', label: 'Crema quality',        hint: 'Tiger striping, no holes' },
  { id: 'r5', label: 'Station cleanliness',  hint: 'Wiped portafilter, drip tray' },
];

// ═══════════════════════════════════════════════════════════
// Markdown renderer — very small, intentional subset
// Supports: # h1, ## h2, ### h3, **bold**, *italic*, `code`,
// [link](url), unordered/ordered lists, > blockquotes,
// | tables |, --- hr, paragraphs.
// Custom: ![alt](:photo:id), 🎥 [label](:video:id)
// ═══════════════════════════════════════════════════════════
function renderInline(s) {
  // Order matters: escape, then code, then bold/em, then links/images
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g;
  let i = 0, m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > i) parts.push(s.slice(i, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(<strong key={parts.length}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) parts.push(<code key={parts.length}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('![')) {
      const am = /!\[([^\]]*)\]\(([^)]+)\)/.exec(tok);
      parts.push(<MdImage key={parts.length} alt={am[1]} src={am[2]} />);
    }
    else if (tok.startsWith('[')) {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (lm[2].startsWith(':video:')) parts.push(<MdVideoLink key={parts.length} label={lm[1]} id={lm[2].slice(7)} />);
      else parts.push(<a key={parts.length} href={lm[2]}>{lm[1]}</a>);
    }
    else if (tok.startsWith('*')) parts.push(<em key={parts.length}>{tok.slice(1, -1)}</em>);
    i = m.index + tok.length;
  }
  if (i < s.length) parts.push(s.slice(i));
  return parts;
}

function MdImage({ alt, src }) {
  const id = src.startsWith(':photo:') ? src.slice(7) : src;
  return (
    <span className="block my-2">
      <span className="block rounded border border-[var(--border)] overflow-hidden">
        <span className="block relative" style={{
          background: `repeating-linear-gradient(135deg, #efe9dd 0 8px, #e8e1d2 8px 16px)`,
          aspectRatio: '16 / 9',
        }}>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-stone-600 bg-white/80 border border-stone-300 rounded px-2 py-1">
              photo · {id}
            </span>
          </span>
        </span>
      </span>
      {alt && <span className="block mt-1.5 text-[11px] text-stone-500 italic">{alt}</span>}
    </span>
  );
}

function MdVideoLink({ label, id }) {
  return (
    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded border border-[var(--border)] bg-stone-50 text-[12.5px]" style={{ verticalAlign: 'baseline' }}>
      <Icon name="play" size={11} />
      <span className="font-medium">{label}</span>
      <span className="font-mono text-[10.5px] text-stone-500">{id}</span>
    </span>
  );
}

function renderMarkdown(src) {
  const lines = src.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // headings
    if (/^### /.test(line)) { blocks.push(<h3 key={i}>{renderInline(line.slice(4))}</h3>); i++; continue; }
    if (/^## /.test(line))  { blocks.push(<h2 key={i}>{renderInline(line.slice(3))}</h2>); i++; continue; }
    if (/^# /.test(line))   { blocks.push(<h1 key={i}>{renderInline(line.slice(2))}</h1>); i++; continue; }

    // hr
    if (/^---+$/.test(line.trim())) { blocks.push(<hr key={i} />); i++; continue; }

    // table: line with | and next line is separator
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s\-:|]+\|?\s*$/.test(lines[i + 1])) {
      const head = line.split('|').map(s => s.trim()).filter(Boolean);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').map(s => s.trim()).filter(Boolean));
        i++;
      }
      blocks.push(
        <table key={`tbl-${blocks.length}`}>
          <thead><tr>{head.map((h, j) => <th key={j}>{renderInline(h)}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{renderInline(c)}</td>)}</tr>)}</tbody>
        </table>
      );
      continue;
    }

    // blockquote — consume consecutive >
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      blocks.push(
        <blockquote key={`bq-${blocks.length}`}>
          {buf.map((b, j) => <div key={j}>{renderInline(b)}</div>)}
        </blockquote>
      );
      continue;
    }

    // unordered list
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ''));
        i++;
      }
      blocks.push(<ul key={`ul-${blocks.length}`}>{items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>);
      continue;
    }

    // ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push(<ol key={`ol-${blocks.length}`}>{items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>);
      continue;
    }

    // paragraph — emoji-led video lines
    blocks.push(<p key={i}>{renderInline(line)}</p>);
    i++;
  }
  return blocks;
}

// ─── Shared day-list rail (used by all 3 roles, with role hints) ─
function DayListRail({ activeId, onSelect, role, traineeProgress }) {
  const TYPE_DOTS = {
    orientation: '#a8a29e',
    theory:      T_ACC,
    practice:    '#1c1917',
    system:      '#0891b2',
    compliance:  '#d97706',
    assessment:  '#dc2626',
  };

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold leading-tight">Barista onboarding</div>
          <div className="text-[10.5px] text-stone-500 leading-tight mt-0.5">
            <span className="font-mono">12 days</span> · v2.4 · updated Apr 18
          </div>
        </div>
        {role === 'manager' && (
          <button className="h-7 w-7 rounded border border-[var(--border)] bg-white text-stone-600 inline-flex items-center justify-center hover:bg-stone-50" title="Add day">
            <Icon name="plus" size={13} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {CURRICULUM.map(d => {
          const active = d.id === activeId;
          const done = role === 'intern' ? d.day < 3 : false;
          const locked = role === 'intern' ? d.day > 3 : false;

          return (
            <button
              key={d.id}
              onClick={() => onSelect && onSelect(d.id)}
              className={`group w-full text-left flex items-start gap-2.5 px-2 py-2 rounded transition-colors mb-0.5 ${
                active ? 'bg-stone-900 text-white' : 'hover:bg-stone-100'
              }`}
            >
              <div className="flex flex-col items-center pt-0.5 shrink-0 w-7">
                <span className={`font-mono text-[10px] tracking-wider ${active ? 'text-stone-400' : 'text-stone-400'}`}>DAY</span>
                <span className={`font-mono text-[14px] font-semibold tabular-nums leading-none ${active ? 'text-white' : 'text-stone-900'}`}>
                  {String(d.day).padStart(2, '0')}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TYPE_DOTS[d.type] }} />
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${active ? 'text-stone-300' : 'text-stone-500'}`}>{d.type}</span>
                  {!d.req && (
                    <span className={`text-[9.5px] font-mono uppercase tracking-wider ${active ? 'text-stone-400' : 'text-stone-400'}`}>· optional</span>
                  )}
                </div>
                <div className={`text-[13px] font-medium leading-tight truncate ${active ? 'text-white' : 'text-stone-900'}`}>{d.title}</div>
                <div className={`flex items-center gap-2 mt-1 text-[10.5px] ${active ? 'text-stone-400' : 'text-stone-500'}`}>
                  <span className="font-mono tabular-nums">{d.mins}m</span>
                  {role === 'trainer' && traineeProgress && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{traineeProgress[d.id] || '0/4'}</span>
                    </>
                  )}
                </div>
              </div>

              {/* status icon */}
              {role === 'intern' && (
                <div className="pt-0.5 shrink-0">
                  {done && <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white"><Icon name="check" size={10} /></span>}
                  {active && <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border-2 border-white bg-stone-700"><span className="w-1 h-1 rounded-full bg-white" /></span>}
                  {locked && <Icon name="lock" size={11} className="text-stone-400" />}
                </div>
              )}
              {role === 'manager' && (
                <div className="pt-0.5 shrink-0 opacity-0 group-hover:opacity-100">
                  <Icon name="grip-vertical" size={11} className={active ? 'text-stone-400' : 'text-stone-400'} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, {
  T_ACC, T_ACC_SOFT, T_ACC_BD,
  TRAINEES, CURRICULUM, DAY3_MD, DAY3_ATTACHMENTS, DAY3_RUBRIC,
  renderMarkdown, DayListRail,
});
