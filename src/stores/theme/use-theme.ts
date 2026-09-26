function observeMediaChange(
  mqList: MediaQueryList,
  listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void,
): () => void {
  let disposeFunc = () => {}
  if (mqList.addEventListener && mqList.removeEventListener) {
    mqList.addEventListener('change', listener)
    disposeFunc = () => {
      mqList.removeEventListener('change', listener)
    }
  } else if (mqList.addListener && mqList.removeListener) {
    mqList.addListener(listener)
    disposeFunc = () => {
      mqList.removeListener(listener)
    }
  }
  return disposeFunc
}
const calllist: Array<(isDark: boolean) => void> = []
const mqList = window.matchMedia('(prefers-color-scheme: dark)')
observeMediaChange(mqList, (event) => {
  if (calllist.length > 0) {
    for (let i = 0; i < calllist.length; i++) {
      calllist[i]?.(event.matches)
    }
  }
})

export default (call: (isDark: boolean) => void) => {
  calllist.push(call)
  return {
    isDarkMode: () => {
      try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
      } catch {}
      return false
    },
  }
}
