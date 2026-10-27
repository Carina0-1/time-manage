import { useEffect } from 'react'
import { useTaskListStore } from '@/stores/taskListStore'

export function useTaskEditorGuard(dirty: boolean, saving: boolean) {
  useEffect(() => {
    useTaskListStore.setState({ confirmLeave: () => !saving && (!dirty || window.confirm('当前任务有未保存的修改，确定放弃吗？')) })
    const onBeforeUnload = (event: BeforeUnloadEvent) => { if (dirty || saving) event.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      useTaskListStore.setState({ confirmLeave: null })
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [dirty, saving])
}
