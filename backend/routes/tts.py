"""
TTS 路由 — 语音合成
"""
from flask import Blueprint, jsonify, request, Response
from core.config import _get_service

tts_bp = Blueprint('tts', __name__, url_prefix='/api/tts')


def get_tts():
    from services.tts_service import TTSService
    return _get_service('tts', TTSService)


@tts_bp.route('/voices', methods=['GET'])
def list_voices():
    tts = get_tts()
    return jsonify({"voices": tts.get_voices()})


@tts_bp.route('', methods=['POST'])
def synthesize():
    data = request.json or {}
    text = data.get('text', '')
    voice = data.get('voice', 'Tingting')
    if not text.strip():
        return jsonify({"error": "文本不能为空"}), 400

    tts = get_tts()
    audio = tts.synthesize(text, voice)
    if audio is None:
        return jsonify({"error": "语音合成失败"}), 500

    return Response(audio, mimetype='audio/wav')
