"""
翻译服务 - 支持本地 NLLB 模型 / 远程 LLM API
"""
import os
import re
import json
import threading

# ---------- 翻译指令模板 ----------
TRANSLATE_SYSTEM_PROMPT = """You are a professional translator. Translate the following text from {source_lang} to {target_lang}.
Rules:
- Output ONLY the translation, no explanations, no notes.
- Preserve the original formatting (paragraphs, line breaks).
- If the text is already in {target_lang}, return it as-is."""


class TranslatorService:
    """
    翻译服务
    支持两种模式：
    1. 本地模式：NLLB-200 离线模型
    2. 远程模式：通过 OpenAI 兼容 API 调用外部 LLM
    """

    def __init__(self, models_dir, config=None):
        self.models_dir = models_dir
        self._config = config  # TranslatorConfig 对象
        self._model = None
        self._tokenizer = None
        self._lock = threading.Lock()

        # 语种映射（NLLB 标准代码 → 中文名称）
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
            'auto': '自动检测'
        }

        # NLLB 语言代码映射
        self.NLLB_LANG_CODES = {
            'zh': 'zho_Hans',
            'en': 'eng_Latn',
            'ja': 'jpn_Jpan',
            'ko': 'kor_Hang',
            'fr': 'fra_Latn',
            'de': 'deu_Latn',
            'es': 'spa_Latn',
            'pt': 'por_Latn',
            'ru': 'rus_Cyrl',
            'ar': 'arb_Arab',
            'it': 'ita_Latn',
            'nl': 'nld_Latn',
            'pl': 'pol_Latn',
            'tr': 'tur_Latn',
            'vi': 'vie_Latn',
            'th': 'tha_Thai',
            'id': 'ind_Latn',
            'hi': 'hin_Deva',
        }

    def _load_model(self):
        """惰性加载翻译模型（纯本地模式，禁止联网下载）"""
        if self._model is not None:
            return

        with self._lock:
            if self._model is not None:
                return

            try:
                from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
                import torch

                # 只检查本地量化模型目录，禁止自动从 HuggingFace 下载
                local_model_path = os.path.join(self.models_dir, 'nllb200_4bit')
                if os.path.exists(local_model_path):
                    print(f"[翻译] 加载本地量化模型: {local_model_path}")
                    self._tokenizer = AutoTokenizer.from_pretrained(
                        local_model_path,
                        local_files_only=True,
                        trust_remote_code=True
                    )
                    self._model = AutoModelForSeq2SeqLM.from_pretrained(
                        local_model_path,
                        local_files_only=True,
                        torch_dtype=torch.float32,
                        trust_remote_code=True
                    )
                    self._model.eval()
                    print(f"[翻译] 模型加载完成")
                else:
                    print(f"[翻译] 未找到本地模型: {local_model_path}")
                    print(f"[翻译] 请下载 NLLB-200 量化模型至: {local_model_path}")
                    print(f"[翻译] 将使用回退翻译模式")
                    self._model = None
                    self._tokenizer = None

            except Exception as e:
                print(f"[翻译] 模型加载失败: {e}，使用回退模式")
                self._model = None
                self._tokenizer = None

    def _fallback_translate(self, text, target_lang, model_loaded=False):
        """无模型时的回退翻译（基于简单规则/词典）"""

        def _no_model_msg(tgt):
            tn = self.LANG_MAP.get(tgt, tgt)
            return (f"[模型未下载] AI 翻译模型 (NLLB-200) 未加载，"
                    f"无法翻译为{tn}。\n"
                    f"请运行以下命令下载模型：\n"
                    f"  uv run python scripts/download_models.py nllb200_4bit")

        def _model_error_msg(tgt):
            tn = self.LANG_MAP.get(tgt, tgt)
            return (f"[翻译失败] AI 模型加载或推理出错，无法翻译为{tn}。"
                    f"请尝试重新下载模型或查看后端日志。")
        # 简单的中英文对照回退
        fallback_dict = {
            'zh': {
                'hello': '你好',
                'world': '世界',
                'book': '书籍',
                'reading': '阅读',
                'AI': '人工智能',
                'knowledge': '知识',
            }
        }

        if target_lang == 'zh':
            translated = text
            for en, zh in fallback_dict.get('zh', {}).items():
                translated = translated.replace(en, zh)
            return f"[离线模式] {translated}"

        if model_loaded:
            return _model_error_msg(target_lang)
        return _no_model_msg(target_lang)

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

        if zh_ratio > 0.3:
            return 'zh'
        if ja_ratio > 0.2:
            return 'ja'
        if ko_ratio > 0.2:
            return 'ko'
        return 'en'

    def _translate_remote(self, text, source_lang, target_lang):
        """通过远程 LLM API 翻译"""
        cfg = self._config
        if not cfg or cfg.mode != 'remote' or not cfg.remote.api_base or not cfg.remote.api_key:
            return None

        try:
            from openai import OpenAI

            client = OpenAI(
                base_url=cfg.remote.api_base,
                api_key=cfg.remote.api_key,
            )

            src_name = self.LANG_MAP.get(source_lang, source_lang)
            tgt_name = self.LANG_MAP.get(target_lang, target_lang)
            system_prompt = TRANSLATE_SYSTEM_PROMPT.format(source_lang=src_name, target_lang=tgt_name)

            resp = client.chat.completions.create(
                model=cfg.remote.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
                max_tokens=cfg.remote.max_tokens,
                temperature=cfg.remote.temperature,
            )
            translated = resp.choices[0].message.content.strip()
            return translated
        except Exception as e:
            print(f"[翻译] 远程 API 调用失败: {e}")
            return None

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

        # 远程模式优先
        if self._config and self._config.mode == 'remote':
            translated = self._translate_remote(text, source_lang, target_lang)
            if translated:
                return {"translated_text": translated, "detected_lang": source_lang}
            print("[翻译] 远程翻译失败，回退本地模式")

        # 尝试加载模型翻译
        try:
            self._load_model()

            if self._model is not None and self._tokenizer is not None:
                import torch
                src_code = self.NLLB_LANG_CODES.get(source_lang, 'eng_Latn')
                tgt_code = self.NLLB_LANG_CODES.get(target_lang, 'zho_Hans')

                self._tokenizer.src_lang = src_code
                inputs = self._tokenizer(text, return_tensors="pt", truncation=True, max_length=512)

                with torch.no_grad():
                    outputs = self._model.generate(
                        **inputs,
                        forced_bos_token_id=self._tokenizer.convert_tokens_to_ids(tgt_code),
                        max_length=512,
                        num_beams=3
                    )

                translated = self._tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
                return {"translated_text": translated, "detected_lang": source_lang}

        except Exception as e:
            print(f"[翻译] 模型推理失败: {e}")

        # 回退模式（区分模型是否加载过）
        model_loaded = self._model is not None and self._tokenizer is not None
        fallback = self._fallback_translate(text, target_lang, model_loaded=model_loaded)
        return {"translated_text": fallback, "detected_lang": source_lang}

    def translate_long_text(self, text, target_lang='zh', chunk_size=512):
        """
        长文本翻译（全文翻译）
        智能分块处理，保证长文档可翻译且上下文连贯
        """
        if not text or not text.strip():
            return {"segments": [], "full_translation": ""}

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

    def optimize_translation(self, text, domain='general'):
        """
        翻译优化：专业术语优化、长句断句
        """
        # 领域术语词典
        domain_terms = {
            'general': {},
            'computer': {
                'API': '应用程序接口',
                'algorithm': '算法',
                'database': '数据库',
                'server': '服务器',
                'neural': '神经',
                'network': '网络',
            },
            'science': {
                'hypothesis': '假设',
                'experiment': '实验',
                'theory': '理论',
                'analysis': '分析',
            }
        }

        terms = domain_terms.get(domain, domain_terms['general'])
        optimized = text
        for en, zh in terms.items():
            optimized = optimized.replace(en, zh)

        return optimized
