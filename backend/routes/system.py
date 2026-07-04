"""
系统路由 — 健康检查 / 备份 / 数据重置
"""
import os
import shutil
from datetime import datetime
from flask import Blueprint, jsonify
from core.database import get_db
from core.config import DB_DIR, BOOKS_DIR, EXPORTS_DIR, CACHE_DIR
from models import Book, ReadingProgress, Note, Bookmark, TranslationRecord, \
    Vocabulary, KnowledgeNode, KnowledgeEdge
from schemas import HealthResponse, MessageResponse, BackupResponse

system_bp = Blueprint('system', __name__, url_prefix='/api')


@system_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify(HealthResponse().model_dump())


@system_bp.route('/backup', methods=['POST'])
def create_backup():
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_name = f'smart_reading_backup_{timestamp}'
    backup_dir = os.path.join(EXPORTS_DIR, backup_name)
    os.makedirs(backup_dir, exist_ok=True)

    db_path = os.path.join(DB_DIR, 'database.db')
    if os.path.exists(db_path):
        shutil.copy2(db_path, os.path.join(backup_dir, 'database.db'))
    if os.path.exists(BOOKS_DIR):
        shutil.copytree(BOOKS_DIR, os.path.join(backup_dir, 'books'), dirs_exist_ok=True)

    archive_path = os.path.join(EXPORTS_DIR, backup_name)
    shutil.make_archive(archive_path, 'zip', backup_dir)
    shutil.rmtree(backup_dir)

    return jsonify(BackupResponse(message="备份成功", path=f"{archive_path}.zip").model_dump())


@system_bp.route('/data/clear', methods=['POST'])
def clear_all_data():
    db = get_db()
    for table in [Book, ReadingProgress, Note, Bookmark, TranslationRecord,
                  Vocabulary, KnowledgeNode, KnowledgeEdge]:
        db.query(table).delete()
    db.commit()

    for f in os.listdir(CACHE_DIR):
        fpath = os.path.join(CACHE_DIR, f)
        if os.path.isfile(fpath):
            os.remove(fpath)

    return jsonify(MessageResponse(message="所有数据已清除").model_dump())
