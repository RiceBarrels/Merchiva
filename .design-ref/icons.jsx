// Inline SVG icon set — replaces lucide font.
// Each icon: 16×16 viewbox, currentColor stroke, 1.75 stroke-width.

const ICONS = {
  search:    'M11 11l3 3M7 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z',
  plus:      'M8 3v10M3 8h10',
  play:      'M4 3l9 5-9 5z',
  trash:     'M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 4l1 9a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1l1-9',
  copy:      'M5 5V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2M3 6h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
  download:  'M8 2v8M4 7l4 4 4-4M2 13h12',
  refresh:   'M13 8a5 5 0 1 1-1.5-3.5L13 6M13 3v3h-3',
  reset:     'M13 8a5 5 0 1 1-1.5-3.5L13 6M13 3v3h-3',
  fn:        'M3 13c2 0 2-10 4-10M2 7h6',
  code:      'M5 4l-3 4 3 4M11 4l3 4-3 4',
  test:      'M5 2h6M6 2v4l-3 7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l-3-7V2',
  log:       'M2 4h12M2 8h12M2 12h8',
  zoomIn:    'M11 11l3 3M7 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zM7 5v4M5 7h4',
  zoomOut:   'M11 11l3 3M7 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zM5 7h4',
  fit:       'M2 5V3a1 1 0 0 1 1-1h2M11 2h2a1 1 0 0 1 1 1v2M14 11v2a1 1 0 0 1-1 1h-2M5 14H3a1 1 0 0 1-1-1v-2',
  arrange:   'M2 4h5M2 8h12M2 12h8',
  // Node category icons
  input:     'M2 8h8M7 5l3 3-3 3M14 3v10',
  output:    'M3 3v10M6 8h8M11 5l3 3-3 3',
  number:    'M3 6h10M3 10h10M6 3l-1 10M11 3l-1 10',
  string:    'M5 5h6M8 5v6M5 11h6',
  bool:      'M5 8h6',
  array:     'M5 3H3v10h2M11 3h2v10h-2',
  object:    'M5 3a2 2 0 0 0-2 2v2a2 2 0 0 1-1 1 2 2 0 0 1 1 1v2a2 2 0 0 0 2 2M11 3a2 2 0 0 1 2 2v2a2 2 0 0 0 1 1 2 2 0 0 0-1 1v2a2 2 0 0 1-2 2',
  branch:    'M5 3v10M11 3v3a3 3 0 0 0 3 3M5 8h6M11 13v-3',
  globe:     'M8 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM2 8h12M8 2c-2 2-2 10 0 12M8 2c2 2 2 10 0 12',
  dom:       'M2 4h12v8H2zM2 7h12',
  call:      'M3 5l3-3h4l3 3v6l-3 3H6l-3-3z',
  ret:       'M3 8h10M10 5l3 3-3 3M3 3v10',
  bolt:      'M9 2L3 9h4l-1 5 6-7H8z',
};

function Icon({ name, size = 16, className = '' }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg
      className={`ic-svg ${className}`}
      width={size} height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display:'inline-block', verticalAlign:'-3px', flexShrink:0 }}
    >
      <path d={d} />
    </svg>
  );
}

window.Icon = Icon;
window.ICONS = ICONS;
