"""
阅读进度路由
"""
from flask import Blueprint, jsonify, request
from core.database import get_db
from models import ReadingProgress, Book
from schemas import ProgressUpdate, ProgressResponse, MessageResponse

progress_bp = Blueprint('progress', __name__, url_prefix='/api/progress')


@progress_bp.route('/<int:book_id>', methods=['GET'])
def get_progress(book_id):
    db = get_db()
    prog = db.query(ReadingProgress).filter_by(book_id=book_id).first()
    if not prog:
        return jsonify(ProgressResponse().model_dump())

    resp = ProgressResponse(
        current_page=prog.current_page,
        total_pages=prog.total_pages,
        percentage=prog.percentage,
        scroll_position=prog.scroll_position,
    )
    return jsonify(resp.model_dump())


@progress_bp.route('/<int:book_id>', methods=['PUT'])
def update_progress(book_id):
    data = ProgressUpdate(**request.json)
    db = get_db()

    prog = db.query(ReadingProgress).filter_by(book_id=book_id).first()
    if prog:
        prog.current_page = data.current_page
        prog.total_pages = data.total_pages
        prog.percentage = data.percentage
        prog.scroll_position = data.scroll_position
    else:
        prog = ReadingProgress(
            book_id=book_id,
            current_page=data.current_page,
            total_pages=data.total_pages,
            percentage=data.percentage,
            scroll_position=data.scroll_position,
        )
        db.add(prog)

    book = db.query(Book).get(book_id)
    if book:
        book.last_read_at = None
    db.commit()
    return jsonify(MessageResponse(message="进度已保存").model_dump())
