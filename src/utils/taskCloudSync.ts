import type { SnapshotTask, TaskRun, DeviceRun, ResultCode, SyncResult } from '@/utils/tasksMock'
import type { TreeNode } from '@/utils/devicesCamerasMock'
import type { Camera } from '@/components/devices/CameraFormDialog.vue'
import { appendManualLog } from '@/utils/logsMock'

type PersistedCloud = {
  mqtt: { enabled: boolean; host: string; port: number; username: string; clientId: string; topic: string; secretConfigured: boolean }
  oss: { enabled: boolean; endpoint: string; bucket: string; region: string; accessKeyId: string; secretConfigured: boolean }
}

const CLOUD_KEY = 'edge_cloud_integrations_v1'
const TASKS_KEY = 'edge_tasks_v1'
const TASK_RUNS_KEY = 'edge_task_runs_v1'
const DEVICE_RUNS_KEY = 'edge_device_runs_v1'
const CAMERAS_KEY = 'edge_cameras_v1'
const GROUPS_KEY = 'edge_camera_groups_v1'
const CLOUD_TASK_INBOX_KEY = 'edge_cloud_mqtt_task_inbox_v1'
const CLOUD_TASK_ACK_OUTBOX_KEY = 'edge_cloud_mqtt_task_ack_outbox_v1'
const CLOUD_OSS_UPLOAD_LOG_KEY = 'edge_cloud_oss_upload_log_v1'
const CLOUD_RESULT_REPORT_LOG_KEY = 'edge_cloud_mqtt_result_report_log_v1'
const CLOUD_REPORTED_IDS_KEY = 'edge_cloud_reported_device_run_ids_v1'

function loadCloud(): PersistedCloud | null {
  try {
    const raw = window.localStorage.getItem(CLOUD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as PersistedCloud
  } catch {
    return null
  }
}

export function cloudStatus() {
  const cloud = loadCloud()
  const mqttReady = !!(
    cloud?.mqtt?.enabled &&
    cloud.mqtt.host &&
    cloud.mqtt.port &&
    cloud.mqtt.username &&
    cloud.mqtt.clientId &&
    cloud.mqtt.topic &&
    cloud.mqtt.secretConfigured
  )
  const ossReady = !!(
    cloud?.oss?.enabled &&
    cloud.oss.endpoint &&
    cloud.oss.bucket &&
    cloud.oss.region &&
    cloud.oss.accessKeyId &&
    cloud.oss.secretConfigured
  )
  return { mqttReady, ossReady }
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJson<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

function flattenTree(nodes: TreeNode[], out: { id: string; label: string }[] = []) {
  for (const n of nodes) {
    out.push({ id: n.id, label: n.label })
    if (n.children) flattenTree(n.children, out)
  }
  return out
}

function makeId(prefix: string) {
  const n = Math.floor(10000 + Math.random() * 90000)
  return `${prefix}-${String(n).padStart(5, '0')}`
}

function pick<T>(list: T[]) {
  return list[Math.floor(Math.random() * Math.max(1, list.length))]
}

function addCloudLog(key: string, row: Record<string, unknown>) {
  const list = loadJson<Record<string, unknown>[]>(key, [])
  list.unshift(row)
  saveJson(key, list.slice(0, 500))
}

function loadReportedIds() {
  const list = loadJson<string[]>(CLOUD_REPORTED_IDS_KEY, [])
  return new Set(Array.isArray(list) ? list.filter(Boolean) : [])
}

function saveReportedIds(ids: Set<string>) {
  saveJson(CLOUD_REPORTED_IDS_KEY, Array.from(ids).slice(-5000))
}

function cloudPath(params: { bucket: string; taskId: string; runId: string; deviceId: string; tsMs: number }) {
  const d = new Date(params.tsMs)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `oss://${params.bucket}/edge-ybox/${y}${m}${day}/${params.taskId}/${params.runId}/${params.deviceId}.jpg`
}

function buildIncomingCloudTasks(params: {
  count: number
  groups: { id: string; label: string }[]
  cameras: Camera[]
  now: number
}) {
  const { count, groups, cameras, now } = params
  return Array.from({ length: count }).map((_, i): SnapshotTask => {
    const group = groups.length ? pick(groups) : { id: 'a-l1', label: '默认分组' }
    const cameraPool = cameras.filter((c) => c.groupId === group.id)
    const deviceIds = (cameraPool.length ? cameraPool : cameras).slice(0, 6).map((c) => c.id)
    const id = `TASK-SNAP-${makeId('CLD')}`
    const planType = Math.random() > 0.5 ? '周计划' : '假日计划'
    const weekPlan = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
    if (planType === '周计划') weekPlan.mon = [{ start: '09:00', end: '18:00' }]
    const holidayPlan =
      planType === '假日计划'
        ? [{ date: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), slots: [{ start: '10:00', end: '16:00' }] }]
        : []

    return {
      id,
      name: `云端下发抓图-${group.label}-${i + 1}`,
      groupId: group.id,
      groupLabel: group.label,
      deviceIds,
      deviceCount: deviceIds.length || 6,
      intervalMin: [1, 3, 5, 10, 15][i % 5],
      planType: planType as any,
      weekPlan: weekPlan as any,
      holidayPlan: holidayPlan as any,
      syncMode: '自动同步',
      status: '已启用',
      syncStatus: '待同步',
      updatedAtMs: now - i * 60_000,
      lastRunAtMs: now - i * 60_000,
      lastRunStatus: '成功',
    }
  })
}

export function syncTasksFromCloud(params: { count?: number }) {
  const { mqttReady } = cloudStatus()
  if (!mqttReady) return { ok: false as const, message: 'MQTT未配置或未启用' }

  const groupsTree = loadJson<TreeNode[]>(GROUPS_KEY, [])
  const groups = flattenTree(groupsTree)
  const cameras = loadJson<Camera[]>(CAMERAS_KEY, [])
  const tasks = loadJson<SnapshotTask[]>(TASKS_KEY, [])

  const count = params.count ?? 6
  const now = Date.now()
  const inbox = loadJson<SnapshotTask[]>(CLOUD_TASK_INBOX_KEY, [])
  const incoming = inbox.length
    ? inbox.slice(0, count).map((x, i) => ({ ...x, updatedAtMs: now - i * 60_000 }))
    : buildIncomingCloudTasks({ count, groups, cameras, now })

  const map = new Map(tasks.map((t) => [t.id, t]))
  for (const t of incoming) map.set(t.id, { ...t, syncStatus: '已同步', updatedAtMs: Date.now() })
  const merged = Array.from(map.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs)
  saveJson(TASKS_KEY, merged)
  saveJson(
    CLOUD_TASK_INBOX_KEY,
    inbox.length ? inbox.slice(incoming.length) : buildIncomingCloudTasks({ count: Math.max(3, Math.floor(count / 2)), groups, cameras, now: now + 60_000 })
  )
  addCloudLog(CLOUD_TASK_ACK_OUTBOX_KEY, {
    id: `ack_${now}`,
    tsMs: now,
    action: 'pull_tasks',
    count: incoming.length,
    topic: loadCloud()?.mqtt?.topic || '',
  })
  appendManualLog({
    kind: 'communication',
    tsMs: now,
    level: 'info',
    module: '任务管理',
    action: 'MQTT任务同步',
    summary: `接收并落库 ${incoming.length} 条任务`,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `mqtt_pull_${now}`,
    detail: { count: incoming.length },
  })
  return { ok: true as const, count: incoming.length }
}

export function persistTaskRuns(taskId: string, runs: TaskRun[]) {
  const store = loadJson<Record<string, TaskRun[]>>(TASK_RUNS_KEY, {})
  store[taskId] = runs.slice(0, 40)
  saveJson(TASK_RUNS_KEY, store)
}

export function loadTaskRuns(taskId: string) {
  const store = loadJson<Record<string, TaskRun[]>>(TASK_RUNS_KEY, {})
  return Array.isArray(store[taskId]) ? store[taskId] : []
}

export function persistDeviceRuns(runId: string, rows: DeviceRun[]) {
  const store = loadJson<Record<string, DeviceRun[]>>(DEVICE_RUNS_KEY, {})
  store[runId] = rows.slice(0, 200)
  saveJson(DEVICE_RUNS_KEY, store)
}

export function loadDeviceRuns(runId: string) {
  const store = loadJson<Record<string, DeviceRun[]>>(DEVICE_RUNS_KEY, {})
  return Array.isArray(store[runId]) ? store[runId] : []
}

function codeToMessage(code: ResultCode) {
  if (code === 0) return '成功'
  if (code === 100) return '摄像头离线'
  if (code === 101) return '摄像头直播流地址错误'
  if (code === 102) return '摄像头不存在'
  if (code === 200) return '任务太密集'
  if (code === 300) return '资源不足'
  return '其他'
}

export function syncImagesToCloud(params: { maxCount?: number }) {
  const { mqttReady, ossReady } = cloudStatus()
  if (!mqttReady) return { ok: false as const, message: 'MQTT未配置或未启用' }
  if (!ossReady) return { ok: false as const, message: 'OSS未配置或未启用' }

  const deviceStore = loadJson<Record<string, DeviceRun[]>>(DEVICE_RUNS_KEY, {})
  const max = params.maxCount ?? 60
  let uploaded = 0
  let failed = 0
  const bucket = loadCloud()?.oss?.bucket || 'edge-ybox'
  const now = Date.now()

  for (const runId of Object.keys(deviceStore)) {
    if (uploaded + failed >= max) break
    const rows = deviceStore[runId]
    if (!Array.isArray(rows) || !rows.length) continue
    const nextRows = rows.map((r) => {
      if (uploaded + failed >= max) return r
      if (r.synced) return r
      const waitReport = String(r.syncMessage || '').includes('待MQTT上报')
      if (waitReport) return r
      const ok = r.status === '成功' ? Math.random() > 0.08 : Math.random() > 0.5
      const code: ResultCode = ok
        ? 0
        : r.status === '失败'
          ? (Math.random() < 0.35 ? 100 : Math.random() < 0.6 ? 101 : Math.random() < 0.8 ? 102 : 999)
          : Math.random() < 0.5
            ? 200
            : Math.random() < 0.75
              ? 300
              : 999
      const syncResult: SyncResult = ok ? '成功' : '失败'
      const path = cloudPath({
        bucket,
        taskId: r.id.split('-').slice(0, 2).join('-') || 'task',
        runId: r.runId,
        deviceId: r.id,
        tsMs: r.capturedAtMs || now,
      })
      if (ok) uploaded += 1
      else failed += 1
      addCloudLog(CLOUD_OSS_UPLOAD_LOG_KEY, {
        id: `oss_${r.id}_${Date.now()}`,
        tsMs: Date.now(),
        runId: r.runId,
        deviceRunId: r.id,
        path,
        ok,
        resultCode: code,
      })
      return {
        ...r,
        synced: false,
        syncResult,
        resultCode: code,
        syncMessage: ok ? `OSS上传成功，待MQTT上报｜${path}` : `OSS上传失败：${codeToMessage(code)}`,
      }
    })
    deviceStore[runId] = nextRows
  }

  saveJson(DEVICE_RUNS_KEY, deviceStore)
  appendManualLog({
    kind: 'communication',
    tsMs: now,
    level: failed ? 'warn' : 'info',
    module: '任务管理',
    action: 'OSS上传',
    summary: `上传完成：成功${uploaded}，失败${failed}`,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `oss_upload_${now}`,
    detail: { uploaded, failed },
  })
  return { ok: true as const, uploaded, failed }
}

export function reportResultsToCloud(params: { maxCount?: number }) {
  const { mqttReady } = cloudStatus()
  if (!mqttReady) return { ok: false as const, message: 'MQTT未配置或未启用' }

  const deviceStore = loadJson<Record<string, DeviceRun[]>>(DEVICE_RUNS_KEY, {})
  const max = params.maxCount ?? 100
  const reportedIds = loadReportedIds()
  let reported = 0
  let failed = 0
  const now = Date.now()
  const topic = loadCloud()?.mqtt?.topic || 'edge/ybox/telemetry'

  for (const runId of Object.keys(deviceStore)) {
    if (reported + failed >= max) break
    const rows = deviceStore[runId]
    if (!Array.isArray(rows) || !rows.length) continue
    const nextRows: DeviceRun[] = rows.map((r) => {
      if (reported + failed >= max) return r
      if (!String(r.syncMessage || '').includes('待MQTT上报')) return r
      if (reportedIds.has(r.id))
        return { ...r, synced: true, syncResult: '成功' as SyncResult, resultCode: 0 as ResultCode, syncMessage: 'MQTT结果上报成功' }
      const ok = Math.random() > 0.12
      const code: ResultCode = ok ? 0 : Math.random() < 0.35 ? 200 : Math.random() < 0.7 ? 300 : 999
      addCloudLog(CLOUD_RESULT_REPORT_LOG_KEY, {
        id: `report_${r.id}_${Date.now()}`,
        tsMs: Date.now(),
        topic,
        runId,
        deviceRunId: r.id,
        ok,
        resultCode: code,
      })
      if (ok) {
        reported += 1
        reportedIds.add(r.id)
        return { ...r, synced: true, syncResult: '成功' as SyncResult, resultCode: 0 as ResultCode, syncMessage: 'MQTT结果上报成功' }
      }
      failed += 1
      return {
        ...r,
        synced: false,
        syncResult: '失败' as SyncResult,
        resultCode: code,
        syncMessage: `MQTT结果上报失败：${codeToMessage(code)}`,
      }
    })
    deviceStore[runId] = nextRows
  }

  saveJson(DEVICE_RUNS_KEY, deviceStore)
  saveReportedIds(reportedIds)
  appendManualLog({
    kind: 'communication',
    tsMs: now,
    level: failed ? 'warn' : 'info',
    module: '任务管理',
    action: 'MQTT结果上报',
    summary: `上报完成：成功${reported}，失败${failed}`,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `mqtt_report_${now}`,
    detail: { reported, failed, topic },
  })
  return { ok: true as const, reported, failed }
}

export function publishTaskToCloud(task: SnapshotTask) {
  const { mqttReady } = cloudStatus()
  if (!mqttReady) return { ok: false as const, message: 'MQTT未配置或未启用' }
  const now = Date.now()
  const topic = loadCloud()?.mqtt?.topic || 'edge/ybox/telemetry'
  const ok = Math.random() > 0.08
  addCloudLog(CLOUD_TASK_ACK_OUTBOX_KEY, {
    id: `push_${task.id}_${now}`,
    tsMs: now,
    action: 'push_task',
    topic,
    taskId: task.id,
    ok,
  })
  appendManualLog({
    kind: 'communication',
    tsMs: now,
    level: ok ? 'info' : 'warn',
    module: '任务管理',
    action: 'MQTT任务下发',
    summary: `${task.id} ${ok ? '下发成功' : '下发失败'}`,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `mqtt_push_${task.id}_${now}`,
    detail: { taskId: task.id, topic, ok },
  })
  return { ok, message: ok ? '任务已通过MQTT下发' : 'MQTT下发失败，请稍后重试' }
}
