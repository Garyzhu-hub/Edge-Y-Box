<script setup lang="ts">
import { computed } from 'vue'
import type { PermissionModule, PermissionSubmodule } from '@/config/permissionCatalog'
import { PERMISSION_MODULES } from '@/config/permissionCatalog'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    disabled?: boolean
    /** 按大模块名称精确筛选（空为全部） */
    moduleFilter?: string
    /** 按关键词筛选（匹配大模块/小模块/权限 ID） */
    keyword?: string
  }>(),
  { disabled: false, moduleFilter: '', keyword: '' }
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string[]): void
}>()

const selected = computed({
  get: () => props.modelValue,
  set: (v: string[]) => emit('update:modelValue', v),
})

const kwTrim = computed(() => props.keyword.trim().toLowerCase())

function subMatches(sub: PermissionSubmodule): boolean {
  const kw = kwTrim.value
  if (!kw) return true
  if (sub.label.toLowerCase().includes(kw)) return true
  if (sub.key.toLowerCase().includes(kw)) return true
  return sub.actions.some((a) => a.id.toLowerCase().includes(kw) || a.label.includes(props.keyword.trim()))
}

function modMatches(mod: PermissionModule): boolean {
  if (props.moduleFilter && mod.label !== props.moduleFilter) return false
  const kw = kwTrim.value
  if (!kw) return true
  if (mod.label.toLowerCase().includes(kw)) return true
  return mod.children.some((s) => subMatches(s))
}

const visibleModules = computed(() => {
  const out: { mod: PermissionModule; children: PermissionSubmodule[] }[] = []
  for (const mod of PERMISSION_MODULES) {
    if (!modMatches(mod)) continue
    const kw = kwTrim.value
    const children = kw
      ? mod.children.filter((s) => subMatches(s) || mod.label.toLowerCase().includes(kw))
      : mod.children
    if (children.length) out.push({ mod, children })
  }
  return out
})

function idsInSubmodule(sub: PermissionSubmodule): string[] {
  return sub.actions.map((a) => a.id)
}

function idsInModule(mod: PermissionModule): string[] {
  return mod.children.flatMap((s) => idsInSubmodule(s))
}

function submoduleChecked(sub: PermissionSubmodule): boolean {
  const ids = idsInSubmodule(sub)
  if (!ids.length) return false
  return ids.every((id) => selected.value.includes(id))
}

function submoduleIndeterminate(sub: PermissionSubmodule): boolean {
  const ids = idsInSubmodule(sub)
  const n = ids.filter((id) => selected.value.includes(id)).length
  return n > 0 && n < ids.length
}

function moduleChecked(mod: PermissionModule): boolean {
  const ids = idsInModule(mod)
  if (!ids.length) return false
  return ids.every((id) => selected.value.includes(id))
}

function moduleIndeterminate(mod: PermissionModule): boolean {
  const ids = idsInModule(mod)
  const n = ids.filter((id) => selected.value.includes(id)).length
  return n > 0 && n < ids.length
}

function setIds(next: Set<string>, ids: string[], on: boolean) {
  for (const id of ids) {
    if (on) next.add(id)
    else next.delete(id)
  }
}

function toggleModule(mod: PermissionModule, on: boolean) {
  const next = new Set(selected.value)
  setIds(next, idsInModule(mod), on)
  selected.value = Array.from(next)
}

function toggleSubmodule(sub: PermissionSubmodule, on: boolean) {
  const next = new Set(selected.value)
  setIds(next, idsInSubmodule(sub), on)
  selected.value = Array.from(next)
}

function toggleLeaf(id: string, on: boolean) {
  const next = new Set(selected.value)
  if (on) next.add(id)
  else next.delete(id)
  selected.value = Array.from(next)
}

function onLeafChange(id: string, val: boolean | string | number) {
  toggleLeaf(id, Boolean(val))
}
</script>

<template>
  <div class="permission-tree-picker space-y-3">
    <div v-if="!visibleModules.length" class="py-8 text-center text-sm text-zinc-500">未找到匹配权限</div>
    <div
      v-for="{ mod, children } in visibleModules"
      :key="mod.key"
      class="rounded-lg border border-zinc-200 bg-white"
    >
      <div class="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/80 px-3 py-2">
        <el-checkbox
          :model-value="moduleChecked(mod)"
          :indeterminate="moduleIndeterminate(mod)"
          :disabled="disabled"
          @change="(v: boolean) => toggleModule(mod, v)"
        />
        <span class="text-sm font-semibold text-zinc-800">{{ mod.label }}</span>
        <span class="text-xs text-zinc-400">大模块</span>
      </div>

      <div class="space-y-2 p-3">
        <div
          v-for="sub in children"
          :key="sub.key"
          class="rounded-md border border-zinc-100 bg-zinc-50/50 p-2"
        >
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <el-checkbox
              :model-value="submoduleChecked(sub)"
              :indeterminate="submoduleIndeterminate(sub)"
              :disabled="disabled"
              @change="(v: boolean) => toggleSubmodule(sub, v)"
            />
            <span class="text-xs font-medium text-zinc-700">{{ sub.label }}</span>
            <span class="text-[11px] text-zinc-400">小模块</span>
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-1 pl-6">
            <el-checkbox
              v-for="a in sub.actions"
              :key="a.id"
              :model-value="selected.includes(a.id)"
              :disabled="disabled"
              :title="a.id"
              @change="(v: boolean | string | number) => onLeafChange(a.id, v)"
            >
              <span class="text-xs">{{ a.label }}</span>
            </el-checkbox>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
