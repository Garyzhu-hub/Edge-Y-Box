<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { SystemUser, SystemUserRole, UserStatus } from '@/utils/usersMock'

type Model = {
  username: string
  displayName: string
  role: SystemUserRole
  status: UserStatus
  password: string
}

const props = defineProps<{ modelValue: boolean; user: SystemUser | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', payload: { userId?: string; model: Model }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<Model>({
  username: '',
  displayName: '',
  role: 'project_user',
  status: '启用',
  password: '',
})

const isEdit = computed(() => Boolean(props.user))

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    form.username = props.user?.username ?? ''
    form.displayName = props.user?.displayName ?? ''
    form.role = props.user?.role ?? 'project_user'
    form.status = props.user?.status ?? '启用'
    form.password = ''
  }
)

const title = computed(() => (isEdit.value ? '编辑用户' : '新增用户'))

function onSave() {
  if (!form.username.trim()) {
    ElMessage.warning('请填写用户名')
    return
  }
  if (!form.displayName.trim()) {
    ElMessage.warning('请填写姓名')
    return
  }

  emit('save', { userId: props.user?.id, model: { ...form, username: form.username.trim() } })
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="520" append-to-body>
    <el-form label-width="88">
      <el-form-item label="用户名">
        <el-input v-model="form.username" :disabled="isEdit" placeholder="例如：admin / user_1001" />
      </el-form-item>
      <el-form-item label="姓名">
        <el-input v-model="form.displayName" placeholder="例如：张三" />
      </el-form-item>
      <el-form-item label="角色">
        <el-select v-model="form.role" class="w-full">
          <el-option label="超级管理员" value="super_admin" />
          <el-option label="项目人员" value="project_user" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-segmented
          v-model="form.status"
          :options="[
            { label: '启用', value: '启用' },
            { label: '禁用', value: '禁用' },
          ]"
        />
      </el-form-item>
      <el-form-item label="初始口令">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          autocomplete="new-password"
          placeholder="不保存，仅占位"
        />
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

