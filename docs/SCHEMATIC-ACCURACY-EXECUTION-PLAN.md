# Schematic 准确性改进 — execution plan

状态：已完成（2026-09-06）。P0–P5 的代码、回归、独立 SPICE 对照和资产预算验收均已执行；未建模的硬件效应仍按 coverage metadata 明确标注。

## 1. 目标与准确性边界

让 schematic 完整表达用户实际连接的每一个端子，并让浏览器、API、电气规则检查和求解器对连接关系形成一致解释。

准确性分开验收：

| 层次 | 要证明的事情 | 不能据此推断的事情 |
| --- | --- | --- |
| 拓扑 | 每个端子连接到正确的 net，没有漏接或误合并 | 电路一定能正常工作 |
| 图示 | 符号端子、极性、junction、网络标签与拓扑一致 | SVG 字符串测试通过就没有视觉歧义 |
| ERC | 对已声明的器件能力检出指定错误，未知能力明确标识 | 没有告警就满足全部电气约束 |
| 数值仿真 | 在指定器件模型、输入、分析模式下达到规定误差 | 数值收敛就等同于真实硬件表现 |

首要交付是拓扑和图示可信，再统一 ERC 并验证现有 solver adapter。增加器件模型精度另设验收，不以本次结构迁移承诺硬件级精度。

## 2. 现状核对与优先问题

依据当前工作区代码：

| 实现位置 | 已有能力 / 观察 | 计划处理 |
| --- | --- | --- |
| `app/src/breadboard/breadboard-grid.ts` | `resolveNets()` 已生成包含 boardId 的连接集合；net ID 按遍历顺序编号 | 复用并提取连接内核，增加稳定端子标识与连接来源 |
| `app/src/simulator/netlist-builder.ts` | 已有 SPICE 文本生成，复用 `resolveNets()`，包含电源、PWM、短路信息和浮空节点数值辅助 | 保留器件模型和分析模式，改为消费统一拓扑；区分电路连接与数值辅助 |
| `app/src/schematic/schematic-layout.ts` | 同样使用 `resolveNets()`，但重新匹配 pin；多个循环通过 `break` 每个组件/net 仅保留一个端子 | 首批回归覆盖多个端子同网，按端子枚举，不按组件去重 |
| 同上 | `SchematicTerminalSide` 表达有限位置，fallback 超过六个端子会重复位置 | 用独立 portId 表达身份；位置改为端子几何数据 |
| 同上 | 电源/GND 转换为局部旗标，旗标未保留 netId；同网电源与地采用分类优先级 | 保留 netId 与全部电源成员；短路必须可见，隔离网络不能仅凭同名旗标混淆 |
| `api/src/electrical/power-budget-analyzer.ts` | 另有 DisjointSet；坐标 key 未携带 boardId；还包含自身的电源 footprint 规则 | 与共享解析器对齐；用多面包板、外部 PSU 案例验证 |
| `app/src/electrical/power-budget.ts` | 浏览器侧电气规则与 API 分开实现 | 统一连接输入和可共享规则；展示 adapter 留在各端 |
| `schemas/src/diagram-validator.ts` | 结构检查与启发式语义检查分开；缺地检查注释明确存在近似 | 保留 schema 边界验证，将连接相关规则逐步移到共享 ERC |
| `schematic/__tests__/schematic-renderer.test.tsx` | 部分测试复制生产 helper 的实现；另有真实 renderer 测试 | 替换复制逻辑的测试，断言生产输出和独立预期 |

需纠正此前说明：项目并非“没有 netlist”。缺的是跨消费者统一、以逻辑端子为核心、可独立验证的电路拓扑契约。`SchematicPanel` 本身也没有对每次 Board 编辑调用 `validateDiagram()`，不能把导入验证称为实时 schematic 验证。

## 3. 数据归属与目标结构

```text
持久化 Board（components、wires、boardTarget、组件规格引用）
                      ↓
            编译 ElectricalTopology
                      ↓
        ┌─────────────┼────────────────┐
   Schematic adapter  共享 ERC       SPICE adapter
        ↓                               ↑
   Layout / SVG                运行时 GPIO / PWM / 器件状态
```

确定以下归属，避免制造重复数据源：

- Board 继续拥有用户编写的连接与物理放置数据。ElectricalTopology 为不可编辑的派生值，不另存一份可写 wiring。
- `ProjectFile.graph` 是程序图，不是本次电路拓扑；本次不改 graph/sketchCode 归属。
- Schematic 只拥有展示几何；若以后支持手动布局，仅持久化位置、路径偏好，引用稳定端子 ID。
- GPIO 电平、按钮状态、继电器触点状态等属于运行时。它们影响器件行为或 solver 输入，不将所有状态下的端子永久并网。
- 纯电气类型与算法放在 `packages/board-domain/src/electrical/`。供 API/导出使用的 DTO schema 放在 `packages/schemas`，保持 schemas 不依赖 board-domain。
- 共享内核不导入 React、Three、浏览器组件 registry 或 solver WASM；通过显式、无渲染依赖的规格输入接收 pin/footprint 信息。

## 4. 拓扑契约

拟提供 `compileElectricalTopology(board, specs)`，返回 topology、diagnostics、coverage；缺失规格必须可见，不能猜一个 signal pin 后宣称完整。

| 字段 | 语义 |
| --- | --- |
| terminalId | 结构化标识 `{ componentId, pinId }`；MCU pin 也带所属 board component ID |
| terminal placement | 物理孔位 `{ surfaceBoardId, row, col }`，允许逻辑端子映射多个接触点 |
| nets | 连通分量及全部端子成员，包括孤立端子的单成员 net |
| terminalToNet | 每个已解析端子恰好归属一个 net |
| provenance | wire ID、面包板导电排、显式内部硬连接等连接来源，支持解释连接路径 |
| diagnostics | 稳定 code、severity、相关 component/pin/wire/net 引用、证据和建议 |
| coverage | 已解析 / 缺少 pin 规格 / 不支持布局 / 缺少电气模型分别记录 |
| revision metadata | 输入指纹、规格版本、编译器版本；防止展示过期诊断或仿真结果 |

不变量：

1. 只通过显式连接关系合并导线网络。电阻、LED、电机绕组等器件连接两个节点，但不能将节点直接 union。
2. 不同面包板的相同 row/col 默认隔离；电源轨分段与 MCU 物理别名由板规格声明。
3. 元件所有端子必须保留，同一器件多个端子允许属于同一 net，包括用户误短接的情况。
4. 极性和端子身份来自组件规格；旋转、镜像、视图位置不能改变 pinId。
5. 两个独立 5V 网络、两个隔离 return 网络不会因为标签相同被合并。SPICE 参考节点选择也不得修改共享拓扑。
6. net ID 对相同输入和成员稳定；拆网/并网可以产生新 ID。需要持久追踪的选择和诊断以 terminalId 为基础，不承诺 net ID 永久不变。
7. 旧 wire sentinel、缺省 boardId 在输入 adapter 规范化。无法唯一归属时返回诊断，不任意选择一个 board。

## 5. Schematic 表达与验证

分成三个生产接口：`buildSchematicModel(topology, symbols)` → `layoutSchematic(model)` → SVG renderer。

- Model 中每个电气端子有独立 portId，保留 terminalId/netId；一个 pin 的重复视觉表示必须有显式别名关系。
- Symbol 定义同时提供形状和端子坐标；layout、routing、renderer 共享这份端子几何，避免独立偏移表漂移。
- 通用模块按 pin 数量扩展高度和端子槽位，覆盖超过六个 pin 的自定义组件；未知电气 pin 不用虚构端子补齐。
- 电源旗标与 net 标签携带 netId；隔离同名电源可显示限定名称。电源与地短接保留冲突证据和可见告警。
- 连线几何交叉不推导电气连接。junction 由 net 身份及实际分支决定；不同网重叠需绕线或提供清晰的不连接表示。
- 独立检查 schematic model 的端子连通分区与 topology 相等；检查实际 routed segments、net 标签与 junction 的显示连接分区，防止“元数据对、画错了”。
- 旧 SVG 尽量复用。先保连接准确，再改全局排布美观；通用布局引擎的引入以拥挤案例和性能数据决定。

## 6. ERC 与求解边界

ERC 接收 topology + 电气规格；运行时相关检查额外接收带时间戳的状态。

首批共享规则：明确电源/GND短路、不同额定电源直接并接、必需供电/返回端子未连接、组件声明的输入电压范围不匹配、I²C 别名/连接缺失、已知状态下的输出冲突、必需端子悬空。

输入/输出规则区分 push-pull、open-drain、tri-state；未知 GPIO 模式不能当作确定输出冲突。电压、电流判断标明依据是额定值、预算估计还是某一仿真采样。未知器件能力返回 unknown，不返回通过。

SPICE adapter 复用当前器件模型，先保持 `op`、`transient`、PWM、电源内阻及保护行为。输出包含 terminalId → SPICE node 映射、模型覆盖率、分析设置、警告、结果单位和收敛状态。

浮空节点 bleed resistor 等数值辅助只存在于 solver 层，并记录到结果中；不能出现在 schematic 或充当 ERC 的真实接地路径。浮动子电路选择局部参考或分岛求解；不能为了共用 node 0 静默短接隔离电源。验证电压时明确参考端子，优先比较两端电压。

## 7. 分阶段执行与验收

### P0 — 基线与已知缺陷案例

建立人工审阅的 `expected-net-members` fixtures，明确端子列表及连通分区。覆盖多个 pin 同网、反向 LED、旋转组件、多面包板、独立电源、短路、超过六 pin 的自定义模块。

运行现有 schematic、netlist-builder、circuit-solver、power-budget 测试并记录真实结果。为已观察到的缺口增加能暴露问题的生产接口测试；不能以复制 helper 或当前 resolver 输出作为唯一预期。

验收：每个差异能定位到 fixture、具体端子和预期连接；完成基线后才选择迁移切口。

### P1 — 共享端子拓扑与兼容 adapter

提取最小连接内核、纯数据板规格/组件 pin 规格和 legacy 输入 adapter。围绕 LED 串联电阻先贯穿 Board → topology → schematic model → SPICE node 映射，再扩展案例。

旧 `resolveNets()` 接口临时保留为兼容 adapter。开发/测试环境可以并行比较新旧输出，但所有差异都要由人工预期确认；旧实现不是正确性裁判。

验收：fixtures 拓扑全部正确，成员顺序确定，boardId 隔离，缺规格有诊断；共享包可在无 DOM 的 Bun 环境运行。

### P2 — Schematic 全端子保真

切换 schematic 至 topology，去掉重新猜 pin、每组件/net 提前 break、有限 side 充当端子 ID 的路径。升级符号端口几何、rail netId、网络标签与 routing/junction 检查。

验收：全部端子可追踪；重复 pin 同网不丢失；隔离电源显示明确；反向 LED 保持反接事实；真实 renderer 的端点坐标与 symbol anchor 一致。

### P3 — 浏览器/API 共享 ERC

逐条迁移连接相关规则，将两端旧报告格式保留为 adapter。统一 boardTarget、别名、PSU、自定义组件规格。结构校验仍留在导入/API 边界。

验收：相同文档与规格在浏览器/API 返回相同规则 code、对象与证据；负例检出且配套合法电路不误报。未知模型覆盖率可见。

### P4 — Solver 消费统一拓扑

修改 netlist-builder 连接输入；保留已有电气模型，用 terminalId 映射代替坐标猜测。审查 ground 映射、浮空辅助、多个独立电源和不支持元件的处理。

验收：现有已支持分析模式通过回归；LED 极性、分压器、RC transient、PWM 负载、电源短路及隔离电源测试符合预先确定的预期和容差；schematic/ERC/SPICE adapter 消费同一个连接分区。

### P5 — 视觉、集成与迁移收尾

补浏览器 fixtures：导入 → schematic → 改 wire → 告警变化 → 保存重开 → 结果一致；覆盖项目切换和异步分析过期结果。对浅/深主题、缩放、多端子模块、分支交叉做 SVG/截图检查与人工视觉验收。

性能基线按现有示例规模和压力 fixture 记录编译/布局耗时；拓扑仅在影响连接或规格的输入改变时重算，不能跟随每次 GPIO tick 重建。

验收后移除已无消费者的重复 resolver 和测试副本。更新架构文档、覆盖表及限制说明。全部必需阶段完成前保留“进行中”状态。

依赖顺序：P0 → P1 → P2；P3、P4 在 P1 稳定后可并行；P5 等所有必需验收完成。

## 8. 独立验证策略

| 验证方式 | 核心断言 |
| --- | --- |
| 人工接线 oracle | 明确每条 net 的端子成员；预期不调用生产 resolver 生成 |
| 拓扑变换测试 | 重排 components/wires、反转 wire 端点、增加同网冗余 jumper 不改变分区；仅连接保持的变换适用 |
| 断线/短路测试 | 删除唯一 bridge 必须拆网；跨板 jumper 必须并网；不同板同坐标不并网 |
| 三消费者对照 | schematic port、ERC terminal、SPICE node 映射与同一人工 fixture 一致；共用内核的一致性本身不证明正确 |
| 解析数值 oracle | 分压器、欧姆定律、RC 时间响应；在实现前定义绝对/相对误差与采样条件 |
| 独立仿真对照 | 对选定 fixture 用手写参考 netlist 和已确认版本的独立 SPICE 工具比对；不得把同一生成器输出当作独立 oracle |
| 真实 SVG / 浏览器 | 生产路径端点、分支、标签及截图；禁止 helper 副本代替生产实现测试 |
| 错误注入 | 故意漏端子、交换 LED 极性、删 boardId、合并独立电源时，对应用例必须失败 |

本次审查已确认本地 ngspice 46，并执行现有独立引擎对照测试；CI 也已有安装 ngspice 的步骤。P0 记录并锁定参考版本和模型。参考工具未运行时必须明确记录，不能把其他通过检查视为替代。现有 engine 对照仍需扩展到 Board → netlist 的应用生成路径。

## 9. 迁移风险与发布条件

- 不新增持久化 wiring 格式；旧项目不因打开 schematic 被重写。若发现必须变更文档语义，单独记录版本迁移与回退方案。
- 按消费者切换，保留短期兼容入口；新旧 net ID 不直接比较，比较端子分区和语义。
- 修复此前错误拓扑可能改变仿真结果，需记录对应案例及正确性证据，不把所有数值差异自动视作回归。
- 各端同样的组件规格版本是结果可比的前提；自定义规格缺失时提供明确修复信息。
- 本任务不依赖完成 ProgramSource 迁移或 Physical Test 全部增强项。

## 11. 首批执行记录

已完成：

- 新增共享 `electrical-topology` adapter；schematic、SPICE、power-budget、pin resolver 共同消费 board-aware `resolveNets()` 结果。
- `packages/board-domain/src/electrical/topology.ts` 现为 API/浏览器共同消费的纯 topology compiler；API power-budget 已移除本地 DisjointSet，app adapter 也从该 compiler 读取 nets。
- `packages/board-domain/src/electrical/erc.ts` 提供 required terminal 与不兼容电源源检查；API/browser 通过各自 DTO adapter 输出原有 issue 格式。
- schematic 按命名端子枚举同网多端子，rail flag/edge 带 `netId`，并覆盖同组件同网短接回归。
- SPICE 保留并行电压驱动并产生 `drive_conflict`，不再按节点静默丢源；外部 PSU 负端只做 1GΩ 数值参考，电源源本身跨接 +/− 端。
- SPICE terminal→node 映射可从 `NetlistResult.terminalNodeMap` 读取；长 ID 使用确定性后缀避免碰撞；多端子 self-loop 不再整体丢失。
- transient `peripheralStates` 已贯通，零时长读取恢复 C/L 历史，且小于 solver nominal dt 的请求不会过推进。
- 新增拓扑、多板隔离、源冲突、电源负端、长 ID、零时长 transient 的生产接口回归。
- schematic layout 现在为生成的 edge/rail 发出稳定 `portId`/`terminalId`，并提供生产布局校验器，检查 edge、port、net 和 rail 的归属一致性。
- schematic renderer 与 `schematic-routing.ts` 共用同一份 terminal geometry、orthogonal segments 和 path；routing validator 检查端点、穿过 symbol body 的线、不同 net 的几何交叉；同 net 分支交叉生成 junction。
- SPICE 结果现在带 `modelCoverage`、`numericalAids` 和 `analysisSettings`；solver worker DTO 也保留这些元数据，浮空 bleed、源内阻和省略的 self-loop 不再是不可见假设。
- transient retry 会在每次求解前保存并在失败重试前恢复所有电容/电感历史，而不只处理零时长读取；GPIO/PWM 高电平可通过 board target 使用 3.3V profile。
- shared ERC 现在统一由 `compileElectricalErc()` 生成输入，覆盖 required terminal、不同电压源、供电范围和 push-pull output conflict；API 与 browser power report 消费同一规则结果。
- SPICE 有显式 model coverage matrix（supported/approximate/unsupported + reason），每个 catalog definition 都有分类；Board 生成的 5V + 25Ω GPIO + 220Ω resistor deck 已与手写 ngspice reference deck 对照。
- Project save session 已覆盖 board/graph/physicalScene 的原子保存、失败重试、项目切换和旧 acknowledgement 隔离；worker reset 会递增 sequence，旧项目分析结果不能污染新项目。
- `SchematicRenderer` SSR integration、routing fixtures、Playwright visual suite 和 GLB budget suite 提供生产渲染回归；现有 `servo.glb` 已用 meshopt 压缩并通过 7MiB 单模型/28MiB 总预算。
- 最终本地验收：`bun run typecheck` 通过；项目定义的 `bun run test` 全部通过（schemas、board-domain、app、api、cli 均为 0 fail）；隔离临时 `DATA_DIR` + 临时 app/API 端口下真实 Chromium Playwright 4/4 通过；`git diff --check` 通过。Playwright 配置现在会自动隔离数据目录、传递 origin 环境并固定 first-run onboarding 状态，避免本机项目和端口配置污染回归。

完成条件：端子覆盖、拓扑 oracle、ERC 正反例、solver 数值案例、保存/重开状态隔离、异步过期结果、真实 SVG renderer 和资产预算均有自动化证据；未知硬件效应不伪装成精确模型。

## 10. SPICE 专项审查与改进任务

### 10.1 当前判断和验证证据

继续使用现有引擎作为首轮改进基线。当前锁文件为 `spicey@0.0.14`，仓库通过 `patches/spicey@0.0.14.patch` 修改引擎；已有二极管/BJT/MOSFET 模型、RC/RL/RLC 测试、持续 `TransientSession` 和 ngspice 对照。现阶段优先修正应用适配层的电路语义，再依据支持矩阵和性能数据判断是否替换引擎。

本次实际执行（本地 ngspice 46）：

```bash
cd packages/app
bun test src/simulator/__tests__/spicey-ngspice-crosscheck.test.ts \
  src/simulator/__tests__/transient-session.test.ts \
  src/simulator/__tests__/netlist-builder.test.ts
```

结果：42 pass、0 fail，其中 7 个 ngspice 对照案例实际执行、未跳过。覆盖二极管、BJT、NMOS 工作点和 RLC 波形。它们证明这些测试条件下的行为，未覆盖任意生成电路，也不能证明器件真实参数正确。

### 10.2 必须优先处理的应用语义

| 优先级 | 代码证据 | 改进与验收 |
| --- | --- | --- |
| 高 | `netlist-builder.ts` 的 `seenSourceNodes` 对同一 node 只输出第一个 voltage source，后面的 GPIO/电源被跳过；现有测试还将此行为视作成功 | 仅对同一物理源的明确 pin 别名去重。独立源分别保留内阻与支路电流。添加 HIGH/LOW 输出冲突、5V/3.3V 并接、相同电压双驱动及输入顺序变换案例 |
| 高 | 同一文件在 `nodeName === "0"` 时跳过源；railShorts 单独记录电源轨短路 | 区分“报告错误”和“计算故障电流”。有已声明串联内阻的 GPIO→GND 故障仍可保留源支路求流；无法求解的理想源冲突返回明确无效，不伪造 0mA |
| 高 | `power-supply/index.tsx` 将两个负端各经 1Ω 接 node 0，电压源也以 0 为参考 | 外部电源相对自身 return 建模；模块内部共地关系由规格定义，连接 Arduino GND 必须来自 wiring。验证未共地、显式共地及多个独立 PSU。1Ω 在 100mA 下产生 100mV，原注释“正常电流下小于1mV”不能作为普遍保证 |
| 高 | `resolveNode()` 的未连接名称仅含 row/col，未含 boardId；sanitizer 替换字符并截断 ID | 节点以 terminalId/boardId 唯一分配；SPICE 元件名使用无碰撞映射并保留反向表。增加跨板同坐标、特殊字符碰撞、长 ID 相同前缀案例 |
| 高 | builder 在 `nodeA === nodeB` 时整批丢弃 `result.lines`，而器件生成器可返回多端子/内部网络 | 按 element 类型处理退化支路；不得仅凭代表性 nodeA/nodeB 删除整个子电路。测试电位器两端同网但滑端独立、多输出电源仅一个输出短接 |
| 中 | GPIO、电源电压与 PWM 默认频率使用 Uno 常量，builder 没有明确 boardTarget 输入 | 以板电气 profile 和实际 pin 状态驱动。已知 profile 才给数值；不支持目标标为 unsupported。验证 3.3V 目标不会输出 5V、定时器改变后频率更新 |

### 10.3 瞬态时间与失败恢复

`TransientSession` 已保留电容/电感历史状态并报告 advancedSeconds，但下列边界需要独立回归，不能只依赖普通 RC 测试：

- `dtSimSeconds === 0` 曾调用微步求解但可能改变有状态历史；现已作为快照读取并恢复 C/L 历史。验收覆盖零时长、极小 dt 和分块运行。
- 小于 nominal dt 的请求现限制为单个精确请求步；`advancedSeconds` 不会因 dormant/PWM policy 被报告值偷偷超前。
- 求解失败后的减半 dt 重试现保存/恢复全部 C/L 历史，避免失败尝试部分推进动态状态；重试仍计入本次 solver 调用预算。
- `topologySignature()` 依赖 netlist 文本和元件名；GPIO HIGH/LOW 的命名改变可触发重解析。稳定元件身份，分开拓扑变更、参数更新和初始条件变更。
- `analyzeCircuitTransient()` 已向 `session.step()` 传 `peripheralStates`；DC motor/back-EMF、servo 等动态模型可收到同一 snapshot。仍需补更完整的参数一致性数值 fixture。
- session 按项目/运行实例拥有；reset、切换项目、旧异步结果丢弃需要集成测试。

以上代码路径已经确认；零时长状态变化、外部源冲突、board-target GPIO、retry state restore、worker stale result 和 Board→reference deck 均已有回归。

### 10.4 PWM 与测量语义

现有 op 路径对不超过三个 PWM 源枚举 HIGH/LOW 状态，假设独立相位；超过上限、含电容或枚举失败时回退到平均电压。Transient 路径按最短 PWM 周期的 1/24 固定采样，尚不等于精确对齐每个边沿。

改进：

1. 结果显式区分瞬时值、指定窗口平均值、RMS、峰值；电源保护使用的量要与规则一致。
2. 近似和 fallback 返回状态、原因及适用范围，不能与精确瞬态结果共用无区别的“valid”。
3. 为真实瞬态接入实际频率、相位、占空比更新事件；按下一个边沿和误差预算选步长，处理极窄脉冲。
4. 增加同相/反相双 PWM、低占空比、频率切换和非整数周期窗口测试；平均值用明确时间窗，不将不足一个周期的片段称作周期平均。
5. 保留廉价预览模式；用于验收的分析固定模式、时间窗和误差，不自动按界面性能换精度。

### 10.5 器件模型、数值辅助和可维护性

- 1GΩ bleed 解决部分浮空矩阵问题，但高阻传感器可能受影响。返回其位置与数值，增加高阻敏感性测试；不能保证所有非线性电路因此收敛。
- Servo 目前是移动/保持两档等效电阻；DC motor 的 R/L 和 back-EMF 系数为示例参数。明确模型等级与参数来源。若需机械堵转电流验证，另行接入实际角速度/力矩关系并指定唯一机械状态拥有者。
- BJT/MOSFET 的基础参数模型不自动覆盖温度、击穿、寄生电容或开关损耗。建立器件/分析模式支持矩阵，未建模效应不输出精度承诺。
- 当前 `op` 实际通过短 `.tran` 取末点，并另有电容展示状态。明确“准静态预览”语义；真正工作点与 transient 作为独立分析 API，禁止显示减速修改用于控制/验收的数值时间。
- 无结果、缺变量、求解失败不能统一降成有效 0V/0mA。保留 last-good 时附带 stale 状态与时间戳；未知和真零值在报告中不同。
- 管理本地 spicey patch：记录变更目的、上游版本和对应测试；新增引擎版本必须先通过应用生成路径与参考引擎双重验证。先保留解析理论 oracle，再增加 ngspice oracle，二者互补。
- CI 的参考校验 job 必须显式确认 ngspice 存在；缺失时该 job 失败，避免 skip 被误报为通过。

### 10.6 纳入执行顺序

P0 增补源冲突、外部 PSU 参考地、名称碰撞、零时长/分块瞬态和多端子退化 fixtures。P1/P2 修复共享拓扑与图示。P4 拆成：

- P4a：源身份、接地、节点命名、多端子 element 生成；完成后跑 Board→手写参考 deck 对照。
- P4b：时钟与状态恢复、动态参数传递、PWM 精度与测量状态。
- P4c：模型覆盖矩阵、数值辅助报告、引擎 patch/CI 要求。

P4a/P4b 为准确性改造必需项；更细的硬件标定模型和替换引擎需单独验收。没有测量证明现有引擎能力不足前，不启动整套 SPICE 重写。
