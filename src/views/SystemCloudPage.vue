<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { appendManualLog } from '@/utils/logsMock'
import { mqttTestConnection, type CloudMqttConfig } from '@/utils/cloud/mqttClient'
import { getOssPolicy } from '@/utils/taskCloudSync'
import MqttPanel, { type MqttConfig } from '@/components/system/cloud/MqttPanel.vue'
import OssPanel, { type OssConfig } from '@/components/system/cloud/OssPanel.vue'
import SipPanel, { type SipConfig } from '@/components/system/cloud/SipPanel.vue'
import SmsPanel, { type SmsConfig } from '@/components/system/cloud/SmsPanel.vue'
import PhonePanel, { type PhoneConfig } from '@/components/system/cloud/PhonePanel.vue'

type Status = '未配置' | '未测试' | '可用' | '失败' | '测试中'

type Persisted = {
  // Edge-YBox server MAC, required by protocol topic `/.../{mac}`
  boxMac: string
  mqtt: MqttConfig
  oss: OssConfig
  sip: SipConfig
  sms: SmsConfig
  phone: PhoneConfig
}

const auth = useAuthStore()
const canEdit = computed(() => auth.hasPermission('system.cloud.edit'))

const STORAGE_KEY = 'edge_cloud_integrations_v1'
type IntegrationSection = Exclude<keyof Persisted, 'boxMac'>

function loadPersisted(): Persisted {
  const fallback: Persisted = {
    boxMac: '',
    mqtt: {
      enabled: false,
      host: 'mqtt.example.com',
      port: 1883,
      username: 'edge-box',
      clientId: 'edge-ybox-01',
      topic: 'edge/ybox/telemetry',
      password: '',
      wsPath: '/mqtt',
      secretConfigured: false,
    },
    oss: {
      enabled: false,
      endpoint: 'https://oss.example.com',
      bucket: 'edge-ybox',
      region: 'cn-demo-1',
      accessKeyId: 'AKIDxxxxxxxx',
      secretConfigured: false,
    },
    sip: {
      enabled: false,
      server: 'sip.example.com',
      port: 5060,
      domain: 'example.com',
      username: '34020000002000000001',
      secretConfigured: false,
    },
    sms: {
      enabled: false,
      provider: 'MockSMS',
      endpoint: 'https://sms.example.com',
      signName: 'EdgeYBox',
      templateId: 'TPL_001',
      secretConfigured: false,
    },
    phone: {
      enabled: false,
      provider: 'MockCall',
      endpoint: 'https://call.example.com',
      callerId: '400-000-0000',
      secretConfigured: false,
    },
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Persisted
    return { ...fallback, ...parsed, boxMac: (parsed as any).boxMac ?? fallback.boxMac }
  } catch {
    return fallback
  }
}

function savePersisted(next: Persisted) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

const tab = ref<'mqtt' | 'oss' | 'sip' | 'sms' | 'phone'>('mqtt')

const persisted = reactive<Persisted>(loadPersisted())

const status = reactive<Record<string, Status>>({
  mqtt: '未测试',
  oss: '未测试',
  sip: '未测试',
  sms: '未测试',
  phone: '未测试',
})

const testing = reactive<Record<string, boolean>>({
  mqtt: false,
  oss: false,
  sip: false,
  sms: false,
  phone: false,
})

const secrets = reactive({
  mqttPassword: '',
  ossAccessKeySecret: '',
  sipPassword: '',
  smsApiKey: '',
  phoneApiKey: '',
})

function statusType(s: Status) {
  if (s === '可用') return 'success'
  if (s === '测试中') return 'warning'
  if (s === '失败') return 'danger'
  if (s === '未配置') return 'info'
  return 'info'
}

function normalizeMac(mac: string) {
  return mac.trim().toUpperCase()
}

/** 当前表单可连 MQTT（含未保存到 localStorage 的密码输入框）。 */
function buildMqttCfgFromForm(): CloudMqttConfig | null {
  const m = persisted.mqtt
  const pwd = secrets.mqttPassword.trim() || m.password
  if (!m.enabled || !m.host || !m.port || !m.username || !m.clientId || !pwd) return null
  return {
    host: m.host,
    port: m.port,
    username: m.username,
    clientId: m.clientId,
    password: pwd,
    wsPath: m.wsPath,
  }
}

/** OSS 测试走 MQTT `get-oss`，需启用 OSS、填写 Box MAC，且 MQTT 表单完整。 */
function canRunOssMqttTest() {
  return persisted.oss.enabled && Boolean(persisted.boxMac?.trim()) && buildMqttCfgFromForm() !== null
}

function isConfigured(key: IntegrationSection) {
  if (key === 'mqtt') {
    return buildMqttCfgFromForm() !== null
  }
  if (key === 'oss') {
    const o = persisted.oss
    return Boolean(o.endpoint) && Boolean(o.bucket) && Boolean(o.accessKeyId) && o.secretConfigured
  }
  if (key === 'sip') {
    const s = persisted.sip
    return Boolean(s.server) && Boolean(s.port) && Boolean(s.username) && s.secretConfigured
  }
  if (key === 'sms') {
    const s = persisted.sms
    return Boolean(s.provider) && Boolean(s.endpoint) && s.secretConfigured
  }
  const p = persisted.phone
  return Boolean(p.provider) && Boolean(p.endpoint) && p.secretConfigured
}

async function runTest(key: IntegrationSection, label: string) {
  if (!persisted[key].enabled) {
    ElMessage.warning('请先启用后再测试')
    return
  }
  if (key === 'oss') {
    if (!canRunOssMqttTest()) {
      status.oss = '未配置'
      ElMessage.warning('OSS 测试需：启用 OSS、填写 Box MAC，并启用且填完整 MQTT（含密码）')
      return
    }
  } else if (!isConfigured(key)) {
    status[key] = '未配置'
    ElMessage.warning('配置不完整或密钥未设置')
    return
  }

  testing[key] = true
  status[key] = '测试中'
  const reqId = `cloud_test_${key}_${Date.now()}`
  appendManualLog({
    kind: 'communication',
    tsMs: Date.now(),
    level: 'info',
    module: '云平台对接',
    action: '测试',
    summary: `${label} 连接测试开始`,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: reqId,
    detail: { section: key, stage: 'start' },
  })

  try {
    if (key === 'mqtt') {
      const cfg = buildMqttCfgFromForm()
      if (!cfg) {
        status.mqtt = '未配置'
        ElMessage.warning('请填写 Host、端口、用户名、ClientId，并输入 MQTT 密码')
        return
      }
      await mqttTestConnection(cfg)
      status.mqtt = '可用'
      appendManualLog({
        kind: 'communication',
        tsMs: Date.now(),
        level: 'info',
        module: '云平台对接',
        action: '测试',
        summary: `${label} WebSocket 连接成功`,
        operator: 'admin',
        ip: '127.0.0.1',
        requestId: `${reqId}_done`,
        detail: { section: key, stage: 'done', ok: true },
      })
      ElMessage.success('MQTT 连接成功')
    } else if (key === 'oss') {
      const cfg = buildMqttCfgFromForm()!
      const mac = normalizeMac(persisted.boxMac)
      await getOssPolicy(cfg, mac)
      status.oss = '可用'
      appendManualLog({
        kind: 'communication',
        tsMs: Date.now(),
        level: 'info',
        module: '云平台对接',
        action: '测试',
        summary: `${label} MQTT get-oss 鉴权成功`,
        operator: 'admin',
        ip: '127.0.0.1',
        requestId: `${reqId}_done`,
        detail: { section: key, stage: 'done', ok: true },
      })
      ElMessage.success('OSS 鉴权成功（已通过 MQTT 拉取上传策略）')
    } else {
      await new Promise((r) => setTimeout(r, 600))
      const ok = Math.random() > 0.18
      status[key] = ok ? '可用' : '失败'
      appendManualLog({
        kind: 'communication',
        tsMs: Date.now(),
        level: ok ? 'info' : 'warn',
        module: '云平台对接',
        action: '测试',
        summary: `${label} 连接测试${ok ? '通过' : '失败'}（演示）`,
        operator: 'admin',
        ip: '127.0.0.1',
        requestId: `${reqId}_done`,
        detail: { section: key, stage: 'done', ok },
      })
      if (ok) ElMessage.success('测试通过（演示）')
      else ElMessage.error('测试失败（演示）')
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    status[key] = '失败'
    appendManualLog({
      kind: 'communication',
      tsMs: Date.now(),
      level: 'warn',
      module: '云平台对接',
      action: '测试',
      summary: `${label} 连接测试失败：${msg}`,
      operator: 'admin',
      ip: '127.0.0.1',
      requestId: `${reqId}_err`,
      detail: { section: key, stage: 'error', error: msg },
    })
    ElMessage.error(msg)
  } finally {
    testing[key] = false
  }
}

function applySecretUpdates() {
  if (secrets.mqttPassword.trim()) {
    persisted.mqtt.password = secrets.mqttPassword.trim()
    persisted.mqtt.secretConfigured = true
  }
  if (secrets.ossAccessKeySecret.trim()) persisted.oss.secretConfigured = true
  if (secrets.sipPassword.trim()) persisted.sip.secretConfigured = true
  if (secrets.smsApiKey.trim()) persisted.sms.secretConfigured = true
  if (secrets.phoneApiKey.trim()) persisted.phone.secretConfigured = true
}

function clearSecretInputs() {
  secrets.mqttPassword = ''
  secrets.ossAccessKeySecret = ''
  secrets.sipPassword = ''
  secrets.smsApiKey = ''
  secrets.phoneApiKey = ''
}

function onToggleSection(section: IntegrationSection, enabled: boolean) {
  persisted[section].enabled = enabled
  appendManualLog({
    kind: 'operation',
    tsMs: Date.now(),
    level: 'info',
    module: '云平台对接',
    action: enabled ? '启用' : '停用',
    summary: `${section} 已${enabled ? '启用' : '停用'}`,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `cloud_toggle_${section}_${Date.now()}`,
    detail: { section, enabled },
  })
}

function updateSection<K extends IntegrationSection>(section: K, next: Persisted[K]) {
  const prevEnabled = persisted[section].enabled
  persisted[section] = next
  if (prevEnabled !== next.enabled) {
    onToggleSection(section, next.enabled)
  }
}

function onSave() {
  if (!canEdit.value) {
    ElMessage.warning('当前角色无云平台对接编辑权限')
    return
  }
  applySecretUpdates()
  persisted.boxMac = persisted.boxMac.trim().toUpperCase()
  savePersisted(persisted)
  clearSecretInputs()
  appendManualLog({
    kind: 'operation',
    tsMs: Date.now(),
    level: 'info',
    module: '云平台对接',
    action: '保存',
    summary: '云平台对接配置已保存',
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `cloud_save_${Date.now()}`,
    detail: {
      boxMac: persisted.boxMac,
      mqtt: { enabled: persisted.mqtt.enabled, secretConfigured: persisted.mqtt.secretConfigured },
      oss: { enabled: persisted.oss.enabled, secretConfigured: persisted.oss.secretConfigured },
      sip: { enabled: persisted.sip.enabled, secretConfigured: persisted.sip.secretConfigured },
      sms: { enabled: persisted.sms.enabled, secretConfigured: persisted.sms.secretConfigured },
      phone: { enabled: persisted.phone.enabled, secretConfigured: persisted.phone.secretConfigured },
    },
  })
  ElMessage.success('已保存')
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">云平台对接</div>
        <div class="mt-1 text-xs text-zinc-500">MQTT / 对象存储 / SIP / 短信 / 电话对接配置（演示）。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-button v-if="canEdit" type="primary" @click="onSave">保存配置</el-button>
      </div>
    </div>

    <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
      <div class="flex flex-wrap items-center gap-3">
        <div class="font-medium text-zinc-900">Edge Box MAC（协议 topic 使用）</div>
        <el-input
          v-model="persisted.boxMac"
          placeholder="例如：C2:52:49:4C:03:2A"
          style="width: 320px"
          clearable
          :disabled="!canEdit"
        />
      </div>
      <div class="mt-1 text-zinc-500">用于协议里的 `{mac}` 主题字段，必须大写。</div>
    </div>

    <el-tabs v-model="tab" type="card">
      <el-tab-pane label="MQTT" name="mqtt">
        <MqttPanel
          :model="persisted.mqtt"
          :status-text="status.mqtt"
          :status-type="statusType(status.mqtt)"
          :testing="testing.mqtt"
          :secret-value="secrets.mqttPassword"
          @update:model="(m) => updateSection('mqtt', m)"
          @update:secret-value="(v) => (secrets.mqttPassword = v)"
          @test="() => runTest('mqtt', 'MQTT')"
        />
      </el-tab-pane>

      <el-tab-pane label="对象存储(OSS)" name="oss">
        <OssPanel
          :model="persisted.oss"
          :status-text="status.oss"
          :status-type="statusType(status.oss)"
          :testing="testing.oss"
          :secret-value="secrets.ossAccessKeySecret"
          @update:model="(m) => updateSection('oss', m)"
          @update:secret-value="(v) => (secrets.ossAccessKeySecret = v)"
          @test="() => runTest('oss', 'OSS')"
        />
      </el-tab-pane>

      <el-tab-pane label="SIP" name="sip">
        <SipPanel
          :model="persisted.sip"
          :status-text="status.sip"
          :status-type="statusType(status.sip)"
          :testing="testing.sip"
          :secret-value="secrets.sipPassword"
          @update:model="(m) => updateSection('sip', m)"
          @update:secret-value="(v) => (secrets.sipPassword = v)"
          @test="() => runTest('sip', 'SIP')"
        />
      </el-tab-pane>

      <el-tab-pane label="短信" name="sms">
        <SmsPanel
          :model="persisted.sms"
          :status-text="status.sms"
          :status-type="statusType(status.sms)"
          :testing="testing.sms"
          :secret-value="secrets.smsApiKey"
          @update:model="(m) => updateSection('sms', m)"
          @update:secret-value="(v) => (secrets.smsApiKey = v)"
          @test="() => runTest('sms', '短信')"
        />
      </el-tab-pane>

      <el-tab-pane label="电话" name="phone">
        <PhonePanel
          :model="persisted.phone"
          :status-text="status.phone"
          :status-type="statusType(status.phone)"
          :testing="testing.phone"
          :secret-value="secrets.phoneApiKey"
          @update:model="(m) => updateSection('phone', m)"
          @update:secret-value="(v) => (secrets.phoneApiKey = v)"
          @test="() => runTest('phone', '电话')"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
