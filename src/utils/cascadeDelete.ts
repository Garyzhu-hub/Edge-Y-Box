import type { Camera } from '@/components/devices/CameraFormDialog.vue'
import type { Deployment } from '@/utils/deploymentsMock'
import type { SnapshotTask } from '@/utils/tasksMock'

const CAMERAS_KEY = 'edge_cameras_v1'
const DEPLOYMENTS_KEY = 'edge_deployments_v1'
const TASKS_KEY = 'edge_tasks_v1'

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

export type CascadeDeleteResult = {
  removedCameras: number
  removedDeployments: number
  updatedTasks: number
  disabledTasks: number
}

export function cascadeDeleteCameras(cameraIds: string[]): CascadeDeleteResult {
  const ids = Array.from(new Set(cameraIds)).filter(Boolean)
  if (!ids.length) return { removedCameras: 0, removedDeployments: 0, updatedTasks: 0, disabledTasks: 0 }
  const idSet = new Set(ids)
  const now = Date.now()

  const cameras = loadJson<Camera[]>(CAMERAS_KEY, [])
  const nextCameras = cameras.filter((c) => !idSet.has(c.id))
  const removedCameras = cameras.length - nextCameras.length
  if (removedCameras) saveJson(CAMERAS_KEY, nextCameras)

  const deployments = loadJson<Deployment[]>(DEPLOYMENTS_KEY, [])
  const nextDeployments = deployments.filter((d) => !idSet.has(d.cameraId))
  const removedDeployments = deployments.length - nextDeployments.length
  if (removedDeployments) saveJson(DEPLOYMENTS_KEY, nextDeployments)

  const tasks = loadJson<SnapshotTask[]>(TASKS_KEY, [])
  let updatedTasks = 0
  let disabledTasks = 0
  const nextTasks = tasks.map((t) => {
    if (!Array.isArray(t.deviceIds) || !t.deviceIds.length) return t
    const nextIds = t.deviceIds.filter((id) => !idSet.has(id))
    if (nextIds.length === t.deviceIds.length) return t
    updatedTasks += 1
    const disabled = nextIds.length === 0
    if (disabled) disabledTasks += 1
    return {
      ...t,
      deviceIds: nextIds,
      deviceCount: nextIds.length,
      status: disabled ? '已停用' : t.status,
      syncStatus: '待同步',
      updatedAtMs: now,
    }
  })
  if (updatedTasks) saveJson(TASKS_KEY, nextTasks)

  return { removedCameras, removedDeployments, updatedTasks, disabledTasks }
}

export type CascadeDeleteNvrResult = CascadeDeleteResult & {
  removedNvrChannelsCache: boolean
}

export function cascadeDeleteNvr(nvrId: string): CascadeDeleteNvrResult {
  const removedNvrChannelsCache = removeNvrChannelsCache(nvrId)
  const ids: string[] = []
  const cameras = loadJson<Camera[]>(CAMERAS_KEY, [])
  for (const c of cameras) {
    if (c.id.startsWith(`CAM-NVR-${nvrId}-`)) ids.push(c.id)
  }
  return { ...cascadeDeleteCameras(ids), removedNvrChannelsCache }
}

export function removeNvrChannelsCache(nvrId: string) {
  const key = `edge_nvr_channels_${nvrId}_v1`
  try {
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

