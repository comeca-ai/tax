const STORAGE_KEY = "activeCompanyId"
const EVENT = "reembolsa:active-company"
let memoryId: number | null = null
let memoryOnly = false

export function parseCompanyId(value: string | null): number | null {
  if (!value?.trim()) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function getActiveCompanyId(): number | null {
  if (memoryOnly) return memoryId
  try { return parseCompanyId(window.localStorage.getItem(STORAGE_KEY)) }
  catch { return memoryId }
}

export function subscribeCompany(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener()
  }
  window.addEventListener(EVENT, listener)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function selectCompany(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return
  memoryId = id
  try { window.localStorage.setItem(STORAGE_KEY, String(id)); memoryOnly = false }
  catch { memoryOnly = true }
  window.dispatchEvent(new Event(EVENT))
}
