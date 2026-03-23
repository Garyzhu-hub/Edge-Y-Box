import { ref, watch, computed } from 'vue'

type Theme = 'light' | 'dark'

/** 全局共享，避免多处 `useTheme()` 各自一份状态导致切换无效 */
const theme = ref<Theme>('light')
let watchStarted = false

function getPreferredTheme(): Theme {
  const saved = localStorage.getItem('theme') as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(t: Theme) {
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(t)
  localStorage.setItem('theme', t)
  document.documentElement.style.colorScheme = t === 'dark' ? 'dark' : 'light'
}

export function useTheme() {
  if (typeof window !== 'undefined' && !watchStarted) {
    watchStarted = true
    theme.value = getPreferredTheme()
    watch(theme, applyTheme, { immediate: true })
  }

  const toggleTheme = () => {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  return {
    theme,
    toggleTheme,
    isDark: computed(() => theme.value === 'dark'),
  }
}
