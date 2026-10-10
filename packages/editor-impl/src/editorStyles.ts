// The editor's styles, injected once: colours as variables on :root, the dark scheme by [data-theme] or the system's.

const STYLE_ID = "dm-styles";

const STYLES = `
:root {
  --dm-bg: #f6f7f9; --dm-panel: #ffffff; --dm-panel-alt: #f0f2f5; --dm-border: #dde1e7; --dm-border-strong: #c4cad3;
  --dm-text: #1d2330; --dm-muted: #6b7383; --dm-accent: #2f5bd3; --dm-accent-soft: #e6edfc; --dm-accent-text: #ffffff;
  --dm-danger: #c53030; --dm-danger-soft: #fdecec; --dm-ok: #2f855a; --dm-hover: #f2f5fa; --dm-selected: #dfe8fb; --dm-chosen: #c9d8f8;
  --dm-null: #9aa1ae; --dm-code-bg: #f3f4f7; --dm-shadow: 0 8px 28px rgba(16, 24, 40, .16); --dm-key: #b7791f; --dm-link: #2f5bd3;
  --dm-radius: 6px; --dm-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; --dm-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color-scheme: light;
}
:root[data-theme="dark"] {
  --dm-bg: #15181e; --dm-panel: #1c2028; --dm-panel-alt: #232833; --dm-border: #2f3542; --dm-border-strong: #404858;
  --dm-text: #e3e7ee; --dm-muted: #8c95a5; --dm-accent: #6b93f5; --dm-accent-soft: #263457; --dm-accent-text: #0e1320;
  --dm-danger: #f07070; --dm-danger-soft: #3a2224; --dm-ok: #68c391; --dm-hover: #242a36; --dm-selected: #29365a; --dm-chosen: #34477a;
  --dm-null: #6a7282; --dm-code-bg: #181c23; --dm-shadow: 0 8px 28px rgba(0, 0, 0, .5); --dm-key: #e0b050; --dm-link: #8fb0ff;
  color-scheme: dark;
}
html, body { background: var(--dm-bg); color: var(--dm-text); font: 14px/1.4 var(--dm-font); }
* { box-sizing: border-box; }
button, input, select, textarea { font: inherit; color: inherit; }
.dm-app { height: 100%; display: flex; flex-direction: column; }
.dm-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; padding-top: max(8px, env(safe-area-inset-top)); border-bottom: 1px solid var(--dm-border); background: var(--dm-panel); min-height: 48px; }
.dm-bar-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dm-bar-sub { color: var(--dm-muted); font-size: 12px; white-space: nowrap; }
.dm-spacer { flex: 1; }
.dm-logo { width: 22px; height: 22px; border-radius: 5px; background: var(--dm-accent); color: var(--dm-accent-text); display: grid; place-items: center; font-weight: 700; font-size: 12px; flex: none; }
.dm-button { border: 1px solid var(--dm-border-strong); background: var(--dm-panel); border-radius: var(--dm-radius); padding: 5px 12px; cursor: pointer; white-space: nowrap; }
.dm-button:hover:not(:disabled) { background: var(--dm-hover); }
.dm-button:disabled { opacity: .5; cursor: default; }
.dm-button.dm-primary { background: var(--dm-accent); border-color: var(--dm-accent); color: var(--dm-accent-text); }
.dm-button.dm-primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--dm-accent); }
.dm-button.dm-danger { color: var(--dm-danger); }
.dm-button.dm-danger.dm-primary { background: var(--dm-danger); border-color: var(--dm-danger); color: #fff; }
.dm-icon-button { border: 1px solid transparent; background: none; border-radius: var(--dm-radius); width: 30px; height: 30px; font-size: 16px; cursor: pointer; color: var(--dm-muted); display: inline-grid; place-items: center; flex: none; }
.dm-icon-button:hover:not(:disabled) { background: var(--dm-hover); color: var(--dm-text); border-color: var(--dm-border); }
.dm-icon-button:disabled { opacity: .35; cursor: default; }
.dm-input, .dm-select, .dm-textarea { border: 1px solid var(--dm-border-strong); background: var(--dm-panel); border-radius: var(--dm-radius); padding: 5px 8px; min-width: 0; }
.dm-input:focus, .dm-select:focus, .dm-textarea:focus, .dm-button:focus-visible, .dm-icon-button:focus-visible { outline: 2px solid var(--dm-accent); outline-offset: -1px; }
.dm-textarea { font-family: var(--dm-mono); font-size: 13px; resize: vertical; width: 100%; }
.dm-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; }
.dm-field { display: flex; flex-direction: column; gap: 4px; }
.dm-field-caption { font-size: 12px; color: var(--dm-muted); }
.dm-field-problem { color: var(--dm-danger); font-size: 12px; min-height: 0; }
.dm-field-problem:empty { display: none; }
.dm-invalid { border-color: var(--dm-danger) !important; background: var(--dm-danger-soft) !important; }
.dm-muted { color: var(--dm-muted); }
.dm-mono { font-family: var(--dm-mono); font-size: 13px; }

/* start screen */
.dm-start { flex: 1; overflow: auto; display: flex; justify-content: center; padding: 32px 16px; }
.dm-start-card { width: min(760px, 100%); display: flex; flex-direction: column; gap: 16px; }
.dm-start-head { display: flex; align-items: center; gap: 12px; }
.dm-start-head h1 { margin: 0; font-size: 22px; }
.dm-plugin-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.dm-panel { background: var(--dm-panel); border: 1px solid var(--dm-border); border-radius: 10px; }
.dm-panel-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--dm-border); flex-wrap: wrap; }
.dm-panel-head .dm-design-line { justify-content: flex-start; }
.dm-panel-head h2 { margin: 0; font-size: 15px; }
.dm-db-list { list-style: none; margin: 0; padding: 6px; min-height: 120px; }
.dm-db-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--dm-radius); cursor: pointer; }
.dm-db-item:hover { background: var(--dm-hover); }
.dm-db-item:focus-visible { outline: 2px solid var(--dm-accent); }
.dm-db-name { font-weight: 500; flex: 1; overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
.dm-db-name > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm-db-location { font-weight: 400; font-size: 12px; color: var(--dm-muted); }
.dm-db-icon { color: var(--dm-accent); }
.dm-empty { padding: 28px 16px; text-align: center; color: var(--dm-muted); }
.dm-refusal { margin: 10px; padding: 10px 12px; border-radius: var(--dm-radius); background: var(--dm-danger-soft); color: var(--dm-danger); white-space: pre-wrap; }
.dm-drop-hint { border: 2px dashed var(--dm-accent); background: var(--dm-accent-soft); }
.dm-form-fields { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
.dm-version { color: var(--dm-muted); font-size: 12px; text-align: center; }

/* database screen */
.dm-workspace { flex: 1; display: flex; min-height: 0; position: relative; }
.dm-sidebar { width: var(--dm-sidebar-width, 260px); min-width: 160px; display: flex; flex-direction: column; background: var(--dm-panel); border-right: 1px solid var(--dm-border); min-height: 0; }
.dm-sidebar-head { display: flex; gap: 6px; padding: 8px; border-bottom: 1px solid var(--dm-border); }
.dm-sidebar-head .dm-input { flex: 1; }
.dm-table-list { flex: 1; overflow: auto; padding: 4px 0 12px; }
.dm-list-group { padding: 10px 14px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--dm-muted); }
.dm-table-item { display: flex; align-items: center; gap: 8px; padding: 5px 14px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: none; }
.dm-table-item:hover { background: var(--dm-hover); }
.dm-table-item.dm-chosen { background: var(--dm-selected); font-weight: 600; }
.dm-table-icon { color: var(--dm-muted); flex: none; width: 14px; text-align: center; }
.dm-vsplitter { width: 5px; cursor: col-resize; margin-left: -3px; z-index: 2; flex: none; }
.dm-vsplitter:hover, .dm-hsplitter:hover { background: var(--dm-accent-soft); }
.dm-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.dm-main-top { display: flex; flex-direction: column; min-height: 0; flex: var(--dm-grid-share, 1) 1 0; }
.dm-main-bottom { display: flex; flex-direction: column; min-height: 0; flex: calc(1 - var(--dm-grid-share, 1)) 1 0; border-top: 1px solid var(--dm-border); }
.dm-hsplitter { height: 6px; cursor: row-resize; margin-top: -3px; z-index: 2; flex: none; }
.dm-main.dm-unsplit .dm-main-bottom, .dm-main.dm-unsplit .dm-hsplitter { display: none; }
.dm-main.dm-unsplit .dm-main-top { flex: 1 1 0; }
.dm-table-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--dm-panel); border-bottom: 1px solid var(--dm-border); min-width: 0; }
.dm-table-head .dm-table-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dm-table-title { font-weight: 600; font-size: 15px; }
.dm-back { display: none; }

/* grid */
.dm-grid { display: flex; flex-direction: column; min-height: 0; flex: 1; background: var(--dm-panel); }
.dm-grid:focus { outline: none; }
.dm-tool { padding: 2px 10px; font-size: 12.5px; border-color: var(--dm-border); }
.dm-grid-tools { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-bottom: 1px solid var(--dm-border); flex-wrap: wrap; }
.dm-conditions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--dm-border); }
.dm-conditions:empty { display: none; }
.dm-chip { display: inline-flex; align-items: center; gap: 4px; background: var(--dm-accent-soft); border-radius: 999px; padding: 2px 4px 2px 10px; font-size: 12px; }
.dm-chip button { border: none; background: none; cursor: pointer; color: var(--dm-muted); padding: 0 4px; }
.dm-grid-scroll { flex: 1; overflow: auto; min-height: 0; position: relative; }
.dm-table { border-collapse: separate; border-spacing: 0; min-width: 100%; font-size: 13px; }
.dm-table th { position: sticky; top: 0; z-index: 1; background: var(--dm-panel-alt); border-bottom: 1px solid var(--dm-border-strong); border-right: 1px solid var(--dm-border); padding: 5px 8px; text-align: left; font-weight: 600; white-space: nowrap; cursor: pointer; user-select: none; }
.dm-table th:hover { background: var(--dm-hover); }
.dm-table th .dm-th-type { font-weight: 400; color: var(--dm-muted); font-size: 11px; margin-left: 6px; }
.dm-table th .dm-th-mark { margin-right: 4px; font-size: 11px; }
.dm-th-key { color: var(--dm-key); }
.dm-th-link { color: var(--dm-link); }
.dm-table th.dm-row-head, .dm-table td.dm-row-head { position: sticky; left: 0; z-index: 1; width: 44px; min-width: 44px; text-align: right; color: var(--dm-muted); background: var(--dm-panel-alt); cursor: default; font-weight: 400; font-size: 11px; }
.dm-table th.dm-row-head { z-index: 3; }
.dm-table td { border-bottom: 1px solid var(--dm-border); border-right: 1px solid var(--dm-border); padding: 4px 8px; max-width: 360px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; height: 29px; }
.dm-table tr:hover td { background: var(--dm-hover); }
.dm-table tr.dm-selected td { background: var(--dm-selected); }
.dm-table tr.dm-chosen td { background: var(--dm-chosen); }
.dm-table td.dm-number { text-align: right; font-variant-numeric: tabular-nums; }
.dm-table td.dm-null { color: var(--dm-null); font-style: italic; }
.dm-table td.dm-computed { color: var(--dm-muted); }
.dm-table td.dm-editing { padding: 0; }
.dm-cell-input { width: 100%; height: 28px; border: 2px solid var(--dm-accent); padding: 2px 6px; background: var(--dm-panel); outline: none; font-size: 13px; }
.dm-reference { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; border: 1px solid transparent; border-radius: 4px; background: none; cursor: pointer; padding: 0 4px; margin: -2px -4px; color: var(--dm-link); font-size: 13px; }
.dm-reference:hover { border-color: var(--dm-border-strong); background: var(--dm-panel); }
.dm-reference-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm-reference-caret { color: var(--dm-muted); font-size: 10px; }
.dm-reference-values { color: var(--dm-muted); font-size: 11px; margin-right: 2px; }
.dm-pager { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-top: 1px solid var(--dm-border); font-size: 12px; color: var(--dm-muted); flex-wrap: wrap; }
.dm-grid-message { padding: 32px 16px; text-align: center; color: var(--dm-muted); }

/* tabs */
.dm-tabs { display: flex; gap: 2px; padding: 4px 8px 0; background: var(--dm-panel-alt); border-bottom: 1px solid var(--dm-border); overflow-x: auto; flex: none; }
.dm-tab { border: 1px solid transparent; border-bottom: none; background: none; padding: 6px 12px; border-radius: 6px 6px 0 0; cursor: pointer; white-space: nowrap; color: var(--dm-muted); }
.dm-tab:hover { color: var(--dm-text); }
.dm-tab[aria-selected="true"] { background: var(--dm-panel); border-color: var(--dm-border); color: var(--dm-text); font-weight: 600; margin-bottom: -1px; }
.dm-tab-columns { font-weight: 400; color: var(--dm-muted); font-size: 12px; margin-left: 4px; }
.dm-tabs-caption { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--dm-muted); align-self: center; margin-right: 8px; white-space: nowrap; }

/* menu, popover, toast, dialog */
.dm-menu { position: fixed; z-index: 1000; min-width: 200px; background: var(--dm-panel); border: 1px solid var(--dm-border); border-radius: 8px; box-shadow: var(--dm-shadow); padding: 4px; }
.dm-menu-item { display: flex; gap: 24px; justify-content: space-between; width: 100%; border: none; background: none; text-align: left; padding: 6px 10px; border-radius: 5px; cursor: pointer; white-space: nowrap; }
.dm-menu-item:hover:not(:disabled), .dm-menu-item:focus { background: var(--dm-accent-soft); outline: none; }
.dm-menu-item:disabled { opacity: .45; cursor: default; }
.dm-menu-item.dm-danger { color: var(--dm-danger); }
.dm-menu-shortcut { color: var(--dm-muted); font-size: 12px; }
.dm-popover { position: fixed; z-index: 900; width: min(380px, calc(100vw - 16px)); background: var(--dm-panel); border: 1px solid var(--dm-border); border-radius: 8px; box-shadow: var(--dm-shadow); display: flex; flex-direction: column; max-height: min(440px, 70vh); }
.dm-popover-search { padding: 8px; border-bottom: 1px solid var(--dm-border); display: flex; }
.dm-popover-search .dm-input { flex: 1; }
.dm-popover-list { overflow: auto; padding: 4px; flex: 1; }
.dm-popover-item { display: flex; gap: 8px; align-items: baseline; width: 100%; border: none; background: none; text-align: left; padding: 6px 8px; border-radius: 5px; cursor: pointer; }
.dm-popover-item:hover, .dm-popover-item:focus { background: var(--dm-accent-soft); outline: none; }
.dm-popover-item.dm-current { font-weight: 600; }
.dm-popover-item .dm-popover-key { color: var(--dm-muted); font-size: 12px; margin-left: auto; white-space: nowrap; }
.dm-toasts { position: fixed; z-index: 2000; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; width: min(560px, calc(100vw - 24px)); }
.dm-toast { background: var(--dm-text); color: var(--dm-bg); padding: 9px 14px; border-radius: 8px; box-shadow: var(--dm-shadow); pointer-events: auto; max-width: 100%; white-space: pre-wrap; }
.dm-toast.dm-error { background: var(--dm-danger); color: #fff; }
.dm-dialog { border: 1px solid var(--dm-border); border-radius: 12px; padding: 0; background: var(--dm-panel); color: var(--dm-text); box-shadow: var(--dm-shadow); width: min(520px, calc(100vw - 24px)); max-height: calc(100vh - 32px); }
.dm-dialog.dm-wide { width: min(1080px, calc(100vw - 24px)); }
.dm-dialog::backdrop { background: rgba(10, 14, 22, .45); }
.dm-dialog-body { display: flex; flex-direction: column; max-height: calc(100vh - 34px); }
.dm-dialog-head { display: flex; align-items: center; gap: 8px; padding: 14px 18px; border-bottom: 1px solid var(--dm-border); }
.dm-dialog-head h2 { margin: 0; font-size: 16px; flex: 1; }
.dm-dialog-content { padding: 16px 18px; overflow: auto; display: flex; flex-direction: column; gap: 14px; }
.dm-dialog-foot { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid var(--dm-border); flex-wrap: wrap; }
.dm-dialog-problems { background: var(--dm-danger-soft); color: var(--dm-danger); padding: 8px 12px; border-radius: var(--dm-radius); white-space: pre-wrap; }
.dm-dialog-problems:empty { display: none; }
.dm-code { background: var(--dm-code-bg); border: 1px solid var(--dm-border); border-radius: var(--dm-radius); padding: 10px 12px; font: 12.5px/1.5 var(--dm-mono); white-space: pre-wrap; overflow: auto; margin: 0; max-height: 50vh; }
.dm-warning { background: #fff7e0; color: #7a5300; padding: 8px 12px; border-radius: var(--dm-radius); }
:root[data-theme="dark"] .dm-warning { background: #3a3018; color: #f0d58c; }

/* row form */
.dm-form-grid { display: grid; grid-template-columns: minmax(120px, max-content) 1fr; gap: 10px 14px; align-items: start; }
.dm-form-label { padding-top: 6px; font-weight: 500; word-break: break-word; }
.dm-form-label small { display: block; color: var(--dm-muted); font-weight: 400; font-size: 11px; }
.dm-form-control { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dm-form-row { display: flex; gap: 6px; align-items: center; }
.dm-form-row > .dm-input, .dm-form-row > .dm-textarea { flex: 1; }
.dm-reference-group { border: 1px solid var(--dm-border); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; background: var(--dm-panel-alt); }
.dm-reference-group-head { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.dm-reference-group-title { font-size: 12px; color: var(--dm-muted); }

/* table designer */
.dm-section { display: flex; flex-direction: column; gap: 8px; }
.dm-section-head { display: flex; align-items: center; gap: 8px; }
.dm-section-head h3 { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--dm-muted); flex: 1; }
.dm-design-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dm-design-table th { text-align: left; font-weight: 500; color: var(--dm-muted); font-size: 12px; padding: 4px; white-space: nowrap; }
.dm-design-table td { padding: 3px 4px; vertical-align: top; }
.dm-design-table .dm-input, .dm-design-table .dm-select { width: 100%; }
.dm-design-table .dm-generated { display: flex; gap: 4px; }
.dm-design-table .dm-generated .dm-input { min-width: 140px; }
.dm-design-table .dm-generated .dm-select { width: auto; flex: none; }
.dm-design-item { border: 1px solid var(--dm-border); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: var(--dm-panel-alt); }
.dm-design-line { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dm-design-line > .dm-input, .dm-design-line > .dm-select { flex: 1; min-width: 120px; }
.dm-pairs { display: flex; flex-direction: column; gap: 4px; }
.dm-pair { display: flex; gap: 6px; align-items: center; }
.dm-pair .dm-select, .dm-pair .dm-input { flex: 1; }
.dm-options { display: flex; gap: 16px; flex-wrap: wrap; }
.dm-violations { margin: 0; padding-left: 18px; }

@media (max-width: 720px) {
  .dm-sidebar { position: absolute; inset: 0; width: 100%; z-index: 5; border-right: none; }
  .dm-workspace.dm-showing-table .dm-sidebar { display: none; }
  .dm-workspace:not(.dm-showing-table) .dm-main { display: none; }
  .dm-vsplitter { display: none; }
  .dm-back { display: inline-grid; }
  .dm-form-grid { grid-template-columns: 1fr; }
  .dm-form-label { padding-top: 0; }
  .dm-hide-narrow { display: none; }
  .dm-start { padding: 16px 12px; }
}
@media (pointer: coarse) { .dm-menu-shortcut { display: none; } }
`;

export const installEditorStyles = (document: Document): void => {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.append(style);
};
