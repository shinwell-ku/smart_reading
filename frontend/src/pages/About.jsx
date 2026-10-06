import React from 'react'
import { Modal } from 'antd'

export default function AboutModal({ open, onClose }) {
  return (
    <Modal
      title="关于"
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
      centered
    >
      <div style={{ textAlign: 'center' }}>
        <img src="./logo.png" alt="AI智慧阅读" style={{ width: 64, height: 64, borderRadius: 12, marginBottom: 12 }} />
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>AI智慧阅读</h2>
        <p style={{ color: '#909399', marginBottom: 12 }}>v1.0.0</p>
        <p style={{ color: '#606266', marginBottom: 4 }}>AI 翻译 · 知识图谱 · 多格式阅读</p>
        <p style={{ color: '#409eff', fontWeight: 500, marginBottom: 20 }}>
          用心做好简单、高效、易用的小工具
        </p>

        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, marginBottom: 12 }}>
          <p style={{ color: '#606266', marginBottom: 8, fontSize: 13 }}>开源不易，您的捐助是我前进的动力🙏</p>
          <div style={{ margin: '8px 0', textAlign: 'center' }}>
            <img src="./wechat_pay.png" alt="赞赏码"
              onError={e => e.target.style.display = 'none'}
              style={{ width: 120, height: 120, borderRadius: 4, border: '1px solid #f0f0f0' }} />
            <div style={{ marginTop: 4, fontSize: 11, color: '#c0c4cc' }}>微信赞赏码</div>
          </div>
        </div>

        <a href="mailto:kuxiangwei@163.com" style={{ color: '#409eff', fontSize: 13 }}>
          kuxiangwei@163.com
        </a>
      </div>
    </Modal>
  )
}
