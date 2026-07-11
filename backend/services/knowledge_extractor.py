"""
知识抽取服务 — 规则 / LLM 知识图谱提取
"""
import os
import re
import json
import hashlib

# LLM 抽取指令模板
EXTRACT_SYSTEM_PROMPT = """你是一个知识图谱构建专家。分析文本，提取其中的实体和关系。

要求：
1. 实体：重要概念、术语、技术、人物、方法等
2. 关系：实体之间的因果关系、包含关系、依赖关系、关联关系等
3. 属性：实体的关键特征

只返回 JSON 格式：
{
  "entities": [
    {"name": "实体名", "type": "concept|technology|method|person|term", "description": "简要描述"}
  ],
  "relations": [
    {"source": "实体A", "target": "实体B", "type": "causality|contains|depends_on|related_to", "description": "关系描述"}
  ]
}
不要包含任何其他文字，只返回 JSON。"""


class KnowledgeExtractor:
    """知识抽取引擎 — 从书籍文本中提取结构化知识，输出图谱节点和边数据"""

    def __init__(self, config=None):
        self._config = config  # TranslatorConfig，复用远程 LLM 配置
        self.CHINESE_PUNCT = r'，。、；：？！""''（）【】《》—…·'

    def _reload_config(self):
        """热加载配置"""
        try:
            from core.translator_config import load_config
            self._config = load_config()
        except Exception:
            pass

    def extract(self, full_text):
        """从全文提取知识结构"""
        self._reload_config()
        if not full_text or not full_text.strip():
            return {"nodes": [], "edges": [], "outline": []}

        # 远程 LLM 模式
        if self._config and self._config.mode == 'remote':
            return self._extract_with_llm(full_text)

        # 规则模式
        chunks = self._split_into_chunks(full_text)
        outline = self._extract_outline(full_text)
        concepts = self._extract_concepts(chunks)
        relations = self._identify_relations(chunks, concepts)
        nodes = self._build_nodes(outline, concepts, full_text)
        edges = self._build_edges(nodes, relations)
        return {"nodes": nodes, "edges": edges, "outline": outline}

    def _call_llm(self, text):
        """调用远程 LLM"""
        cfg = self._config
        if not cfg or cfg.mode != 'remote' or not cfg.remote.api_base or not cfg.remote.api_key:
            return None
        try:
            from openai import OpenAI
            client = OpenAI(base_url=cfg.remote.api_base, api_key=cfg.remote.api_key)
            resp = client.chat.completions.create(
                model=cfg.remote.model,
                messages=[
                    {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
                    {"role": "user", "content": f"请分析以下文本：\n\n{text}"},
                ],
                max_tokens=cfg.remote.max_tokens,
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            content = resp.choices[0].message.content.strip()
            return json.loads(content)
        except Exception as e:
            print(f"[知识抽取] LLM 调用失败: {e}")
            return None

    def _extract_with_llm(self, full_text):
        """LLM 分块抽取 + 合并"""
        chunks = self._split_into_chunks(full_text, chunk_size=2000, overlap=200)
        all_entities = {}
        all_relations = []
        seen_rels = set()

        for i, chunk in enumerate(chunks):
            print(f"[知识抽取] LLM 处理第 {i+1}/{len(chunks)} 块...")
            result = self._call_llm(chunk["text"])
            if not result:
                continue

            for e in result.get("entities", []):
                name = e.get("name", "").strip()
                if name and name not in all_entities:
                    all_entities[name] = {
                        "name": name,
                        "type": e.get("type", "concept"),
                        "description": e.get("description", "")[:100],
                    }

            for r in result.get("relations", []):
                src = r.get("source", "").strip()
                tgt = r.get("target", "").strip()
                if src and tgt:
                    rel_key = f"{src}|{tgt}|{r.get('type', 'related_to')}"
                    if rel_key not in seen_rels:
                        seen_rels.add(rel_key)
                        all_relations.append({
                            "source_label": src,
                            "target_label": tgt,
                            "type": r.get("type", "related_to"),
                            "label": r.get("description", ""),
                        })

        print(f"[知识抽取] LLM 完成: {len(all_entities)} 实体, {len(all_relations)} 关系")

        # 用规则模式提取大纲（章节结构）
        outline = self._extract_outline(full_text)

        # 构建图谱
        nodes = self._build_nodes_from_llm(all_entities, outline, full_text)
        edges = self._build_edges_from_llm(nodes, all_relations)

        return {"nodes": nodes, "edges": edges, "outline": outline}

    def _build_nodes_from_llm(self, entities, outline, full_text):
        """LLM 模式构建节点"""
        nodes = []
        node_id_counter = [0]

        def gen_id():
            node_id_counter[0] += 1
            return f"node_{node_id_counter[0]}"

        # 根节点
        root_id = gen_id()
        first_line = full_text.strip().split('\n')[0] if full_text.strip() else "知识图谱"
        nodes.append({
            "id": root_id, "label": first_line[:30] if len(first_line) > 3 else "知识图谱",
            "type": "root", "level": 0, "parent_id": None,
            "chapter": "", "description": "书籍根节点", "page_num": 0
        })

        # 章节节点
        chapter_ids = {}
        for i, ch in enumerate(outline):
            ch_id = f"chapter_{i+1}"
            chapter_ids[ch["title"]] = ch_id
            nodes.append({
                "id": ch_id, "label": ch["title"],
                "type": "chapter", "level": 1, "parent_id": root_id,
                "chapter": ch["title"], "description": f"章节: {ch['title']}", "page_num": 0
            })
            node_id_counter[0] += 1

        # 实体节点
        for name, ent in list(entities.items())[:80]:
            nodes.append({
                "id": gen_id(), "label": name,
                "type": ent.get("type", "concept"), "level": 2,
                "parent_id": root_id, "chapter": "",
                "description": ent.get("description", "")[:80], "page_num": 0
            })

        return nodes

    def _build_edges_from_llm(self, nodes, relations):
        """LLM 模式构建边"""
        label_to_id = {}
        for node in nodes:
            if node["label"] not in label_to_id:
                label_to_id[node["label"]] = node["id"]

        edges = []
        # 父子关系
        for node in nodes:
            if node["parent_id"] and node["parent_id"] != node["id"]:
                if any(n["id"] == node["parent_id"] for n in nodes):
                    edges.append({
                        "source": node["parent_id"], "target": node["id"],
                        "type": "hierarchy", "label": "包含"
                    })

        # LLM 关系
        for rel in relations:
            src_id = label_to_id.get(rel["source_label"])
            tgt_id = label_to_id.get(rel["target_label"])
            if src_id and tgt_id and src_id != tgt_id:
                dup = any(e["source"] == src_id and e["target"] == tgt_id for e in edges)
                if not dup:
                    edges.append({
                        "source": src_id, "target": tgt_id,
                        "type": rel["type"], "label": rel.get("label", ""),
                    })
        return edges

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
