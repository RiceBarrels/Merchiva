// ═══════════════════════════════════════════════════════════
// Training · Manager view — author & publish curriculum
// ═══════════════════════════════════════════════════════════

const { useState: tmUS, useRef: tmUR } = React;

// ─── Markdown editor toolbar ────────────────────────────────
function MdToolbar({ onWrap, onUpload }) {
  const tools = [
    { icon: 'heading-1',  title: 'Heading 1',  action: () => onWrap('# ',  '', true) },
    { icon: 'heading-2',  title: 'Heading 2',  action: () => onWrap('## ', '', true) },
    { sep: true },
    { icon: 'bold',       title: 'Bold',       action: () => onWrap('**', '**') },
    { icon: 'italic',     title: 'Italic',     action: () => onWrap('*',  '*')  },
    { icon: 'code',       title: 'Inline code',action: () => onWrap('`',  '`')  },
    { sep: true },
    { icon: 'list',         title: 'Bullet list', action: () => onWrap('- ',    '', true) },
    { icon: 'list-ordered', title: 'Numbered',    action: () => onWrap('1. ',   '', true) },
    { icon: 'quote',        title: 'Quote',       action: () => onWrap('> ',    '', true) },
    { icon: 'table',        title: 'Table',       action: () => {} },
    { sep: true },
    { icon: 'link',         title: 'Link',        action: () => onWrap('[', '](https://)') },
    { icon: 'image',        title: 'Upload photo',action: () => onUpload('photo') },
    { icon: 'video',        title: 'Upload video',action: () => onUpload('video') },
  ];
  return (
    <div className="flex items-center gap-0.5 px-2 h-10 border-b border-[var(--border)] bg-stone-50/50">
      {tools.map((t, i) => t.sep ? (
        <div key={i} className="w-px h-5 bg-stone-200 mx-1" />
      ) : (
        <button
          key={i}
          onClick={t.action}
          title={t.title}
          className="h-7 w-7 rounded inline-flex items-center justify-center text-stone-600 hover:bg-stone-200/60 hover:text-stone-900"
        >
          <Icon name={t.icon} size={14} />
        </button>
      ))}
      <div className="flex-1" />
      <span className="font-mono text-[10px] text-stone-400 uppercase tracking-wider">markdown</span>
    </div>
  );
}

// ─── Attachment thumbnails ──────────────────────────────────
function AttachmentTile({ a, role = 'manager' }) {
  const isVideo = a.kind === 'video';
  const isPhoto = a.kind === 'photo';
  const isDoc   = a.kind === 'doc';
  return (
    <div className="group relative rounded border border-[var(--border)] bg-white overflow-hidden shrink-0 w-[140px]">
      <div className="relative h-[78px]" style={{
        background: isVideo
          ? `linear-gradient(135deg, #2a2520 0%, #44403c 100%)`
          : isPhoto
          ? `repeating-linear-gradient(135deg, #efe9dd 0 8px, #e8e1d2 8px 16px)`
          : '#f5f5f4',
      }}>
        {isVideo && (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center">
                <Icon name="play" size={13} className="text-stone-900 ml-0.5" />
              </span>
            </div>
            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white font-mono text-[9.5px] tabular-nums">{a.duration}</span>
          </>
        )}
        {isPhoto && (
          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-white/85 border border-stone-300 font-mono text-[9px] uppercase tracking-wider text-stone-600">photo</span>
        )}
        {isDoc && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon name="file-text" size={22} className="text-stone-500" />
          </div>
        )}
        {role === 'manager' && (
          <button className="absolute top-1 right-1 w-5 h-5 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-black/60">
            <Icon name="x" size={11} />
          </button>
        )}
      </div>
      <div className="px-2 py-1.5 border-t border-[var(--border)]">
        <div className="text-[11px] font-medium text-stone-900 truncate" title={a.name}>{a.name}</div>
        <div className="font-mono text-[9.5px] text-stone-500 tabular-nums">{a.size}</div>
      </div>
    </div>
  );
}

// ─── Drop zone (manager) ────────────────────────────────────
function AttachmentDropZone() {
  const [hover, setHover] = tmUS(false);
  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setHover(false); }}
      className={`shrink-0 w-[140px] h-[112px] rounded border border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
        hover ? 'border-stone-900 bg-stone-100' : 'border-stone-300 bg-stone-50/50 hover:bg-stone-100/60'
      }`}
    >
      <Icon name="upload-cloud" size={18} className="text-stone-500" />
      <div className="text-[11px] font-medium text-stone-700">Drop file</div>
      <div className="font-mono text-[9.5px] text-stone-500 uppercase tracking-wider">mp4 · jpg · png · pdf</div>
    </div>
  );
}

// ─── Manager: top bar with module meta ──────────────────────
function ManagerModuleBar({ saved, onSavedToggle }) {
  return (
    <div className="border-b border-[var(--border)] bg-white">
      <div className="flex items-center gap-3 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">module</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-stone-900 bg-stone-100 border border-stone-200 rounded px-1.5 py-0.5">D03</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <input
              defaultValue="Espresso Pull"
              className="text-[18px] font-semibold tracking-[-0.01em] bg-transparent border-0 outline-none w-full max-w-[400px] focus:bg-stone-50 rounded px-1 -mx-1"
            />
            <Icon name="pencil" size={12} className="text-stone-400" />
          </div>
          <div className="text-[11.5px] text-stone-500 mt-0.5 flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Icon name="clock" size={11} /> 90 min</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><Icon name="users" size={11} /> Barista, Shift Lead</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><Icon name="shield-check" size={11} /> Required</span>
            <span>·</span>
            <span className="font-mono">v2.4</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 border border-amber-200 font-mono text-[10px] uppercase tracking-wider text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            unsaved · 3 edits
          </span>
          <button className="h-8 px-3 rounded border border-[var(--border)] bg-white text-[12.5px] font-medium text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5">
            <Icon name="history" size={13} /> History
          </button>
          <button className="h-8 px-3 rounded border border-[var(--border)] bg-white text-[12.5px] font-medium text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5">
            <Icon name="eye" size={13} /> Preview as intern
          </button>
          <button className="h-8 px-3 rounded border border-[var(--border)] bg-white text-[12.5px] font-medium text-stone-700 hover:bg-stone-50">
            Save draft
          </button>
          <button className="h-8 px-3.5 rounded bg-stone-900 text-white text-[12.5px] font-medium hover:bg-stone-800 inline-flex items-center gap-1.5">
            Publish
            <Icon name="arrow-up-right" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manager root view ──────────────────────────────────────
function ManagerView() {
  const [md, setMd] = tmUS(DAY3_MD);
  const [activeId, setActiveId] = tmUS('d03');
  const taRef = tmUR(null);

  const onWrap = (pre, post, atLine) => {
    const ta = taRef.current;
    if (!ta) return;
    const [s, e] = [ta.selectionStart, ta.selectionEnd];
    const v = ta.value;
    let next;
    if (atLine) {
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      next = v.slice(0, lineStart) + pre + v.slice(lineStart);
    } else {
      next = v.slice(0, s) + pre + v.slice(s, e) + post + v.slice(e);
    }
    setMd(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(s + pre.length, e + pre.length);
    }, 0);
  };

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Left rail: day list */}
      <aside className="w-[260px] shrink-0 border-r border-[var(--border)] bg-white flex flex-col">
        <DayListRail activeId={activeId} onSelect={setActiveId} role="manager" />
        <div className="border-t border-[var(--border)] px-3 py-2.5 flex items-center gap-2">
          <Icon name="settings-2" size={12} className="text-stone-500" />
          <span className="text-[11.5px] text-stone-600">Curriculum settings</span>
        </div>
      </aside>

      {/* Main: meta bar + editor + preview + attachments */}
      <div className="flex-1 min-w-0 flex flex-col">
        <ManagerModuleBar />

        <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Editor column */}
          <div className="flex flex-col border-r border-[var(--border)] bg-white min-h-0">
            <div className="px-4 h-9 border-b border-[var(--border)] flex items-center gap-2 shrink-0">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Editor</span>
              <span className="text-stone-300">·</span>
              <span className="text-[11px] text-stone-500"><span className="font-mono">{md.split(/\s+/).filter(Boolean).length}</span> words · ~<span className="font-mono">{Math.ceil(md.split(/\s+/).length / 200)}</span> min read</span>
              <div className="flex-1" />
              <span className="font-mono text-[10px] text-emerald-600 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> autosave 14s ago</span>
            </div>
            <MdToolbar onWrap={onWrap} onUpload={() => {}} />
            <textarea
              ref={taRef}
              value={md}
              onChange={(e) => setMd(e.target.value)}
              spellCheck={false}
              className="flex-1 min-h-0 resize-none p-5 outline-none text-[13px] leading-[1.65] bg-white"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
          </div>

          {/* Preview column */}
          <div className="flex flex-col bg-stone-50/40 min-h-0">
            <div className="px-4 h-9 border-b border-[var(--border)] flex items-center gap-2 shrink-0">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Preview</span>
              <span className="text-stone-300">·</span>
              <span className="text-[11px] text-stone-500">how interns will see it</span>
              <div className="flex-1" />
              <div className="inline-flex rounded border border-[var(--border)] bg-white overflow-hidden">
                <button className="px-2.5 h-6 text-[11px] font-medium bg-stone-900 text-white">Desktop</button>
                <button className="px-2.5 h-6 text-[11px] font-medium text-stone-600 border-l border-[var(--border)]">Mobile</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              <div className="max-w-[560px] mx-auto md-body">
                {renderMarkdown(md)}
              </div>
            </div>
          </div>
        </div>

        {/* Attachments rail */}
        <div className="border-t border-[var(--border)] bg-white shrink-0">
          <div className="px-6 h-10 flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Attachments</span>
            <span className="text-[11.5px] text-stone-500"><span className="font-mono">{DAY3_ATTACHMENTS.length}</span> files · 51.8 MB</span>
            <div className="flex-1" />
            <button className="h-7 px-2.5 rounded border border-[var(--border)] bg-white text-[11.5px] font-medium text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5">
              <Icon name="upload" size={11} /> Upload
            </button>
            <button className="h-7 px-2.5 rounded border border-[var(--border)] bg-white text-[11.5px] font-medium text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5">
              <Icon name="link-2" size={11} /> Embed URL
            </button>
          </div>
          <div className="px-6 pb-4 pt-1 flex gap-2.5 overflow-x-auto">
            <AttachmentDropZone />
            {DAY3_ATTACHMENTS.map(a => <AttachmentTile key={a.id} a={a} role="manager" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ManagerView, AttachmentTile });
