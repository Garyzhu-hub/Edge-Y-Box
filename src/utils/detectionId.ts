const STORAGE_KEY = 'edge_detection_seq_v1'

type SeqMap = Record<string, number>

function loadSeq(): SeqMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as SeqMap) : {}
  } catch {
    return {}
  }
}

function saveSeq(map: SeqMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    return
  }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatYMD(d: Date) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

export function nextDetectionId(now = new Date(), bizSeq = '02') {
  const ymd = formatYMD(now)
  const map = loadSeq()
  const key = `${ymd}-${bizSeq}`
  const next = (map[key] || 0) + 1
  map[key] = next
  saveSeq(map)
  return `patrol-${ymd}-${bizSeq}-${String(next).padStart(7, '0')}`
}

