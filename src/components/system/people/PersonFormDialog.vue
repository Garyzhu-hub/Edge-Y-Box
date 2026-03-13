<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { PersonRecord, PersonStatus } from '@/utils/peopleMock'

type Model = {
  name: string
  phone: string
  dept: string
  title: string
  email: string
  status: PersonStatus
  tags: string[]
}

const props = defineProps<{ modelValue: boolean; person: PersonRecord | null; deptOptions: string[]; tagOptions: string[] }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', payload: { personId?: string; model: Model }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<Model>({
  name: '',
  phone: '',
  dept: '',
  title: '',
  email: '',
  status: '在职',
  tags: [],
})

const isEdit = computed(() => Boolean(props.person))
const title = computed(() => (isEdit.value ? '编辑人员' : '新增人员'))

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    form.name = props.person?.name ?? ''
    form.phone = props.person?.phone ?? ''
    form.dept = props.person?.dept ?? ''
    form.title = props.person?.title ?? ''
    form.email = props.person?.email ?? ''
    form.status = props.person?.status ?? '在职'
    form.tags = props.person?.tags ? [...props.person.tags] : []
  }
)

function onSave() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写姓名')
    return
  }
  if (!form.phone.trim()) {
    ElMessage.warning('请填写手机号')
    return
  }
  if (!form.dept.trim()) {
    ElMessage.warning('请选择部门')
    return
  }
  emit('save', { personId: props.person?.id, model: { ...form, name: form.name.trim(), phone: form.phone.trim() } })
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="640" append-to-body>
    <el-form label-width="90">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <el-form-item label="姓名">
          <el-input v-model="form.name" placeholder="例如：张三" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" placeholder="例如：13800000000" />
        </el-form-item>
        <el-form-item label="部门">
          <el-select v-model="form.dept" class="w-full" filterable allow-create default-first-option>
            <el-option v-for="d in deptOptions" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="岗位">
          <el-input v-model="form.title" placeholder="例如：值班员/工程师" />
        </el-form-item>
        <el-form-item label="邮箱" class="md:col-span-2">
          <el-input v-model="form.email" placeholder="可选" />
        </el-form-item>
        <el-form-item label="状态">
          <el-segmented
            v-model="form.status"
            :options="[
              { label: '在职', value: '在职' },
              { label: '离职', value: '离职' },
            ]"
          />
        </el-form-item>
        <el-form-item label="标签" class="md:col-span-2">
          <el-select v-model="form.tags" multiple filterable allow-create default-first-option class="w-full" placeholder="可多选">
            <el-option v-for="t in tagOptions" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" @click="onSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

