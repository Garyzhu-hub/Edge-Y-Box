import type { AlarmRecord } from '@/components/alarms/AlarmDetailDialog.vue'
import type { EvidenceRuleHit, StructuredDetection } from '@/components/evidence/EvidencePanel.vue'
import { patchAlarmRecordByDetectionId } from '@/utils/alarmRecordsStore'

export type WorkOrderStatus = '异常' | '已恢复' | '已关闭' | '误报关闭'
export type AlarmLevel = '一般' | '警告' | '严重' | '紧急'

export type FalseAlarmReason =
  | '算法错误'
  | '画框范围错误'
  | '摄像头角度问题'
  | '算法配置有误'
  | '异常为恢复'
  | '未交付'
  | '无需监控该场景'
  | '未达到异常时限'

export type WorkOrderActionLog = {
  tsMs: number
  actor: string
  action: string
  note: string
}

export type WorkOrder = {
  id: string
  status: WorkOrderStatus
  level: AlarmLevel
  alarmType: string
  cameraLabel: string
  falseAlarmReason?: FalseAlarmReason
  createdAtMs: number
  updatedAtMs: number
  restoredAtMs?: number
  closedAtMs?: number
  detectionId: string
  sourceUrl: string
  analyzedUrl: string
  restoredUrl?: string
  structured: StructuredDetection[]
  hits: EvidenceRuleHit[]
  logs: WorkOrderActionLog[]
}

const STORAGE_KEY = 'edge_work_orders_v1'

function mulberry32(seed: number) {
  let s = seed | 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function nowIdSeed() {
  const d = new Date()
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}

export function loadWorkOrders(): WorkOrder[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as WorkOrder[]) : []
  } catch {
    return []
  }
}

export function saveWorkOrders(list: WorkOrder[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

export function getWorkOrderById(id: string): WorkOrder | null {
  const list = loadWorkOrders()
  return list.find((x) => x.id === id) ?? null
}

export function upsertWorkOrder(order: WorkOrder) {
  const list = loadWorkOrders()
  const idx = list.findIndex((x) => x.id === order.id)
  if (idx >= 0) list[idx] = order
  else list.unshift(order)
  saveWorkOrders(list)
}

export function updateWorkOrderStatus(params: {
  workOrderId: string
  nextStatus: WorkOrderStatus
  actor: string
  note: string
}) {
  const list = loadWorkOrders()
  const idx = list.findIndex((x) => x.id === params.workOrderId)
  if (idx < 0) return
  const now = Date.now()

  const prev = list[idx]
  const closedAtMs = params.nextStatus === '异常' ? undefined : now
  const restoredAtMs = params.nextStatus === '已恢复' ? now : prev.restoredAtMs
  const next: WorkOrder = {
    ...prev,
    status: params.nextStatus,
    updatedAtMs: now,
    closedAtMs,
    restoredAtMs,
    logs: [
      {
        tsMs: now,
        actor: params.actor,
        action: `状态变更：${prev.status} → ${params.nextStatus}`,
        note: params.note,
      },
      ...(prev.logs || []),
    ],
  }
  list[idx] = next
  saveWorkOrders(list)

  patchAlarmRecordByDetectionId({
    detectionId: next.detectionId,
    patch: { status: params.nextStatus === '异常' ? '异常' : '恢复', workOrderId: next.id },
  })
}

function mockImage(prompt: string) {
  const encoded = encodeURIComponent(
    `SDXL, professional surveillance snapshot, ${prompt}, realistic CCTV, high detail, sharp, documentary, neutral colors`
  )
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encoded}&image_size=landscape_4_3`
}

export function markFalseAlarm(params: {
  workOrderId: string
  reason: FalseAlarmReason
  actor: string
  note?: string
}) {
  const list = loadWorkOrders()
  const idx = list.findIndex((x) => x.id === params.workOrderId)
  if (idx < 0) return
  const now = Date.now()
  const prev = list[idx]
  const next: WorkOrder = {
    ...prev,
    status: '误报关闭',
    falseAlarmReason: params.reason,
    updatedAtMs: now,
    closedAtMs: now,
    restoredAtMs: now,
    logs: [
      {
        tsMs: now,
        actor: params.actor,
        action: `误告关闭：${params.reason}`,
        note: params.note || '',
      },
      ...(prev.logs || []),
    ],
  }
  list[idx] = next
  saveWorkOrders(list)

  patchAlarmRecordByDetectionId({
    detectionId: next.detectionId,
    patch: { status: '恢复', workOrderId: next.id },
  })
}

export function recheckWorkOrder(params: { workOrderId: string; actor: string }) {
  const list = loadWorkOrders()
  const idx = list.findIndex((x) => x.id === params.workOrderId)
  if (idx < 0) return { ok: false, message: '未找到工单' }
  const prev = list[idx]
  const now = Date.now()

  const recovered = Math.random() > 0.45
  const restoredUrl = recovered
    ? mockImage(`recovered snapshot, work order ${prev.id}, scene ${prev.alarmType}, camera ${prev.cameraLabel}`)
    : undefined

  const next: WorkOrder = {
    ...prev,
    status: recovered ? '已恢复' : prev.status,
    updatedAtMs: now,
    restoredAtMs: recovered ? now : prev.restoredAtMs,
    closedAtMs: recovered ? now : prev.closedAtMs,
    restoredUrl: recovered ? restoredUrl : prev.restoredUrl,
    logs: [
      {
        tsMs: now,
        actor: params.actor,
        action: '再次检测',
        note: recovered ? '检测正常，工单自动恢复（演示）' : '仍为异常（演示）',
      },
      ...(prev.logs || []),
    ],
  }
  list[idx] = next
  saveWorkOrders(list)

  if (recovered) {
    patchAlarmRecordByDetectionId({
      detectionId: next.detectionId,
      patch: { status: '恢复', workOrderId: next.id },
    })
  }
  return { ok: true, recovered }
}

export function simulatePatrolAutoRecover(params: { actor: string; maxCount?: number }) {
  const list = loadWorkOrders()
  const now = Date.now()
  const max = params.maxCount ?? 3
  let changed = 0

  const nextList: WorkOrder[] = list.map((wo) => {
    if (changed >= max) return wo
    if (wo.status !== '异常') return wo
    const ageMin = (now - wo.createdAtMs) / 60000
    if (ageMin < 3) return wo
    const recovered = Math.random() > 0.7
    if (!recovered) return wo
    changed += 1
    const next: WorkOrder = {
      ...wo,
      status: '已恢复',
      updatedAtMs: now,
      restoredAtMs: now,
      closedAtMs: now,
      restoredUrl: mockImage(`auto patrol recovered snapshot, work order ${wo.id}, scene ${wo.alarmType}, camera ${wo.cameraLabel}`),
      logs: [
        {
          tsMs: now,
          actor: params.actor,
          action: '巡检恢复',
          note: '定时巡检检测正常，系统判定恢复（演示）',
        },
        ...(wo.logs || []),
      ],
    }
    return next
  })

  saveWorkOrders(nextList)
  if (changed) {
    for (const wo of nextList) {
      if (wo.status !== '已恢复') continue
      if (wo.updatedAtMs !== now) continue
      patchAlarmRecordByDetectionId({ detectionId: wo.detectionId, patch: { status: '恢复', workOrderId: wo.id } })
    }
  }
  return { changed }
}

export function recoverWorkOrdersByCamera(params: { cameraLabel: string; alarmTypes?: string[]; actor: string; note: string }) {
  const list = loadWorkOrders()
  const now = Date.now()
  const types = params.alarmTypes ? new Set(params.alarmTypes) : null
  let changed = 0

  const nextList = list.map((wo) => {
    if (wo.status !== '异常') return wo
    if (wo.cameraLabel !== params.cameraLabel) return wo
    if (types && !types.has(wo.alarmType)) return wo
    changed += 1
    const next: WorkOrder = {
      ...wo,
      status: '已恢复',
      updatedAtMs: now,
      restoredAtMs: now,
      closedAtMs: now,
      restoredUrl: mockImage(`deployment patrol recovered snapshot, work order ${wo.id}, scene ${wo.alarmType}, camera ${wo.cameraLabel}`),
      logs: [
        {
          tsMs: now,
          actor: params.actor,
          action: '巡检恢复',
          note: params.note,
        },
        ...(wo.logs || []),
      ],
    }
    patchAlarmRecordByDetectionId({ detectionId: next.detectionId, patch: { status: '恢复', workOrderId: next.id } })
    return next
  })

  if (changed) saveWorkOrders(nextList)
  return { changed }
}

export function abnormalDurationMs(wo: WorkOrder, nowMs = Date.now()) {
  const end = wo.status === '异常' ? nowMs : wo.closedAtMs ?? wo.updatedAtMs
  return Math.max(0, end - wo.createdAtMs)
}

export function createWorkOrderFromAlarm(params: { alarm: AlarmRecord; actor: string; note?: string }) {
  const list = loadWorkOrders()

  const existing = list.find(
    (x) => x.status === '异常' && x.cameraLabel === params.alarm.cameraLabel && x.alarmType === params.alarm.alarmType
  )
  if (existing) {
    const now = Date.now()
    const next: WorkOrder = {
      ...existing,
      updatedAtMs: now,
      logs: [
        {
          tsMs: now,
          actor: params.actor,
          action: '告警去重',
          note: params.note || `同一摄像头+同一场景持续异常，复用工单（由报警 ${params.alarm.id} 触发）`,
        },
        ...(existing.logs || []),
      ],
    }
    const idx = list.findIndex((x) => x.id === existing.id)
    list[idx] = next
    saveWorkOrders(list)
    patchAlarmRecordByDetectionId({ detectionId: next.detectionId, patch: { workOrderId: next.id, status: '异常' } })
    return next
  }

  const rand = mulberry32(Number(nowIdSeed().slice(-8)) ^ (list.length + 1))
  const id = `WO-${String(10000 + Math.floor(rand() * 90000)).padStart(5, '0')}`
  const now = Date.now()
  const order: WorkOrder = {
    id,
    status: '异常',
    level: params.alarm.level,
    alarmType: params.alarm.alarmType,
    cameraLabel: params.alarm.cameraLabel,
    createdAtMs: now,
    updatedAtMs: now,
    detectionId: params.alarm.detectionId,
    sourceUrl: params.alarm.sourceUrl,
    analyzedUrl: params.alarm.analyzedUrl,
    structured: params.alarm.structured as StructuredDetection[],
    hits: params.alarm.hits as EvidenceRuleHit[],
    logs: [
      {
        tsMs: now,
        actor: params.actor,
        action: '创建工单',
        note: params.note || `由报警 ${params.alarm.id} 生成`,
      },
    ],
  }
  list.unshift(order)
  saveWorkOrders(list)
  patchAlarmRecordByDetectionId({ detectionId: order.detectionId, patch: { workOrderId: order.id, status: '异常' } })
  return order
}
