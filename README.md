# 语义歧义检测提示词对比测试工具

基于 LangGraph 的自动化测试工具，用于对比原始版本和修复版本的语义歧义检测提示词效果。

## 📁 文件结构

```
comparison-test/
├── comparison_workflow.py      # LangGraph 工作流脚本
├── README_workflow.md          # 详细使用说明
├── test_data_sample.csv        # 示例测试数据（15条）
├── test-cases.json            # 标准测试用例集（15个）
├── test-guide.md              # 测试指南
└── test-comparison-table.md   # 对比记录表格模板
```

## 🎯 功能特性

- ✅ 从 Excel/CSV 读取测试数据
- ✅ 自动调用 Kimi API 测试两个版本
- ✅ 智能对比结果（一致性、改进、退化）
- ✅ 生成详细的 Markdown 报告
- ✅ 错误处理和容错机制

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install langgraph langchain-openai pandas openpyxl
```

### 2. 配置 API Key

```bash
# Windows
set MOONSHOT_API_KEY=your_api_key_here

# Linux/Mac
export MOONSHOT_API_KEY=your_api_key_here
```

### 3. 准备测试数据

创建 Excel 文件，包含以下列：
- 系统英文名
- 系统中文名
- 表英文名
- 表中文名
- 字段英文名
- 字段中文名

或使用提供的 `test_data_sample.csv` 作为模板。

### 4. 运行测试

```bash
python comparison_workflow.py test_data.xlsx
```

### 5. 查看报告

报告会生成在当前目录：`comparison_report_YYYYMMDD_HHMMSS.md`

## 📊 工作流程

```
Excel 数据 → 加载提示词 → 测试原始版本 → 测试修复版本 → 对比结果 → 生成报告
```

## 📋 报告内容

生成的报告包含：

1. **测试概览** - 总数、一致率、改进/退化统计
2. **详细对比表格** - 每条数据的对比结果
3. **改进案例** - 原始版漏报 → 修复版正确
4. **退化案例** - 原始版正确 → 修复版误报（如果有）
5. **结论与建议** - 基于测试结果的明确建议

## 🔧 配置选项

### 修改 Kimi 模型

在 `comparison_workflow.py` 中：
```python
llm = ChatOpenAI(
    model="moonshot-v1-32k",  # 可改为 moonshot-v1-8k 或 moonshot-v1-128k
    temperature=0.3,
    ...
)
```

### 添加进度条

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

### API 成本
- 每条数据调用 2-3 次 API（原始版1次，修复版1-2次）
- 建议先用小数据集测试（5-10条）

### 速率限制
- Kimi API 有速率限制
- 如遇限流，可在代码中添加延迟：`time.sleep(1)`

### Excel 格式
- 必须包含 6 个必需列
- 列名必须完全一致（包括中文）

## 📚 详细文档

- **README_workflow.md** - 完整使用说明、故障排除
- **test-guide.md** - 手动测试指南、对比方法
- **test-comparison-table.md** - 对比记录表格模板

## 🧪 测试用例

### test-cases.json
15 个标准测试用例，覆盖：
- 关键 bug 修复（2个）
- 基础场景（4个）
- B000002 场景（4个）
- 复杂/边界场景（5个）

### test_data_sample.csv
15 条示例数据，可直接用于测试。

## 🐛 故障排除

### 问题1：ModuleNotFoundError
```bash
pip install langgraph langchain-openai pandas openpyxl
```

### 问题2：API Key 错误
检查环境变量是否正确设置。

### 问题3：Excel 列名错误
确保 Excel 包含必需的 6 列，列名完全一致。

### 问题4：JSON 解析失败
查看原始响应，可能是 Kimi 输出格式不标准。

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 支持

如有问题，请查看 `README_workflow.md` 中的详细说明。
