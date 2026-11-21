/* Auto Logbook IPB: styles for the shadow-DOM panel. */
(function (ALB) {
  'use strict';

  ALB.styles = {};

  // Plain and dense on purpose: neutral greys, one ink-blue accent for the
  // primary action, links and focus, small radii, and rules instead of cards.
  ALB.styles.panel = String.raw`
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.alb {
  --ink: #1a1a19;
  --ink-2: #474744;
  --ink-3: #6b6a66;
  --ink-4: #9d9c96;
  --line: #dcdbd5;
  --line-2: #ebeae5;
  --field: #8f8e88;
  --bg: #ffffff;
  --bg-2: #f4f4f1;
  --accent: #1f4590;
  --accent-hover: #17366f;
  --accent-soft: #e8edf7;
  --accent-ink: #1b3e85;
  --ok: #1d6b3d;
  --ok-soft: #eaf4ee;
  --warn: #84530b;
  --warn-mark: #c98a12;
  --warn-soft: #fbf3e0;
  --bad: #b0261c;
  --bad-line: #dba5a0;
  --bad-soft: #fbeceb;
  --mono: ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, monospace;
  font: 14px/1.45 system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--ink);
  accent-color: var(--accent);
  color-scheme: light;
  -webkit-font-smoothing: antialiased;
}

dialog.alb {
  padding: 0;
  border: 0;
  border-radius: 6px;
  width: min(1120px, calc(100vw - 32px));
  height: min(880px, calc(100dvh - 32px));
  max-width: none;
  max-height: none;
  background: var(--bg);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12), 0 18px 48px rgb(0 0 0 / 0.24);
  overflow: hidden;
}
dialog.alb[open] { display: flex; flex-direction: column; }
dialog.alb:modal { overscroll-behavior: contain; }
dialog.alb::backdrop {
  background: rgb(20 20 19 / 0.5);
  overflow: hidden;
  overscroll-behavior: contain;
}
/* fit-content, not auto: a modal dialog is fixed with top and bottom at 0, so auto would stretch it. */
dialog.alb.compact { height: fit-content; max-height: min(720px, calc(100dvh - 32px)); }
dialog.alb.sub { width: min(760px, calc(100vw - 32px)); height: fit-content; max-height: min(720px, calc(100dvh - 32px)); }

@media (max-width: 720px) {
  dialog.alb { width: 100vw; height: 100dvh; border-radius: 0; }
  dialog.alb.compact, dialog.alb.sub { width: 100vw; max-height: 100dvh; }
}

button, input, select, textarea { font: inherit; color: inherit; }
h2, h3, h4, p { margin: 0; }
h3 { font-size: 14px; font-weight: 600; }
a { color: var(--accent-ink); }
svg.i { width: 1em; height: 1em; flex: none; }
code, .mono { font-family: var(--mono); }
code { font-size: 12px; color: var(--ink-2); }
kbd {
  font: 600 12px/1 var(--mono); color: var(--ink); white-space: nowrap;
  background: var(--bg-2); border: 1px solid var(--line); border-radius: 3px; padding: 2px 4px;
}

/* Header */
.head { display: flex; align-items: center; gap: 16px; padding: 10px 12px 10px 24px; border-bottom: 1px solid var(--line); }
.head-main { flex: 1; min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 14px; }
.title { font-size: 15px; font-weight: 600; }
.head-sub { flex: 1 1 280px; min-width: 0; color: var(--ink-3); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-btn {
  appearance: none; border: 0; background: transparent; color: var(--ink-2);
  width: 34px; height: 34px; border-radius: 4px; display: grid; place-items: center; cursor: pointer; font-size: 18px;
}
.icon-btn:hover { background: var(--bg-2); color: var(--ink); }

/* Steps */
.tabs { display: flex; gap: 24px; padding: 0 22px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; }
.tab {
  appearance: none; border: 0; background: none; cursor: pointer;
  display: flex; align-items: center; gap: 7px; white-space: nowrap;
  padding: 10px 2px 9px; border-bottom: 2px solid transparent; margin-bottom: -1px;
  color: var(--ink-3); font-weight: 500;
}
.tab:hover { color: var(--ink); }
.tab:focus-visible { outline-offset: -2px; }
.tab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); }
.step { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ink-4); display: inline-grid; place-items: center; min-width: 9px; }
.tab[aria-selected="true"] .step { color: var(--accent); }
.step.done { color: var(--ok); }
.step .i { width: 14px; height: 14px; stroke-width: 2.5; }
.badge { font-size: 12.5px; font-weight: 400; color: var(--ink-3); }
.badge.warn { color: var(--warn); font-weight: 500; }
.badge.bad { color: var(--bad); font-weight: 500; }
.badge.ok { color: var(--ok); }

/* Body */
.body { flex: 1; min-height: 0; overflow: auto; padding: 20px 24px 28px; background: var(--bg); overscroll-behavior: contain; }
.body.fill { display: flex; flex-direction: column; overflow: hidden; padding-bottom: 16px; }
.stack > * + * { margin-top: 24px; }

.hint { color: var(--ink-3); font-size: 13px; }
h3 + .hint { margin-top: 2px; }
.muted { color: var(--ink-3); }
.small { font-size: 12px; }
.row { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }
.spacer { flex: 1; }
.fine { color: var(--ink-3); font-size: 12.5px; max-width: 72ch; }

.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.summary { border-top: 1px solid var(--line); padding-top: 20px; }

/* Settings: heading on the left, controls on the right, sections divided by rules. */
.settings.stack > * + * { margin-top: 0; }
.settings > .banner { margin-bottom: 16px; }
.settings > .card { display: flow-root; padding: 22px 0 24px 232px; border-top: 1px solid var(--line-2); }
.settings > .card:first-of-type { border-top: 0; padding-top: 2px; }
.settings > .card > .card-head { display: block; float: left; width: 200px; margin: 0 0 0 -232px; }
.settings > .card > .card-head .btn { margin-top: 6px; }
.settings > .card > .card-head .btn-link { margin-left: -2px; }
.settings > .card > :not(.card-head) + :not(.card-head) { margin-top: 14px; }
@media (max-width: 900px) {
  .settings > .card { padding-left: 0; }
  .settings > .card > .card-head { float: none; width: auto; margin: 0 0 12px; }
}

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px 16px; }
.grid.two { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
fieldset.field { border: 0; padding: 0; margin: 0; }
fieldset.field > legend { padding: 0; margin-bottom: 4px; }
.lbl { font-size: 13px; font-weight: 500; color: var(--ink-2); }
.req { color: var(--bad); margin-left: 2px; }
.field .hint { font-size: 12px; }
.time-pair { display: flex; align-items: center; gap: 6px; }
.time-pair input { flex: 1; min-width: 0; }

select, input[type="text"], input[type="time"], input[type="date"], input[type="number"], textarea {
  background: #fff; border: 1px solid var(--field); border-radius: 3px;
  padding: 6px 8px; min-height: 34px; width: 100%; color: var(--ink);
}
textarea { resize: vertical; line-height: 1.45; }
textarea.mono { font-size: 13px; }
:is(select, textarea, input:not([type="checkbox"], [type="radio"], [type="file"])):focus {
  outline: none; border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent);
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
:is(select, textarea, input:not([type="checkbox"], [type="radio"], [type="file"])):focus-visible { outline: none; }
input[type="checkbox"], input[type="radio"] { width: 16px; height: 16px; margin: 0; flex: none; }
.check { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; padding: 3px 0; }
.check input { margin-top: 2px; }

/* Buttons */
.btn {
  appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  font-weight: 500; border-radius: 4px; padding: 6px 14px; min-height: 34px;
  border: 1px solid transparent; cursor: pointer; white-space: nowrap; text-decoration: none; line-height: 1.2;
  transition: background-color 0.12s, border-color 0.12s, color 0.12s;
}
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn-secondary { background: #fff; color: var(--ink); border-color: var(--field); }
.btn-secondary:hover { background: var(--bg-2); }
.btn-danger { background: #fff; color: var(--bad); border-color: var(--bad-line); }
.btn-danger:hover { background: var(--bad-soft); border-color: var(--bad); }
.btn-link {
  background: none; color: var(--accent-ink); padding-inline: 2px;
  text-decoration: underline; text-decoration-color: #a9b8d8; text-decoration-thickness: 1px; text-underline-offset: 3px;
}
.btn-link:hover { text-decoration-color: currentColor; }
.btn-sm { min-height: 28px; padding: 3px 10px; font-size: 13px; }
.btn-link.btn-sm { padding-inline: 2px; }
.btn[disabled], .btn[disabled]:hover { cursor: not-allowed; background: var(--bg-2); border-color: var(--line); color: var(--ink-4); }
.btn-link[disabled], .btn-link[disabled]:hover { background: none; border-color: transparent; text-decoration: none; }
@media (prefers-reduced-motion: reduce) { .btn { transition: none; } }

/* Data step: the paste target is drawn as an empty sheet. */
.drop > h3 { font-size: 16px; }
.drop > .hint { margin-top: 4px; line-height: 1.7; }
.sheet {
  --col: 120px; --row: 28px; --gutter: 36px; --head: 22px;
  position: relative; margin-top: 14px; overflow: hidden; background: #fff;
  display: grid; grid-template-columns: var(--gutter) minmax(0, 1fr); grid-template-rows: var(--head) auto;
  border: 1px solid var(--field); border-radius: 3px;
}
.sheet-cols, .sheet-rows { background: var(--bg-2); color: var(--ink-3); font-size: 11px; line-height: 1; user-select: none; }
.sheet-cols { grid-column: 1 / -1; display: grid; grid-template-columns: var(--gutter) repeat(12, var(--col)); border-bottom: 1px solid var(--line); }
.sheet-rows { grid-column: 1; grid-row: 2; display: grid; grid-auto-rows: var(--row); border-right: 1px solid var(--line); }
.sheet-cols span, .sheet-rows span { display: grid; place-items: center; }
.sheet-cols span { border-right: 1px solid var(--line); }
.sheet-rows span { border-bottom: 1px solid var(--line); }
.sheet .paste {
  grid-column: 2; grid-row: 2; display: block; width: 100%; min-height: 0; height: calc(var(--row) * 6);
  border: 0; border-radius: 0; padding: 0 6px; resize: none; overflow: hidden;
  font-size: 13px; line-height: var(--row); caret-color: var(--accent);
  background-color: #fff;
  background-image: linear-gradient(to right, var(--line-2) 1px, transparent 1px), linear-gradient(to bottom, var(--line-2) 1px, transparent 1px);
  background-size: var(--col) var(--row);
  background-position: calc(var(--col) - 1px) calc(var(--row) - 1px);
}
.sheet .paste:focus { box-shadow: none; }
.sheet .paste::placeholder { color: var(--ink-3); }
/* Focus looks like a spreadsheet's active cell: A1 outlined, its row and column headers marked. */
.sheet::after {
  content: ""; position: absolute; left: var(--gutter); top: var(--head); width: var(--col); height: var(--row);
  box-shadow: inset 0 0 0 2px var(--accent); pointer-events: none; display: none;
}
.sheet:focus-within { border-color: var(--accent); }
.sheet:focus-within::after { display: block; }
.sheet:focus-within .sheet-cols span:nth-child(2), .sheet:focus-within .sheet-rows span:first-child {
  background: var(--accent-soft); color: var(--accent-ink); font-weight: 600;
}
.drop.over .sheet { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.drop.over .paste { background-color: var(--accent-soft); }
.drop-actions { margin-top: 12px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }

/* Tables */
.table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 3px; background: #fff; }
.fill .table-wrap { flex: 1; min-height: 0; }
table.t { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
table.t th {
  position: sticky; top: 0; z-index: 1; background: var(--bg-2); text-align: left;
  font-weight: 600; color: var(--ink-2); font-size: 12px; padding: 7px 10px; border-bottom: 1px solid var(--line); white-space: nowrap;
}
table.t th + th { box-shadow: inset 1px 0 0 var(--line-2); }
table.t td { padding: 9px 10px; border-bottom: 1px solid var(--line-2); vertical-align: top; }
table.t tbody tr:last-child > * { border-bottom: 0; }
table.form-t td, table.form-t th { vertical-align: middle; padding-block: 6px; }
table.t tbody tr:hover td { background: #fafaf8; }
table.t tr.off td { color: var(--ink-3); }
table.t tr.off td .ket strong { color: var(--ink-2); }
table.t .c-check { width: 36px; padding-right: 0; }
table.t .nowrap { white-space: nowrap; }
table.t th.rowhead { position: static; background: none; font-weight: 500; font-size: 13px; color: var(--ink); white-space: normal; box-shadow: none; border-bottom-color: var(--line-2); }
table.sheet-t td + td { box-shadow: inset 1px 0 0 var(--line-2); }
.cell-clip { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ket { white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; min-width: 220px; max-width: 420px; }
.ket strong { font-weight: 600; color: var(--ink); }
.preview-table td { white-space: pre-line; }

/* Status: coloured text with a small mark, no pills. */
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--ink-3); }
.dot.ready, .dot.sending { background: var(--accent); }
.dot.warn { background: var(--warn-mark); }
.dot.exists { background: transparent; box-shadow: inset 0 0 0 1.5px var(--ink-4); }
.dot.invalid, .dot.failed { background: var(--bad); }
.dot.done { background: var(--ok); }
.st { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; white-space: nowrap; }
.st .i { width: 14px; height: 14px; stroke-width: 2.5; }
.st .spin { width: 12px; height: 12px; }
.st.ready { color: var(--ink-2); font-weight: 400; }
.st.warn { color: var(--warn); }
.st.exists { color: var(--ink-3); font-weight: 400; }
.st.invalid, .st.failed { color: var(--bad); }
.st.sending { color: var(--accent-ink); }
.st.done { color: var(--ok); }
.msg { font-size: 12px; color: var(--ink-3); margin-top: 3px; max-width: 260px; }
.msg.bad { color: var(--bad); }
.msg.warn { color: var(--warn); }

.toolbar { display: flex; align-items: center; gap: 10px 20px; flex-wrap: wrap; margin-bottom: 12px; }
.counts { display: flex; align-items: center; gap: 4px 18px; flex-wrap: wrap; font-size: 13px; color: var(--ink-2); }
.count { display: inline-flex; align-items: center; gap: 5px; }
.count strong { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.range { display: flex; align-items: center; gap: 8px; }
.range input[type="date"] { width: 150px; min-height: 30px; padding: 3px 6px; font-size: 13px; }

/* Banners */
.banner { padding: 10px 14px; border-left: 3px solid; border-radius: 0 3px 3px 0; font-size: 13px; }
.banner + .banner, .banner + .card, .card + .banner { margin-top: 12px; }
.banner.bad { background: var(--bad-soft); border-color: var(--bad); color: #6e1a13; }
.banner.warn { background: var(--warn-soft); border-color: var(--warn-mark); color: #5c3a06; }
.banner.info { background: var(--accent-soft); border-color: var(--accent); color: #183568; }
.banner.ok { background: var(--ok-soft); border-color: var(--ok); color: #134a2a; }
.banner strong { font-weight: 600; }
.banner ul { margin: 4px 0 0; padding-left: 18px; }
.banner .row { margin-top: 8px; }

/* Template */
.tokens { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tokens .hint { margin-right: 2px; }
.token {
  appearance: none; cursor: pointer; font: 12px/1.6 var(--mono); color: var(--ink-2);
  background: var(--bg-2); border: 1px solid var(--line); border-radius: 3px; padding: 0 6px;
}
.token:hover { border-color: var(--accent); color: var(--accent-ink); background: #fff; }
.example-label { font-size: 12px; color: var(--ink-3); margin-bottom: 4px; }
.example { border-left: 2px solid var(--line); padding: 2px 0 2px 12px; white-space: pre-line; font-size: 13px; }

/* Bukti */
.file-row { display: flex; align-items: center; gap: 12px; padding: 8px; border: 1px solid var(--line); border-radius: 4px; }
.thumb { width: 44px; height: 44px; border-radius: 3px; object-fit: cover; background: var(--bg-2); flex: none; display: grid; place-items: center; color: var(--ink-3); font-size: 20px; }
.file-meta { min-width: 0; flex: 1; }
.file-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Footer */
.foot { display: flex; align-items: center; gap: 12px; padding: 10px 16px 10px 24px; border-top: 1px solid var(--line); background: var(--bg); flex-wrap: wrap; }
.status { flex: 1; min-width: 200px; color: var(--ink-2); font-size: 13px; display: flex; align-items: center; gap: 10px; }
.actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
progress.bar { width: 160px; height: 6px; flex: none; }

/* Spinner */
.spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--accent); animation: alb-spin 0.8s linear infinite; flex: none; }
@keyframes alb-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation-duration: 3s; } }

.empty { max-width: 460px; margin: 48px auto; text-align: center; display: grid; gap: 6px; justify-items: center; color: var(--ink-2); }
.empty .btn { margin-top: 10px; }
.link-list { border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
.link-item {
  appearance: none; display: flex; align-items: center; gap: 16px; width: 100%; padding: 12px 14px;
  border: 0; border-top: 1px solid var(--line-2); background: #fff; text-align: left; cursor: pointer;
}
.link-item:first-child { border-top: 0; }
.link-item:hover { background: var(--bg-2); }
.link-item:focus-visible { outline-offset: -2px; }
.link-text { flex: 1; min-width: 0; font-weight: 500; }
.link-go { color: var(--accent-ink); font-size: 13px; font-weight: 500; }
.link-item:hover .link-go { text-decoration: underline; text-underline-offset: 3px; }

details.adv > summary {
  cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: 8px;
  color: var(--accent-ink); font-weight: 500; padding: 2px 0;
}
details.adv > summary::-webkit-details-marker { display: none; }
details.adv > summary::before {
  content: ""; width: 6px; height: 6px; margin: 0 2px 2px;
  border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg); transition: transform 0.15s;
}
details.adv[open] > summary::before { transform: rotate(45deg); margin-bottom: 4px; }
details.adv .when-open, details.adv[open] .when-closed { display: none; }
details.adv[open] .when-open { display: inline; }
details.adv > .grid { margin-top: 14px; }
details.adv > .row { margin-top: 16px; }
@media (prefers-reduced-motion: reduce) { details.adv > summary::before { transition: none; } }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
`;

  ALB.styles.fab = String.raw`
:host { all: initial; }
button {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
  display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
  font: 600 14px/1 system-ui, "Segoe UI", Roboto, sans-serif; color: #fff;
  background: #1f4590; border: 0; border-radius: 4px; padding: 12px 16px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.18), 0 8px 20px rgb(0 0 0 / 0.16);
}
button:hover { background: #17366f; }
button:focus-visible { outline: 2px solid #1f4590; outline-offset: 3px; }
`;
})(globalThis.ALB);
