// The route editor's controls beside its handles (views/routes.js): the bar on the map (undo, redo,
// back to start, clear; routes-ui.js toolsTpl) and the undo / redo shortcuts, for whichever editor
// (views/routes-edit.js) is on screen.

const isTyping = t => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

/**
 * The bar on the map (undo, redo, back to start, clear; routes-ui.js toolsTpl) and Ctrl/⌘+Z,
 * Ctrl/⌘+Shift+Z or Ctrl+Y, for whichever editor getEditor() says is on screen. Shortcuts are left
 * alone inside a text field, where they undo typing. Returns { sync(withClear), dispose() }.
 */
export function bindEditTools(root, getEditor) {
  const $ = sel => root.querySelector(sel);
  const tool = (sel, fn) => $(sel).addEventListener('click', e => {
    const ed = getEditor();
    if (ed && e.currentTarget.getAttribute('aria-disabled') !== 'true') fn(ed);
  });
  tool('#rt-undo', ed => ed.undo());
  tool('#rt-redo', ed => ed.redo());
  tool('#rt-loop', ed => ed.setLoop(!ed.state.loop));
  tool('#rt-clear', ed => ed.clear());
  const onKey = e => {
    const ed = getEditor();
    if (!ed || !(e.ctrlKey || e.metaKey) || e.altKey || isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); ed.undo(); }
    else if (k === 'z' || k === 'y') { e.preventDefault(); ed.redo(); }
  };
  document.addEventListener('keydown', onKey);
  return {
    // aria-disabled rather than disabled: the button pressed for the last undo keeps keyboard focus.
    sync(withClear) {
      const ed = getEditor();
      $('#rt-tools').hidden = !ed;
      if (!ed) return;
      const v = ed.state;
      $('#rt-undo').setAttribute('aria-disabled', String(!v.canUndo));
      $('#rt-redo').setAttribute('aria-disabled', String(!v.canRedo));
      $('#rt-loop').setAttribute('aria-pressed', String(v.loop));
      $('#rt-clear').hidden = !withClear;
      $('#rt-clear').setAttribute('aria-disabled', String(v.handles.length < 2));
    },
    dispose() { document.removeEventListener('keydown', onKey); },
  };
}
