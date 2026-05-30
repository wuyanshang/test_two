---
name: insurance-field-translator
description: 将保险/寿险行业的中文字段名翻译成符合ACORD和中国保险行业标准的英文字段名。当用户需要翻译保险字段名称、处理保险数据字典、或者有大量保险相关的中文字段需要标准化英文命名时使用此skill。特别适合处理成百上千条字段的批量翻译任务。支持Excel文件输入输出，自动分批并行处理大量数据。
---

# 保险字段翻译器

此skill用于将中文保险/寿险字段名翻译成标准英文字段名，遵循ACORD（协作运营研究与开发协会）和中国保险行业命名规范。

## 何时使用

当用户：
- 有包含中文保险字段名的Excel文件需要翻译成英文
- 数据量较大（几百到上万条字段名）
- 翻译必须遵循保险行业标准（ACORD、中国保险标准）
- 提到保险、寿险、保单字段、理赔字段或类似保险相关数据

## 工作流程

1. **提取数据**：使用Python脚本从输入Excel文件中读取数据
2. **分批处理**：将数据分成批次（默认每批100条）
3. **并行翻译**：使用Agent工具派遣多个子agent并行翻译各批次
4. **汇总结果**：收集所有子agent的翻译结果
5. **写入输出**：将中英文字段名写入新的Excel文件

## 执行步骤

### 第1步：了解输入

询问用户：
- 输入Excel文件的路径
- 包含中文字段名的列名（默认："字段中文名"）
- 期望的输出文件路径（默认：同目录下，文件名加`_translated.xlsx`后缀）

### 第2步：提取数据

使用bundled的`scripts/extract_fields.py`脚本读取Excel文件：

```bash
python scripts/extract_fields.py <输入excel路径> <列名> <输出json路径>
```

建议将输出json保存到临时目录，例如：`/tmp/insurance_fields_<timestamp>.json`

此脚本会：
- 读取指定列的所有字段名
- 输出JSON文件，格式为：`[{"index": 0, "chinese": "字段名"}, ...]`
- 优雅处理错误（文件不存在、列名无效等）

### 第3步：批量翻译（使用Agent工具）

读取提取的JSON文件，获取中文字段名列表。计算需要的批次数量（批次大小：100条）。

**重要：使用Agent工具派遣多个子agent并行翻译**。

#### 3.1 准备批次数据

将字段列表分成批次，每批100条：

```python
import json
import math

# 读取提取的字段数据
with open('/tmp/insurance_fields.json', 'r', encoding='utf-8') as f:
    fields = json.load(f)

batch_size = 100
num_batches = math.ceil(len(fields) / batch_size)

batches = []
for i in range(num_batches):
    start_idx = i * batch_size
    end_idx = min((i + 1) * batch_size, len(fields))
    batch = {
        'batch_id': i,
        'items': fields[start_idx:end_idx]
    }
    batches.append(batch)

print(f"共 {len(fields)} 个字段，分为 {num_batches} 个批次")
```

#### 3.2 为每个批次创建输入文件

为每个批次创建一个输入JSON文件，保存到临时目录：

```python
import os

batch_dir = '/tmp/insurance_translation_batches'
os.makedirs(batch_dir, exist_ok=True)

for batch in batches:
    batch_file = f"{batch_dir}/batch_{batch['batch_id']}.json"
    with open(batch_file, 'w', encoding='utf-8') as f:
        json.dump(batch, f, ensure_ascii=False, indent=2)
    print(f"已创建批次文件: {batch_file}")
```

#### 3.3 派遣子agent翻译

读取`agents/translator.md`文件，获取子agent的提示词模板。

对每个批次，使用Agent工具派遣一个子agent：

```python
# 伪代码示例（实际使用Agent工具）
for batch in batches:
    batch_file = f"{batch_dir}/batch_{batch['batch_id']}.json"
    output_file = f"{batch_dir}/result_{batch['batch_id']}.json"
    
    # 构建子agent的prompt
    prompt = f"""
你是一个保险行业字段翻译专家。

请阅读以下批次文件：{batch_file}

按照agents/translator.md中的指导，将这批中文字段名翻译成英文字段名。

将翻译结果保存到：{output_file}

结果格式应为JSON对象：
{{
  "batch_id": <批次ID>,
  "translations": [
    {{
      "original_index": <原始索引>,
      "chinese_name": "<中文字段名>",
      "english_name": "<英文字段名>",
      "confidence": "high|medium|low",
      "note": "<可选的备注>"
    }},
    ...
  ]
}}
"""
    
    # 使用Agent工具派遣子agent
    Agent(
        description=f"翻译批次{batch['batch_id']}",
        prompt=prompt,
        run_in_background=True  # 后台运行，实现并行
    )
```

**关键点**：
- 使用`run_in_background=True`让所有子agent并行运行
- 每个子agent读取agents/translator.md获取详细的翻译指导
- 每个子agent将结果保存到独立的JSON文件

#### 3.4 等待所有子agent完成

所有子agent会在后台运行。你会收到`<task-notification>`通知每个子agent完成。

等待所有子agent完成后，继续下一步。

### 第4步：汇总翻译结果

所有子agent完成后，读取所有结果文件并汇总：

```python
import glob

# 读取所有结果文件
result_files = sorted(glob.glob(f"{batch_dir}/result_*.json"))

all_translations = []
for result_file in result_files:
    with open(result_file, 'r', encoding='utf-8') as f:
        result = json.load(f)
        all_translations.extend(result['translations'])

# 按original_index排序
all_translations.sort(key=lambda x: x['original_index'])

# 保存汇总结果
final_result = {
    'translations': all_translations,
    'totalProcessed': len(all_translations)
}

final_result_file = '/tmp/insurance_translations_final.json'
with open(final_result_file, 'w', encoding='utf-8') as f:
    json.dump(final_result, f, ensure_ascii=False, indent=2)

print(f"汇总完成，共处理 {len(all_translations)} 个字段")
print(f"结果已保存到: {final_result_file}")
```

### 第5步：写入输出Excel

使用bundled的`scripts/write_output.py`脚本将结果写入Excel：

```bash
python scripts/write_output.py /tmp/insurance_translations_final.json <输出excel路径>
```

此脚本会：
- 读取翻译结果JSON
- 创建包含"字段中文名"、"字段英文名"、"置信度"、"备注"四列的Excel
- 对于confidence为"low"或english_name包含"UNCERTAIN_"的字段，在备注列标记"⚠️ 需要人工审核"
- 对于confidence为"medium"的字段，在备注列标记"建议复核"
- 按original_index排序，保持原始顺序

### 第6步：总结报告

向用户报告：
- 总共处理的字段数量
- 高/中/低置信度的字段数量
- 标记为不确定的字段数量
- 输出文件的位置

如果有低置信度或不确定的翻译，建议用户人工审核这些字段。

## 注意事项

1. **并行处理**：使用Agent工具的`run_in_background=True`参数实现并行处理。所有子agent会同时运行。
2. **批次大小**：默认100条/批次。如果用户的数据量特别大（>5万条），可以考虑增加批次大小到200-500。
3. **错误处理**：如果某个子agent失败，检查其输出文件是否存在。可以重新派遣该批次的翻译任务。
4. **中间文件**：所有中间文件（批次输入、批次结果、最终汇总）都保存在`/tmp/insurance_translation_batches/`目录，便于调试和恢复。
5. **子agent提示词**：详细的翻译指导保存在`agents/translator.md`，子agent会读取该文件获取指导。

## Bundled资源

### scripts/extract_fields.py

从Excel文件中提取指定列的数据，输出JSON格式。

### scripts/write_output.py

将翻译结果JSON写入Excel文件，包含中英文字段名和置信度标记。

### agents/translator.md

子agent的详细提示词，包含翻译标准、命名规范、示例等。

