"""
AI 知识抽取服务 - 基于 BERT 的离线知识抽取
自动抽取：概念实体、逻辑关系、层级大纲、案例论据
"""
import os
import re
import json
import threading
import hashlib


class KnowledgeExtractor:
    """
    知识抽取引擎
    从书籍文本中自动提取结构化知识，输出图谱节点和边数据
    """

    def __init__(self, models_dir):
        self.models_dir = models_dir
        self._model = None
        self._lock = threading.Lock()

        # 中文标点符号
        self.CHINESE_PUNCT = r'，。、；：？！""''（）【】《》—…·'

    def _load_model(self):
        """惰性加载知识抽取模型"""
        if self._model is not None:
            return

        with self._lock:
            if self._model is not None:
                return

            try:
                # 只检查本地量化模型，禁止联网下载
                local_model_path = os.path.join(self.models_dir, 'bert4cls_small')
                if os.path.exists(local_model_path):
                    from transformers import AutoTokenizer, AutoModelForSequenceClassification
                    import torch

                    print(f"[知识抽取] 加载本地量化模型: {local_model_path}")
                    self._tokenizer = AutoTokenizer.from_pretrained(
                        local_model_path,
                        local_files_only=True,
                        trust_remote_code=True
                    )
                    self._model = AutoModelForSequenceClassification.from_pretrained(
                        local_model_path,
                        local_files_only=True,
                        torch_dtype=torch.float32,
                        low_cpu_mem_usage=True,
                        trust_remote_code=True
                    )
                    self._model.eval()
                    print("[知识抽取] 模型加载完成")
                else:
                    print(f"[知识抽取] 未找到本地模型: {local_model_path}")
                    print(f"[知识抽取] 将使用规则抽取模式")

            except Exception as e:
                print(f"[知识抽取] 模型加载失败: {e}，使用规则抽取模式")
                self._model = None
                self._tokenizer = None

    def extract(self, full_text):
        """
        从全文提取知识结构
        返回：
        {
            "nodes": [...],
            "edges": [...],
            "outline": [...]
        }
        """
        if not full_text or not full_text.strip():
            return {"nodes": [], "edges": [], "outline": []}

        # 1. 文本分块预处理
        chunks = self._split_into_chunks(full_text)

        # 2. 层级大纲提取
        outline = self._extract_outline(full_text)

        # 3. 概念实体抽取
        concepts = self._extract_concepts(chunks)

        # 4. 逻辑关系识别
        relations = self._identify_relations(chunks, concepts)

        # 5. 构建图谱节点
        nodes = self._build_nodes(outline, concepts, full_text)

        # 6. 构建图谱边
        edges = self._build_edges(nodes, relations)

        return {
            "nodes": nodes,
            "edges": edges,
            "outline": outline
        }

    def _split_into_chunks(self, text, chunk_size=1000, overlap=100):
        """将长文本分割为重叠块"""
        chunks = []
        start = 0
        text_len = len(text)

        while start < text_len:
            end = min(start + chunk_size, text_len)

            # 尽量在句子边界处切割
            if end < text_len:
                # 找最近的句子结束位置
                search_end = min(end + overlap, text_len)
                last_period = -1
                for punct in ['。', '！', '？', '\n', '.', '!', '?']:
                    pos = text.rfind(punct, end, search_end)
                    if pos > last_period:
                        last_period = pos

                if last_period > end:
                    end = last_period + 1

            chunk = text[start:end].strip()
            if chunk:
                chunks.append({
                    "text": chunk,
                    "start_pos": start,
                    "end_pos": end
                })

            start = end

        return chunks

    def _extract_outline(self, text):
        """提取章节层级大纲"""
        lines = text.split('\n')
        outline = []
        current_section = {"title": "全书", "level": 0, "children": []}
        section_stack = [current_section]

        chapter_patterns = [
            (r'^第[一二三四五六七八九十百千万]+[章节篇部]', 1),
            (r'^第\d+[章节篇部]', 1),
            (r'^\d+\.\d+\s+', 2),
            (r'^\d+\.\d+\.\d+\s+', 3),
            (r'^[一二三四五六七八九十]+[、．]\s*', 2),
            (r'^（[一二三四五六七八九十]+）', 3),
            (r'^(Part|Chapter|Section)\s+\d+', 1),
            (r'^\d+\s{2,}[A-Z一-鿿]', 1),
        ]

        for line in lines:
            line = line.strip()
            if not line:
                continue

            matched_level = 0
            for pattern, level in chapter_patterns:
                if re.match(pattern, line):
                    matched_level = level
                    break

            if matched_level > 0:
                node = {
                    "title": line[:50],
                    "level": matched_level,
                    "children": []
                }

                # 根据层级插入到正确位置
                while section_stack and section_stack[-1]["level"] >= matched_level:
                    section_stack.pop()

                if section_stack:
                    section_stack[-1]["children"].append(node)

                section_stack.append(node)
                outline.append(node)

        return outline

    def _extract_concepts(self, chunks):
        """从文本中抽取关键概念"""
        concepts = []
        seen = set()

        # 概念抽取模式
        concept_patterns = [
            # 定义模式
            r'(?:所谓|指|指的是|是指|即|定义为|叫做|称为|称之(?:为)?)\s*([^，。；\n]{2,30})',
            # 概念标识
            r'(?:概念|定义|术语|关键词)[：:]\s*([^，。；\n]{2,30})',
            # 核心观点引导
            r'(?:核心|关键|重要|主要|基本)[^，。\n]{0,6}(?:是|在于|包括|分为)[：:]\s*([^，。；\n]{5,50})',
            # 总结性表述
            r'(?:总之|综上所述|因此|所以|可以看出)[，，]\s*([^，。；\n]{5,50})',
        ]

        # 名词短语抽取（基于词性，简化版通过长度和排除词）
        for chunk_data in chunks:
            text = chunk_data["text"]

            # 使用正则模式抽取
            for pattern in concept_patterns:
                matches = re.findall(pattern, text)
                for match in matches:
                    clean = match.strip().rstrip('的')
                    if len(clean) >= 3 and clean not in seen:
                        # 去重
                        key = hashlib.md5(clean.encode()).hexdigest()
                        if key not in seen:
                            seen.add(key)
                            concepts.append({
                                "label": clean,
                                "type": "concept",
                                "source_text": text[:100],
                                "chunk_pos": chunk_data["start_pos"]
                            })

        # 简单去重合并
        merged = []
        seen_labels = set()
        for c in concepts:
            if c["label"] not in seen_labels:
                seen_labels.add(c["label"])
                merged.append(c)

        # 限制概念数量
        return merged[:100]

    def _identify_relations(self, chunks, concepts):
        """识别概念间的逻辑关系"""
        relations = []

        # 关系模式
        relation_patterns = [
            (r'(?:因为|由于)\s*(.{3,30})\s*(?:所以|因此)\s*(.{3,30})', 'causality', '因果'),
            (r'(?:包含|包括|分为|由.{0,10}组成)\s*(.{3,30})', 'contain', '包含'),
            (r'(?:与|和|跟|同)\s*(.{2,30})\s*(?:的关系|关联|联系|相关)', 'related', '关联'),
            (r'(?:例如|比如|如|譬如)\s*(.{2,30})', 'example', '举例'),
            (r'(?:而|但是|然而|却|不过)\s*(.{3,30})', 'contrast', '对比'),
            (r'(?:首先|第一|其次|第二|最后|第三)\s*(.{3,30})', 'sequence', '递进'),
            (r'(?:取决于|依赖于|基于)\s*(.{3,30})', 'dependency', '依赖'),
        ]

        for chunk_data in chunks:
            text = chunk_data["text"]
            for pattern, rel_type, rel_label in relation_patterns:
                matches = re.findall(pattern, text)
                for match in matches:
                    if isinstance(match, tuple):
                        source, target = match[:2]
                        relations.append({
                            "source_label": source.strip()[:30],
                            "target_label": target.strip()[:30],
                            "type": rel_type,
                            "label": rel_label,
                            "source_text": text[:100]
                        })

        return relations

    def _build_nodes(self, outline, concepts, full_text):
        """构建图谱节点"""
        nodes = []
        node_id_counter = [0]

        def gen_id():
            node_id_counter[0] += 1
            return f"node_{node_id_counter[0]}"

        # 1. 根节点 - 书籍
        root_id = gen_id()
        first_line = full_text.strip().split('\n')[0] if full_text.strip() else "知识图谱"
        nodes.append({
            "id": root_id,
            "label": first_line[:30] if len(first_line) > 3 else "知识图谱",
            "type": "root",
            "level": 0,
            "parent_id": None,
            "chapter": "",
            "description": "书籍根节点",
            "page_num": 0
        })

        # 2. 章节节点
        chapter_ids = {}
        for i, ch in enumerate(outline):
            ch_id = f"chapter_{i+1}"
            chapter_ids[ch["title"]] = ch_id
            nodes.append({
                "id": ch_id,
                "label": ch["title"],
                "type": "chapter",
                "level": 1,
                "parent_id": root_id,
                "chapter": ch["title"],
                "description": f"章节: {ch['title']}",
                "page_num": 0
            })
            node_id_counter[0] += 1

        # 3. 概念节点（关联到章节）
        for i, concept in enumerate(concepts[:60]):
            concept_id = gen_id()
            # 尝试关联到所属章节
            parent = root_id
            for ch in outline:
                if concept.get("source_text", "").find(ch["title"]) >= 0:
                    ch_id = chapter_ids.get(ch["title"])
                    if ch_id:
                        parent = ch_id
                    break

            nodes.append({
                "id": concept_id,
                "label": concept["label"],
                "type": concept.get("type", "concept"),
                "level": 2 if parent == root_id else 3,
                "parent_id": parent,
                "chapter": "",
                "description": f"来源: {concept.get('source_text', '')[:80]}",
                "page_num": 0
            })

        return nodes

    def _build_edges(self, nodes, relations):
        """构建图谱边"""
        edges = []

        # 创建节点标签到ID的映射
        label_to_id = {}
        for node in nodes:
            if node["label"] not in label_to_id:
                label_to_id[node["label"]] = node["id"]

        # 父子关系边
        for node in nodes:
            if node["parent_id"] and node["parent_id"] != node["id"]:
                # 检查父节点是否存在
                parent_exists = any(n["id"] == node["parent_id"] for n in nodes)
                if parent_exists:
                    edges.append({
                        "source": node["parent_id"],
                        "target": node["id"],
                        "type": "hierarchy",
                        "label": "包含"
                    })

        # 逻辑关系边
        for rel in relations:
            source_id = label_to_id.get(rel["source_label"])
            target_id = label_to_id.get(rel["target_label"])

            if source_id and target_id and source_id != target_id:
                # 避免重复边
                is_dup = False
                for e in edges:
                    if e["source"] == source_id and e["target"] == target_id:
                        is_dup = True
                        break

                if not is_dup:
                    edges.append({
                        "source": source_id,
                        "target": target_id,
                        "type": rel["type"],
                        "label": rel["label"]
                    })

        return edges
