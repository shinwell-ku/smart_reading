import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import App from './App'
import { useI18n } from './i18n'
import './App.css'

// antd 组件自带的文案（Select 空数据的 "No data"、Modal 关闭按钮的
// aria-label 等）跟这里的 locale 走。项目此前没有 ConfigProvider，v5
// 默认 en_US —— 中文用户看到的这些反而是英文，这次一并修掉。
//
// 放在 App 外面一层：切语言时 Root 先重渲染，ConfigProvider 换 locale，
// 整棵树跟着换。注意只 re-render 不 unmount，阅读位置之类的状态不会丢。
function Root() {
  const { lang } = useI18n()
  return (
    <ConfigProvider locale={lang === 'zh' ? zhCN : enUS}>
      <App />
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />)
