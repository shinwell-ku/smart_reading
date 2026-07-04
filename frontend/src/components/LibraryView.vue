<template>
  <div class="library">
    <div class="lib-header">
      <h2>我的书库</h2>
      <div style="display:flex;gap:10px">
        <el-input v-model="search" placeholder="搜索书籍..." clearable style="width:200px" size="small" />
        <el-button type="primary" size="small" @click="importBooks">📥 导入书籍</el-button>
      </div>
    </div>
    <div class="book-grid" v-if="filteredBooks.length > 0">
      <div v-for="b in filteredBooks" :key="b.id" class="book-card" @click="openBook(b)">
        <div class="book-cover" :class="b.file_type">
          <img :src="api.getCoverUrl(b.id)" class="cover-img" alt="" @error="e=>e.target.style.display='none'" />
          <span class="cover-emoji">{{ b.file_type === 'pdf' ? '📕' : '📘' }}</span>
          <button class="btn-del" @click.stop="deleteBook(b.id)">✕</button>
        </div>
        <div class="book-info">
          <div class="book-title" :title="b.title">{{ b.title }}</div>
          <div class="book-meta">{{ b.file_type.toUpperCase() }} · {{ b.total_pages || 0 }}页</div>
        </div>
      </div>
    </div>
    <el-empty v-else description="点击「导入书籍」添加电子书" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api.js'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'

const emit = defineEmits(['openBook'])
const books = ref([])
const search = ref('')
const importing = ref(false)

const filteredBooks = computed(() => {
  const q = search.value.toLowerCase()
  return q ? books.value.filter(b => b.title.toLowerCase().includes(q)) : books.value
})

onMounted(() => loadBooks())

async function loadBooks() {
  try { const r = await api.listBooks(); books.value = r.books || [] } catch {}
}

async function importBooks() {
  if (importing.value) return
  importing.value = true
  let loading
  try {
    const result = await window.electronAPI.openFileDialog({})
    if (result.canceled || !result.filePaths.length) { importing.value = false; return }
    // 显示加载遮罩
    loading = ElLoading.service({ fullscreen: true, text: '正在导入...', background: 'rgba(0,0,0,0.45)' })
    let success = 0, fail = 0
    for (let i = 0; i < result.filePaths.length; i++) {
      loading.setText(`正在导入 ${i + 1}/${result.filePaths.length}...`)
      try {
        const r = await api.importBookByPath(result.filePaths[i])
        if (r.error) fail++; else success++
      } catch { fail++ }
    }
    loading.close(); loading = null
    importing.value = false
    const tips = []
    if (success > 0) tips.push(`✅ 导入成功 ${success} 本`)
    if (fail > 0) tips.push(`❌ ${fail} 本失败`)
    ElMessage.info(tips.join('，') || '导入完成')
    await loadBooks()
  } catch { if (loading) loading.close(); importing.value = false; ElMessage.error('导入异常') }
}

function openBook(book) { emit('openBook', book) }

async function deleteBook(id) {
  try {
    await ElMessageBox.confirm('确定要删除这本书吗？所有笔记和进度也将被删除。', '确认', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
    await api.deleteBook(id)
    ElMessage.success('已删除')
    await loadBooks()
  } catch {}
}
</script>

<style scoped>
.library { display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden }
.lib-header { display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--el-border-color-light);flex-shrink:0 }
.book-grid { flex:1;overflow-y:auto;padding:14px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;align-content:start }
.book-card { border:1px solid var(--el-border-color-light);border-radius:8px;overflow:hidden;cursor:pointer;transition:all 0.2s }
.book-card:hover { box-shadow:0 4px 16px rgba(0,0,0,0.1);transform:translateY(-2px) }
.book-cover { aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;font-size:36px;position:relative;overflow:hidden }
.book-cover.pdf { background:linear-gradient(135deg,#f56c6c,#e04040) }
.book-cover.docx { background:linear-gradient(135deg,#409eff,#2a7de1) }
.cover-img { width:100%;height:100%;object-fit:cover;position:absolute }
.cover-emoji { z-index:1 }
.btn-del { position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,0.3);color:#fff;border:none;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s }
.book-card:hover .btn-del { opacity:1 }
.btn-del:hover { background:#f56c6c }
.book-info { padding:8px 10px }
.book-title { font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
.book-meta { font-size:11px;color:#909399;margin-top:2px }
</style>
