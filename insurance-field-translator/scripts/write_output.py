#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将翻译结果JSON写入Excel文件
"""

import sys
import json
import pandas as pd
from pathlib import Path


def write_output(translations_json_path, output_excel_path):
    """
    将翻译结果写入Excel文件

    Args:
        translations_json_path: 翻译结果JSON文件路径
        output_excel_path: 输出Excel文件路径
    """
    try:
        # 读取翻译结果JSON
        print(f"正在读取翻译结果: {translations_json_path}")
        with open(translations_json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        translations = data.get('translations', [])
        if not translations:
            print("警告: 翻译结果为空")
            return

        # 按original_index排序
        translations.sort(key=lambda x: x.get('original_index', 0))

        # 准备DataFrame
        rows = []
        for item in translations:
            chinese_name = item.get('chinese_name', '')
            english_name = item.get('english_name', '')
            confidence = item.get('confidence', 'unknown')
            note = item.get('note', '')

            # 标记不确定的翻译
            remark = ''
            if confidence == 'low' or 'UNCERTAIN_' in english_name:
                remark = '⚠️ 需要人工审核'
            elif confidence == 'medium':
                remark = '建议复核'

            if note:
                remark = f"{remark} | {note}" if remark else note

            rows.append({
                '字段中文名': chinese_name,
                '字段英文名': english_name,
                '置信度': confidence,
                '备注': remark
            })

        df = pd.DataFrame(rows)

        # 写入Excel
        output_path = Path(output_excel_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        df.to_excel(output_excel_path, index=False, engine='openpyxl')

        print(f"成功写入 {len(rows)} 条记录到: {output_excel_path}")

        # 统计信息
        high_conf = sum(1 for item in translations if item.get('confidence') == 'high')
        medium_conf = sum(1 for item in translations if item.get('confidence') == 'medium')
        low_conf = sum(1 for item in translations if item.get('confidence') == 'low')
        uncertain = sum(1 for item in translations if 'UNCERTAIN_' in item.get('english_name', ''))

        print(f"\n统计信息:")
        print(f"  高置信度: {high_conf}")
        print(f"  中置信度: {medium_conf}")
        print(f"  低置信度: {low_conf}")
        print(f"  标记为不确定: {uncertain}")

    except FileNotFoundError:
        print(f"错误: 文件不存在 - {translations_json_path}")
        sys.exit(1)
    except Exception as e:
        print(f"错误: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("用法: python write_output.py <翻译结果json路径> <输出excel路径>")
        sys.exit(1)

    translations_json_path = sys.argv[1]
    output_excel_path = sys.argv[2]

    write_output(translations_json_path, output_excel_path)
