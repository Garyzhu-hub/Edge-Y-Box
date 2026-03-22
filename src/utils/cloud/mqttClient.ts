import mqtt, { type MqttClient } from 'mqtt'

export type CloudMqttConfig = {
  host: string
  port: number
  username: string
  clientId: string
  password?: string
  // MQTT over WebSocket path (commonly `/mqtt`)
  wsPath?: string
}

export type CloudMqttEnvelope<T = unknown> = {
  uuid: string
  timestamp: number
  version: string
  mac: string | null
  data: T
}

const PROTOCOL_VERSION = '2.0'

function makeUuid() {
  // Good-enough UUIDv4 style for correlation.
  // (No external deps; avoids crypto edge cases in older runtimes.)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function normalizeMac(mac: string) {
  return mac.trim().toUpperCase()
}

function buildWsUrl(cfg: CloudMqttConfig) {
  // Allow direct ws/wss URL in `host`.
  if (/^wss?:\/\//i.test(cfg.host)) return cfg.host
  const scheme = cfg.port === 443 ? 'wss' : 'ws'
  const path = cfg.wsPath?.trim() ? cfg.wsPath.trim() : '/mqtt'
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${scheme}://${cfg.host}:${cfg.port}${normalizedPath}`
}

async function connect(cfg: CloudMqttConfig) {
  const url = buildWsUrl(cfg)
  const client = mqtt.connect(url, {
    clientId: cfg.clientId,
    username: cfg.username || undefined,
    password: cfg.password || undefined,
    keepalive: 30,
    reconnectPeriod: 3_000,
    protocolVersion: 5,
    clean: true,
  })

  await new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('MQTT连接超时')), 10_000)
    client.once('connect', () => {
      window.clearTimeout(t)
      resolve()
    })
    client.once('error', (err) => {
      window.clearTimeout(t)
      reject(err instanceof Error ? err : new Error(String(err)))
    })
  })

  return client
}

export async function withCloudMqtt<T>(params: {
  cfg: CloudMqttConfig
  mac: string
  fn: (client: MqttClient, ctx: { uuid: string }) => Promise<T>
  timeoutMs?: number
}): Promise<T> {
  const client = await connect(params.cfg)
  const ctx = { uuid: makeUuid() }
  try {
    return await params.fn(client, ctx)
  } finally {
    // Best-effort; we don't want dangling connections in the demo.
    try {
      client.end(true)
    } catch {
      // ignore
    }
  }
}

export async function mqttRequestJson(params: {
  cfg: CloudMqttConfig
  mac: string
  requestTopic: string
  replyTopic: string
  data: any
  timeoutMs?: number
}): Promise<CloudMqttEnvelope<any>> {
  const uuid = makeUuid()
  const client = await connect(params.cfg)
  const safeMac = normalizeMac(params.mac)
  try {
    await new Promise<void>((resolve, reject) => {
      client.subscribe(params.replyTopic, { qos: 1 }, (err) => {
        if (err) reject(err instanceof Error ? err : new Error(String(err)))
        else resolve()
      })
    })

    const envelope: CloudMqttEnvelope = {
      uuid,
      timestamp: Date.now(),
      version: PROTOCOL_VERSION,
      mac: safeMac,
      data: params.data,
    }

    // Wait for correlated response.
    const res = await new Promise<CloudMqttEnvelope<any>>((resolve, reject) => {
      let done = false
      const timer = window.setTimeout(() => {
        if (done) return
        done = true
        client.removeListener('message', onMessage)
        reject(new Error(`MQTT响应超时（${params.replyTopic}）`))
      }, params.timeoutMs ?? 8000)

      const onMessage = (topic: string, payload: Buffer) => {
        if (done) return
        if (topic !== params.replyTopic) return
        const raw = payload?.toString?.() ?? ''
        if (!raw) return
        try {
          const parsed = JSON.parse(raw) as CloudMqttEnvelope<any>
          if (parsed?.uuid !== uuid) return
          done = true
          window.clearTimeout(timer)
          client.removeListener('message', onMessage)
          resolve(parsed)
        } catch {
          // ignore non-JSON messages
        }
      }

      client.on('message', onMessage)
      client.publish(params.requestTopic, JSON.stringify(envelope), { qos: 1 })
    })

    return res
  } finally {
    try {
      client.end(true)
    } catch {
      // ignore
    }
  }
}

/** 仅建立 WebSocket MQTT 连接并立即断开，用于「连接测试」。 */
export async function mqttTestConnection(cfg: CloudMqttConfig): Promise<void> {
  const client = await connect(cfg)
  try {
    client.end(true)
  } catch {
    // ignore
  }
}

export async function mqttPublishJson(params: {
  cfg: CloudMqttConfig
  mac: string
  topic: string
  data: any
}): Promise<string> {
  const uuid = makeUuid()
  const client = await connect(params.cfg)
  try {
    const envelope: CloudMqttEnvelope = {
      uuid,
      timestamp: Date.now(),
      version: PROTOCOL_VERSION,
      mac: normalizeMac(params.mac),
      data: params.data,
    }
    client.publish(params.topic, JSON.stringify(envelope), { qos: 1 })
    return uuid
  } finally {
    try {
      client.end(true)
    } catch {
      // ignore
    }
  }
}

