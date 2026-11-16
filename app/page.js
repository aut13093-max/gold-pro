
"use client";

import React, { useMemo, useState } from "react";

const initialSettings = {
  balance: 10000,
  risk: 1,
  contractSize: 100,
  entry: "",
};

function average(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const values = data.slice(i - period + 1, i + 1);
    return values.reduce((a, b) => a + b, 0) / period;
  });
}

function calculateRSI(closes, period = 14) {
  return closes.map((_, i) => {
    if (i < period) return null;

    let gains = 0;
    let losses = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const change = closes[j] - closes[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    if (losses === 0) return 100;

    const rs = (gains / period) / (losses / period);
    return 100 - 100 / (1 + rs);
  });
}

function calculateATR(candles, period = 14) {
  const ranges = candles.map((c, i) => {
    if (i === 0) return c.High - c.Low;

    return Math.max(
      c.High - c.Low,
      Math.abs(c.High - candles[i - 1].Close),
      Math.abs(c.Low - candles[i - 1].Close)
    );
  });

  return average(ranges, period);
}

function money(value) {
  return Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "--";
}

function App() {
  const [candles, setCandles] = useState([]);
  const [timeframe, setTimeframe] = useState("H1");
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  const analysis = useMemo(() => {
    if (candles.length < 201) return null;

    const closes = candles.map(c => c.Close);
    const highs = candles.map(c => c.High);
    const lows = candles.map(c => c.Low);

    const ma20 = average(closes, 20);
    const ma50 = average(closes, 50);
    const ma200 = average(closes, 200);
    const rsi = calculateRSI(closes);
    const atr = calculateATR(candles);

    const last = candles.length - 1;
    const price = closes[last];

    const support = Math.min(...lows.slice(-50));
    const resistance = Math.max(...highs.slice(-50));

    const m20 = ma20[last];
    const m50 = ma50[last];
    const m200 = ma200[last];
    const currentRSI = rsi[last];
    const currentATR = atr[last];

    let trend = "震荡";
    if (price > m20 && m20 > m50 && m50 > m200) {
      trend = "多头排列";
    } else if (price < m20 && m20 < m50 && m50 < m200) {
      trend = "空头排列";
    }

    let signal = "WAIT";

    if (
      trend === "多头排列" &&
      currentRSI >= 50 &&
      currentRSI < 70
    ) {
      signal = "BUY";
    } else if (
      trend === "空头排列" &&
      currentRSI <= 50 &&
      currentRSI > 30
    ) {
      signal = "SELL";
    }

    return {
      price,
      m20,
      m50,
      m200,
      currentRSI,
      currentATR,
      support,
      resistance,
      trend,
      signal,
    };
  }, [candles]);

  function loadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = e => {
      try {
        const json = JSON.parse(e.target.result);

        let rows;

        if (Array.isArray(json)) {
          rows = json;
        } else if (Array.isArray(json.data)) {
          rows = json.data;
        } else if (Array.isArray(json[timeframe])) {
          rows = json[timeframe];
        } else {
          throw new Error("找不到 K 线数据数组");
        }

        const parsed = rows.map(c => ({
          Timestamp: c.Timestamp || c.timestamp || "",
          Open: Number(c.Open ?? c.open),
          High: Number(c.High ?? c.high),
          Low: Number(c.Low ?? c.low),
          Close: Number(c.Close ?? c.close),
          TickVolume: Number(c.TickVolume ?? c.volume ?? 0),
        }));

        if (
          parsed.some(c =>
            !Number.isFinite(c.Open) ||
            !Number.isFinite(c.High) ||
            !Number.isFinite(c.Low) ||
            !Number.isFinite(c.Close) ||
            c.High < c.Low
          )
        ) {
          throw new Error("K 线数据格式或价格不正确");
        }

        parsed.sort((a, b) =>
          String(a.Timestamp).localeCompare(String(b.Timestamp))
        );

        if (parsed.length < 201) {
          throw new Error("至少需要 201 根 K 线才能计算 MA200");
        }

        setCandles(parsed);
        setMessage("成功导入 " + parsed.length + " 根 K 线");
      } catch (error) {
        setMessage("导入失败：" + error.message);
      }
    };

    reader.readAsText(file);
  }

  const atr = analysis?.currentATR;
  const price = analysis?.price;

  const stopDistance = atr ? atr * 1.5 : 0;
  const balance = Number(settings.balance);
  const riskPercent = Number(settings.risk);
  const contractSize = Number(settings.contractSize);
  const riskMoney = balance * riskPercent / 100;

  const lots =
    stopDistance > 0 && contractSize > 0
      ? riskMoney / (stopDistance * contractSize)
      : 0;

  const entry = Number(settings.entry) || price || 0;

  const buySL = entry - stopDistance;
  const buyTP1 = entry + stopDistance * 2;
  const buyTP2 = entry + stopDistance * 3;

  const sellSL = entry + stopDistance;
  const sellTP1 = entry - stopDistance * 2;
  const sellTP2 = entry - stopDistance * 3;

  function updateSetting(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  const panel = {
    background: "#111c30",
    border: "1px solid #263751",
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  };

  const label = {
    color: "#91a4c0",
    fontSize: 12,
    marginBottom: 7,
  };

  const number = {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: 700,
  };

  const input = {
    width: "100%",
    padding: 11,
    background: "#091426",
    border: "1px solid #34445e",
    color: "white",
    borderRadius: 7,
    marginTop: 6,
    marginBottom: 12,
  };

  function metric(title, value) {
    return (
      <div style={{
        background: "#17263c",
        borderRadius: 9,
        padding: 12,
      }}>
        <div style={label}>{title}</div>
        <div style={{
          color: "white",
          fontSize: 18,
          fontWeight: 700,
        }}>{value}</div>
      </div>
    );
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "#08111f",
      color: "#ffffff",
      padding: "18px 14px 40px",
      fontFamily: "Arial, sans-serif",
      maxWidth: 1000,
      margin: "auto",
    }}>

      <header style={{ marginBottom: 22 }}>
        <div style={{
          color: "#e8b94d",
          fontSize: 12,
          letterSpacing: 3,
        }}>
          PROFESSIONAL GOLD ANALYTICS
        </div>

        <h1 style={{
          fontSize: 29,
          margin: "8px 0",
        }}>
          GOLD PRO
        </h1>

        <div style={{ color: "#91a4c0" }}>
          XAUUSD · SMART TRADING SYSTEM
        </div>
      </header>

      <section style={panel}>
        <div style={label}>黄金价格 XAUUSD · USD / OZ</div>

        <div style={number}>
          {analysis ? money(price) : manualPrice || "--"}
        </div>

        <div style={{
          color: "#91a4c0",
          fontSize: 12,
          marginTop: 8,
        }}>
          {analysis
            ? "数据来源：已导入的历史 K 线"
            : "等待导入真实 MT5 K 线数据"}
        </div>

        <input
          style={input}
          type="number"
          placeholder="手动输入参考价格"
          value={manualPrice}
          onChange={e => setManualPrice(e.target.value)}
        />
      </section>

      <section style={panel}>
        <h3>市场周期</h3>

        <div style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}>
          {["W1", "D1", "H4", "H1"].map(t => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              style={{
                padding: "10px 18px",
                borderRadius: 7,
                border: "1px solid #455b78",
                background: timeframe === t ? "#d9a83f" : "#17263c",
                color: timeframe === t ? "#111" : "#fff",
                fontWeight: 700,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          当前周期：{timeframe}。请导入对应周期的数据。
        </p>

        <label style={{ display: "block", marginTop: 12 }}>
          导入 MT5 JSON K 线文件
        </label>

        <input
          type="file"
          accept=".json,application/json"
          onChange={loadFile}
          style={{ marginTop: 12, maxWidth: "100%" }}
        />

        <p style={{ color: "#e8b94d", fontSize: 13 }}>
          {message}
        </p>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          当前已载入：{candles.length} 根 K 线
        </p>
      </section>

      <section style={panel}>
        <h3>技术指标 TECHNICAL INDICATORS</h3>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}>
          {metric("MA20", analysis ? money(analysis.m20) : "--")}
          {metric("MA50", analysis ? money(analysis.m50) : "--")}
          {metric("MA200", analysis ? money(analysis.m200) : "--")}
          {metric("RSI14", analysis ? money(analysis.currentRSI) : "--")}
          {metric("ATR14", analysis ? money(analysis.currentATR) : "--")}
          {metric("趋势", analysis ? analysis.trend : "--")}
        </div>
      </section>

      <section style={panel}>
        <h3>关键价格区域</h3>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}>
          {metric(
            "支撑位 Support",
            analysis ? money(analysis.support) : "--"
          )}

          {metric(
            "阻力位 Resistance",
            analysis ? money(analysis.resistance) : "--"
          )}
        </div>
      </section>

      <section style={{
        ...panel,
        borderColor: analysis?.signal === "BUY"
          ? "#278b65"
          : analysis?.signal === "SELL"
          ? "#b74d55"
          : "#45536a",
      }}>
        <h3>智能交易信号</h3>

        <div style={{
          fontSize: 32,
          fontWeight: 800,
          color: analysis?.signal === "BUY"
            ? "#35d69a"
            : analysis?.signal === "SELL"
            ? "#ff6975"
            : "#e8b94d",
        }}>
          {analysis?.signal || "WAIT"}
        </div>

        <p style={{ color: "#91a4c0", fontSize: 13 }}>
          {analysis
            ? "根据当前周期 MA 排列和 RSI 条件生成的初步信号，不代表完整交易确认。"
            : "需要至少 201 根真实 K 线。"}
        </p>
      </section>

      <section style={panel}>
        <h3>多头交易方案 BUY PLAN</h3>

        <div style={{ color: "#35d69a", fontWeight: 700 }}>
          BUY · 多头条件
        </div>

        <p>参考入场：{money(entry)}</p>
        <p>止损 SL：{money(buySL)}</p>
        <p>TP1：{money(buyTP1)}</p>
        <p>TP2：{money(buyTP2)}</p>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          失效：价格有效跌破支撑，或多头结构被破坏。
        </p>
      </section>

      <section style={panel}>
        <h3>空头交易方案 SELL PLAN</h3>

        <div style={{ color: "#ff6975", fontWeight: 700 }}>
          SELL · 空头条件
        </div>

        <p>参考入场：{money(entry)}</p>
        <p>止损 SL：{money(sellSL)}</p>
        <p>TP1：{money(sellTP1)}</p>
        <p>TP2：{money(sellTP2)}</p>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          失效：价格有效突破阻力，或空头结构被破坏。
        </p>
      </section>

      <section style={panel}>
        <h3>仓位计算 RISK MANAGEMENT</h3>

        <label>账户余额 USD</label>
        <input
          style={input}
          type="number"
          value={settings.balance}
          onChange={e => updateSetting("balance", e.target.value)}
        />

        <label>单笔风险 %</label>
        <input
          style={input}
          type="number"
          value={settings.risk}
          onChange={e => updateSetting("risk", e.target.value)}
        />

        <label>黄金合约大小（盎司 / 手）</label>
        <input
          style={input}
          type="number"
          value={settings.contractSize}
          onChange={e => updateSetting("contractSize", e.target.value)}
        />

        <label>计划入场价格</label>
        <input
          style={input}
          type="number"
          placeholder="默认使用最新收盘价"
          value={settings.entry}
          onChange={e => updateSetting("entry", e.target.value)}
        />

        <div style={{
          background: "#17263c",
          padding: 14,
          borderRadius: 9,
        }}>
          <p>风险金额：${money(riskMoney)}</p>
          <p>止损距离：{money(stopDistance)} USD</p>
          <p style={{
            color: "#e8b94d",
            fontSize: 25,
            fontWeight: 800,
          }}>
            建议手数：{money(lots)} LOT
          </p>
        </div>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          计算公式：风险金额 ÷（止损距离 × 合约大小）。
          请核对经纪商实际合约规格、最小手数及交易成本。
        </p>
      </section>

      <section style={panel}>
        <h3>交易确认 CHECKLIST</h3>

        <p>1. 周线方向：{analysis ? analysis.trend : "等待数据"}</p>
        <p>2. 日线结构：需要导入 D1 数据单独确认</p>
        <p>3. H4 入场：需要导入 H4 数据单独确认</p>
        <p>4. RSI14：{analysis ? money(analysis.currentRSI) : "--"}</p>
        <p>5. ATR14：{analysis ? money(analysis.currentATR) : "--"}</p>
        <p>6. DXY / 美债收益率：尚未接入</p>
        <p>7. 假突破确认：尚需价格行为确认</p>
        <p>8. 重大经济数据：尚未接入日历</p>

        <div style={{
          background: "#263044",
          padding: 12,
          borderRadius: 8,
          marginTop: 15,
          color: "#e8b94d",
        }}>
          风控提醒：单笔风险不超过 1%，
          不追价、不摊平、不取消止损。
          重大数据公布前默认 WAIT。
        </div>
      </section>

      <footer style={{
        textAlign: "center",
        color: "#71839e",
        fontSize: 12,
        padding: 15,
      }}>
        GOLD PRO · SMART GOLD ANALYSIS
        <br />
        Analytical tool only · Not financial advice
      </footer>

    </main>
  );
}

export default App;
