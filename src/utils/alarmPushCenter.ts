import { appendManualLog } from '@/utils/logsMock'
import { loadAlarmSettings } from '@/utils/alarmSettingsStore'
import { makeDefaultPeople, type PersonRecord } from '@/utils/peopleMock'
import type { AlarmRecord } from '@/components/alarms/AlarmDetailDialog.vue'

type CloudPersisted = {
  mqtt: { enabled: boolean; topic: string; secretConfigured: boolean }
  oss: { enabled: boolean; bucket: string; secretConfigured: boolean }
  sip: { enabled: boolean; secretConfigured: boolean }
  sms: { enabled: boolean; provider: string; endpoint: string; signName: string; templateId: string; secretConfigured: boolean }
  phone: { enabled: boolean; provider: string; endpoint: string; callerId: string; secretConfigured: boolean }
}

export type AlarmPushChannel = 'cloudPush' | 'sms' | 'phone'
export type AlarmPushStatus = '待发送' | '发送中' | '成功' | '失败'

export type AlarmPushJob = {
  id: string
  createdAtMs: number
  alarmId: string
  detectionId: string
  level: AlarmRecord['level']
  alarmType: string
  cameraLabel: string
  workOrderId?: string
  sourceUrl?: string
  analyzedUrl?: string
  channel: AlarmPushChannel
  targets: string[]
  status: AlarmPushStatus
  attempt: number
  lastAttemptAtMs: number
  message: string
}

const PUSH_JOBS_KEY = 'edge_alarm_push_jobs_v1'
const CLOUD_OUTBOX_KEY = 'edge_cloud_alarm_push_outbox_v1'
const CLOUD_PUBLISHED_IDS_KEY = 'edge_cloud_alarm_push_published_ids_v1'
const PEOPLE_KEY = 'edge_people_v1'
const CLOUD_KEY = 'edge_cloud_integrations_v1'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJson(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v))
  } catch {
    return
  }
}

function loadCloud(): CloudPersisted {
  const fallback: CloudPersisted = {
    mqtt: { enabled: false, topic: 'edge/ybox/telemetry', secretConfigured: false },
    oss: { enabled: false, bucket: 'edge-ybox', secretConfigured: false },
    sip: { enabled: false, secretConfigured: false },
    sms: {
      enabled: false,
      provider: 'MockSMS',
      endpoint: 'https://sms.example.com',
      signName: 'EdgeYBox',
      templateId: 'TPL_001',
      secretConfigured: false,
    },
    phone: { enabled: false, provider: 'MockCall', endpoint: 'https://call.example.com', callerId: '400-000-0000', secretConfigured: false },
  }
  const parsed = loadJson<Partial<CloudPersisted>>(CLOUD_KEY, {})
  return {
    ...fallback,
    ...parsed,
    mqtt: { ...fallback.mqtt, ...(parsed as any).mqtt },
    oss: { ...fallback.oss, ...(parsed as any).oss },
    sip: { ...fallback.sip, ...(parsed as any).sip },
    sms: { ...fallback.sms, ...(parsed as any).sms },
    phone: { ...fallback.phone, ...(parsed as any).phone },
  }
}

function loadPeople(): PersonRecord[] {
  try {
    const raw = window.localStorage.getItem(PEOPLE_KEY)
    if (!raw) return makeDefaultPeople()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return makeDefaultPeople()
    return parsed as PersonRecord[]
  } catch {
    return makeDefaultPeople()
  }
}

function addOutbox(row: Record<string, unknown>) {
  const list = loadJson<Record<string, unknown>[]>(CLOUD_OUTBOX_KEY, [])
  list.unshift(row)
  saveJson(CLOUD_OUTBOX_KEY, list.slice(0, 500))
}

function loadPublishedIds() {
  const list = loadJson<string[]>(CLOUD_PUBLISHED_IDS_KEY, [])
  return new Set(Array.isArray(list) ? list.filter(Boolean) : [])
}

function savePublishedIds(ids: Set<string>) {
  saveJson(CLOUD_PUBLISHED_IDS_KEY, Array.from(ids).slice(-5000))
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

function hashText(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function loadAlarmPushJobs() {
  const list = loadJson<AlarmPushJob[]>(PUSH_JOBS_KEY, [])
  return Array.isArray(list) ? list : ([] as AlarmPushJob[])
}

function saveAlarmPushJobs(list: AlarmPushJob[]) {
  saveJson(PUSH_JOBS_KEY, list.slice(0, 500))
}

export function clearAlarmPushJobs() {
  saveAlarmPushJobs([])
}

function upsertJob(job: AlarmPushJob) {
  const list = loadAlarmPushJobs()
  const idx = list.findIndex((x) => x.id === job.id)
  if (idx >= 0) list[idx] = { ...job }
  else list.unshift(job)
  saveAlarmPushJobs(list)
}

function resolveTargets(level: AlarmRecord['level']) {
  const settings = loadAlarmSettings()
  const ids = settings.notify[level] || []
  const people = loadPeople()
  return ids
    .map((id) => people.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => (p as PersonRecord).phone)
    .filter(Boolean)
}

function shouldSendChannel(params: { record: AlarmRecord; channel: AlarmPushChannel }) {
  const settings = loadAlarmSettings()
  const policy = settings.policy[params.record.level]
  if (!policy) return false
  if (params.channel === 'cloudPush') {
    if (!policy.cloudPush) return false
    if (settings.cloudPushWorkOrdersOnly && !params.record.workOrderId) return false
    return true
  }
  if (params.channel === 'sms') return !!policy.sms
  if (params.channel === 'phone') return !!policy.phone
  return false
}

function canUseChannel(channel: AlarmPushChannel) {
  const cloud = loadCloud()
  if (channel === 'cloudPush') return cloud.mqtt.enabled && cloud.mqtt.secretConfigured
  if (channel === 'sms') return cloud.sms.enabled && cloud.sms.secretConfigured
  if (channel === 'phone') return cloud.phone.enabled && cloud.phone.secretConfigured
  return false
}

function sendResultSeed(job: AlarmPushJob) {
  const base = `${job.channel}|${job.alarmId}|${job.attempt}`
  return hashText(base)
}

function simulateSend(job: AlarmPushJob) {
  if (!canUseChannel(job.channel)) {
    return { ok: false, message: '通道未启用或密钥未配置' }
  }
  if (!job.targets.length && (job.channel === 'sms' || job.channel === 'phone')) {
    return { ok: false, message: '无可用收件人（未配置通知人员/手机号）' }
  }

  const seed = sendResultSeed(job)
  const fail = seed % 9 === 0
  if (fail && job.attempt < 2) return { ok: false, message: '网络波动：发送超时' }
  return { ok: true, message: '发送成功' }
}

function emitLog(job: AlarmPushJob, ok: boolean, msg: string) {
  const cloud = loadCloud()
  const settings = loadAlarmSettings()
  const topic = cloud.mqtt.topic || 'edge/ybox/telemetry'
  const channelLabel = job.channel === 'cloudPush' ? 'CloudPush' : job.channel === 'sms' ? 'SMS' : 'Phone'
  const imagesEnabled = !!settings.imagePushEnabled
  const imagePayload =
    job.channel === 'cloudPush' && imagesEnabled
      ? {
          sourceUrl: job.sourceUrl,
          analyzedUrl: job.analyzedUrl,
        }
      : {}
  addOutbox({
    id: `out_${job.id}_${Date.now()}`,
    tsMs: Date.now(),
    channel: job.channel,
    topic: job.channel === 'cloudPush' ? topic : '',
    ok,
    alarmId: job.alarmId,
    workOrderId: job.workOrderId || '',
    targets: job.targets,
    ...imagePayload,
  })
  appendManualLog({
    kind: 'communication',
    tsMs: Date.now(),
    level: ok ? 'info' : 'warn',
    module: channelLabel,
    action: '推送',
    summary: `${channelLabel}推送${ok ? '成功' : '失败'}：${job.alarmType}`,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `alarm_push_${job.id}_${Date.now()}`,
    detail: {
      channel: job.channel,
      alarmId: job.alarmId,
      detectionId: job.detectionId,
      workOrderId: job.workOrderId,
      targets: job.targets,
      message: msg,
      topic: job.channel === 'cloudPush' ? topic : undefined,
      ...(job.channel === 'cloudPush' && imagesEnabled
        ? { sourceUrl: job.sourceUrl, analyzedUrl: job.analyzedUrl, imagesEnabled: true }
        : { imagesEnabled: false }),
    },
  })
}

function processJob(job: AlarmPushJob) {
  const now = Date.now()
  const sending: AlarmPushJob = { ...job, status: '发送中', lastAttemptAtMs: now, attempt: job.attempt + 1, message: '发送中' }
  upsertJob(sending)

  const r = simulateSend(sending)
  const done: AlarmPushJob = {
    ...sending,
    status: r.ok ? '成功' : '失败',
    message: r.ok ? '发送成功' : r.message,
  }
  upsertJob(done)
  emitLog(done, r.ok, done.message)
  return done
}

export function retryAlarmPushJob(jobId: string) {
  const list = loadAlarmPushJobs()
  const job = list.find((x) => x.id === jobId)
  if (!job) return { ok: false as const, message: '未找到推送任务' }
  const done = processJob(job)
  return { ok: true as const, status: done.status }
}

export function enqueueAlarmNotifications(record: AlarmRecord) {
  const now = Date.now()
  const channels: AlarmPushChannel[] = ['cloudPush', 'sms', 'phone']
  const targets = resolveTargets(record.level)
  const published = loadPublishedIds()
  const created: AlarmPushJob[] = []
  const settings = loadAlarmSettings()
  const imagesEnabled = !!settings.imagePushEnabled

  for (const ch of channels) {
    if (!shouldSendChannel({ record, channel: ch })) continue
    const fingerprint = `${record.id}|${ch}`
    if (published.has(fingerprint)) continue
    published.add(fingerprint)
    const job: AlarmPushJob = {
      id: makeId('push'),
      createdAtMs: now,
      alarmId: record.id,
      detectionId: record.detectionId,
      level: record.level,
      alarmType: record.alarmType,
      cameraLabel: record.cameraLabel,
      workOrderId: record.workOrderId,
      sourceUrl: ch === 'cloudPush' && imagesEnabled ? record.sourceUrl : undefined,
      analyzedUrl: ch === 'cloudPush' && imagesEnabled ? record.analyzedUrl : undefined,
      channel: ch,
      targets: ch === 'cloudPush' ? [] : targets,
      status: '待发送',
      attempt: 0,
      lastAttemptAtMs: 0,
      message: '待发送',
    }
    upsertJob(job)
    created.push(job)
    processJob(job)
  }

  savePublishedIds(published)
  return { created: created.length }
}

