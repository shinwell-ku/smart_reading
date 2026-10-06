"""
系统路由 — 健康检查 / 备份导出 / 备份恢复 / 数据重置
"""
import os
import glob
import json
import shutil
import sqlite3
import zipfile
from datetime import datetime
from flask import Blueprint, jsonify, request
from core.database import get_db, reset_engine, DB_PATH
from core.config import DB_DIR, BOOKS_DIR, EXPORTS_DIR, CACHE_DIR, DATA_DIR
from models import Book, ReadingProgress, Note, Bookmark, TranslationRecord, \
    Vocabulary, KnowledgeNode, KnowledgeEdge
from schemas import HealthResponse, MessageResponse, BackupResponse, RestoreResponse

system_bp = Blueprint('system', __name__, url_prefix='/api')

# 备份包标识，用于恢复时校验来源
BACKUP_FORMAT = 'smart-reading-backup'
BACKUP_VERSION = 1
APP_VERSION = '1.0.0'

CONFIG_DIR = os.path.join(DATA_DIR, 'config')


@system_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify(HealthResponse().model_dump())


def _snapshot_database(dest_path):
    """
    把当前数据库导出成一致的单文件快照。

    必须用 sqlite3 的 backup API，不能 shutil.copy2：
    WAL 模式下已提交的事务可能还留在 database.db-wal 里没合并进主库，
    直接复制主库文件会丢掉这部分数据（曾经真的丢过 2.4MB）。
    backup() 会读穿 WAL，产出一个完整、可直接打开的快照。
    """
    src = sqlite3.connect(DB_PATH)
    try:
        dest = sqlite3.connect(dest_path)
        try:
            src.backup(dest)
        finally:
            dest.close()
    finally:
        src.close()


@system_bp.route('/backup', methods=['POST'])
def create_backup():
    """
    导出备份到用户指定路径。

    请求体: { "dest_path": "/Users/x/Desktop/备份.zip" }
    不传 dest_path 时退回写到 data/exports/ 下（兼容旧调用）。
    """
    data = request.json or {}
    dest_path = (data.get('dest_path') or '').strip()

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    if not dest_path:
        dest_path = os.path.join(EXPORTS_DIR, f'smart_reading_backup_{timestamp}.zip')

    if not dest_path.lower().endswith('.zip'):
        dest_path += '.zip'

    dest_dir = os.path.dirname(os.path.abspath(dest_path))
    if not os.path.isdir(dest_dir):
        return jsonify({"error": f"目标目录不存在：{dest_dir}"}), 400

    stage_dir = os.path.join(EXPORTS_DIR, f'_backup_{timestamp}')
    os.makedirs(stage_dir, exist_ok=True)

    try:
        # 1. 数据库快照（穿透 WAL）
        _snapshot_database(os.path.join(stage_dir, 'database.db'))

        # 2. 书籍原文件
        if os.path.isdir(BOOKS_DIR):
            shutil.copytree(BOOKS_DIR, os.path.join(stage_dir, 'books'), dirs_exist_ok=True)

        # 3. 缓存（分页文本/图谱等，没有其它重新生成的途径，必须带上）
        if os.path.isdir(CACHE_DIR):
            shutil.copytree(CACHE_DIR, os.path.join(stage_dir, 'cache'), dirs_exist_ok=True)

        # 4. AI 引擎配置（含 API Key）
        config_src = os.path.join(CONFIG_DIR, 'translator.json')
        if os.path.exists(config_src):
            os.makedirs(os.path.join(stage_dir, 'config'), exist_ok=True)
            shutil.copy2(config_src, os.path.join(stage_dir, 'config', 'translator.json'))

        # 5. 清单
        db = get_db()
        manifest = {
            'format': BACKUP_FORMAT,
            'version': BACKUP_VERSION,
            'app_version': APP_VERSION,
            'created_at': datetime.now().isoformat(timespec='seconds'),
            'book_count': db.query(Book).count(),
            'note_count': db.query(Note).count(),
            'bookmark_count': db.query(Bookmark).count(),
            'word_count': db.query(Vocabulary).count(),
        }
        with open(os.path.join(stage_dir, 'manifest.json'), 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)

        # 6. 打包：先写到临时名再原子改名，避免失败时留下半截文件冒充备份
        tmp_base = os.path.join(dest_dir, f'.{os.path.basename(dest_path)}.{timestamp}.part')
        produced = shutil.make_archive(tmp_base, 'zip', stage_dir)
        os.replace(produced, dest_path)

        size = os.path.getsize(dest_path)
        return jsonify(BackupResponse(
            message="备份成功", path=dest_path, size=size,
        ).model_dump())
    except Exception as e:
        return jsonify({"error": f"备份失败：{e}"}), 500
    finally:
        shutil.rmtree(stage_dir, ignore_errors=True)
        # 清掉可能残留的 .part 产物
        for leftover in glob.glob(os.path.join(dest_dir, f'.{os.path.basename(dest_path)}.*.part.zip')):
            try:
                os.remove(leftover)
            except OSError:
                pass


def _safe_extract(zf, dest_dir):
    """
    解压并防 zip-slip：每个成员解析成真实路径后必须落在 dest_dir 内。
    返回被拒绝的成员列表（非空表示整个包不可信）。
    """
    dest_root = os.path.realpath(dest_dir)
    for member in zf.namelist():
        target = os.path.realpath(os.path.join(dest_dir, member))
        if target != dest_root and not target.startswith(dest_root + os.sep):
            return member
    zf.extractall(dest_dir)
    return None


@system_bp.route('/restore', methods=['POST'])
def restore_backup():
    """
    从备份包恢复（整体替换，不是合并）。

    请求体: { "path": "/Users/x/Desktop/备份.zip" }
    恢复前会校验包来源；当前数据会被完全覆盖。
    """
    data = request.json or {}
    src_path = (data.get('path') or '').strip()

    if not src_path:
        return jsonify({"error": "未指定备份文件"}), 400
    if not os.path.exists(src_path):
        return jsonify({"error": f"备份文件不存在：{src_path}"}), 400
    if not zipfile.is_zipfile(src_path):
        return jsonify({"error": "该文件不是有效的备份包（不是 zip 格式）"}), 400

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    stage_dir = os.path.join(EXPORTS_DIR, f'_restore_{timestamp}')
    os.makedirs(stage_dir, exist_ok=True)

    try:
        # 1. 解压 + 校验来源
        with zipfile.ZipFile(src_path, 'r') as zf:
            bad = _safe_extract(zf, stage_dir)
            if bad:
                return jsonify({"error": f"备份包包含非法路径，已中止：{bad}"}), 400

        manifest_path = os.path.join(stage_dir, 'manifest.json')
        if not os.path.exists(manifest_path):
            return jsonify({"error": "该压缩包不是本软件的备份（缺少 manifest.json）"}), 400
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        if manifest.get('format') != BACKUP_FORMAT:
            return jsonify({"error": "该压缩包不是本软件的备份（格式标识不匹配）"}), 400

        src_db = os.path.join(stage_dir, 'database.db')
        if not os.path.exists(src_db):
            return jsonify({"error": "备份包损坏：缺少数据库文件"}), 400

        # 2. 断掉所有连接，否则旧连接句柄仍指向被替换掉的旧 inode
        reset_engine()

        # 3. 用 sqlite3 的 backup API 把备份内容写进当前库。
        #
        #    不要用「替换 database.db 文件」或删 -wal/-shm 的做法：
        #    Flask 是多线程的，engine.dispose() 只能关掉池里空闲的连接，
        #    其它线程已借出的连接无法回收，它们仍持有旧 -shm 的映射。
        #    此时删掉伴随文件会让这些连接（以及后续连接）报 "disk I/O error"，
        #    而且是竞态的——同一段代码有时成功有时失败。
        #    交给 SQLite 自己按页搬运，则完全不用碰这些文件。
        src_conn = sqlite3.connect(src_db)
        dst_conn = sqlite3.connect(DB_PATH)
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
            src_conn.close()

        # 4. 替换书籍与缓存（整体替换语义：先清空再铺开）
        for target_dir, src_dir in ((BOOKS_DIR, 'books'), (CACHE_DIR, 'cache')):
            incoming = os.path.join(stage_dir, src_dir)
            if not os.path.isdir(incoming):
                continue
            shutil.rmtree(target_dir, ignore_errors=True)
            shutil.copytree(incoming, target_dir)

        # 5. AI 引擎配置（备份里没有就保留当前配置）
        cfg_src = os.path.join(stage_dir, 'config', 'translator.json')
        if os.path.exists(cfg_src):
            os.makedirs(CONFIG_DIR, exist_ok=True)
            shutil.copy2(cfg_src, os.path.join(CONFIG_DIR, 'translator.json'))

        # 6. 重写 file_path：备份里存的是旧机器/旧安装位置的绝对路径，
        #    换环境后全都悬空，这里统一改回当前 BOOKS_DIR
        db = get_db()
        rewritten = 0
        for book in db.query(Book).all():
            filename = os.path.basename(book.file_path or '')
            if not filename:
                continue
            new_path = os.path.join(BOOKS_DIR, filename)
            if book.file_path != new_path:
                book.file_path = new_path
                rewritten += 1
        db.commit()

        counts = {
            'book_count': db.query(Book).count(),
            'note_count': db.query(Note).count(),
            'bookmark_count': db.query(Bookmark).count(),
            'word_count': db.query(Vocabulary).count(),
        }

        # 7. 再断一次，确保后续请求读到的是新库
        reset_engine()

        return jsonify(RestoreResponse(
            message="恢复成功",
            created_at=manifest.get('created_at'),
            rewritten_paths=rewritten,
            **counts,
        ).model_dump())
    except Exception as e:
        return jsonify({"error": f"恢复失败：{e}"}), 500
    finally:
        shutil.rmtree(stage_dir, ignore_errors=True)


@system_bp.route('/data/clear', methods=['POST'])
def clear_all_data():
    """
    清除全部用户数据：数据库记录 + 书籍原文件 + 缓存。
    保留 data/config/（AI 引擎设置），避免用户每次清数据都要重填 API Key。
    """
    db = get_db()
    for table in [Book, ReadingProgress, Note, Bookmark, TranslationRecord,
                  Vocabulary, KnowledgeNode, KnowledgeEdge]:
        db.query(table).delete()
    db.commit()

    # 清空目录内容但保留目录本身（同 backup 一样遍历删除，
    # 不能用 shutil.rmtree + makedirs，避免并发请求撞上目录不存在的瞬间）
    for target in (CACHE_DIR, BOOKS_DIR):
        if not os.path.isdir(target):
            continue
        for name in os.listdir(target):
            if name == '.gitkeep':      # 版本控制占位文件，不是用户数据
                continue
            path = os.path.join(target, name)
            if os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
            else:
                os.remove(path)

    return jsonify(MessageResponse(message="所有数据已清除").model_dump())
