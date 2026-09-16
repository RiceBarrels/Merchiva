/**
 * Standalone stylesheet for exported HTML (docs-editor-ui spec §6.3). A copy of the editor's `.doc-prose`
 * rules (app/globals.css docs block) with fixed light colors, so the file looks like the page sheet in any
 * browser or email client without the app's CSS variables.
 */
export const DOC_EXPORT_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#f5f5f5;color:#0a0a0a}
.doc{max-width:8.5in;margin:24px auto;padding:1in;background:#fff;border:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.15;overflow-wrap:anywhere}
.doc p{margin:0 0 .5em}
.doc p[data-doc-style="title"]{font-size:2.36em;margin:0 0 .25em}
.doc p[data-doc-style="subtitle"]{font-size:1.36em;color:#525252;margin:0 0 1em}
.doc h1{font-size:1.82em;font-weight:400;margin:1em 0 .35em}
.doc h2{font-size:1.45em;font-weight:400;margin:.9em 0 .3em}
.doc h3{font-size:1.27em;font-weight:600;margin:.8em 0 .25em}
.doc ul,.doc ol{padding-inline-start:1.5em;margin:0 0 .5em}
.doc ul{list-style:disc}
.doc ol{list-style:decimal}
.doc ul[data-type="taskList"]{list-style:none;padding-inline-start:.25em}
.doc li[data-type="taskItem"]{display:flex;gap:.5em;align-items:flex-start}
.doc li[data-type="taskItem"]>label{margin-top:.15em}
.doc li[data-type="taskItem"]>label>span{display:none}
.doc li[data-type="taskItem"]>div{flex:1 1 auto;min-width:0}
.doc li[data-type="taskItem"][data-checked="true"]>div{color:#525252;text-decoration:line-through}
.doc a{color:#1f3fad;text-decoration:underline;text-underline-offset:2px}
.doc blockquote{margin:0 0 .5em;border-inline-start:2px solid #e5e5e5;padding-inline-start:.9em;color:#525252}
.doc code{font-family:"Courier New",monospace;background:#f5f5f5;padding:0 .25em}
.doc pre{font-family:"Courier New",monospace;background:#f5f5f5;padding:.75em;overflow-x:auto}
.doc pre code{background:none;padding:0}
.doc hr{border:0;border-top:1px solid #e5e5e5;margin:1em 0}
.doc img{max-width:100%;height:auto}
.doc mark{padding:0 .05em}
.doc table{border-collapse:collapse;table-layout:fixed;width:100%;margin:.5em 0}
.doc td,.doc th{border:1px solid #d4d4d4;padding:.3em .5em;vertical-align:top}
.doc th{background:#f5f5f5;font-weight:600;text-align:start}
.doc td>p:last-child,.doc th>p:last-child{margin-bottom:0}
.doc [data-page-break]{height:0;margin:1.5em 0;border-top:1px dashed #d4d4d4}
@media (max-width:8.5in){.doc{margin:0;border:0;padding:24px 16px}}
@media print{
  @page{margin:1in}
  body{background:#fff}
  .doc{max-width:none;margin:0;padding:0;border:0}
  .doc [data-page-break]{break-after:page;border:0;margin:0}
  .doc h1,.doc h2,.doc h3{break-after:avoid}
  .doc tr,.doc img{break-inside:avoid}
}
`.trim();
