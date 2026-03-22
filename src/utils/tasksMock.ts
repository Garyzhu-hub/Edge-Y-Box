export type SnapshotTaskStatus = '已启用' | '已停用'
export type SyncStatus = '已同步' | '待同步' | '同步失败'
export type RunStatus = '成功' | '失败' | '执行中'
export type ResultCode = 0 | 100 | 101 | 102 | 200 | 300 | 999
export type SyncResult = '成功' | '失败'

function resultCodeMessage(code: ResultCode) {
  if (code === 0) return '成功'
  if (code === 100) return '摄像头离线'
  if (code === 101) return '摄像头直播流地址错误'
  if (code === 102) return '摄像头不存在'
  if (code === 200) return '任务太密集'
  if (code === 300) return '资源不足'
  return '其他错误'
}

export type TaskSyncMode = '自动同步' | '本地创建'
export type TaskPlanType = '周计划' | '假日计划'

export type TimeSlot = { start: string; end: string }
export type WeekPlan = {
  mon: TimeSlot[]
  tue: TimeSlot[]
  wed: TimeSlot[]
  thu: TimeSlot[]
  fri: TimeSlot[]
  sat: TimeSlot[]
  sun: TimeSlot[]
}

export type HolidayPlanItem = { date: string; slots: TimeSlot[] }

export type SnapshotTask = {
  id: string
  name: string
  groupId: string
  groupLabel: string
  deviceIds: string[]
  deviceCount: number
  intervalMin: number
  planType: TaskPlanType
  weekPlan: WeekPlan
  holidayPlan: HolidayPlanItem[]
  syncMode: TaskSyncMode
  status: SnapshotTaskStatus
  syncStatus: SyncStatus
  updatedAtMs: number
  lastRunAtMs: number
  lastRunStatus: RunStatus
}

export function makeDefaultWeekPlan(): WeekPlan {
  return {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  }
}

export type TaskRun = {
  id: string
  taskId: string
  startedAtMs: number
  finishedAtMs: number
  durationMs: number
  status: RunStatus
  okCount: number
  failCount: number
  operator: string
}

export type DeviceRun = {
  taskId: string
  id: string
  runId: string
  deviceLabel: string
  deviceIp: string
  cameraId: string
  status: RunStatus
  capturedAtMs: number
  snapshotUrl: string
  // When syncing to cloud, we may upload the snapshot image to OSS and receive a public/authorized URL.
  // It is required for MQTT result upload payload.
  picUrl?: string
  error: string
  synced: boolean
  syncResult: SyncResult
  resultCode: ResultCode
  syncMessage: string
}

type Rand = () => number

function mulberry32(seed: number): Rand {
  let s = seed | 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFromText(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mockImage(prompt: string) {
  const encoded = encodeURIComponent(
    `SDXL, professional surveillance snapshot, ${prompt}, realistic CCTV, high detail, sharp, documentary, neutral colors`
  )
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encoded}&image_size=landscape_4_3`
}

export function makeMockTasks(params: {
  fromMs: number
  toMs: number
  groups: { id: string; label: string }[]
  count?: number
}) {
  const { fromMs, toMs } = params
  const groups = params.groups.filter((g) => g.id !== 'all')
  const count = params.count ?? 12
  const rand = mulberry32(20260311 ^ ((fromMs + toMs) & 0xffffffff))

  const operators = ['系统', 'admin', '值班人员']
  const nameSeeds = ['巡检抓图', '门岗抓图', '广场巡航', '夜间巡检', '重点点位', '异常复核']

  const list = Array.from({ length: count }).map((_, i): SnapshotTask => {
    const group = groups[Math.floor(rand() * groups.length)] || { id: 'a-l1', label: '1号楼' }
    const baseName = nameSeeds[Math.floor(rand() * nameSeeds.length)]
    const id = `TASK-SNAP-${10001 + i}`
    const name = `${baseName}-${group.label}-${i + 1}`
    const deviceCount = 3 + Math.floor(rand() * 12)
    const intervalMin = [1, 3, 5, 10, 15][Math.floor(rand() * 5)]
    const planType: TaskPlanType = rand() > 0.5 ? '周计划' : '假日计划'
    const weekPlan = makeDefaultWeekPlan()
    if (planType === '周计划') {
      weekPlan.mon = [{ start: '09:00', end: '18:00' }]
    }
    const holidayPlan: HolidayPlanItem[] =
      planType === '假日计划'
        ? [
            {
              date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
              slots: [{ start: '10:00', end: '16:00' }],
            },
          ]
        : []
    const status: SnapshotTaskStatus = rand() > 0.18 ? '已启用' : '已停用'
    const syncRoll = rand()
    const syncStatus: SyncStatus = syncRoll < 0.72 ? '已同步' : syncRoll < 0.9 ? '待同步' : '同步失败'
    const updatedAtMs = fromMs + Math.floor(rand() * Math.max(1, toMs - fromMs))
    const lastRunAtMs = updatedAtMs + Math.floor(rand() * 6 * 60 * 60 * 1000)
    const runRoll = rand()
    const lastRunStatus: RunStatus = status === '已停用' ? '成功' : runRoll < 0.78 ? '成功' : '失败'

    const operator = operators[Math.floor(rand() * operators.length)]
    void operator

    return {
      id,
      name,
      groupId: group.id,
      groupLabel: group.label,
      deviceIds: [],
      deviceCount,
      intervalMin,
      planType,
      weekPlan,
      holidayPlan,
      syncMode: '自动同步',
      status,
      syncStatus,
      updatedAtMs,
      lastRunAtMs,
      lastRunStatus,
    }
  })

  return list.sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

export function makeMockRuns(params: { taskId: string; fromMs: number; toMs: number; count?: number }) {
  const count = params.count ?? 14
  const { fromMs, toMs, taskId } = params
  const rand = mulberry32(seedFromText(`${taskId}-${fromMs}-${toMs}`))
  const operators = ['系统', 'admin', '值班人员']

  const base = Math.max(fromMs, toMs - 3 * 24 * 60 * 60 * 1000)
  const list = Array.from({ length: count }).map((_, i): TaskRun => {
    const startedAtMs = base + Math.floor(rand() * Math.max(1, toMs - base))
    const durationMs = 8_000 + Math.floor(rand() * 45_000)
    const finishedAtMs = startedAtMs + durationMs
    const roll = rand()
    const status: RunStatus = i === 0 && roll < 0.22 ? '执行中' : roll < 0.82 ? '成功' : '失败'
    const operator = operators[Math.floor(rand() * operators.length)]
    const okCount = 6 + Math.floor(rand() * 10)
    const failCount = status === '成功' ? Math.floor(rand() * 2) : 1 + Math.floor(rand() * 4)

    return {
      id: `RUN-${taskId.slice(-5)}-${String(9000 + i).padStart(4, '0')}`,
      taskId,
      startedAtMs,
      finishedAtMs,
      durationMs,
      status,
      okCount,
      failCount,
      operator,
    }
  })

  return list.sort((a, b) => b.startedAtMs - a.startedAtMs)
}

export type CameraRef = { id: string; label: string; ip: string }

export function makeMockDeviceRuns(params: {
  taskId: string
  runId: string
  startedAtMs: number
  deviceCount: number
  cameraRefs?: CameraRef[]
}) {
  const { taskId, runId, startedAtMs, deviceCount, cameraRefs } = params
  const rand = mulberry32(seedFromText(`${taskId}-${runId}`))
  const devices = ['北门出入口-3', '东门岗亭-1', '景观广场-1', '1号楼大堂-2', '地库B2-5']
  const cameraPool: CameraRef[] =
    cameraRefs && cameraRefs.length
      ? cameraRefs
      : Array.from({ length: Math.max(1, deviceCount) }).map((_, i) => ({
          id: `${taskId}-cam-${i + 1}`,
          label: devices[i % devices.length],
          ip: `192.168.${20 + Math.floor(rand() * 5)}.${10 + Math.floor(rand() * 200)}`,
        }))

  return Array.from({ length: deviceCount }).map((_, i): DeviceRun => {
    const cam = cameraPool[i % cameraPool.length]
    const deviceLabel = cam.label
    const deviceIp = cam.ip
    const cameraId = cam.id
    const statusRoll = rand()
    const status: RunStatus = statusRoll < 0.83 ? '成功' : '失败'
    const capturedAtMs = startedAtMs + Math.floor(rand() * 30_000)
    const snapshotUrl = mockImage(`task snapshot, ${deviceLabel}, ${deviceIp}, ${status === '成功' ? 'clear image' : 'blurred image'}`)
    const error = status === '失败' ? 'timeout: no response from camera' : ''

    const synced = rand() > 0.45
    const syncResult: SyncResult = synced ? '成功' : '失败'
    const resultCode: ResultCode =
      syncResult === '成功'
        ? 0
        : status === '失败'
          ? rand() < 0.35
            ? 100
            : rand() < 0.6
              ? 101
              : rand() < 0.8
                ? 102
                : 999
          : rand() < 0.5
            ? 200
            : rand() < 0.75
              ? 300
              : 999
    const syncMessage = syncResult === '成功' ? '已同步' : resultCodeMessage(resultCode)

    return {
      id: `DR-${runId.slice(-4)}-${String(100 + i).padStart(3, '0')}`,
      taskId,
      runId,
      deviceLabel,
      deviceIp,
      cameraId,
      status,
      capturedAtMs,
      snapshotUrl,
      picUrl: undefined,
      error,
      synced,
      syncResult,
      resultCode,
      syncMessage,
    }
  })
}
