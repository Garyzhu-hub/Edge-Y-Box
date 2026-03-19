<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import { appendManualLog } from '@/utils/logsMock'
import GbPlatformFormDialog from '@/components/devices/gb/GbPlatformFormDialog.vue'
import GbChannelsDrawer from '@/components/devices/gb/GbChannelsDrawer.vue'
import GbStatusTimelineDialog, { type GbStatusEvent } from '@/components/devices/gb/GbStatusTimelineDialog.vue'
import GbRemotePreviewDialog from '@/components/devices/gb/GbRemotePreviewDialog.vue'
import { loadLocalGbChannels, refreshLocalGbChannels, type LocalGbChannel } from '@/utils/gbLocalChannels'
import { makeDefaultGbPlatforms, type GbCascadePlatform, type GbStatus } from '@/utils/gbCascadeMock'

type FilterModel = {
  keyword: string
  status: '' | GbStatus
  enabled: '' | '启用' | '停用'
}

const STORAGE_KEY = 'edge_gb_cascade_v1'
const HISTORY_KEY = 'edge_gb_status_history_v1'
const SHARE_KEY = 'edge_gb_shared_channels_v1'

const filter = reactive<FilterModel>({
  keyword: '',
  status: '',
  enabled: '',
})

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const fullData = ref<GbCascadePlatform[]>([])
const rows = ref<GbCascadePlatform[]>([])
const localChannels = ref<LocalGbChannel[]>([])

function normalizeEvent(raw: any): GbStatusEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const tsMs = Number(raw.tsMs)
  const status = raw.status as GbStatus
  if (!Number.isFinite(tsMs)) return null
  if (status !== '在线' && status !== '离线' && status !== '异常') return null
  return {
    tsMs,
    status,
    action: raw.action,
    reason: raw.reason,
    latencyMs: typeof raw.latencyMs === 'number' ? raw.latencyMs : undefined,
    operator: raw.operator,
    requestId: raw.requestId,
  }
}

function loadHistory(): Record<string, GbStatusEvent[]> {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const map = parsed as Record<string, any[]>
    const normalized: Record<string, GbStatusEvent[]> = {}
    for (const [k, v] of Object.entries(map)) {
      const list = Array.isArray(v) ? v.map((x) => normalizeEvent(x)).filter(Boolean) : []
      normalized[k] = list as GbStatusEvent[]
    }
    return normalized
  } catch {
    return {}
  }
}

function saveHistory(next: Record<string, GbStatusEvent[]>) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    return
  }
}

function pushStatusEvent(
  platformId: string,
  status: GbStatus,
  payload: { action?: GbStatusEvent['action']; reason?: string; latencyMs?: number; operator?: string; requestId?: string; tsMs?: number } = {}
) {
  const map = loadHistory()
  const list = Array.isArray(map[platformId]) ? map[platformId] : []
  const prev = list[0]?.status
  const tsMs = payload.tsMs || Date.now()
  const next: GbStatusEvent = {
    tsMs,
    status,
    action: payload.action,
    reason: payload.reason,
    latencyMs: payload.latencyMs,
    operator: payload.operator || 'admin',
    requestId: payload.requestId || `gb_evt_${Math.floor(Math.random() * 1e6)}`,
  }
  const nextList = prev === status && !payload.action ? list : [next, ...list]
  map[platformId] = nextList.slice(0, 50)
  saveHistory(map)
}

function ensureHistorySeed(platforms: GbCascadePlatform[]) {
  const map = loadHistory()
  let changed = false
  for (const p of platforms) {
    const list = Array.isArray(map[p.id]) ? map[p.id] : []
    if (!list.length) {
      map[p.id] = [
        {
          tsMs: p.createdAtMs || Date.now(),
          status: p.status,
          action: '状态校验',
          reason: '平台初始化状态',
          operator: 'system',
          requestId: `gb_seed_${Math.floor(Math.random() * 1e6)}`,
        },
      ]
      changed = true
    }
  }
  if (changed) saveHistory(map)
}

function loadShareMap(): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(SHARE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}

function sharedCount(platformId: string) {
  const map = loadShareMap()
  const ids = Array.isArray(map[platformId]) ? map[platformId] : []
  return ids.length
}

function loadPlatforms() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as GbCascadePlatform[]
    }
  } catch {
    return makeDefaultGbPlatforms()
  }
  return makeDefaultGbPlatforms()
}

function savePlatforms(list: GbCascadePlatform[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

function applyFilter(data: GbCascadePlatform[]) {
  const kw = filter.keyword.trim()
  return data
    .filter((p) => (filter.status ? p.status === filter.status : true))
    .filter((p) => (filter.enabled ? (filter.enabled === '启用' ? p.enabled : !p.enabled) : true))
    .filter((p) =>
      kw
        ? p.name.includes(kw) ||
          p.serverId.includes(kw) ||
          p.serverDomain.includes(kw) ||
          p.sipServer.includes(kw) ||
          p.localIp.includes(kw)
        : true
    )
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

async function refresh() {
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 160))
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
  filter.status = ''
  filter.enabled = ''
  page.value = 1
  refresh()
}

function writeOp(action: string, summary: string, detail: Record<string, unknown>) {
  appendManualLog({
    kind: 'operation',
    tsMs: Date.now(),
    level: 'info',
    module: 'GB28181',
    action,
    summary,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `gb_${Math.floor(Math.random() * 1e6)}`,
    detail,
  })
}

function statusTagType(s: GbStatus) {
  if (s === '在线') return 'success'
  if (s === '离线') return 'info'
  return 'warning'
}

const statusOpen = ref(false)
const statusPlatform = ref<GbCascadePlatform | null>(null)
const statusEvents = ref<GbStatusEvent[]>([])

function openStatus(p: GbCascadePlatform) {
  statusPlatform.value = p
  const map = loadHistory()
  statusEvents.value = Array.isArray(map[p.id]) ? map[p.id] : []
  statusOpen.value = true
}

const dialogOpen = ref(false)
const editing = ref<GbCascadePlatform | null>(null)

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(p: GbCascadePlatform) {
  editing.value = p
  dialogOpen.value = true
}

function nextId(list: GbCascadePlatform[]) {
  const n = 1000 + list.length + 1
  return `gb_up_${String(n).padStart(3, '0')}`
}

function upsertPlatform(payload: {
  id?: string
  passwordChanged: boolean
  model: {
    name: string
    serverId: string
    serverDomain: string
    sipServer: string
    sipPort: number
    username: string
    password: string
    localId: string
    localIp: string
    localPort: number
    transport: 'UDP' | 'TCP'
    enabled: boolean
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
        serverId: payload.model.serverId,
        serverDomain: payload.model.serverDomain,
        sipServer: payload.model.sipServer,
        sipPort: payload.model.sipPort,
        username: payload.model.username,
        passwordConfigured: payload.passwordChanged ? true : prev.passwordConfigured,
        localId: payload.model.localId,
        localIp: payload.model.localIp,
        localPort: payload.model.localPort,
        transport: payload.model.transport,
        enabled: payload.model.enabled,
        updatedAtMs: now,
      }
      writeOp('编辑', `编辑上级平台 ${list[idx].name}`, { platformId: list[idx].id })
    }
  } else {
    const id = nextId(list)
    const next: GbCascadePlatform = {
      id,
      name: payload.model.name,
      serverId: payload.model.serverId,
      serverDomain: payload.model.serverDomain,
      sipServer: payload.model.sipServer,
      sipPort: payload.model.sipPort,
      username: payload.model.username,
      passwordConfigured: true,
      localId: payload.model.localId,
      localIp: payload.model.localIp,
      localPort: payload.model.localPort,
      transport: payload.model.transport,
      status: '离线',
      registered: false,
      lastRegisterAtMs: now,
      channelCount: 0,
      updatedAtMs: now,
      createdAtMs: now,
      enabled: payload.model.enabled,
    }
    list.unshift(next)
    writeOp('创建', `新增上级平台 ${next.name}`, { platformId: next.id })
  }

  fullData.value = list
  savePlatforms(list)
  refresh()
  ElMessage.success('已保存（演示）')
}

async function toggleEnabled(p: GbCascadePlatform) {
  const next = !p.enabled
  await ElMessageBox.confirm(`确认将上级平台“${p.name}”设为${next ? '启用' : '停用'}？`, '二次确认', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  })
  const list = fullData.value.map((x) => (x.id === p.id ? { ...x, enabled: next, updatedAtMs: Date.now() } : x))
  fullData.value = list
  savePlatforms(list)
  writeOp('编辑', `${next ? '启用' : '停用'}上级平台 ${p.name}`, { platformId: p.id, enabled: next })
  refresh()
  ElMessage.success('已更新（演示）')
}

async function removePlatform(p: GbCascadePlatform) {
  await ElMessageBox.confirm(`确认删除上级平台“${p.name}”？此操作不可恢复。`, '二次确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  const list = fullData.value.filter((x) => x.id !== p.id)
  fullData.value = list
  savePlatforms(list)
  writeOp('删除', `删除上级平台 ${p.name}`, { platformId: p.id })
  refresh()
  ElMessage.success('已删除（演示）')
}

async function register(p: GbCascadePlatform) {
  if (!p.enabled) {
    ElMessage.warning('当前平台已停用')
    return
  }
  if (!p.passwordConfigured) {
    ElMessage.warning('请先配置口令')
    return
  }
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 400))
    const now = Date.now()
    const list = fullData.value.map((x) =>
      x.id === p.id
        ? {
            ...x,
            registered: true,
            status: '在线' as GbStatus,
            lastRegisterAtMs: now,
            updatedAtMs: now,
          }
        : x
    )
    fullData.value = list
    savePlatforms(list)
    pushStatusEvent(p.id, '在线', {
      tsMs: now,
      action: '注册',
      reason: '平台鉴权成功并保持在线',
      latencyMs: 400,
    })
    writeOp('登录', `向上级平台注册：${p.name}`, { platformId: p.id })
    refresh()
    ElMessage.success('注册成功（演示）')
  } finally {
    loading.value = false
  }
}

async function unregister(p: GbCascadePlatform) {
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 260))
    const now = Date.now()
    const list = fullData.value.map((x) =>
      x.id === p.id
        ? {
            ...x,
            registered: false,
            status: '离线' as GbStatus,
            updatedAtMs: now,
          }
        : x
    )
    fullData.value = list
    savePlatforms(list)
    pushStatusEvent(p.id, '离线', {
      tsMs: now,
      action: '注销',
      reason: '人工触发注销',
      latencyMs: 260,
    })
    writeOp('登出', `向上级平台注销：${p.name}`, { platformId: p.id })
    refresh()
    ElMessage.success('已注销（演示）')
  } finally {
    loading.value = false
  }
}

const channelsDrawerOpen = ref(false)
const selectedPlatform = ref<GbCascadePlatform | null>(null)
const channels = ref<LocalGbChannel[]>([])
const drawerTab = ref<'list' | 'share'>('list')
const syncingAll = ref(false)
const previewOpen = ref(false)
const previewChannel = ref<LocalGbChannel | null>(null)

async function syncChannels(p: GbCascadePlatform) {
  if (!p.registered) {
    ElMessage.warning('请先注册成功后再同步通道')
    return
  }
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 420))
    localChannels.value = refreshLocalGbChannels()
    channels.value = localChannels.value
    selectedPlatform.value = p
    drawerTab.value = 'list'
    channelsDrawerOpen.value = true
    pushStatusEvent(p.id, p.status, {
      action: '通道同步',
      reason: `刷新通道池，共 ${localChannels.value.length} 条通道`,
      latencyMs: 420,
    })
    writeOp('同步', `刷新本机通道池：${p.name}`, { platformId: p.id, count: localChannels.value.length })
    refresh()
    ElMessage.success('通道池已刷新（演示）')
  } finally {
    loading.value = false
  }
}

async function openShare(p: GbCascadePlatform) {
  if (!p.registered) {
    ElMessage.warning('请先注册成功后再共享通道')
    return
  }
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 260))
    if (!localChannels.value.length) localChannels.value = loadLocalGbChannels()
    if (!localChannels.value.length) localChannels.value = refreshLocalGbChannels()
    channels.value = localChannels.value
    selectedPlatform.value = p
    drawerTab.value = 'share'
    channelsDrawerOpen.value = true
    pushStatusEvent(p.id, p.status, {
      action: '通道共享',
      reason: '打开通道共享面板',
      latencyMs: 260,
    })
  } finally {
    loading.value = false
  }
}

function openRemotePreview(channel: LocalGbChannel) {
  if (!selectedPlatform.value) return
  previewChannel.value = channel
  previewOpen.value = true
  pushStatusEvent(selectedPlatform.value.id, selectedPlatform.value.status, {
    action: '状态校验',
    reason: `发起远程调阅：${channel.name}`,
  })
}

async function syncAll() {
  const candidates = fullData.value.filter((p) => p.enabled && p.registered)
  if (!candidates.length) {
    ElMessage.warning('暂无已注册的上级平台')
    return
  }
  const confirmed = await ElMessageBox.confirm(
    `确认刷新本机通道池并应用到全部上级平台？将影响 ${candidates.length} 个平台的通道目录视图。`,
    '刷新通道池（全部）',
    {
    type: 'warning',
    confirmButtonText: '刷新',
    cancelButtonText: '取消',
    }
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  syncingAll.value = true
  try {
    await new Promise((r) => setTimeout(r, 520))
    localChannels.value = refreshLocalGbChannels()
    const totalCount = localChannels.value.length
    for (const p of candidates) {
      pushStatusEvent(p.id, p.status, {
        action: '通道同步',
        reason: `批量刷新通道池，共 ${totalCount} 条通道`,
        latencyMs: 520,
      })
      writeOp('同步', `刷新本机通道池：${p.name}`, { platformId: p.id, count: totalCount, batch: true })
    }
    refresh()
    ElMessage.success(`通道池已刷新（演示）：${candidates.length}个平台，共${totalCount}条通道`)
  } finally {
    syncingAll.value = false
  }
}

onMounted(() => {
  fullData.value = loadPlatforms()
  ensureHistorySeed(fullData.value)
  localChannels.value = loadLocalGbChannels()
  refresh()
})

watch([page, pageSize], () => refresh())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">国标级联</div>
        <div class="mt-1 text-xs text-zinc-500">“刷新通道池”用于从本机摄像头列表刷新可共享通道；“通道共享”用于选择共享给该上级的平台通道。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-button :loading="syncingAll" @click="syncAll">刷新通道池（全部）</el-button>
        <el-button type="primary" @click="openCreate">新增上级平台</el-button>
      </div>
    </div>

    <el-card>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-8">
        <el-input v-model="filter.keyword" placeholder="名称/ID/IP/域/服务器" clearable class="md:col-span-4" />
        <el-select v-model="filter.status" placeholder="状态" clearable class="md:col-span-2">
          <el-option label="在线" value="在线" />
          <el-option label="离线" value="离线" />
          <el-option label="异常" value="异常" />
        </el-select>
        <el-select v-model="filter.enabled" placeholder="启用" clearable class="md:col-span-2">
          <el-option label="启用" value="启用" />
          <el-option label="停用" value="停用" />
        </el-select>
      </div>
      <div class="mt-3 flex items-center justify-end gap-2">
        <el-button @click="onReset">重置</el-button>
        <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
      </div>
    </el-card>

    <el-card>
      <el-table :data="rows" size="small" v-loading="loading" height="560" class="table-standard">
        <el-table-column prop="name" label="上级平台" min-width="200" />
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag
              :type="statusTagType(scope.row.status)"
              size="small"
              class="cursor-pointer"
              @click="openStatus(scope.row)"
            >
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.registered ? 'success' : 'info'" size="small">{{ scope.row.registered ? '已注册' : '未注册' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.enabled ? 'success' : 'info'" size="small">{{ scope.row.enabled ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sipServer" label="SIP服务器" width="160" />
        <el-table-column label="上级ID" min-width="200">
          <template #default="scope">
            <span class="font-mono text-xs">{{ scope.row.serverId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="共享/总数" width="110">
          <template #default="scope">
            <span class="text-xs">{{ sharedCount(scope.row.id) }}/{{ localChannels.length || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="最近注册" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.lastRegisterAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="340" fixed="right">
          <template #default="scope">
            <div class="flex items-center gap-2">
              <el-button link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
              <el-button link type="primary" size="small" @click="scope.row.registered ? unregister(scope.row) : register(scope.row)">
                {{ scope.row.registered ? '注销' : '注册' }}
              </el-button>
              <el-button link type="primary" size="small" @click="syncChannels(scope.row)">刷新通道池</el-button>
              <el-dropdown trigger="click">
                <el-button link type="primary" size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="openShare(scope.row)">通道共享</el-dropdown-item>
                    <el-dropdown-item @click="toggleEnabled(scope.row)">{{ scope.row.enabled ? '停用' : '启用' }}</el-dropdown-item>
                    <el-dropdown-item @click="removePlatform(scope.row)">删除</el-dropdown-item>
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

    <GbPlatformFormDialog v-model="dialogOpen" :platform="editing" @save="upsertPlatform" />
    <GbChannelsDrawer
      v-model="channelsDrawerOpen"
      :platform="selectedPlatform"
      :channels="channels"
      :initial-tab="drawerTab"
      :total-count="localChannels.length"
      @preview="openRemotePreview"
    />
    <GbStatusTimelineDialog v-model="statusOpen" :platform="statusPlatform" :events="statusEvents" />
    <GbRemotePreviewDialog v-model="previewOpen" :platform="selectedPlatform" :channel="previewChannel" />
  </div>
</template>
