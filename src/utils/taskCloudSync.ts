import type { SnapshotTask, TaskRun, DeviceRun, ResultCode, SyncResult } from '@/utils/tasksMock'
import type { TreeNode } from '@/utils/devicesCamerasMock'
import type { Camera } from '@/components/devices/CameraFormDialog.vue'

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

export function syncTasksFromCloud(params: { count?: number }) {
  const { mqttReady } = cloudStatus()
  if (!mqttReady) return { ok: false as const, message: 'MQTT未配置或未启用' }

  const groupsTree = loadJson<TreeNode[]>(GROUPS_KEY, [])
  const groups = flattenTree(groupsTree)
  const cameras = loadJson<Camera[]>(CAMERAS_KEY, [])
  const tasks = loadJson<SnapshotTask[]>(TASKS_KEY, [])

  const count = params.count ?? 6
  const now = Date.now()

  const incoming = Array.from({ length: count }).map((_, i): SnapshotTask => {
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
      syncStatus: '已同步',
      updatedAtMs: now - i * 60_000,
      lastRunAtMs: now - i * 60_000,
      lastRunStatus: '成功',
    }
  })

  const map = new Map(tasks.map((t) => [t.id, t]))
  for (const t of incoming) map.set(t.id, t)
  const merged = Array.from(map.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs)
  saveJson(TASKS_KEY, merged)
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
  let changed = 0

  for (const runId of Object.keys(deviceStore)) {
    if (changed >= max) break
    const rows = deviceStore[runId]
    if (!Array.isArray(rows) || !rows.length) continue
    const nextRows = rows.map((r) => {
      if (changed >= max) return r
      if (r.synced) return r
      changed += 1
      const ok = r.status === '成功' ? Math.random() > 0.1 : Math.random() > 0.6
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
      return {
        ...r,
        synced: ok,
        syncResult,
        resultCode: code,
        syncMessage: ok ? '已同步' : codeToMessage(code),
      }
    })
    deviceStore[runId] = nextRows
  }

  saveJson(DEVICE_RUNS_KEY, deviceStore)
  return { ok: true as const, changed }
}
