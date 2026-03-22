import type { SnapshotTask, TaskRun, DeviceRun, ResultCode, SyncResult } from '@/utils/tasksMock'
import type { TreeNode } from '@/utils/devicesCamerasMock'
import type { Camera } from '@/components/devices/CameraFormDialog.vue'
import { appendManualLog } from '@/utils/logsMock'
import { mqttRequestJson, type CloudMqttConfig } from '@/utils/cloud/mqttClient'

type PersistedCloud = {
  boxMac: string
  mqtt: {
    enabled: boolean
    host: string
    port: number
    username: string
    clientId: string
    topic: string
    wsPath: string
    password: string
    secretConfigured: boolean
  }
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
  const boxMacReady = !!cloud?.boxMac?.trim()
  const mqttReady = !!(
    cloud?.mqtt?.enabled &&
    cloud.mqtt.host &&
    cloud.mqtt.port &&
    cloud.mqtt.username &&
    cloud.mqtt.clientId &&
    cloud.mqtt.topic &&
    cloud.mqtt.secretConfigured &&
    cloud.mqtt.password
  )
  const ossReady = !!(
    cloud?.oss?.enabled
  )
  return { mqttReady, ossReady, boxMacReady, boxMac: cloud?.boxMac || '' }
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


export async function syncTasksFromCloud(params: { count?: number }) {
  const cloud = loadCloud()
  const { mqttReady, boxMacReady, boxMac } = cloudStatus()
  if (!mqttReady) return { ok: false as const, message: 'MQTT未配置或未启用' }
  if (!boxMacReady) return { ok: false as const, message: 'Box MAC未设置（用于 `{mac}` MQTT 主题）' }
  if (!cloud) return { ok: false as const, message: '云配置异常' }

  const groupsTree = loadJson<TreeNode[]>(GROUPS_KEY, [])
  const groups = flattenTree(groupsTree)
  const cameras = loadJson<Camera[]>(CAMERAS_KEY, [])

  const makeWeekPlan = () => ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } as any)
  const toHHmm = (v: unknown) => String(v || '').slice(0, 5)

  function cloudTaskToSnapshot(t: any): SnapshotTask {
    const deviceIds: string[] = Array.isArray(t.cameraIds) ? t.cameraIds : Array.isArray(t.deviceIds) ? t.deviceIds : []
    const firstCam = deviceIds.length ? cameras.find((c) => c.id === deviceIds[0]) : null
    const groupId = firstCam?.groupId || 'all'
    const groupLabel = groups.find((g) => g.id === groupId)?.label || firstCam?.name || '—'

    const status = t.operateType === 2 ? ('已停用' as const) : ('已启用' as const)
    const intervalMin = Number(t.fixedRate ?? 3) || 3

    const weekPlan = makeWeekPlan()
    const weekTimes: any[] = Array.isArray(t.weekTimes) ? t.weekTimes : []
    const dayOfWeekMap: Record<number, keyof typeof weekPlan> = {
      1: 'mon',
      2: 'tue',
      3: 'wed',
      4: 'thu',
      5: 'fri',
      6: 'sat',
      7: 'sun',
    }
    for (const d of weekTimes) {
      const dayKey = dayOfWeekMap[Number(d.dayOfWeek)]
      if (!dayKey) continue
      const segs: any[] = Array.isArray(d.timeSegments) ? d.timeSegments : []
      for (const s of segs) {
        const start = toHHmm(s.startTime)
        const end = toHHmm(s.endTime)
        if (!start || !end) continue
        if (start >= end) continue
        ;(weekPlan[dayKey] as any[]).push({ start, end })
      }
    }

    const holidayTimes: any[] = Array.isArray(t.holidayTimes) ? t.holidayTimes : []
    const holidayPlan = holidayTimes.map((h) => {
      const date = String(h.startDay || '').slice(0, 10)
      const segs: any[] = Array.isArray(h.timeSegments) ? h.timeSegments : []
      return {
        date,
        slots: segs
          .map((s) => ({ start: toHHmm(s.startTime), end: toHHmm(s.endTime) }))
          .filter((x) => x.start && x.end && x.start < x.end),
      }
    })
    const holidayPlanNormalized = holidayPlan.filter((x) => x.date && Array.isArray(x.slots) && x.slots.length)

    const planType = holidayPlanNormalized.length ? '假日计划' : '周计划'

    const now = Date.now()
    return {
      id: String(t.id || `TASK-SNAP-${makeId('CLD')}`),
      name: String(t.name || '云端下发抓图任务'),
      groupId,
      groupLabel,
      deviceIds,
      deviceCount: deviceIds.length,
      intervalMin,
      planType: planType as any,
      weekPlan,
      holidayPlan: holidayPlanNormalized as any,
      syncMode: '自动同步',
      status,
      syncStatus: '已同步',
      updatedAtMs: now,
      lastRunAtMs: now,
      lastRunStatus: '成功',
    }
  }

  const cfg: CloudMqttConfig = {
    host: cloud.mqtt.host,
    port: cloud.mqtt.port,
    username: cloud.mqtt.username,
    clientId: cloud.mqtt.clientId,
    password: cloud.mqtt.password,
    wsPath: cloud.mqtt.wsPath,
  }

  // 5.3.4 查询云端任务列表
  const replyTopic = `cloud2edge/task/v1/query/${boxMac}`
  const requestTopic = 'edge2cloud/task/v1/query'
  const pageSize = params.count ?? 6

  const res = await mqttRequestJson({
    cfg,
    mac: boxMac,
    requestTopic,
    replyTopic,
    data: { pageNum: 1, pageSize, mac: boxMac },
    timeoutMs: 12_000,
  })

  const code = (res as any)?.code
  const ok = code === undefined ? true : code === 0
  if (!ok) {
    return { ok: false as const, message: `MQTT查询任务失败（code=${code}）` }
  }

  const list = Array.isArray((res as any)?.data?.list) ? (res as any).data.list : []
  const incoming = list.map(cloudTaskToSnapshot)
  const merged = incoming.slice().sort((a, b) => b.updatedAtMs - a.updatedAtMs)
  saveJson(TASKS_KEY, merged)
  saveJson(CLOUD_TASK_INBOX_KEY, [])

  const now = Date.now()
  addCloudLog(CLOUD_TASK_ACK_OUTBOX_KEY, {
    id: `ack_${now}`,
    tsMs: now,
    action: 'pull_tasks',
    count: merged.length,
    topic: cloud.mqtt.topic || '',
  })
  appendManualLog({
    kind: 'communication',
    tsMs: now,
    level: 'info',
    module: '任务管理',
    action: 'MQTT任务同步',
    summary: `已从云端查询并落库 ${merged.length} 条任务`,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `mqtt_pull_${now}`,
    detail: { count: merged.length, replyTopic, requestTopic },
  })

  return { ok: true as const, count: merged.length }
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

const OSS_KEY_PREFIX = 'edge-ybox/'
let ossPolicyCache: null | {
  expireAtMs: number
  host: string
  accessId: string
  policy: string
  signature: string
  ossKeyPrefix: string
}

function toObjectKey(params: { tsMs: number; taskId: string; runId: string; cameraId: string; ossKeyPrefix: string }) {
  const d = new Date(params.tsMs)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const file = `${params.cameraId}.jpg`
  return `${params.ossKeyPrefix}${y}${m}${day}/${params.taskId}/${params.runId}/${file}`
}

function parseAliOssLocation(xmlText: string) {
  const m = xmlText.match(/<Location>([^<]+)<\/Location>/i)
  return m?.[1] ? String(m[1]) : ''
}

export async function getOssPolicy(cfg: CloudMqttConfig, mac: string) {
  const now = Date.now()
  if (ossPolicyCache && ossPolicyCache.expireAtMs > now + 5_000) return ossPolicyCache

  const res = await mqttRequestJson({
    cfg,
    mac,
    requestTopic: 'edge2cloud/box/v1/get-oss',
    replyTopic: `cloud2edge/box/v1/get-oss/${mac}`,
    data: { ossKey: OSS_KEY_PREFIX },
    timeoutMs: 12_000,
  })

  const data = (res as any)?.data || {}
  const accessId = String(data.accessId || '')
  const policy = String(data.policy || '')
  const signature = String(data.signature || '')
  const host = String(data.host || '')
  const expireSec = Number(data.expire || 0)
  const ossKeyPrefix = String(data.ossKey || OSS_KEY_PREFIX).trim()

  if (!accessId || !policy || !signature || !host || !expireSec) {
    throw new Error('OSS鉴权信息不完整（get-oss返回字段缺失）')
  }

  const expireAtMs = expireSec * 1000
  ossPolicyCache = { expireAtMs, host, accessId, policy, signature, ossKeyPrefix }
  return ossPolicyCache
}

async function uploadBlobToOss(params: {
  cfg: CloudMqttConfig
  mac: string
  tsMs: number
  taskId: string
  runId: string
  cameraId: string
  snapshotUrl: string
}): Promise<{ picUrl: string }> {
  const policy = await getOssPolicy(params.cfg, params.mac)

  // Aliyun OSS post-policy upload (FormData) -> response includes `<Location>`.
  const objectKey = toObjectKey({
    tsMs: params.tsMs,
    taskId: params.taskId,
    runId: params.runId,
    cameraId: params.cameraId,
    ossKeyPrefix: policy.ossKeyPrefix.endsWith('/') ? policy.ossKeyPrefix : `${policy.ossKeyPrefix}/`,
  })

  const imgResp = await fetch(params.snapshotUrl).catch(() => null)
  if (!imgResp || !imgResp.ok) throw new Error('抓图图片下载失败（用于OSS上传）')
  const blob = await imgResp.blob()

  const fd = new FormData()
  fd.append('key', objectKey)
  fd.append('policy', policy.policy)
  fd.append('OSSAccessKeyId', policy.accessId)
  fd.append('signature', policy.signature)
  fd.append('success_action_status', '200')
  fd.append('file', blob)

  const uploadResp = await fetch(policy.host, {
    method: 'POST',
    body: fd,
  })

  if (!uploadResp.ok) throw new Error(`OSS上传HTTP失败：${uploadResp.status}`)
  const xmlText = await uploadResp.text()
  const picUrl = parseAliOssLocation(xmlText)
  // Fallback: construct URL from host + objectKey.
  return { picUrl: picUrl || `${policy.host}/${objectKey}` }
}

export async function syncImagesToCloud(params: { maxCount?: number }) {
  const cloud = loadCloud()
  const { mqttReady, ossReady, boxMacReady, boxMac } = cloudStatus()
  if (!mqttReady) return { ok: false as const, message: 'MQTT未配置或未启用' }
  if (!ossReady) return { ok: false as const, message: 'OSS未启用' }
  if (!boxMacReady) return { ok: false as const, message: 'Box MAC未设置' }
  if (!cloud) return { ok: false as const, message: '云配置异常' }

  const deviceStore = loadJson<Record<string, DeviceRun[]>>(DEVICE_RUNS_KEY, {})
  const max = params.maxCount ?? 60
  let uploaded = 0
  let failed = 0
  const now = Date.now()

  const cfg: CloudMqttConfig = {
    host: cloud.mqtt.host,
    port: cloud.mqtt.port,
    username: cloud.mqtt.username,
    clientId: cloud.mqtt.clientId,
    password: cloud.mqtt.password,
    wsPath: cloud.mqtt.wsPath,
  }

  for (const runId of Object.keys(deviceStore)) {
    if (uploaded + failed >= max) break
    const rows = deviceStore[runId]
    if (!Array.isArray(rows) || !rows.length) continue

    const nextRows: DeviceRun[] = []
    for (const r of rows) {
      if (uploaded + failed >= max) {
        nextRows.push(r)
        continue
      }
      if (r.synced) {
        nextRows.push(r)
        continue
      }
      // Already uploaded and waiting MQTT
      if (r.picUrl) {
        nextRows.push({ ...r, syncMessage: r.syncMessage || 'OSS已上传，待MQTT上报' })
        continue
      }

      try {
        const taskId = String((r as any).taskId || '')
        const cameraId = String((r as any).cameraId || '')
        if (!taskId || !cameraId) throw new Error('运行数据缺少 taskId/cameraId，无法按协议上报')
        const upload = await uploadBlobToOss({
          cfg,
          mac: boxMac,
          tsMs: r.capturedAtMs || now,
          taskId,
          runId: r.runId,
          cameraId,
          snapshotUrl: r.snapshotUrl,
        })

        uploaded += 1
        addCloudLog(CLOUD_OSS_UPLOAD_LOG_KEY, {
          id: `oss_${r.id}_${Date.now()}`,
          tsMs: Date.now(),
          runId: r.runId,
          deviceRunId: r.id,
          ok: true,
          picUrl: upload.picUrl,
        })

        nextRows.push({
          ...r,
          picUrl: upload.picUrl,
          synced: false,
          syncResult: '成功' as SyncResult,
          resultCode: 0 as ResultCode,
          syncMessage: `OSS上传成功，待MQTT上报｜${upload.picUrl}`,
        })
      } catch (e) {
        failed += 1
        const msg = e instanceof Error ? e.message : String(e)
        addCloudLog(CLOUD_OSS_UPLOAD_LOG_KEY, {
          id: `oss_${r.id}_${Date.now()}`,
          tsMs: Date.now(),
          runId: r.runId,
          deviceRunId: r.id,
          ok: false,
          error: msg,
        })
        nextRows.push({
          ...r,
          picUrl: undefined,
          synced: false,
          syncResult: '失败' as SyncResult,
          resultCode: 999 as ResultCode,
          syncMessage: `OSS上传失败：${msg}`,
        })
      }
    }
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

export async function reportResultsToCloud(params: { maxCount?: number }) {
  const cloud = loadCloud()
  const { mqttReady, boxMacReady, boxMac } = cloudStatus()
  if (!mqttReady) return { ok: false as const, message: 'MQTT未配置或未启用' }
  if (!boxMacReady) return { ok: false as const, message: 'Box MAC未设置' }
  if (!cloud) return { ok: false as const, message: '云配置异常' }

  const deviceStore = loadJson<Record<string, DeviceRun[]>>(DEVICE_RUNS_KEY, {})
  const max = params.maxCount ?? 100
  const reportedIds = loadReportedIds()
  let reported = 0
  let failed = 0
  const now = Date.now()
  const cfg: CloudMqttConfig = {
    host: cloud.mqtt.host,
    port: cloud.mqtt.port,
    username: cloud.mqtt.username,
    clientId: cloud.mqtt.clientId,
    password: cloud.mqtt.password,
    wsPath: cloud.mqtt.wsPath,
  }

  // Collect pending items up to `maxCount`
  const pending: DeviceRun[] = []
  for (const runId of Object.keys(deviceStore)) {
    const rows = deviceStore[runId]
    if (!Array.isArray(rows) || !rows.length) continue
    for (const r of rows) {
      if (pending.length >= max) break
      if (r.synced) continue
      if (!r.picUrl) continue
      if (!String(r.syncMessage || '').includes('待MQTT上报')) continue
      const taskId = String((r as any).taskId || '')
      const cameraId = String((r as any).cameraId || '')
      if (!taskId || !cameraId) continue
      if (reportedIds.has(r.id)) continue
      pending.push(r)
    }
    if (pending.length >= max) break
  }

  if (!pending.length) {
    return { ok: true as const, reported: 0, failed: 0 }
  }

  const listPayload = pending.map((r) => ({
    id: r.taskId,
    cammerId: r.cameraId, // protocol typo kept for compatibility
    cameraId: r.cameraId,
    picUrl: r.picUrl,
    time: r.capturedAtMs,
    resultCode: r.resultCode,
    resultMsg: r.status === '成功' ? '' : r.error || '失败',
  }))

  try {
    const res = await mqttRequestJson({
      cfg,
      mac: boxMac,
      requestTopic: `edge2cloud/task/v1/upload-screenshot/${boxMac}`,
      replyTopic: `cloud2edge/task/v1/upload-screenshot/${boxMac}`,
      data: listPayload,
      timeoutMs: 15_000,
    })

    const code = (res as any)?.code
    const ok = code === undefined ? true : code === 0

    for (const r of pending) {
      if (ok) {
        reported += 1
        reportedIds.add(r.id)
        deviceStore[r.runId] = (deviceStore[r.runId] || []).map((x) =>
          x.id === r.id
            ? { ...x, synced: true, syncResult: '成功' as SyncResult, resultCode: 0 as ResultCode, syncMessage: 'MQTT结果上报成功' }
            : x
        )
      } else {
        failed += 1
        deviceStore[r.runId] = (deviceStore[r.runId] || []).map((x) =>
          x.id === r.id
            ? {
                ...x,
                synced: false,
                syncResult: '失败' as SyncResult,
                resultCode: 999 as ResultCode,
                syncMessage: `MQTT结果上报失败：${(res as any)?.msg || 'code=' + code}`,
              }
            : x
        )
      }

      addCloudLog(CLOUD_RESULT_REPORT_LOG_KEY, {
        id: `report_${r.id}_${Date.now()}`,
        tsMs: Date.now(),
        runId: r.runId,
        deviceRunId: r.id,
        ok,
        code,
        picUrl: r.picUrl,
      })
    }
  } catch (e) {
    failed += pending.length
    const msg = e instanceof Error ? e.message : String(e)
    for (const r of pending) {
      deviceStore[r.runId] = (deviceStore[r.runId] || []).map((x) =>
        x.id === r.id
          ? { ...x, synced: false, syncResult: '失败' as SyncResult, resultCode: 999 as ResultCode, syncMessage: `MQTT结果上报失败：${msg}` }
          : x
      )
      addCloudLog(CLOUD_RESULT_REPORT_LOG_KEY, {
        id: `report_${r.id}_${Date.now()}`,
        tsMs: Date.now(),
        runId: r.runId,
        deviceRunId: r.id,
        ok: false,
        error: msg,
      })
    }
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
    detail: { reported, failed, pendingCount: pending.length },
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
