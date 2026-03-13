export type LogKind = 'operation' | 'system' | 'security' | 'communication'
export type LogLevel = 'info' | 'warn' | 'error'

export type LogRecord = {
  id: string
  kind: LogKind
  tsMs: number
  level: LogLevel
  module: string
  action: string
  summary: string
  operator: string
  ip: string
  requestId: string
  detail: Record<string, unknown>
}

const MANUAL_LOGS_KEY = 'edge_manual_logs_v1'

function isBrowser() {
  return typeof window !== 'undefined'
}

function loadManualLogs(): LogRecord[] {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(MANUAL_LOGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as LogRecord[]
  } catch {
    return []
  }
}

function saveManualLogs(list: LogRecord[]) {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(MANUAL_LOGS_KEY, JSON.stringify(list.slice(0, 500)))
  } catch {
    return
  }
}

export function appendManualLog(entry: Omit<LogRecord, 'id'> & { id?: string }) {
  const now = Date.now()
  const list = loadManualLogs()
  const id = entry.id || `MANUAL-${String(now)}-${Math.floor(Math.random() * 1000)}`
  const next: LogRecord = { id, ...entry }
  saveManualLogs([next, ...list])
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

function pick<T>(rand: Rand, arr: T[]) {
  return arr[Math.floor(rand() * arr.length)]
}

function makeId(prefix: string, i: number) {
  return `${prefix}-${String(10000 + i).padStart(5, '0')}`
}

function makeRequestId(rand: Rand) {
  const a = Math.floor(rand() * 1e6)
  const b = Math.floor(rand() * 1e6)
  return `req_${a.toString(16)}_${b.toString(16)}`
}

function makeIp(rand: Rand) {
  return `10.${20 + Math.floor(rand() * 10)}.${10 + Math.floor(rand() * 200)}.${10 + Math.floor(rand() * 200)}`
}

export function kindLabel(kind: LogKind) {
  if (kind === 'operation') return '操作日志'
  if (kind === 'system') return '系统日志'
  if (kind === 'security') return '安全日志'
  return '通信日志'
}

export function modulesByKind(kind: LogKind) {
  if (kind === 'operation') return ['任务管理', '告警工单', '摄像头管理', '算法管理', '布点管理', '用户与权限']
  if (kind === 'system') return ['边缘服务', '推理引擎', '存储服务', '调度器', '健康检查']
  if (kind === 'security') return ['认证', '授权', '审计', '策略', '密钥管理']
  return ['GB28181', 'RTSP', 'ONVIF', 'MQTT', 'WebSocket']
}

export function makeMockLogs(params: { kind: LogKind; fromMs: number; toMs: number; count?: number }) {
  const count = params.count ?? 80
  const { kind, fromMs, toMs } = params
  const rand = mulberry32(seedFromText(`${kind}-${fromMs}-${toMs}`))
  const modules = modulesByKind(kind)
  const operators = ['system', 'admin', 'project_user', 'ops']

  const actionsByKind: Record<LogKind, string[]> = {
    operation: ['创建', '编辑', '删除', '同步', '启用', '停用', '回滚', '导出'],
    system: ['启动', '停止', '重连', '加载配置', '刷新缓存', '心跳', 'GC'],
    security: ['登录', '登出', '鉴权', '拒绝访问', '更新策略', '口令校验'],
    communication: ['建连', '断连', '握手', '拉流', '推流', '超时', '重试'],
  }

  const summariesByKind: Record<LogKind, string[]> = {
    operation: ['操作成功', '操作失败', '已提交异步任务', '已完成下发', '回滚已触发'],
    system: ['服务健康', '模块异常', '配置已更新', '资源紧张', '自动恢复'],
    security: ['登录成功', '登录失败', '权限不足', '策略命中', '审计记录写入'],
    communication: ['链路稳定', '网络抖动', '连接失败', '重连成功', '超时丢包'],
  }

  function makeLevel() {
    const r = rand()
    return r < 0.74 ? 'info' : r < 0.92 ? 'warn' : 'error'
  }

  const range = Math.max(1, toMs - fromMs)
  const list = Array.from({ length: count }).map((_, i): LogRecord => {
    const tsMs = fromMs + Math.floor(rand() * range)
    const module = pick(rand, modules)
    const action = pick(rand, actionsByKind[kind])
    const level = makeLevel()
    const summary = pick(rand, summariesByKind[kind])
    const operator = pick(rand, operators)
    const requestId = makeRequestId(rand)
    const ip = makeIp(rand)

    const detail: Record<string, unknown> = {
      kind,
      module,
      action,
      outcome: level === 'error' ? 'failed' : 'ok',
      requestId,
      operator,
      ip,
      latencyMs: 20 + Math.floor(rand() * 900),
    }

    if (kind === 'security') {
      detail.subject = operator
      detail.resource = pick(rand, ['tasks', 'devices', 'algorithms', 'deployments', 'logs'])
      detail.permission = `${String(detail.resource)}.view`
    }

    if (kind === 'communication') {
      detail.protocol = pick(rand, ['tcp', 'udp', 'ws', 'http'])
      detail.remote = `172.16.${10 + Math.floor(rand() * 10)}.${10 + Math.floor(rand() * 200)}`
    }

    return {
      id: makeId(kind.toUpperCase(), i),
      kind,
      tsMs,
      level,
      module,
      action,
      summary,
      operator,
      ip,
      requestId,
      detail,
    }
  })

  const manual = loadManualLogs().filter((x) => x.kind === kind && x.tsMs >= fromMs && x.tsMs <= toMs)
  return [...manual, ...list].sort((a, b) => b.tsMs - a.tsMs)
}
