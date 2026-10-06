"""
文档解析服务 - 支持 PDF / DOCX / TXT / Markdown / HTML 解析

所有格式最终都归一到同一套结构（full_text + pages + chapters），
翻译、知识抽取、检索等都只消费这个结构，与源格式无关。
"""
import os
import re
import json
import tempfile
from collections import Counter

# 块级元素：文本类格式按块产出「行」，模拟分页时按行数切
_BLOCK_TAGS = {
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'pre',
    'blockquote', 'figcaption', 'td', 'th', 'dd', 'dt',
}
_HEADING_TAGS = {'h1': 1, 'h2': 2, 'h3': 3, 'h4': 4, 'h5': 5, 'h6': 6}
_SKIP_TAGS = {'script', 'style', 'noscript', 'template', 'head'}

# 零宽字符在 PDF 抽取和网页复制的内容里很常见。
# 注意 Python 的 str.strip() 不把它们当空白，留着会让以 $ 结尾的正则匹配不上，
# 也会污染全文、翻译和检索，所以在源头统一清掉。
_INVISIBLE = dict.fromkeys(map(ord, '​‌‍⁠﻿­'))


def strip_invisible(text):
    """去掉零宽 / 不可见字符"""
    return text.translate(_INVISIBLE) if text else text


class DocumentParser:
    """文档解析器：统一解析各类文档为结构化全文文本"""

    def parse(self, file_path):
        """解析文档入口"""
        ext = os.path.splitext(file_path)[1].lower()
        if ext == '.pdf':
            return self._parse_pdf(file_path)
        elif ext == '.docx':
            return self._parse_docx(file_path)
        elif ext in ('.txt', '.text'):
            return self._parse_plain_text(file_path, markdown=False)
        elif ext in ('.md', '.markdown'):
            return self._parse_plain_text(file_path, markdown=True)
        elif ext in ('.html', '.htm', '.xhtml'):
            return self._parse_html(file_path)
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

            # 提取页面文本（清掉零宽字符，否则会污染全文/翻译/检索）
            page_text = strip_invisible(text).strip()
            pages.append(page_text)
            full_text_parts.append(page_text)

        # 没有内嵌书签、也不是扫描件时，用字号识别标题
        if not chapters and text_page_count > 0:
            chapters = self._extract_pdf_outline_by_font(doc)

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

        paragraphs = list(doc.paragraphs)

        # 正文行 + 每个非空段落落在第几行
        # （注意：Word 的自动编号不在 paragraph.text 里，正文标题只拿得到文字本身）
        lines = []
        line_no = {}
        for i, para in enumerate(paragraphs):
            text = para.text.strip()
            if text:
                line_no[i] = len(lines)
                lines.append(text)

        # 策略一：用文档自带的目录（Word 自动生成的 toc 1 / toc 2 / ... 段落）。
        # 它是文档自己的目录，带原始编号和层级，比我们猜准得多；
        # 这类文档的正文标题往往是 Normal 样式 + 自动编号，按标题样式根本找不到。
        chapters = self._docx_chapters_from_toc(paragraphs, lines)

        # 策略二：没有目录字段的文档，退回按标题样式识别
        if not chapters:
            chapters = self._docx_chapters_from_styles(paragraphs, line_no, lines)

        full_text = '\n'.join(lines)
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

    @staticmethod
    def _style_level(style_name, default=1):
        """从样式名里取层级：'heading 2' / '标题 3' / 'toc 1' / '二级标题' 都能认"""
        m = re.search(r'(\d+)\s*$', style_name)
        if m:
            return int(m.group(1))
        m = re.search(r'([一二三四五六七八九十])级', style_name)
        if m:
            return '一二三四五六七八九十'.index(m.group(1)) + 1
        return default

    def _docx_chapters_from_toc(self, paragraphs, lines):
        """
        从 Word 自动生成的目录段落（toc N 样式）里取章节。

        这些段落的文本形如 '1.3.1\\t用户范围\\t8'（编号 \\t 标题 \\t 页码），
        层级由样式名给出。没有页码的那条（如 '目    录'）是目录自身的标题，跳过。

        页码不直接用 Word 的：它基于 Word 自己的排版，和本应用的模拟分页
        （40 行一页）对不上，直接用会跳错位置。这里按正文顺序定位每个标题
        的落点，换算成本应用自己的页码。
        """
        entries = []
        for para in paragraphs:
            style = (para.style.name or '').lower()
            if not style.startswith('toc'):
                continue
            parts = [x.strip() for x in para.text.split('\t') if x.strip()]
            if len(parts) < 2 or not parts[-1].isdigit():
                continue

            # 制表符的分法各层级不一致：
            #   toc 1/2 → ['1', '概述', '5']        编号与标题分开
            #   toc 3   → ['1.3.1 用户范围', '8']   编号与标题挤在同一段
            # 所以统一把「页码之前的部分」拼起来，再从中拆出前导编号。
            body = ' '.join(parts[:-1]).strip()
            m = re.match(r'^((?:\d+\.)*\d+|[一二三四五六七八九十]+[、.．]?)\s*(.+)$', body)
            if m:
                number, title = m.group(1), m.group(2).strip()
            else:
                number, title = '', body
            if not title:
                continue

            entries.append({
                "number": number,
                "title": title,
                "level": self._style_level(style),
            })

        if not entries:
            return []

        chapters = []
        cursor = 0
        for e in entries:
            pos = None
            for j in range(cursor, len(lines)):
                if lines[j] == e["title"]:      # 精确匹配，避免命中目录行自身
                    pos = j
                    break
            if pos is None:
                pos = cursor                     # 找不到就沿用上一个位置，避免页码乱跳
            else:
                cursor = pos + 1
            chapters.append({
                "title": f'{e["number"]} {e["title"]}'.strip(),
                "page": pos // 40 + 1,
                "level": e["level"],
            })
        return chapters

    def _docx_chapters_from_styles(self, paragraphs, line_no, lines):
        """没有目录字段时，按标题样式（Heading N / 标题 N）识别章节"""
        chapters = []
        for i, para in enumerate(paragraphs):
            style = (para.style.name or '').lower()
            if not ('heading' in style or '标题' in style):
                continue
            text = para.text.strip()
            if not text:
                continue
            chapters.append({
                "title": text,
                "page": line_no.get(i, 0) // 40 + 1,
                "level": self._style_level(style),
            })
        return chapters

    # ---------- 纯文本 / Markdown / HTML ----------

    @staticmethod
    def _read_text_file(file_path):
        """按常见编码依次尝试读取文本（utf-8 → gbk → latin-1 兜底）"""
        for enc in ('utf-8-sig', 'utf-8', 'gbk', 'big5', 'latin-1'):
            try:
                with open(file_path, 'r', encoding=enc) as f:
                    return f.read()
            except (UnicodeDecodeError, UnicodeError):
                continue
            except LookupError:
                continue
        raise ValueError("无法识别文件编码")

    def _build_text_result(self, file_path, lines, chapters, title=None, author='未知'):
        """文本类格式的公共出口：与 _parse_docx 输出同一套结构"""
        full_text = '\n'.join(lines)
        total_chars = len(full_text.replace(' ', '').replace('\n', ''))

        # 模拟分页，与 DOCX 保持一致（每页约 40 行）
        lines_per_page = 40
        pages = [
            '\n'.join(lines[i:i + lines_per_page])
            for i in range(0, len(lines), lines_per_page)
        ]

        return {
            "title": title or os.path.splitext(os.path.basename(file_path))[0],
            "author": author,
            "total_pages": len(pages),
            "total_chars": total_chars,
            "chapters": self._build_chapter_tree(chapters),
            "full_text": full_text,
            "pages": pages,
            "is_scan_pdf": False,
        }

    @staticmethod
    def _strip_markdown_inline(text):
        """去掉行内的 Markdown 记号，让正文在阅读器里能直接读"""
        text = re.sub(r'!\[([^\]]*)\]\([^)]*\)', r'\1', text)   # 图片 → alt
        text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)    # 链接 → 文字
        text = re.sub(r'`{1,3}([^`]*)`{1,3}', r'\1', text)      # 行内代码
        text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)          # 粗体
        text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'\1', text)  # 斜体
        text = re.sub(r'~~([^~]+)~~', r'\1', text)              # 删除线
        text = re.sub(r'^\s{0,3}>\s?', '', text)                # 引用
        return text.strip()

    def _parse_plain_text(self, file_path, markdown=False):
        """
        解析 TXT / Markdown。
        Markdown 额外识别 # ~ ###### 标题作为章节，并去掉行内记号。
        """
        raw = self._read_text_file(file_path)
        lines = []
        chapters = []

        for raw_line in raw.split('\n'):
            line = raw_line.rstrip()
            if not line.strip():
                continue                     # 去空行，与 DOCX 路径一致

            level = 0
            if markdown:
                m = re.match(r'^\s{0,3}(#{1,6})\s+(.*)$', line)
                if m:
                    level = len(m.group(1))
                    line = self._strip_markdown_inline(m.group(2))
                else:
                    line = self._strip_markdown_inline(line)
            else:
                # 纯文本也尝试识别常见中文章节标题
                if self._is_chapter_heading(line, 0):
                    level = self._detect_heading_level(line)

            if not line.strip():
                continue

            if level > 0:
                chapters.append({
                    "title": line[:100],
                    "page": len(lines) // 40 + 1,
                    "level": level,
                })
            lines.append(line)

        title = None
        if markdown:
            # 用首个一级标题当书名
            for ch in chapters:
                if ch["level"] == 1:
                    title = ch["title"]
                    break

        return self._build_text_result(file_path, lines, chapters, title=title)

    def _parse_html(self, file_path):
        """解析 HTML：去脚本样式，按最内层块级元素取正文，h1~h6 作章节"""
        try:
            from lxml import html as lxml_html
        except ImportError:
            raise ValueError("解析 HTML 需要 lxml，请先安装后端依赖")

        raw = self._read_text_file(file_path)
        try:
            root = lxml_html.fromstring(raw)
        except Exception as e:
            raise ValueError(f"HTML 解析失败: {e}")

        # <title> 当书名
        title = None
        t = root.find('.//title')
        if t is not None and (t.text or '').strip():
            title = ' '.join(t.text.split())[:120]

        lines = []
        chapters = []

        for el in root.iter():
            if not isinstance(el.tag, str):
                continue                      # 注释 / 处理指令
            tag = el.tag.lower()
            if tag in _SKIP_TAGS:
                continue
            if tag not in _BLOCK_TAGS:
                continue
            # 只取最内层块级元素，否则父块会把子块文本整段吞掉造成重复
            if any(isinstance(d.tag, str) and d.tag.lower() in _BLOCK_TAGS
                   for d in el.iterdescendants()):
                continue

            text = ' '.join((el.text_content() or '').split())
            if not text:
                continue

            if tag in _HEADING_TAGS:
                chapters.append({
                    "title": text[:100],
                    "page": len(lines) // 40 + 1,
                    "level": _HEADING_TAGS[tag],
                })
            lines.append(text)

        if not lines:
            raise ValueError("该 HTML 文件没有可提取的正文")

        return self._build_text_result(file_path, lines, chapters, title=title)

    # ---------- PDF 无书签时的标题识别 ----------

    @staticmethod
    def _has_word_char(text):
        """是否含实义字符（排除纯项目符号 / 装饰线 / 页码）"""
        return bool(re.search(r'[0-9A-Za-z一-鿿]', text))

    @staticmethod
    def _looks_like_heading(text):
        """
        字号够大之外，还得分得像标题。

        有些正文列表项（如「◦遍历第N条规则→…；」）排版字号和真标题一样大，
        只靠字号分不开。两条通用规则可以滤掉它们：
        标题不会以句末标点收尾，也不会以项目符号开头。
        """
        if len(text) > 40:
            return False
        if re.search(r'[。；，、,;.]$', text):      # 以句末标点结尾 → 是句子
            return False
        if re.match(r'^\s*[•◦▪▫‣⁃·∙・*\-–—o]\s+', text):  # 项目符号开头 → 是列表项
            return False
        return True

    def _extract_pdf_outline_by_font(self, doc):
        """
        PDF 没有内嵌书签时，按字号识别章节标题。

        为什么不用逐行正则：正文里的「1. xxx；2. yyy」这类编号句子
        会被正则当成标题，而真正的大号标题反而漏掉。
        字号才是 PDF 里区分标题与正文的可靠信号——正文占据绝大多数字符，
        标题明显更大。

        返回 [{"title", "page", "level"}, ...]
        """
        size_chars = Counter()      # 字号 → 字符数（正文字号取众数最稳）
        page_lines = []             # [(页码, [(行文本, 该行最大字号), ...]), ...]

        for pno in range(len(doc)):
            lines = []
            try:
                blocks = doc.load_page(pno).get_text('dict').get('blocks', [])
            except Exception:
                page_lines.append((pno + 1, lines))
                continue
            for b in blocks:
                for l in b.get('lines', []):
                    spans = [s for s in l.get('spans', []) if s.get('text', '').strip()]
                    if not spans:
                        continue
                    txt = strip_invisible(''.join(s['text'] for s in spans)).strip()
                    mx = max((s.get('size', 0) for s in spans), default=0)
                    if txt and mx > 0:
                        lines.append((txt, mx))
                        size_chars[round(mx, 1)] += len(txt)
            page_lines.append((pno + 1, lines))

        if not size_chars:
            return []
        body_size = size_chars.most_common(1)[0][0]

        # 候选：明显大于正文、够短（标题不会是一整句）、含实义字符
        candidates = []
        for pno, lines in page_lines:
            for txt, size in lines:
                if size < body_size * 1.12:
                    continue
                if not self._has_word_char(txt):
                    continue
                if not self._looks_like_heading(txt):
                    continue
                candidates.append({"page": pno, "title": txt, "size": round(size, 1)})

        if not candidates:
            return []

        # 书眉/页脚会在几乎每页重复出现，按出现频率剔掉
        text_pages = Counter(c["title"] for c in candidates)
        page_total = max(len(page_lines), 1)
        repeated = {t for t, n in text_pages.items() if n > page_total * 0.3}
        candidates = [c for c in candidates if c["title"] not in repeated]

        if not candidates:
            return []

        # 字号降序排名 → 层级；只出现一次且在第 1 页的最大字号是书名，跳过
        distinct = sorted({c["size"] for c in candidates}, reverse=True)
        if len(distinct) > 1:
            top = distinct[0]
            top_items = [c for c in candidates if c["size"] == top]
            if len(top_items) == 1 and top_items[0]["page"] == 1:
                candidates = [c for c in candidates if c["size"] != top]
                distinct = distinct[1:]

        level_of = {s: i + 1 for i, s in enumerate(distinct)}

        # 按文档顺序输出，并去掉连续的重复项
        out = []
        for c in candidates:
            if out and out[-1]["title"] == c["title"] and out[-1]["page"] == c["page"]:
                continue
            out.append({
                "title": c["title"],
                "page": c["page"],
                "level": level_of.get(c["size"], 1),
            })
        return out

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
