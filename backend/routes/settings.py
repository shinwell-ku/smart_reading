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

    if 'mode' in data:
        cfg.mode = data['mode']

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
