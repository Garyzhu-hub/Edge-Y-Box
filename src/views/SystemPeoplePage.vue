<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import { appendManualLog } from '@/utils/logsMock'
import PersonFormDialog from '@/components/system/people/PersonFormDialog.vue'
import { makeDefaultPeople, type PersonRecord, type PersonStatus } from '@/utils/peopleMock'

type FilterModel = {
  keyword: string
  dept: '' | string
  status: '' | PersonStatus
  tag: '' | string
}

const STORAGE_KEY = 'edge_people_v1'

const filter = reactive<FilterModel>({
  keyword: '',
  dept: '',
  status: '',
  tag: '',
})

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const fullData = ref<PersonRecord[]>([])
const rows = ref<PersonRecord[]>([])

function loadPeople() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as PersonRecord[]
    }
  } catch {
    return makeDefaultPeople()
  }
  return makeDefaultPeople()
}

function savePeople(list: PersonRecord[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    return
  }
}

const deptOptions = computed(() => Array.from(new Set(fullData.value.map((x) => x.dept))).sort((a, b) => a.localeCompare(b, 'zh-CN')))
const tagOptions = computed(() => {
  const set = new Set<string>()
  for (const p of fullData.value) for (const t of p.tags) set.add(t)
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

function applyFilter(data: PersonRecord[]) {
  const kw = filter.keyword.trim()
  return data
    .filter((p) => (filter.dept ? p.dept === filter.dept : true))
    .filter((p) => (filter.status ? p.status === filter.status : true))
    .filter((p) => (filter.tag ? p.tags.includes(filter.tag) : true))
    .filter((p) => (kw ? p.name.includes(kw) || p.phone.includes(kw) || p.email.includes(kw) || p.dept.includes(kw) : true))
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
  filter.dept = ''
  filter.status = ''
  filter.tag = ''
  page.value = 1
  refresh()
}

function writeOp(action: string, summary: string, detail: Record<string, unknown>) {
  appendManualLog({
    kind: 'operation',
    tsMs: Date.now(),
    level: 'info',
    module: '人员管理',
    action,
    summary,
    operator: 'admin',
    ip: '127.0.0.1',
    requestId: `people_${Math.floor(Math.random() * 1e6)}`,
    detail,
  })
}

const dialogOpen = ref(false)
const editing = ref<PersonRecord | null>(null)

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(p: PersonRecord) {
  editing.value = p
  dialogOpen.value = true
}

function nextId(list: PersonRecord[]) {
  const n = 1000 + list.length + 1
  return `p_${String(n).padStart(4, '0')}`
}

function upsertPerson(payload: {
  personId?: string
  model: {
    name: string
    phone: string
    dept: string
    title: string
    email: string
    status: PersonStatus
    tags: string[]
  }
}) {
  const list = [...fullData.value]
  const now = Date.now()

  if (payload.personId) {
    const idx = list.findIndex((x) => x.id === payload.personId)
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...payload.model, updatedAtMs: now }
      writeOp('编辑', `编辑人员 ${list[idx].name}`, { personId: list[idx].id })
    }
  } else {
    const id = payload.model.name === 'admin' ? 'u_admin' : nextId(list)
    const next: PersonRecord = {
      id,
      ...payload.model,
      createdAtMs: now,
      updatedAtMs: now,
    }
    list.unshift(next)
    writeOp('创建', `新增人员 ${next.name}`, { personId: next.id })
  }

  fullData.value = list
  savePeople(list)
  refresh()
  ElMessage.success('已保存（演示）')
}

async function removePerson(p: PersonRecord) {
  if (p.id === 'u_admin') {
    ElMessage.warning('admin 人员不可删除')
    return
  }
  await ElMessageBox.confirm(`确认删除人员“${p.name}”？此操作不可恢复。`, '二次确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  const list = fullData.value.filter((x) => x.id !== p.id)
  fullData.value = list
  savePeople(list)
  writeOp('删除', `删除人员 ${p.name}`, { personId: p.id })
  refresh()
  ElMessage.success('已删除（演示）')
}

async function setStatus(p: PersonRecord, status: PersonStatus) {
  if (p.id === 'u_admin' && status === '离职') {
    ElMessage.warning('admin 不可设为离职')
    return
  }
  await ElMessageBox.confirm(`确认将人员“${p.name}”设为${status}？`, '二次确认', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  })
  const now = Date.now()
  const list = fullData.value.map((x) => (x.id === p.id ? { ...x, status, updatedAtMs: now } : x))
  fullData.value = list
  savePeople(list)
  writeOp('编辑', `设置人员状态 ${p.name}`, { personId: p.id, status })
  refresh()
  ElMessage.success('已更新（演示）')
}

async function onExport() {
  await new Promise((r) => setTimeout(r, 120))
  writeOp('导出', '导出人员列表（占位）', { count: fullData.value.length })
  ElMessage.success('导出已提交（占位）')
}

async function onImport() {
  await new Promise((r) => setTimeout(r, 120))
  writeOp('导入', '导入人员列表（占位）', {})
  ElMessage.success('导入已提交（占位）')
}

onMounted(() => {
  fullData.value = loadPeople()
  refresh()
})

watch([page, pageSize], () => refresh())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-base font-semibold">人员管理</div>
        <div class="mt-1 text-xs text-zinc-500">用于报警通知人员配置与通讯录台账（演示）。</div>
      </div>
      <div class="flex items-center gap-2">
        <el-button @click="onImport">导入</el-button>
        <el-button @click="onExport">导出</el-button>
        <el-button type="primary" @click="openCreate">新增人员</el-button>
      </div>
    </div>

    <el-card>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-8">
        <el-input v-model="filter.keyword" placeholder="姓名/手机/邮箱/部门" clearable class="md:col-span-3" />
        <el-select v-model="filter.dept" placeholder="部门" clearable filterable class="md:col-span-2">
          <el-option v-for="d in deptOptions" :key="d" :label="d" :value="d" />
        </el-select>
        <el-select v-model="filter.status" placeholder="状态" clearable class="md:col-span-1">
          <el-option label="在职" value="在职" />
          <el-option label="离职" value="离职" />
        </el-select>
        <el-select v-model="filter.tag" placeholder="标签" clearable filterable class="md:col-span-2">
          <el-option v-for="t in tagOptions" :key="t" :label="t" :value="t" />
        </el-select>
      </div>
      <div class="mt-3 flex items-center justify-end gap-2">
        <el-button @click="onReset">重置</el-button>
        <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
      </div>
    </el-card>

    <el-card>
      <el-table :data="rows" size="small" v-loading="loading" height="560" class="table-standard">
        <el-table-column prop="name" label="姓名" width="140" />
        <el-table-column prop="dept" label="部门" width="120" />
        <el-table-column prop="title" label="岗位" min-width="140" />
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="email" label="邮箱" min-width="160" />
        <el-table-column label="标签" min-width="180">
          <template #default="scope">
            <div class="flex flex-wrap gap-1">
              <el-tag v-for="t in scope.row.tags" :key="t" size="small" type="info">{{ t }}</el-tag>
              <span v-if="!scope.row.tags.length" class="text-xs text-zinc-500">—</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === '在职' ? 'success' : 'info'" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.updatedAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="scope">
            <div class="flex items-center gap-2">
              <el-button link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
              <el-dropdown trigger="click">
                <el-button link type="primary" size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="setStatus(scope.row, scope.row.status === '在职' ? '离职' : '在职')">
                      {{ scope.row.status === '在职' ? '设为离职' : '设为在职' }}
                    </el-dropdown-item>
                    <el-dropdown-item :disabled="scope.row.id === 'u_admin'" @click="removePerson(scope.row)">删除</el-dropdown-item>
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

    <PersonFormDialog
      v-model="dialogOpen"
      :person="editing"
      :dept-options="deptOptions"
      :tag-options="tagOptions"
      @save="upsertPerson"
    />
  </div>
</template>

