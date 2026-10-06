"""
翻译服务 - 通过 OpenAI 兼容 API 调用远程 LLM
"""
import re

# ---------- 翻译指令模板 ----------
TRANSLATE_SYSTEM_PROMPT = """You are a professional translator. Translate the following text from {source_lang} to {target_lang}.
Rules:
- Output ONLY the translation, no explanations, no notes.
- Preserve the original formatting (paragraphs, line breaks).
- If the text is already in {target_lang}, return it as-is."""

# 未配置 AI 引擎时的统一提示
NOT_CONFIGURED_MSG = "尚未配置 AI 引擎，请在「设置 → AI 引擎」中填写接口地址和 API Key"


class TranslatorService:
    """
    翻译服务
    通过 OpenAI 兼容 API 调用外部 LLM（DeepSeek / 通义 / 智谱 / Ollama ...）
    """

    def __init__(self, config=None):
        self._config = config  # TranslatorConfig 对象

        # 语种映射（语言代码 → 中文名称）
        self.LANG_MAP = {
            'zh': '中文',
            'en': '英语',
            'ja': '日语',
            'ko': '韩语',
            'fr': '法语',
            'de': '德语',
            'es': '西班牙语',
            'pt': '葡萄牙语',
            'ru': '俄语',
            'ar': '阿拉伯语',
            'it': '意大利语',
            'nl': '荷兰语',
            'pl': '波兰语',
            'tr': '土耳其语',
            'vi': '越南语',
            'th': '泰语',
            'id': '印尼语',
            'hi': '印地语',
            'ms': '马来语',
            'mn': '蒙古语',
            'auto': '自动检测'
        }

    def _normalize_lang_code(self, lang):
        """将 langdetect 返回的地区码（如 zh-cn）标准化为短码（如 zh）"""
        if not lang:
            return None
        mapping = {
            'zh-cn': 'zh', 'zh-tw': 'zh', 'zh-hk': 'zh', 'zh-sg': 'zh',
            'en-us': 'en', 'en-gb': 'en', 'en-au': 'en', 'en-ca': 'en',
            'pt-br': 'pt', 'pt-pt': 'pt',
            'fr-ca': 'fr', 'fr-fr': 'fr',
            'es-es': 'es', 'es-mx': 'es',
            'de-de': 'de', 'de-at': 'de', 'de-ch': 'de',
        }
        return mapping.get(lang, lang)

    def detect_language(self, text):
        """检测文本语言（使用 langdetect 或简单启发式）"""
        # langdetect 对短文本（<30字符）极不可靠，直接用启发式
        use_langdetect = len(text.strip()) >= 30
        if use_langdetect:
            try:
                from langdetect import detect
                try:
                    lang = self._normalize_lang_code(detect(text[:500]))
                    if lang and lang in self.LANG_MAP:
                        return lang
                except:
                    pass
            except ImportError:
                pass

        # 启发式检测
        zh_chars = len(re.findall(r'[一-鿿]', text))
        ja_chars = len(re.findall(r'[぀-ゟ゠-ヿ]', text))
        ko_chars = len(re.findall(r'[가-힯]', text))

        total = len(text.strip())
        if total == 0:
            return 'en'

        zh_ratio = zh_chars / total
        ja_ratio = ja_chars / total
        ko_ratio = ko_chars / total

        if zh_ratio > 0.1:
            return 'zh'
        if ja_ratio > 0.1:
            return 'ja'
        if ko_ratio > 0.1:
            return 'ko'
        return 'en'

    def is_configured(self, reload=True):
        """
        AI 引擎是否已配置（接口地址 + API Key + 模型名）
        本服务是进程级单例，_config 只在 translate() 里刷新；
        外部（路由）直接调用时要先重新读盘，否则拿到的是启动时的旧配置。
        """
        if reload:
            self._reload_config()
        cfg = self._config
        return bool(cfg and cfg.remote.is_configured)

    def _translate_remote(self, text, source_lang, target_lang):
        """
        通过远程 LLM API 翻译
        返回 (译文, 错误信息)，二者必有其一为 None
        """
        cfg = self._config.remote

        try:
            import openai
        except ImportError:
            return None, "缺少 openai 依赖，请重新安装后端依赖"

        try:
            client = openai.OpenAI(
                base_url=cfg.api_base,
                api_key=cfg.api_key,
                timeout=120,
            )

            src_name = self.LANG_MAP.get(source_lang, source_lang)
            tgt_name = self.LANG_MAP.get(target_lang, target_lang)
            system_prompt = TRANSLATE_SYSTEM_PROMPT.format(source_lang=src_name, target_lang=tgt_name)

            resp = client.chat.completions.create(
                model=cfg.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
                max_tokens=cfg.max_tokens,
                temperature=cfg.temperature,
            )
            translated = (resp.choices[0].message.content or '').strip()
            if not translated:
                return None, "AI 返回了空结果，请检查模型名是否正确"
            return translated, None
        except openai.AuthenticationError:
            return None, "API Key 无效或已过期，请在设置中检查"
        except openai.APIConnectionError:
            return None, f"无法连接到 {cfg.api_base}，请检查接口地址和网络"
        except openai.NotFoundError:
            return None, f"模型「{cfg.model}」不存在或无权访问，请重新选择模型"
        except openai.RateLimitError:
            return None, "请求过于频繁或账户额度不足"
        except openai.APIStatusError as e:
            return None, f"AI 服务返回错误（HTTP {e.status_code}）：{e.message}"
        except Exception as e:
            return None, f"翻译请求失败：{e}"

    def _reload_config(self):
        """重新加载配置（支持设置页面热切换）"""
        try:
            from core.translator_config import load_config
            self._config = load_config()
        except Exception:
            pass

    def translate(self, text, source_lang='auto', target_lang='zh'):
        """翻译单段文本（划词/短文本翻译）"""
        # 每次调用加载最新配置（支持设置页面热切换）
        self._reload_config()

        if not text or not text.strip():
            return {"translated_text": "", "detected_lang": source_lang}

        # 自动检测源语言
        if source_lang == 'auto':
            source_lang = self.detect_language(text)

        # 如果目标语言和源语言相同，直接返回
        if source_lang == target_lang:
            return {"translated_text": text, "detected_lang": source_lang}

        if not self.is_configured(reload=False):
            return {"translated_text": "", "detected_lang": source_lang, "error": NOT_CONFIGURED_MSG}

        translated, error = self._translate_remote(text, source_lang, target_lang)
        if error:
            return {"translated_text": "", "detected_lang": source_lang, "error": error}

        return {"translated_text": translated, "detected_lang": source_lang}

    def translate_long_text(self, text, target_lang='zh', chunk_size=512):
        """
        长文本翻译（全文翻译）
        智能分块处理，保证长文档可翻译且上下文连贯
        """
        if not text or not text.strip():
            return {"segments": [], "full_translation": ""}

        # 未配置时直接返回，避免按块发起上百次注定失败的请求
        self._reload_config()
        if not self.is_configured():
            return {
                "segments": [], "full_translation": "",
                "total_segments": 0, "error": NOT_CONFIGURED_MSG,
            }

        # 检测源语言
        source_lang = self.detect_language(text[:500])

        # 按段落拆分
        paragraphs = text.split('\n')
        chunks = []
        current_chunk = ""

        for para in paragraphs:
            if len(current_chunk) + len(para) < chunk_size * 2:
                current_chunk += para + '\n'
            else:
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                current_chunk = para + '\n'

        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        # 分块翻译
        translated_segments = []
        for i, chunk in enumerate(chunks):
            result = self.translate(chunk, source_lang, target_lang)
            if result.get("error"):
                return {
                    "segments": translated_segments, "full_translation": "",
                    "total_segments": 0, "error": result["error"],
                }
            translated_segments.append({
                "index": i,
                "source": chunk,
                "translation": result.get("translated_text", "")
            })

        full_translation = '\n'.join(
            [s["translation"] for s in translated_segments]
        )

        return {
            "segments": translated_segments,
            "full_translation": full_translation,
            "source_lang": source_lang,
            "target_lang": target_lang,
            "total_segments": len(translated_segments)
        }
