#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批次管理辅助脚本
用于将字段列表分批并创建批次文件
"""

import sys
import json
import math
import os
from pathlib import Path


def create_batches(fields_json_path, batch_size, output_dir):
    """
    将字段列表分批并创建批次文件

    Args:
        fields_json_path: 字段JSON文件路径
        batch_size: 每批的大小
        output_dir: 输出目录
    """
    try:
        # 读取字段数据
        print(f"正在读取字段数据: {fields_json_path}")
        with open(fields_json_path, 'r', encoding='utf-8') as f:
            fields = json.load(f)

        if not fields:
            print("警告: 字段列表为空")
            return

        # 计算批次数量
        num_batches = math.ceil(len(fields) / batch_size)
        print(f"共 {len(fields)} 个字段，分为 {num_batches} 个批次（每批 {batch_size} 条）")

        # 创建输出目录
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        # 创建批次文件
        batch_files = []
        for i in range(num_batches):
            start_idx = i * batch_size
            end_idx = min((i + 1) * batch_size, len(fields))

            batch = {
                'batch_id': i,
                'total_batches': num_batches,
                'items': fields[start_idx:end_idx]
            }

            batch_file = output_path / f"batch_{i}.json"
            with open(batch_file, 'w', encoding='utf-8') as f:
                json.dump(batch, f, ensure_ascii=False, indent=2)

            batch_files.append(str(batch_file))
            print(f"  批次 {i}: {len(batch['items'])} 个字段 -> {batch_file}")

        # 创建批次索引文件
        index_file = output_path / "batches_index.json"
        index_data = {
            'total_fields': len(fields),
            'batch_size': batch_size,
            'num_batches': num_batches,
            'batch_files': batch_files
        }
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(index_data, f, ensure_ascii=False, indent=2)

        print(f"\n批次索引已保存到: {index_file}")
        print(f"所有批次文件已创建在: {output_dir}")

    except FileNotFoundError:
        print(f"错误: 文件不存在 - {fields_json_path}")
        sys.exit(1)
    except Exception as e:
        print(f"错误: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("用法: python create_batches.py <字段json路径> <批次大小> <输出目录>")
        print("示例: python create_batches.py /tmp/fields.json 100 /tmp/batches")
        sys.exit(1)

    fields_json_path = sys.argv[1]
    batch_size = int(sys.argv[2])
    output_dir = sys.argv[3]

    create_batches(fields_json_path, batch_size, output_dir)
