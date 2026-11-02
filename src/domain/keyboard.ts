/** Keep browser event filtering independent of the React components. */
export function shouldHandleTrainingKey(event: {
  key: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  isComposing: boolean
  repeat?: boolean
}, editable: boolean, blocked: boolean): boolean {
  if (editable || blocked || event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.repeat) return false
  return /^[a-z]$/i.test(event.key) || [' ', 'Enter', 'Backspace'].includes(event.key)
}
