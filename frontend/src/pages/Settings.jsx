import React, { useState, useEffect } from 'react'
import { api } from '../api'
import { Button, message, Modal, Switch, Slider, Select, Input, Radio, Form, Space, Tabs, Card, Tag } from 'antd'
import { SettingOutlined, ReadOutlined, CloudServerOutlined, DatabaseOutlined, SafetyOutlined, ApiOutlined, KeyOutlined } from '@ant-design/icons'

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

export default function Settings({ open, onClose }) {
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
    if (preset) { setApiBase(preset.base); setModel(preset.model) }
  }

  const saveTranslatorConfig = async () => {
    try {
      await api.updateTranslatorConfig({
        mode,
        remote: { provider, api_base: apiBase, api_key: apiKey, model, max_tokens: maxTokens, temperature },
      })
      message.success('AI 配置已保存')
    } catch { message.error('保存失败') }
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
    <Modal title={<span><SettingOutlined style={{ marginRight: 8 }} />设置</span>} open={open} onCancel={onClose} footer={null} width={660} centered>
      <Tabs
        items={[
          {
            key: 'reading',
            label: <span><ReadOutlined /> 阅读</span>,
            children: (
              <Card size="small" style={{ border: 'none', boxShadow: 'none' }}>
                <Form layout="inline" style={{ flexWrap: 'wrap', gap: 12 }}>
                  <Form.Item label="护眼模式">
                    <Switch checked={eyeCare} onChange={toggleEyeCare} />
                  </Form.Item>
                </Form>
              </Card>
            ),
          },
          {
            key: 'ai',
            label: <span><CloudServerOutlined /> AI 引擎</span>,
            children: configLoaded ? (
              <Form layout="vertical" size="small">
                <Card size="small" style={{ marginBottom: 12, background: '#fafafa' }} bordered={false}>
                  <div style={{ fontSize: 12, color: '#909399', marginBottom: 4 }}>选择翻译和知识图谱使用的 AI 引擎</div>
                  <Radio.Group value={mode} onChange={e => setMode(e.target.value)}>
                    <Radio value="local"><Tag color="blue">本地</Tag> NLLB-200 离线翻译 + 规则知识抽取</Radio>
                    <br />
                    <Radio value="remote" style={{ marginTop: 6 }}><Tag color="green">远程</Tag> LLM 翻译 + LLM 知识抽取</Radio>
                  </Radio.Group>
                </Card>

                {mode === 'remote' && (
                  <Card size="small" title={<span><ApiOutlined /> 远程 LLM 配置</span>} style={{ marginBottom: 12 }} bordered={false}>
                    <Form.Item label="厂商">
                      <Select value={provider} onChange={handleProviderChange} style={{ width: 300 }}
                        options={PROVIDER_OPTIONS.map(g => ({
                          label: g.group, options: g.items.map(i => ({ value: i.value, label: i.label }))
                        }))} />
                    </Form.Item>
                    <Form.Item label={<span><ApiOutlined /> 接口地址</span>}>
                      <Input value={apiBase} onChange={e => setApiBase(e.target.value)} placeholder="https://api.openai.com/v1" style={{ width: 420 }} />
                    </Form.Item>
                    <Form.Item label={<span><KeyOutlined /> API Key</span>}>
                      <Input.Password value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." style={{ width: 420 }} />
                    </Form.Item>
                    <Form.Item label={<span><SafetyOutlined /> 模型</span>}>
                      <Input value={model} onChange={e => setModel(e.target.value)} placeholder="gpt-4o-mini" style={{ width: 300 }} />
                    </Form.Item>
                    <Space>
                      <Form.Item label="Max Tokens">
                        <Slider min={256} max={16384} step={256} value={maxTokens} onChange={setMaxTokens} style={{ width: 200 }} />
                      </Form.Item>
                      <Form.Item label="Temperature">
                        <Slider min={0} max={1} step={0.1} value={temperature} onChange={setTemperature} style={{ width: 160 }} />
                      </Form.Item>
                    </Space>
                  </Card>
                )}

                <Form.Item>
                  <Button type="primary" icon={<CloudServerOutlined />} onClick={saveTranslatorConfig}>保存配置</Button>
                  {mode === 'remote' && (
                    <span style={{ fontSize: 11, color: '#909399', marginLeft: 12 }}>
                      远程模式下翻译和知识图谱均使用 LLM
                    </span>
                  )}
                </Form.Item>
              </Form>
            ) : null,
          },
          {
            key: 'data',
            label: <span><DatabaseOutlined /> 数据管理</span>,
            children: (
              <Card size="small" style={{ border: 'none', boxShadow: 'none' }}>
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>备份数据</div>
                      <div style={{ fontSize: 11, color: '#909399' }}>导出全部数据和配置到压缩包</div>
                    </div>
                    <Button size="small" onClick={doBackup}>创建备份</Button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #f0f0f0' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#f56c6c' }}>清除所有数据</div>
                      <div style={{ fontSize: 11, color: '#909399' }}>删除所有书籍、笔记和配置，不可恢复</div>
                    </div>
                    <Button size="small" danger onClick={doReset}>清除</Button>
                  </div>
                </Space>
              </Card>
            ),
          },
        ]}
      />
    </Modal>
  )
}
