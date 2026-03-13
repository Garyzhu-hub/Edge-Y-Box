export type DeploymentStatus = '已启用' | '已停用'

export type DeploymentRunStatus = '运行中' | '已暂停' | '异常'

export type RepeatCycle = '每天' | '工作日' | '周末' | '自定义'
export type TimeSlot = { start: string; end: string }

export type RoiShape = {
  id: string
  name: string
  type: 'polygon' | 'rect'
  enabled: boolean
  points: number
  vertices?: { x: number; y: number }[]
  paramsOverride?: {
    confidence?: number
    triggerCount?: number
  }
}

export type DeploymentParams = {
  repeat: RepeatCycle
  timeSlots: TimeSlot[]
}

export type InstanceParams = {
  confidence: number
  triggerCount: number
  cooldownSec: number
  sensitivity: number
  linkSnapshot: boolean
  popup: boolean
  sound: boolean
}

export type AlgorithmInstance = {
  id: string
  algorithmId: string
  algorithmName: string
  version: string
  enabled: boolean
  rois: RoiShape[]
  params: InstanceParams
}

export type Deployment = {
  id: string
  name: string
  cameraId: string
  cameraLabel: string
  status: DeploymentStatus
  runStatus: DeploymentRunStatus
  instances: AlgorithmInstance[]
  params: DeploymentParams
  updatedAtMs: number
}

export function defaultDeploymentParams(): DeploymentParams {
  return {
    repeat: '工作日',
    timeSlots: [{ start: '09:00', end: '18:00' }],
  }
}

export function defaultInstanceParams(): InstanceParams {
  return {
    confidence: 0.72,
    triggerCount: 3,
    cooldownSec: 20,
    sensitivity: 60,
    linkSnapshot: true,
    popup: true,
    sound: false,
  }
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

export function makeMockDeployments(seed = 20260311) {
  const rand = mulberry32(seed)
  const cameras = [
    { id: 'CAM-10000', label: '北门出入口-3' },
    { id: 'CAM-10001', label: '东门岗亭-1' },
    { id: 'CAM-10002', label: '景观广场-1' },
    { id: 'CAM-10003', label: '1号楼大堂-2' },
    { id: 'CAM-10004', label: '地库B2-5' },
  ]
  const algorithms = [
    { id: 'ALG-10001', name: '安全帽检测' },
    { id: 'ALG-10002', name: '离岗检测' },
    { id: 'ALG-10003', name: '违停占道检测' },
    { id: 'ALG-10004', name: '火焰识别' },
    { id: 'ALG-10005', name: '公共区域卫生' },
  ]

  function makeVersion() {
    const major = 1 + Math.floor(rand() * 2)
    const minor = Math.floor(rand() * 6)
    const patch = Math.floor(rand() * 10)
    return `v${major}.${minor}.${patch}`
  }

  function makeRois(): RoiShape[] {
    const n = 1 + Math.floor(rand() * 3)
    return Array.from({ length: n }).map((_, i) => {
      const isRect = rand() < 0.35
      const vertices = isRect
        ? [
            { x: 0.18 + rand() * 0.2, y: 0.22 + rand() * 0.2 },
            { x: 0.55 + rand() * 0.2, y: 0.22 + rand() * 0.2 },
            { x: 0.55 + rand() * 0.2, y: 0.58 + rand() * 0.2 },
            { x: 0.18 + rand() * 0.2, y: 0.58 + rand() * 0.2 },
          ]
        : [
            { x: 0.2 + rand() * 0.25, y: 0.25 + rand() * 0.2 },
            { x: 0.45 + rand() * 0.25, y: 0.18 + rand() * 0.2 },
            { x: 0.7 + rand() * 0.2, y: 0.35 + rand() * 0.2 },
            { x: 0.62 + rand() * 0.2, y: 0.68 + rand() * 0.2 },
            { x: 0.3 + rand() * 0.25, y: 0.7 + rand() * 0.2 },
          ]
      return {
        id: `ROI-${String(100 + i).padStart(3, '0')}`,
        name: `ROI-${i + 1}`,
        type: isRect ? 'rect' : 'polygon',
        enabled: rand() > 0.08,
        points: vertices.length,
        vertices,
        paramsOverride: rand() > 0.75 ? { confidence: 0.6 + rand() * 0.3 } : undefined,
      }
    })
  }

  function makeDeploymentParams(): DeploymentParams {
    const repeat: RepeatCycle = rand() < 0.55 ? '工作日' : rand() < 0.75 ? '每天' : rand() < 0.9 ? '周末' : '自定义'
    const slots: TimeSlot[] = repeat === '自定义' ? [{ start: '10:00', end: '16:00' }] : [{ start: '09:00', end: '18:00' }]
    return { repeat, timeSlots: slots }
  }

  function makeInstanceParams(): InstanceParams {
    return {
      confidence: Math.round((0.55 + rand() * 0.35) * 100) / 100,
      triggerCount: 2 + Math.floor(rand() * 4),
      cooldownSec: 10 + Math.floor(rand() * 50),
      sensitivity: 40 + Math.floor(rand() * 50),
      linkSnapshot: rand() > 0.2,
      popup: rand() > 0.2,
      sound: rand() > 0.7,
    }
  }

  return Array.from({ length: 10 }).map((_, i): Deployment => {
    const camera = cameras[Math.floor(rand() * cameras.length)]
    const instanceCount = 1 + Math.floor(rand() * 3)
    const instanceList: AlgorithmInstance[] = Array.from({ length: instanceCount }).map((__, j) => {
      const alg = algorithms[Math.floor(rand() * algorithms.length)]
      return {
        id: `INS-${String(1000 + i * 10 + j).padStart(4, '0')}`,
        algorithmId: alg.id,
        algorithmName: alg.name,
        version: makeVersion(),
        enabled: rand() > 0.15,
        rois: makeRois(),
        params: makeInstanceParams(),
      }
    })

    const status: DeploymentStatus = rand() > 0.2 ? '已启用' : '已停用'
    const runStatus: DeploymentRunStatus = status === '已停用' ? '已暂停' : rand() > 0.08 ? '运行中' : '异常'
    const updatedAtMs = Date.now() - Math.floor(rand() * 10 * 24 * 60 * 60 * 1000)
    return {
      id: `DEP-${String(10001 + i).padStart(5, '0')}`,
      name: `布点-${camera.label}-${i + 1}`,
      cameraId: camera.id,
      cameraLabel: camera.label,
      status,
      runStatus,
      instances: instanceList,
      params: makeDeploymentParams(),
      updatedAtMs,
    }
  })
}

export function makeCameraOptions() {
  return [
    { id: 'CAM-10000', label: '北门出入口-3' },
    { id: 'CAM-10001', label: '东门岗亭-1' },
    { id: 'CAM-10002', label: '景观广场-1' },
    { id: 'CAM-10003', label: '1号楼大堂-2' },
    { id: 'CAM-10004', label: '地库B2-5' },
  ]
}

export function makeAlgorithmOptions() {
  return [
    { id: 'ALG-10001', label: '安全帽检测' },
    { id: 'ALG-10002', label: '离岗检测' },
    { id: 'ALG-10003', label: '违停占道检测' },
    { id: 'ALG-10004', label: '火焰识别' },
    { id: 'ALG-10005', label: '公共区域卫生' },
  ]
}
