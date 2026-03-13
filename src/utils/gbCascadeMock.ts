export type GbTransport = 'UDP' | 'TCP'
export type GbStatus = '在线' | '离线' | '异常'

export type GbCascadePlatform = {
  id: string
  name: string
  serverId: string
  serverDomain: string
  sipServer: string
  sipPort: number
  username: string
  passwordConfigured: boolean
  localId: string
  localIp: string
  localPort: number
  transport: GbTransport
  status: GbStatus
  registered: boolean
  lastRegisterAtMs: number
  channelCount: number
  updatedAtMs: number
  createdAtMs: number
  enabled: boolean
}

export type GbChannel = {
  id: string
  name: string
  manufacturer: string
  model: string
  status: GbStatus
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

export function makeDefaultGbPlatforms(nowMs = Date.now()): GbCascadePlatform[] {
  const list: GbCascadePlatform[] = [
    {
      id: 'gb_up_001',
      name: '上级平台A（市局）',
      serverId: '34020000002000000001',
      serverDomain: '3402000000',
      sipServer: '10.10.10.10',
      sipPort: 5060,
      username: '34020000002000000001',
      passwordConfigured: true,
      localId: '34020000001320000001',
      localIp: '192.168.10.88',
      localPort: 5060,
      transport: 'UDP',
      status: '在线',
      registered: true,
      lastRegisterAtMs: nowMs - 2 * 60 * 1000,
      channelCount: 128,
      updatedAtMs: nowMs - 8 * 60 * 1000,
      createdAtMs: nowMs - 20 * 24 * 60 * 60 * 1000,
      enabled: true,
    },
    {
      id: 'gb_up_002',
      name: '上级平台B（区县）',
      serverId: '34020000002000000002',
      serverDomain: '3402000000',
      sipServer: '10.20.10.10',
      sipPort: 5060,
      username: '34020000002000000002',
      passwordConfigured: false,
      localId: '34020000001320000001',
      localIp: '192.168.10.88',
      localPort: 5060,
      transport: 'TCP',
      status: '离线',
      registered: false,
      lastRegisterAtMs: nowMs - 6 * 60 * 60 * 1000,
      channelCount: 0,
      updatedAtMs: nowMs - 10 * 60 * 1000,
      createdAtMs: nowMs - 10 * 24 * 60 * 60 * 1000,
      enabled: true,
    },
  ]
  return list.sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

export function makeMockChannels(params: { platformId: string; count?: number; nowMs?: number }): GbChannel[] {
  const count = params.count ?? 30
  const nowMs = params.nowMs ?? Date.now()
  const rand = mulberry32(
    Array.from(params.platformId).reduce((acc, c) => {
      acc = (acc * 33 + c.charCodeAt(0)) >>> 0
      return acc
    }, 5381)
  )

  const manufacturers = ['Hikvision', 'Dahua', 'Uniview', 'EdgeCam']
  const models = ['IPC-A', 'IPC-B', 'NVR-X', 'PTZ-Z']
  const baseId = params.platformId.endsWith('1') ? '3402000000132000' : '3402000000133000'

  function pick<T>(arr: T[]) {
    return arr[Math.floor(rand() * arr.length)]
  }

  function makeStatus(): GbStatus {
    const r = rand()
    return r < 0.78 ? '在线' : r < 0.92 ? '离线' : '异常'
  }

  return Array.from({ length: count }).map((_, i): GbChannel => {
    const id = `${baseId}${String(100000 + i).slice(1)}`
    const status = makeStatus()
    return {
      id,
      name: `通道${String(i + 1).padStart(3, '0')}`,
      manufacturer: pick(manufacturers),
      model: pick(models),
      status,
      updatedAtMs: nowMs - Math.floor(rand() * 24 * 60 * 60 * 1000),
    }
  })
}

