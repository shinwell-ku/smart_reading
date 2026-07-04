"""
路由注册 — 将所有 Blueprint 挂载到 app
"""
from flask import Flask


def register_routes(app: Flask):
    """按功能模块注册所有路由蓝图"""
    from .system import system_bp
    from .books import books_bp
    from .progress import progress_bp
    from .notes import notes_bp
    from .bookmarks import bookmarks_bp
    from .translation import translation_bp
    from .knowledge import knowledge_bp
    from .search import search_bp

    app.register_blueprint(system_bp)
    app.register_blueprint(books_bp)
    app.register_blueprint(progress_bp)
    app.register_blueprint(notes_bp)
    app.register_blueprint(bookmarks_bp)
    app.register_blueprint(translation_bp)
    app.register_blueprint(knowledge_bp)
    app.register_blueprint(search_bp)
