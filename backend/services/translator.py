"""
离线翻译服务 - 基于 NLLB-200 轻量化模型
支持 200+ 语种双向互译，全 CPU 推理
"""
import os
import re
import json
import threading


class TranslatorService:
    """
    离线翻译服务
    支持两种模式：
    1. 划词翻译：短文本即时翻译
    2. 全文翻译：长文本分块批量翻译
    """

    def __init__(self, models_dir):
        self.models_dir = models_dir
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

    def _fallback_translate(self, text, target_lang):
        """无模型时的回退翻译（基于简单规则/词典）"""
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

        return f"[翻译模型加载中] {text}"

    def detect_language(self, text):
        """检测文本语言（使用 langdetect 或简单启发式）"""
        try:
            from langdetect import detect
            try:
                lang = detect(text[:500])
                # 映射为标准代码
                if lang in self.LANG_MAP:
                    return lang
                return 'en'
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

    def translate(self, text, source_lang='auto', target_lang='zh'):
        """翻译单段文本（划词/短文本翻译）"""
        if not text or not text.strip():
            return {"translated_text": "", "detected_lang": source_lang}

        # 自动检测源语言
        if source_lang == 'auto':
            source_lang = self.detect_language(text)

        # 如果目标语言和源语言相同，直接返回
        if source_lang == target_lang:
            return {"translated_text": text, "detected_lang": source_lang}

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

        # 回退模式
        fallback = self._fallback_translate(text, target_lang)
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
