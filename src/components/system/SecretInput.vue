<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  configured: boolean
  placeholder?: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const show = ref(false)

const val = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
})

const inputPlaceholder = computed(() => props.placeholder || (props.configured ? '已设置（不回显）' : '未设置'))
</script>

<template>
  <el-input
    v-model="val"
    :type="show ? 'text' : 'password'"
    :placeholder="inputPlaceholder"
    clearable
  >
    <template #suffix>
      <el-tag v-if="configured && !val" type="success" size="small">已设置</el-tag>
      <el-tag v-else-if="!configured && !val" type="info" size="small">未设置</el-tag>
      <el-button link type="primary" size="small" @click="show = !show">{{ show ? '隐藏' : '显示' }}</el-button>
    </template>
  </el-input>
</template>
