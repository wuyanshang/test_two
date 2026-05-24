# 语义歧义检测对比测试工具 - 使用说明

## 📦 安装依赖

```bash
pip install langgraph langchain-openai pandas openpyxl python-dotenv
```

## 🔑 配置 API Key

### 方法1：环境变量（推荐）

**Windows:**
```bash
set MOONSHOT_API_KEY=your_api_key_here
```

**Linux/Mac:**
```bash
export MOONSHOT_API_KEY=your_api_key_here
```

### 方法2：.env 文件

创建 `.env` 文件：
```
MOONSHOT_API_KEY=your_api_key_here
```

然后在脚本开头添加：
```python
from dotenv import load_dotenv
load_dotenv()
```

## 📊 准备 Excel 测试数据

### Excel 格式要求

必须包含以下列（顺序不限）：

| 系统英文名 | 系统中文名 | 表英文名 | 表中文名 | 字段英文名 | 字段中文名 |
|-----------|-----------|---------|---------|-----------|-----------|
| CRM | 客户关系管理系统 | t_customer | 客户信息表 | sex | 投保人姓名 |
| POLICY | 保单系统 | t_transaction | 交易流水表 | amount | 金额字段1 |
| ... | ... | ... | ... | ... | ... |

### 示例数据

创建 `test_data.xlsx`：

| 系统英文名 | 系统中文名 | 表英文名 | 表中文名 | 字段英文名 | 字段中文名 |
|-----------|-----------|---------|---------|-----------|-----------|
| CRM | 客户关系管理 | t_customer | 客户信息表 | sex | 投保人姓名 |
| POLICY | 保单系统 | t_transaction | 交易流水表 | amount | 金额字段1 |
| POLICY | 保单系统 | t_policy_info | 保单信息表 | POLNO | 保单号 |
| CLAIM | 理赔系统 | t_common_data | 通用数据表 | amount | 金额 |
| CLAIM | 理赔系统 | t_clm_case | 理赔案件表 | amount | 金额 |

## 🚀 运行测试

### 基本用法

```bash
python comparison_workflow.py test_data.xlsx
```

### 完整流程

```bash
# 1. 设置 API Key
set MOONSHOT_API_KEY=your_key

# 2. 确保提示词文件存在
# - semantic-ambiguity.txt
# - stage1-fixed.txt
# - stage2-fixed.txt

# 3. 运行测试
python comparison_workflow.py test_data.xlsx

# 4. 查看报告
# 报告会生成在当前目录，文件名如：comparison_report_20260524_143022.md
```

## 📋 工作流程图

```
┌─────────────────┐
│  加载 Excel     │
│  (load_excel)   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  加载提示词      │
│ (load_prompts)  │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  测试原始版本    │
│(test_original)  │
│ - 调用 Kimi API │
│ - 记录结果      │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  测试修复版本    │
│ (test_fixed)    │
│ - 阶段一判断    │
│ - 阶段二分类    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  对比结果        │
│  (compare)      │
│ - 判断一致性    │
│ - 统计改进/退化 │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  生成报告        │
│(generate_report)│
│ - Markdown 格式 │
└─────────────────┘
```

## 📊 输出报告

### 报告内容

生成的 Markdown 报告包含：

1. **测试概览**
   - 测试数据总数
   - 结果一致率
   - 改进/退化/错误统计

2. **详细对比表格**
   - 每条数据的对比结果
   - 原始版本 vs 修复版本
   - 触发的规则

3. **改进案例**
   - 原始版本漏报，修复版本正确识别

4. **退化案例**（如果有）
   - 原始版本正确，修复版本误报

5. **结论与建议**

### 报告示例

```markdown
# 语义歧义检测提示词对比报告

生成时间: 2026-05-24 14:30:22

## 📊 测试概览

- 测试数据总数: 5
- 结果一致: 3 (60.0%)
- 修复改进: 2
- 修复退化: 0
- 解析错误: 0

## 📋 详细对比

| ID | 字段中文名 | 字段英文名 | 原始版-歧义 | 原始版-规则 | 修复版-歧义 | 修复版-规则 | 一致性 |
|----|-----------|-----------|-----------|-----------|-----------|-----------|---------|
| ROW_1 | 投保人姓名 | sex | 否 | - | 是 | B000001 | 不一致-修复改进 |
| ROW_2 | 金额字段1 | amount | 否 | - | 是 | B000002 | 不一致-修复改进 |
| ROW_3 | 保单号 | POLNO | 否 | - | 否 | - | 一致-都无歧义 |

## ✅ 修复改进案例

### ROW_1: 投保人姓名

- **字段英文名**: sex
- **表中文名**: 客户信息表
- **原始版本**: 无歧义（漏报）
- **修复版本**: 有歧义，规则 B000001
- **分析**: 修复版本正确识别了歧义

## 🎯 结论

✅ 修复版本成功改进了检测能力，无退化，建议采用修复版本。
```

## 🔧 自定义配置

### 修改 Kimi 模型

在脚本中找到：
```python
llm = ChatOpenAI(
    model="moonshot-v1-32k",  # 可改为 moonshot-v1-8k 或 moonshot-v1-128k
    temperature=0.3,
    ...
)
```

### 修改输出路径

在 `generate_report` 函数中修改：
```python
report_path = f"reports/comparison_report_{timestamp}.md"
```

### 添加进度条

安装 tqdm：
```bash
pip install tqdm
```

在循环中添加：
```python
from tqdm import tqdm

for idx, data in enumerate(tqdm(state["test_data"], desc="测试进度")):
    ...
```

## ⚠️ 注意事项

1. **API 调用成本**
   - 每条数据需要调用 2-3 次 API（原始版1次，修复版1-2次）
   - 建议先用小数据集测试（5-10条）
   - 大数据集建议分批测试

2. **速率限制**
   - Kimi API 有速率限制
   - 如果遇到限流，脚本会报错
   - 可以添加延迟：`time.sleep(1)` 在每次调用后

3. **JSON 解析**
   - 脚本会自动处理 Markdown 代码块中的 JSON
   - 如果 Kimi 输出格式不标准，可能解析失败
   - 失败的用例会标记为"错误"

4. **提示词文件路径**
   - 确保三个提示词文件在当前目录
   - 或修改脚本中的文件路径

## 🐛 故障排除

### 问题1：ModuleNotFoundError

```bash
pip install langgraph langchain-openai pandas openpyxl
```

### 问题2：API Key 错误

检查环境变量：
```bash
echo %MOONSHOT_API_KEY%  # Windows
echo $MOONSHOT_API_KEY   # Linux/Mac
```

### 问题3：Excel 列名错误

确保 Excel 包含必需的 6 列，列名完全一致（包括中文）。

### 问题4：JSON 解析失败

查看原始响应，可能是 Kimi 输出格式不标准。
在脚本中添加调试输出：
```python
print(f"原始响应: {response.content}")
```

### 问题5：速率限制

添加延迟：
```python
import time
time.sleep(1)  # 每次调用后等待1秒
```

## 📞 支持

如有问题，请检查：
1. API Key 是否正确
2. 提示词文件是否存在
3. Excel 格式是否正确
4. 网络连接是否正常
