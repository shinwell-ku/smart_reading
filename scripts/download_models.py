#!/usr/bin/env python3
"""
AI智慧阅读 - 离线AI模型下载脚本

将 AI 模型从 HuggingFace 下载到本地 data/models/ 目录供离线使用。
支持镜像站（hf-mirror.com），国内用户请使用 --mirror 参数。

用法:
  uv run python scripts/download_models.py --list
  uv run python scripts/download_models.py nllb200_4bit
  uv run python scripts/download_models.py --all
  uv run python scripts/download_models.py --all --mirror
"""
import os
import sys
import argparse

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(ROOT_DIR, 'data', 'models')

MODELS = {
    'nllb200_4bit': {
        'description': 'NLLB-200 轻量化翻译模型（200语种，约 600MB）',
        'source': 'facebook/nllb-200-distilled-600M',
        'path': os.path.join(MODELS_DIR, 'nllb200_4bit'),
        'model_class': 'AutoModelForSeq2SeqLM',
        'required': False,
    },
    'bert4cls_small': {
        'description': 'BERT 中文知识抽取模型（约 400MB）',
        'source': 'bert-base-chinese',
        'path': os.path.join(MODELS_DIR, 'bert4cls_small'),
        'model_class': 'AutoModelForSequenceClassification',
        'required': False,
    },
}


def download_model(name, info, use_mirror=False):
    """下载模型到本地目录"""
    print(f"\n{'='*50}")
    print(f"模型: {name}")
    print(f"说明: {info['description']}")
    print(f"来源: {info['source']}")
    print(f"目标: {info['path']}")
    if use_mirror:
        print(f"镜像: hf-mirror.com（已启用）")
    print(f"{'='*50}")

    os.makedirs(info['path'], exist_ok=True)

    if use_mirror:
        os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

    try:
        import torch
        import huggingface_hub
        import transformers
        from transformers import AutoTokenizer

        model_class_map = {
            'AutoModelForSeq2SeqLM': 'from transformers import AutoModelForSeq2SeqLM',
            'AutoModelForSequenceClassification': 'from transformers import AutoModelForSequenceClassification',
        }

        exec(model_class_map[info['model_class']])
        ModelClass = locals()[info['model_class']]

        print("下载 tokenizer ...")
        tokenizer = AutoTokenizer.from_pretrained(
            info['source'],
            trust_remote_code=True,
            resume_download=True,
        )
        tokenizer.save_pretrained(info['path'])
        print("✓ Tokenizer 已保存")

        print("下载模型权重（大文件，请耐心等待）...")
        model = ModelClass.from_pretrained(
            info['source'],
            torch_dtype=torch.float32,
            low_cpu_mem_usage=True,
            trust_remote_code=True,
            resume_download=True,
        )
        model.save_pretrained(info['path'])
        print("✓ 模型权重已保存")
        print(f"\n✅ 模型 '{name}' 下载完成！存放于: {info['path']}")
        return True

    except Exception as e:
        err = str(e)
        print(f"\n❌ 下载失败")
        if 'connect' in err.lower() or 'timeout' in err.lower():
            print("   原因: 无法连接到 HuggingFace，可能是网络问题。")
            print("   建议: 使用 --mirror 参数通过国内镜像下载，或参考下方手动下载说明。")
        else:
            print(f"   错误: {err}")
        return False


def list_models():
    """列出模型状态"""
    print(f"\n模型目录: {MODELS_DIR}")
    print("-" * 65)
    print(f"{'模型':20s} {'状态':10s} {'说明'}")
    print("-" * 65)
    for name, info in MODELS.items():
        installed = os.path.exists(info['path']) and any(
            f.endswith(('.bin', '.safetensors')) for f in os.listdir(info['path'])
        )
        status = "✓ 已下载" if installed else "✗ 未下载"
        print(f"  {name:18s} {status:10s} {info['description']}")
    print("-" * 65)


def print_manual_guide():
    """打印手动下载指南"""
    print("""
📦 手动下载指南
─────────────────────────────────────────
如果你无法通过脚本下载，可以手动下载模型文件：

1. 访问 https://hf-mirror.com （国内镜像，无需翻墙）

2. 搜索以下模型仓库：
   - facebook/nllb-200-distilled-600M  → data/models/nllb200_4bit/
   - bert-base-chinese                  → data/models/bert4cls_small/

3. 在每个仓库中下载以下文件：
   ✅ config.json
   ✅ model.safetensors (或 pytorch_model.bin)
   ✅ tokenizer.json
   ✅ tokenizer_config.json
   ✅ special_tokens_map.json
   ✅ sentencepiece.bpe.model (NLLB 特有)

4. 将文件放入对应目录：
   data/models/nllb200_4bit/
   data/models/bert4cls_small/

5. 验证：
   uv run python scripts/download_models.py --list
   → 状态显示 ✓ 已下载 即可
─────────────────────────────────────────
""")


def main():
    parser = argparse.ArgumentParser(description='AI智慧阅读 - 离线AI模型下载')
    parser.add_argument('--list', action='store_true', help='列出模型状态')
    parser.add_argument('--mirror', action='store_true', help='使用国内镜像 hf-mirror.com')
    parser.add_argument('--all', action='store_true', help='下载所有模型')
    parser.add_argument('model', nargs='?', help='模型名称（nllb200_4bit / bert4cls_small）')

    args = parser.parse_args()

    if args.list:
        list_models()
        print_manual_guide()
        return

    if args.all:
        success = True
        for name, info in MODELS.items():
            ok = download_model(name, info, use_mirror=args.mirror)
            if not ok:
                success = False
        if not success:
            print("\n⚠️  部分模型下载失败，请查看上方错误信息。")
            print_manual_guide()
        return

    if args.model:
        if args.model in MODELS:
            ok = download_model(args.model, MODELS[args.model], use_mirror=args.mirror)
            if not ok:
                print_manual_guide()
        else:
            print(f"未知模型: {args.model}")
            list_models()
        return

    list_models()
    print("\n使用方式:")
    print(f"  uv run python {os.path.relpath(__file__, ROOT_DIR)} --list")
    print(f"  uv run python {os.path.relpath(__file__, ROOT_DIR)} nllb200_4bit --mirror")
    print(f"  uv run python {os.path.relpath(__file__, ROOT_DIR)} --all")
    print(f"  uv run python {os.path.relpath(__file__, ROOT_DIR)} --all --mirror")


if __name__ == '__main__':
    main()
