"""
书签路由
"""
from flask import Blueprint, jsonify, request
from core.database import get_db
from models import Bookmark
from schemas import BookmarkCreate, BookmarkResponse, BookmarkListResponse, MessageResponse

bookmarks_bp = Blueprint('bookmarks', __name__, url_prefix='/api')


@bookmarks_bp.route('/books/<int:book_id>/bookmarks', methods=['GET'])
def get_bookmarks(book_id):
    db = get_db()
    bms = db.query(Bookmark).filter_by(book_id=book_id).order_by(Bookmark.page_num.asc()).all()
    items = [BookmarkResponse.model_validate(b) for b in bms]
    return jsonify(BookmarkListResponse(bookmarks=items).model_dump())


@bookmarks_bp.route('/books/<int:book_id>/bookmarks', methods=['POST'])
def add_bookmark(book_id):
    data = BookmarkCreate(**request.json)
    db = get_db()
    bm = Bookmark(
        book_id=book_id,
        page_num=data.page_num,
        title=data.title or f'第{data.page_num}页',
    )
    db.add(bm)
    db.commit()
    return jsonify({"id": bm.id, "message": "书签已添加"})


@bookmarks_bp.route('/bookmarks/<int:bookmark_id>', methods=['DELETE'])
def delete_bookmark(bookmark_id):
    db = get_db()
    bm = db.query(Bookmark).get(bookmark_id)
    if bm:
        db.delete(bm)
        db.commit()
    return jsonify(MessageResponse(message="书签已删除").model_dump())


@bookmarks_bp.route('/bookmarks/<int:bookmark_id>', methods=['PUT'])
def update_bookmark(bookmark_id):
    data = request.json
    db = get_db()
    bm = db.query(Bookmark).get(bookmark_id)
    if not bm:
        return jsonify({"error": "书签不存在"}), 404
    if 'title' in data:
        bm.title = data['title']
    if 'page_num' in data:
        bm.page_num = data['page_num']
    db.commit()
    return jsonify(BookmarkResponse.model_validate(bm).model_dump())
