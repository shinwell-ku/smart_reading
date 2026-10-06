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


def reset_engine():
    """
    释放连接池里的所有连接，并清掉 scoped_session 的会话。

    恢复备份时要替换 database.db 文件，必须先断开所有连接：
    连接池里的旧连接句柄仍指向被替换掉的旧 inode，不清掉的话
    后续查询读到的还是旧数据。

    调用后引擎仍可继续使用，下次访问会重新建立连接。
    """
    SessionLocal.remove()
    engine.dispose()


def _migrate(conn):
    """
    轻量迁移：create_all 只会建缺失的表，不会给已存在的表加字段，
    所以新增列要在这里补。

    加 books.sort_order（书库手动排序）。已有书目按 id 铺一份初始顺序，
    避免出现一堆 NULL 让排序逻辑处处要兜底。
    """
    cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(books)")}
    if 'sort_order' not in cols:
        conn.exec_driver_sql("ALTER TABLE books ADD COLUMN sort_order INTEGER")
        conn.exec_driver_sql("UPDATE books SET sort_order = id WHERE sort_order IS NULL")
        print("[数据库] 迁移: books 新增 sort_order")


def init_db():
    """创建所有表 + 执行轻量迁移"""
    import models  # noqa
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        _migrate(conn)
    print(f"[数据库] 初始化完成: {DB_PATH}")
