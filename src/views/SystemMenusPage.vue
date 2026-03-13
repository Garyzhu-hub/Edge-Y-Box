<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { appendManualLog } from '@/utils/logsMock'
import MenuFormDialog from '@/components/system/menus/MenuFormDialog.vue'
import { buildMenuTree, makeDefaultMenus, type SystemMenuItem, type MenuStatus } from '@/utils/menusMock'
import { formatDateTime } from '@/stores/app'

type FilterModel = {
  keyword: string
  status: '' | MenuStatus
}

type MenuRow = SystemMenuItem & { children?: MenuRow[] }

const STORAGE_KEY = 'edge_menus_v1'

const filter = reactive<FilterModel>({
  keyword: '',
  status: '',
})

const loading = ref(false)
const fullData = ref<SystemMenuItem[]>([])

const treeData = computed<MenuRow[]>(() => buildMenuTree(applyFilter(fullData.value)) as MenuRow[])

function applyFilter(list: SystemMenuItem[]) {
  const kw = filter.keyword.trim()
  const base = list
    .filter((x) => (filter.status ? x.status === filter.status : true))
    .sort((a, b) => a.order - b.order)

  if (!kw) return base

  const keep = new Set<string>()
  const byId = new Map(base.map((x) => [x.id, x]))
  for (const item of base) {
    if (
      item.title.includes(kw) ||
      item.path.includes(kw) ||
      (item.permission || '').includes(kw) ||
      item.id.includes(kw)
    ) {
      keep.add(item.id)
      let p = item.parentId
      while (p) {
        keep.add(p)
        p = byId.get(p)?.parentId ?? null
      }
    }
  }
  return base.filter((x) => keep.has(x.id))
}

function loadMenus() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as SystemMenuItem[]
    }
  } catch {
    return makeDefaultMenus()
  }
  return makeDefaultMenus()
}

function saveMenus(list: SystemMenuItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

function writeOp(action: string, summary: string, detail: Record<string, unknown>) {
  appendManualLog({
    kind: 'operation',
    tsMs: Date.now(),
    level: 'info',
    module: '用户与权限',
    action,
    summary,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `menus_${Math.floor(Math.random() * 1e6)}`,
    detail,
  })
}

const dialogOpen = ref(false)
const editing = ref<SystemMenuItem | null>(null)
const parentForDialog = ref<SystemMenuItem | null>(null)

function openCreateRoot() {
  editing.value = null
  parentForDialog.value = null
  dialogOpen.value = true
}

function openCreateChild(parent: SystemMenuItem) {
  editing.value = null
  parentForDialog.value = parent
  dialogOpen.value = true
}

function openEdit(item: SystemMenuItem) {
  editing.value = item
  parentForDialog.value = item.parentId ? fullData.value.find((x) => x.id === item.parentId) ?? null : null
  dialogOpen.value = true
}

function nextId(list: SystemMenuItem[]) {
  const n = 10000 + list.length + 1
  return `M-${String(n).padStart(5, '0')}`
}

function saveItem(payload: {
  id?: string
  parentId: string | null
  model: {
    title: string
    path: string
    icon: string
    permission: string
    status: MenuStatus
    order: number
  }
}) {
  const list = [...fullData.value]
  const now = Date.now()
  if (payload.id) {
    const idx = list.findIndex((x) => x.id === payload.id)
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        parentId: payload.parentId,
        title: payload.model.title,
        path: payload.model.path,
        icon: payload.model.icon || undefined,
        permission: payload.model.permission || undefined,
        status: payload.model.status,
        order: payload.model.order,
      }
      writeOp('编辑', `编辑菜单 ${list[idx].title}`, { menuId: list[idx].id, at: formatDateTime(now) })
    }
  } else {
    const id = nextId(list)
    const next: SystemMenuItem = {
      id,
      parentId: payload.parentId,
      title: payload.model.title,
      path: payload.model.path,
      icon: payload.model.icon || undefined,
      permission: payload.model.permission || undefined,
      status: payload.model.status,
      order: payload.model.order,
    }
    list.push(next)
    writeOp('创建', `新增菜单 ${next.title}`, { menuId: next.id, at: formatDateTime(now) })
  }
  fullData.value = list
  saveMenus(list)
  ElMessage.success('已保存（演示）')
}

async function toggleStatus(item: SystemMenuItem) {
  const next: MenuStatus = item.status === '显示' ? '隐藏' : '显示'
  await ElMessageBox.confirm(`确认将菜单“${item.title}”设为${next}？`, '二次确认', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  })
  const list = fullData.value.map((x) => (x.id === item.id ? { ...x, status: next } : x))
  fullData.value = list
  saveMenus(list)
  writeOp(next === '显示' ? '启用' : '停用', `${next}菜单 ${item.title}`, { menuId: item.id, next })
  ElMessage.success('已更新（演示）')
}

function childrenOf(parentId: string | null) {
  return fullData.value
    .filter((x) => x.parentId === parentId)
    .slice()
    .sort((a, b) => a.order - b.order)
}

function reorderWithinParent(parentId: string | null, id: string, dir: 'up' | 'down') {
  const siblings = childrenOf(parentId)
  const idx = siblings.findIndex((x) => x.id === id)
  if (idx < 0) return
  const swapWith = dir === 'up' ? idx - 1 : idx + 1
  if (swapWith < 0 || swapWith >= siblings.length) return
  const a = siblings[idx]
  const b = siblings[swapWith]

  const list = fullData.value.map((x) => {
    if (x.id === a.id) return { ...x, order: b.order }
    if (x.id === b.id) return { ...x, order: a.order }
    return x
  })
  fullData.value = list
  saveMenus(list)
  writeOp('编辑', `调整菜单排序 ${a.title}`, { menuId: a.id, dir })
  ElMessage.success('已调整（演示）')
}

async function removeItem(item: SystemMenuItem) {
  const descendants = new Set<string>()
  const byParent = new Map<string | null, SystemMenuItem[]>()
  for (const x of fullData.value) {
    if (!byParent.has(x.parentId)) byParent.set(x.parentId, [])
    byParent.get(x.parentId)!.push(x)
  }
  function collect(id: string) {
    descendants.add(id)
    for (const c of byParent.get(id) ?? []) collect(c.id)
  }
  collect(item.id)
  const count = descendants.size
  await ElMessageBox.confirm(`确认删除菜单“${item.title}”？将同时删除其子菜单（共 ${count} 项）。`, '二次确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  const list = fullData.value.filter((x) => !descendants.has(x.id))
  fullData.value = list
  saveMenus(list)
  writeOp('删除', `删除菜单 ${item.title}`, { menuId: item.id, removed: count })
  ElMessage.success('已删除（演示）')
}

function onResetToDefault() {
  fullData.value = makeDefaultMenus()
  saveMenus(fullData.value)
  writeOp('编辑', '重置菜单为默认', { count: fullData.value.length })
  ElMessage.success('已重置（演示）')
}

onMounted(() => {
  fullData.value = loadMenus()
})

watch(
  () => [filter.keyword, filter.status],
  () => {
    loading.value = true
    setTimeout(() => {
      loading.value = false
    }, 120)
  }
)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">菜单管理</div>
        <div class="mt-1 text-xs text-zinc-500">用于演示菜单台账与排序/显隐配置（不影响左侧导航）。</div>
      </div>

      <div class="flex items-center gap-2">
        <el-button @click="onResetToDefault">重置默认</el-button>
        <el-button type="primary" @click="openCreateRoot">新增一级菜单</el-button>
      </div>
    </div>

    <el-card>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-6">
        <el-input v-model="filter.keyword" placeholder="名称/路径/权限/ID" clearable />
        <el-select v-model="filter.status" placeholder="状态" clearable>
          <el-option label="显示" value="显示" />
          <el-option label="隐藏" value="隐藏" />
        </el-select>
      </div>
    </el-card>

    <el-card>
      <el-table
        :data="treeData"
        row-key="id"
        default-expand-all
        :tree-props="{ children: 'children' }"
        size="small"
        height="560"
        class="table-standard"
        v-loading="loading"
      >
        <el-table-column prop="title" label="菜单名称" min-width="180" />
        <el-table-column prop="path" label="路径" min-width="180" />
        <el-table-column prop="permission" label="权限" min-width="160" />
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === '显示' ? 'success' : 'info'" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="排序" width="110">
          <template #default="scope">
            <div class="flex items-center gap-1">
              <span class="w-9 text-xs text-zinc-600">{{ scope.row.order }}</span>
              <el-button link type="primary" size="small" @click="reorderWithinParent(scope.row.parentId, scope.row.id, 'up')">
                上移
              </el-button>
              <el-button link type="primary" size="small" @click="reorderWithinParent(scope.row.parentId, scope.row.id, 'down')">
                下移
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="scope">
            <div class="flex items-center gap-2">
              <el-button link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
              <el-button link type="primary" size="small" @click="openCreateChild(scope.row)">新增子菜单</el-button>
              <el-dropdown trigger="click">
                <el-button link type="primary" size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="toggleStatus(scope.row)">
                      {{ scope.row.status === '显示' ? '隐藏' : '显示' }}
                    </el-dropdown-item>
                    <el-dropdown-item @click="removeItem(scope.row)">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <MenuFormDialog v-model="dialogOpen" :item="editing" :parent="parentForDialog" @save="saveItem" />
  </div>
</template>

