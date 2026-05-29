// 将 hex 颜色与灰色混合，ratio=0 为原色，ratio=1 为纯灰
export function mixWithGray(hex: string, ratio = 0.45): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const gray = 160 // 混入的灰度值
  const nr = Math.round(r + (gray - r) * ratio)
  const ng = Math.round(g + (gray - g) * ratio)
  const nb = Math.round(b + (gray - b) * ratio)
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}
