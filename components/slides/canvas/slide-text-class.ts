// Structural styles of every slide text container (slides.md §5.2): RichTextView, the slide text editor and the
// speaker-notes editor all use this one class list. It is a Tailwind v4 arbitrary-variant string rather than CSS,
// because app/globals.css is over the file-size cap and per-component CSS files are not allowed. List markers are
// restored here because Tailwind's preflight removes them. A bold mark is weight 700, not preflight's `bolder`, so a
// bold run inside a box whose default is bold (weight 700 already) stays 700 instead of turning 900. Colours, fonts
// and sizes are inline styles taken from validated model values, never classes.
export const SLIDE_TEXT_CLASS = [
  "whitespace-pre-wrap [overflow-wrap:anywhere] [&_strong]:font-bold",
  "[&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-[1.2em] [&_ol]:pl-[1.4em] [&_li>p]:m-0",
  "[&_.ProseMirror]:outline-none [&_.ProseMirror]:whitespace-pre-wrap [&_.ProseMirror]:[overflow-wrap:anywhere] [&_.ProseMirror]:caret-current",
  "[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-start [&_.is-empty]:before:h-0",
  "[&_.is-empty]:before:content-[attr(data-placeholder)] [&_.is-empty]:before:opacity-50",
].join(" ");
