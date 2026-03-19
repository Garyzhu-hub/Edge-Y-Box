<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { appendManualLog } from '@/utils/logsMock'
import { formatDateTime } from '@/stores/app'
import type { Camera } from '@/components/devices/CameraFormDialog.vue'
import NvrFormDialog from '@/components/devices/nvrs/NvrFormDialog.vue'
import NvrChannelsDialog from '@/components/devices/nvrs/NvrChannelsDialog.vue'
import { computedNvrStatus, makeDefaultNvrs, makeMockChannels, type Nvr, type NvrChannel, type NvrStatus } from '@/utils/nvrsMock'
import { cascadeDeleteNvr } from '@/utils/cascadeDelete'

type FilterModel = {
  keyword: string
  protocol: '' | 'RTSP' | 'ONVIF' | 'HTTP' | 'GB28181'
  status: '' | NvrStatus
}

const NVRS_KEY = 'edge_nvrs_v1'
const CAMERAS_KEY = 'edge_cameras_v1'

const filter = reactive<FilterModel>({
  keyword: '',
  protocol: '',
  status: '',
})

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const fullData = ref<Nvr[]>([])
const rows = ref<Nvr[]>([])

function loadNvrs() {
  try {
    const raw = window.localStorage.getItem(NVRS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Nvr[]
    }
  } catch {
    return makeDefaultNvrs()
  }
  return makeDefaultNvrs()
}

function saveNvrs(list: Nvr[]) {
  try {
    window.localStorage.setItem(NVRS_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

function loadChannels(nvr: Nvr) {
  const key = `edge_nvr_channels_${nvr.id}_v1`
  try {
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as NvrChannel[]
    }
  } catch {
    return makeMockChannels({ nvrId: nvr.id, count: nvr.channelTotal })
  }
  return makeMockChannels({ nvrId: nvr.id, count: nvr.channelTotal })
}

function saveChannels(nvrId: string, list: NvrChannel[]) {
  const key = `edge_nvr_channels_${nvrId}_v1`
  try {
    window.localStorage.setItem(key, JSON.stringify(list))
  } catch {
    return
  }
}

function loadCameras(): Camera[] {
  try {
    const raw = window.localStorage.getItem(CAMERAS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Camera[]) : []
  } catch {
    return []
  }
}

function saveCameras(list: Camera[]) {
  try {
    window.localStorage.setItem(CAMERAS_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

function applyFilter(data: Nvr[]) {
  const kw = filter.keyword.trim()
  return data
    .filter((x) => (filter.protocol ? x.protocol === filter.protocol : true))
    .filter((x) => (filter.status ? computedNvrStatus(x) === filter.status : true))
    .filter((x) =>
      kw ? x.name.includes(kw) || x.ip.includes(kw) || x.id.includes(kw) || x.remark.includes(kw) : true
    )
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

async function refresh() {
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 180))
    const filtered = applyFilter(fullData.value)
    total.value = filtered.length
    const start = (page.value - 1) * pageSize.value
    rows.value = filtered.slice(start, start + pageSize.value)
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  refresh()
}

function onReset() {
  filter.keyword = ''
  filter.protocol = ''
  filter.status = ''
  page.value = 1
  refresh()
}

function writeOp(action: string, summary: string, detail: Record<string, unknown>) {
  appendManualLog({
    kind: 'operation',
    tsMs: Date.now(),
    level: 'info',
    module: '设备管理',
    action,
    summary,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `nvr_${Math.floor(Math.random() * 1e6)}`,
    detail,
  })
}

function statusTagType(status: NvrStatus) {
  if (status === '在线') return 'success'
  if (status === '离线') return 'danger'
  return 'info'
}

const formOpen = ref(false)
const editing = ref<Nvr | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openEdit(nvr: Nvr) {
  editing.value = nvr
  formOpen.value = true
}

function nextId(list: Nvr[]) {
  const n = 10000 + list.length + 1
  return `NVR-${n}`
}

function upsertNvr(payload: {
  id?: string
  passwordChanged: boolean
  model: {
    name: string
    ip: string
    port: number
    protocol: any
    channelTotal: number
    username: string
    password: string
    enabled: boolean
    remark: string
  }
}) {
  const list = [...fullData.value]
  const now = Date.now()
  if (payload.id) {
    const idx = list.findIndex((x) => x.id === payload.id)
    if (idx >= 0) {
      const prev = list[idx]
      list[idx] = {
        ...prev,
        name: payload.model.name,
        ip: payload.model.ip,
        port: payload.model.port,
        protocol: payload.model.protocol,
        channelTotal: payload.model.channelTotal,
        username: payload.model.username,
        passwordConfigured: payload.passwordChanged ? true : prev.passwordConfigured,
        enabled: payload.model.enabled,
        remark: payload.model.remark,
        updatedAtMs: now,
      }
      writeOp('编辑', `编辑NVR ${list[idx].name}`, { nvrId: list[idx].id })
    }
  } else {
    const id = nextId(list)
    const next: Nvr = {
      id,
      name: payload.model.name,
      ip: payload.model.ip,
      port: payload.model.port,
      protocol: payload.model.protocol,
      channelTotal: payload.model.channelTotal,
      channelSynced: 0,
      username: payload.model.username,
      passwordConfigured: true,
      enabled: payload.model.enabled,
      remark: payload.model.remark,
      createdAtMs: now,
      updatedAtMs: now,
    }
    list.unshift(next)
    writeOp('创建', `新增NVR ${next.name}`, { nvrId: next.id })
  }

  fullData.value = list
  saveNvrs(list)
  refresh()
  ElMessage.success('已保存（演示）')
}

async function toggleEnabled(nvr: Nvr) {
  const next = !nvr.enabled
  const confirmed = await ElMessageBox.confirm(`确认将NVR“${nvr.name}”设为${next ? '启用' : '禁用'}？`, '二次确认', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  const now = Date.now()
  const list = fullData.value.map((x) => (x.id === nvr.id ? { ...x, enabled: next, updatedAtMs: now } : x))
  fullData.value = list
  saveNvrs(list)
  writeOp('编辑', `${next ? '启用' : '禁用'}NVR ${nvr.name}`, { nvrId: nvr.id, enabled: next })
  refresh()
  ElMessage.success('已更新（演示）')
}

async function removeNvr(nvr: Nvr) {
  const confirmed = await ElMessageBox.confirm(`确认删除NVR“${nvr.name}”？`, '二次确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  const r = cascadeDeleteNvr(nvr.id)
  const list = fullData.value.filter((x) => x.id !== nvr.id)
  fullData.value = list
  saveNvrs(list)
  writeOp('删除', `删除NVR ${nvr.name}`, { nvrId: nvr.id })
  refresh()
  ElMessage.success(
    `已删除（联动：通道缓存${r.removedNvrChannelsCache ? '已清理' : '未清理'}，摄像头 ${r.removedCameras}，布点 ${r.removedDeployments}）`
  )
}

const channelsOpen = ref(false)
const activeNvr = ref<Nvr | null>(null)
const activeChannels = ref<NvrChannel[]>([])

function openChannels(nvr: Nvr) {
  activeNvr.value = nvr
  activeChannels.value = loadChannels(nvr)
  channelsOpen.value = true
}

function ensureNvrCameraId(nvrId: string, channelNo: number) {
  return `CAM-NVR-${nvrId}-${String(channelNo).padStart(2, '0')}`
}

function makeGbId(seed: string, prefix = '3402000000132') {
  const p = prefix.replace(/\D/g, '').slice(0, 19) || '3402000000132'
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const suffixLen = Math.max(1, 20 - p.length)
  const mod = Math.pow(10, suffixLen)
  const suffix = String((h >>> 0) % mod).padStart(suffixLen, '0')
  return `${p}${suffix}`.slice(0, 20)
}

function toCamera(nvr: Nvr, ch: NvrChannel): Camera {
  const id = ensureNvrCameraId(nvr.id, ch.channelNo)
  const port = nvr.protocol === 'HTTP' ? 80 : nvr.protocol === 'GB28181' ? 5060 : 554
  const streamUrl =
    nvr.protocol === 'RTSP'
      ? `rtsp://${nvr.username}:******@${nvr.ip}:${port}/ch/${String(ch.channelNo).padStart(2, '0')}`
      : nvr.protocol === 'GB28181'
        ? `sip:${nvr.ip}:${port}`
        : nvr.protocol === 'ONVIF'
          ? `onvif://${nvr.ip}:${port}`
          : `http://${nvr.ip}:${port}/live/${String(ch.channelNo).padStart(2, '0')}`

  return {
    id,
    name: `${nvr.name}-${ch.name}`,
    groupId: 'default',
    ip: nvr.ip,
    port,
    protocol: nvr.protocol,
    streamUrl,
    gbDeviceId: nvr.protocol === 'GB28181' ? makeGbId(id) : '',
    username: nvr.username,
    password: '******',
    enabled: nvr.enabled,
    updatedAtMs: Date.now(),
  }
}

function onSyncChannels(payload: { nvrId: string; channelIds: string[] }) {
  const nvr = fullData.value.find((x) => x.id === payload.nvrId)
  if (!nvr) return
  const channels = loadChannels(nvr)
  const selected = new Set(payload.channelIds)

  const nextChannels = channels.map((c) => (selected.has(c.id) ? { ...c, synced: true, updatedAtMs: Date.now() } : c))
  saveChannels(nvr.id, nextChannels)

  const existing = loadCameras()
  const byId = new Map(existing.map((c) => [c.id, c]))
  let added = 0
  for (const ch of nextChannels) {
    if (!selected.has(ch.id)) continue
    const cam = toCamera(nvr, ch)
    if (!byId.has(cam.id)) {
      byId.set(cam.id, cam)
      added += 1
    }
  }
  saveCameras(Array.from(byId.values()))

  const syncedCount = nextChannels.filter((c) => c.synced).length
  const now = Date.now()
  const nextNvrs = fullData.value.map((x) => (x.id === nvr.id ? { ...x, channelSynced: syncedCount, updatedAtMs: now } : x))
  fullData.value = nextNvrs
  saveNvrs(nextNvrs)
  writeOp('同步', `同步NVR通道：${nvr.name}`, { nvrId: nvr.id, selected: payload.channelIds.length, newCameras: added })
  refresh()
  ElMessage.success(`已同步 ${payload.channelIds.length} 路通道（新增摄像头 ${added}）`)
}

onMounted(() => {
  fullData.value = loadNvrs()
  refresh()
})

watch([page, pageSize], () => refresh())

const statusOf = computed(() => {
  const map = new Map<string, NvrStatus>()
  for (const nvr of rows.value) map.set(nvr.id, computedNvrStatus(nvr))
  return map
})

function getStatus(nvr: Nvr) {
  return statusOf.value.get(nvr.id) ?? computedNvrStatus(nvr)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">NVR管理</div>
        <div class="mt-1 text-xs text-zinc-500">维护NVR并同步通道到摄像头列表（演示）。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-button type="primary" @click="openCreate">新增NVR</el-button>
      </div>
    </div>

    <el-card>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-8">
        <el-input v-model="filter.keyword" placeholder="名称/IP/编号/备注" clearable class="md:col-span-4" />
        <el-select v-model="filter.protocol" placeholder="协议" clearable class="md:col-span-2">
          <el-option label="RTSP" value="RTSP" />
          <el-option label="ONVIF" value="ONVIF" />
          <el-option label="HTTP" value="HTTP" />
          <el-option label="GB28181" value="GB28181" />
        </el-select>
        <el-select v-model="filter.status" placeholder="状态" clearable class="md:col-span-2">
          <el-option label="在线" value="在线" />
          <el-option label="离线" value="离线" />
          <el-option label="禁用" value="禁用" />
        </el-select>
      </div>
      <div class="mt-3 flex items-center justify-end gap-2">
        <el-button @click="onReset">重置</el-button>
        <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
      </div>
    </el-card>

    <el-card>
      <el-table :data="rows" size="small" v-loading="loading" height="560" class="table-standard">
        <el-table-column prop="name" label="NVR名称" min-width="180" />
        <el-table-column prop="ip" label="NVR IP" width="140" />
        <el-table-column prop="protocol" label="协议" width="90" />
        <el-table-column label="通道" width="120">
          <template #default="scope">
            <span class="text-xs">{{ scope.row.channelSynced }}/{{ scope.row.channelTotal }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="statusTagType(getStatus(scope.row))" size="small">{{ getStatus(scope.row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.updatedAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="scope">
            <div class="flex items-center gap-2">
              <el-button link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
              <el-button link type="primary" size="small" @click="openChannels(scope.row)">通道管理</el-button>
              <el-dropdown trigger="click">
                <el-button link type="primary" size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="toggleEnabled(scope.row)">{{ scope.row.enabled ? '禁用' : '启用' }}</el-dropdown-item>
                    <el-dropdown-item @click="removeNvr(scope.row)">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-3 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next, sizes"
          :page-sizes="[10, 20, 50]"
          small
        />
      </div>
    </el-card>

    <NvrFormDialog v-model="formOpen" :nvr="editing" @save="upsertNvr" />
    <NvrChannelsDialog v-model="channelsOpen" :nvr="activeNvr" :channels="activeChannels" @sync="onSyncChannels" />
  </div>
</template>
