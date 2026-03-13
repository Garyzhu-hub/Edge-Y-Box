<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import { appendManualLog } from '@/utils/logsMock'
import RoleFormDialog from '@/components/system/roles/RoleFormDialog.vue'
import { makeDefaultRoles, type SystemRole, type RoleStatus } from '@/utils/rolesMock'

type FilterModel = {
  keyword: string
  status: '' | RoleStatus
}

const STORAGE_KEY = 'edge_roles_v1'

const filter = reactive<FilterModel>({
  keyword: '',
  status: '',
})

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const fullData = ref<SystemRole[]>([])
const rows = ref<SystemRole[]>([])

function loadRoles() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as SystemRole[]
    }
  } catch {
    return makeDefaultRoles()
  }
  return makeDefaultRoles()
}

function saveRoles(list: SystemRole[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

function applyFilter(data: SystemRole[]) {
  const kw = filter.keyword.trim()
  return data
    .filter((r) => (kw ? r.name.includes(kw) || r.description.includes(kw) || r.id.includes(kw) : true))
    .filter((r) => (filter.status ? r.status === filter.status : true))
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
  page.value = 1
  refresh()
}

const dialogOpen = ref(false)
const editing = ref<SystemRole | null>(null)

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(r: SystemRole) {
  editing.value = r
  dialogOpen.value = true
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
    requestId: `roles_${Math.floor(Math.random() * 1e6)}`,
    detail,
  })
}

function upsertRole(payload: { roleId?: string; model: { name: string; description: string; status: RoleStatus; permissionIds: string[] } }) {
  const list = [...fullData.value]
  const now = Date.now()

  if (payload.roleId) {
    const idx = list.findIndex((x) => x.id === payload.roleId)
    if (idx >= 0) {
      const builtin = list[idx].id === 'R-00001' || list[idx].id === 'R-00002'
      list[idx] = {
        ...list[idx],
        name: builtin ? list[idx].name : payload.model.name,
        description: builtin ? list[idx].description : payload.model.description,
        status: builtin ? list[idx].status : payload.model.status,
        permissionIds: payload.model.permissionIds,
        updatedAtMs: now,
      }
      writeOp('编辑', `编辑角色 ${list[idx].name}`, { roleId: list[idx].id })
    }
  } else {
    if (list.some((x) => x.name === payload.model.name)) {
      ElMessage.error('角色名称已存在')
      return
    }
    const next: SystemRole = {
      id: `R-${String(10000 + list.length + 1).padStart(5, '0')}`,
      name: payload.model.name,
      description: payload.model.description,
      status: payload.model.status,
      permissionIds: payload.model.permissionIds,
      createdAtMs: now,
      updatedAtMs: now,
    }
    list.unshift(next)
    writeOp('创建', `新增角色 ${next.name}`, { roleId: next.id })
  }

  fullData.value = list
  saveRoles(list)
  refresh()
  ElMessage.success('已保存（演示）')
}

async function toggleStatus(r: SystemRole) {
  if (r.id === 'R-00001' || r.id === 'R-00002') {
    ElMessage.warning('系统内置角色不可禁用')
    return
  }
  const next: RoleStatus = r.status === '启用' ? '禁用' : '启用'
  await ElMessageBox.confirm(`确认将角色“${r.name}”设为${next}？`, '二次确认', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  })
  const list = fullData.value.map((x) => (x.id === r.id ? { ...x, status: next, updatedAtMs: Date.now() } : x))
  fullData.value = list
  saveRoles(list)
  writeOp(next === '启用' ? '启用' : '停用', `${next}角色 ${r.name}`, { roleId: r.id, next })
  refresh()
  ElMessage.success('已更新（演示）')
}

async function removeRole(r: SystemRole) {
  if (r.id === 'R-00001' || r.id === 'R-00002') {
    ElMessage.warning('系统内置角色不可删除')
    return
  }
  await ElMessageBox.confirm(`确认删除角色“${r.name}”？此操作不可恢复。`, '二次确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  const list = fullData.value.filter((x) => x.id !== r.id)
  fullData.value = list
  saveRoles(list)
  writeOp('删除', `删除角色 ${r.name}`, { roleId: r.id })
  refresh()
  ElMessage.success('已删除（演示）')
}

onMounted(() => {
  fullData.value = loadRoles()
  refresh()
})

watch([page, pageSize], () => refresh())
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">角色管理</div>
        <div class="mt-1 text-xs text-zinc-500">角色用于聚合权限，供用户绑定（演示）。</div>
      </div>

      <div class="flex items-center gap-2">
        <el-button type="primary" @click="openCreate">新增角色</el-button>
      </div>
    </div>

    <el-card>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-6">
        <el-input v-model="filter.keyword" placeholder="角色名称/描述/ID" clearable />
        <el-select v-model="filter.status" placeholder="状态" clearable>
          <el-option label="启用" value="启用" />
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
        <el-table-column prop="name" label="角色名称" min-width="160" />
        <el-table-column prop="description" label="描述" min-width="220" />
        <el-table-column label="权限数" width="90">
          <template #default="scope">
            <span class="text-xs">{{ scope.row.permissionIds.length }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === '启用' ? 'success' : 'info'" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.updatedAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.createdAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="scope">
            <div class="flex items-center gap-2">
              <el-button link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
              <el-dropdown trigger="click">
                <el-button link type="primary" size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      :disabled="scope.row.id === 'R-00001' || scope.row.id === 'R-00002'"
                      @click="toggleStatus(scope.row)"
                    >
                      {{ scope.row.status === '启用' ? '禁用' : '启用' }}
                    </el-dropdown-item>
                    <el-dropdown-item
                      :disabled="scope.row.id === 'R-00001' || scope.row.id === 'R-00002'"
                      @click="removeRole(scope.row)"
                    >
                      删除
                    </el-dropdown-item>
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

    <RoleFormDialog v-model="dialogOpen" :role="editing" @save="upsertRole" />
  </div>
</template>

