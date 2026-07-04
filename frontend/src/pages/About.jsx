import React from 'react'

export default function About() {
  return (
    <div className="about-view">
      <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
      <h2 style={{ fontWeight: 600, marginBottom: 4 }}>AI智慧阅读</h2>
      <p style={{ color: '#909399', marginBottom: 16 }}>v1.0.0</p>
      <p style={{ color: '#606266', marginBottom: 4 }}>作者：Shinwell</p>
      <p style={{ color: '#909399', marginBottom: 20 }}>纯本地离线 AI 阅读软件</p>
      <p style={{ color: '#409eff', fontWeight: 500, marginBottom: 20 }}>用心做好安全、高效、易用的每一个小工具</p>
      <div style={{ borderTop: '1px solid #e4e7ed', paddingTop: 20, marginBottom: 16 }}>
        <p style={{ color: '#606266', marginBottom: 8 }}>开源不易，希望得到您的捐助 🙏</p>
        <div style={{ margin: '10px 0', textAlign: 'center' }}>
          <img src="./wechat_pay.png" alt="赞赏码" onError={e => e.target.style.display = 'none'} style={{ width: 120, height: 120, borderRadius: 4, border: '1px solid #e4e7ed' }} />
          <div style={{ marginTop: 4, fontSize: 11, color: '#c0c4cc' }}>微信赞赏码</div>
        </div>
        <p style={{ color: '#909399', fontSize: 12 }}>您的支持是我继续前进的动力 🙏</p>
        <p style={{ color: '#909399', fontSize: 12 }}>欢迎提供好的建议或赞助支持</p>
      </div>
      <p style={{ color: '#409eff', marginTop: 8 }}>kuxiangwei@163.com</p>
    </div>
  )
}
