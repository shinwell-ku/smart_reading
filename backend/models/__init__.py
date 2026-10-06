"""
SQLAlchemy ORM 模型 — 8 张业务表
"""
from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey
from sqlalchemy.orm import relationship
from core.database import Base


class Book(Base):
    """书籍"""
    __tablename__ = 'books'

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(256), nullable=False, default='未命名')
    author = Column(String(128), default='未知')
    file_path = Column(String(512), nullable=False)
    file_type = Column(String(16), nullable=False)  # pdf | docx | txt | md | html
    total_pages = Column(Integer, default=0)
    total_chars = Column(Integer, default=0)
    chapter_tree = Column(Text, default=None)          # JSON
    is_scan_pdf = Column(Integer, default=0)
    status = Column(String(32), default='ready')
    sort_order = Column(Integer, default=None)          # 书库手动排序，越小越靠前
    created_at = Column(String(32), default=None)      # datetime('now','localtime')
    updated_at = Column(String(32), default=None)
    last_read_at = Column(String(32), default=None)

    progress = relationship("ReadingProgress", uselist=False, back_populates="book", cascade="all, delete")
    notes = relationship("Note", back_populates="book", cascade="all, delete")
    bookmarks = relationship("Bookmark", back_populates="book", cascade="all, delete")
    translation_records = relationship("TranslationRecord", back_populates="book", cascade="all, delete")
    vocabulary = relationship("Vocabulary", back_populates="book", cascade="all, delete")
    knowledge_nodes = relationship("KnowledgeNode", back_populates="book", cascade="all, delete")
    knowledge_edges = relationship("KnowledgeEdge", back_populates="book", cascade="all, delete")


class ReadingProgress(Base):
    """阅读进度"""
    __tablename__ = 'reading_progress'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False, unique=True)
    current_page = Column(Integer, default=1)
    total_pages = Column(Integer, default=0)
    percentage = Column(Float, default=0)
    scroll_position = Column(Float, default=0)
    updated_at = Column(String(32), default=None)

    book = relationship("Book", back_populates="progress")


class Note(Base):
    """笔记"""
    __tablename__ = 'notes'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    page_num = Column(Integer, default=1)
    content = Column(Text, default='')
    selected_text = Column(Text, default='')
    color = Column(String(16), default='#FFD700')
    created_at = Column(String(32), default=None)
    updated_at = Column(String(32), default=None)

    book = relationship("Book", back_populates="notes")


class Bookmark(Base):
    """书签"""
    __tablename__ = 'bookmarks'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    page_num = Column(Integer, nullable=False)
    title = Column(String(256), default='')
    created_at = Column(String(32), default=None)

    book = relationship("Book", back_populates="bookmarks")


class TranslationRecord(Base):
    """翻译记录"""
    __tablename__ = 'translation_records'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=True)
    source_text = Column(Text, nullable=False)
    translated_text = Column(Text, nullable=False)
    source_lang = Column(String(16), default='auto')
    target_lang = Column(String(16), default='zh')
    created_at = Column(String(32), default=None)

    book = relationship("Book", back_populates="translation_records")


class Vocabulary(Base):
    """生词 / 摘录"""
    __tablename__ = 'vocabulary'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=True)
    word = Column(String(256), nullable=False)
    translation = Column(Text, default='')
    context = Column(Text, default='')
    page_num = Column(Integer, default=0)
    created_at = Column(String(32), default=None)

    book = relationship("Book", back_populates="vocabulary")


class KnowledgeNode(Base):
    """知识图谱节点"""
    __tablename__ = 'knowledge_nodes'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    node_id = Column(String(64), nullable=False)
    label = Column(String(256), nullable=False)
    node_type = Column(String(32), default='concept')
    level = Column(Integer, default=1)
    parent_id = Column(String(64), default=None)
    chapter = Column(String(256), default='')
    page_num = Column(Integer, default=0)
    description = Column(Text, default='')

    book = relationship("Book", back_populates="knowledge_nodes")
    edges_out = relationship("KnowledgeEdge", foreign_keys="KnowledgeEdge.source_id",
                             primaryjoin="KnowledgeNode.node_id==KnowledgeEdge.source_id",
                             viewonly=True)
    edges_in = relationship("KnowledgeEdge", foreign_keys="KnowledgeEdge.target_id",
                            primaryjoin="KnowledgeNode.node_id==KnowledgeEdge.target_id",
                            viewonly=True)


class KnowledgeEdge(Base):
    """知识图谱边"""
    __tablename__ = 'knowledge_edges'

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    source_id = Column(String(64), nullable=False)
    target_id = Column(String(64), nullable=False)
    relation_type = Column(String(32), default='related')
    label = Column(String(128), default='')

    book = relationship("Book", back_populates="knowledge_edges")


# 索引（SQLAlchemy 会在外键上自动创建部分索引）
__all__ = [
    'Book', 'ReadingProgress', 'Note', 'Bookmark',
    'TranslationRecord', 'Vocabulary', 'KnowledgeNode', 'KnowledgeEdge',
]
