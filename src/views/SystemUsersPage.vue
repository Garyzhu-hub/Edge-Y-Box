<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { appendManualLog } from '@/utils/logsMock'
import UserFormDialog from '@/components/system/users/UserFormDialog.vue'
import { makeMockUsers, type SystemUser, type SystemUserRole, type UserStatus } from '@/utils/usersMock'

type FilterModel = {
  keyword: string
  role: '' | SystemUserRole
  status: '' | UserStatus
}

const auth = useAuthStore()
const canCreate = computed(() => auth.hasPermission('system.users.create'))
const canEdit = computed(() => auth.hasPermission('system.users.edit'))
const canDelete = computed(() => auth.hasPermission('system.users.delete'))

const STORAGE_KEY = 'edge_users_v1'

const filter = reactive<FilterModel>({
  keyword: '',
  role: '',
  status: '',
})

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const fullData = ref<SystemUser[]>([])
const rows = ref<SystemUser[]>([])

function loadUsers() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as SystemUser[]
    }
  } catch {
    return makeMockUsers({ count: 12 })
  }
  return makeMockUsers({ count: 12 })
}

function saveUsers(list: SystemUser[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

function applyFilter(data: SystemUser[]) {
  const kw = filter.keyword.trim()
  return data
    .filter((u) => (kw ? u.username.includes(kw) || u.displayName.includes(kw) || u.id.includes(kw) : true))
    .filter((u) => (filter.role ? u.role === filter.role : true))
    .filter((u) => (filter.status ? u.status === filter.status : true))
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
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
  filter.role = ''
  filter.status = ''
  page.value = 1
  refresh()
}

const dialogOpen = ref(false)
const editing = ref<SystemUser | null>(null)

const isEditingAdmin = computed(() => editing.value?.username === 'admin')

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(u: SystemUser) {
  editing.value = u
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
    requestId: `users_${Math.floor(Math.random() * 1e6)}`,
    detail,
  })
}

function upsertUser(payload: {
  userId?: string
  model: {
    username: string
    displayName: string
    role: SystemUserRole
    status: UserStatus
    password: string
  }
}) {
  const list = [...fullData.value]
  if (payload.userId) {
    const idx = list.findIndex((x) => x.id === payload.userId)
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        displayName: payload.model.displayName,
        role: payload.model.role,
        status: payload.model.status,
      }
      writeOp('编辑', `编辑用户 ${list[idx].username}`, { userId: list[idx].id })
    }
  } else {
    const username = String(payload.model.username)
    if (list.some((x) => x.username === username)) {
      ElMessage.error('用户名已存在')
      return
    }
    const now = Date.now()
    const next: SystemUser = {
      id: `U-${String(10000 + list.length + 1).padStart(5, '0')}`,
      username,
      displayName: payload.model.displayName,
      role: payload.model.role,
      status: payload.model.status,
      lastLoginMs: now,
      createdAtMs: now,
    }
    list.unshift(next)
    writeOp('创建', `新增用户 ${next.username}`, { userId: next.id })
  }

  fullData.value = list
  saveUsers(list)
  refresh()
  ElMessage.success('已保存（演示）')
}

async function toggleStatus(u: SystemUser) {
  if (u.username === 'admin') {
    ElMessage.warning('admin 账号不可禁用')
    return
  }
  const next: UserStatus = u.status === '启用' ? '禁用' : '启用'
  await ElMessageBox.confirm(`确认将用户“${u.username}”设为${next}？`, '二次确认', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  })
  const list = fullData.value.map((x) => (x.id === u.id ? { ...x, status: next } : x))
  fullData.value = list
  saveUsers(list)
  writeOp(next === '启用' ? '启用' : '停用', `${next}用户 ${u.username}`, { userId: u.id, next })
  refresh()
  ElMessage.success('已更新（演示）')
}

async function resetPassword(u: SystemUser) {
  await ElMessageBox.prompt(`为用户“${u.username}”设置新口令（不落盘，仅演示）`, '重置口令', {
    inputType: 'password',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  })
  writeOp('重置口令', `重置用户口令 ${u.username}`, { userId: u.id })
  ElMessage.success('口令已重置（演示）')
}

async function removeUser(u: SystemUser) {
  if (u.username === 'admin') {
    ElMessage.warning('admin 账号不可删除')
    return
  }
  await ElMessageBox.confirm(`确认删除用户“${u.username}”？此操作不可恢复。`, '二次确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  const list = fullData.value.filter((x) => x.id !== u.id)
  fullData.value = list
  saveUsers(list)
  writeOp('删除', `删除用户 ${u.username}`, { userId: u.id })
  refresh()
  ElMessage.success('已删除（演示）')
}

const roleLabel = (r: SystemUserRole) => (r === 'super_admin' ? '超级管理员' : '项目人员')

onMounted(() => {
  fullData.value = loadUsers()
  refresh()
})

watch([page, pageSize], () => refresh())
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">用户管理</div>
        <div class="mt-1 text-xs text-zinc-500">用于演示 RBAC 与账号台账管理。</div>
      </div>

      <div class="flex items-center gap-2">
        <el-button v-if="canCreate" type="primary" @click="openCreate">新增用户</el-button>
      </div>
    </div>

    <el-card>
      <div class="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:flex-wrap min-[900px]:items-center">
        <div class="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <el-input v-model="filter.keyword" placeholder="用户名/姓名/ID" clearable />
          <el-select v-model="filter.role" placeholder="角色" clearable>
            <el-option label="超级管理员" value="super_admin" />
            <el-option label="项目人员" value="project_user" />
          </el-select>
          <el-select v-model="filter.status" placeholder="状态" clearable>
            <el-option label="启用" value="启用" />
            <el-option label="禁用" value="禁用" />
          </el-select>
        </div>
        <div class="flex shrink-0 items-center justify-end gap-2 min-[900px]:pl-2">
          <el-button @click="onReset">重置</el-button>
          <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
        </div>
      </div>
    </el-card>

    <el-card>
      <el-table :data="rows" size="small" v-loading="loading" height="560" class="table-standard">
        <el-table-column prop="username" label="用户名" width="140" />
        <el-table-column prop="displayName" label="姓名" min-width="140" />
        <el-table-column label="角色" width="120">
          <template #default="scope">
            <span class="text-xs">{{ roleLabel(scope.row.role) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === '启用' ? 'success' : 'info'" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近登录" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.lastLoginMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.createdAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="scope">
            <div class="flex items-center gap-2">
              <el-button v-if="canEdit" link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
              <el-button v-if="canEdit" link type="primary" size="small" @click="resetPassword(scope.row)">重置口令</el-button>
              <el-dropdown v-if="canEdit || canDelete" trigger="click">
                <el-button link type="primary" size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-if="canEdit"
                      :disabled="scope.row.username === 'admin'"
                      @click="toggleStatus(scope.row)"
                    >
                      {{ scope.row.status === '启用' ? '禁用' : '启用' }}
                    </el-dropdown-item>
                    <el-dropdown-item
                      v-if="canDelete"
                      :disabled="scope.row.username === 'admin'"
                      @click="removeUser(scope.row)"
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

    <UserFormDialog v-model="dialogOpen" :user="editing" @save="upsertUser" />

    <el-alert
      v-if="isEditingAdmin"
      type="info"
      title="admin 账号不允许禁用或删除。"
      show-icon
      class="hidden"
    />
  </div>
</template>
