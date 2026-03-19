import type { Camera } from '@/components/devices/CameraFormDialog.vue'
import type { TreeNode } from '@/utils/devicesCamerasMock'

export type LocalGbChannelStatus = '在线' | '离线'

export type LocalGbChannel = {
  gbId: string
  name: string
  cameraId: string
  cameraIp: string
  protocol: string
  groupPath: string
  status: LocalGbChannelStatus
  updatedAtMs: number
}

const CAMERAS_KEY = 'edge_cameras_v1'
const GROUPS_KEY = 'edge_camera_groups_v1'
const POOL_KEY = 'edge_gb_local_channels_v1'
const GB_RULE_KEY = 'edge_camera_gb_id_rule_v1'

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

function findPath(nodes: TreeNode[], targetId: string, path: string[] = []): string[] | null {
  for (const n of nodes) {
    const next = [...path, n.label]
    if (n.id === targetId) return next
    if (n.children?.length) {
      const hit = findPath(n.children, targetId, next)
      if (hit) return hit
    }
  }
  return null
}

function groupPathById(groupTree: TreeNode[], groupId: string) {
  if (!groupId) return '—'
  const path = findPath(groupTree, groupId)
  return path ? path.join(' / ') : groupId
}

function fnv1a32(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function generateGbIdFromCamera(cameraId: string, prefix = '3402000000132') {
  const seed = fnv1a32(cameraId)
  const suffix = String(seed % 10_000_000).padStart(7, '0')
  const full = `${prefix}${suffix}`
  return full.slice(0, 20).padEnd(20, '0')
}

export function loadLocalGbChannels(): LocalGbChannel[] {
  const list = loadJson<LocalGbChannel[]>(POOL_KEY, [])
  return Array.isArray(list) ? list : []
}

function loadGbPrefix() {
  const parsed = loadJson<{ prefix?: string }>(GB_RULE_KEY, {})
  const digits = String(parsed?.prefix || '').replace(/\D/g, '')
  if (digits.length < 6) return '3402000000132'
  return digits.slice(0, 19)
}

export function refreshLocalGbChannels(): LocalGbChannel[] {
  const cameras = loadJson<Camera[]>(CAMERAS_KEY, [])
  const groups = loadJson<TreeNode[]>(GROUPS_KEY, [])
  const gbPrefix = loadGbPrefix()
  const now = Date.now()

  const list: LocalGbChannel[] = (Array.isArray(cameras) ? cameras : [])
    .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string')
    .map((c) => {
      const status: LocalGbChannelStatus = c.enabled ? '在线' : '离线'
      return {
        gbId: c.gbDeviceId || generateGbIdFromCamera(c.id, gbPrefix),
        name: c.name,
        cameraId: c.id,
        cameraIp: c.ip,
        protocol: c.protocol,
        groupPath: groupPathById(groups, c.groupId),
        status,
        updatedAtMs: c.updatedAtMs || now,
      }
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)

  saveJson(POOL_KEY, list)
  return list
}
