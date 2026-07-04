"""
书籍路由 — 导入 / 列表 / 详情 / 删除 / 页面内容
"""
import os
import json
from flask import Blueprint, jsonify, request, send_file
from core.database import get_db
from core.config import BOOKS_DIR, CACHE_DIR
from core.config import get_doc_parser
from models import Book
from schemas import BookResponse, BookListResponse, BookImportResult, MessageResponse

books_bp = Blueprint('books', __name__, url_prefix='/api/books')


@books_bp.route('/import', methods=['POST'])
def import_book():
    if 'file' not in request.files:
        return jsonify({"error": "未选择文件", "code": "NO_FILE"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "文件名为空", "code": "EMPTY_NAME"}), 400

    filename = file.filename.lower()
    if not (filename.endswith('.pdf') or filename.endswith('.docx')):
        return jsonify({"error": "仅支持 PDF 和 DOCX 格式", "code": "UNSUPPORTED_FORMAT"}), 400

    book_path = os.path.join(BOOKS_DIR, file.filename)
    file.save(book_path)

    try:
        parser = get_doc_parser()
        result = parser.parse(book_path)

        db = get_db()
        book = Book(
            title=result.get('title', file.filename),
            author=result.get('author', '未知'),
            file_path=book_path,
            file_type='pdf' if filename.endswith('.pdf') else 'docx',
            total_pages=result.get('total_pages', 0),
            total_chars=result.get('total_chars', 0),
            chapter_tree=json.dumps(result.get('chapters', []), ensure_ascii=False),
            is_scan_pdf=1 if result.get('is_scan_pdf') else 0,
            status='ready',
        )
        db.add(book)
        db.commit()
        db.refresh(book)

        full_text = result.get('full_text', '')
        with open(os.path.join(CACHE_DIR, f'book_{book.id}_text.txt'), 'w', encoding='utf-8') as f:
            f.write(full_text)

        pages = result.get('pages', [])
        with open(os.path.join(CACHE_DIR, f'book_{book.id}_pages.json'), 'w', encoding='utf-8') as f:
            json.dump(pages, f, ensure_ascii=False)

        # 提取封面缩略图
        try:
            cover_path = os.path.join(CACHE_DIR, f'book_{book.id}_cover.png')
            if not os.path.exists(cover_path):
                import fitz
                doc = fitz.open(book_path)
                if doc.page_count > 0:
                    page = doc.load_page(0)
                    mat = fitz.Matrix(0.5, 0.5)
                    pix = page.get_pixmap(matrix=mat)
                    pix.save(cover_path)
                doc.close()
        except Exception:
            pass

        resp = BookImportResult(
            book_id=book.id,
            title=book.title,
            total_pages=book.total_pages,
            total_chars=book.total_chars,
            chapters=json.loads(book.chapter_tree) if book.chapter_tree else [],
            is_scan_pdf=bool(book.is_scan_pdf),
        )
        return jsonify(resp.model_dump())

    except Exception as e:
        if os.path.exists(book_path):
            os.remove(book_path)
        return jsonify({"error": f"解析失败: {str(e)}", "code": "PARSE_ERROR"}), 500


@books_bp.route('', methods=['GET'])
def list_books():
    db = get_db()
    books = db.query(Book).order_by(Book.last_read_at.desc()).all()

    items = []
    for b in books:
        items.append(BookResponse(
            id=b.id, title=b.title, author=b.author, file_path=b.file_path,
            file_type=b.file_type, total_pages=b.total_pages, total_chars=b.total_chars,
            chapters=json.loads(b.chapter_tree) if b.chapter_tree else [],
            is_scan_pdf=bool(b.is_scan_pdf), status=b.status,
            created_at=b.created_at, last_read_at=b.last_read_at,
        ))

    return jsonify(BookListResponse(books=items).model_dump())


@books_bp.route('/<int:book_id>', methods=['GET'])
def get_book(book_id):
    db = get_db()
    book = db.query(Book).get(book_id)
    if not book:
        return jsonify({"error": "书籍不存在", "code": "NOT_FOUND"}), 404

    resp = BookResponse(
        id=book.id, title=book.title, author=book.author,
        file_path=book.file_path, file_type=book.file_type,
        total_pages=book.total_pages, total_chars=book.total_chars,
        chapters=json.loads(book.chapter_tree) if book.chapter_tree else [],
        is_scan_pdf=bool(book.is_scan_pdf), status=book.status,
        created_at=book.created_at, last_read_at=book.last_read_at,
    )
    return jsonify(resp.model_dump())


@books_bp.route('/<int:book_id>', methods=['DELETE'])
def delete_book(book_id):
    db = get_db()
    book = db.query(Book).get(book_id)
    if not book:
        return jsonify({"error": "书籍不存在"}), 404

    if os.path.exists(book.file_path):
        os.remove(book.file_path)
    for ext in ['_text.txt', '_pages.json', '_translation.json', '_knowledge.json']:
        cache_file = os.path.join(CACHE_DIR, f'book_{book_id}{ext}')
        if os.path.exists(cache_file):
            os.remove(cache_file)

    db.delete(book)
    db.commit()
    return jsonify(MessageResponse(message="删除成功").model_dump())


@books_bp.route('/<int:book_id>/page/<int:page_num>', methods=['GET'])
def get_page_content(book_id, page_num):
    pages_path = os.path.join(CACHE_DIR, f'book_{book_id}_pages.json')
    if not os.path.exists(pages_path):
        return jsonify({"error": "页面数据不存在"}), 404

    with open(pages_path, 'r', encoding='utf-8') as f:
        pages = json.load(f)

    if page_num < 1 or page_num > len(pages):
        return jsonify({"error": "页码超出范围"}), 400

    return jsonify({"page_num": page_num, "total_pages": len(pages), "content": pages[page_num - 1]})


@books_bp.route('/<int:book_id>/cover', methods=['GET'])
def get_book_cover(book_id):
    """获取书籍封面缩略图（按需生成）"""
    cover_path = os.path.join(CACHE_DIR, f'book_{book_id}_cover.png')
    if os.path.exists(cover_path):
        return send_file(cover_path, mimetype='image/png')

    # 尝试即时生成封面
    try:
        db = get_db()
        book = db.query(Book).get(book_id)
        if book and os.path.exists(book.file_path) and book.file_type == 'pdf':
            import fitz
            doc = fitz.open(book.file_path)
            if doc.page_count > 0:
                page = doc.load_page(0)
                pix = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))
                pix.save(cover_path)
            doc.close()
            if os.path.exists(cover_path):
                return send_file(cover_path, mimetype='image/png')
    except Exception:
        pass

    # 无封面：返回 SVG 占位
    from flask import Response
    placeholder = '''<svg xmlns="http://www.w3.org/2000/svg" width="200" height="260" viewBox="0 0 200 260">
      <rect width="200" height="260" rx="8" fill="#f0f0f0"/>
      <text x="100" y="130" text-anchor="middle" font-size="48">📖</text>
    </svg>'''
    return Response(placeholder, mimetype='image/svg+xml')
