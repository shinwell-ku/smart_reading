"""
翻译路由 — 划词翻译 / 全文翻译 / 生词管理
"""
import os
import json
import threading
from datetime import datetime
from flask import Blueprint, jsonify, request
from core.database import get_db
from core.config import CACHE_DIR
from core.config import get_translator
from models import TranslationRecord, Vocabulary, Book
from services.translator import NOT_CONFIGURED_ERR
from schemas import (
    TranslateRequest, TranslateResponse, FullTranslateRequest,
    TranslationStatusResponse, WordCreate, WordResponse, WordListResponse,
)

translation_bp = Blueprint('translation', __name__, url_prefix='/api/translate')


@translation_bp.route('', methods=['POST'])
def translate_text():
    data = TranslateRequest(**request.json)
    if not data.text.strip():
        return jsonify({"error": "翻译文本不能为空", "code": "EMPTY_TEXT"}), 400

    try:
        translator = get_translator()
        result = translator.translate(data.text, data.source_lang, data.target_lang)
        error = result.get('error')

        # 仅在真正翻译成功时记录，避免库里堆积空记录
        if data.book_id and not error:
            db = get_db()
            db.add(TranslationRecord(
                book_id=data.book_id,
                source_text=data.text[:500],
                translated_text=result.get('translated_text', '')[:500],
                source_lang=data.source_lang,
                target_lang=data.target_lang,
            ))
            db.commit()

        resp = TranslateResponse(
            translated_text=result.get('translated_text', ''),
            source_lang=result.get('detected_lang', data.source_lang),
            target_lang=data.target_lang,
            error=error,
            code=result.get('code'),
            params=result.get('params'),
        )
        return jsonify(resp.model_dump())

    except Exception as e:
        return jsonify({"error": f"翻译失败: {str(e)}", "code": "TRANSLATE_FAILED",
                     "params": {"msg": str(e)}}), 500


@translation_bp.route('/full', methods=['POST'])
def translate_full_book():
    data = FullTranslateRequest(**request.json)

    text_path = os.path.join(CACHE_DIR, f'book_{data.book_id}_text.txt')
    if not os.path.exists(text_path):
        return jsonify({"error": "书籍文本不存在，请先解析", "code": "TEXT_NOT_FOUND"}), 400

    translator = get_translator()
    if not translator.is_configured():
        return jsonify(NOT_CONFIGURED_ERR), 400

    with open(text_path, 'r', encoding='utf-8') as f:
        full_text = f.read()

    # 扫描版 PDF 没有文本层，抽出来是空的；提前拦下，别起一个注定空跑的任务
    if not full_text.strip():
        return jsonify({"error": "该书没有可翻译的文本（可能是扫描版 PDF）",
                     "code": "NO_TRANSLATABLE_TEXT"}), 400

    def translate_task():
        try:
            result = translator.translate_long_text(full_text, data.target_lang)

            # 出错、或没产出任何段落时不写缓存、不标记完成，避免留下空译文
            if result.get('error') or not result.get('segments'):
                print(f"[翻译] 全文翻译未产出内容: {result.get('error') or '空结果'}")
                return

            trans_path = os.path.join(CACHE_DIR, f'book_{data.book_id}_translation.json')
            with open(trans_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False)

            db = get_db()
            book = db.query(Book).get(data.book_id)
            if book:
                book.status = 'translated'
                db.commit()
        except Exception as e:
            print(f"[翻译] 全文翻译失败: {e}")

    thread = threading.Thread(target=translate_task, daemon=True)
    thread.start()
    return jsonify({"message": "翻译任务已启动", "book_id": data.book_id})




@translation_bp.route('/status/<int:book_id>', methods=['GET'])
def get_translation_status(book_id):
    trans_path = os.path.join(CACHE_DIR, f'book_{book_id}_translation.json')
    if os.path.exists(trans_path):
        with open(trans_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(TranslationStatusResponse(status="completed", data=data).model_dump())

    db = get_db()
    book = db.query(Book).get(book_id)
    status = book.status if book else 'unknown'
    return jsonify(TranslationStatusResponse(status=status).model_dump())


@translation_bp.route('/words', methods=['POST'])
def save_word():
    data = WordCreate(**request.json)
    db = get_db()
    word = Vocabulary(
        book_id=data.book_id,
        word=data.word,
        translation=data.translation,
        context=data.context,
        page_num=data.page_num,
        created_at=datetime.now().strftime('%Y-%m-%d %H:%M'),
    )
    db.add(word)
    db.commit()
    return jsonify({"id": word.id, "message": "已保存"})


@translation_bp.route('/words/<int:book_id>', methods=['GET'])
def get_words(book_id):
    db = get_db()
    words = db.query(Vocabulary).filter_by(book_id=book_id).order_by(Vocabulary.id.desc()).all()
    items = [WordResponse.model_validate(w) for w in words]
    return jsonify(WordListResponse(words=items).model_dump())


@translation_bp.route('/words/<int:word_id>', methods=['DELETE'])
def delete_word(word_id):
    db = get_db()
    w = db.query(Vocabulary).get(word_id)
    if w:
        db.delete(w)
        db.commit()
    return jsonify({"message": "已删除"})
