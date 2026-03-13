<script setup lang="ts">
import PagePlaceholder from '@/components/common/PagePlaceholder.vue'

defineProps<{ title: string }>()
</script>

<template>
  <PagePlaceholder :title="title" subtitle="该模块已完成路由与权限占位。" />
</template>

