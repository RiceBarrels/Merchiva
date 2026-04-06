"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Play, Code2, ChevronDown } from "lucide-react";

const CODE_TEMPLATES: Record<string, string> = {
  "Contact Form": `<div class="cf-form">
  <h3>Contact Us</h3>
  <form onsubmit="handleCF(event)">
    <input type="text" id="cf-name" placeholder="Your name" required />
    <input type="email" id="cf-email" placeholder="Email address" required />
    <textarea id="cf-msg" placeholder="Your message" rows="4" required></textarea>
    <button type="submit">Send Message</button>
    <p id="cf-status"></p>
  </form>
</div>
<style>
  .cf-form { max-width: 480px; padding: 1.5rem; }
  .cf-form h3 { font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem; }
  .cf-form input, .cf-form textarea {
    width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db;
    border-radius: 4px; margin-bottom: 0.75rem; font-size: 0.875rem;
    box-sizing: border-box; font-family: inherit;
  }
  .cf-form button {
    background: var(--sr-primary, #18181b); color: white;
    padding: 0.6rem 1.5rem; border: none; border-radius: 4px;
    font-weight: 600; cursor: pointer; font-size: 0.875rem;
  }
  #cf-status { margin-top: 0.5rem; font-size: 0.875rem; color: green; }
</style>
<script>
  function handleCF(e) {
    e.preventDefault();
    document.getElementById('cf-status').textContent = 'Message sent! We\\'ll be in touch soon.';
    e.target.reset();
  }
</script>`,

  "Fade-in Animation": `<div class="fade-section">
  <h2>Beautiful Animations</h2>
  <p>Scroll down to see elements fade in smoothly.</p>
</div>
<style>
  .fade-section { padding: 2rem; }
  .fade-section h2 { font-size: 1.75rem; font-weight: 800; }
  .fade-in {
    opacity: 0; transform: translateY(24px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  .fade-in.visible { opacity: 1; transform: translateY(0); }
</style>
<script>
  (function() {
    function initFade() {
      document.querySelectorAll('.fade-in').forEach(el => {
        const obs = new IntersectionObserver(entries => {
          entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.disconnect(); } });
        }, { threshold: 0.2 });
        obs.observe(el);
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFade);
    else initFade();
  })();
</script>`,

  "Calculator Widget": `<div class="calc-wrap">
  <div class="calc">
    <div id="calc-display" class="calc-display">0</div>
    <div class="calc-grid">
      <button class="calc-btn span2" onclick="calcClear()">C</button>
      <button class="calc-btn op" onclick="calcInput('%')">%</button>
      <button class="calc-btn op" onclick="calcInput('/')">÷</button>
      <button class="calc-btn" onclick="calcInput('7')">7</button>
      <button class="calc-btn" onclick="calcInput('8')">8</button>
      <button class="calc-btn" onclick="calcInput('9')">9</button>
      <button class="calc-btn op" onclick="calcInput('*')">×</button>
      <button class="calc-btn" onclick="calcInput('4')">4</button>
      <button class="calc-btn" onclick="calcInput('5')">5</button>
      <button class="calc-btn" onclick="calcInput('6')">6</button>
      <button class="calc-btn op" onclick="calcInput('-')">−</button>
      <button class="calc-btn" onclick="calcInput('1')">1</button>
      <button class="calc-btn" onclick="calcInput('2')">2</button>
      <button class="calc-btn" onclick="calcInput('3')">3</button>
      <button class="calc-btn op" onclick="calcInput('+')">+</button>
      <button class="calc-btn span2" onclick="calcInput('0')">0</button>
      <button class="calc-btn" onclick="calcInput('.')">.</button>
      <button class="calc-btn eq" onclick="calcEval()">=</button>
    </div>
  </div>
</div>
<style>
  .calc-wrap { display: flex; justify-content: center; padding: 1.5rem; }
  .calc { background: #1c1c1e; border-radius: 12px; padding: 1rem; width: 240px; }
  .calc-display {
    background: transparent; color: white; text-align: right;
    font-size: 2rem; font-weight: 300; padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .calc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .calc-btn {
    background: #333; color: white; border: none; border-radius: 50%;
    width: 48px; height: 48px; font-size: 1rem; cursor: pointer; font-weight: 500;
  }
  .calc-btn.op { background: #505050; }
  .calc-btn.eq { background: #ff9f0a; }
  .calc-btn.span2 { border-radius: 24px; grid-column: span 2; width: 100%; text-align: left; padding-left: 16px; }
  .calc-btn:active { opacity: 0.7; }
</style>
<script>
  var calcExpr = '';
  function calcInput(v) {
    calcExpr += v;
    document.getElementById('calc-display').textContent = calcExpr;
  }
  function calcClear() {
    calcExpr = '';
    document.getElementById('calc-display').textContent = '0';
  }
  function calcEval() {
    try {
      var r = Function('"use strict";return (' + calcExpr + ')')();
      calcExpr = String(+r.toFixed(8));
      document.getElementById('calc-display').textContent = calcExpr;
    } catch(e) {
      document.getElementById('calc-display').textContent = 'Error';
      calcExpr = '';
    }
  }
</script>`,

  "Countdown Timer": `<div class="countdown-wrap">
  <h3 class="countdown-title">Limited Time Offer</h3>
  <div id="countdown" class="countdown"></div>
  <p class="countdown-sub">Don't miss out!</p>
</div>
<style>
  .countdown-wrap { text-align: center; padding: 2rem; }
  .countdown-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; }
  .countdown { display: flex; gap: 1rem; justify-content: center; }
  .countdown-unit { display: flex; flex-direction: column; align-items: center; }
  .countdown-num {
    background: var(--sr-primary, #18181b); color: white;
    width: 64px; height: 64px; display: flex; align-items: center; justify-content: center;
    font-size: 1.75rem; font-weight: 800; border-radius: 8px;
  }
  .countdown-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem; opacity: 0.6; }
  .countdown-sub { margin-top: 1rem; opacity: 0.7; }
</style>
<script>
  (function() {
    var target = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    function pad(n) { return n < 10 ? '0'+n : n; }
    function updateCD() {
      var diff = Math.max(0, target - Date.now());
      var d = Math.floor(diff/86400000), h = Math.floor(diff%86400000/3600000);
      var m = Math.floor(diff%3600000/60000), s = Math.floor(diff%60000/1000);
      document.getElementById('countdown').innerHTML =
        [['Days',d],['Hours',h],['Mins',m],['Secs',s]].map(function(x) {
          return '<div class="countdown-unit"><div class="countdown-num">'+pad(x[1])+'</div><div class="countdown-label">'+x[0]+'</div></div>';
        }).join('');
    }
    updateCD();
    setInterval(updateCD, 1000);
  })();
</script>`,
};

interface CodeBlockProps {
  props: Record<string, unknown>;
  isEditor?: boolean;
}

export function CodeBlockElement({ props, isEditor = false }: CodeBlockProps) {
  const code = (props.code as string) || "";
  const autoRun = props.autoRun !== false;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showAI, setShowAI] = useState(false);

  // In editor mode: show code editor UI
  if (isEditor) {
    return (
      <div style={{ position: "relative", fontFamily: "monospace" }}>
        <div style={{ background: "#1e1e2e", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0.75rem", background: "#16162a", borderBottom: "1px solid #2d2d4e" }}>
            <span style={{ color: "#7c7ca0", fontSize: "0.75rem" }}>code-block</span>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                onClick={() => setShowAI((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "#6366f1", color: "white", border: "none", padding: "0.25rem 0.5rem", borderRadius: "3px", fontSize: "0.7rem", cursor: "pointer", fontWeight: 600 }}
              >
                <Sparkles style={{ width: 10, height: 10 }} /> AI
              </button>
            </div>
          </div>
          {showAI && (
            <div style={{ background: "#252540", borderBottom: "1px solid #2d2d4e", padding: "0.5rem 0.75rem" }}>
              <p style={{ color: "#a0a0c0", fontSize: "0.7rem", marginBottom: "0.4rem" }}>Insert template:</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {Object.keys(CODE_TEMPLATES).map((t) => (
                  <span key={t} style={{ padding: "0.2rem 0.5rem", background: "#3a3a5c", color: "#c0c0e0", borderRadius: "3px", fontSize: "0.7rem", cursor: "pointer" }}
                    onClick={() => { /* handled via onChange in renderer */ setShowAI(false); }}
                  >{t}</span>
                ))}
              </div>
            </div>
          )}
          <pre style={{ margin: 0, padding: "0.75rem", color: "#cdd6f4", fontSize: "0.75rem", lineHeight: 1.6, overflow: "auto", maxHeight: "240px", whiteSpace: "pre-wrap" }}>
            {code || <span style={{ opacity: 0.4 }}>// Add code in the properties panel</span>}
          </pre>
        </div>
      </div>
    );
  }

  // Published mode: render code in iframe sandbox
  return (
    <iframe
      ref={iframeRef}
      srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:inherit}</style></head><body>${code}</body></html>`}
      sandbox="allow-scripts allow-same-origin"
      style={{ width: "100%", minHeight: "120px", border: "none", display: "block" }}
      onLoad={() => {
        // Auto-resize to content height
        if (iframeRef.current?.contentDocument?.body) {
          const h = iframeRef.current.contentDocument.body.scrollHeight;
          if (h > 0) iframeRef.current.style.height = `${h + 16}px`;
        }
      }}
    />
  );
}

// Editor-mode code block with template picker (used inside builder props panel)
export function CodeBlockEditorPanel({
  code,
  onChange,
}: {
  code: string;
  onChange: (code: string) => void;
}) {
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button
          onClick={() => setShowTemplates((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "#6366f1", color: "white", border: "none", padding: "0.3rem 0.6rem", borderRadius: "3px", fontSize: "0.7rem", cursor: "pointer", fontWeight: 600 }}
        >
          <Sparkles style={{ width: 10, height: 10 }} /> AI Templates
          <ChevronDown style={{ width: 10, height: 10 }} />
        </button>
      </div>
      {showTemplates && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", background: "#f8f8f8", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "0.5rem" }}>
          {Object.keys(CODE_TEMPLATES).map((t) => (
            <button
              key={t}
              onClick={() => { onChange(CODE_TEMPLATES[t]); setShowTemplates(false); }}
              style={{ textAlign: "left", background: "none", border: "none", padding: "0.25rem 0.5rem", cursor: "pointer", fontSize: "0.75rem", borderRadius: "3px" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={code}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        placeholder="<!-- HTML, CSS, JS all in one block -->"
        style={{ width: "100%", fontFamily: "monospace", fontSize: "0.7rem", background: "#1e1e2e", color: "#cdd6f4", border: "1px solid #333", borderRadius: "4px", padding: "0.5rem", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }}
      />
    </div>
  );
}
