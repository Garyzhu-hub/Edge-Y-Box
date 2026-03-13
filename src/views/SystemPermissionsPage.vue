<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { appendManualLog } from '@/utils/logsMock'
import { permissionCatalog } from '@/config/permissionCatalog'
import { makeDefaultRoles, type SystemRole } from '@/utils/rolesMock'

type FilterModel = {
  keyword: string
  group: '' | string
}

const ROLES_KEY = 'edge_roles_v1'

const filter = reactive<FilterModel>({
  keyword: '',
  group: '',
})

const roles = ref<SystemRole[]>([])
const selectedRoleId = ref('')
const saving = ref(false)

function loadRoles() {
  try {
    const raw = window.localStorage.getItem(ROLES_KEY)
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
    window.localStorage.setItem(ROLES_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

const selectedRole = computed(() => roles.value.find((r) => r.id === selectedRoleId.value) ?? null)
const isBuiltin = computed(() => selectedRole.value?.id === 'R-00001' || selectedRole.value?.id === 'R-00002')

const groupOptions = computed(() => {
  const groups = Array.from(new Set(permissionCatalog.map((p) => p.group)))
  return groups.sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

const filteredPermissions = computed(() => {
  const kw = filter.keyword.trim()
  return permissionCatalog
    .filter((p) => (filter.group ? p.group === filter.group : true))
    .filter((p) => (kw ? p.id.includes(kw) || p.label.includes(kw) || p.group.includes(kw) : true))
})

const permissionIds = ref<string[]>([])

watch(
  () => selectedRoleId.value,
  () => {
    permissionIds.value = selectedRole.value?.permissionIds ? [...selectedRole.value.permissionIds] : []
  }
)

const hasAll = computed(() => permissionIds.value.includes('*') || selectedRole.value?.permissionIds?.includes('*'))

function normalize(ids: string[]) {
  const set = new Set(ids)
  set.delete('*')
  return Array.from(set)
}

function toggleAll(v: boolean) {
  if (isBuiltin.value) return
  if (v) {
    permissionIds.value = ['*']
  } else {
    permissionIds.value = []
  }
}

function selectAllFiltered() {
  if (isBuiltin.value) return
  if (permissionIds.value.includes('*')) return
  const next = new Set(permissionIds.value)
  for (const p of filteredPermissions.value) next.add(p.id)
  permissionIds.value = Array.from(next)
}

function clearAllFiltered() {
  if (isBuiltin.value) return
  if (permissionIds.value.includes('*')) return
  const remove = new Set(filteredPermissions.value.map((p) => p.id))
  permissionIds.value = permissionIds.value.filter((id) => !remove.has(id))
}

async function onSave() {
  if (!selectedRole.value) return
  if (isBuiltin.value) {
    ElMessage.warning('系统内置角色仅允许在“角色管理”中查看（演示）')
    return
  }

  saving.value = true
  try {
    await new Promise((r) => setTimeout(r, 240))
    const now = Date.now()
    const nextIds = permissionIds.value.includes('*') ? ['*'] : normalize(permissionIds.value)
    const list = roles.value.map((r) =>
      r.id === selectedRole.value!.id ? { ...r, permissionIds: nextIds, updatedAtMs: now } : r
    )
    roles.value = list
    saveRoles(list)
    appendManualLog({
      kind: 'operation',
      tsMs: now,
      level: 'info',
      module: '用户与权限',
      action: '更新权限',
      summary: `更新角色权限：${selectedRole.value.name}`,
      operator: 'admin',
      ip: '127.0.0.1',
      requestId: `perm_${Math.floor(Math.random() * 1e6)}`,
      detail: { roleId: selectedRole.value.id, count: nextIds.includes('*') ? 'ALL' : nextIds.length },
    })
    ElMessage.success('已保存（演示）')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  roles.value = loadRoles()
  selectedRoleId.value = roles.value.find((r) => r.id === 'R-00002')?.id ?? roles.value[0]?.id ?? ''
  permissionIds.value = selectedRole.value?.permissionIds ? [...selectedRole.value.permissionIds] : []
})
</script>

<template>
  <div class="space-y-4">
    <div>
      <div class="text-base font-semibold">角色权限</div>
      <div class="mt-1 text-xs text-zinc-500">选择一个角色后，按权限目录勾选可访问模块（演示）。</div>
    </div>

    <div class="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <el-card class="lg:col-span-4">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-sm font-semibold">角色列表</div>
          <div class="text-xs text-zinc-500">共 {{ roles.length }} 个</div>
        </div>
        <el-table :data="roles" size="small" height="560" class="table-standard" @row-click="(r) => (selectedRoleId = r.id)">
          <el-table-column label="角色" min-width="160">
            <template #default="scope">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold">{{ scope.row.name }}</div>
                <div class="truncate text-xs text-zinc-500">{{ scope.row.id }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="权限数" width="80">
            <template #default="scope">
              <span class="text-xs">{{ scope.row.permissionIds.includes('*') ? 'ALL' : scope.row.permissionIds.length }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="scope">
              <el-tag :type="scope.row.status === '启用' ? 'success' : 'info'" size="small">{{ scope.row.status }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card class="lg:col-span-8">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold">{{ selectedRole?.name || '—' }}</div>
            <div class="mt-1 truncate text-xs text-zinc-500">{{ selectedRole?.description || '请选择左侧角色' }}</div>
          </div>

          <div class="flex items-center gap-2">
            <el-switch
              :model-value="hasAll"
              :disabled="!selectedRole || isBuiltin"
              active-text="全权限"
              inactive-text="按清单"
              @change="(v: any) => toggleAll(Boolean(v))"
            />
            <el-button type="primary" :disabled="!selectedRole" :loading="saving" @click="onSave">保存</el-button>
          </div>
        </div>

        <el-alert
          v-if="selectedRole && isBuiltin"
          type="info"
          show-icon
          class="mt-3"
          title="系统内置角色：演示中默认不在此页修改其状态/名称，但可在此页查看权限；如需修改，请在“角色管理”中操作。"
        />

        <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6">
          <el-input v-model="filter.keyword" placeholder="搜索权限ID/名称" clearable :disabled="hasAll" />
          <el-select v-model="filter.group" placeholder="分组" clearable :disabled="hasAll">
            <el-option v-for="g in groupOptions" :key="g" :label="g" :value="g" />
          </el-select>

          <div class="md:col-span-4 flex items-center justify-end gap-2">
            <el-button :disabled="hasAll" @click="clearAllFiltered">清空筛选项</el-button>
            <el-button :disabled="hasAll" @click="selectAllFiltered">全选筛选项</el-button>
          </div>
        </div>

        <div v-if="hasAll" class="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <div class="text-sm font-semibold">已授予全权限</div>
          <div class="mt-1 text-xs text-zinc-500">此模式下不需要逐项勾选；关闭“全权限”可切换为按清单配置。</div>
        </div>

        <div v-else class="mt-4 max-h-[480px] overflow-auto rounded-md border border-zinc-200 p-3">
          <el-checkbox-group v-model="permissionIds">
            <div v-for="p in filteredPermissions" :key="p.id" class="flex items-center justify-between gap-3 py-2">
              <div class="min-w-0">
                <div class="truncate text-sm">{{ p.label }}</div>
                <div class="truncate text-xs text-zinc-500">{{ p.id }} · {{ p.group }}</div>
              </div>
              <el-checkbox :label="p.id" :disabled="!selectedRole || isBuiltin" />
            </div>
          </el-checkbox-group>

          <div v-if="!filteredPermissions.length" class="py-10 text-center text-sm text-zinc-500">未找到匹配权限</div>
        </div>
      </el-card>
    </div>
  </div>
</template>

