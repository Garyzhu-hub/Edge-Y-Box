<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { Algorithm } from '@/utils/algorithmsMock'

const props = defineProps<{ modelValue: boolean; initial: Algorithm | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved', alg: Algorithm): void
  (e: 'open-versions', alg: Algorithm): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

type FormModel = {
  name: string
  category: string
  scene: string
  vendor: string
  modelFormat: string
  description: string
  remark: string
}

const form = reactive<FormModel>({
  name: '',
  category: '安防',
  scene: '园区出入口',
  vendor: 'EdgeAI Lab',
  modelFormat: 'ONNX',
  description: '',
  remark: '',
})

const formRef = ref()
const saving = ref(false)

const title = computed(() => (props.initial ? '编辑算法' : '新增算法'))

const rules = {
  name: [{ required: true, message: '请输入算法名称', trigger: 'blur' }],
}

function resetFromInitial() {
  if (!props.initial) {
    form.name = ''
    form.category = '安防'
    form.scene = '园区出入口'
    form.vendor = 'EdgeAI Lab'
    form.modelFormat = 'ONNX'
    form.description = ''
    form.remark = ''
    return
  }
  form.name = props.initial.name
  form.category = props.initial.category
  form.scene = props.initial.scene
  form.vendor = props.initial.vendor
  form.modelFormat = props.initial.modelFormat || 'ONNX'
  form.description = props.initial.description || ''
  form.remark = props.initial.remark || ''
}

watch(
  () => open.value,
  (v) => {
    if (!v) return
    resetFromInitial()
  }
)

function makeId() {
  const n = Math.floor(10000 + Math.random() * 90000)
  return `ALG-${String(n).padStart(5, '0')}`
}

async function onSave() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return

  saving.value = true
  try {
    await new Promise((r) => setTimeout(r, 300))
    const id = props.initial?.id || makeId()
    emit('saved', {
      id,
      name: form.name,
      category: form.category,
      scene: form.scene,
      vendor: form.vendor,
      currentVersion: props.initial?.currentVersion || 'v1.0.0',
      modelFormat: form.modelFormat,
      packageName: props.initial?.packageName,
      packageSource: props.initial?.packageSource,
      description: form.description || undefined,
      remark: form.remark || undefined,
      status: props.initial?.status || '已停用',
      updatedAtMs: Date.now(),
      lastSyncAtMs: props.initial?.lastSyncAtMs || Date.now(),
    })
    open.value = false
    ElMessage.success('算法信息已保存')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="720" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="92">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <el-form-item label="算法名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：安全帽检测" />
        </el-form-item>

        <el-form-item label="分类">
          <el-select v-model="form.category" placeholder="选择分类">
            <el-option label="安防" value="安防" />
            <el-option label="作业合规" value="作业合规" />
            <el-option label="消防" value="消防" />
            <el-option label="环境" value="环境" />
          </el-select>
        </el-form-item>

        <el-form-item label="场景">
          <el-select v-model="form.scene" placeholder="选择场景">
            <el-option label="园区出入口" value="园区出入口" />
            <el-option label="地库" value="地库" />
            <el-option label="楼宇大堂" value="楼宇大堂" />
            <el-option label="景观广场" value="景观广场" />
            <el-option label="公共区域" value="公共区域" />
          </el-select>
        </el-form-item>

        <el-form-item label="供应商">
          <el-select v-model="form.vendor" placeholder="选择供应商">
            <el-option label="EdgeAI Lab" value="EdgeAI Lab" />
            <el-option label="VisionPro" value="VisionPro" />
            <el-option label="ThirdParty" value="ThirdParty" />
          </el-select>
        </el-form-item>

        <el-form-item label="模型格式">
          <el-select v-model="form.modelFormat" placeholder="选择格式">
            <el-option label="YOLO" value="YOLO" />
            <el-option label="ONNX" value="ONNX" />
            <el-option label="TensorRT" value="TensorRT" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>

        <el-form-item label="算法包" class="md:col-span-2">
          <div class="w-full space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div class="text-xs text-zinc-600">
                <div>
                  当前算法包：<span class="font-mono">{{ props.initial?.packageName || '—' }}</span>
                </div>
                <div class="mt-1 text-zinc-500">
                  说明：上传新版本请在“版本管理”中执行，避免误解为修改当前版本的包。
                </div>
              </div>
              <el-button
                v-if="props.initial"
                type="primary"
                @click="emit('open-versions', props.initial)"
              >
                去版本管理上传新版本
              </el-button>
            </div>
            <div v-if="!props.initial" class="text-xs text-zinc-500">
              提示：新增算法保存后，请进入“版本管理”上传首个版本算法包。
            </div>
          </div>
        </el-form-item>

        <el-form-item label="算法描述" class="md:col-span-2">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>

        <el-form-item label="备注" class="md:col-span-2">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
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
