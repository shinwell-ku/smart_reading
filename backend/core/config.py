"""
AI智慧阅读 - 全局配置与服务容器
"""
import os
import threading

# ============================================================
# 路径配置
# ============================================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
ROOT_DIR = os.path.dirname(BASE_DIR)  # 项目根 (smart_reading/)

DATA_DIR = os.path.join(ROOT_DIR, 'data')
BOOKS_DIR = os.path.join(DATA_DIR, 'books')
EXPORTS_DIR = os.path.join(DATA_DIR, 'exports')
CACHE_DIR = os.path.join(DATA_DIR, 'cache')
MODELS_DIR = os.path.join(DATA_DIR, 'models')
DB_DIR = os.path.join(DATA_DIR, 'db')

for d in [DATA_DIR, BOOKS_DIR, EXPORTS_DIR, CACHE_DIR, MODELS_DIR, DB_DIR]:
    os.makedirs(d, exist_ok=True)

# ============================================================
# 服务容器（惰性加载 + 线程安全）
# ============================================================
_services = {}
_service_lock = threading.Lock()


def _get_service(name, factory):
    """线程安全的服务单例获取"""
    if name not in _services:
        with _service_lock:
            if name not in _services:
                _services[name] = factory()
    return _services[name]


def get_doc_parser():
    from services.document_parser import DocumentParser
    return _get_service('doc_parser', DocumentParser)


def get_translator():
    from services.translator import TranslatorService
    from core.translator_config import load_config
    cfg = load_config()
    return _get_service('translator', lambda: TranslatorService(MODELS_DIR, config=cfg))


def get_knowledge_extractor():
    from services.knowledge_extractor import KnowledgeExtractor
    return _get_service('knowledge_extractor', KnowledgeExtractor)


def get_ocr_service():
    from services.ocr_service import OCRService
    return _get_service('ocr_service', lambda: OCRService(MODELS_DIR))
