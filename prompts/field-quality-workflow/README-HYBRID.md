# 字段质检系统 - Workflow 方案（混合数据源版本）

## 功能说明

本系统用于对字段进行语义质检，检测字段中文名是否清晰明确。

### 数据源

1. **字段列表**：从 Excel 读取"字段中文名"列
2. **缩写映射**：从数据库查询

### 两阶段质检流程

1. **阶段一：消歧判断**
   - 判断字段中文名是否清晰明确
   - 检查是否包含高风险词（姓名/状态/日期/金额/关系/编号/利率/地址）
   - 检查是否有业务限定修饰语

2. **阶段二：歧义分类**（仅对阶段一失败的字段）
   - B000002：缺少业务限定
   - B000003：中文名不明确
   - B000004：英文缩写不明确

---

## 文件说明

- `workflow-two-stage.js` - Workflow 脚本（两阶段质检逻辑）
- `hybrid-data-utils.js` - 混合数据源工具（Excel + 数据库）
- `example-usage-hybrid.js` - 使用示例（混合数据源版本）
- `package.json` - 依赖配置
- `README-HYBRID.md` - 本文档

---

## 安装依赖

```bash
npm install
```

需要安装的依赖：
- `xlsx` - Excel 读取和导出
- `mysql2` - 数据库连接

---

## 快速开始

### 步骤 1：准备输入 Excel

创建一个 Excel 文件，包含"字段中文名"列：

| ID | 字段中文名 |
|----|-----------|
| 1  | 金额      |
| 2  | 投保人姓名 |
| 3  | WP客户端类型 |

保存为 `./input/fields.xlsx`

或者运行示例脚本创建测试 Excel：

```bash
node example-usage-hybrid.js --create-test
```

### 步骤 2：准备数据库（缩写映射表）

创建缩写映射表：

```sql
CREATE TABLE IF NOT EXISTS abbreviation_mappings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  field_cn VARCHAR(255) NOT NULL,
  abbreviation_mapping VARCHAR(255),
  INDEX idx_field_cn (field_cn)
);

-- 插入测试数据
INSERT INTO abbreviation_mappings (field_cn, abbreviation_mapping) VALUES
('WP客户端类型', 'WP=豁免'),
('TP类型', 'TP=第三方');
```

### 步骤 3：配置

修改 `hybrid-data-utils.js` 中的 `CONFIG`：

```javascript
const CONFIG = {
  // Excel 输入配置
  excel: {
    inputPath: './input/fields.xlsx',
    sheetName: null,
    fieldCnColumn: '字段中文名',
    idColumn: 'ID'
  },

  // 数据库配置（缩写映射表）
  db: {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'your_password',
    database: 'your_database',
    charset: 'utf8mb4'
  },

  // 缩写映射表配置
  abbreviation: {
    tableName: 'abbreviation_mappings',
    fieldCnColumn: 'field_cn',
    mappingColumn: 'abbreviation_mapping'
  },

  // 输出配置
  output: {
    dir: './output',
    excelFileName: 'field-quality-report.xlsx'
  }
};
```

### 步骤 4：加载数据

```javascript
const { loadFieldsWithAbbreviations } = require('./hybrid-data-utils.js');
const fields = await loadFieldsWithAbbreviations();
console.log(`加载完成，共 ${fields.length} 个字段`);
```

### 步骤 5：调用 Workflow

在 Claude Code 对话框中输入：

```
请使用 workflow 工具执行两阶段质检，参数如下：
scriptPath: D:\Users\Administrator\Desktop\prompt\comparison-test\prompts\field-quality-workflow\workflow-two-stage.js
args: { fields: [加载的字段数组] }
```

或者直接调用：

```javascript
const result = await Workflow({
  scriptPath: './workflow-two-stage.js',
  args: { fields: fields }
});
```

### 步骤 6：导出 Excel

Workflow 完成后：

```javascript
const { exportToExcel } = require('./hybrid-data-utils.js');
exportToExcel(result, './output/field-quality-report.xlsx');
```

---

## 完整示例

```javascript
const { loadFieldsWithAbbreviations, exportToExcel } = require('./hybrid-data-utils.js');

async function main() {
  // 1. 加载数据（Excel + 数据库）
  const fields = await loadFieldsWithAbbreviations();
  console.log(`加载完成，共 ${fields.length} 个字段`);

  // 2. 调用 Workflow（需要在 Claude Code 中执行）
  const result = await Workflow({
    scriptPath: './workflow-two-stage.js',
    args: { fields: fields }
  });

  // 3. 导出 Excel
  exportToExcel(result, './output/field-quality-report.xlsx');
  console.log('✓ 质检完成！');
}

main();
```

---

## 数据格式

### 输入 Excel 格式

| ID | 字段中文名 |
|----|-----------|
| 1  | 金额      |
| 2  | 投保人姓名 |
| 3  | WP客户端类型 |

**说明**：
- `ID` 列可选，如果没有则自动生成（1, 2, 3...）
- 列名可以在 `CONFIG.excel` 中自定义

### 数据库表结构

```sql
CREATE TABLE abbreviation_mappings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  field_cn VARCHAR(255) NOT NULL,           -- 字段中文名
  abbreviation_mapping VARCHAR(255),        -- 缩写映射（格式：WP=豁免,TP=第三方）
  INDEX idx_field_cn (field_cn)
);
```

### 合并后的数据格式

```javascript
[
  {
    id: 1,
    field_cn: "金额",
    abbreviation_mappings: "无"
  },
  {
    id: 3,
    field_cn: "WP客户端类型",
    abbreviation_mappings: "WP=豁免"
  }
]
```

---

## 输出 Excel 格式

包含 3 个工作表：

### 工作表 1：质检结果

| 字段ID | 字段中文名 | 缩写映射 | 最终状态 | 是否有歧义 | 阶段一消歧路径 | 阶段一总结 | 阶段二触发规则 | 阶段二歧义详情 | 阶段二消歧建议 | 阶段二总结 |
|--------|-----------|---------|---------|-----------|--------------|-----------|--------------|--------------|--------------|-----------|
| 1 | 金额 | 无 | 失败 | 是 | D1失败-无业务限定 | 缺少业务限定 | B000002 | ... | ... | ... |
| 3 | WP客户端类型 | WP=豁免 | 通过 | 否 | D1: 中文名清晰明确 | ... | | | | |

### 工作表 2：统计汇总

| 指标 | 数量 |
|------|------|
| 总字段数 | 10000 |
| 通过（阶段一） | 7500 |
| 覆盖通过（阶段二） | 500 |
| 失败（有歧义） | 2000 |
| 通过率 | 80.00% |

### 工作表 3：失败字段明细

仅包含有歧义的字段，方便快速定位问题。

---

## 使用示例脚本

### 创建测试数据

```bash
node example-usage-hybrid.js --create-test
```

会创建：
- `./input/test-fields.xlsx` - 测试 Excel 文件
- `./input/test-db.sql` - 测试数据库 SQL

### 只加载数据（不调用 Workflow）

```bash
node example-usage-hybrid.js --load-only
```

### 导出 Excel（使用模拟数据）

```bash
node example-usage-hybrid.js --export-mock
```

### 完整流程

```bash
node example-usage-hybrid.js
```

---

## 性能估算

- **10,000 字段**
  - 阶段一：10,000 次调用，约 4M tokens
  - 阶段二：约 2,500 次调用（假设 25% 失败），约 1.25M tokens
  - 总计：约 5.25M tokens
  - 耗时：约 15-20 分钟（16 并发）
  - 成本：约 $15-25（按 Opus 4.8 定价）

---

## 注意事项

1. **Excel 格式**：
   - 支持 `.xlsx` 和 `.xls` 格式
   - 列名必须与 `CONFIG.excel` 中配置的一致
   - 如果有多个工作表，默认使用第一个

2. **数据库连接**：
   - 确保数据库配置正确，且有查询权限
   - 缩写映射表必须有 `field_cn` 和 `abbreviation_mapping` 列

3. **缩写映射格式**：
   - 格式：`WP=豁免,TP=第三方`
   - 如果数据库中没有对应的缩写映射，则显示"无"

4. **字段匹配**：
   - Excel 中的字段中文名与数据库中的 `field_cn` 进行精确匹配
   - 匹配时会自动去除首尾空格

5. **Workflow 调用**：
   - 必须在 Claude Code 环境中调用 Workflow 工具
   - 支持断点续传（使用 `resumeFromRunId`）

6. **内存占用**：
   - 10,000 字段约占用 50MB 内存
   - 如果字段数量超过 50,000，建议分批处理

---

## 常见问题

### Q1: 如何测试？
A: 运行 `node example-usage-hybrid.js --create-test` 创建测试数据，然后运行完整流程。

### Q2: 如何修改列名？
A: 修改 `hybrid-data-utils.js` 中的 `CONFIG.excel.fieldCnColumn` 等配置。

### Q3: 如果数据库中没有某个字段的缩写映射怎么办？
A: 系统会自动将该字段的缩写映射设置为"无"。

### Q4: 如何处理大量字段？
A: 
- 方法 1：分批处理，每批 5000-10000 个字段
- 方法 2：使用 Workflow 的 `budget` 参数控制 token 消耗

### Q5: 如何查看 Workflow 进度？
A: 在 Claude Code 中输入 `/workflows` 查看实时进度。

### Q6: 如何中断 Workflow？
A: 在 Claude Code 中输入 `/workflows`，然后选择停止。

### Q7: 如何从中断处继续？
A: 使用 `Workflow({ scriptPath: '...', resumeFromRunId: 'wf_xxx' })`。

---

## 技术栈

- Node.js 18+
- MySQL 8.0+
- Anthropic Claude API (Opus 4.8)
- xlsx (Excel 读取和导出)
- mysql2 (数据库连接)

---

## 许可证

MIT
