import type { AlarmRecord } from '@/components/alarms/AlarmDetailDialog.vue'

const STORAGE_KEY = 'edge_alarm_records_v1'
const DELETED_KEY = 'edge_alarm_record_deleted_ids_v1'

export function loadAlarmRecords(): AlarmRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AlarmRecord[]) : []
  } catch {
    return []
  }
}

export function saveAlarmRecords(list: AlarmRecord[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

export function appendAlarmRecord(record: AlarmRecord) {
  const list = loadAlarmRecords()
  const byId = new Map(list.map((r) => [r.id, r]))
  byId.set(record.id, record)
  const merged = Array.from(byId.values()).sort((a, b) => b.alarmTimeMs - a.alarmTimeMs)
  saveAlarmRecords(merged.slice(0, 500))
}

export function patchAlarmRecordByDetectionId(params: {
  detectionId: string
  patch: Partial<Pick<AlarmRecord, 'workOrderId' | 'status'>>
}) {
  const detectionId = params.detectionId
  if (!detectionId) return false
  const list = loadAlarmRecords()
  let changed = false
  const next = list.map((r) => {
    if (r.detectionId !== detectionId && r.id !== detectionId) return r
    changed = true
    return { ...r, ...params.patch }
  })
  if (changed) saveAlarmRecords(next)
  return changed
}

export function loadDeletedAlarmRecordIds() {
  try {
    const raw = window.localStorage.getItem(DELETED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x) => typeof x === 'string')
  } catch {
    return []
  }
}

function saveDeletedAlarmRecordIds(ids: string[]) {
  try {
    window.localStorage.setItem(DELETED_KEY, JSON.stringify(ids))
  } catch {
    return
  }
}

export function removeAlarmRecordsByIds(ids: string[]) {
  if (!Array.isArray(ids) || !ids.length) return 0
  const idSet = new Set(ids.filter(Boolean))
  if (!idSet.size) return 0
  const current = loadAlarmRecords()
  const next = current.filter((x) => !idSet.has(x.id) && !idSet.has(x.detectionId))
  if (next.length !== current.length) saveAlarmRecords(next)

  const deleted = new Set(loadDeletedAlarmRecordIds())
  for (const id of idSet) deleted.add(id)
  saveDeletedAlarmRecordIds(Array.from(deleted).slice(-2000))

  return idSet.size
}
