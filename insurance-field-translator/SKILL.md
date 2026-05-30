---
name: insurance-field-translator
description: 将保险/寿险行业的中文字段名翻译成符合ACORD和中国保险行业标准的英文字段名。当用户需要翻译保险字段名称、处理保险数据字典、或者有大量保险相关的中文字段需要标准化英文命名时使用此skill。特别适合处理成百上千条字段的批量翻译任务。
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
3. **并行翻译**：使用Workflow工具派遣多个子agent并行翻译各批次
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

此脚本会：
- 读取指定列的所有字段名
- 输出JSON文件，包含字段名和行索引
- 优雅处理错误（文件不存在、列名无效等）

### 第3步：批量翻译

读取提取的JSON文件，获取中文字段名列表。计算需要的批次数量（批次大小：100条）。

**重要：使用Workflow工具来编排翻译任务**。创建workflow脚本如下：

```javascript
export const meta = {
  name: 'translate-insurance-fields',
  description: '并行批量翻译保险字段名称',
  phases: [
    { title: '翻译', detail: '并行翻译各批次字段名' }
  ]
}

phase('翻译')

// args 应该是: { fields: [{index: 0, chinese: "字段名"},...], batchSize: 100 }
const { fields, batchSize } = args

// 分批
const batches = []
for (let i = 0; i < fields.length; i += batchSize) {
  batches.push({
    batchId: Math.floor(i / batchSize),
    startIndex: i,
    items: fields.slice(i, i + batchSize)
  })
}

log(`正在处理 ${fields.length} 个字段，分为 ${batches.length} 个批次`)

// 使用pipeline并行翻译每个批次
const results = await pipeline(
  batches,
  batch => agent(
    `请将以下中文保险/寿险字段名翻译成英文字段名。

重要标准：
- 遵循ACORD（Association for Cooperative Operations Research and Development）命名规范
- 遵循中国保险行业标准字段命名规范
- 使用snake_case命名格式（例如：policy_number, insured_name）
- 与常见保险术语保持一致
- 对于不确定的翻译，在英文名前加"UNCERTAIN_"前缀

待翻译的中文字段名：
${batch.items.map((item, idx) => `${idx + 1}. ${item.chinese}`).join('\n')}

请返回一个JSON数组，包含翻译结果。每项应包含：
- original_index: Excel文件中的原始行索引
- chinese_name: 原始中文字段名
- english_name: 翻译后的英文字段名
- confidence: "high", "medium", 或 "low"
- note: 任何额外的上下文或解释（可选）

如果对翻译不确定，请将confidence设为"low"或"medium"，并在english_name前加"UNCERTAIN_"前缀。`,
    {
      label: `批次-${batch.batchId}`,
      phase: '翻译',
      schema: {
        type: 'object',
        properties: {
          translations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                original_index: { type: 'number' },
                chinese_name: { type: 'string' },
                english_name: { type: 'string' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                note: { type: 'string' }
              },
              required: ['original_index', 'chinese_name', 'english_name', 'confidence']
            }
          }
        },
        required: ['translations']
      }
    }
  )
)

// 展平结果
const allTranslations = results.filter(Boolean).flatMap(r => r.translations)

return { translations: allTranslations, totalProcessed: allTranslations.length }
```

使用Workflow工具调用此脚本，将提取的字段数据作为args传入。

### 第4步：写入输出Excel

workflow完成后，会返回包含所有翻译结果的对象：
```javascript
{
  translations: [
    {
      original_index: 0,
      chinese_name: "投保人姓名",
      english_name: "policyholder_name",
      confidence: "high",
      note: ""
    },
    ...
  ],
  totalProcessed: 10000
}
```

使用bundled的`scripts/write_output.py`脚本将结果写入Excel：

```bash
python scripts/write_output.py <翻译结果json路径> <输出excel路径>
```

此脚本会：
- 读取翻译结果JSON
- 创建包含"字段中文名"和"字段英文名"两列的Excel
- 对于confidence为"low"或english_name包含"UNCERTAIN_"的字段，在备注列标记
- 按original_index排序，保持原始顺序

### 第5步：总结报告

向用户报告：
- 总共处理的字段数量
- 高/中/低置信度的字段数量
- 标记为不确定的字段数量
- 输出文件的位置

如果有低置信度或不确定的翻译，建议用户人工审核这些字段。

## 注意事项

1. **Workflow调用**：此skill依赖Workflow工具来并行处理大量数据。确保用户理解这会派遣多个子agent。
2. **批次大小**：默认100条/批次。如果用户的数据量特别大（>5万条），可以考虑增加批次大小到200-500。
3. **错误处理**：如果某个批次的子agent失败，pipeline会将该批次结果设为null。最终汇总时会过滤掉null值。
4. **中间文件**：提取的JSON和翻译结果JSON都保存在临时目录，便于调试和恢复。

## Bundled资源

### scripts/extract_fields.py

从Excel文件中提取指定列的数据，输出JSON格式。

### scripts/write_output.py

将翻译结果JSON写入Excel文件，包含中英文字段名和置信度标记。

