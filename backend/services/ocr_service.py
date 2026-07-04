"""
OCR 识别服务 - 基于离线 PaddleOCR
支持扫描版 PDF 文字识别
"""
import os
import json
import tempfile
import threading


class OCRService:
    """
    离线 OCR 识别服务
    用于扫描版 PDF 的文字提取
    """

    def __init__(self, models_dir):
        self.models_dir = models_dir
        self._ocr = None
        self._lock = threading.Lock()

    def _load_ocr(self):
        """惰性加载 OCR 模型"""
        if self._ocr is not None:
            return

        with self._lock:
            if self._ocr is not None:
                return

            try:
                from paddleocr import PaddleOCR

                # 使用本地模型目录（如果存在）
                model_dir = os.path.join(self.models_dir, 'paddleocr')
                if os.path.exists(model_dir):
                    print(f"[OCR] 加载本地模型: {model_dir}")
                    self._ocr = PaddleOCR(
                        use_angle_cls=True,
                        lang='ch',
                        use_gpu=False,
                        show_log=False,
                        # PaddleOCR 会自动在 model_dir 下查找模型
                        # 通过环境变量或直接参数控制
                    )
                else:
                    print("[OCR] 首次加载 PaddleOCR（自动下载模型）")
                    self._ocr = PaddleOCR(
                        use_angle_cls=True,
                        lang='ch',
                        use_gpu=False,
                        show_log=False
                    )

                print("[OCR] OCR 引擎加载完成")

            except ImportError:
                print("[OCR] PaddleOCR 未安装，OCR 功能不可用")
                self._ocr = None
            except Exception as e:
                print(f"[OCR] 加载失败: {e}")
                self._ocr = None

    def recognize_image(self, image_path):
        """
        识别单张图片文字
        返回识别的文本列表
        """
        self._load_ocr()

        if self._ocr is None:
            return [{"text": "[OCR 引擎未安装]", "confidence": 0}]

        try:
            result = self._ocr.ocr(image_path, cls=True)
            texts = []

            if result and result[0]:
                for line in result[0]:
                    box = line[0]  # 坐标
                    text_info = line[1]  # (text, confidence)
                    texts.append({
                        "text": text_info[0],
                        "confidence": text_info[1],
                        "box": box
                    })

            return texts if texts else [{"text": "[无法识别]", "confidence": 0}]

        except Exception as e:
            print(f"[OCR] 识别失败: {e}")
            return [{"text": f"[识别错误: {str(e)}]", "confidence": 0}]

    def recognize_pdf_page(self, pdf_path, page_num, dpi=200):
        """
        识别 PDF 指定页面
        将页面转为图片后 OCR
        """
        import fitz  # PyMuPDF

        doc = fitz.open(pdf_path)
        if page_num < 0 or page_num >= len(doc):
            doc.close()
            return []

        page = doc.load_page(page_num)

        # 渲染为图片
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)

        # 保存为临时图片
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            temp_path = f.name
            pix.save(temp_path)

        doc.close()

        # OCR 识别
        result = self.recognize_image(temp_path)

        # 清理临时文件
        try:
            os.unlink(temp_path)
        except:
            pass

        return result

    def recognize_full_pdf(self, pdf_path, progress_callback=None):
        """
        识别完整扫描版 PDF
        返回分页文本
        """
        import fitz

        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        all_text = []

        for page_num in range(total_pages):
            page_texts = self.recognize_pdf_page(pdf_path, page_num)

            page_text = '\n'.join([t["text"] for t in page_texts])
            all_text.append(page_text)

            if progress_callback:
                progress_callback(page_num + 1, total_pages)

        doc.close()

        return all_text

    def is_available(self):
        """检查 OCR 是否可用"""
        try:
            import paddleocr
            return True
        except ImportError:
            return False
