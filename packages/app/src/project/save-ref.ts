/**
 * Module-level ref for the saveNow function.
 * Set by useBoardPersistence, called by anyone (Cmd+S handler, editor, etc.)
 */
export const saveRef: { current: (() => void) | null } = { current: null }

/**
 * Module-level ref for reading the live CodeMirror editor content.
 * Set by SketchEditor, read by saveNow to get the latest code.
 */
export const editorContentRef: { current: (() => string) | null } = { current: null }

/**
 * Save flash notification — subscribed to by the toolbar for visual feedback.
 */
let saveFlashListeners = new Set<() => void>()

export function notifySaveFlash() {
  for (const fn of saveFlashListeners) fn()
}

export function onSaveFlash(cb: () => void): () => void {
  saveFlashListeners.add(cb)
  return () => { saveFlashListeners.delete(cb) }
}
