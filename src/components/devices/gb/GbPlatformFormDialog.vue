<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { GbCascadePlatform, GbTransport } from '@/utils/gbCascadeMock'

type Model = {
  name: string
  serverId: string
  serverDomain: string
  sipServer: string
  sipPort: number
  username: string
  password: string
  localId: string
  localIp: string
  localPort: number
  transport: GbTransport
  enabled: boolean
}

const props = defineProps<{ modelValue: boolean; platform: GbCascadePlatform | null }>()
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
  serverId: '',
  serverDomain: '',
  sipServer: '',
  sipPort: 5060,
  username: '',
  password: '',
  localId: '',
  localIp: '',
  localPort: 5060,
  transport: 'UDP',
  enabled: true,
})

const isEdit = computed(() => Boolean(props.platform))
const title = computed(() => (isEdit.value ? '编辑上级平台' : '新增上级平台'))

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    form.name = props.platform?.name ?? ''
    form.serverId = props.platform?.serverId ?? ''
    form.serverDomain = props.platform?.serverDomain ?? ''
    form.sipServer = props.platform?.sipServer ?? ''
    form.sipPort = props.platform?.sipPort ?? 5060
    form.username = props.platform?.username ?? ''
    form.password = ''
    form.localId = props.platform?.localId ?? ''
    form.localIp = props.platform?.localIp ?? ''
    form.localPort = props.platform?.localPort ?? 5060
    form.transport = props.platform?.transport ?? 'UDP'
    form.enabled = props.platform?.enabled ?? true
  }
)

const passwordHint = computed(() => {
  if (!isEdit.value) return '必填，用于上级平台注册（演示）'
  return props.platform?.passwordConfigured ? '已设置（不回显），留空表示不修改' : '未设置，留空表示不修改'
})

function onSave() {
  if (!form.name.trim()) return ElMessage.warning('请填写名称')
  if (!form.serverId.trim()) return ElMessage.warning('请填写上级平台ID')
  if (!form.serverDomain.trim()) return ElMessage.warning('请填写上级域')
  if (!form.sipServer.trim()) return ElMessage.warning('请填写SIP服务器地址')
  if (!form.username.trim()) return ElMessage.warning('请填写用户名')
  if (!form.localId.trim()) return ElMessage.warning('请填写本地ID')
  if (!form.localIp.trim()) return ElMessage.warning('请填写本地IP')

  const passwordChanged = Boolean(form.password.trim())
  if (!isEdit.value && !passwordChanged) return ElMessage.warning('新增时必须设置口令')

  emit('save', {
    id: props.platform?.id,
    passwordChanged,
    model: {
      ...form,
      name: form.name.trim(),
      serverId: form.serverId.trim(),
      serverDomain: form.serverDomain.trim(),
      sipServer: form.sipServer.trim(),
      username: form.username.trim(),
      localId: form.localId.trim(),
      localIp: form.localIp.trim(),
      password: form.password,
    },
  })
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="760" append-to-body>
    <el-form label-width="110">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <el-form-item label="名称" class="md:col-span-2">
          <el-input v-model="form.name" placeholder="例如：上级平台A（市局）" />
        </el-form-item>

        <el-form-item label="上级平台ID">
          <el-input v-model="form.serverId" placeholder="例如：34020000002000000001" />
        </el-form-item>
        <el-form-item label="上级域">
          <el-input v-model="form.serverDomain" placeholder="例如：3402000000" />
        </el-form-item>

        <el-form-item label="SIP服务器">
          <el-input v-model="form.sipServer" placeholder="例如：10.10.10.10" />
        </el-form-item>
        <el-form-item label="SIP端口">
          <el-input-number v-model="form.sipPort" :min="1" :max="65535" class="w-full" />
        </el-form-item>

        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="通常同上级平台ID" />
        </el-form-item>
        <el-form-item label="口令">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password" :placeholder="passwordHint" />
        </el-form-item>

        <el-form-item label="本地ID">
          <el-input v-model="form.localId" placeholder="例如：34020000001320000001" />
        </el-form-item>
        <el-form-item label="本地IP">
          <el-input v-model="form.localIp" placeholder="例如：192.168.10.88" />
        </el-form-item>

        <el-form-item label="本地端口">
          <el-input-number v-model="form.localPort" :min="1" :max="65535" class="w-full" />
        </el-form-item>
        <el-form-item label="传输协议">
          <el-select v-model="form.transport" class="w-full">
            <el-option label="UDP" value="UDP" />
            <el-option label="TCP" value="TCP" />
          </el-select>
        </el-form-item>
      </div>

      <el-form-item label="启用">
        <el-switch v-model="form.enabled" />
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

