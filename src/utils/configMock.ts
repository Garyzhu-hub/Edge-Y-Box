export type ConfigValueType = 'text' | 'number' | 'boolean' | 'json' | 'secret'

export type ConfigItem = {
  id: string
  group: string
  key: string
  label: string
  type: ConfigValueType
  value?: string
  secretConfigured?: boolean
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

export function makeDefaultConfig(nowMs = Date.now()): ConfigItem[] {
  const rand = mulberry32(20260311)
  const base = nowMs - 10 * 24 * 60 * 60 * 1000

  const list: ConfigItem[] = [
    {
      id: 'C-00001',
      group: '系统基础',
      key: 'system.projectName',
      label: '项目名称',
      type: 'text',
      value: '本地边缘（Demo）',
      updatedAtMs: base + Math.floor(rand() * 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'C-00002',
      group: '系统基础',
      key: 'system.timezone',
      label: '时区',
      type: 'text',
      value: 'Asia/Shanghai',
      updatedAtMs: base + Math.floor(rand() * 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'C-00003',
      group: '告警与工单',
      key: 'alarms.workOrderThreshold',
      label: '工单触发次数阈值',
      type: 'number',
      value: '4',
      updatedAtMs: base + Math.floor(rand() * 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'C-00004',
      group: '告警与工单',
      key: 'alarms.notifyEnabled',
      label: '启用通知推送',
      type: 'boolean',
      value: 'true',
      updatedAtMs: base + Math.floor(rand() * 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'C-00005',
      group: '存储与落盘',
      key: 'storage.snapshotPath',
      label: '抓图落盘路径',
      type: 'text',
      value: '/data/snapshots',
      updatedAtMs: base + Math.floor(rand() * 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'C-00006',
      group: '存储与落盘',
      key: 'storage.retentionDays',
      label: '保留天数',
      type: 'number',
      value: '30',
      updatedAtMs: base + Math.floor(rand() * 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'C-00007',
      group: '安全',
      key: 'security.apiKey',
      label: 'API Key',
      type: 'secret',
      secretConfigured: rand() > 0.3,
      updatedAtMs: base + Math.floor(rand() * 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'C-00008',
      group: '安全',
      key: 'security.webhookSecret',
      label: 'Webhook Secret',
      type: 'secret',
      secretConfigured: rand() > 0.5,
      updatedAtMs: base + Math.floor(rand() * 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'C-00009',
      group: '高级',
      key: 'system.advanced',
      label: '高级配置(JSON)',
      type: 'json',
      value: JSON.stringify({
        scheduler: { maxConcurrency: 3, jitterMs: 250 },
        ai: { retry: 2, timeoutMs: 3000 },
      }),
      updatedAtMs: base + Math.floor(rand() * 3 * 24 * 60 * 60 * 1000),
    },
  ]

  return list.sort((a, b) => a.group.localeCompare(b.group, 'zh-CN') || a.key.localeCompare(b.key))
}

