"""
翻译模型配置 — 本地/远程模式切换
"""
import os
import json
from typing import Optional
from pydantic import BaseModel

CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'data', 'config')
CONFIG_PATH = os.path.join(CONFIG_DIR, 'translator.json')


class RemoteConfig(BaseModel):
    """远程 LLM 配置"""
    provider: str = 'openai'       # 见 PROVIDER_PRESETS 的 key
    api_base: str = 'https://api.openai.com/v1'
    api_key: str = ''
    model: str = 'gpt-4o-mini'
    max_tokens: int = 4096
    temperature: float = 0.3


class TranslatorConfig(BaseModel):
    """翻译模型总配置"""
    mode: str = 'local'            # local | remote
    remote: RemoteConfig = RemoteConfig()


# 厂商预设（OpenAI 兼容 API）
PROVIDER_PRESETS = {
    # ---- 国际 ----
    'openai':       {'api_base': 'https://api.openai.com/v1',              'model': 'gpt-4o-mini'},
    'anthropic':    {'api_base': 'https://api.anthropic.com/v1',           'model': 'claude-sonnet-4-20250514'},
    'google':       {'api_base': 'https://generativelanguage.googleapis.com/v1beta/openai', 'model': 'gemini-2.0-flash'},
    'deepseek':     {'api_base': 'https://api.deepseek.com',               'model': 'deepseek-chat'},
    'xai':          {'api_base': 'https://api.x.ai/v1',                    'model': 'grok-2'},
    # ---- 国内 ----
    'siliconflow':  {'api_base': 'https://api.siliconflow.cn/v1',          'model': 'Qwen/Qwen2.5-7B-Instruct'},
    'moonshot':     {'api_base': 'https://api.moonshot.cn/v1',             'model': 'moonshot-v1-8k'},
    'zhipu':        {'api_base': 'https://open.bigmodel.cn/api/paas/v4',   'model': 'glm-4-flash'},
    'qwen':         {'api_base': 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'model': 'qwen-plus'},
    'doubao':       {'api_base': 'https://ark.cn-beijing.volces.com/api/v3', 'model': 'doubao-pro-32k'},
    'spark':        {'api_base': 'https://spark-api-open.xf-yun.com/v1',   'model': 'lite'},
    'ollama':       {'api_base': 'http://localhost:11434/v1',              'model': 'llama3'},
    'custom':       {'api_base': '',                                        'model': ''},
}


def load_config() -> TranslatorConfig:
    """从 JSON 文件加载配置"""
    if not os.path.exists(CONFIG_PATH):
        return TranslatorConfig()
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return TranslatorConfig(**data)
    except Exception:
        return TranslatorConfig()


def save_config(cfg: TranslatorConfig) -> TranslatorConfig:
    """保存配置到 JSON 文件"""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(cfg.model_dump(), f, ensure_ascii=False, indent=2)
    return cfg
