import React from 'react'
import { Modal } from 'antd'
import { useI18n } from '../i18n'

export default function AboutModal({ open, onClose }) {
  const { t } = useI18n()
  return (
    <Modal
      title={t('about.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
      centered
    >
      <div style={{ textAlign: 'center' }}>
        <img src="./logo.png" alt={t('app.title')} style={{ width: 64, height: 64, borderRadius: 12, marginBottom: 12 }} />
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>{t('app.title')}</h2>
        {/* 版本号来自 frontend/package.json，由 vite.config.js 注入，
            发版时只改那一处 */}
        <p style={{ color: '#909399', marginBottom: 12 }}>v{__APP_VERSION__}</p>
        <p style={{ color: '#606266', marginBottom: 4 }}>{t('about.tagline')}</p>
        <p style={{ color: '#409eff', fontWeight: 500, marginBottom: 20 }}>
          {t('about.slogan')}
        </p>

        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, marginBottom: 12 }}>
          <p style={{ color: '#606266', marginBottom: 8, fontSize: 13 }}>{t('about.donate')}</p>
          <div style={{ margin: '8px 0', textAlign: 'center' }}>
            <img src="./wechat_pay.png" alt={t('about.qrAlt')}
              onError={e => e.target.style.display = 'none'}
              style={{ width: 120, height: 120, borderRadius: 4, border: '1px solid #f0f0f0' }} />
            <div style={{ marginTop: 4, fontSize: 11, color: '#c0c4cc' }}>{t('about.qrLabel')}</div>
          </div>
        </div>

        <a href="mailto:kuxiangwei@163.com" style={{ color: '#409eff', fontSize: 13 }}>
          kuxiangwei@163.com
        </a>
      </div>
    </Modal>
  )
}
