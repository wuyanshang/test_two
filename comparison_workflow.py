"""
语义歧义检测对比测试工具 - LangGraph 工作流

功能：
1. 从 Excel 读取测试数据
2. 分别用原始版本和修复版本测试
3. 对比结果并生成报告

依赖：
pip install langgraph langchain-openai pandas openpyxl
"""

import pandas as pd
import json
from typing import TypedDict, List, Dict, Any, Literal
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from datetime import datetime
import os


# ==================== 状态定义 ====================

class TestState(TypedDict):
    """测试状态"""
    # 输入数据
    excel_path: str
    test_data: List[Dict[str, str]]

    # 提示词
    original_prompt: str
    stage1_prompt: str
    stage2_prompt: str

    # 测试结果
    current_index: int
    original_results: List[Dict[str, Any]]
    fixed_results: List[Dict[str, Any]]

    # 对比结果
    comparison: List[Dict[str, Any]]
    summary: Dict[str, Any]

    # 输出
    report_path: str
    error: str


# ==================== 节点函数 ====================

def load_excel(state: TestState) -> TestState:
    """节点1: 从 Excel 加载测试数据"""
    print("📂 加载 Excel 数据...")

    try:
        df = pd.read_excel(state["excel_path"])

        # 验证必需列
        required_columns = ["系统英文名", "系统中文名", "表英文名", "表中文名", "字段英文名", "字段中文名"]
        missing_columns = [col for col in required_columns if col not in df.columns]

        if missing_columns:
            state["error"] = f"Excel 缺少必需列: {', '.join(missing_columns)}"
            return state

        # 转换为测试数据格式
        test_data = []
        for idx, row in df.iterrows():
            test_data.append({
                "id": f"ROW_{idx + 1}",
                "system_en": str(row["系统英文名"]) if pd.notna(row["系统英文名"]) else "",
                "system_cn": str(row["系统中文名"]) if pd.notna(row["系统中文名"]) else "",
                "table_en": str(row["表英文名"]) if pd.notna(row["表英文名"]) else "",
                "table_cn": str(row["表中文名"]) if pd.notna(row["表中文名"]) else "",
                "field_en": str(row["字段英文名"]) if pd.notna(row["字段英文名"]) else "",
                "field_cn": str(row["字段中文名"]) if pd.notna(row["字段中文名"]) else "",
            })

        state["test_data"] = test_data
        state["current_index"] = 0
        state["original_results"] = []
        state["fixed_results"] = []

        print(f"✅ 成功加载 {len(test_data)} 条测试数据")

    except Exception as e:
        state["error"] = f"加载 Excel 失败: {str(e)}"

    return state


def load_prompts(state: TestState) -> TestState:
    """节点2: 加载提示词文件"""
    print("📄 加载提示词...")

    try:
        # 加载原始提示词
        with open("semantic-ambiguity.txt", "r", encoding="utf-8") as f:
            state["original_prompt"] = f.read()

        # 加载修复版提示词
        with open("stage1-fixed.txt", "r", encoding="utf-8") as f:
            state["stage1_prompt"] = f.read()

        with open("stage2-fixed.txt", "r", encoding="utf-8") as f:
            state["stage2_prompt"] = f.read()

        print("✅ 提示词加载完成")

    except Exception as e:
        state["error"] = f"加载提示词失败: {str(e)}"

    return state


def test_original_version(state: TestState) -> TestState:
    """节点3: 测试原始版本"""
    print(f"\n🧪 测试原始版本 ({len(state['test_data'])} 条数据)...")

    # 配置 Kimi API
    llm = ChatOpenAI(
        model="moonshot-v1-32k",
        temperature=0.3,
        openai_api_key=os.getenv("MOONSHOT_API_KEY"),
        openai_api_base="https://api.moonshot.cn/v1"
    )

    results = []

    for idx, data in enumerate(state["test_data"]):
        print(f"  测试 {idx + 1}/{len(state['test_data'])}: {data['field_cn']}")

        # 构造输入
        user_input = f"""表中文名: {data['table_cn']}
表英文名: {data['table_en']}
字段中文名: {data['field_cn']}
字段英文名: {data['field_en']}
字段中文名中的缩写映射: 无"""

        try:
            # 调用 LLM
            messages = [
                {"role": "system", "content": state["original_prompt"]},
                {"role": "user", "content": user_input}
            ]
            response = llm.invoke(messages)

            # 解析 JSON 响应
            content = response.content.strip()
            # 提取 JSON（可能包含在 markdown 代码块中）
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            result = json.loads(content)
            result["id"] = data["id"]
            result["success"] = True

        except Exception as e:
            result = {
                "id": data["id"],
                "success": False,
                "error": str(e),
                "has_ambiguity": None,
                "ambiguities": []
            }

        results.append(result)

    state["original_results"] = results
    print(f"✅ 原始版本测试完成")

    return state


def test_fixed_version(state: TestState) -> TestState:
    """节点4: 测试修复版本"""
    print(f"\n🧪 测试修复版本 ({len(state['test_data'])} 条数据)...")

    # 配置 Kimi API
    llm = ChatOpenAI(
        model="moonshot-v1-32k",
        temperature=0.3,
        openai_api_key=os.getenv("MOONSHOT_API_KEY"),
        openai_api_base="https://api.moonshot.cn/v1"
    )

    results = []

    for idx, data in enumerate(state["test_data"]):
        print(f"  测试 {idx + 1}/{len(state['test_data'])}: {data['field_cn']}")

        # 构造输入
        user_input = f"""表中文名: {data['table_cn']}
表英文名: {data['table_en']}
字段中文名: {data['field_cn']}
字段英文名: {data['field_en']}
缩写映射: 无"""

        try:
            # 阶段一：消歧判断
            messages = [
                {"role": "system", "content": state["stage1_prompt"]},
                {"role": "user", "content": user_input}
            ]
            stage1_response = llm.invoke(messages)

            # 解析阶段一结果
            content = stage1_response.content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            stage1_result = json.loads(content)

            # 如果有歧义，进入阶段二
            if not stage1_result.get("disambiguation_success", True):
                messages = [
                    {"role": "system", "content": state["stage2_prompt"]},
                    {"role": "user", "content": user_input}
                ]
                stage2_response = llm.invoke(messages)

                # 解析阶段二结果
                content = stage2_response.content.strip()
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0].strip()
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0].strip()

                stage2_result = json.loads(content)

                result = {
                    "id": data["id"],
                    "success": True,
                    "has_ambiguity": True,
                    "stage1": stage1_result,
                    "stage2": stage2_result,
                    "ambiguities": stage2_result.get("ambiguities", [])
                }
            else:
                result = {
                    "id": data["id"],
                    "success": True,
                    "has_ambiguity": False,
                    "stage1": stage1_result,
                    "stage2": None,
                    "ambiguities": []
                }

        except Exception as e:
            result = {
                "id": data["id"],
                "success": False,
                "error": str(e),
                "has_ambiguity": None,
                "ambiguities": []
            }

        results.append(result)

    state["fixed_results"] = results
    print(f"✅ 修复版本测试完成")

    return state


def compare_results(state: TestState) -> TestState:
    """节点5: 对比结果"""
    print("\n📊 对比结果...")

    comparison = []

    for idx, data in enumerate(state["test_data"]):
        original = state["original_results"][idx]
        fixed = state["fixed_results"][idx]

        # 提取关键信息
        original_has_ambiguity = original.get("has_ambiguity", None)
        fixed_has_ambiguity = fixed.get("has_ambiguity", None)

        original_rules = []
        if original_has_ambiguity and "ambiguities" in original:
            original_rules = [amb.get("rule_code", "") for amb in original["ambiguities"]]

        fixed_rules = []
        if fixed_has_ambiguity and "ambiguities" in fixed:
            fixed_rules = [amb.get("rule_code", "") for amb in fixed["ambiguities"]]

        # 判断一致性
        is_consistent = (original_has_ambiguity == fixed_has_ambiguity)

        if is_consistent:
            if original_has_ambiguity:
                consistency = "一致-都报歧义"
            else:
                consistency = "一致-都无歧义"
        else:
            if original_has_ambiguity is None or fixed_has_ambiguity is None:
                consistency = "错误-解析失败"
            elif fixed_has_ambiguity and not original_has_ambiguity:
                consistency = "不一致-修复改进"
            else:
                consistency = "不一致-修复退化"

        comparison.append({
            "id": data["id"],
            "field_cn": data["field_cn"],
            "field_en": data["field_en"],
            "table_cn": data["table_cn"],
            "original_has_ambiguity": original_has_ambiguity,
            "original_rules": original_rules,
            "fixed_has_ambiguity": fixed_has_ambiguity,
            "fixed_rules": fixed_rules,
            "consistency": consistency,
            "original_success": original.get("success", False),
            "fixed_success": fixed.get("success", False)
        })

    state["comparison"] = comparison

    # 生成统计摘要
    total = len(comparison)
    consistent = len([c for c in comparison if "一致" in c["consistency"]])
    improved = len([c for c in comparison if c["consistency"] == "不一致-修复改进"])
    degraded = len([c for c in comparison if c["consistency"] == "不一致-修复退化"])
    errors = len([c for c in comparison if "错误" in c["consistency"]])

    state["summary"] = {
        "total": total,
        "consistent": consistent,
        "improved": improved,
        "degraded": degraded,
        "errors": errors,
        "consistency_rate": f"{consistent / total * 100:.1f}%" if total > 0 else "0%"
    }

    print(f"✅ 对比完成")
    print(f"  总数: {total}")
    print(f"  一致: {consistent} ({state['summary']['consistency_rate']})")
    print(f"  改进: {improved}")
    print(f"  退化: {degraded}")
    print(f"  错误: {errors}")

    return state


def generate_report(state: TestState) -> TestState:
    """节点6: 生成报告"""
    print("\n📝 生成报告...")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = f"comparison_report_{timestamp}.md"

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# 语义歧义检测提示词对比报告\n\n")
        f.write(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

        # 测试概览
        f.write("## 📊 测试概览\n\n")
        f.write(f"- 测试数据总数: {state['summary']['total']}\n")
        f.write(f"- 结果一致: {state['summary']['consistent']} ({state['summary']['consistency_rate']})\n")
        f.write(f"- 修复改进: {state['summary']['improved']}\n")
        f.write(f"- 修复退化: {state['summary']['degraded']}\n")
        f.write(f"- 解析错误: {state['summary']['errors']}\n\n")

        # 详细对比
        f.write("## 📋 详细对比\n\n")
        f.write("| ID | 字段中文名 | 字段英文名 | 原始版-歧义 | 原始版-规则 | 修复版-歧义 | 修复版-规则 | 一致性 |\n")
        f.write("|----|-----------|-----------|-----------|-----------|-----------|-----------|---------|\n")

        for comp in state["comparison"]:
            original_amb = "是" if comp["original_has_ambiguity"] else "否" if comp["original_has_ambiguity"] is not None else "错误"
            fixed_amb = "是" if comp["fixed_has_ambiguity"] else "否" if comp["fixed_has_ambiguity"] is not None else "错误"
            original_rules_str = ", ".join(comp["original_rules"]) if comp["original_rules"] else "-"
            fixed_rules_str = ", ".join(comp["fixed_rules"]) if comp["fixed_rules"] else "-"

            f.write(f"| {comp['id']} | {comp['field_cn']} | {comp['field_en']} | {original_amb} | {original_rules_str} | {fixed_amb} | {fixed_rules_str} | {comp['consistency']} |\n")

        f.write("\n")

        # 改进案例
        improved_cases = [c for c in state["comparison"] if c["consistency"] == "不一致-修复改进"]
        if improved_cases:
            f.write("## ✅ 修复改进案例\n\n")
            for case in improved_cases:
                f.write(f"### {case['id']}: {case['field_cn']}\n\n")
                f.write(f"- **字段英文名**: {case['field_en']}\n")
                f.write(f"- **表中文名**: {case['table_cn']}\n")
                f.write(f"- **原始版本**: 无歧义（漏报）\n")
                f.write(f"- **修复版本**: 有歧义，规则 {', '.join(case['fixed_rules'])}\n")
                f.write(f"- **分析**: 修复版本正确识别了歧义\n\n")

        # 退化案例
        degraded_cases = [c for c in state["comparison"] if c["consistency"] == "不一致-修复退化"]
        if degraded_cases:
            f.write("## ⚠️ 修复退化案例\n\n")
            for case in degraded_cases:
                f.write(f"### {case['id']}: {case['field_cn']}\n\n")
                f.write(f"- **字段英文名**: {case['field_en']}\n")
                f.write(f"- **表中文名**: {case['table_cn']}\n")
                f.write(f"- **原始版本**: 无歧义\n")
                f.write(f"- **修复版本**: 有歧义，规则 {', '.join(case['fixed_rules'])}（误报）\n")
                f.write(f"- **分析**: 修复版本引入了误报\n\n")

        # 结论
        f.write("## 🎯 结论\n\n")
        if state['summary']['degraded'] == 0 and state['summary']['improved'] > 0:
            f.write("✅ 修复版本成功改进了检测能力，无退化，建议采用修复版本。\n")
        elif state['summary']['degraded'] > 0:
            f.write(f"⚠️ 修复版本有 {state['summary']['degraded']} 个退化案例，需要进一步调整。\n")
        else:
            f.write("✅ 两个版本结果一致，修复版本未引入问题。\n")

    state["report_path"] = report_path
    print(f"✅ 报告已生成: {report_path}")

    return state


def check_error(state: TestState) -> Literal["continue", "error"]:
    """条件边：检查是否有错误"""
    if state.get("error"):
        print(f"❌ 错误: {state['error']}")
        return "error"
    return "continue"


def handle_error(state: TestState) -> TestState:
    """节点7: 处理错误"""
    print(f"\n❌ 测试失败: {state.get('error', '未知错误')}")
    return state


# ==================== 构建工作流 ====================

def create_workflow() -> StateGraph:
    """创建 LangGraph 工作流"""

    workflow = StateGraph(TestState)

    # 添加节点
    workflow.add_node("load_excel", load_excel)
    workflow.add_node("load_prompts", load_prompts)
    workflow.add_node("test_original", test_original_version)
    workflow.add_node("test_fixed", test_fixed_version)
    workflow.add_node("compare", compare_results)
    workflow.add_node("generate_report", generate_report)
    workflow.add_node("handle_error", handle_error)

    # 设置入口
    workflow.set_entry_point("load_excel")

    # 添加边
    workflow.add_conditional_edges(
        "load_excel",
        check_error,
        {
            "continue": "load_prompts",
            "error": "handle_error"
        }
    )

    workflow.add_conditional_edges(
        "load_prompts",
        check_error,
        {
            "continue": "test_original",
            "error": "handle_error"
        }
    )

    workflow.add_edge("test_original", "test_fixed")
    workflow.add_edge("test_fixed", "compare")
    workflow.add_edge("compare", "generate_report")
    workflow.add_edge("generate_report", END)
    workflow.add_edge("handle_error", END)

    return workflow.compile()


# ==================== 主函数 ====================

def main(excel_path: str):
    """主函数"""
    print("=" * 60)
    print("语义歧义检测提示词对比测试")
    print("=" * 60)

    # 检查环境变量
    if not os.getenv("MOONSHOT_API_KEY"):
        print("❌ 错误: 请设置环境变量 MOONSHOT_API_KEY")
        return

    # 初始化状态
    initial_state = {
        "excel_path": excel_path,
        "test_data": [],
        "original_prompt": "",
        "stage1_prompt": "",
        "stage2_prompt": "",
        "current_index": 0,
        "original_results": [],
        "fixed_results": [],
        "comparison": [],
        "summary": {},
        "report_path": "",
        "error": ""
    }

    # 创建并运行工作流
    app = create_workflow()
    final_state = app.invoke(initial_state)

    print("\n" + "=" * 60)
    if final_state.get("error"):
        print("❌ 测试失败")
    else:
        print("✅ 测试完成")
        print(f"📄 报告路径: {final_state['report_path']}")
    print("=" * 60)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("用法: python comparison_workflow.py <excel文件路径>")
        print("示例: python comparison_workflow.py test_data.xlsx")
        sys.exit(1)

    excel_path = sys.argv[1]
    main(excel_path)
