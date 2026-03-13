<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { SystemRole, RoleStatus } from '@/utils/rolesMock'
import { permissionCatalog } from '@/config/permissionCatalog'

type Model = {
  name: string
  description: string
  status: RoleStatus
  permissionIds: string[]
}

const props = defineProps<{ modelValue: boolean; role: SystemRole | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', payload: { roleId?: string; model: Model }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<Model>({
  name: '',
  description: '',
  status: '启用',
  permissionIds: [],
})

const isEdit = computed(() => Boolean(props.role))
const isBuiltin = computed(() => props.role?.id === 'R-00001' || props.role?.id === 'R-00002')

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    form.name = props.role?.name ?? ''
    form.description = props.role?.description ?? ''
    form.status = props.role?.status ?? '启用'
    form.permissionIds = props.role?.permissionIds ? [...props.role.permissionIds] : []
  }
)

const title = computed(() => (isEdit.value ? '编辑角色' : '新增角色'))

const permissionGroups = computed(() => {
  const map = new Map<string, { group: string; items: { id: string; label: string }[] }>()
  for (const p of permissionCatalog) {
    if (!map.has(p.group)) map.set(p.group, { group: p.group, items: [] })
    map.get(p.group)!.items.push({ id: p.id, label: p.label })
  }
  return Array.from(map.values())
})

function selectAll() {
  form.permissionIds = permissionCatalog.map((p) => p.id)
}

function clearAll() {
  form.permissionIds = []
}

function onSave() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写角色名称')
    return
  }
  if (!form.permissionIds.length) {
    ElMessage.warning('请至少选择一个权限')
    return
  }
  emit('save', { roleId: props.role?.id, model: { ...form, name: form.name.trim() } })
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="760" append-to-body>
    <el-form label-width="92">
      <el-form-item label="角色名称">
        <el-input v-model="form.name" :disabled="isBuiltin" placeholder="例如：巡检督导" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" :disabled="isBuiltin" type="textarea" :rows="2" placeholder="可选" />
      </el-form-item>
      <el-form-item label="状态">
        <el-segmented
          v-model="form.status"
          :disabled="isBuiltin"
          :options="[
            { label: '启用', value: '启用' },
            { label: '禁用', value: '禁用' },
          ]"
        />
      </el-form-item>
      <el-form-item label="权限">
        <div class="w-full space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="text-xs text-zinc-500">已选择 {{ form.permissionIds.length }} 项</div>
            <div class="flex items-center gap-2">
              <el-button size="small" @click="selectAll">全选</el-button>
              <el-button size="small" @click="clearAll">清空</el-button>
            </div>
          </div>

          <div class="max-h-[360px] overflow-auto rounded-md border border-zinc-200 p-3">
            <div v-for="g in permissionGroups" :key="g.group" class="mb-3">
              <div class="mb-2 text-xs font-semibold text-zinc-700">{{ g.group }}</div>
              <el-checkbox-group v-model="form.permissionIds">
                <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <el-checkbox v-for="p in g.items" :key="p.id" :label="p.id">{{ p.label }}</el-checkbox>
                </div>
              </el-checkbox-group>
            </div>
          </div>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" @click="onSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

