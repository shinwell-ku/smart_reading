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
        <p style={{ color: '#606266', marginBottom: 4 }}>纯本地离线 AI 阅读软件</p>
        <p style={{ color: '#409eff', fontWeight: 500, marginBottom: 20 }}>
          用心做好安全、高效、易用的每一个小工具
        </p>

        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, marginBottom: 12 }}>
          <p style={{ color: '#606266', marginBottom: 8, fontSize: 13 }}>开源不易，希望得到您的捐助 🙏</p>
          <div style={{ margin: '8px 0', textAlign: 'center' }}>
            <img src="./wechat_pay.png" alt="赞赏码"
              onError={e => e.target.style.display = 'none'}
              style={{ width: 120, height: 120, borderRadius: 4, border: '1px solid #f0f0f0' }} />
            <div style={{ marginTop: 4, fontSize: 11, color: '#c0c4cc' }}>微信赞赏码</div>
          </div>
          <p style={{ color: '#909399', fontSize: 12 }}>您的支持是我继续前进的动力 🙏</p>
        </div>

        <a href="mailto:kuxiangwei@163.com" style={{ color: '#409eff', fontSize: 13 }}>
          kuxiangwei@163.com
        </a>
      </div>
    </Modal>
  )
}
