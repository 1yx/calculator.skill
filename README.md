# calculator.skill

高精度计算器 + 实时汇率转换 CLI 工具。

- 精确运算：基于 Decimal.js 的递归下降解析器，20 位有效数字，无浮点误差
- 汇率转换：抓取中国银行外汇牌价，支持 26 种货币互转
- 零配置：无需 API Key，汇率缓存由 systemd 定时任务每日自动更新

```
$ node dist/cli.js '0.1 + 0.2'
0.3

$ node dist/cli.js '100 USD to CNY'
100 USD = 686.54 CNY
```

## 快速开始

```bash
# 克隆
git clone git@github.com:1yx/calculator.skill.git
cd calculator.skill

# 安装依赖（需要 Node.js >= 18，pnpm）
pnpm install

# 构建
pnpm build

# 数学计算
node dist/cli.js '2 + 3 * 4'        # 14
node dist/cli.js '0.1 + 0.2'         # 0.3
node dist/cli.js '2 ^ 10'            # 1024

# 汇率转换（首次使用需要先预热缓存）
node dist/cli.js '100 USD to CNY'    # 100 USD = 686.54 CNY
```

## 首次使用：预热汇率缓存

汇率数据缓存在 `cache/boc-rates.json`，由定时任务每日更新。首次使用前需要手动预热一次：

```bash
node dist/cli.js --warm
```

或使用离线模式（内置近似汇率，无需网络）：

```bash
node dist/cli.js --offline '100 USD to CNY'
```

## 配置 systemd 定时任务（可选）

项目自带 systemd service 和 timer 文件，实现每日自动更新汇率缓存。

### 1. 创建 warm 脚本

将以下脚本保存到 `/usr/local/bin/boc-warm`（需要 sudo）：

```bash
#!/bin/bash
exec /path/to/node /path/to/calculator.skill/dist/boc-warm.js
```

将 `/path/to/node` 替换为你的 node 可执行文件路径（`which node`），将 `/path/to/calculator.skill` 替换为项目实际路径。

```bash
sudo tee /usr/local/bin/boc-warm > /dev/null << 'EOF'
#!/bin/bash
exec /path/to/node /path/to/calculator.skill/dist/boc-warm.js
EOF
sudo chmod +x /usr/local/bin/boc-warm
```

### 2. 修改 service 文件

编辑 `boc-warm.service`，将 `<YOUR_USERNAME>` 替换为你的用户名：

```ini
[Unit]
Description=Warm BOC exchange rate cache for calculator
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/boc-warm
User=<YOUR_USERNAME>
```

### 3. 部署并启用定时任务

```bash
# 复制 service 和 timer 到 systemd 目录
sudo cp boc-warm.service /etc/systemd/system/
sudo cp boc-warm.timer /etc/systemd/system/

# 重新加载配置
sudo systemctl daemon-reload

# 启用定时任务（每天 10:40 自动运行）
sudo systemctl enable --now boc-warm.timer

# 立即手动运行一次
sudo systemctl start boc-warm.service

# 查看运行日志
journalctl -u boc-warm --no-pager
```

## 支持的货币

USD, EUR, GBP, JPY, HKD, AUD, CAD, SGD, NZD, KRW, THB, CHF, SEK, DKK, NOK, MOP, RUB, IDR, MYR, PHP, TWD, AED, BND, BRL, ZAR, SAR, TRY, CNY

## CLI 用法

```
Usage: node dist/cli.js '<expression>'

Math:
  node dist/cli.js '2 + 3 * 4'          → 14
  node dist/cli.js '(1 + 2) * 3'         → 9
  node dist/cli.js '2 ^ 10'              → 1024
  node dist/cli.js '100 % 7'             → 2
  node dist/cli.js '0.1 + 0.2'           → 0.3

Currency (needs cached rates):
  node dist/cli.js '100 USD to CNY'      → 686.54 CNY
  node dist/cli.js '1000 CNY to JPY'     → 23225.57 JPY
  node dist/cli.js '50 EUR to USD'       → 58.29 USD

Flags:
  --offline    Use hardcoded rates (no network)
  --warm       Fetch and cache BOC rates
  help         Show this help
```

## 项目结构

```
calculator.skill/
├── src/
│   ├── calculator.ts      # 数学表达式解析器 + 汇率转换
│   ├── boc-provider.ts    # 中行牌价抓取与缓存
│   ├── boc-warm.ts        # 缓存预热脚本
│   ├── cli.ts             # CLI 入口
│   ├── exchange-rate.ts   # 汇率 Provider 接口 + 离线 fallback
│   └── index.ts           # 统一导出
├── cache/
│   └── boc-rates.json     # 汇率缓存（gitignore，由定时任务生成）
├── boc-warm.service       # systemd service 模板
├── boc-warm.timer         # systemd timer 模板（每日 10:40）
├── SKILL.md               # Hermes Agent Skill 定义
├── package.json
├── tsconfig.json
└── .gitignore
```

## 技术细节

- **数学引擎**：递归下降解析器（Tokenizer → Parser），支持 `+ - * / % ^ ()`，无 `eval()`
- **精度**：Decimal.js，20 位有效数字，ROUND_HALF_UP（四舍五入）
- **汇率来源**：中国银行外汇牌价 `https://www.boc.cn/sourcedb/whpj/`，使用中行折算价
- **缓存策略**：只读缓存，无过期时间，由定时任务每日 10:40 刷新
- **TypeScript**：ESM + NodeNext 模块解析，TS 6

## License

MIT
