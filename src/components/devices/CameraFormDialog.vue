<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { formatDateTime } from '@/stores/app'

export type CameraProtocol = 'RTSP' | 'GB28181' | 'HTTP' | 'ONVIF'

export type Camera = {
  id: string
  name: string
  groupId: string
  ip: string
  port: number
  protocol: CameraProtocol
  streamUrl: string
  gbDeviceId?: string
  username: string
  password: string
  enabled: boolean
  updatedAtMs: number
}

type GroupOption = { id: string; label: string }

const props = defineProps<{
  modelValue: boolean
  initial: Camera | null
  groups: GroupOption[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved', camera: Camera): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const saving = ref(false)
const testing = ref(false)
const streamPath = ref('/Streaming/Channels/101')
const GB_RULE_KEY = 'edge_camera_gb_id_rule_v1'

type FormModel = Omit<Camera, 'id' | 'updatedAtMs'>

const form = reactive<FormModel>({
  name: '',
  groupId: '',
  ip: '',
  port: 554,
  protocol: 'RTSP',
  streamUrl: '',
  gbDeviceId: '',
  username: '',
  password: '',
  enabled: true,
})

type TestResult = {
  ok: boolean
  message: string
  latencyMs: number
  checkedAtMs: number
}

const testResult = ref<TestResult | null>(null)

function loadGbRulePrefix() {
  try {
    const raw = window.localStorage.getItem(GB_RULE_KEY)
    if (!raw) return '3402000000132'
    const parsed = JSON.parse(raw) as { prefix?: string }
    const digits = String(parsed?.prefix || '').replace(/\D/g, '')
    if (digits.length < 6) return '3402000000132'
    return digits.slice(0, 19)
  } catch {
    return '3402000000132'
  }
}

function saveGbRulePrefix(prefix: string) {
  try {
    window.localStorage.setItem(GB_RULE_KEY, JSON.stringify({ prefix }))
  } catch {
    return
  }
}

const gbRulePrefix = ref(loadGbRulePrefix())

const formRef = ref()

const title = computed(() => (props.initial ? '编辑摄像头' : '新增摄像头'))

const testTagType = computed(() => {
  if (!testResult.value) return 'info'
  return testResult.value.ok ? 'success' : 'danger'
})

function ensureStreamPath(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return '/Streaming/Channels/101'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function inferStreamPath(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return '/Streaming/Channels/101'
  const m = trimmed.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/[^/]+(\/.*)$/)
  if (!m || !m[1]) return '/Streaming/Channels/101'
  return m[1]
}

function fnv1a32(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function normalizeGbPrefix() {
  const digits = gbRulePrefix.value.replace(/\D/g, '')
  const normalized = (digits || '3402000000132').slice(0, 19)
  gbRulePrefix.value = normalized
  saveGbRulePrefix(normalized)
  return normalized
}

function generateGbDeviceId() {
  const prefix = normalizeGbPrefix()
  const suffixLen = Math.max(1, 20 - prefix.length)
  const seed = `${form.name}|${form.ip}|${form.port}|${Date.now()}|${Math.random()}`
  const mod = Math.pow(10, suffixLen)
  const suffix = String(fnv1a32(seed) % mod).padStart(suffixLen, '0')
  form.gbDeviceId = `${prefix}${suffix}`.slice(0, 20)
}

function buildStreamUrl() {
  const ip = form.ip.trim()
  const path = ensureStreamPath(streamPath.value)
  const auth = form.username ? `${encodeURIComponent(form.username)}:${encodeURIComponent(form.password)}@` : ''
  if (form.protocol === 'RTSP') return `rtsp://${auth}${ip}:${Number(form.port) || 554}${path}`
  if (form.protocol === 'ONVIF') return `onvif://${auth}${ip}:${Number(form.port) || 80}${path}`
  if (form.protocol === 'HTTP') return `http://${ip}:${Number(form.port) || 80}${path}`
  const gbId = (form.gbDeviceId || '').trim() || `${ip}:${Number(form.port) || 5060}`
  return `gb28181://${gbId}`
}

async function copyText(text: string, emptyMsg: string) {
  const value = text.trim()
  if (!value) {
    ElMessage.warning(emptyMsg)
    return
  }
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success('已复制')
  } catch {
    ElMessage.warning('复制失败，请手动复制')
  }
}

function resetFromInitial() {
  const g0 = props.groups.find((g) => g.id !== 'all')?.id || ''
  if (!props.initial) {
    form.name = ''
    form.groupId = g0
    form.ip = ''
    form.port = 554
    form.protocol = 'RTSP'
    form.streamUrl = ''
    form.gbDeviceId = ''
    form.username = ''
    form.password = ''
    form.enabled = true
    streamPath.value = '/Streaming/Channels/101'
    testResult.value = null
    return
  }

  form.name = props.initial.name
  form.groupId = props.initial.groupId
  form.ip = props.initial.ip
  form.port = props.initial.port
  form.protocol = props.initial.protocol
  form.streamUrl = props.initial.streamUrl
  form.gbDeviceId = props.initial.gbDeviceId || ''
  form.username = props.initial.username
  form.password = props.initial.password
  form.enabled = props.initial.enabled
  streamPath.value = inferStreamPath(props.initial.streamUrl)
  testResult.value = null
}

watch(
  () => open.value,
  (v) => {
    if (!v) return
    resetFromInitial()
  }
)

const rules = {
  name: [{ required: true, message: '请输入摄像头名称', trigger: 'blur' }],
  groupId: [{ required: true, message: '请选择分组', trigger: 'change' }],
  ip: [{ required: true, message: '请输入IP地址', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口', trigger: 'blur' }],
  protocol: [{ required: true, message: '请选择协议', trigger: 'change' }],
  gbDeviceId: [
    {
      validator: (_rule: any, value: string, callback: (error?: Error) => void) => {
        if (!value) return callback()
        if (!/^\d{20}$/.test(String(value))) return callback(new Error('国标ID必须为20位数字'))
        callback()
      },
      trigger: 'blur',
    },
  ],
}

function makeId() {
  const n = Math.floor(10000 + Math.random() * 90000)
  return `CAM-${n}`
}

async function onTest() {
  const ip = form.ip.trim()
  const ipOk = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(ip)
  if (!ipOk) {
    testResult.value = {
      ok: false,
      message: '连接失败：IP 地址格式不正确',
      latencyMs: 0,
      checkedAtMs: Date.now(),
    }
    ElMessage.error('连接测试失败')
    return
  }
  if (!form.port || Number(form.port) < 1 || Number(form.port) > 65535) {
    testResult.value = {
      ok: false,
      message: '连接失败：端口不在有效范围（1-65535）',
      latencyMs: 0,
      checkedAtMs: Date.now(),
    }
    ElMessage.error('连接测试失败')
    return
  }
  if (form.protocol === 'GB28181' && !/^\d{20}$/.test((form.gbDeviceId || '').trim())) {
    testResult.value = {
      ok: false,
      message: '连接失败：GB28181 协议要求填写20位国标ID',
      latencyMs: 0,
      checkedAtMs: Date.now(),
    }
    ElMessage.error('连接测试失败')
    return
  }

  testing.value = true
  try {
    const seed = `${ip}:${form.port}:${form.protocol}:${form.gbDeviceId || ''}`
    const hash = fnv1a32(seed)
    const latencyMs = 80 + (hash % 220)
    await new Promise((r) => setTimeout(r, 300 + (hash % 500)))

    const ok = hash % 10 < 8
    if (ok) {
      testResult.value = {
        ok: true,
        message: `连接成功：${form.protocol} 探测通过`,
        latencyMs,
        checkedAtMs: Date.now(),
      }
      ElMessage.success('连接测试通过')
      return
    }

    const reason =
      form.protocol === 'RTSP'
        ? '认证失败或流路径不可达'
        : form.protocol === 'GB28181'
          ? '注册超时或SIP信令未响应'
          : form.protocol === 'ONVIF'
            ? '设备未开放ONVIF服务'
            : 'HTTP流地址未响应'
    testResult.value = {
      ok: false,
      message: `连接失败：${reason}`,
      latencyMs,
      checkedAtMs: Date.now(),
    }
    ElMessage.error('连接测试失败')
  } finally {
    testing.value = false
  }
}

function onGenerateStreamUrl() {
  const ip = form.ip.trim()
  if (!ip) {
    ElMessage.warning('请先填写IP地址')
    return
  }
  form.streamUrl = buildStreamUrl()
  ElMessage.success('已生成流地址')
}

function onGenerateGbId() {
  generateGbDeviceId()
  ElMessage.success('已生成国标ID')
}

async function onSave() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return

  saving.value = true
  try {
    await new Promise((r) => setTimeout(r, 350))
    normalizeGbPrefix()
    if (form.protocol === 'GB28181' && !form.gbDeviceId) generateGbDeviceId()
    const id = props.initial?.id || makeId()
    emit('saved', {
      id,
      ...form,
      port: Number(form.port) || 0,
      updatedAtMs: Date.now(),
    })
    open.value = false
    ElMessage.success(props.initial ? '已保存' : '已新增')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="720" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="92">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：北门出入口-3" />
        </el-form-item>

        <el-form-item label="分组" prop="groupId">
          <el-select v-model="form.groupId" placeholder="选择分组" filterable>
            <el-option v-for="g in groups" :key="g.id" :label="g.label" :value="g.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="IP" prop="ip">
          <el-input v-model="form.ip" placeholder="例如：192.168.1.10" />
        </el-form-item>

        <el-form-item label="端口" prop="port">
          <el-input-number v-model="form.port" :min="1" :max="65535" class="w-full" />
        </el-form-item>

        <el-form-item label="协议" prop="protocol">
          <el-select v-model="form.protocol" placeholder="选择协议">
            <el-option label="RTSP" value="RTSP" />
            <el-option label="GB28181" value="GB28181" />
            <el-option label="HTTP" value="HTTP" />
            <el-option label="ONVIF" value="ONVIF" />
          </el-select>
        </el-form-item>

        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <el-form-item label="流地址" class="md:col-span-2">
          <el-input v-model="form.streamUrl" placeholder="例如：rtsp://user:pass@ip:554/Streaming/Channels/101" />
        </el-form-item>

        <el-form-item label="流路径" class="md:col-span-2">
          <el-input v-model="streamPath" placeholder="例如：/Streaming/Channels/101 或 /live/index.m3u8" />
        </el-form-item>

        <el-form-item label="国标ID" prop="gbDeviceId" class="md:col-span-2">
          <el-input v-model="form.gbDeviceId" maxlength="20" placeholder="20位数字，仅GB28181协议必填" />
        </el-form-item>

        <el-form-item label="ID规则前缀" class="md:col-span-2">
          <el-input v-model="gbRulePrefix" maxlength="19" placeholder="可配置前缀（6-19位数字）" />
        </el-form-item>

        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="可选" />
        </el-form-item>

        <el-form-item label="密码">
          <el-input v-model="form.password" placeholder="可选" show-password />
        </el-form-item>
      </div>

      <div class="mt-2 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <el-button @click="onGenerateStreamUrl">生成流地址</el-button>
        <el-button @click="copyText(form.streamUrl, '没有可复制的流地址')">复制流地址</el-button>
        <el-button @click="onGenerateGbId">生成国标ID</el-button>
        <el-button @click="copyText(form.gbDeviceId || '', '没有可复制的国标ID')">复制国标ID</el-button>
      </div>

      <div class="mt-2 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="space-y-1 text-xs text-zinc-600">
          <div>连接测试支持失败原因反馈；当前为前端演示探测，后续可接入后端真实探测接口。</div>
          <div v-if="testResult" class="flex flex-wrap items-center gap-2">
            <el-tag :type="testTagType" size="small">{{ testResult.ok ? '连接成功' : '连接失败' }}</el-tag>
            <span>{{ testResult.message }}</span>
            <span v-if="testResult.latencyMs > 0">耗时 {{ testResult.latencyMs }}ms</span>
            <span>{{ formatDateTime(testResult.checkedAtMs) }}</span>
          </div>
        </div>
        <el-button :loading="testing" @click="onTest">连接测试</el-button>
      </div>
    </el-form>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>
