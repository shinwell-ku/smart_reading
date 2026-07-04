import React, { useState } from 'react'
import { api } from '../api'
import { Button, message, Modal, Switch, Slider, Select } from 'antd'

export default function Settings() {
  const [fontSize, setFontSize] = useState(parseInt(localStorage.getItem('sr_fontSize') || '16'))
  const [lineHeight, setLineHeight] = useState(localStorage.getItem('sr_lineHeight') || '1.8')
  const [eyeCare, setEyeCare] = useState(localStorage.getItem('sr_eyeCare') === 'true')

  const updateFontSize = (v) => {
    setFontSize(v)
    localStorage.setItem('sr_fontSize', String(v))
    document.querySelectorAll('.pdf-page, .reader-content').forEach(el => el.style.fontSize = v + 'px')
  }

  const updateLineHeight = (v) => {
    setLineHeight(v)
    localStorage.setItem('sr_lineHeight', v)
    document.querySelectorAll('.pdf-page, .reader-content').forEach(el => el.style.lineHeight = v)
  }

  const toggleEyeCare = (v) => {
    setEyeCare(v)
    localStorage.setItem('sr_eyeCare', v)
    document.body.classList.toggle('eye-care', v)
  }

  const doBackup = async () => {
    try { const r = await api.backup(); message.success(r.path ? `备份成功: ${r.path}` : '备份成功') } catch { message.error('备份失败') }
  }

  const doReset = () => {
    Modal.confirm({
      title: '清除所有数据？',
      content: '此操作不可恢复！',
      okText: '确定', cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => Modal.confirm({
        title: '再次确认',
        content: '所有数据将被永久删除！',
        okText: '确定', cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => { await api.clearAllData(); message.success('已清除'); window.location.reload() }
      })
    })
  }

  return (
    <div className="settings-view">
      <h3>阅读设置</h3>
      <div className="setting-row"><label>字体大小</label><Slider min={12} max={32} value={fontSize} onChange={updateFontSize} style={{ width: 200 }} /></div>
      <div className="setting-row"><label>行间距</label><Select value={lineHeight} onChange={updateLineHeight} size="small" style={{ width: 120 }} options={[{ value: '1.5', label: '紧凑' }, { value: '1.8', label: '正常' }, { value: '2.2', label: '宽松' }]} /></div>
      <div className="setting-row"><label>护眼模式</label><Switch checked={eyeCare} onChange={toggleEyeCare} /></div>

      <h3 style={{ marginTop: 24 }}>数据管理</h3>
      <div className="setting-row"><label>备份数据</label><Button size="small" onClick={doBackup}>创建备份</Button></div>
      <div className="setting-row"><label>重置数据</label><Button size="small" danger onClick={doReset}>清除所有数据</Button></div>
    </div>
  )
}
