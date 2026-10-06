"""
知识图谱路由 — 知识抽取 / 图谱 CRUD / 导出
"""
import os
import json
import time
import threading
from flask import Blueprint, jsonify, request, send_file
from core.database import get_db
from core.config import CACHE_DIR, EXPORTS_DIR
from core.config import get_knowledge_extractor
from models import Book, KnowledgeNode, KnowledgeEdge
from schemas import GraphData, GraphUpdate, MessageResponse

knowledge_bp = Blueprint('knowledge', __name__, url_prefix='/api/knowledge')

_running_tasks = set()
_running_tasks_lock = threading.Lock()

# 抽取进度，供前端轮询。结构：
# { book_id: {"stage","current","total","started_at","error"} }
# 进程内内存态：重启后丢失，前端拿不到就退回"看图谱有没有生成"的老逻辑。
_task_progress = {}

# stage → 中文说明（写在这里，前端直接显示，避免两边文案各写一份）
STAGE_TEXT = {
    "indexing": "正在读取文本...",
    "chunking": "正在分块...",
    "outline": "正在提取章节大纲...",
    "rules": "正在抽取概念与关系...",
    "llm": "正在调用 AI 分析...",
    "building": "正在构建图谱...",
    "saving": "正在保存...",
}


@knowledge_bp.route('/extract/<int:book_id>', methods=['POST'])
def extract_knowledge(book_id):
    text_path = os.path.join(CACHE_DIR, f'book_{book_id}_text.txt')
    if not os.path.exists(text_path):
        return jsonify({"error": "书籍文本不存在，请先解析"}), 400

    # 防止同一本书重复触发
    with _running_tasks_lock:
        if book_id in _running_tasks:
            return jsonify({"message": "知识抽取任务正在进行中，请稍候", "book_id": book_id})
        _running_tasks.add(book_id)
        _task_progress[book_id] = {
            "stage": "indexing", "current": 0, "total": 0,
            "started_at": time.time(), "error": None,
        }

    def on_progress(stage, current=0, total=0):
        with _running_tasks_lock:
            p = _task_progress.get(book_id)
            if p is not None:
                p["stage"] = stage
                p["current"] = current
                p["total"] = total

    def extract_task():
        try:
            with open(text_path, 'r', encoding='utf-8') as f:
                full_text = f.read()

            # 分页文本用于给图谱节点标注页码（双击节点跳原文要用）
            pages_path = os.path.join(CACHE_DIR, f'book_{book_id}_pages.json')
            pages = None
            if os.path.exists(pages_path):
                with open(pages_path, 'r', encoding='utf-8') as f:
                    pages = json.load(f)

            extractor = get_knowledge_extractor()
            result = extractor.extract(full_text, pages=pages, on_progress=on_progress)
            on_progress("saving")

            knowledge_path = os.path.join(CACHE_DIR, f'book_{book_id}_knowledge.json')
            with open(knowledge_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False)

            db = get_db()
            db.query(KnowledgeNode).filter_by(book_id=book_id).delete()
            db.query(KnowledgeEdge).filter_by(book_id=book_id).delete()

            for node in result.get('nodes', []):
                db.add(KnowledgeNode(
                    book_id=book_id, node_id=node.get('id'), label=node.get('label'),
                    node_type=node.get('type', 'concept'), level=node.get('level', 1),
                    parent_id=node.get('parent_id'), chapter=node.get('chapter', ''),
                    page_num=node.get('page_num', 0), description=node.get('description', ''),
                ))
            for edge in result.get('edges', []):
                db.add(KnowledgeEdge(
                    book_id=book_id, source_id=edge.get('source'), target_id=edge.get('target'),
                    relation_type=edge.get('type', 'related'), label=edge.get('label', ''),
                ))

            book = db.query(Book).get(book_id)
            if book:
                book.status = 'knowledge_ready'
            db.commit()
        except Exception as e:
            print(f"[知识] 抽取失败: {e}")
            with _running_tasks_lock:
                p = _task_progress.get(book_id)
                if p is not None:
                    p["error"] = str(e)
        finally:
            with _running_tasks_lock:
                _running_tasks.discard(book_id)

    thread = threading.Thread(target=extract_task, daemon=True)
    thread.start()
    return jsonify({"message": "知识抽取任务已启动", "book_id": book_id})


@knowledge_bp.route('/progress/<int:book_id>', methods=['GET'])
def get_extract_progress(book_id):
    """
    查询抽取进度，供前端轮询。

    进程内内存态：后端重启过就查不到了，此时返回 running=false，
    前端会退回"看图谱生成了没有"的老办法。
    """
    with _running_tasks_lock:
        running = book_id in _running_tasks
        p = dict(_task_progress.get(book_id) or {})

    if not running:
        return jsonify({"running": False})

    elapsed = max(0, time.time() - p.get("started_at", time.time()))
    total = p.get("total") or 0
    current = p.get("current") or 0

    # 只有 llm 阶段能算百分比：每块的耗时差不多，按已完成块数线性外推
    percent = None
    eta = None
    if p.get("stage") == "llm" and total > 0:
        percent = min(99, int(current / total * 100))   # 收尾还有几步，不显示 100
        if current > 0:
            eta = max(0, int(elapsed / current * (total - current)))

    return jsonify({
        "running": True,
        "stage": p.get("stage", ""),
        "message": STAGE_TEXT.get(p.get("stage", ""), "处理中..."),
        "current": current,
        "total": total,
        "percent": percent,
        "elapsed": int(elapsed),
        "eta": eta,
        "error": p.get("error"),
    })


@knowledge_bp.route('/graph/<int:book_id>', methods=['GET'])
def get_knowledge_graph(book_id):
    knowledge_path = os.path.join(CACHE_DIR, f'book_{book_id}_knowledge.json')
    if os.path.exists(knowledge_path):
        with open(knowledge_path, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))

    db = get_db()
    nodes = db.query(KnowledgeNode).filter_by(book_id=book_id).all()
    edges = db.query(KnowledgeEdge).filter_by(book_id=book_id).all()

    data = GraphData(
        nodes=[{
            "id": n.node_id, "label": n.label, "type": n.node_type,
            "level": n.level, "parent_id": n.parent_id, "chapter": n.chapter,
            "page_num": n.page_num, "description": n.description,
        } for n in nodes],
        edges=[{
            "source": e.source_id, "target": e.target_id,
            "type": e.relation_type, "label": e.label,
        } for e in edges],
    )
    return jsonify(data.model_dump())


@knowledge_bp.route('/graph/<int:book_id>', methods=['PUT'])
def update_knowledge_graph(book_id):
    data = GraphUpdate(**request.json)
    db = get_db()

    if data.nodes is not None:
        db.query(KnowledgeNode).filter_by(book_id=book_id).delete()
        for n in data.nodes:
            db.add(KnowledgeNode(
                book_id=book_id, node_id=n.id, label=n.label,
                node_type=n.type, level=n.level, parent_id=n.parent_id,
                chapter=n.chapter, description=n.description,
            ))

    if data.edges is not None:
        db.query(KnowledgeEdge).filter_by(book_id=book_id).delete()
        for e in data.edges:
            db.add(KnowledgeEdge(
                book_id=book_id, source_id=e.source, target_id=e.target,
                relation_type=e.type, label=e.label,
            ))

    db.commit()
    return jsonify(MessageResponse(message="图谱已更新").model_dump())


@knowledge_bp.route('/graph/<int:book_id>', methods=['DELETE'])
def clear_knowledge_graph(book_id):
    """清除知识图谱数据"""
    db = get_db()
    db.query(KnowledgeNode).filter_by(book_id=book_id).delete()
    db.query(KnowledgeEdge).filter_by(book_id=book_id).delete()
    db.commit()
    # 删除缓存文件
    knowledge_path = os.path.join(CACHE_DIR, f'book_{book_id}_knowledge.json')
    if os.path.exists(knowledge_path):
        os.remove(knowledge_path)
    return jsonify(MessageResponse(message="图谱已清除").model_dump())


@knowledge_bp.route('/export/<int:book_id>', methods=['GET'])
def export_knowledge(book_id):
    fmt = request.args.get('format', 'txt')
    db = get_db()
    book = db.query(Book).get(book_id)
    if not book:
        return jsonify({"error": "书籍不存在"}), 404

    if fmt == 'txt':
        nodes = db.query(KnowledgeNode).filter_by(book_id=book_id).order_by(
            KnowledgeNode.level, KnowledgeNode.node_id).all()
        content = f"《{book.title}》知识大纲\n{'='*40}\n\n"
        for n in nodes:
            indent = '  ' * (n.level - 1)
            content += f"{indent}- {n.label}\n"
            if n.description:
                content += f"{indent}  {n.description}\n"

        export_path = os.path.join(EXPORTS_DIR, f'{book.title}_知识大纲.txt')
        with open(export_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return send_file(export_path, as_attachment=True, download_name=f'{book.title}_知识大纲.txt')

    elif fmt == 'json':
        knowledge_path = os.path.join(CACHE_DIR, f'book_{book_id}_knowledge.json')
        if os.path.exists(knowledge_path):
            return send_file(knowledge_path, as_attachment=True, download_name=f'{book.title}_知识图谱.json')

    return jsonify({"error": "不支持的导出格式"}), 400
