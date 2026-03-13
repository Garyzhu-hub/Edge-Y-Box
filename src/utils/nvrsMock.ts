import type { CameraProtocol } from '@/components/devices/CameraFormDialog.vue'

export type NvrStatus = '在线' | '离线' | '禁用'

export type Nvr = {
  id: string
  name: string
  ip: string
  port: number
  protocol: CameraProtocol
  channelTotal: number
  channelSynced: number
  username: string
  passwordConfigured: boolean
  enabled: boolean
  remark: string
  updatedAtMs: number
  createdAtMs: number
}

export type NvrChannel = {
  id: string
  nvrId: string
  channelNo: number
  name: string
  synced: boolean
  updatedAtMs: number
}

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

export function computedNvrStatus(nvr: Nvr): NvrStatus {
  if (!nvr.enabled) return '禁用'
  const s = (nvr.ip.charCodeAt(nvr.ip.length - 1) + nvr.port) % 7
  return s < 5 ? '在线' : '离线'
}

export function makeDefaultNvrs(nowMs = Date.now()): Nvr[] {
  return [
    {
      id: 'NVR-10001',
      name: '园区A-NVR-1',
      ip: '192.168.10.120',
      port: 554,
      protocol: 'RTSP',
      channelTotal: 8,
      channelSynced: 3,
      username: 'admin',
      passwordConfigured: true,
      enabled: true,
      remark: '演示数据',
      createdAtMs: nowMs - 18 * 24 * 60 * 60 * 1000,
      updatedAtMs: nowMs - 2 * 60 * 60 * 1000,
    },
    {
      id: 'NVR-10002',
      name: '园区B-NVR-2',
      ip: '192.168.12.80',
      port: 554,
      protocol: 'ONVIF',
      channelTotal: 16,
      channelSynced: 0,
      username: 'admin',
      passwordConfigured: false,
      enabled: true,
      remark: '',
      createdAtMs: nowMs - 6 * 24 * 60 * 60 * 1000,
      updatedAtMs: nowMs - 40 * 60 * 1000,
    },
  ]
}

export function makeMockChannels(params: { nvrId: string; count: number; nowMs?: number }): NvrChannel[] {
  const nowMs = params.nowMs ?? Date.now()
  const rand = mulberry32(
    Array.from(params.nvrId).reduce((acc, c) => {
      acc = (acc * 33 + c.charCodeAt(0)) >>> 0
      return acc
    }, 5381)
  )

  const names = ['通道', '大堂', '出入口', '走廊', '停车场', '围界', '电梯间']
  return Array.from({ length: params.count }).map((_, i): NvrChannel => {
    const channelNo = i + 1
    const name = `${names[Math.floor(rand() * names.length)]}-${String(channelNo).padStart(2, '0')}`
    const synced = rand() > 0.72
    return {
      id: `${params.nvrId}_CH_${String(channelNo).padStart(2, '0')}`,
      nvrId: params.nvrId,
      channelNo,
      name,
      synced,
      updatedAtMs: nowMs - Math.floor(rand() * 3 * 24 * 60 * 60 * 1000),
    }
  })
}

