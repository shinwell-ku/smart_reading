"""
搜索路由 — 全书关键词检索
"""
import os
import json
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

    # 构建行号→页码映射（基于缓存的分页数据）
    pages_path = os.path.join(CACHE_DIR, f'book_{book_id}_pages.json')
    line_to_page = {}
    if os.path.exists(pages_path):
        with open(pages_path, 'r', encoding='utf-8') as f:
            pages = json.load(f)
        line_no = 0
        for page_idx, page_text in enumerate(pages):
            page_lines = page_text.split('\n')
            for _ in page_lines:
                line_no += 1
                line_to_page[line_no] = page_idx + 1  # 页码从1开始

    results = []
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if keyword in line:
            start = max(0, i - 2)
            end = min(len(lines), i + 3)
            context = '\n'.join(lines[start:end])
            page_num = line_to_page.get(i + 1, (i // 40) + 1)
            results.append({
                "line": i + 1,
                "page": page_num,
                "context": context,
                "matched": line,
            })

    return jsonify({"results": results, "total": len(results), "keyword": keyword})
