import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarStore {
  collapsed: Record<string, boolean>
  toggle: (key: string) => void
}

// 使用账号和维度/选项 ID 记忆展开状态，重命名、页面切换和刷新均不会重置。
export const useSidebarStore = create<SidebarStore>()(persist(
  set => ({
    collapsed: {},
    toggle: key => set(state => {
      const collapsed = { ...state.collapsed }
      if (collapsed[key]) delete collapsed[key]
      else collapsed[key] = true
      return { collapsed }
    }),
  }),
  { name: 'sidebar-expansion', partialize: state => ({ collapsed: state.collapsed }) },
))
