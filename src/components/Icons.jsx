// Ícones de linha fina dourados — estilo Do Luxo à Mesa
// O ouro segue o tema; nas rotas públicas (sem o atributo do tema) e
// dentro de .papel o var() resolve no mesmo #C9A84C de sempre.
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'var(--ouro)',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export const IconUser = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
  </svg>
)

export const IconPhone = () => (
  <svg {...base}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" />
  </svg>
)

export const IconMail = () => (
  <svg {...base}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
)

export const IconPin = () => (
  <svg {...base}>
    <path d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
)

export const IconCalendar = () => (
  <svg {...base}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </svg>
)

export const IconClock = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const IconVenue = () => (
  <svg {...base}>
    <path d="M3 21h18M5 21V8l7-5 7 5v13" />
    <path d="M9 21v-6h6v6" />
  </svg>
)

export const IconGuests = () => (
  <svg {...base}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
    <path d="M16 8.5a3 3 0 100-6M21 20c0-2.6-1.8-4.4-4.5-4.9" />
  </svg>
)

export const IconWrench = () => (
  <svg {...base}>
    <path d="M14.7 6.3a4.5 4.5 0 00-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 006-6l-3 3-3-3 3-3z" />
  </svg>
)

export const IconAlarm = () => (
  <svg {...base}>
    <circle cx="12" cy="13" r="7" />
    <path d="M12 10v3l2 1.5M5 4L3 6M19 4l2 2" />
  </svg>
)

export const IconTruck = () => (
  <svg {...base}>
    <rect x="2" y="7" width="12" height="9" rx="1" />
    <path d="M14 10h4l3 3v3h-3" />
    <circle cx="7" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </svg>
)

export const IconChat = () => (
  <svg {...base}>
    <path d="M21 12a8 8 0 01-8 8H4l2-3a8 8 0 1115-5z" />
  </svg>
)

export const IconTable = () => (
  <svg {...base}>
    <ellipse cx="12" cy="7" rx="9" ry="3" />
    <path d="M5 9v8M19 9v8M12 10v9" />
  </svg>
)

export const IconShape = () => (
  <svg {...base}>
    <rect x="4" y="4" width="7" height="7" rx="1" />
    <circle cx="16.5" cy="16.5" r="4" />
  </svg>
)

export const IconPen = () => (
  <svg {...base}>
    <path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" />
  </svg>
)

export const IconKey = () => (
  <svg {...base}>
    <circle cx="8" cy="15" r="4.5" />
    <path d="M11.5 11.5L21 2M16 7l3 3" />
  </svg>
)

export const IconLock = () => (
  <svg {...base}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </svg>
)

// Mapa de nomes → componentes
export const ICONS = {
  user: IconUser,
  phone: IconPhone,
  mail: IconMail,
  pin: IconPin,
  calendar: IconCalendar,
  clock: IconClock,
  venue: IconVenue,
  guests: IconGuests,
  wrench: IconWrench,
  alarm: IconAlarm,
  truck: IconTruck,
  chat: IconChat,
  table: IconTable,
  shape: IconShape,
  pen: IconPen,
  key: IconKey,
  lock: IconLock,
}