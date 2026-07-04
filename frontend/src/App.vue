<template>
  <div id="app-shell">
    <!-- 顶部导航 -->
    <el-menu mode="horizontal" :ellipsis="false" class="topbar" @select="onMenuSelect">
      <el-menu-item index="logo" disabled style="opacity:1;font-weight:600;font-size:15px">
        <img src="/logo.png" style="width:20px;height:20px;border-radius:3px;margin-right:6px" alt="" />
        AI智慧阅读
      </el-menu-item>
      <el-menu-item index="library">📚 书库</el-menu-item>
      <el-menu-item index="settings">⚙️ 设置</el-menu-item>
      <el-menu-item index="about">ℹ️ 关于</el-menu-item>
      <div class="topbar-spacer"></div>
      <el-tag :type="backendOnline ? 'success' : 'danger'" size="small" effect="dark" style="margin:0 12px;height:28px">
        {{ backendOnline ? '服务已就绪' : '服务离线' }}
      </el-tag>
    </el-menu>

    <!-- 主体 -->
    <div class="main-area">
      <!-- 书库 -->
      <LibraryView v-show="activeView === 'library'" @open-book="openBook" />

      <!-- 阅读器 + 侧边面板 -->
      <template v-if="activeView === 'reader'">
        <div class="split-view">
          <div class="split-left">
            <ReaderView ref="reader" :book="currentBook" @page-change="onPageChange" @back="goBackToLibrary" />
          </div>
          <div class="split-right">
            <SidePanel ref="sidePanel" :book="currentBook" :page="currentPage" />
          </div>
        </div>
      </template>

      <!-- 设置 -->
      <SettingsView v-show="activeView === 'settings'" />

      <!-- 关于 -->
      <AboutView v-show="activeView === 'about'" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from './api.js'
import LibraryView from './components/LibraryView.vue'
import ReaderView from './components/ReaderView.vue'
import SidePanel from './components/SidePanel.vue'
import SettingsView from './components/SettingsView.vue'
import AboutView from './components/AboutView.vue'

const activeView = ref('library')
const backendOnline = ref(false)
const currentBook = ref(null)
const currentPage = ref(1)
const reader = ref(null)

onMounted(() => {
  checkHealth()
  setInterval(checkHealth, 5000)
  // 全局键盘快捷键
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'r') { e.preventDefault(); location.reload() }
    // 阅读器翻页
    if (activeView.value !== 'reader' || !reader.value) return
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); reader.value?.prevPage?.() }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); reader.value?.nextPage?.() }
  })
})

async function checkHealth() {
  try {
    const r = await api.checkHealth()
    backendOnline.value = r.status === 'ok'
  } catch { backendOnline.value = false }
}

function onMenuSelect(index) {
  if (index === 'logo') return
  activeView.value = index
  if (index === 'library') currentBook.value = null
}

async function openBook(book) {
  currentBook.value = null
  await new Promise(r => setTimeout(r, 50))
  currentBook.value = book
  currentPage.value = 1
  activeView.value = 'reader'
}

function onPageChange(page) { currentPage.value = page }
function goBackToLibrary() { currentBook.value = null; activeView.value = 'library' }
</script>

<style>
html,body,#app,#app-shell { margin:0;padding:0;height:100vh;overflow:hidden;font-family:'PingFang SC','Microsoft YaHei','Helvetica Neue',sans-serif }
.topbar { display:flex;align-items:center;height:48px;border-bottom:1px solid var(--el-border-color-light) !important }
.topbar .el-menu-item { font-size:13px;padding:0 12px;height:48px;line-height:48px }
.topbar-spacer { flex:1 }
.main-area { height:calc(100vh - 48px);display:flex;overflow:hidden }
.split-view { display:flex;width:100%;height:100%;overflow:hidden }
.split-left { flex:1;overflow:hidden;display:flex;flex-direction:column }
.split-right { width:420px;min-width:420px;border-left:1px solid var(--el-border-color-light);overflow:hidden;display:flex;flex-direction:column }
</style>
