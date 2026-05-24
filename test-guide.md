# 提示词效果对比测试指南

## 📋 测试目标

对比原始提示词和修复版提示词的效果差异，重点验证：
1. 是否修复了用户发现的两个 bug
2. 是否引入了新的问题（误报/漏报）
3. 判断的稳定性和一致性

## 📁 测试文件

- **测试用例集**：`test-cases.json`（15个用例）
- **原始提示词**：`semantic-ambiguity.txt`
- **修复版提示词**：`stage1-fixed.txt` + `stage2-fixed.txt`

## 🧪 测试方法

### 方法1：手动测试（推荐，适合深入分析）

#### 步骤1：准备对比表格

创建一个表格（Excel 或 Google Sheets），列如下：

| 用例ID | 用例名称 | 原始版-有歧义 | 原始版-规则 | 修复版-有歧义 | 修复版-规则 | 是否一致 | 备注 |
|--------|---------|--------------|------------|--------------|------------|---------|------|
| TC001 | 中文清晰+英文矛盾 | | | | | | |

#### 步骤2：测试原始版本

对每个测试用例：
1. 将 `test-cases.json` 中的 input 数据填入原始提示词
2. 调用 Kimi-2.6（或手动模拟）
3. 记录结果：
   - 阶段一：`disambiguation_success` (true/false)
   - 阶段二（如果失败）：`ambiguities` 中的 `rule_code`

#### 步骤3：测试修复版本

对每个测试用例：
1. 先用 `stage1-fixed.txt` 判断是否有歧义
2. 如果有歧义，再用 `stage2-fixed.txt` 分类
3. 记录结果

#### 步骤4：对比分析

对比两个版本的结果：
- ✅ 一致且正确：两个版本结果相同，且符合预期
- ⚠️ 不一致-修复改进：原始版错误，修复版正确
- ❌ 不一致-修复退化：原始版正确，修复版错误
- ⚠️ 一致但错误：两个版本都错误

---

### 方法2：自动化测试（适合大规模测试）

如果你有 Kimi API 访问权限，可以用以下 Python 脚本：

```python
import json
import requests

# 配置
KIMI_API_KEY = "your_api_key"
KIMI_API_URL = "https://api.moonshot.cn/v1/chat/completions"

def call_kimi(prompt, user_input):
    """调用 Kimi API"""
    response = requests.post(
        KIMI_API_URL,
        headers={
            "Authorization": f"Bearer {KIMI_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "moonshot-v1-32k",
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_input}
            ],
            "temperature": 0.3
        }
    )
    return response.json()

def format_input(test_case):
    """格式化测试用例输入"""
    inp = test_case["input"]
    return f"""表中文名: {inp['table_cn']}
表英文名: {inp['table_en']}
字段中文名: {inp['field_cn']}
字段英文名: {inp['field_en']}
缩写映射: {inp['abbreviation_mappings']}"""

def test_original_version(test_case):
    """测试原始版本"""
    with open("semantic-ambiguity.txt", "r", encoding="utf-8") as f:
        prompt = f.read()
    
    user_input = format_input(test_case)
    result = call_kimi(prompt, user_input)
    return result

def test_fixed_version(test_case):
    """测试修复版本"""
    # 阶段一
    with open("stage1-fixed.txt", "r", encoding="utf-8") as f:
        stage1_prompt = f.read()
    
    user_input = format_input(test_case)
    stage1_result = call_kimi(stage1_prompt, user_input)
    
    # 如果有歧义，进入阶段二
    if not stage1_result.get("disambiguation_success"):
        with open("stage2-fixed.txt", "r", encoding="utf-8") as f:
            stage2_prompt = f.read()
        stage2_result = call_kimi(stage2_prompt, user_input)
        return {"stage1": stage1_result, "stage2": stage2_result}
    
    return {"stage1": stage1_result, "stage2": None}

def main():
    # 加载测试用例
    with open("test-cases.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    
    results = []
    for test_case in data["test_cases"]:
        print(f"Testing {test_case['id']}: {test_case['name']}")
        
        # 测试两个版本
        original = test_original_version(test_case)
        fixed = test_fixed_version(test_case)
        
        results.append({
            "test_case": test_case,
            "original": original,
            "fixed": fixed
        })
    
    # 保存结果
    with open("test-results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print("测试完成，结果已保存到 test-results.json")

if __name__ == "__main__":
    main()
```

---

## 📊 对比分析维度

### 1. 关键 bug 修复验证

重点关注 TC001 和 TC002（用户发现的两个 bug）：

| 用例 | 原始版本 | 修复版本 | 是否修复 |
|------|---------|---------|---------|
| TC001（中文清晰+英文矛盾） | 预期：漏报 | 预期：正确报 B000001 | ✅ |
| TC002（技术性修饰语） | 预期：漏报 | 预期：正确报 B000002 | ✅ |

### 2. 基础场景稳定性

TC003-TC006 应该在两个版本中都判断为"无歧义"：

| 用例 | 原始版本 | 修复版本 | 是否一致 |
|------|---------|---------|---------|
| TC003（中文清晰+英文缺失） | 无歧义 | 无歧义 | ✅ |
| TC004（中文清晰+英文缩写） | 无歧义 | 无歧义 | ✅ |
| TC005（中文清晰+英文一致） | 无歧义 | 无歧义 | ✅ |
| TC006（技术字段） | 无歧义 | 无歧义 | ✅ |

### 3. 边界情况准确性

TC007-TC015 测试各种边界情况，对比两个版本的判断：

- 是否都能正确识别歧义？
- 触发的规则是否正确？
- 是否有误报或漏报？

### 4. 输出质量

对于报歧义的用例，检查：
- `reasoning` 是否合理？
- `detail` 是否准确描述了问题？
- `suggestion` 是否有实际指导意义？

---

## 📈 生成对比报告

### 报告模板

```markdown
# 提示词效果对比报告

## 测试概览
- 测试用例总数：15
- 原始版本通过：X / 15
- 修复版本通过：Y / 15

## 关键改进
1. ✅ TC001（中文清晰+英文矛盾）：原始版漏报 → 修复版正确报 B000001
2. ✅ TC002（技术性修饰语）：原始版漏报 → 修复版正确报 B000002

## 一致性分析
- 完全一致：X 个用例
- 不一致（修复改进）：Y 个用例
- 不一致（修复退化）：Z 个用例（如果有）

## 详细差异

### TC001: 中文清晰+英文矛盾
- **输入**：field_cn="投保人姓名", field_en="sex"
- **原始版本**：无歧义（❌ 漏报）
- **修复版本**：有歧义，B000001（✅ 正确）
- **分析**：修复版正确识别了严重矛盾

[对每个不一致的用例重复此格式]

## 结论
- 修复版本成功解决了用户发现的 2 个 bug
- 基础场景保持稳定，无退化
- 建议：[采用修复版本 / 需要进一步调整]
```

---

## 🎯 快速测试（最小验证集）

如果时间有限，至少测试这 5 个关键用例：

1. **TC001**（bug1）- 必测
2. **TC002**（bug2）- 必测
3. **TC003**（基础场景）- 验证无退化
4. **TC008**（边界情况）- 验证判断准确性
5. **TC013**（复杂场景）- 验证多规则触发

---

## 💡 测试建议

1. **先手动测试关键用例**（TC001-TC006），快速验证修复效果
2. **如果关键用例通过**，再测试完整的 15 个用例
3. **记录每个不一致的用例**，分析原因
4. **关注输出质量**，不仅看是否报歧义，还要看建议是否有用

---

## 📝 测试记录模板

```
测试日期：2026-05-XX
测试人员：XXX
Kimi 版本：moonshot-v1-32k

用例 TC001：
- 输入：field_cn="投保人姓名", field_en="sex"
- 原始版本：
  - 阶段一输出：{"disambiguation_success": true, ...}
  - 结论：无歧义（❌ 漏报）
- 修复版本：
  - 阶段一输出：{"disambiguation_success": false, "reasoning": "D1失败-严重矛盾", ...}
  - 阶段二输出：{"ambiguities": [{"rule_code": "B000001", ...}]}
  - 结论：有歧义，B000001（✅ 正确）
- 对比：修复版本正确识别了严重矛盾

[对每个用例重复此格式]
```
