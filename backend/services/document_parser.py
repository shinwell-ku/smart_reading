"""
文档解析服务 - 支持 PDF/DOCX 格式解析
"""
import os
import re
import json
import tempfile


class DocumentParser:
    """文档解析器：统一解析 PDF/DOCX 为结构化全文文本"""

    def parse(self, file_path):
        """解析文档入口"""
        ext = os.path.splitext(file_path)[1].lower()
        if ext == '.pdf':
            return self._parse_pdf(file_path)
        elif ext == '.docx':
            return self._parse_docx(file_path)
        else:
            raise ValueError(f"不支持的文件格式: {ext}")

    def _parse_pdf(self, file_path):
        """
        解析 PDF 文件
        返回结构化数据，包含：标题、作者、总页数、章节树、全文文本、分页文本
        """
        import fitz  # PyMuPDF

        doc = fitz.open(file_path)
        total_pages = len(doc)
        metadata = doc.metadata or {}

        title = metadata.get('title', '') or os.path.splitext(os.path.basename(file_path))[0]
        author = metadata.get('author', '未知')

        pages = []
        full_text_parts = []
        chapters = []
        scan_page_count = 0  # 扫描页计数
        text_page_count = 0  # 文本页计数

        # 优先使用 PDF 内嵌目录（bookmarks/outline）
        try:
            toc = doc.get_toc()
            if toc and len(toc) > 0:
                chapters = [{"title": item[1], "page": item[2], "level": item[0]} for item in toc]
        except Exception:
            pass

        for page_num in range(total_pages):
            page = doc.load_page(page_num)
            text = page.get_text()

            if text.strip():
                text_page_count += 1
            else:
                scan_page_count += 1

            # 提取页面文本
            page_text = text.strip()
            pages.append(page_text)
            full_text_parts.append(page_text)

            # 仅在 PDF 无内嵌目录时，从文本中识别章节标题
            if not chapters and page_text:
                lines = page_text.split('\n')
                for line in lines[:3]:
                    line = line.strip()
                    if line and self._is_chapter_heading(line, page_num + 1):
                        chapters.append({
                            "title": line,
                            "page": page_num + 1,
                            "level": self._detect_heading_level(line)
                        })

        doc.close()

        full_text = '\n'.join(full_text_parts)
        total_chars = len(full_text.replace(' ', '').replace('\n', ''))

        # 判断是否为扫描版PDF
        is_scan_pdf = (scan_page_count > 0 and text_page_count == 0) or (
                scan_page_count > total_pages * 0.8 and total_pages > 5
        )

        # 构建章节层级树
        chapter_tree = self._build_chapter_tree(chapters)

        return {
            "title": title,
            "author": author,
            "total_pages": total_pages,
            "total_chars": total_chars,
            "chapters": chapter_tree,
            "full_text": full_text,
            "pages": pages,
            "is_scan_pdf": is_scan_pdf
        }

    def _parse_docx(self, file_path):
        """
        解析 DOCX 文件
        """
        from docx import Document

        doc = Document(file_path)

        # 提取元数据
        title = os.path.splitext(os.path.basename(file_path))[0]
        author = '未知'
        try:
            core_props = doc.core_properties
            if core_props.title:
                title = core_props.title
            if core_props.author:
                author = core_props.author
        except:
            pass

        chapters = []
        full_text_parts = []
        current_chapter = None

        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue

            style_name = para.style.name.lower() if para.style else ''

            # 识别章节标题
            if 'heading' in style_name or '标题' in style_name:
                level = 1
                if 'heading 1' in style_name or '标题 1' in style_name:
                    level = 1
                elif 'heading 2' in style_name or '标题 2' in style_name:
                    level = 2
                elif 'heading 3' in style_name or '标题 3' in style_name:
                    level = 3
                elif 'heading' in style_name:
                    try:
                        level = int(style_name.split()[-1])
                    except:
                        level = 1

                chapters.append({
                    "title": text,
                    "page": len(full_text_parts) // 40 + 1,
                    "level": level
                })
                current_chapter = text

            full_text_parts.append(text)

        full_text = '\n'.join(full_text_parts)
        total_chars = len(full_text.replace(' ', '').replace('\n', ''))

        # 模拟分页（按每页约40行估算）
        simulated_pages = []
        lines_per_page = 40
        lines = full_text.split('\n')
        for i in range(0, len(lines), lines_per_page):
            simulated_pages.append('\n'.join(lines[i:i + lines_per_page]))

        chapter_tree = self._build_chapter_tree(chapters)

        return {
            "title": title,
            "author": author,
            "total_pages": len(simulated_pages),
            "total_chars": total_chars,
            "chapters": chapter_tree,
            "full_text": full_text,
            "pages": simulated_pages,
            "is_scan_pdf": False
        }

    def _is_chapter_heading(self, line, page_num):
        """判断是否为章节标题"""
        # 匹配常见章节标题模式
        patterns = [
            r'^第[一二三四五六七八九十百千万]+[章节篇部]',  # 第一章、第二节
            r'^第\d+[章节篇部]',                           # 第1章、第2节
            r'^\d+\.\d*\s+[A-Z一-鿿]',            # 1.1 标题、1.2 标题
            r'^[A-Z][a-z]*\s+\d+[\.:]\s',                  # Chapter 1:、Chapter 1.
            r'^\d+\s+[A-Z一-鿿]',                  # 1 标题 或 2 标题
            r'^(Part|Section|Chapter|CHAPTER)\s+\d+',       # Part 1、Section 2
            r'^前言|引言|绪论|概述|导言|摘要',               # 常见章节名称
            r'^附录|参考文献|后记|致谢|索引',
        ]
        for pattern in patterns:
            if re.match(pattern, line.strip()):
                return True
        return False

    def _detect_heading_level(self, line):
        """检测标题层级"""
        if re.match(r'^第[一二三四五六七八九十百千万]+[章节篇部]', line):
            return 1
        if re.match(r'^第\d+[章节篇部]', line):
            return 1
        if re.match(r'^前言|引言|绪论|概述', line):
            return 1
        if re.match(r'^\d+\.\d+\s', line):
            return 2
        if re.match(r'^\d+\.\d+\.\d+\s', line):
            return 3
        return 2

    def _build_chapter_tree(self, chapters):
        """构建章节层级树"""
        tree = []
        stack = []

        for ch in chapters:
            node = {
                "title": ch["title"],
                "page": ch["page"],
                "level": ch["level"],
                "children": []
            }

            while stack and stack[-1]["level"] >= ch["level"]:
                stack.pop()

            if stack:
                stack[-1]["children"].append(node)
            else:
                tree.append(node)

            stack.append(node)

        return tree


# 工具函数：PDF 文本清洗
def clean_pdf_text(text):
    """清洗PDF提取文本，去除水印、页眉页脚、冗余空白"""
    lines = text.split('\n')
    cleaned = []

    # 常见页眉页脚模式
    header_footer_patterns = [
        r'^\d+$',                                    # 纯页码
        r'^第\s*\d+\s*页$',                           # 第 1 页
        r'^-\s*\d+\s*-$',                             # - 1 -
        r'^[\s\-_]*$',                                # 纯空白或分隔线
        r'^www\.\S+\.\w+',                            # 网址
        r'^\d+/\d+$',                                 # 如 1/10
    ]

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        is_noise = False
        for pattern in header_footer_patterns:
            if re.match(pattern, stripped):
                is_noise = True
                break

        if not is_noise:
            cleaned.append(line)

    return '\n'.join(cleaned)
