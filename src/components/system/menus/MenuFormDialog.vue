<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { SystemMenuItem, MenuStatus } from '@/utils/menusMock'

type Model = {
  title: string
  path: string
  icon: string
  permission: string
  status: MenuStatus
  order: number
}

const props = defineProps<{
  modelValue: boolean
  item: SystemMenuItem | null
  parent: SystemMenuItem | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', payload: { id?: string; parentId: string | null; model: Model }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<Model>({
  title: '',
  path: '',
  icon: '',
  permission: '',
  status: '显示',
  order: 10,
})

const isEdit = computed(() => Boolean(props.item))
const title = computed(() => (isEdit.value ? '编辑菜单' : '新增菜单'))

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    form.title = props.item?.title ?? ''
    form.path = props.item?.path ?? ''
    form.icon = props.item?.icon ?? ''
    form.permission = props.item?.permission ?? ''
    form.status = props.item?.status ?? '显示'
    form.order = props.item?.order ?? 10
  }
)

function onSave() {
  if (!form.title.trim()) {
    ElMessage.warning('请填写菜单名称')
    return
  }
  if (!form.path.trim()) {
    ElMessage.warning('请填写路由路径')
    return
  }
  const order = Number(form.order)
  if (Number.isNaN(order) || order <= 0) {
    ElMessage.warning('排序必须为正整数')
    return
  }
  emit('save', {
    id: props.item?.id,
    parentId: props.parent?.id ?? null,
    model: {
      ...form,
      title: form.title.trim(),
      path: form.path.trim(),
      icon: form.icon.trim(),
      permission: form.permission.trim(),
      order,
    },
  })
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="560" append-to-body>
    <div v-if="parent" class="mb-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div class="text-xs text-zinc-500">上级菜单</div>
      <div class="mt-1 text-sm font-semibold">{{ parent.title }}</div>
      <div class="mt-1 text-xs text-zinc-500">{{ parent.path }}</div>
    </div>

    <el-form label-width="90">
      <el-form-item label="菜单名称">
        <el-input v-model="form.title" placeholder="例如：菜单管理" />
      </el-form-item>
      <el-form-item label="路由路径">
        <el-input v-model="form.path" placeholder="例如：/system/menus" />
      </el-form-item>
      <el-form-item label="权限标识">
        <el-input v-model="form.permission" placeholder="例如：system.menus.view（可空）" />
      </el-form-item>
      <el-form-item label="图标">
        <el-input v-model="form.icon" placeholder="可空（占位）" />
      </el-form-item>
      <el-form-item label="状态">
        <el-segmented
          v-model="form.status"
          :options="[
            { label: '显示', value: '显示' },
            { label: '隐藏', value: '隐藏' },
          ]"
        />
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number v-model="form.order" :min="1" :step="1" class="w-full" />
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

