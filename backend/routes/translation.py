"""
翻译路由 — 划词翻译 / 全文翻译 / 生词管理
"""
import os
import json
import threading
from flask import Blueprint, jsonify, request
from core.database import get_db
from core.config import CACHE_DIR
from core.config import get_translator
from models import TranslationRecord, Vocabulary, Book
from schemas import (
    TranslateRequest, TranslateResponse, FullTranslateRequest,
    TranslationStatusResponse, WordCreate, WordResponse, WordListResponse,
)

translation_bp = Blueprint('translation', __name__, url_prefix='/api/translate')


@translation_bp.route('', methods=['POST'])
def translate_text():
    data = TranslateRequest(**request.json)
    if not data.text.strip():
        return jsonify({"error": "翻译文本不能为空"}), 400

    try:
        translator = get_translator()
        result = translator.translate(data.text, data.source_lang, data.target_lang)

        if data.book_id:
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
        )
        return jsonify(resp.model_dump())

    except Exception as e:
        return jsonify({"error": f"翻译失败: {str(e)}"}), 500


@translation_bp.route('/full', methods=['POST'])
def translate_full_book():
    data = FullTranslateRequest(**request.json)

    text_path = os.path.join(CACHE_DIR, f'book_{data.book_id}_text.txt')
    if not os.path.exists(text_path):
        return jsonify({"error": "书籍文本不存在，请先解析"}), 400

    with open(text_path, 'r', encoding='utf-8') as f:
        full_text = f.read()

    def translate_task():
        try:
            translator = get_translator()
            result = translator.translate_long_text(full_text, data.target_lang)

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
    )
    db.add(word)
    db.commit()
    return jsonify({"id": word.id, "message": "已保存"})


@translation_bp.route('/words/<int:book_id>', methods=['GET'])
def get_words(book_id):
    db = get_db()
    words = db.query(Vocabulary).filter_by(book_id=book_id).order_by(Vocabulary.created_at.desc()).all()
    items = [WordResponse.model_validate(w) for w in words]
    return jsonify(WordListResponse(words=items).model_dump())
