"""
设置路由 — 翻译模型配置
"""
from flask import Blueprint, jsonify, request
from core.translator_config import load_config, save_config, PROVIDER_PRESETS

settings_bp = Blueprint('settings', __name__, url_prefix='/api/settings')


@settings_bp.route('/translator', methods=['GET'])
def get_translator_config():
    cfg = load_config()
    return jsonify(cfg.model_dump())


@settings_bp.route('/translator', methods=['PUT'])
def update_translator_config():
    data = request.json
    cfg = load_config()

    if 'remote' in data:
        remote = data['remote']
        if 'provider' in remote:
            cfg.remote.provider = remote['provider']
            # 切换厂商时自动填入预设
            preset = PROVIDER_PRESETS.get(remote['provider'])
            if preset:
                cfg.remote.api_base = remote.get('api_base', preset['api_base']) or preset['api_base']
                cfg.remote.model = remote.get('model', preset['model']) or preset['model']
        for key in ('api_base', 'api_key', 'model', 'max_tokens', 'temperature'):
            if key in remote:
                setattr(cfg.remote, key, remote[key])

    save_config(cfg)
    return jsonify(cfg.model_dump())


@settings_bp.route('/translator/presets', methods=['GET'])
def get_provider_presets():
    return jsonify(PROVIDER_PRESETS)


@settings_bp.route('/translator/models', methods=['POST'])
def list_models():
    """
    拉取厂商可用模型列表（OpenAI 兼容的 GET /models）
    用 POST 是为了支持"填了但还没保存"的接口地址和 Key
    """
    data = request.json or {}
    cfg = load_config().remote

    api_base = (data.get('api_base') or cfg.api_base or '').strip()
    api_key = (data.get('api_key') or cfg.api_key or '').strip()

    if not api_base:
        return jsonify({"error": "请先填写接口地址"}), 400
    if not api_key:
        return jsonify({"error": "请先填写 API Key"}), 400

    try:
        from openai import OpenAI
    except ImportError:
        return jsonify({"error": "缺少 openai 依赖，请重新安装后端依赖"}), 500

    try:
        client = OpenAI(base_url=api_base, api_key=api_key, timeout=15)
        models = sorted(m.id for m in client.models.list().data if getattr(m, 'id', None))
        if not models:
            return jsonify({"error": "该接口未返回任何模型"}), 502
        return jsonify({"models": models})
    except Exception as e:
        return jsonify({"error": f"获取模型列表失败：{e}"}), 502
