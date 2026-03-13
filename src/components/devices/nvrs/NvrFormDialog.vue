<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Nvr } from '@/utils/nvrsMock'
import type { CameraProtocol } from '@/components/devices/CameraFormDialog.vue'

type Model = {
  name: string
  ip: string
  port: number
  protocol: CameraProtocol
  channelTotal: number
  username: string
  password: string
  enabled: boolean
  remark: string
}

const props = defineProps<{ modelValue: boolean; nvr: Nvr | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', payload: { id?: string; passwordChanged: boolean; model: Model }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<Model>({
  name: '',
  ip: '',
  port: 554,
  protocol: 'RTSP',
  channelTotal: 8,
  username: 'admin',
  password: '',
  enabled: true,
  remark: '',
})

const isEdit = computed(() => Boolean(props.nvr))
const title = computed(() => (isEdit.value ? '编辑NVR' : '新增NVR'))

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    form.name = props.nvr?.name ?? ''
    form.ip = props.nvr?.ip ?? ''
    form.port = props.nvr?.port ?? 554
    form.protocol = props.nvr?.protocol ?? 'RTSP'
    form.channelTotal = props.nvr?.channelTotal ?? 8
    form.username = props.nvr?.username ?? 'admin'
    form.password = ''
    form.enabled = props.nvr?.enabled ?? true
    form.remark = props.nvr?.remark ?? ''
  }
)

const passwordHint = computed(() => {
  if (!isEdit.value) return '必填（演示）'
  return props.nvr?.passwordConfigured ? '已设置（不回显），留空表示不修改' : '未设置，留空表示不修改'
})

function onSave() {
  if (!form.name.trim()) return ElMessage.warning('请填写NVR名称')
  if (!form.ip.trim()) return ElMessage.warning('请填写NVR IP')
  if (!form.username.trim()) return ElMessage.warning('请填写用户名')
  const channelTotal = Number(form.channelTotal)
  if (!Number.isFinite(channelTotal) || channelTotal <= 0 || channelTotal > 512) return ElMessage.warning('通道数范围 1-512')
  const passwordChanged = Boolean(form.password.trim())
  if (!isEdit.value && !passwordChanged) return ElMessage.warning('新增时必须设置密码')
  emit('save', {
    id: props.nvr?.id,
    passwordChanged,
    model: {
      ...form,
      name: form.name.trim(),
      ip: form.ip.trim(),
      username: form.username.trim(),
      channelTotal,
    },
  })
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="720" append-to-body>
    <el-form label-width="90">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <el-form-item label="名称" class="md:col-span-2">
          <el-input v-model="form.name" placeholder="例如：园区A-NVR-1" />
        </el-form-item>
        <el-form-item label="IP">
          <el-input v-model="form.ip" placeholder="例如：192.168.10.120" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="form.port" :min="1" :max="65535" class="w-full" />
        </el-form-item>
        <el-form-item label="协议">
          <el-select v-model="form.protocol" class="w-full">
            <el-option label="RTSP" value="RTSP" />
            <el-option label="ONVIF" value="ONVIF" />
            <el-option label="HTTP" value="HTTP" />
            <el-option label="GB28181" value="GB28181" />
          </el-select>
        </el-form-item>
        <el-form-item label="通道数">
          <el-input-number v-model="form.channelTotal" :min="1" :max="512" :step="1" class="w-full" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password" :placeholder="passwordHint" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="备注" class="md:col-span-2">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选" />
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

