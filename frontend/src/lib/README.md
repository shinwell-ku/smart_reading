# 离线依赖库

此目录存放离线前端依赖库文件（无需安装 npm 包）。

## ECharts

知识图谱可视化依赖 ECharts。将 `echarts.min.js` 放置在此目录。

### 获取方式

1. 从 ECharts 官方 GitHub Releases 下载：
   https://github.com/apache/echarts/releases

2. 或使用 npm 安装后复制：
   ```bash
   cd electron
   npm install echarts
   cp node_modules/echarts/dist/echarts.min.js src/lib/
   ```

3. 在 index.html 中已通过以下方式引用：
   ```html
   <script src="lib/echarts.min.js"></script>
   ```

> 注意：所有前端依赖必须本地化，禁止从 CDN 加载。
