/**
 * 字段质检系统 - 使用示例（混合数据源版本）
 *
 * 数据源：
 * 1. 字段列表：从 Excel 读取"字段中文名"列
 * 2. 缩写映射：从数据库查询
 */

const { loadFieldsWithAbbreviations, exportToExcel, CONFIG } = require('./hybrid-data-utils.js');
const fs = require('fs');
const path = require('path');

/**
 * 示例 1：完整流程（Excel + 数据库 → Workflow → 导出 Excel）
 */
async function example1_completeFlow() {
  console.log('========== 示例 1：完整流程（混合数据源） ==========\n');

  try {
    // 步骤 1：加载数据（Excel + 数据库）
    const fields = await loadFieldsWithAbbreviations();

    // 显示前 5 条数据示例
    console.log('数据示例（前 5 条）：');
    fields.slice(0, 5).forEach((f, i) => {
      console.log(`  ${i + 1}. ID=${f.id}, 中文名="${f.field_cn}", 缩写="${f.abbreviation_mappings}"`);
    });
    console.log('');

    // 保存字段列表到 JSON（供 Workflow 使用）
    const fieldsJsonPath = './output/fields-input.json';
    if (!fs.existsSync('./output')) {
      fs.mkdirSync('./output', { recursive: true });
    }
    fs.writeFileSync(fieldsJsonPath, JSON.stringify({ fields }, null, 2));
    console.log(`✓ 字段列表已保存到：${fieldsJsonPath}\n`);

    // 步骤 2：准备调用 Workflow
    console.log('========== 准备调用 Workflow ==========');
    console.log(`预计耗时: 约 ${Math.ceil(fields.length / 100)} 分钟`);
    console.log(`预计 Token: 约 ${Math.ceil(fields.length * 500 / 1000)}K tokens\n`);

    console.log('请在 Claude Code 对话框中输入：\n');
    console.log('------- 复制开始 -------');
    console.log('请使用 workflow 工具执行两阶段质检');
    console.log(`scriptPath: ${path.resolve('./workflow-two-stage.js')}`);
    console.log(`args: 读取 ${path.resolve(fieldsJsonPath)} 中的 fields 数组`);
    console.log('------- 复制结束 -------\n');

    // 步骤 3：导出 Excel（Workflow 完成后）
    console.log('========== Workflow 完成后 ==========');
    console.log('将结果传递给 exportToExcel() 函数\n');
    console.log('示例代码：');
    console.log('const { exportToExcel } = require("./hybrid-data-utils.js");');
    console.log('exportToExcel(workflowResult, "./output/field-quality-report.xlsx");\n');

    return fields;

  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
    return null;
  }
}

/**
 * 示例 2：测试模式（创建测试 Excel + 模拟数据库）
 */
async function example2_createTestData() {
  console.log('========== 示例 2：创建测试数据 ==========\n');

  const XLSX = require('xlsx');

  // 创建测试 Excel
  const testExcelData = [
    { 'ID': 1, '字段中文名': '金额' },
    { 'ID': 2, '字段中文名': '投保人姓名' },
    { 'ID': 3, '字段中文名': '保单号' },
    { 'ID': 4, '字段中文名': '公司别' },
    { 'ID': 5, '字段中文名': 'WP客户端类型' },
    { 'ID': 6, '字段中文名': 'TP类型' },
    { 'ID': 7, '字段中文名': '金额字段1' },
    { 'ID': 8, '字段中文名': '被保人姓名' },
    { 'ID': 9, '字段中文名': '排序' },
    { 'ID': 10, '字段中文名': '保费金额' }
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(testExcelData);
  ws['!cols'] = [{ wch: 10 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  if (!fs.existsSync('./input')) {
    fs.mkdirSync('./input', { recursive: true });
  }
  const testExcelPath = './input/test-fields.xlsx';
  XLSX.writeFile(wb, testExcelPath);

  console.log(`✓ 测试 Excel 已创建：${testExcelPath}`);
  console.log(`  包含 ${testExcelData.length} 个测试字段\n`);

  // 创建测试数据库 SQL
  const testDbSql = `
-- 创建缩写映射表
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
`;

  const testDbSqlPath = './input/test-db.sql';
  fs.writeFileSync(testDbSqlPath, testDbSql);

  console.log(`✓ 测试数据库 SQL 已创建：${testDbSqlPath}`);
  console.log('  请在数据库中执行此 SQL 创建测试数据\n');

  console.log('下一步：');
  console.log('1. 在数据库中执行 test-db.sql');
  console.log('2. 修改 hybrid-data-utils.js 中的数据库配置');
  console.log('3. 运行 example1_completeFlow()\n');
}

/**
 * 示例 3：只加载数据（不调用 Workflow）
 */
async function example3_loadOnly() {
  console.log('========== 示例 3：只加载数据 ==========\n');

  try {
    const fields = await loadFieldsWithAbbreviations();
    console.log(`\n加载完成，共 ${fields.length} 个字段：\n`);

    // 显示所有字段
    fields.forEach((f, i) => {
      console.log(`${i + 1}. [ID=${f.id}] ${f.field_cn} (缩写: ${f.abbreviation_mappings})`);
    });

    console.log('\n✓ 加载完成！');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
  }
}

/**
 * 示例 4：导出 Excel（使用模拟数据）
 */
function example4_exportMock() {
  console.log('========== 示例 4：导出 Excel（模拟数据） ==========\n');

  // 模拟 Workflow 返回的结果
  const mockResult = {
    total: 10,
    pass: 6,
    pass_override: 1,
    fail: 3,
    details: [
      {
        id: 1,
        field_cn: '金额',
        abbreviation_mappings: '无',
        final_status: 'fail',
        has_ambiguity: true,
        stage1_path: 'D1失败-无业务限定',
        stage1_summary: '缺少业务限定，消歧失败',
        stage2_ambiguities: [
          {
            rule_code: 'B000002',
            detail: "字段中文名'金额'缺少业务限定，无法确定是保费、赔款还是其他金额",
            suggestion: "添加业务限定，如'保费金额'、'理赔金额'等"
          }
        ],
        stage2_summary: '缺少业务限定'
      },
      {
        id: 2,
        field_cn: '投保人姓名',
        abbreviation_mappings: '无',
        final_status: 'pass',
        has_ambiguity: false,
        stage1_path: 'D1: 中文名清晰明确',
        stage1_summary: '中文名清晰，消歧成功',
        stage2_ambiguities: [],
        stage2_summary: ''
      },
      {
        id: 3,
        field_cn: '保单号',
        abbreviation_mappings: '无',
        final_status: 'pass',
        has_ambiguity: false,
        stage1_path: 'D1: 中文名清晰明确',
        stage1_summary: '中文名清晰，消歧成功',
        stage2_ambiguities: [],
        stage2_summary: ''
      },
      {
        id: 4,
        field_cn: '公司别',
        abbreviation_mappings: '无',
        final_status: 'fail',
        has_ambiguity: true,
        stage1_path: 'D1失败-指代不清',
        stage1_summary: '指代对象不够精确，消歧失败',
        stage2_ambiguities: [
          {
            rule_code: 'B000003',
            detail: "字段中文名'公司别'指代对象不够精确，无法判断实际业务含义",
            suggestion: "明确指代对象，如'保险公司代码'、'所属公司'等"
          }
        ],
        stage2_summary: '中文名不明确'
      },
      {
        id: 5,
        field_cn: 'WP客户端类型',
        abbreviation_mappings: 'WP=豁免',
        final_status: 'pass',
        has_ambiguity: false,
        stage1_path: 'D1: 中文名结合缩写映射清晰明确',
        stage1_summary: '中文名清晰，消歧成功',
        stage2_ambiguities: [],
        stage2_summary: ''
      },
      {
        id: 6,
        field_cn: 'TP类型',
        abbreviation_mappings: 'TP=第三方',
        final_status: 'pass',
        has_ambiguity: false,
        stage1_path: 'D1: 中文名结合缩写映射清晰明确',
        stage1_summary: '中文名清晰，消歧成功',
        stage2_ambiguities: [],
        stage2_summary: ''
      },
      {
        id: 7,
        field_cn: '金额字段1',
        abbreviation_mappings: '无',
        final_status: 'fail',
        has_ambiguity: true,
        stage1_path: 'D1失败-无业务限定',
        stage1_summary: '缺少业务限定，消歧失败',
        stage2_ambiguities: [
          {
            rule_code: 'B000002',
            detail: "字段中文名'金额字段1'中的'字段1'是技术性编号，非业务限定修饰语，无法确定是哪类金额",
            suggestion: "将'字段1'替换为业务限定，如'保费金额'、'理赔金额'等"
          }
        ],
        stage2_summary: '缺少业务限定'
      },
      {
        id: 8,
        field_cn: '被保人姓名',
        abbreviation_mappings: '无',
        final_status: 'pass',
        has_ambiguity: false,
        stage1_path: 'D1: 中文名清晰明确',
        stage1_summary: '中文名清晰，消歧成功',
        stage2_ambiguities: [],
        stage2_summary: ''
      },
      {
        id: 9,
        field_cn: '排序',
        abbreviation_mappings: '无',
        final_status: 'pass_override',
        has_ambiguity: false,
        stage1_path: 'D1失败-无业务限定',
        stage1_summary: '缺少业务限定，消歧失败',
        stage2_ambiguities: [],
        stage2_summary: '中文名含义清晰，未触发任何歧义规则，覆盖阶段一消歧失败判定'
      },
      {
        id: 10,
        field_cn: '保费金额',
        abbreviation_mappings: '无',
        final_status: 'pass',
        has_ambiguity: false,
        stage1_path: 'D1: 中文名清晰明确',
        stage1_summary: '中文名清晰，消歧成功',
        stage2_ambiguities: [],
        stage2_summary: ''
      }
    ]
  };

  console.log('使用模拟数据导出 Excel...\n');
  exportToExcel(mockResult, './output/mock-report.xlsx');
  console.log('\n✓ 导出完成！');
}

// ========== 主函数 ==========
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--create-test')) {
    await example2_createTestData();
  } else if (args.includes('--load-only')) {
    await example3_loadOnly();
  } else if (args.includes('--export-mock')) {
    example4_exportMock();
  } else {
    console.log('字段质检系统 - 使用示例（混合数据源版本）\n');
    console.log('数据源：');
    console.log('  1. 字段列表：从 Excel 读取"字段中文名"列');
    console.log('  2. 缩写映射：从数据库查询\n');
    console.log('可用命令：');
    console.log('  node example-usage-hybrid.js                - 完整流程示例');
    console.log('  node example-usage-hybrid.js --create-test  - 创建测试数据');
    console.log('  node example-usage-hybrid.js --load-only    - 只加载数据');
    console.log('  node example-usage-hybrid.js --export-mock  - 导出 Excel 示例\n');

    await example1_completeFlow();
  }
}

// 运行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  example1_completeFlow,
  example2_createTestData,
  example3_loadOnly,
  example4_exportMock
};
