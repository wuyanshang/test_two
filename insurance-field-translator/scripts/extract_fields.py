#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从Excel文件中提取指定列的数据，输出为JSON格式
"""

import sys
import json
import pandas as pd
from pathlib import Path


def extract_fields(excel_path, column_name, output_json_path):
    """
    从Excel文件中提取指定列的数据

    Args:
        excel_path: Excel文件路径
        column_name: 要提取的列名
        output_json_path: 输出JSON文件路径
    """
    try:
        # 读取Excel文件
        print(f"正在读取Excel文件: {excel_path}")
        df = pd.read_excel(excel_path)

        # 检查列是否存在
        if column_name not in df.columns:
            print(f"错误: 列 '{column_name}' 不存在")
            print(f"可用的列: {', '.join(df.columns)}")
            sys.exit(1)

        # 提取数据
        fields = []
        for idx, value in enumerate(df[column_name]):
            # 跳过空值
            if pd.isna(value):
                continue

            fields.append({
                "index": idx,
                "chinese": str(value).strip()
            })

        print(f"成功提取 {len(fields)} 个字段")

        # 写入JSON文件
        output_path = Path(output_json_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump(fields, f, ensure_ascii=False, indent=2)

        print(f"数据已保存到: {output_json_path}")

    except FileNotFoundError:
        print(f"错误: 文件不存在 - {excel_path}")
        sys.exit(1)
    except Exception as e:
        print(f"错误: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("用法: python extract_fields.py <excel路径> <列名> <输出json路径>")
        sys.exit(1)

    excel_path = sys.argv[1]
    column_name = sys.argv[2]
    output_json_path = sys.argv[3]

    extract_fields(excel_path, column_name, output_json_path)
