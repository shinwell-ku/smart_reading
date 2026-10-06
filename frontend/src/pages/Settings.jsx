import React, { useState, useEffect } from 'react'
import { api } from '../api'
import { Button, message, Modal, Switch, Slider, Select, Input, Form, Space, AutoComplete, Divider, Skeleton } from 'antd'
import { SettingOutlined, CloudServerOutlined, DatabaseOutlined, ReadOutlined, ReloadOutlined, FolderOpenOutlined } from '@ant-design/icons'

const PROVIDER_OPTIONS = [
  { group: '国内',
    items: [
      { value: 'deepseek',    label: 'DeepSeek',           base: 'https://api.deepseek.com',                        model: 'deepseek-chat' },
      { value: 'siliconflow', label: '硅基流动',           base: 'https://api.siliconflow.cn/v1',                   model: 'Qwen/Qwen2.5-7B-Instruct' },
      { value: 'moonshot',    label: '月之暗面 Moonshot',  base: 'https://api.moonshot.cn/v1',                      model: 'moonshot-v1-8k' },
      { value: 'zhipu',       label: '智谱 GLM',           base: 'https://open.bigmodel.cn/api/paas/v4',            model: 'glm-4-flash' },
      { value: 'qwen',        label: '阿里通义千问',       base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
      { value: 'doubao',      label: '字节豆包',           base: 'https://ark.cn-beijing.volces.com/api/v3',        model: 'doubao-pro-32k' },
      { value: 'spark',       label: '讯飞星火',           base: 'https://spark-api-open.xf-yun.com/v1',            model: 'lite' },
    ] },
  { group: '国际',
    items: [
      { value: 'openai',      label: 'OpenAI',             base: 'https://api.openai.com/v1',                       model: 'gpt-4o-mini' },
      { value: 'anthropic',   label: 'Anthropic (需 proxy)', base: 'https://api.anthropic.com/v1',                   model: 'claude-sonnet-4-20250514' },
      { value: 'google',      label: 'Google Gemini',      base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
      { value: 'xai',         label: 'xAI Grok',           base: 'https://api.x.ai/v1',                             model: 'grok-2' },
    ] },
  { group: '本地',
    items: [
      { value: 'ollama',      label: 'Ollama',             base: 'http://localhost:11434/v1',                       model: 'llama3' },
      { value: 'custom',      label: '自定义',             base: '',                                                 model: '' },
    ] },
]

const GROUPED_OPTIONS = PROVIDER_OPTIONS.flatMap(g => g.items)

// 表单统一的标签列 / 控件列宽度，保证三节的标签对齐在同一列
const LABEL_COL = { span: 7 }
const WRAPPER_COL = { span: 17 }
// 输入类控件的统一宽度
const FIELD_W = { maxWidth: 360 }

// 分节标题
function SectionTitle({ icon, children }) {
  return (
    <Divider orientation="left" orientationMargin={0} style={{ marginTop: 6, marginBottom: 20 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#303133' }}>
        {icon}<span style={{ marginLeft: 6 }}>{children}</span>
      </span>
    </Divider>
  )
}

// Slider + 当前值（antd 没有内置的带数值显示滑块）
function SliderWithValue({ value, ...rest }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 300 }}>
      <Slider {...rest} value={value} style={{ flex: 1, margin: 0 }} />
      <span style={{ fontSize: 12, color: '#909399', minWidth: 40, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function Settings({ open, onClose }) {
  const [eyeCare, setEyeCare] = useState(localStorage.getItem('sr_eyeCare') === 'true')

  const [provider, setProvider] = useState('openai')
  const [apiBase, setApiBase] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [maxTokens, setMaxTokens] = useState(4096)
  const [temperature, setTemperature] = useState(0.3)
  const [configLoaded, setConfigLoaded] = useState(false)

  const [modelOptions, setModelOptions] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)

  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [lastBackup, setLastBackup] = useState('')

  useEffect(() => {
    if (!open) return
    api.getTranslatorConfig().then(cfg => {
      if (cfg.remote) {
        setProvider(cfg.remote.provider || 'openai')
        setApiBase(cfg.remote.api_base || '')
        setApiKey(cfg.remote.api_key || '')
        setModel(cfg.remote.model || '')
        setMaxTokens(cfg.remote.max_tokens || 4096)
        setTemperature(cfg.remote.temperature || 0.3)
      }
      setConfigLoaded(true)
    }).catch(() => setConfigLoaded(true))
  }, [open])

  const handleProviderChange = (val) => {
    setProvider(val)
    const preset = GROUPED_OPTIONS.find(p => p.value === val)
    if (preset) { setApiBase(preset.base); setModel(preset.model) }
    setModelOptions([])
  }

  const saveTranslatorConfig = async () => {
    try {
      await api.updateTranslatorConfig({
        remote: { provider, api_base: apiBase, api_key: apiKey, model, max_tokens: maxTokens, temperature },
      })
      message.success('AI 配置已保存')
    } catch { message.error('保存失败') }
  }

  // 拉取厂商可用模型列表（OpenAI 兼容的 GET /models）
  const loadModels = async () => {
    if (!apiBase.trim()) { message.warning('请先填写接口地址'); return }
    if (!apiKey.trim()) { message.warning('请先填写 API Key'); return }
    setLoadingModels(true)
    try {
      const r = await api.fetchModels({ api_base: apiBase.trim(), api_key: apiKey.trim() })
      if (r.error) { message.error(r.error); return }
      const list = r.models || []
      setModelOptions(list)
      if (list.length) message.success(`获取到 ${list.length} 个模型`)
      else message.warning('该接口未返回任何模型')
    } catch (e) {
      message.error('获取模型列表失败：' + (e.message || '网络错误'))
    } finally {
      setLoadingModels(false)
    }
  }

  const toggleEyeCare = (v) => {
    setEyeCare(v)
    localStorage.setItem('sr_eyeCare', v)
    document.body.classList.toggle('eye-care', v)
  }

  // 导出备份到用户选定的路径
  const doBackup = async () => {
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const picked = await window.electronAPI.saveFileDialog({
      title: '导出备份',
      defaultPath: `AI智慧阅读备份_${stamp}.zip`,
      filters: [{ name: '备份文件', extensions: ['zip'] }],
    })
    if (picked.canceled || !picked.filePath) return

    setBackingUp(true)
    try {
      const r = await api.backup(picked.filePath)
      if (r.error) { message.error(r.error); return }
      setLastBackup(r.path)
      message.success(`备份成功（${(r.size / 1024 / 1024).toFixed(1)} MB）`)
    } catch (e) {
      message.error('备份失败：' + (e.message || '未知错误'))
    } finally {
      setBackingUp(false)
    }
  }

  // 从备份包恢复（整体替换）
  const doRestore = async () => {
    const picked = await window.electronAPI.openFileDialog({
      title: '选择备份文件',
      filters: [{ name: '备份文件', extensions: ['zip'] }],
      properties: ['openFile'],
    })
    if (picked.canceled || !picked.filePaths?.length) return
    const src = picked.filePaths[0]

    Modal.confirm({
      title: '导入备份？',
      content: (
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div style={{ marginBottom: 6, wordBreak: 'break-all', color: '#909399' }}>{src}</div>
          <div style={{ color: '#f56c6c', fontWeight: 500 }}>
            当前所有书籍、笔记、进度、生词和知识图谱将被完全覆盖，且无法恢复。
          </div>
        </div>
      ),
      okText: '覆盖并恢复', cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setRestoring(true)
        try {
          const r = await api.restoreBackup(src)
          if (r.error) { message.error(r.error); return }
          message.success(`恢复成功：${r.book_count} 本书、${r.note_count} 条笔记、${r.bookmark_count} 个书签`)
          setTimeout(() => window.location.reload(), 1200)
        } catch (e) {
          message.error('恢复失败：' + (e.message || '未知错误'))
        } finally {
          setRestoring(false)
        }
      },
    })
  }

  const doReset = () => {
    Modal.confirm({
      title: '清除所有数据？',
      content: '将删除所有书籍文件、笔记、阅读进度、生词和知识图谱。AI 引擎配置会保留。此操作不可恢复！',
      okText: '确定', cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => Modal.confirm({
        title: '再次确认',
        content: '所有书籍和阅读数据将被永久删除，无法找回！',
        okText: '确定', cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => { await api.clearAllData(); message.success('已清除'); window.location.reload() }
      })
    })
  }

  return (
    <Modal
      title={<span><SettingOutlined style={{ marginRight: 8 }} />设置</span>}
      open={open} onCancel={onClose} footer={null} width={720} centered
      styles={{ body: { maxHeight: '74vh', overflowY: 'auto', paddingRight: 12 } }}
    >
      {!configLoaded ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Form
          layout="horizontal"
          labelCol={LABEL_COL}
          wrapperCol={WRAPPER_COL}
          onFinish={() => {}}   /* 纯布局容器；阻止回车隐式提交 */
        >
          <SectionTitle icon={<ReadOutlined />}>阅读</SectionTitle>

          <Form.Item label="护眼模式" tooltip="阅读区与工具面板使用米色纸感配色">
            <Switch checked={eyeCare} onChange={toggleEyeCare} />
          </Form.Item>

          <SectionTitle icon={<CloudServerOutlined />}>AI 引擎</SectionTitle>

          <Form.Item label="大模型供应商" tooltip="翻译与知识图谱均通过 OpenAI 兼容 API 调用">
            <Select value={provider} onChange={handleProviderChange} style={FIELD_W}
              options={PROVIDER_OPTIONS.map(g => ({
                label: g.group, options: g.items.map(i => ({ value: i.value, label: i.label }))
              }))} />
          </Form.Item>

          <Form.Item label="接口地址">
            <Input value={apiBase} onChange={e => setApiBase(e.target.value)}
              placeholder="https://api.openai.com/v1" style={FIELD_W} />
          </Form.Item>

          <Form.Item label="API Key">
            <Input.Password value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..." style={FIELD_W} />
          </Form.Item>

          <Form.Item label="模型" tooltip="点「获取模型」从接口拉取列表，也可直接手工输入">
            <div style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
              <AutoComplete
                value={model}
                onChange={setModel}
                options={modelOptions.map(m => ({ value: m }))}
                placeholder="gpt-4o-mini"
                allowClear
                style={{ flex: 1 }}
                filterOption={(input, option) =>
                  option.value.toLowerCase().includes(input.toLowerCase())}
              />
              <Button icon={<ReloadOutlined />} loading={loadingModels} onClick={loadModels}>
                获取模型
              </Button>
            </div>
          </Form.Item>

          <Form.Item label="最大 Token 数" tooltip="单次回复的长度上限，长文翻译建议不低于 4096">
            <SliderWithValue min={256} max={16384} step={256}
              value={maxTokens} onChange={setMaxTokens} />
          </Form.Item>

          <Form.Item label="温度" tooltip="越低越稳定保守，越高越发散。翻译建议保持 0.3 左右">
            <SliderWithValue min={0} max={1} step={0.1}
              value={temperature} onChange={setTemperature} />
          </Form.Item>

          <Form.Item wrapperCol={{ span: WRAPPER_COL.span, offset: LABEL_COL.span }}>
            <Button type="primary" icon={<CloudServerOutlined />} onClick={saveTranslatorConfig}>
              保存配置
            </Button>
          </Form.Item>

          <SectionTitle icon={<DatabaseOutlined />}>数据管理</SectionTitle>

          <Form.Item label="备份" tooltip="打包书籍、笔记、进度、生词、知识图谱和 AI 引擎配置">
            <Space>
              <Button loading={backingUp} onClick={doBackup}>导出备份</Button>
              {lastBackup && (
                <Button type="link" icon={<FolderOpenOutlined />}
                  onClick={() => window.electronAPI.showInFolder(lastBackup)}>
                  打开所在文件夹
                </Button>
              )}
            </Space>
          </Form.Item>

          <Form.Item label="恢复" tooltip="从备份文件恢复，会覆盖当前全部数据">
            <Button loading={restoring} onClick={doRestore}>导入备份</Button>
          </Form.Item>

          <Form.Item label="清除" tooltip="删除所有书籍、笔记、进度、生词和知识图谱，保留 AI 引擎配置">
            <Button danger onClick={doReset}>清除所有数据</Button>
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
