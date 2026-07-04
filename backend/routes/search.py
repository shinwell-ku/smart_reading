"""
搜索路由 — 全书关键词检索
"""
import os
from flask import Blueprint, jsonify, request
from core.config import CACHE_DIR
from schemas import SearchResponse, SearchResult

search_bp = Blueprint('search', __name__, url_prefix='/api/search')


@search_bp.route('/<int:book_id>', methods=['GET'])
def search_book(book_id):
    keyword = request.args.get('q', '')
    if not keyword:
        return jsonify({"error": "搜索关键词不能为空"}), 400

    text_path = os.path.join(CACHE_DIR, f'book_{book_id}_text.txt')
    if not os.path.exists(text_path):
        return jsonify({"error": "书籍文本未找到"}), 400

    with open(text_path, 'r', encoding='utf-8') as f:
        text = f.read()

    results = []
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if keyword in line:
            start = max(0, i - 2)
            end = min(len(lines), i + 3)
            context = '\n'.join(lines[start:end])
            results.append(SearchResult(line=i + 1, context=context, matched=line))

    resp = SearchResponse(results=results, total=len(results), keyword=keyword)
    return jsonify(resp.model_dump())
