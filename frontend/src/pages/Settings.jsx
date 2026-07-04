import React, { useState, useEffect } from 'react'
import { api } from '../api'
import { Card, Button, message, Modal, Switch, Slider, Select, Input, Radio, Form, Space, Divider } from 'antd'

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
const flatOptions = PROVIDER_OPTIONS.flatMap(g => g.items.map(i => ({ ...i, _group: g.group })))

export default function Settings() {
  const [fontSize, setFontSize] = useState(parseInt(localStorage.getItem('sr_fontSize') || '16'))
  const [lineHeight, setLineHeight] = useState(localStorage.getItem('sr_lineHeight') || '1.8')
  const [eyeCare, setEyeCare] = useState(localStorage.getItem('sr_eyeCare') === 'true')

  const [mode, setMode] = useState('local')
  const [provider, setProvider] = useState('openai')
  const [apiBase, setApiBase] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [maxTokens, setMaxTokens] = useState(4096)
  const [temperature, setTemperature] = useState(0.3)
  const [configLoaded, setConfigLoaded] = useState(false)

  useEffect(() => {
    api.getTranslatorConfig().then(cfg => {
      setMode(cfg.mode || 'local')
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
  }, [])

  const handleProviderChange = (val) => {
    setProvider(val)
    const preset = GROUPED_OPTIONS.find(p => p.value === val)
    if (preset) {
      setApiBase(preset.base)
      setModel(preset.model)
    }
  }

  const saveTranslatorConfig = async () => {
    try {
      await api.updateTranslatorConfig({
        mode,
        remote: { provider, api_base: apiBase, api_key: apiKey, model, max_tokens: maxTokens, temperature },
      })
      message.success('翻译配置已保存')
    } catch { message.error('保存失败') }
  }

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
      <Card title="阅读设置" size="small" style={{ marginBottom: 16 }}>
        <Form layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Form.Item label="字体大小">
            <Slider min={12} max={32} value={fontSize} onChange={updateFontSize} style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label="行间距">
            <Select value={lineHeight} onChange={updateLineHeight} size="small" style={{ width: 100 }}
              options={[{ value: '1.5', label: '紧凑' }, { value: '1.8', label: '正常' }, { value: '2.2', label: '宽松' }]} />
          </Form.Item>
          <Form.Item label="护眼模式">
            <Switch checked={eyeCare} onChange={toggleEyeCare} />
          </Form.Item>
        </Form>
      </Card>

      <Card title="翻译模型" size="small" style={{ marginBottom: 16 }}>
        {configLoaded && (
          <Form layout="vertical" size="small">
            <Form.Item label="翻译引擎">
              <Radio.Group value={mode} onChange={e => setMode(e.target.value)}>
                <Radio value="local">本地模型</Radio>
                <Radio value="remote">远程 LLM</Radio>
              </Radio.Group>
            </Form.Item>

            {mode === 'remote' && (
              <>
                <Divider style={{ margin: '8px 0' }} />
                <Form.Item label="厂商">
                  <Select value={provider} onChange={handleProviderChange} style={{ width: 280 }}
                    options={PROVIDER_OPTIONS.map(g => ({
                      label: g.group, options: g.items.map(i => ({ value: i.value, label: i.label }))
                    }))} />
                </Form.Item>
                <Form.Item label="接口地址">
                  <Input value={apiBase} onChange={e => setApiBase(e.target.value)} placeholder="https://api.openai.com/v1" style={{ width: 400 }} />
                </Form.Item>
                <Form.Item label="API Key">
                  <Input.Password value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." style={{ width: 400 }} />
                </Form.Item>
                <Form.Item label="模型名">
                  <Input value={model} onChange={e => setModel(e.target.value)} placeholder="gpt-4o-mini" style={{ width: 280 }} />
                </Form.Item>
                <Form.Item label="Max Tokens">
                  <Slider min={256} max={16384} step={256} value={maxTokens} onChange={setMaxTokens} style={{ width: 280 }} />
                </Form.Item>
                <Form.Item label="Temperature">
                  <Space>
                    <Slider min={0} max={1} step={0.1} value={temperature} onChange={setTemperature} style={{ width: 200 }} />
                    <span style={{ fontSize: 12, color: '#909399', minWidth: 24 }}>{temperature}</span>
                  </Space>
                </Form.Item>
              </>
            )}

            <Form.Item>
              <Button type="primary" onClick={saveTranslatorConfig}>保存配置</Button>
            </Form.Item>
          </Form>
        )}
      </Card>

      <Card title="数据管理" size="small">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>备份当前所有数据</span>
            <Button size="small" onClick={doBackup}>创建备份</Button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#f56c6c' }}>清除所有数据（不可恢复）</span>
            <Button size="small" danger onClick={doReset}>清除所有数据</Button>
          </div>
        </Space>
      </Card>
    </div>
  )
}
