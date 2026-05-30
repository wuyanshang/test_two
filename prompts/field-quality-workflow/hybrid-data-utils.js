/**
 * 数据读取工具（混合模式）
 *
 * 功能：
 * 1. 从 Excel 读取字段列表（"字段中文名"列）
 * 2. 从数据库查询缩写映射表
 * 3. 合并两个数据源
 * 4. 将 Workflow 结果导出为 Excel
 */

const XLSX = require('xlsx');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// ========== 配置项 ==========
const CONFIG = {
  // Excel 输入配置
  excel: {
    inputPath: './input/fields.xlsx',     // 输入 Excel 文件路径
    sheetName: null,                      // 工作表名称（null表示使用第一个工作表）
    fieldCnColumn: '字段中文名',           // 字段中文名列名
    idColumn: 'ID'                        // ID列名（可选，如果没有则自动生成）
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
    tableName: 'abbreviation_mappings',   // 缩写映射表名
    fieldCnColumn: 'field_cn',            // 字段中文名列名
    mappingColumn: 'abbreviation_mapping' // 缩写映射列名
  },

  // 输出配置
  output: {
    dir: './output',
    excelFileName: 'field-quality-report.xlsx'
  }
};

// ========== 从 Excel 读取字段列表 ==========
function readFieldsFromExcel(excelPath = CONFIG.excel.inputPath) {
  console.log(`正在读取 Excel 文件：${excelPath}`);

  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel 文件不存在：${excelPath}`);
  }

  // 读取 Excel 文件
  const workbook = XLSX.readFile(excelPath);

  // 获取工作表
  const sheetName = CONFIG.excel.sheetName || workbook.SheetNames[0];
  console.log(`使用工作表：${sheetName}`);

  const worksheet = workbook.Sheets[sheetName];

  // 转换为 JSON
  const data = XLSX.utils.sheet_to_json(worksheet);

  if (data.length === 0) {
    throw new Error('Excel 文件中没有数据');
  }

  console.log(`读取到 ${data.length} 行数据`);

  // 提取字段列表
  const fields = data.map((row, index) => {
    // 获取字段中文名
    const field_cn = row[CONFIG.excel.fieldCnColumn];

    if (!field_cn || field_cn.trim() === '') {
      console.warn(`警告：第 ${index + 2} 行的字段中文名为空，已跳过`);
      return null;
    }

    // 获取 ID（如果有）
    const id = row[CONFIG.excel.idColumn] || (index + 1);

    return {
      id: id,
      field_cn: field_cn.trim()
    };
  }).filter(Boolean);  // 过滤掉空值

  console.log(`有效字段数：${fields.length}`);

  return fields;
}

// ========== 从数据库查询缩写映射表 ==========
async function queryAbbreviationMappings() {
  console.log('正在连接数据库查询缩写映射表...');
  const connection = await mysql.createConnection(CONFIG.db);

  const sql = `SELECT ${CONFIG.abbreviation.fieldCnColumn} as field_cn, ${CONFIG.abbreviation.mappingColumn} as abbreviation_mapping FROM ${CONFIG.abbreviation.tableName}`;

  console.log('执行查询:', sql);
  const [rows] = await connection.query(sql);
  await connection.end();

  console.log(`查询到 ${rows.length} 条缩写映射记录`);

  // 转换为 Map（字段中文名 -> 缩写映射）
  const mappingMap = new Map();
  rows.forEach(row => {
    if (row.field_cn && row.abbreviation_mapping) {
      mappingMap.set(row.field_cn.trim(), parseAbbreviationMappings(row.abbreviation_mapping));
    }
  });

  return mappingMap;
}

function parseAbbreviationMappings(mappingsStr) {
  if (!mappingsStr || mappingsStr.trim() === '') return '无';

  // 如果已经是格式化的字符串，直接返回
  if (typeof mappingsStr === 'string' && mappingsStr.includes('=')) {
    return mappingsStr.trim();
  }

  // 尝试解析格式：WP=豁免,TP=第三方
  try {
    const pairs = mappingsStr.split(',').map(pair => {
      const [abbr, meaning] = pair.split('=').map(s => s.trim());
      return `${abbr}=${meaning}`;
    });
    return pairs.join(', ');
  } catch (e) {
    return mappingsStr.trim();
  }
}

// ========== 合并字段列表和缩写映射 ==========
async function loadFieldsWithAbbreviations() {
  console.log('========== 开始加载数据 ==========\n');

  // 步骤 1：从 Excel 读取字段列表
  console.log('[1/3] 从 Excel 读取字段列表');
  console.log('----------------------------------------');
  const fields = readFieldsFromExcel();
  console.log(`✓ 读取完成，共 ${fields.length} 个字段\n`);

  // 步骤 2：从数据库查询缩写映射表
  console.log('[2/3] 从数据库查询缩写映射表');
  console.log('----------------------------------------');
  const abbreviationMap = await queryAbbreviationMappings();
  console.log(`✓ 查询完成，共 ${abbreviationMap.size} 条映射记录\n`);

  // 步骤 3：合并数据
  console.log('[3/3] 合并字段列表和缩写映射');
  console.log('----------------------------------------');
  const fieldsWithAbbreviations = fields.map(field => {
    const abbreviation_mappings = abbreviationMap.get(field.field_cn) || '无';
    return {
      id: field.id,
      field_cn: field.field_cn,
      abbreviation_mappings: abbreviation_mappings
    };
  });

  // 统计有缩写映射的字段数量
  const withAbbreviationCount = fieldsWithAbbreviations.filter(f => f.abbreviation_mappings !== '无').length;
  console.log(`✓ 合并完成`);
  console.log(`  - 总字段数：${fieldsWithAbbreviations.length}`);
  console.log(`  - 有缩写映射：${withAbbreviationCount}`);
  console.log(`  - 无缩写映射：${fieldsWithAbbreviations.length - withAbbreviationCount}\n`);

  return fieldsWithAbbreviations;
}

// ========== Excel 导出 ==========
function exportToExcel(results, outputPath = null) {
  if (!outputPath) {
    outputPath = path.join(CONFIG.output.dir, CONFIG.output.excelFileName);
  }

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('\n开始导出 Excel...');

  // 工作表 1：质检结果
  const excelData = results.details.map(r => {
    const ruleCodes = r.stage2_ambiguities.map(a => a.rule_code).join(', ');
    const details = r.stage2_ambiguities.map(a => a.detail).join('\n');
    const suggestions = r.stage2_ambiguities.map(a => a.suggestion).join('\n');

    let statusCn = r.final_status === 'pass' ? '通过' :
                   r.final_status === 'pass_override' ? '覆盖通过' : '失败';

    return {
      '字段ID': r.id,
      '字段中文名': r.field_cn,
      '缩写映射': r.abbreviation_mappings || '无',
      '最终状态': statusCn,
      '是否有歧义': r.has_ambiguity ? '是' : '否',
      '阶段一消歧路径': r.stage1_path,
      '阶段一总结': r.stage1_summary,
      '阶段二触发规则': ruleCodes,
      '阶段二歧义详情': details,
      '阶段二消歧建议': suggestions,
      '阶段二总结': r.stage2_summary
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelData);
  ws['!cols'] = [
    { wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
    { wch: 50 }, { wch: 30 }, { wch: 20 }, { wch: 60 }, { wch: 60 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, '质检结果');

  // 工作表 2：统计汇总
  const passRate = ((results.pass + results.pass_override) / results.total * 100).toFixed(2);
  const statsData = [
    { '指标': '总字段数', '数量': results.total },
    { '指标': '通过（阶段一）', '数量': results.pass },
    { '指标': '覆盖通过（阶段二）', '数量': results.pass_override },
    { '指标': '失败（有歧义）', '数量': results.fail },
    { '指标': '通过率', '数量': `${passRate}%` }
  ];
  const statsWs = XLSX.utils.json_to_sheet(statsData);
  statsWs['!cols'] = [{ wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, statsWs, '统计汇总');

  // 工作表 3：失败字段明细
  const failedFields = results.details.filter(r => r.final_status === 'fail');
  if (failedFields.length > 0) {
    const failedData = failedFields.map(r => ({
      '字段ID': r.id,
      '字段中文名': r.field_cn,
      '缩写映射': r.abbreviation_mappings || '无',
      '触发规则': r.stage2_ambiguities.map(a => a.rule_code).join(', '),
      '歧义详情': r.stage2_ambiguities.map(a => a.detail).join('\n'),
      '消歧建议': r.stage2_ambiguities.map(a => a.suggestion).join('\n')
    }));
    const failedWs = XLSX.utils.json_to_sheet(failedData);
    failedWs['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 60 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, failedWs, '失败字段明细');
  }

  XLSX.writeFile(wb, outputPath);
  console.log(`✓ Excel 已导出：${outputPath}`);
  console.log(`  总计: ${results.total}, 通过: ${results.pass}, 覆盖通过: ${results.pass_override}, 失败: ${results.fail}, 通过率: ${passRate}%`);
}

module.exports = {
  CONFIG,
  readFieldsFromExcel,
  queryAbbreviationMappings,
  loadFieldsWithAbbreviations,
  exportToExcel
};
