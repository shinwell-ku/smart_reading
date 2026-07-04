"""
AI智慧阅读 - 后端入口
"""
import os
import sys

# 确保 backend 目录在路径中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from core.database import init_db
from core.config import DATA_DIR, BASE_DIR
from routes import register_routes


def create_app():
    """应用工厂"""
    app = Flask(__name__)
    CORS(app)

    # 注册路由蓝图
    register_routes(app)

    return app


# 创建全局应用实例
app = create_app()


if __name__ == '__main__':
    init_db()

    # 前端静态文件服务（生产构建后）
    frontend_dist = os.path.join(os.path.dirname(BASE_DIR), 'electron', 'dist')
    if os.path.exists(frontend_dist):
        from flask import send_from_directory
        @app.route('/')
        def serve_frontend():
            return send_from_directory(frontend_dist, 'index.html')
        @app.route('/<path:path>')
        def serve_static(path):
            return send_from_directory(frontend_dist, path)

    print("=" * 50)
    print("AI 智慧阅读后端服务已启动")
    print(f"数据目录: {DATA_DIR}")
    print("=" * 50)

    app.run(host='127.0.0.1', port=5001, threaded=True)
