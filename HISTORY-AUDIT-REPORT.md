# 历史回测独立审计覆盖

审计逐笔 CSV 账务和 UTC 每日权益；不修改历史报告、成交 CSV 或每日估值源文件。原审计文件备份在 previous-audits。

已检查 31 次完整运行；账本通过 31 次，每日指标通过 20 次，两者均通过 20 次。

账本通过范围：75,116 模型、1,020,565 笔交易；每日通过范围：68,258 模型、59,405,480 个权益观测点。

| 运行 | 模型数 | 账本 | 每日指标 |
|---|---:|---|---|
| 20261003_003813 | 6 | PASS | UNAVAILABLE |
| 20261003_003823 | 6,750 | PASS | UNAVAILABLE |
| 20261003_004423 | 12 | PASS | UNAVAILABLE |
| 20261003_004425 | 12 | PASS | UNAVAILABLE |
| 20261003_004425_690629 | 12 | PASS | UNAVAILABLE |
| 20261003_004426 | 12 | PASS | UNAVAILABLE |
| 20261003_004426_409096 | 12 | PASS | UNAVAILABLE |
| 20261003_004426_608024 | 12 | PASS | UNAVAILABLE |
| 20261003_004426_836233 | 12 | PASS | UNAVAILABLE |
| 20261003_004427 | 12 | PASS | UNAVAILABLE |
| 20261003_005453 | 6 | PASS | UNAVAILABLE |
| 20261003_012713 | 6,750 | PASS | PASS |
| 20261003_014218 | 2 | PASS | PASS |
| 20261003_020349 | 2 | PASS | PASS |
| 20261003_021106 | 6,750 | PASS | PASS |
| 20261003_024139 | 6,750 | PASS | PASS |
| 20261003_030450 | 6 | PASS | PASS |
| 20261003_030859 | 6 | PASS | PASS |
| 20261003_102140 | 66 | PASS | PASS |
| 20261003_131841 | 6,750 | PASS | PASS |
| 20261003_135547 | 6,750 | PASS | PASS |
| 20261003_183024 | 6,750 | PASS | PASS |
| 20261003_191828 | 270 | PASS | PASS |
| 20261003_195831 | 270 | PASS | PASS |
| 20261003_201030 | 66 | PASS | PASS |
| 20261003_201721 | 4 | PASS | PASS |
| 20261003_202435 | 66 | PASS | PASS |
| 20261003_215235 | 6,750 | PASS | PASS |
| 20261003_222038 | 6,750 | PASS | PASS |
| 20261003_225013 | 6,750 | PASS | PASS |
| 20261003_230214 | 6,750 | PASS | PASS |

## 未通过或未覆盖项

- 20261003_003813 / Daily: Historical report lacks required daily metrics: DailySharpeRatio, DailySortinoRatio, DailyVolatilityPct. Preserved without rewriting; not eligible as fully audited research source.
- 20261003_003823 / Daily: Historical report lacks required daily metrics: DailySharpeRatio, DailySortinoRatio, DailyVolatilityPct. Preserved without rewriting; not eligible as fully audited research source.
- 20261003_004425_690629 / Daily: Historical report lacks required daily metrics: DailySharpeRatio, DailySortinoRatio, DailyVolatilityPct. Preserved without rewriting; not eligible as fully audited research source.
- 20261003_004426_608024 / Daily: Historical report lacks required daily metrics: DailySharpeRatio, DailySortinoRatio, DailyVolatilityPct. Preserved without rewriting; not eligible as fully audited research source.
- 20261003_004426_836233 / Daily: Historical report lacks required daily metrics: DailySharpeRatio, DailySortinoRatio, DailyVolatilityPct. Preserved without rewriting; not eligible as fully audited research source.
- 20261003_005453 / Daily: Historical report lacks required daily metrics: DailySharpeRatio, DailySortinoRatio, DailyVolatilityPct. Preserved without rewriting; not eligible as fully audited research source.
- 20261003_004426 / Daily: Historical report lacks required daily metrics: DailySharpeRatio, DailySortinoRatio, DailyVolatilityPct. Preserved without rewriting; not eligible as fully audited research source.
- 20261003_004427 / Daily: Historical report lacks required daily metrics: DailySharpeRatio, DailySortinoRatio, DailyVolatilityPct. Preserved without rewriting; not eligible as fully audited research source.
- 20261003_004423 / Daily: Historical report lacks required daily metrics: DailySharpeRatio, DailySortinoRatio, DailyVolatilityPct. Preserved without rewriting; not eligible as fully audited research source.
- 20261003_004426_409096 / Daily: Historical report lacks required daily metrics: DailySharpeRatio, DailySortinoRatio, DailyVolatilityPct. Preserved without rewriting; not eligible as fully audited research source.
- 20261003_004425 / Daily: Historical report lacks required daily metrics: DailySharpeRatio, DailySortinoRatio, DailyVolatilityPct. Preserved without rewriting; not eligible as fully audited research source.

## 证明范围

- 账本与每日两份审计均绑定 report.json SHA256 和逐笔 CSV 集合 SHA256。配比来源还必须通过独立盘中强平审计，三层均 PASS 且报告哈希一致才可进入新研究。
- 每日指标独立从 CSV 现金流、原始日末价格和历史资金费重建，不调用生产权益重建函数；检查 Sharpe、Sortino、波动率、观察数和期末权益。
- 审计器区分上一根 K 线内平仓与下一根开盘跳空平仓；资金费边界据此处理。8 个边界、来源保持和哈希拒绝回归测试通过。
- 缺少旧版每日指标的报告保留原样，无法独立比较时不标为通过。差异即使很小，也不放宽容差或改账使其通过。
- 每日收盘审计不是盘中遗漏爆仓审计；后者需要额外核对全部持仓窗口。所有 SIMPLE 结果仍使用简化维持保证金，历史通过不等于未来稳定或策略安全。
- 首尾不足完整 UTC 日的区间仍作为收益观测点，与引擎已披露规则一致；报告中计数是权益观测点，不能全部称为完整交易日。

## 首次复核换源误判已解决

102140、131841、201030 首次出现的微小资金费差异来自审计时被后来全局 403 标记切换为归档代理估值。按原 manifest 中 SHA256 一致的成功 REST 回执恢复原输入后，三次账本与每日指标均通过；没有改动历史报告或成交 CSV。首次差异证据和取证来源保留。012713 原先采用的归档回退口径也已单独复核通过，不因后来 API 成功而升级为精确结算价。

