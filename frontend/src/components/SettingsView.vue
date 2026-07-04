<template>
  <div class="settings">
    <div class="section">
      <h3>阅读设置</h3>
      <div class="item"><label>字体大小</label><el-slider v-model="fontSize" :min="12" :max="32" style="width:200px" @input="setFontSize" /></div>
      <div class="item">
        <label>行间距</label>
        <el-select v-model="lineHeight" size="small" style="width:120px" @change="setLineHeight">
          <el-option label="紧凑" value="1.5" />
          <el-option label="正常" value="1.8" />
          <el-option label="宽松" value="2.2" />
        </el-select>
      </div>
      <div class="item"><label>护眼模式</label><el-switch v-model="eyeCare" @change="toggleEyeCare" /></div>
    </div>
    <div class="section">
      <h3>数据管理</h3>
      <div class="item"><label>备份数据</label><el-button size="small" @click="doBackup">创建备份</el-button></div>
      <div class="item"><label>重置数据</label><el-button size="small" type="danger" @click="doReset">清除所有数据</el-button></div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../api.js'
import { ElMessage, ElMessageBox } from 'element-plus'

const fontSize = ref(parseInt(localStorage.getItem('sr_fontSize') || '16'))
const lineHeight = ref(localStorage.getItem('sr_lineHeight') || '1.8')
const eyeCare = ref(localStorage.getItem('sr_eyeCare') === 'true')

function setFontSize(v) { localStorage.setItem('sr_fontSize', String(v)); document.querySelectorAll('.pdf-page, .reader-content').forEach(el => el.style.fontSize = v + 'px') }
function setLineHeight(v) { localStorage.setItem('sr_lineHeight', v); document.querySelectorAll('.pdf-page, .reader-content').forEach(el => el.style.lineHeight = v) }
function toggleEyeCare(v) { localStorage.setItem('sr_eyeCare', v); document.body.classList.toggle('eye-care', v) }

async function doBackup() {
  try { const r = await api.backup(); ElMessage.success(r.path ? `备份成功: ${r.path}` : '备份成功') } catch { ElMessage.error('备份失败') }
}
async function doReset() {
  try {
    await ElMessageBox.confirm('确定清除所有数据？此操作不可恢复！', '警告', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
    await ElMessageBox.confirm('再次确认：所有数据将被永久删除！', '确认', { type: 'error', confirmButtonText: '确定', cancelButtonText: '取消' })
    await api.clearAllData(); ElMessage.success('已清除'); window.location.reload()
  } catch {}
}
</script>

<style scoped>
.settings { padding:20px 24px;max-width:520px;overflow-y:auto;height:100% }
.section { margin-bottom:24px }
.section h3 { font-size:14px;font-weight:500;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--el-border-color-light) }
.item { display:flex;align-items:center;justify-content:space-between;padding:8px 0 }
.item label { font-size:13px;color:var(--el-text-color-primary) }
</style>
