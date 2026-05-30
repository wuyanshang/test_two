#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
汇总翻译结果脚本
收集所有批次的翻译结果并合并
"""

import sys
import json
import glob
from pathlib import Path


def aggregate_results(batch_dir, output_json_path):
    """
    汇总所有批次的翻译结果

    Args:
        batch_dir: 批次目录（包含result_*.json文件）
        output_json_path: 输出的汇总JSON文件路径
    """
    try:
        # 查找所有结果文件
        result_pattern = str(Path(batch_dir) / "result_*.json")
        result_files = sorted(glob.glob(result_pattern))

        if not result_files:
            print(f"警告: 在 {batch_dir} 中没有找到结果文件（result_*.json）")
            sys.exit(1)

        print(f"找到 {len(result_files)} 个结果文件")

        # 读取并汇总所有翻译结果
        all_translations = []
        failed_batches = []

        for result_file in result_files:
            try:
                with open(result_file, 'r', encoding='utf-8') as f:
                    result = json.load(f)

                batch_id = result.get('batch_id', 'unknown')
                translations = result.get('translations', [])

                if not translations:
                    print(f"  警告: 批次 {batch_id} 没有翻译结果")
                    failed_batches.append(batch_id)
                    continue

                all_translations.extend(translations)
                print(f"  批次 {batch_id}: {len(translations)} 条翻译")

            except Exception as e:
                print(f"  错误: 无法读取 {result_file} - {str(e)}")
                failed_batches.append(Path(result_file).stem)

        if not all_translations:
            print("错误: 没有任何翻译结果")
            sys.exit(1)

        # 按original_index排序
        all_translations.sort(key=lambda x: x.get('original_index', 0))

        # 统计信息
        high_conf = sum(1 for t in all_translations if t.get('confidence') == 'high')
        medium_conf = sum(1 for t in all_translations if t.get('confidence') == 'medium')
        low_conf = sum(1 for t in all_translations if t.get('confidence') == 'low')
        uncertain = sum(1 for t in all_translations if 'UNCERTAIN_' in t.get('english_name', ''))

        # 创建最终结果
        final_result = {
            'translations': all_translations,
            'totalProcessed': len(all_translations),
            'statistics': {
                'high_confidence': high_conf,
                'medium_confidence': medium_conf,
                'low_confidence': low_conf,
                'uncertain': uncertain,
                'failed_batches': failed_batches
            }
        }

        # 保存汇总结果
        output_path = Path(output_json_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump(final_result, f, ensure_ascii=False, indent=2)

        print(f"\n汇总完成！")
        print(f"  总计: {len(all_translations)} 条翻译")
        print(f"  高置信度: {high_conf}")
        print(f"  中置信度: {medium_conf}")
        print(f"  低置信度: {low_conf}")
        print(f"  标记为不确定: {uncertain}")
        if failed_batches:
            print(f"  失败的批次: {', '.join(map(str, failed_batches))}")
        print(f"\n结果已保存到: {output_json_path}")

    except Exception as e:
        print(f"错误: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("用法: python aggregate_results.py <批次目录> <输出json路径>")
        print("示例: python aggregate_results.py /tmp/batches /tmp/final_result.json")
        sys.exit(1)

    batch_dir = sys.argv[1]
    output_json_path = sys.argv[2]

    aggregate_results(batch_dir, output_json_path)
