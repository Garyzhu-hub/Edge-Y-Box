<script setup lang="ts">
import { ElMessage } from 'element-plus'

export type CameraProtocol = 'RTSP' | 'GB28181' | 'HTTP' | 'ONVIF'

export type Camera = {
  id: string
  name: string
  groupId: string
  ip: string
  port: number
  protocol: CameraProtocol
  streamUrl: string
  username: string
  password: string
  enabled: boolean
  updatedAtMs: number
}

type GroupOption = { id: string; label: string }

const props = defineProps<{
  modelValue: boolean
  initial: Camera | null
  groups: GroupOption[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved', camera: Camera): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const saving = ref(false)
const testing = ref(false)

type FormModel = Omit<Camera, 'id' | 'updatedAtMs'>

const form = reactive<FormModel>({
  name: '',
  groupId: '',
  ip: '',
  port: 554,
  protocol: 'RTSP',
  streamUrl: '',
  username: '',
  password: '',
  enabled: true,
})

const formRef = ref()

const title = computed(() => (props.initial ? '编辑摄像头' : '新增摄像头'))

function resetFromInitial() {
  const g0 = props.groups.find((g) => g.id !== 'all')?.id || ''
  if (!props.initial) {
    form.name = ''
    form.groupId = g0
    form.ip = ''
    form.port = 554
    form.protocol = 'RTSP'
    form.streamUrl = ''
    form.username = ''
    form.password = ''
    form.enabled = true
    return
  }

  form.name = props.initial.name
  form.groupId = props.initial.groupId
  form.ip = props.initial.ip
  form.port = props.initial.port
  form.protocol = props.initial.protocol
  form.streamUrl = props.initial.streamUrl
  form.username = props.initial.username
  form.password = props.initial.password
  form.enabled = props.initial.enabled
}

watch(
  () => open.value,
  (v) => {
    if (!v) return
    resetFromInitial()
  }
)

const rules = {
  name: [{ required: true, message: '请输入摄像头名称', trigger: 'blur' }],
  groupId: [{ required: true, message: '请选择分组', trigger: 'change' }],
  ip: [{ required: true, message: '请输入IP地址', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口', trigger: 'blur' }],
  protocol: [{ required: true, message: '请选择协议', trigger: 'change' }],
}

function makeId() {
  const n = Math.floor(10000 + Math.random() * 90000)
  return `CAM-${n}`
}

async function onTest() {
  testing.value = true
  try {
    await new Promise((r) => setTimeout(r, 450))
    ElMessage.success('连接测试通过（占位）')
  } finally {
    testing.value = false
  }
}

async function onSave() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return

  saving.value = true
  try {
    await new Promise((r) => setTimeout(r, 350))
    const id = props.initial?.id || makeId()
    emit('saved', {
      id,
      ...form,
      port: Number(form.port) || 0,
      updatedAtMs: Date.now(),
    })
    open.value = false
    ElMessage.success(props.initial ? '已保存' : '已新增')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="720" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="92">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：北门出入口-3" />
        </el-form-item>

        <el-form-item label="分组" prop="groupId">
          <el-select v-model="form.groupId" placeholder="选择分组" filterable>
            <el-option v-for="g in groups" :key="g.id" :label="g.label" :value="g.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="IP" prop="ip">
          <el-input v-model="form.ip" placeholder="例如：192.168.1.10" />
        </el-form-item>

        <el-form-item label="端口" prop="port">
          <el-input-number v-model="form.port" :min="1" :max="65535" class="w-full" />
        </el-form-item>

        <el-form-item label="协议" prop="protocol">
          <el-select v-model="form.protocol" placeholder="选择协议">
            <el-option label="RTSP" value="RTSP" />
            <el-option label="GB28181" value="GB28181" />
            <el-option label="HTTP" value="HTTP" />
            <el-option label="ONVIF" value="ONVIF" />
          </el-select>
        </el-form-item>

        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <el-form-item label="流地址" class="md:col-span-2">
          <el-input v-model="form.streamUrl" placeholder="例如：rtsp://user:pass@ip:554/stream" />
        </el-form-item>

        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="可选" />
        </el-form-item>

        <el-form-item label="密码">
          <el-input v-model="form.password" placeholder="可选" show-password />
        </el-form-item>
      </div>

      <div class="mt-2 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="text-xs text-zinc-600">
          连接测试仅做UI占位；后续可接入后端对 RTSP/GB28181/ONVIF 做探测。
        </div>
        <el-button :loading="testing" @click="onTest">连接测试</el-button>
      </div>
    </el-form>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

