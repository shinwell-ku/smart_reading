"""
AI智慧阅读 - 后端入口
"""
import os
import sys
import socket
import subprocess

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


HOST = '127.0.0.1'
PORT = 5001

# 全局错误处理器，防止路由异常导致进程退出
import traceback
from flask import jsonify


@app.errorhandler(Exception)
def handle_all_exceptions(e):
    """捕获所有未处理异常，记录日志并返回 500"""
    traceback.print_exc()
    return jsonify({"error": f"服务器内部错误: {str(e)}", "code": "INTERNAL_ERROR"}), 500


if __name__ == '__main__':
    # 清理占用端口的残留进程
    try:
        import subprocess, time
        pids = subprocess.check_output(['lsof', '-ti', f'tcp:{PORT}'], text=True).strip().split()
        for pid in pids:
            print(f"[启动] 清理残留进程 PID={pid}")
            subprocess.run(['kill', '-9', pid], capture_output=True)
        if pids:
            time.sleep(1)
    except Exception:
        pass

    init_db()

    # 前端静态文件服务（生产构建后）
    frontend_dist = os.path.join(os.path.dirname(BASE_DIR), 'frontend', 'dist')
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

    try:
        app.run(host=HOST, port=PORT, threaded=True)
    except Exception as e:
        print(f"[错误] 服务异常退出: {e}")
        traceback.print_exc()
