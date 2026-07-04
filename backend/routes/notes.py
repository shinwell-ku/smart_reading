"""
笔记路由
"""
from flask import Blueprint, jsonify, request
from core.database import get_db
from models import Note
from schemas import NoteCreate, NoteResponse, NoteListResponse, MessageResponse

notes_bp = Blueprint('notes', __name__, url_prefix='/api')


@notes_bp.route('/books/<int:book_id>/notes', methods=['GET'])
def get_notes(book_id):
    db = get_db()
    notes = db.query(Note).filter_by(book_id=book_id).order_by(Note.page_num.asc(), Note.created_at.desc()).all()
    items = [NoteResponse.model_validate(n) for n in notes]
    return jsonify(NoteListResponse(notes=items).model_dump())


@notes_bp.route('/books/<int:book_id>/notes', methods=['POST'])
def add_note(book_id):
    data = NoteCreate(**request.json)
    db = get_db()
    note = Note(
        book_id=book_id,
        page_num=data.page_num,
        content=data.content,
        selected_text=data.selected_text,
        color=data.color,
    )
    db.add(note)
    db.commit()
    return jsonify({"id": note.id, "message": "笔记已添加"})


@notes_bp.route('/notes/<int:note_id>', methods=['DELETE'])
def delete_note(note_id):
    db = get_db()
    note = db.query(Note).get(note_id)
    if note:
        db.delete(note)
        db.commit()
    return jsonify(MessageResponse(message="笔记已删除").model_dump())
