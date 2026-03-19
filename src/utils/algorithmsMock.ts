export type AlgorithmStatus = '已启用' | '已停用'

export type Algorithm = {
  id: string
  name: string
  category: string
  scene: string
  vendor: string
  currentVersion: string
  modelFormat?: string
  packageName?: string
  packageSource?: 'local_upload' | 'remote_download'
  description?: string
  remark?: string
  status: AlgorithmStatus
  versionHistory?: AlgorithmVersion[]
  rollbackHistory?: AlgorithmRollbackRecord[]
  updatedAtMs: number
  lastSyncAtMs: number
}

export type AlgorithmVersion = {
  version: string
  releasedAtMs: number
  notes: string
  isCurrent: boolean
}

export type AlgorithmRollbackRecord = {
  id: string
  tsMs: number
  fromVersion: string
  toVersion: string
  reason: string
  operator: string
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

function seedFromText(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function makeMockAlgorithms(seed = 20260311) {
  const rand = mulberry32(seed)
  const categories = ['安防', '作业合规', '消防', '环境']
  const scenes = ['园区出入口', '地库', '楼宇大堂', '景观广场', '公共区域']
  const vendors = ['EdgeAI Lab', 'VisionPro', 'ThirdParty']
  const names = ['安全帽检测', '离岗检测', '违停占道检测', '火焰识别', '公共区域卫生']

  return Array.from({ length: 12 }).map((_, i): Algorithm => {
    const name = names[i % names.length]
    const category = categories[Math.floor(rand() * categories.length)]
    const scene = scenes[Math.floor(rand() * scenes.length)]
    const vendor = vendors[Math.floor(rand() * vendors.length)]
    const major = 1 + Math.floor(rand() * 2)
    const minor = Math.floor(rand() * 6)
    const patch = Math.floor(rand() * 10)
    const currentVersion = `v${major}.${minor}.${patch}`
    const status: AlgorithmStatus = rand() > 0.22 ? '已启用' : '已停用'
    const updatedAtMs = Date.now() - Math.floor(rand() * 14 * 24 * 60 * 60 * 1000)
    const lastSyncAtMs = updatedAtMs + Math.floor(rand() * 6 * 60 * 60 * 1000)
    const versionHistory = makeMockVersions(`ALG-${String(10001 + i).padStart(5, '0')}`, currentVersion)
    return {
      id: `ALG-${String(10001 + i).padStart(5, '0')}`,
      name,
      category,
      scene,
      vendor,
      currentVersion,
      status,
      versionHistory,
      rollbackHistory: [],
      updatedAtMs,
      lastSyncAtMs,
    }
  })
}

export function makeMockVersions(algorithmId: string, currentVersion: string) {
  const rand = mulberry32(seedFromText(`${algorithmId}-${currentVersion}`))
  const now = Date.now()
  const baseMajor = 1 + Math.floor(rand() * 2)
  const baseMinor = 1 + Math.floor(rand() * 4)

  const list = Array.from({ length: 8 }).map((_, i): AlgorithmVersion => {
    const minor = Math.max(0, baseMinor - i)
    const patch = 2 + Math.floor(rand() * 9)
    const version = `v${baseMajor}.${minor}.${patch}`
    const releasedAtMs = now - (i + 1) * Math.floor((2 + rand() * 5) * 24 * 60 * 60 * 1000)
    const notes =
      i === 0
        ? '性能与稳定性优化'
        : i === 1
          ? '新增ROI兼容模式'
          : i === 2
            ? '修复误报边界案例'
            : '细节改进与修复'
    return {
      version,
      releasedAtMs,
      notes,
      isCurrent: version === currentVersion,
    }
  })

  if (!list.some((v) => v.isCurrent)) {
    list[0] = { ...list[0], version: currentVersion, isCurrent: true }
  }

  return list
}
