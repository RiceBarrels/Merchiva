# Merchiva — Ideas & Plans

## 1. AI 智能补货建议

库存模块已经有 `minStock`/`maxStock` 和 `lossRate` 数据。可以用历史销售数据 + 季节性因素自动生成补货建议:
- 每周一早上生成本周补货清单
- 根据 `sales_records` 的趋势预测消耗速度
- 考虑供应商交期（在 `inventory_items` 加 `lead_days` 字段）
- 一键生成采购订单 PDF/CSV

## 2. 员工自助排班 + 智能排班引擎

现在排班是 manager 手动排的。可以做成:
- 员工在手机端提交可用时间偏好（`StaffAvailability` 已经有了基础）
- 智能排班引擎根据: 销售预测需求、员工偏好、公平轮换、技能匹配（`StaffRole`）自动生成推荐排班
- Manager 只需审核和微调
- 加入劳动法合规检查（最大连续工时、最小休息时间）

## 3. 客户管理 (CRM Lite)

小商家需要了解回头客:
- 从 Square/Clover 订单数据提取客户信息
- 客户消费频次、偏好品类、平均客单价
- 简单的客户标签系统（VIP、新客、流失风险）
- 生日/纪念日提醒 → 推送优惠券
- 不做完整 CRM，做"刚好够用"的版本

## 4. Builder: 在线点单页面

Builder 已经能做网站了，再往前走一步:
- 预制"在线菜单/点单"模板
- 商品组件直接绑定 `products` 表数据（通过 Value Panel 的 `{product.name}` 语法）
- 顾客扫码进入 → 浏览菜单 → 下单 → 推送到 POS
- FlowFn 处理下单逻辑（校验库存、计算价格、创建订单）

## 5. 多门店支持

`organization_id` 已经是多租户了，但一个组织 = 一个店。需要:
- `Organization` 下加 `locations` 表
- 库存、排班、销售按 location 分开统计
- Dashboard 支持"全部门店"汇总视图 + 单店切换
- 库存可以做门店间调拨

## 6. 移动端离线模式

Capacitor 已经跑起来了，但断网就废了:
- 用 IndexedDB 缓存关键数据（今日排班、库存快照、待办）
- 离线时可以记录库存变动、打卡
- 恢复网络后自动同步，冲突用"最后写入胜出"
- SpacetimeDB 本身有离线能力，可以探索利用

## 7. 仪表盘 Widget 系统

Dashboard 现在是固定布局。可以做成可配置的:
- 预制 widget: 今日销售、库存预警、排班概览、待办事项、天气
- 拖拽排列，每个用户保存自己的布局
- Owner 可以设置默认 dashboard 布局给新员工
- 用 `react-grid-layout` 实现

## 8. 通知中心

现在只有 shift trade 有通知。需要统一的通知系统:
- 库存低于阈值 → 通知
- 新订单 / 退款 → 通知
- 排班变更 → 通知
- 团队邀请状态 → 通知
- Capacitor Push Notification 支持
- SpacetimeDB subscription 做实时推送

## 9. 报表导出 & 数据分析

- 月度/季度销售报表 PDF
- 员工工时汇总（用于工资计算）
- 库存周转率分析
- 损耗率趋势图
- 一键导出 CSV/Excel（`xlsx` 库）
- 定时邮件发送周报给 owner

## 10. Clover POS 集成完善

`app/api/clover/` 已经有了 callback/connect/sync 的骨架:
- 完成 OAuth 流程
- 同步商品、库存、订单（和 Square 对齐）
- 支持同时连接 Square + Clover（多 POS 汇总）
- 统一的 POS 抽象层，方便以后加 Toast/Lightspeed

## 11. Waste List 每日报损系统

面包店、餐厅等每天都有废弃品，需要一个结构化的报损记录系统:
- SpacetimeDB `waste_log` 表: 日期、品名、数量、原因(expired/damaged/overproduction/other)、成本
- 可绑定 inventory_item，记录时自动扣库存
- 每日报损表单：快速批量录入当天废弃品
- Dashboard widget 显示本周/本月废弃成本趋势
- 与 POS 同步：Square catalog item mapping，POS 端可以直接标记废弃
- 报表导出：月度废弃报告 CSV/PDF（按品类、原因分组）
- 自动更新 inventory_item 的 lossRate

## 优先级建议

| 优先级 | 项目 | 理由 |
|:---:|:---|:---|
| P0 | 通知中心 | 基础设施，其他功能都依赖它 |
| P0 | 报表导出 | 商家最常问的功能 |
| P1 | AI 补货建议 | 差异化卖点，数据已经有了 |
| P1 | 智能排班 | 痛点大，基础数据结构已就绪 |
| P1 | Builder 点单页面 | Builder 已经很成熟，往商业化走 |
| P2 | CRM Lite | 需要积累订单数据 |
| P2 | 仪表盘 Widget | 锦上添花 |
| P2 | 多门店 | 等核心功能稳定后再扩展 |
| P3 | 离线模式 | 技术难度高，优先级低 |
| P3 | Clover 集成 | 等 Square 完全稳定后再开第二个 POS |
