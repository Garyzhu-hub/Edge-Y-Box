<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { appendManualLog } from '@/utils/logsMock'

type ServiceStatus = 'running' | 'degraded' | 'stopped'

type Service = {
  name: string
  status: ServiceStatus
  detail: string
  updatedAtMs: number
}

type NetIf = {
  name: string
  ip: string
  rxMbps: number
  txMbps: number
}

type Disk = {
  mount: string
  usedGb: number
  totalGb: number
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

function formatUptime(ms: number) {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const parts = [] as string[]
  if (d) parts.push(`${d}天`)
  if (h || d) parts.push(`${h}小时`)
  parts.push(`${m}分钟`)
  return parts.join(' ')
}

function statusLabel(s: ServiceStatus) {
  if (s === 'running') return '运行中'
  if (s === 'degraded') return '降级'
  return '停止'
}

function statusTagType(s: ServiceStatus) {
  if (s === 'running') return 'success'
  if (s === 'degraded') return 'warning'
  return 'danger'
}

const nowMs = ref(Date.now())
const startedAtMs = ref(Date.now() - 6 * 60 * 60 * 1000 - 25 * 60 * 1000)

const deviceInfo = ref({
  deviceName: 'Edge Y-box',
  model: 'EYX-1000',
  sn: 'SN-DEMO-20260311',
  firmware: 'v0.9.0-demo',
  webVersion: 'v0.9.0-demo',
  os: 'Linux (edge)',
  timezone: 'Asia/Shanghai',
})

const health = ref({
  cpuPercent: 23,
  memUsedGb: 6.4,
  memTotalGb: 16,
  diskList: [
    { mount: '/', usedGb: 82, totalGb: 256 },
    { mount: '/data', usedGb: 410, totalGb: 1024 },
  ] as Disk[],
  gpuPercent: 18,
  tempC: 54,
})

const netIfs = ref<NetIf[]>([
  { name: 'eth0', ip: '192.168.10.88', rxMbps: 12.4, txMbps: 8.1 },
  { name: 'wlan0', ip: '192.168.10.66', rxMbps: 0.2, txMbps: 0.1 },
])

const services = ref<Service[]>([
  { name: '边缘服务', status: 'running', detail: 'main-api', updatedAtMs: Date.now() - 45 * 1000 },
  { name: '推理引擎', status: 'running', detail: 'runtime ok', updatedAtMs: Date.now() - 30 * 1000 },
  { name: '存储服务', status: 'degraded', detail: 'cache warmup', updatedAtMs: Date.now() - 2 * 60 * 1000 },
  { name: '调度器', status: 'running', detail: 'tasks=12', updatedAtMs: Date.now() - 20 * 1000 },
  { name: 'GB28181', status: 'running', detail: 'sessions=3', updatedAtMs: Date.now() - 50 * 1000 },
  { name: 'MQTT', status: 'stopped', detail: 'disabled', updatedAtMs: Date.now() - 5 * 60 * 1000 },
])

const env = ref({
  userAgent: '-',
  language: '-',
  screen: '-',
  online: '-',
})

const uptimeText = computed(() => formatUptime(nowMs.value - startedAtMs.value))
const cpuPercent = computed(() => clamp(Math.round(health.value.cpuPercent), 0, 100))
const gpuPercent = computed(() => clamp(Math.round(health.value.gpuPercent), 0, 100))
const memPercent = computed(() => clamp(Math.round((health.value.memUsedGb / health.value.memTotalGb) * 100), 0, 100))

const totalDisk = computed(() => {
  const total = health.value.diskList.reduce(
    (acc, d) => {
      acc.usedGb += d.usedGb
      acc.totalGb += d.totalGb
      return acc
    },
    { usedGb: 0, totalGb: 0 }
  )
  const percent = total.totalGb ? Math.round((total.usedGb / total.totalGb) * 100) : 0
  return { ...total, percent: clamp(percent, 0, 100) }
})

function jitter(base: number, delta: number) {
  const r = (Math.random() - 0.5) * 2
  return base + r * delta
}

function refreshMetrics({ toast }: { toast: boolean }) {
  const now = Date.now()
  nowMs.value = now
  health.value.cpuPercent = clamp(Math.round(jitter(health.value.cpuPercent, 8)), 2, 98)
  health.value.gpuPercent = clamp(Math.round(jitter(health.value.gpuPercent, 10)), 0, 95)
  health.value.tempC = clamp(Math.round(jitter(health.value.tempC, 3)), 38, 78)

  const mem = clamp(jitter(health.value.memUsedGb, 0.6), 3, health.value.memTotalGb - 0.6)
  health.value.memUsedGb = round1(mem)

  netIfs.value = netIfs.value.map((x) => ({
    ...x,
    rxMbps: round1(clamp(jitter(x.rxMbps, 3), 0, 90)),
    txMbps: round1(clamp(jitter(x.txMbps, 3), 0, 90)),
  }))

  services.value = services.value.map((s) => {
    const next = { ...s }
    if (s.status === 'degraded' && Math.random() > 0.7) {
      next.status = 'running'
      next.detail = 'recovered'
    }
    next.updatedAtMs = now - Math.floor(Math.random() * 120 * 1000)
    return next
  })

  appendManualLog({
    kind: 'system',
    tsMs: now,
    level: 'info',
    module: '健康检查',
    action: '刷新',
    summary: '系统信息已刷新（演示）',
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `sysinfo_${Math.floor(Math.random() * 1e6)}`,
    detail: {
      cpuPercent: health.value.cpuPercent,
      memPercent: memPercent.value,
      diskPercent: totalDisk.value.percent,
    },
  })
  if (toast) ElMessage.success('已刷新（演示）')
}

let timer: number | null = null

onMounted(() => {
  if (typeof window !== 'undefined') {
    env.value = {
      userAgent: window.navigator.userAgent,
      language: window.navigator.language,
      screen: `${window.screen.width}×${window.screen.height}`,
      online: window.navigator.onLine ? '是' : '否',
    }
  }
  refreshMetrics({ toast: false })
  if (typeof window !== 'undefined') {
    timer = window.setInterval(() => {
      nowMs.value = Date.now()
    }, 1000)
  }
})

onBeforeUnmount(() => {
  if (timer && typeof window !== 'undefined') window.clearInterval(timer)
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">系统信息</div>
        <div class="mt-1 text-xs text-zinc-500">设备状态、资源占用与服务健康（演示）。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-button @click="refreshMetrics({ toast: true })">刷新</el-button>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-3 xl:grid-cols-12">
      <div class="space-y-3 xl:col-span-5">
        <el-card>
          <div class="mb-2 flex items-center justify-between">
            <div class="text-sm font-semibold">设备与版本</div>
            <el-tag size="small" type="success">在线</el-tag>
          </div>
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="设备名">{{ deviceInfo.deviceName }}</el-descriptions-item>
            <el-descriptions-item label="型号">{{ deviceInfo.model }}</el-descriptions-item>
            <el-descriptions-item label="序列号">{{ deviceInfo.sn }}</el-descriptions-item>
            <el-descriptions-item label="固件">{{ deviceInfo.firmware }}</el-descriptions-item>
            <el-descriptions-item label="Web版本">{{ deviceInfo.webVersion }}</el-descriptions-item>
            <el-descriptions-item label="系统">{{ deviceInfo.os }}</el-descriptions-item>
            <el-descriptions-item label="时区">{{ deviceInfo.timezone }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card>
          <div class="mb-2 text-sm font-semibold">运行状态</div>
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="运行时长">{{ uptimeText }}</el-descriptions-item>
            <el-descriptions-item label="启动时间">{{ new Date(startedAtMs).toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="当前时间">{{ new Date(nowMs).toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="温度">
              <span class="text-sm">{{ health.tempC }}℃</span>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card>
          <div class="mb-2 text-sm font-semibold">资源概览</div>
          <div class="space-y-4">
            <div>
              <div class="mb-1 flex items-center justify-between text-xs text-zinc-600">
                <span>CPU</span>
                <span>{{ cpuPercent }}%</span>
              </div>
              <el-progress :percentage="cpuPercent" :stroke-width="10" :show-text="false" />
            </div>
            <div>
              <div class="mb-1 flex items-center justify-between text-xs text-zinc-600">
                <span>GPU</span>
                <span>{{ gpuPercent }}%</span>
              </div>
              <el-progress :percentage="gpuPercent" :stroke-width="10" :show-text="false" />
            </div>
            <div>
              <div class="mb-1 flex items-center justify-between text-xs text-zinc-600">
                <span>内存</span>
                <span>{{ health.memUsedGb }} / {{ health.memTotalGb }} GB（{{ memPercent }}%）</span>
              </div>
              <el-progress :percentage="memPercent" :stroke-width="10" status="success" :show-text="false" />
            </div>
            <div>
              <div class="mb-1 flex items-center justify-between text-xs text-zinc-600">
                <span>磁盘</span>
                <span>{{ totalDisk.usedGb }} / {{ totalDisk.totalGb }} GB（{{ totalDisk.percent }}%）</span>
              </div>
              <el-progress
                :percentage="totalDisk.percent"
                :stroke-width="10"
                :status="totalDisk.percent > 85 ? 'exception' : 'success'"
                :show-text="false"
              />
              <div class="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                <div v-for="d in health.diskList" :key="d.mount" class="rounded-md border border-zinc-200 p-2">
                  <div class="flex items-center justify-between text-xs">
                    <span class="font-mono">{{ d.mount }}</span>
                    <span class="text-zinc-600">{{ d.usedGb }}/{{ d.totalGb }} GB</span>
                  </div>
                  <el-progress
                    class="mt-1"
                    :percentage="Math.round((d.usedGb / d.totalGb) * 100)"
                    :stroke-width="8"
                    :show-text="false"
                  />
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </div>

      <div class="space-y-3 xl:col-span-7">
        <el-card>
          <div class="mb-2 flex items-center justify-between">
            <div class="text-sm font-semibold">服务健康</div>
            <div class="text-xs text-zinc-500">刷新时间：{{ new Date(nowMs).toLocaleTimeString() }}</div>
          </div>
          <el-table :data="services" size="small" height="320" class="table-standard">
            <el-table-column prop="name" label="服务" min-width="160" />
            <el-table-column label="状态" width="110">
              <template #default="scope">
                <el-tag :type="statusTagType(scope.row.status)" size="small">{{ statusLabel(scope.row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="detail" label="详情" min-width="200" />
            <el-table-column label="更新时间" width="170">
              <template #default="scope">
                <span class="text-xs text-zinc-600">{{ new Date(scope.row.updatedAtMs).toLocaleString() }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card>
          <div class="mb-2 text-sm font-semibold">网络</div>
          <el-table :data="netIfs" size="small" height="240" class="table-standard">
            <el-table-column prop="name" label="接口" width="120" />
            <el-table-column prop="ip" label="IP" min-width="160" />
            <el-table-column label="下行" width="140">
              <template #default="scope">
                <span class="text-xs">{{ scope.row.rxMbps }} Mbps</span>
              </template>
            </el-table-column>
            <el-table-column label="上行" width="140">
              <template #default="scope">
                <span class="text-xs">{{ scope.row.txMbps }} Mbps</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card>
          <div class="mb-2 text-sm font-semibold">环境信息</div>
          <el-descriptions :column="2" size="small" border>
            <el-descriptions-item label="浏览器">{{ env.userAgent }}</el-descriptions-item>
            <el-descriptions-item label="语言">{{ env.language }}</el-descriptions-item>
            <el-descriptions-item label="屏幕">{{ env.screen }}</el-descriptions-item>
            <el-descriptions-item label="在线">{{ env.online }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </div>
    </div>
  </div>
</template>
