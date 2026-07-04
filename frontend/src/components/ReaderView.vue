<template>
  <div class="reader-wrap">
    <div class="reader-toolbar">
      <el-button text @click="$emit('back')">←</el-button>
      <span class="reader-title">{{ book?.title || '' }}</span>
      <el-button text @click="zoomOut" :disabled="!pdfDoc">−</el-button>
      <span style="font-size:12px;color:#909399;min-width:36px;text-align:center">{{ Math.round(scale*100) }}%</span>
      <el-button text @click="zoomIn" :disabled="!pdfDoc">+</el-button>
    </div>

    <div ref="viewerRef" class="pdf-container" @mouseup="onSelect" @wheel.prevent="onWheel">
      <div v-if="loading" class="loading-state"><div style="font-size:32px">📖</div><p>加载中...</p></div>
    </div>

    <div class="reader-footer">
      <el-button text :disabled="page <= 1" @click="prevPage">◀</el-button>
      <span style="font-size:12px;color:#606266;min-width:90px;text-align:center">第 {{ page }}/{{ totalPages }} 页</span>
      <el-slider v-model="page" :min="1" :max="totalPages" style="flex:1;max-width:300px;margin:0 8px" @input="goTo" />
      <el-button text :disabled="page >= totalPages" @click="nextPage">▶</el-button>
      <span style="font-size:11px;color:#c0c4cc;min-width:36px;text-align:right">{{ totalPages>0 ? Math.round(page/totalPages*100)+'%' : '' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { api } from '../api.js'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const props = defineProps({ book: Object })
const emit = defineEmits(['pageChange', 'back'])

const viewerRef = ref(null)
const page = ref(1)
const totalPages = ref(0)
const scale = ref(1)
const loading = ref(false)

let pdfDoc = null
let curPage = 0

watch(() => props.book, (b) => { if (b) loadBook(b) }, { immediate: true })

async function loadBook(book) {
  if (!book) return
  pdfDoc = null; curPage = 0
  const viewer = viewerRef.value
  if (!viewer) return
  viewer.innerHTML = ''

  if (book.file_type === 'pdf') {
    loading.value = true
    try {
      const fd = await window.electronAPI.readFile(book.file_path)
      if (!fd?.success) throw new Error('读取失败')
      pdfDoc = await pdfjsLib.getDocument({ data: fd.data }).promise
      totalPages.value = pdfDoc.numPages
      let start = 1
      try { const p = await api.getProgress(book.id); if (p?.current_page > 1) start = p.current_page } catch {}
      await renderPage(start)
    } catch (e) { viewer.innerHTML = `<div style="padding:60px;text-align:center;color:#909399">加载失败: ${e.message}</div>` }
    loading.value = false
  }
  // DOCX - would be added separately
}

async function renderPage(pn) {
  if (!pdfDoc || pn < 1 || pn > pdfDoc.numPages) return
  curPage = pn; page.value = pn
  emit('pageChange', pn)
  saveProgress()

  const viewer = viewerRef.value
  if (!viewer) return
  viewer.innerHTML = ''

  const dpr = window.devicePixelRatio || 1
  const s = scale.value

  try {
    const po = await pdfDoc.getPage(pn)
    const vp = po.getViewport({ scale: s * dpr })
    const cssW = Math.floor(vp.width / dpr)
    const cssH = Math.floor(vp.height / dpr)

    // Canvas
    const canvas = document.createElement('canvas')
    canvas.width = vp.width; canvas.height = vp.height
    canvas.style.cssText = `display:block;width:${cssW}px;height:${cssH}px;box-shadow:0 2px 16px rgba(0,0,0,0.12);border-radius:2px`
    viewer.appendChild(canvas)
    await po.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise

    // 文字层：span 可选中
    const tc = await po.getTextContent()
    const ph = po.getViewport({ scale: 1 }).height
    const tl = document.createElement('div')
    tl.style.cssText = `position:relative;width:${cssW}px;height:0;overflow:visible`
    viewer.appendChild(tl)

    tc.items.forEach(item => {
      const tm = item.transform
      const x = tm[4] * s
      const y = (ph - tm[5]) * s - (item.height || 12) * s
      const fs = (item.height || 12) * s
      const sp = document.createElement('span')
      sp.textContent = item.str
      sp.style.cssText = `position:absolute;left:${x}px;top:${y}px;font-size:${fs}px;color:transparent;white-space:pre;pointer-events:auto;cursor:text;user-select:text;-webkit-user-select:text`
      tl.appendChild(sp)
    })
  } catch (e) { viewer.innerHTML = `<div style="padding:60px;text-align:center;color:#909399">渲染失败</div>` }
}

function onSelect() {
  const sel = window.getSelection()
  const text = sel?.toString()?.trim()
  if (text) window.dispatchEvent(new CustomEvent('pdf-selection', { detail: text.slice(0, 3000) }))
}

function onWheel(e) {
  if (!pdfDoc) return
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); scale.value = Math.max(0.3, Math.min(3, +(scale.value+(e.deltaY>0?-0.15:0.15)).toFixed(1))); renderPage(curPage); return }
  if (Math.abs(e.deltaY) < 40) return
  if (e.deltaY > 0) nextPage(); else prevPage()
}

function prevPage() { if (curPage > 1) renderPage(curPage - 1) }
function nextPage() { if (curPage < totalPages.value) renderPage(curPage + 1) }
function goTo(n) { n = Math.max(1, Math.min(n, totalPages.value)); if (n !== curPage) renderPage(n) }
function zoomIn() { if (pdfDoc) { scale.value = Math.min(3, +(scale.value+0.2).toFixed(1)); renderPage(curPage) } }
function zoomOut() { if (pdfDoc) { scale.value = Math.max(0.3, +(scale.value-0.2).toFixed(1)); renderPage(curPage) } }
async function saveProgress() {
  if (!props.book) return
  try { await api.updateProgress(props.book.id, { current_page: page.value, total_pages: totalPages.value, percentage: totalPages.value>0?page.value/totalPages.value:0, scroll_position: 0 }) } catch {}
}

document.addEventListener('keydown', onKey)
onUnmounted(() => document.removeEventListener('keydown', onKey))
function onKey(e) {
  if (!pdfDoc) return
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prevPage() }
  else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); nextPage() }
  else if ((e.ctrlKey||e.metaKey) && (e.key === '='||e.key === '+')) { e.preventDefault(); zoomIn() }
  else if ((e.ctrlKey||e.metaKey) && e.key === '-') { e.preventDefault(); zoomOut() }
}
</script>

<style scoped>
.reader-wrap { display:flex;flex-direction:column;height:100%;overflow:hidden }
.reader-toolbar { display:flex;align-items:center;gap:4px;padding:4px 12px;border-bottom:1px solid var(--el-border-color-light);flex-shrink:0 }
.reader-title { flex:1;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
.pdf-container { flex:1;overflow-y:auto;overflow-x:auto;background:#e8e8e8;display:flex;flex-direction:column;align-items:center;padding:16px;position:relative }
.pdf-container canvas { box-shadow:0 2px 16px rgba(0,0,0,0.12);border-radius:2px;flex-shrink:0 }
.pdf-container span { pointer-events:auto;cursor:text;user-select:text;-webkit-user-select:text;color:transparent }
.pdf-container ::selection { background:rgba(64,158,255,0.4) }
.reader-footer { display:flex;align-items:center;gap:8px;padding:2px 12px;border-top:1px solid var(--el-border-color-light);flex-shrink:0;height:38px }
.loading-state { display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:#909399 }
</style>
