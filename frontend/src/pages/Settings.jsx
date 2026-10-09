import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Button, message, Modal, Switch, Slider, Select, Input, Form, Space, AutoComplete, Divider, Skeleton } from 'antd'
import { SettingOutlined, CloudServerOutlined, DatabaseOutlined, ReadOutlined, ReloadOutlined, FolderOpenOutlined, SoundOutlined, GlobalOutlined } from '@ant-design/icons'
import { loadVoices, readTtsPrefs, writeTtsPrefs, pickVoice, isSupported as ttsSupported } from '../useSpeech'
import { useI18n, LANGS } from '../i18n'

// label 存 i18n key 不存译文 —— t() 只能在渲染路径里调，这里存成常量
// 的话切语言不会更新。
const PROVIDER_OPTIONS = [
  { group: 'settings.ai.group.cn',
    items: [
      { value: 'deepseek',    label: 'settings.provider.deepseek',    base: 'https://api.deepseek.com',                        model: 'deepseek-chat' },
      { value: 'siliconflow', label: 'settings.provider.siliconflow', base: 'https://api.siliconflow.cn/v1',                   model: 'Qwen/Qwen2.5-7B-Instruct' },
      { value: 'moonshot',    label: 'settings.provider.moonshot',    base: 'https://api.moonshot.cn/v1',                      model: 'moonshot-v1-8k' },
      { value: 'zhipu',       label: 'settings.provider.zhipu',       base: 'https://open.bigmodel.cn/api/paas/v4',            model: 'glm-4-flash' },
      { value: 'qwen',        label: 'settings.provider.qwen',        base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
      { value: 'doubao',      label: 'settings.provider.doubao',      base: 'https://ark.cn-beijing.volces.com/api/v3',        model: 'doubao-pro-32k' },
      { value: 'spark',       label: 'settings.provider.spark',       base: 'https://spark-api-open.xf-yun.com/v1',            model: 'lite' },
    ] },
  { group: 'settings.ai.group.intl',
    items: [
      { value: 'openai',      label: 'settings.provider.openai',      base: 'https://api.openai.com/v1',                       model: 'gpt-4o-mini' },
      { value: 'anthropic',   label: 'settings.provider.anthropic',   base: 'https://api.anthropic.com/v1',                    model: 'claude-sonnet-4-20250514' },
      { value: 'google',      label: 'settings.provider.google',      base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
      { value: 'xai',         label: 'settings.provider.xai',         base: 'https://api.x.ai/v1',                             model: 'grok-2' },
    ] },
  { group: 'settings.ai.group.local',
    items: [
      { value: 'ollama',      label: 'settings.provider.ollama',      base: 'http://localhost:11434/v1',                       model: 'llama3' },
      { value: 'custom',      label: 'settings.provider.custom',      base: '',                                                 model: '' },
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
  const { lang, t, setLang, langName } = useI18n()
  const [eyeCare, setEyeCare] = useState(localStorage.getItem('sr_eyeCare') === 'true')

  // ── 朗读偏好（存 localStorage，跟前后的 sr_* 一个路子）──
  const [ttsPrefs, setTtsPrefs] = useState(readTtsPrefs)
  const [ttsVoices, setTtsVoices] = useState([])
  const updateTts = patch => setTtsPrefs(writeTtsPrefs(patch))
  useEffect(() => { if (open) loadVoices().then(setTtsVoices) }, [open])
  // 按语言排一下，中文语音排前面，方便找
  const voiceOptions = ttsVoices
    .slice()
    .sort((a, b) => {
      const az = a.lang.toLowerCase().startsWith(ttsPrefs.lang) ? 0 : 1
      const bz = b.lang.toLowerCase().startsWith(ttsPrefs.lang) ? 0 : 1
      return az - bz || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name)
    })
    .map(v => ({ value: v.voiceURI, label: `${v.name} · ${v.lang}${v.localService ? '' : t('settings.tts.voice.online')}` }))
  const noVoiceHint = ttsSupported && ttsVoices.length > 0 && !pickVoice(ttsVoices, ttsPrefs.lang)

  const [provider, setProvider] = useState('openai')
  const [apiBase, setApiBase] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [maxTokens, setMaxTokens] = useState(4096)
  const [temperature, setTemperature] = useState(0.3)
  const [configLoaded, setConfigLoaded] = useState(false)

  const [modelOptions, setModelOptions] = useState([])
  // 模型下拉的展开状态 + 展开那一刻输入框里的值。
  // AutoComplete 默认只在输入时才弹，而且会拿输入框里的现值去过滤选项 ——
  // 配好模型（如 deepseek-chat）后再点开，列表被过滤得只剩一条，看着不像
  // 下拉框。所以这里自己控制展开，并区分「刚点开」和「已经在搜」两种状态。
  const [modelOpen, setModelOpen] = useState(false)
  const modelAtOpen = useRef('')
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
      message.success(t('settings.ai.saved'))
    } catch { message.error(t('settings.ai.saveFailed')) }
  }

  // 拉取厂商可用模型列表（OpenAI 兼容的 GET /models）
  const loadModels = async () => {
    if (!apiBase.trim()) { message.warning(t('settings.ai.needBase')); return }
    if (!apiKey.trim()) { message.warning(t('settings.ai.needKey')); return }
    setLoadingModels(true)
    try {
      const r = await api.fetchModels({ api_base: apiBase.trim(), api_key: apiKey.trim() })
      if (r.error) { message.error(r.error); return }
      const list = r.models || []
      setModelOptions(list)
      if (list.length) {
        message.success(t('settings.ai.modelsGot', { n: list.length }))
        // 拉到了就直接摊开，省得用户再去点一下输入框
        modelAtOpen.current = model
        setModelOpen(true)
      }
      else message.warning(t('settings.ai.noModels'))
    } catch (e) {
      message.error(t('settings.ai.listFailed', { msg: e.message || t('err.NETWORK') }))
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
      title: t('settings.backup.dialogTitle'),
      defaultPath: t('settings.backup.fileName', { stamp }),
      filters: [{ name: t('settings.backup.fileType'), extensions: ['zip'] }],
    })
    if (picked.canceled || !picked.filePath) return

    setBackingUp(true)
    try {
      const r = await api.backup(picked.filePath)
      if (r.error) { message.error(r.error); return }
      setLastBackup(r.path)
      message.success(t('settings.backup.ok', { mb: (r.size / 1024 / 1024).toFixed(1) }))
    } catch (e) {
      message.error(t('settings.backup.failed', { msg: e.message || t('err.UNKNOWN') }))
    } finally {
      setBackingUp(false)
    }
  }

  // 从备份包恢复（整体替换）
  const doRestore = async () => {
    const picked = await window.electronAPI.openFileDialog({
      title: t('settings.restore.dialogTitle'),
      filters: [{ name: t('settings.backup.fileType'), extensions: ['zip'] }],
      properties: ['openFile'],
    })
    if (picked.canceled || !picked.filePaths?.length) return
    const src = picked.filePaths[0]

    Modal.confirm({
      title: t('settings.restore.confirmTitle'),
      content: (
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div style={{ marginBottom: 6, wordBreak: 'break-all', color: '#909399' }}>{src}</div>
          <div style={{ color: '#f56c6c', fontWeight: 500 }}>
            {t('settings.restore.confirmBody')}
          </div>
        </div>
      ),
      okText: t('settings.restore.ok'), cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        setRestoring(true)
        try {
          const r = await api.restoreBackup(src)
          if (r.error) { message.error(r.error); return }
          // 三个数量各自可能要复数（英文），所以在各自的量词条目里处理，
          // 外层只负责把它们拼进整句
          message.success(t('settings.restore.okMsg', {
            books: t('unit.book', { count: r.book_count }),
            notes: t('unit.note', { count: r.note_count }),
            bookmarks: t('unit.bookmark', { count: r.bookmark_count }),
          }))
          setTimeout(() => window.location.reload(), 1200)
        } catch (e) {
          message.error(t('settings.restore.failed', { msg: e.message || t('err.UNKNOWN') }))
        } finally {
          setRestoring(false)
        }
      },
    })
  }

  const doReset = () => {
    Modal.confirm({
      title: t('settings.reset.title'),
      content: t('settings.reset.body'),
      okText: t('common.ok'), cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => Modal.confirm({
        title: t('settings.reset.title2'),
        content: t('settings.reset.body2'),
        okText: t('common.ok'), cancelText: t('common.cancel'),
        okButtonProps: { danger: true },
        onOk: async () => { await api.clearAllData(); message.success(t('settings.reset.done')); window.location.reload() }
      })
    })
  }

  return (
    <Modal
      title={<span><SettingOutlined style={{ marginRight: 8 }} />{t('settings.title')}</span>}
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
          <SectionTitle icon={<GlobalOutlined />}>{t('settings.section.general')}</SectionTitle>

          <Form.Item label={t('settings.language.label')} tooltip={t('settings.language.tooltip')}>
            <Select value={lang} onChange={setLang} style={FIELD_W}
              options={LANGS.map(l => ({ value: l.value, label: l.label }))} />
          </Form.Item>

          <SectionTitle icon={<ReadOutlined />}>{t('settings.section.reading')}</SectionTitle>

          <Form.Item label={t('settings.eyeCare.label')} tooltip={t('settings.eyeCare.tooltip')}>
            <Switch checked={eyeCare} onChange={toggleEyeCare} />
          </Form.Item>

          <SectionTitle icon={<SoundOutlined />}>{t('settings.section.tts')}</SectionTitle>

          {!ttsSupported ? (
            <Form.Item label=" " colon={false}>
              <span style={{ color: '#e6a23c', fontSize: 12 }}>{t('settings.tts.unsupported')}</span>
            </Form.Item>
          ) : (
            <>
              <Form.Item
                label={t('settings.tts.voice')}
                tooltip={t('settings.tts.voice.tooltip')}
              >
                <Select
                  showSearch allowClear style={FIELD_W}
                  value={ttsPrefs.voiceURI || undefined}
                  placeholder={t('settings.tts.voice.placeholder', { n: ttsVoices.length })}
                  options={voiceOptions}
                  optionFilterProp="label"
                  onChange={uri => {
                    const v = ttsVoices.find(x => x.voiceURI === uri)
                    updateTts({ voiceURI: uri || '', lang: v ? v.lang.split('-')[0].toLowerCase() : ttsPrefs.lang })
                  }}
                />
              </Form.Item>

              <Form.Item label={t('settings.tts.rate')} tooltip={t('settings.tts.rate.tooltip')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: FIELD_W }}>
                  <Slider min={0.5} max={2} step={0.1} value={ttsPrefs.rate}
                          onChange={v => updateTts({ rate: v })} style={{ flex: 1, margin: 0 }} />
                  <span style={{ fontSize: 12, color: '#909399', width: 32 }}>{ttsPrefs.rate.toFixed(1)}×</span>
                </div>
              </Form.Item>

              {noVoiceHint && (
                <Form.Item label=" " colon={false}>
                  <span style={{ color: '#e6a23c', fontSize: 12 }}>
                    {t('settings.tts.noVoice', { lang: langName(ttsPrefs.lang) })}
                  </span>
                </Form.Item>
              )}
            </>
          )}

          <SectionTitle icon={<CloudServerOutlined />}>{t('settings.section.ai')}</SectionTitle>

          <Form.Item label={t('settings.ai.provider')} tooltip={t('settings.ai.provider.tooltip')}>
            <Select value={provider} onChange={handleProviderChange} style={FIELD_W}
              options={PROVIDER_OPTIONS.map(g => ({
                label: t(g.group), options: g.items.map(i => ({ value: i.value, label: t(i.label) }))
              }))} />
          </Form.Item>

          <Form.Item label={t('settings.ai.base')}>
            <Input value={apiBase} onChange={e => setApiBase(e.target.value)}
              placeholder="https://api.openai.com/v1" style={FIELD_W} />
          </Form.Item>

          <Form.Item label={t('settings.ai.key')}>
            <Input.Password value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..." style={FIELD_W} />
          </Form.Item>

          <Form.Item label={t('settings.ai.model')} tooltip={t('settings.ai.model.tooltip')}>
            <div style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
              <AutoComplete
                value={model}
                onChange={setModel}
                options={modelOptions.map(m => ({ value: m }))}
                placeholder="gpt-4o-mini"
                allowClear
                style={{ flex: 1 }}
                open={modelOpen}
                onDropdownVisibleChange={setModelOpen}
                onFocus={() => { modelAtOpen.current = model; setModelOpen(true) }}
                onSelect={() => setModelOpen(false)}
                filterOption={(input, option) =>
                  // 输入框里还是点开时那个值 → 用户没在搜，给完整列表
                  input === modelAtOpen.current
                  || option.value.toLowerCase().includes(input.toLowerCase())}
              />
              <Button icon={<ReloadOutlined />} loading={loadingModels} onClick={loadModels}>
                {t('settings.ai.getModels')}
              </Button>
            </div>
          </Form.Item>

          <Form.Item label={t('settings.ai.maxTokens')} tooltip={t('settings.ai.maxTokens.tooltip')}>
            <SliderWithValue min={256} max={16384} step={256}
              value={maxTokens} onChange={setMaxTokens} />
          </Form.Item>

          <Form.Item label={t('settings.ai.temperature')} tooltip={t('settings.ai.temperature.tooltip')}>
            <SliderWithValue min={0} max={1} step={0.1}
              value={temperature} onChange={setTemperature} />
          </Form.Item>

          <Form.Item wrapperCol={{ span: WRAPPER_COL.span, offset: LABEL_COL.span }}>
            <Button type="primary" icon={<CloudServerOutlined />} onClick={saveTranslatorConfig}>
              {t('settings.ai.save')}
            </Button>
          </Form.Item>

          <SectionTitle icon={<DatabaseOutlined />}>{t('settings.section.data')}</SectionTitle>

          <Form.Item label={t('settings.backup.label')} tooltip={t('settings.backup.tooltip')}>
            <Space>
              <Button loading={backingUp} onClick={doBackup}>{t('settings.backup.export')}</Button>
              {lastBackup && (
                <Button type="link" icon={<FolderOpenOutlined />}
                  onClick={() => window.electronAPI.showInFolder(lastBackup)}>
                  {t('settings.backup.openFolder')}
                </Button>
              )}
            </Space>
          </Form.Item>

          <Form.Item label={t('settings.restore.label')} tooltip={t('settings.restore.tooltip')}>
            <Button loading={restoring} onClick={doRestore}>{t('settings.restore.import')}</Button>
          </Form.Item>

          <Form.Item label={t('settings.reset.label')} tooltip={t('settings.reset.tooltip')}>
            <Button danger onClick={doReset}>{t('settings.reset.button')}</Button>
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
