// 字段质检 Workflow 脚本：两阶段质检
// 使用方式：Workflow({ scriptPath: './workflow-two-stage.js', args: { fields: [...] } })

export const meta = {
  name: 'field-quality-check-two-stage',
  description: '两阶段全量字段质检（纯中文名场景）',
  phases: [
    { title: 'Stage1', detail: '阶段一：消歧判断' },
    { title: 'Stage2', detail: '阶段二：歧义分类' }
  ]
}

// 从 args 获取字段列表
const fields = args.fields;

if (!fields || !Array.isArray(fields) || fields.length === 0) {
  throw new Error('args.fields 必须是非空数组');
}

log(`开始两阶段质检，共 ${fields.length} 个字段`);

// ========== 阶段一提示词模板 ==========
const STAGE1_PROMPT_TEMPLATE = `# 语义歧义检测 - 阶段一：消歧判断（纯中文名场景）

<role>
你是保险领域的语义质量检测专家，熟悉保险术语和数据库命名规范。
</role>

<task>
判断字段中文名是否清晰明确，能够确定字段实际存储的内容。
</task>

<input>
字段中文名: {field_cn}
缩写映射: {abbreviation_mappings}
</input>

<output_format>
输出纯 JSON：
{
  "has_ambiguity": false,
  "disambiguation_path": "D1: 中文名清晰明确",
  "ambiguities": [],
  "summary": "中文名清晰，消歧成功"
}
</output_format>

<disambiguation_paths>
### D1：字段中文名本身清晰

**步骤1：高风险词表前置检查**
仅当 field_cn 逐字包含以下词表中的某个词时才进入本步骤，否则跳过进入步骤2：
姓名 / 状态 / 日期 / 金额 / 关系 / 编号 / 利率 / 地址

- 无业务限定修饰语 → 不清晰，D1失败
- 有业务限定修饰语 → 清晰，进入步骤2

**业务限定修饰语**：业务实体（被保人、投保人、保单等）、业务场景（投保、理赔等）、业务属性（保费、赔款等）
**非业务限定**：技术性词汇（字段、信息、数据等）、序号（1、2、3等）、通用词（的、相关等）

**步骤2：检查中文名是否明确**
- field_cn 是可理解的中文业务描述，指代对象明确 → D1 通过
- field_cn 是英文、无意义字符，或指代对象不够精确 → D1 失败
</disambiguation_paths>

<execution_rules>
1. 按 D1 步骤1 → 步骤2 顺序执行
2. D1 通过 → has_ambiguity = false
3. D1 失败 → has_ambiguity = true
</execution_rules>`;

// ========== 阶段二提示词模板 ==========
const STAGE2_PROMPT_TEMPLATE = `# 语义歧义检测 - 阶段二：歧义分类（纯中文名场景）

<role>
你是保险领域的语义质量检测专家，专注于字段元数据的歧义分类。
</role>

<task>
对消歧失败的字段，判断触发了哪些歧义规则。一个字段可能同时触发多条规则。
</task>

<input>
字段中文名: {field_cn}
缩写映射: {abbreviation_mappings}
</input>

<output_format>
输出纯 JSON：
{
  "has_ambiguity": true,
  "ambiguities": [
    {
      "rule_code": "B000002",
      "detail": "具体描述歧义点",
      "suggestion": "消歧建议"
    }
  ],
  "summary": "一句话概括歧义情况"
}
</output_format>

<rules>
## B000002 - 字段中文名缺少业务限定
**前置过滤**：field_cn 是否包含高风险词表中的词？
高风险词表：姓名 / 状态 / 日期 / 金额 / 关系 / 编号 / 利率 / 地址

**匹配规则**：
- field_cn 包含词表中的词 + 无业务限定修饰语 → 命中
- field_cn 包含词表中的词 + 有业务限定修饰语 → 不命中

**业务限定修饰语**：业务实体、业务场景、业务属性
**非业务限定**：技术性词汇、序号、通用词

## B000003 - 字段中文名不明确
field_cn 是英文、无意义字符，或指代对象不够精确。

## B000004 - 字段中文名英文缩写不明确
field_cn 中的缩写有多种合理展开，且不同展开指向不同业务含义。
</rules>

<override_logic>
- 如果 B000002~B000004 至少有一条规则触发 → has_ambiguity = true
- 如果 B000002~B000004 全部未触发 → has_ambiguity = false（覆盖阶段一）
</override_logic>`;

// ========== JSON Schema 定义 ==========
const STAGE1_SCHEMA = {
  type: 'object',
  properties: {
    has_ambiguity: { type: 'boolean' },
    disambiguation_path: { type: 'string' },
    ambiguities: { type: 'array' },
    summary: { type: 'string' }
  },
  required: ['has_ambiguity', 'disambiguation_path', 'ambiguities', 'summary']
};

const STAGE2_SCHEMA = {
  type: 'object',
  properties: {
    has_ambiguity: { type: 'boolean' },
    ambiguities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rule_code: { type: 'string' },
          detail: { type: 'string' },
          suggestion: { type: 'string' }
        },
        required: ['rule_code', 'detail', 'suggestion']
      }
    },
    summary: { type: 'string' }
  },
  required: ['has_ambiguity', 'ambiguities', 'summary']
};

// ========== 阶段一：消歧判断 ==========
phase('Stage1');

const stage1Results = await pipeline(
  fields,
  (field) => {
    const prompt = STAGE1_PROMPT_TEMPLATE
      .replace('{field_cn}', field.field_cn)
      .replace('{abbreviation_mappings}', field.abbreviation_mappings || '无');

    return agent(prompt, {
      label: `S1: ${field.field_cn}`,
      phase: 'Stage1',
      schema: STAGE1_SCHEMA
    }).then(result => ({
      id: field.id,
      field_cn: field.field_cn,
      abbreviation_mappings: field.abbreviation_mappings,
      stage1: result
    }));
  }
);

const validStage1 = stage1Results.filter(Boolean);
const stage1Pass = validStage1.filter(r => !r.stage1.has_ambiguity);
const stage1Fail = validStage1.filter(r => r.stage1.has_ambiguity);

log(`阶段一完成：通过 ${stage1Pass.length}，失败 ${stage1Fail.length}`);

// ========== 阶段二：歧义分类（仅对消歧失败的字段） ==========
phase('Stage2');

let stage2Results = [];
if (stage1Fail.length > 0) {
  stage2Results = await pipeline(
    stage1Fail,
    (field) => {
      const prompt = STAGE2_PROMPT_TEMPLATE
        .replace('{field_cn}', field.field_cn)
        .replace('{abbreviation_mappings}', field.abbreviation_mappings || '无');

      return agent(prompt, {
        label: `S2: ${field.field_cn}`,
        phase: 'Stage2',
        schema: STAGE2_SCHEMA
      }).then(result => ({
        ...field,
        stage2: result
      }));
    }
  );
}

const validStage2 = stage2Results.filter(Boolean);
log(`阶段二完成：检测 ${validStage2.length} 个字段`);

// ========== 结果汇总 ==========
const finalResults = [
  // 阶段一通过的字段
  ...stage1Pass.map(r => ({
    id: r.id,
    field_cn: r.field_cn,
    abbreviation_mappings: r.abbreviation_mappings,
    final_status: 'pass',
    has_ambiguity: false,
    stage1_path: r.stage1.disambiguation_path,
    stage1_summary: r.stage1.summary,
    stage2_ambiguities: [],
    stage2_summary: ''
  })),
  // 阶段二覆盖为通过的字段
  ...validStage2.filter(r => !r.stage2.has_ambiguity).map(r => ({
    id: r.id,
    field_cn: r.field_cn,
    abbreviation_mappings: r.abbreviation_mappings,
    final_status: 'pass_override',
    has_ambiguity: false,
    stage1_path: r.stage1.disambiguation_path,
    stage1_summary: r.stage1.summary,
    stage2_ambiguities: [],
    stage2_summary: r.stage2.summary
  })),
  // 阶段二确认有歧义的字段
  ...validStage2.filter(r => r.stage2.has_ambiguity).map(r => ({
    id: r.id,
    field_cn: r.field_cn,
    abbreviation_mappings: r.abbreviation_mappings,
    final_status: 'fail',
    has_ambiguity: true,
    stage1_path: r.stage1.disambiguation_path,
    stage1_summary: r.stage1.summary,
    stage2_ambiguities: r.stage2.ambiguities,
    stage2_summary: r.stage2.summary
  }))
];

// 统计
const totalCount = finalResults.length;
const passCount = finalResults.filter(r => r.final_status === 'pass').length;
const passOverrideCount = finalResults.filter(r => r.final_status === 'pass_override').length;
const failCount = finalResults.filter(r => r.final_status === 'fail').length;

log(`质检完成：总计 ${totalCount}，通过 ${passCount}，覆盖通过 ${passOverrideCount}，失败 ${failCount}`);

// 返回结果
return {
  total: totalCount,
  pass: passCount,
  pass_override: passOverrideCount,
  fail: failCount,
  details: finalResults
};
