"""
TTS 语音合成服务 - 使用 macOS 内置 TTS (say 命令)
"""
import os
import subprocess
import tempfile
import wave
import threading


class TTSService:
    """语音合成服务"""

    def __init__(self):
        self._lock = threading.Lock()

    def get_voices(self):
        """获取可用语音列表"""
        try:
            result = subprocess.run(['say', '-v', '?'], capture_output=True, text=True, timeout=5)
            voices = []
            for line in result.stdout.strip().split('\n'):
                parts = line.split(maxsplit=1)
                if len(parts) >= 2:
                    voices.append({"name": parts[0], "lang": parts[1]})
            return voices
        except Exception as e:
            print(f"[TTS] 获取语音列表失败: {e}")
            return [{"name": "Tingting", "lang": "zh_CN"}, {"name": "Samantha", "lang": "en_US"}]

    def synthesize(self, text, voice='Tingting'):
        """合成语音，返回 WAV 音频数据"""
        if not text or not text.strip():
            return None

        try:
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                wav_path = f.name

            # macOS say → AIFF → afconvert → WAV
            with tempfile.NamedTemporaryFile(suffix='.aiff', delete=False) as f:
                aiff_path = f.name

            subprocess.run(
                ['say', '-v', voice, '-o', aiff_path, text],
                check=True, timeout=30
            )

            # afconvert: AIFF-C → WAVE PCM
            subprocess.run(
                ['afconvert', '-f', 'WAVE', '-d', 'LEI16@44100', aiff_path, wav_path],
                check=True, timeout=10, capture_output=True
            )

            with open(wav_path, 'rb') as f:
                audio_data = f.read()

            os.unlink(aiff_path)
            os.unlink(wav_path)
            return audio_data

        except subprocess.TimeoutExpired:
            print(f"[TTS] 合成超时")
            return None
        except Exception as e:
            print(f"[TTS] 合成失败: {e}")
            return None
