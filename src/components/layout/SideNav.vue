<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { navItems, type NavItem } from '@/config/nav'
import { useAuthStore } from '@/stores/auth'
import logoYeUrl from '../../../Ye.png'

const route = useRoute()
const auth = useAuthStore()

function filterItems(items: NavItem[]): NavItem[] {
  return items
    .map((it) => {
      if (it.children?.length) {
        const children = filterItems(it.children)
        if (children.length === 0) return null
        return { ...it, children }
      }
      if (!it.permission) return it
      return auth.hasPermission(it.permission) ? it : null
    })
    .filter((x): x is NavItem => Boolean(x))
}

const visibleNav = computed(() => filterItems(navItems))
const activeIndex = computed(() => {
  const path = route.path
  if (path.startsWith('/work-orders/')) return '/work-orders'
  return path
})
</script>

<template>
  <aside class="h-full w-[248px] border-r border-zinc-200 bg-white">
    <div class="flex h-14 items-center gap-2 border-b border-zinc-200 px-4">
      <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white">
        <img :src="logoYeUrl" alt="Edge Y-box" class="h-5 w-5 object-contain">
      </div>
      <div class="min-w-0">
        <div class="truncate text-sm font-semibold">Edge Y-box</div>
        <div class="truncate text-xs text-zinc-500">边缘AI视觉巡检平台</div>
      </div>
    </div>

    <el-scrollbar class="h-[calc(100%-56px)]">
      <div class="p-2">
        <el-menu
          :default-active="activeIndex"
          class="!border-none"
          router
          :collapse-transition="false"
        >
          <template v-for="item in visibleNav" :key="item.key">
            <el-sub-menu v-if="item.children?.length" :index="item.key">
              <template #title>
                <span class="flex items-center gap-2">
                  <component
                    v-if="item.icon"
                    :is="item.icon"
                    class="h-4 w-4 text-zinc-600"
                  />
                  <span class="text-sm">{{ item.label }}</span>
                </span>
              </template>

              <el-menu-item
                v-for="child in item.children"
                :key="child.key"
                :index="child.to || child.key"
              >
                <span class="flex items-center gap-2">
                  <component
                    v-if="child.icon"
                    :is="child.icon"
                    class="h-4 w-4 text-zinc-600"
                  />
                  <span class="text-sm">{{ child.label }}</span>
                </span>
              </el-menu-item>
            </el-sub-menu>

            <el-menu-item v-else :index="item.to || item.key">
              <span class="flex items-center gap-2">
                <component
                  v-if="item.icon"
                  :is="item.icon"
                  class="h-4 w-4 text-zinc-600"
                />
                <span class="text-sm">{{ item.label }}</span>
              </span>
            </el-menu-item>
          </template>
        </el-menu>
      </div>
    </el-scrollbar>
  </aside>
</template>
