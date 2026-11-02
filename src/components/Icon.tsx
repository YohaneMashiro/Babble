type IconName = 'settings' | 'arrow' | 'hint' | 'reset' | 'close' | 'check' | 'info' | 'keyboard' | 'search'
const paths: Record<IconName, React.ReactNode> = {
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  settings: <><path d="m9 4 1-2h4l1 2 2 1 2-.2 2 3-1.2 2v2l1.2 2-2 3-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2-2-3 1.2-2v-2L3 8l2-3 2 .2Z" /><circle cx="12" cy="10" r="3" /></>,
  arrow: <><path d="M5 12h14m-5-5 5 5-5 5" /></>,
  hint: <><path d="M9 18h6m-5 3h4M8.5 14.5a6 6 0 1 1 7 0c-1 1-1 1.5-1 3h-5c0-1.5 0-2-1-3Z" /></>,
  reset: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></>,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 15h10" /></>,
}
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
