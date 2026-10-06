"""
分页正文缓存（`cache/book_<id>_pages.json` + `book_<id>_text.txt`）。

这两个文件是**派生数据** —— 内容完全由「原始文档 + 解析器版本」决定，
而备份/恢复会把它们原样搬回来。用户从旧版本的备份恢复后，会一直读到旧
解析器写出来的东西（隐形锚点、页眉页脚、跑到页末的列表符号都在），可代码
看上去完全正常，极难排查。所以缓存里带一个版本号，读取时比对，过期就在
后台重解析，当前这次请求仍返回旧内容。

重解析只重写 cache/，页码不会变（还是同一个 PDF），所以笔记、书签、阅读
进度、生词都不受影响。
"""
import json
import os
import threading

from core.config import CACHE_DIR

# 解析器输出格式一变就 +1（常量定义在 document_parser 里，跟着它走）
from services.document_parser import PARSER_VERSION

# 同一本书只跑一个重建线程；线程结束后自行移出
_inflight = set()
_lock = threading.Lock()


def pages_path(book_id):
    return os.path.join(CACHE_DIR, f'book_{book_id}_pages.json')


def text_path(book_id):
    return os.path.join(CACHE_DIR, f'book_{book_id}_text.txt')


def write(book_id, pages, full_text):
    """
    解析完成后落盘。pages 和 full_text 必须一起写 —— 版本号记在 pages 里，
    所以那个文件**最后**落盘：写到一半被打断时，磁盘上仍是旧版本，
    下次读取会重新触发重建，而不是把半截数据当成新的。
    """
    with open(text_path(book_id), 'w', encoding='utf-8') as f:
        f.write(full_text)
    with open(pages_path(book_id), 'w', encoding='utf-8') as f:
        json.dump({'v': PARSER_VERSION, 'pages': pages}, f, ensure_ascii=False)


def read(book_id):
    """返回 (分页正文, 是否过期)。老格式（纯数组、无版本号）一律算过期。"""
    path = pages_path(book_id)
    if not os.path.exists(path):
        return [], True
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        # 写了一半就被中断之类，当作没有，触发重建
        return [], True
    if isinstance(data, dict):
        return (data.get('pages') or []), data.get('v') != PARSER_VERSION
    return data, True


def load(book):
    """
    读取某本书的分页正文，顺带在过期时安排后台重建。

    入参是 ORM 的 Book 对象 —— 重建要用它的 file_path。
    调用方拿到的是**当前**可用的内容：是旧的也先照常返回，
    重建完成后下一次请求就是新的。
    """
    pages, stale = read(book.id)
    if stale:
        _schedule(book)
    return pages


def touch(book):
    """只需要触发重建、不要正文时用（如全文接口直接 send_file）"""
    _, stale = read(book.id)
    if stale:
        _schedule(book)


def _schedule(book):
    """安排一次后台重建；已在跑的同一本书不重复排"""
    file_path = getattr(book, 'file_path', None)
    if not file_path or not os.path.exists(file_path):
        return
    with _lock:
        if book.id in _inflight:
            return
        _inflight.add(book.id)
    threading.Thread(target=_rebuild, args=(book.id, file_path), daemon=True).start()


def _rebuild(book_id, file_path):
    try:
        from services.document_parser import DocumentParser
        result = DocumentParser().parse(file_path)
        write(book_id, result.get('pages', []), result.get('full_text', ''))
        print(f'[缓存] book_{book_id} 正文缓存已按新版解析器重建')
    except Exception as e:
        print(f'[缓存] book_{book_id} 重建失败: {e}')
    finally:
        with _lock:
            _inflight.discard(book_id)
