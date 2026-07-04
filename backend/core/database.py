"""
SQLAlchemy 引擎与会话管理
"""
import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, scoped_session, declarative_base

from core.config import DB_DIR as _DB_DIR

DB_PATH = os.path.join(_DB_DIR, 'database.db')
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False}, pool_size=20, max_overflow=40)

# WAL 模式 + 外键约束
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))
Base = declarative_base()


def get_db():
    """获取当前线程的数据库会话"""
    return SessionLocal()


def init_db():
    """创建所有表"""
    import models  # noqa
    Base.metadata.create_all(bind=engine)
    print(f"[数据库] 初始化完成: {DB_PATH}")
