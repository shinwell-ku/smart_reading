"""
Pydantic Schemas — 请求/响应数据校验与序列化
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ============================================================
# Book 书籍
# ============================================================

class BookCreate(BaseModel):
    """导入书籍（由系统填充，仅通过文件导入）"""
    pass


class BookResponse(BaseModel):
    id: int
    title: str
    author: str
    file_path: str
    file_type: str
    total_pages: int
    total_chars: int
    chapters: Optional[list] = None
    is_scan_pdf: bool = False
    status: str = 'ready'
    created_at: Optional[str] = None
    last_read_at: Optional[str] = None

    class Config:
        from_attributes = True


class BookListResponse(BaseModel):
    books: List[BookResponse]


class BookImportResult(BaseModel):
    book_id: int
    title: str
    total_pages: int
    total_chars: int
    chapters: list = []
    is_scan_pdf: bool = False
    message: str = "书籍导入成功"


# ============================================================
# ReadingProgress 阅读进度
# ============================================================

class ProgressUpdate(BaseModel):
    current_page: int = Field(default=1, ge=1)
    total_pages: int = Field(default=0, ge=0)
    percentage: float = Field(default=0, ge=0, le=1)
    scroll_position: float = 0


class ProgressResponse(BaseModel):
    current_page: int = 1
    total_pages: int = 0
    percentage: float = 0
    scroll_position: float = 0


# ============================================================
# Note 笔记
# ============================================================

class NoteCreate(BaseModel):
    page_num: int = Field(default=1, ge=1)
    content: str = ''
    selected_text: str = ''
    color: str = '#FFD700'


class NoteResponse(BaseModel):
    id: int
    page_num: int
    content: str
    selected_text: str
    color: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


class NoteListResponse(BaseModel):
    notes: List[NoteResponse]


# ============================================================
# Bookmark 书签
# ============================================================

class BookmarkCreate(BaseModel):
    page_num: int = Field(default=1, ge=1)
    title: str = ''


class BookmarkResponse(BaseModel):
    id: int
    page_num: int
    title: str
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class BookmarkListResponse(BaseModel):
    bookmarks: List[BookmarkResponse]


# ============================================================
# Translation 翻译
# ============================================================

class TranslateRequest(BaseModel):
    # 不写 min_length：空串由路由判（那边能给出「翻译文本不能为空」这句具体
    # 文案），这里拦下来只会变成一句笼统的参数校验错误
    text: str = Field(...)
    source_lang: str = 'auto'
    target_lang: str = 'zh'
    book_id: Optional[int] = None


class TranslateResponse(BaseModel):
    translated_text: str
    source_lang: str
    target_lang: str
    error: Optional[str] = None
    # code / params 一路从 TranslatorService 带上来，前端按 code 翻成当前界面
    # 语言（见 i18n 的 errText）。漏掉这两个字段，英文界面就会冒出中文错误。
    code: Optional[str] = None
    params: Optional[dict] = None


class FullTranslateRequest(BaseModel):
    book_id: int
    target_lang: str = 'zh'


class TranslationStatusResponse(BaseModel):
    status: str  # completed | translating | unknown
    data: Optional[dict] = None


# ============================================================
# Vocabulary 生词
# ============================================================

class WordCreate(BaseModel):
    book_id: Optional[int] = None
    word: str = Field(..., min_length=1)
    translation: str = ''
    context: str = ''
    page_num: int = 0


class WordResponse(BaseModel):
    id: int
    word: str
    translation: str
    context: str
    page_num: int
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class WordListResponse(BaseModel):
    words: List[WordResponse]


# ============================================================
# Knowledge 知识图谱
# ============================================================

class GraphNode(BaseModel):
    id: str
    label: str
    type: str = 'concept'
    level: int = 1
    parent_id: Optional[str] = None
    chapter: str = ''
    page_num: int = 0
    description: str = ''


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str = 'related'
    label: str = ''


class GraphData(BaseModel):
    nodes: List[GraphNode] = []
    edges: List[GraphEdge] = []


class GraphUpdate(BaseModel):
    nodes: Optional[List[GraphNode]] = None
    edges: Optional[List[GraphEdge]] = None


# ============================================================
# Search 搜索
# ============================================================

class SearchResult(BaseModel):
    line: int
    context: str
    matched: str


class SearchResponse(BaseModel):
    results: List[SearchResult]
    total: int
    keyword: str


# ============================================================
# System 系统
# ============================================================

class HealthResponse(BaseModel):
    status: str = 'ok'
    service: str = 'smart-reading'


class MessageResponse(BaseModel):
    message: str


class BackupResponse(BaseModel):
    message: str
    path: Optional[str] = None
    size: Optional[int] = None


class RestoreResponse(BaseModel):
    message: str
    created_at: Optional[str] = None    # 备份包的创建时间
    rewritten_paths: int = 0            # 被改回当前 BOOKS_DIR 的书籍路径数
    book_count: int = 0
    note_count: int = 0
    bookmark_count: int = 0
    word_count: int = 0
