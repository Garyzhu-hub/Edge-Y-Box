<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import CameraFormDialog, { type Camera, type CameraProtocol } from '@/components/devices/CameraFormDialog.vue'
import SnapshotTestDialog from '@/components/devices/SnapshotTestDialog.vue'
import LiveStreamDialog from '@/components/devices/LiveStreamDialog.vue'
import { cascadeDeleteCameras } from '@/utils/cascadeDelete'
import {
  computedStatus,
  flattenGroupOptions,
  groupTree as initialGroupTree,
  makeMockCameras,
  type Status,
  type TreeNode,
} from '@/utils/devicesCamerasMock'

const GROUPS_KEY = 'edge_camera_groups_v1'
const DEFAULT_GROUP_ID = 'default'
const CAMERAS_KEY = 'edge_cameras_v1'

const groupSearch = ref('')
const treeRef = ref()

function loadGroupTree() {
  try {
    const raw = window.localStorage.getItem(GROUPS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as TreeNode[]
    }
  } catch {
    return initialGroupTree
  }
  return initialGroupTree
}

function saveGroupTree(tree: TreeNode[]) {
  try {
    window.localStorage.setItem(GROUPS_KEY, JSON.stringify(tree))
  } catch {
    return
  }
}

const groupTree = ref<TreeNode[]>(loadGroupTree())

const groupRootNode = computed(() => findNode(groupTree.value, 'all') ?? groupTree.value[0] ?? null)

const groupOptions = computed(() => flattenGroupOptions(groupTree.value))
const formGroups = computed(() => groupOptions.value.filter((g) => g.id !== 'all'))

watch(
  () => groupSearch.value,
  () => {
    treeRef.value?.filter?.(groupSearch.value)
  }
)

function filterTree(value: string, data: TreeNode) {
  if (!value) return true
  return data.label.includes(value.trim())
}

const selectedGroupId = ref('all')

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const hit = findNode(n.children, id)
      if (hit) return hit
    }
  }
  return null
}

function nodeDepth(nodes: TreeNode[], id: string, depth = 0): number | null {
  for (const n of nodes) {
    if (n.id === id) return depth
    if (n.children) {
      const d = nodeDepth(n.children, id, depth + 1)
      if (typeof d === 'number') return d
    }
  }
  return null
}

function collectDescendantIds(node: TreeNode, into: Set<string>) {
  into.add(node.id)
  for (const c of node.children ?? []) collectDescendantIds(c, into)
}

const selectedGroupIds = computed<Set<string> | null>(() => {
  if (selectedGroupId.value === 'all') return null
  const root = findNode(groupTree.value, selectedGroupId.value)
  if (!root) return null
  const set = new Set<string>()
  collectDescendantIds(root, set)
  return set
})

function onTreeNodeClick(data: TreeNode) {
  selectedGroupId.value = data.id
  page.value = 1
  refresh()
}

const keyword = ref('')
const status = ref<'' | Status>('')
const protocol = ref<'' | CameraProtocol>('')

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const fullData = ref<Camera[]>([])

function loadCameras() {
  try {
    const raw = window.localStorage.getItem(CAMERAS_KEY)
    if (!raw) return [] as Camera[]
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Camera[]) : ([] as Camera[])
  } catch {
    return [] as Camera[]
  }
}

function saveCameras(list: Camera[]) {
  try {
    window.localStorage.setItem(CAMERAS_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

onMounted(() => {
  if (!findNode(groupTree.value, DEFAULT_GROUP_ID)) {
    groupTree.value = initialGroupTree
    saveGroupTree(groupTree.value)
  }
  const persisted = loadCameras()
  if (persisted.length) {
    fullData.value = persisted
  } else {
    fullData.value = makeMockCameras(groupOptions.value)
    saveCameras(fullData.value)
  }
  refresh()
})

function groupLabelById(id: string) {
  const g = groupOptions.value.find((x) => x.id === id)
  return g ? g.label : '—'
}

function applyFilter(data: Camera[]) {
  const kw = keyword.value.trim()
  return data
    .filter((c) => {
      const ids = selectedGroupIds.value
      if (!ids) return true
      return ids.has(c.groupId)
    })
    .filter((c) => {
      if (!kw) return true
      return c.name.includes(kw) || c.ip.includes(kw) || c.id.includes(kw)
    })
    .filter((c) => (protocol.value ? c.protocol === protocol.value : true))
    .filter((c) => {
      if (!status.value) return true
      return computedStatus(c) === status.value
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

const rows = ref<Camera[]>([])

async function fetchData() {
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 220))
    const filtered = applyFilter(fullData.value)
    total.value = filtered.length
    const start = (page.value - 1) * pageSize.value
    return filtered.slice(start, start + pageSize.value)
  } finally {
    loading.value = false
  }
}

async function refresh() {
  rows.value = await fetchData()
}

function onSearch() {
  page.value = 1
  refresh()
}

function onReset() {
  keyword.value = ''
  status.value = ''
  protocol.value = ''
  selectedGroupId.value = 'all'
  page.value = 1
  refresh()
}

watch([page, pageSize], () => refresh())

const formOpen = ref(false)
const editing = ref<Camera | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openEdit(c: Camera) {
  editing.value = { ...c }
  formOpen.value = true
}

function upsertCamera(c: Camera) {
  const idx = fullData.value.findIndex((x) => x.id === c.id)
  if (idx >= 0) fullData.value[idx] = c
  else fullData.value.unshift(c)
  saveCameras(fullData.value)
  refresh()
}

async function removeCamera(c: Camera) {
  const confirmed = await ElMessageBox.confirm(`确认删除摄像头 ${c.name}？`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  const r = cascadeDeleteCameras([c.id])
  fullData.value = loadCameras()
  ElMessage.success(
    `已删除（联动：布点 ${r.removedDeployments}，任务更新 ${r.updatedTasks}${r.disabledTasks ? `，任务停用 ${r.disabledTasks}` : ''}）`
  )
  refresh()
}

type GroupStats = { total: number; online: number }

function buildGroupStats() {
  const direct = new Map<string, GroupStats>()
  for (const c of fullData.value) {
    const s = computedStatus(c)
    const cur = direct.get(c.groupId) ?? { total: 0, online: 0 }
    cur.total += 1
    if (s === '在线') cur.online += 1
    direct.set(c.groupId, cur)
  }

  const aggregate = new Map<string, GroupStats>()
  function walk(node: TreeNode): GroupStats {
    let total = 0
    let online = 0
    const self = direct.get(node.id)
    if (self) {
      total += self.total
      online += self.online
    }
    for (const child of node.children ?? []) {
      const s = walk(child)
      total += s.total
      online += s.online
    }
    const stats = { total, online }
    aggregate.set(node.id, stats)
    return stats
  }
  for (const r of groupTree.value) walk(r)
  return aggregate
}

const groupStatsMap = computed(() => buildGroupStats())

function getStats(id: string) {
  return groupStatsMap.value.get(id) ?? { total: 0, online: 0 }
}

function nextGroupId() {
  return `g_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

function updateTree(mutator: (tree: TreeNode[]) => void) {
  const next = JSON.parse(JSON.stringify(groupTree.value)) as TreeNode[]
  mutator(next)
  groupTree.value = next
  saveGroupTree(next)
}

async function createGroup(parent: TreeNode) {
  const depth = nodeDepth(groupTree.value, parent.id)
  if (typeof depth === 'number' && depth >= 5) {
    ElMessage.warning('分组层级最多支持5级')
    return
  }
  const { value, action } = await ElMessageBox.prompt('请输入分组名称', '新增分组', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputPlaceholder: '例如：一层',
    inputValue: '',
  }).catch(() => ({ value: '', action: 'cancel' as const }))
  if (action !== 'confirm') return
  const name = String(value).trim()
  if (!name) {
    ElMessage.warning('分组名称不能为空')
    return
  }

  const currentParent = findNode(groupTree.value, parent.id)
  const siblings = currentParent?.children ?? []
  if (siblings.some((x) => x.label === name)) {
    ElMessage.warning('同级分组名称重复')
    return
  }

  updateTree((tree) => {
    const p = findNode(tree, parent.id)
    if (!p) return
    const children = (p.children ??= [])
    children.push({ id: nextGroupId(), label: name })
  })
  ElMessage.success('已新增分组（演示）')
}

async function renameGroup(node: TreeNode) {
  if (node.fixed) return
  const { value, action } = await ElMessageBox.prompt('请输入新的分组名称', '重命名分组', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputValue: node.label,
  }).catch(() => ({ value: '', action: 'cancel' as const }))
  if (action !== 'confirm') return
  const name = String(value).trim()
  if (!name) {
    ElMessage.warning('分组名称不能为空')
    return
  }
  updateTree((tree) => {
    const n = findNode(tree, node.id)
    if (n) n.label = name
  })
  ElMessage.success('已重命名（演示）')
}

function collectRemovedIds(node: TreeNode, into: Set<string>) {
  into.add(node.id)
  for (const c of node.children ?? []) collectRemovedIds(c, into)
}

function removeNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  const idx = nodes.findIndex((x) => x.id === id)
  if (idx >= 0) return nodes.splice(idx, 1)[0] ?? null
  for (const n of nodes) {
    if (n.children) {
      const hit = removeNodeById(n.children, id)
      if (hit) return hit
    }
  }
  return null
}

async function deleteGroup(node: TreeNode) {
  if (node.fixed || node.id === 'all') return
  const confirmed = await ElMessageBox.confirm(`确认删除分组“${node.label}”？其子分组也将一并删除。`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  const removedIds = new Set<string>()
  updateTree((tree) => {
    const removed = removeNodeById(tree, node.id)
    if (removed) collectRemovedIds(removed, removedIds)
  })

  if (removedIds.size) {
    const fallbackGroupId = findNode(groupTree.value, DEFAULT_GROUP_ID)?.id ?? groupOptions.value.find((g) => g.id !== 'all')?.id ?? 'all'
    fullData.value = fullData.value.map((c) => (removedIds.has(c.groupId) ? { ...c, groupId: fallbackGroupId, updatedAtMs: Date.now() } : c))
    saveCameras(fullData.value)
    if (removedIds.has(selectedGroupId.value)) selectedGroupId.value = 'all'
    refresh()
  }
  ElMessage.success('已删除分组（演示）')
}

const snapshotOpen = ref(false)
const liveOpen = ref(false)
const activeCamera = ref<Camera | null>(null)

function openSnapshot(c: Camera) {
  activeCamera.value = c
  snapshotOpen.value = true
}

function openLive(c: Camera) {
  activeCamera.value = c
  liveOpen.value = true
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">摄像头管理</div>
        <div class="mt-1 text-xs text-zinc-500">支持分组、查询与基础运维动作（演示）。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-button type="primary" @click="openCreate">新增摄像头</el-button>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <el-card class="lg:col-span-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm font-semibold">分组</div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-zinc-500">{{ groupLabelById(selectedGroupId) }}</span>
            <el-button link type="primary" size="small" :disabled="!groupRootNode" @click="groupRootNode && createGroup(groupRootNode)">
              新增
            </el-button>
          </div>
        </div>
        <div class="mt-3">
          <el-input v-model="groupSearch" placeholder="搜索分组" clearable />
        </div>
        <div class="mt-3">
          <el-tree
            ref="treeRef"
            :data="groupTree"
            node-key="id"
            :props="{ label: 'label', children: 'children' }"
            default-expand-all
            :filter-node-method="filterTree"
            highlight-current
            :expand-on-click-node="false"
            @node-click="onTreeNodeClick"
          >
            <template #default="{ data }">
              <div class="flex w-full items-center justify-between gap-2 pr-1">
                <div class="min-w-0 flex-1 truncate">
                  <span class="truncate">{{ data.label }}</span>
                  <span class="ml-2 text-xs text-zinc-500">{{ getStats(data.id).online }}/{{ getStats(data.id).total }}</span>
                </div>
                <el-dropdown trigger="click" @click.stop>
                  <el-button link type="primary" size="small" @click.stop>⋯</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click="createGroup(data)">新增子分组</el-dropdown-item>
                      <el-dropdown-item :disabled="data.fixed || data.id === 'all'" @click="renameGroup(data)">
                        重命名
                      </el-dropdown-item>
                      <el-dropdown-item :disabled="data.fixed || data.id === 'all'" @click="deleteGroup(data)">
                        删除
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </template>
          </el-tree>
        </div>
      </el-card>

      <div class="lg:col-span-9 space-y-4">
        <el-card>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
            <el-input v-model="keyword" placeholder="名称 / IP / 编号" clearable />
            <el-select v-model="protocol" placeholder="协议" clearable>
              <el-option label="RTSP" value="RTSP" />
              <el-option label="GB28181" value="GB28181" />
              <el-option label="HTTP" value="HTTP" />
              <el-option label="ONVIF" value="ONVIF" />
            </el-select>
            <el-select v-model="status" placeholder="状态" clearable>
              <el-option label="在线" value="在线" />
              <el-option label="离线" value="离线" />
              <el-option label="禁用" value="禁用" />
            </el-select>
            <div class="flex items-center justify-end gap-2">
              <el-button @click="onReset">重置</el-button>
              <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
            </div>
          </div>
        </el-card>

        <el-card>
          <el-table :data="rows" size="small" v-loading="loading" height="560" class="table-standard">
            <el-table-column prop="name" label="名称" min-width="180" />
            <el-table-column label="分组路径" min-width="220">
              <template #default="scope">
                <span class="text-xs text-zinc-700">{{ groupLabelById(scope.row.groupId) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="ip" label="IP" width="140" />
            <el-table-column prop="port" label="端口" width="80" />
            <el-table-column prop="protocol" label="协议" width="90" />
            <el-table-column label="状态" width="86">
              <template #default="scope">
                <el-tag
                  :type="computedStatus(scope.row) === '在线' ? 'success' : computedStatus(scope.row) === '离线' ? 'danger' : 'info'"
                  size="small"
                >
                  {{ computedStatus(scope.row) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="更新时间" width="160">
              <template #default="scope">
                <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.updatedAtMs) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="320" fixed="right">
              <template #default="scope">
                <div class="flex items-center gap-2">
                  <el-button link type="primary" size="small" @click="openSnapshot(scope.row)">抓图测试</el-button>
                  <el-button link type="primary" size="small" @click="openLive(scope.row)">直播流</el-button>
                  <el-dropdown trigger="click">
                    <el-button link type="primary" size="small">更多</el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item @click="openEdit(scope.row)">编辑</el-dropdown-item>
                        <el-dropdown-item @click="removeCamera(scope.row)">删除</el-dropdown-item>
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
      </div>
    </div>

    <CameraFormDialog v-model="formOpen" :initial="editing" :groups="formGroups" @saved="upsertCamera" />
    <SnapshotTestDialog v-model="snapshotOpen" :camera="activeCamera" />
    <LiveStreamDialog v-model="liveOpen" :camera="activeCamera" />
  </div>
</template>
