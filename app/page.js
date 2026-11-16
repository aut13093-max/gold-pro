
"use client";

import React, { useEffect, useMemo, useState } from "react";

const TIMEFRAMES = ["W1", "D1", "H4", "H1"];

const initialData = {
  W1: [],
  D1: [],
  H4: [],
  H1: [],
};

const initialSettings = {
  balance: 10000,
  risk: 1,
  contractSize: 100,
  entry: "",
};

const MAX_DATA_AGE = {
  H1: 72 * 60 * 60 * 1000,
  H4: 5 * 24 * 60 * 60 * 1000,
  D1: 10 * 24 * 60 * 60 * 1000,
  W1: 35 * 24 * 60 * 60 * 1000,
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

    const rs = gains / losses;

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

function parseTimestamp(value) {
  if (!value) return null;

  const normalized = String(value).replace(
    /^(\d{4})\.(\d{2})\.(\d{2})/,
    "$1-$2-$3"
  );

  const result = new Date(normalized).getTime();

  return Number.isFinite(result) ? result : null;
}

function formatDate(value) {
  if (!value) return "Không xác định";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("vi-VN");
}

function normalizeCandles(rows) {
  return rows.map(c => ({
    Timestamp: c.Timestamp || c.timestamp || c.time || c.date || "",
    Open: Number(c.Open ?? c.open),
    High: Number(c.High ?? c.high),
    Low: Number(c.Low ?? c.low),
    Close: Number(c.Close ?? c.close),
    TickVolume: Number(c.TickVolume ?? c.volume ?? 0),
  })).filter(c =>
    Number.isFinite(c.Open) &&
    Number.isFinite(c.High) &&
    Number.isFinite(c.Low) &&
    Number.isFinite(c.Close) &&
    c.High >= c.Low &&
    c.High >= c.Open &&
    c.High >= c.Close &&
    c.Low <= c.Open &&
    c.Low <= c.Close
  ).sort((a, b) => {
    return String(a.Timestamp).localeCompare(String(b.Timestamp));
  });
}

export default function App() {
  const [datasets, setDatasets] = useState(initialData);
  const [timeframe, setTimeframe] = useState("H1");
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gold_pro_candles_v2");

      if (saved) {
        setDatasets({
          ...initialData,
          ...JSON.parse(saved),
        });
      }
    } catch {
      setMessage("Không thể đọc dữ liệu đã lưu.");
    }
  }, []);

  const candles = datasets[timeframe] || [];

  const analysis = useMemo(() => {
    if (candles.length < 201) return null;

    const closes = candles.map(c => c.Close);
    const highs = candles.map(c => c.High);
    const lows = candles.map(c => c.Low);

    const ma20 = average(closes, 20);
    const ma50 = average(closes, 50);
    const ma200 = average(closes, 200);

    const rsi = calculateRSI(closes, 14);
    const atr = calculateATR(candles, 14);

    const last = candles.length - 1;
    const price = closes[last];

    const support = Math.min(...lows.slice(-50));
    const resistance = Math.max(...highs.slice(-50));

    const m20 = ma20[last];
    const m50 = ma50[last];
    const m200 = ma200[last];

    const currentRSI = rsi[last];
    const currentATR = atr[last];

    let trend = "Đi ngang";

    if (price > m20 && m20 > m50 && m50 > m200) {
      trend = "Xu hướng tăng";
    } else if (price < m20 && m20 < m50 && m50 < m200) {
      trend = "Xu hướng giảm";
    }

    const timestamp = parseTimestamp(candles[last].Timestamp);

    const age = timestamp
      ? Date.now() - timestamp
      : Infinity;

    const isFresh =
      timestamp !== null &&
      age >= 0 &&
      age <= MAX_DATA_AGE[timeframe];

    let signal = "WAIT";

    if (isFresh) {
      if (
        trend === "Xu hướng tăng" &&
        currentRSI >= 50 &&
        currentRSI < 70
      ) {
        signal = "BUY";
      } else if (
        trend === "Xu hướng giảm" &&
        currentRSI <= 50 &&
        currentRSI > 30
      ) {
        signal = "SELL";
      }
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
      timestamp,
      age,
      isFresh,
    };
  }, [candles, timeframe]);

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
        } else if (Array.isArray(json.candles)) {
          rows = json.candles;
        } else if (Array.isArray(json[timeframe])) {
          rows = json[timeframe];
        } else {
          throw new Error("Không tìm thấy dữ liệu nến.");
        }

        const parsed = normalizeCandles(rows);

        if (parsed.length < 201) {
          throw new Error(
            "Cần ít nhất 201 nến để tính MA200."
          );
        }

        if (!parsed[parsed.length - 1].Timestamp) {
          throw new Error(
            "Dữ liệu thiếu thời gian nến. Vui lòng xuất lại từ MT5."
          );
        }

        const updated = {
          ...datasets,
          [timeframe]: parsed,
        };

        setDatasets(updated);

        localStorage.setItem(
          "gold_pro_candles_v2",
          JSON.stringify(updated)
        );

        const lastDate =
          parsed[parsed.length - 1].Timestamp;

        setMessage(
          `Đã nhập thành công ${parsed.length} nến ${timeframe}. Nến cuối: ${lastDate}`
        );
      } catch (error) {
        setMessage("Lỗi nhập dữ liệu: " + error.message);
      }
    };

    reader.readAsText(file);
    event.target.value = "";
  }

  function updateSetting(key, value) {
    setSettings(prev => ({
      ...prev,
      [key]: value,
    }));
  }

  const atr = analysis?.currentATR;
  const price = analysis?.price;

  const stopDistance =
    atr && analysis?.isFresh ? atr * 1.5 : 0;

  const balance = Number(settings.balance);
  const riskPercent = Number(settings.risk);
  const contractSize = Number(settings.contractSize);

  const validRisk =
    Number.isFinite(balance) &&
    balance > 0 &&
    Number.isFinite(riskPercent) &&
    riskPercent > 0 &&
    riskPercent <= 1 &&
    Number.isFinite(contractSize) &&
    contractSize > 0;

  const riskMoney = validRisk
    ? balance * riskPercent / 100
    : 0;

  const lots =
    stopDistance > 0 && validRisk
      ? riskMoney / (stopDistance * contractSize)
      : 0;

  const entry =
    Number(settings.entry) || price || 0;

  const buySL = entry - stopDistance;
  const buyTP1 = entry + stopDistance * 2;
  const buyTP2 = entry + stopDistance * 3;

  const sellSL = entry + stopDistance;
  const sellTP1 = entry - stopDistance * 2;
  const sellTP2 = entry - stopDistance * 3;

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
    boxSizing: "border-box",
  };

  function metric(title, value) {
    return (
      <div
        style={{
          background: "#17263c",
          borderRadius: 9,
          padding: 12,
        }}
      >
        <div style={label}>{title}</div>
        <div
          style={{
            color: "white",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          {value}
        </div>
      </div>
    );
  }

  const signalColor =
    analysis?.signal === "BUY"
      ? "#35d69a"
      : analysis?.signal === "SELL"
      ? "#ff6975"
      : "#e8b94d";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#08111f",
        color: "#ffffff",
        padding: "18px 14px 40px",
        fontFamily: "Arial, sans-serif",
        maxWidth: 1000,
        margin: "auto",
      }}
    >
      <header style={{ marginBottom: 22 }}>
        <div
          style={{
            color: "#e8b94d",
            fontSize: 12,
            letterSpacing: 3,
          }}
        >
          PHÂN TÍCH VÀNG CHUYÊN NGHIỆP
        </div>

        <h1 style={{ fontSize: 29, margin: "8px 0" }}>
          GOLD PRO
        </h1>

        <div style={{ color: "#91a4c0" }}>
          XAUUSD · HỆ THỐNG PHÂN TÍCH GIAO DỊCH
        </div>
      </header>

      <section style={panel}>
        <div style={label}>
          GIÁ VÀNG XAUUSD · USD / OZ
        </div>

        <div style={number}>
          {analysis
            ? money(price)
            : manualPrice
              ? money(Number(manualPrice))
              : "--"}
        </div>

        <div
          style={{
            color: "#91a4c0",
            fontSize: 12,
            marginTop: 8,
          }}
        >
          {analysis
            ? "Giá đóng cửa từ dữ liệu lịch sử đã nhập"
            : "Chưa có dữ liệu nến mới"}
        </div>

        <label style={{ display: "block", marginTop: 15 }}>
          Nhập giá tham khảo thủ công
        </label>

        <input
          style={input}
          type="number"
          placeholder="Nhập giá vàng tham khảo"
          value={manualPrice}
          onChange={e => setManualPrice(e.target.value)}
        />

        <p style={{ color: "#e8b94d", fontSize: 12 }}>
          Giá nhập thủ công chỉ dùng để tham khảo, không thay thế
          dữ liệu giao dịch trực tiếp.
        </p>
      </section>

      <section style={panel}>
        <h3>Khung thời gian thị trường</h3>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {TIMEFRAMES.map(t => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              style={{
                padding: "10px 18px",
                borderRadius: 7,
                border: "1px solid #455b78",
                background:
                  timeframe === t ? "#d9a83f" : "#17263c",
                color: timeframe === t ? "#111" : "#fff",
                fontWeight: 700,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          Khung thời gian đang chọn: {timeframe}
        </p>

        <label style={{ display: "block", marginTop: 12 }}>
          Nhập dữ liệu nến JSON từ MT5
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
          Số lượng nến đã tải: {candles.length}
        </p>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          Ngày nến cuối cùng:{" "}
          {analysis
            ? formatDate(candles[candles.length - 1].Timestamp)
            : "Chưa có dữ liệu"}
        </p>

        {analysis && (
          <div
            style={{
              background: analysis.isFresh
                ? "#12382e"
                : "#49321e",
              padding: 12,
              borderRadius: 8,
              color: analysis.isFresh
                ? "#58e0a5"
                : "#ffca79",
              fontSize: 13,
              marginTop: 10,
            }}
          >
            {analysis.isFresh
              ? "Dữ liệu nằm trong thời hạn kiểm tra của hệ thống."
              : "Dữ liệu đã cũ hoặc không xác định được thời gian. Tín hiệu giao dịch bị khóa ở WAIT."}
          </div>
        )}
      </section>

      <section style={panel}>
        <h3>Chỉ báo kỹ thuật</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {metric("MA20", analysis ? money(analysis.m20) : "--")}
          {metric("MA50", analysis ? money(analysis.m50) : "--")}
          {metric("MA200", analysis ? money(analysis.m200) : "--")}
          {metric("RSI14", analysis ? money(analysis.currentRSI) : "--")}
          {metric("ATR14", analysis ? money(analysis.currentATR) : "--")}
          {metric("Xu hướng", analysis ? analysis.trend : "Không đủ dữ liệu")}
        </div>
      </section>

      <section style={panel}>
        <h3>Các vùng giá quan trọng</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {metric(
            "Hỗ trợ",
            analysis ? money(analysis.support) : "--"
          )}

          {metric(
            "Kháng cự",
            analysis ? money(analysis.resistance) : "--"
          )}
        </div>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          Các mức giá được tính từ 50 nến gần nhất của khung
          thời gian đang chọn.
        </p>
      </section>

      <section
        style={{
          ...panel,
          borderColor: signalColor,
        }}
      >
        <h3>Tín hiệu giao dịch thông minh</h3>

        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            color: signalColor,
          }}
        >
          {analysis?.signal || "WAIT"}
        </div>

        <p style={{ color: "#91a4c0", fontSize: 13 }}>
          {analysis
            ? analysis.isFresh
              ? "Tín hiệu sơ bộ dựa trên MA và RSI của khung thời gian đang chọn."
              : "Dữ liệu lịch sử đã cũ. Chưa có nến mới xác nhận, vì vậy tín hiệu vẫn WAIT."
            : "Cần ít nhất 201 nến hợp lệ để tính MA200."}
        </p>
      </section>

      <section style={panel}>
        <h3>Kịch bản giao dịch mua BUY</h3>

        <div style={{ color: "#35d69a", fontWeight: 700 }}>
          BUY · KỊCH BẢN TĂNG
        </div>

        <p>Giá vào lệnh tham khảo: {money(entry)}</p>
        <p>Stop Loss: {money(buySL)}</p>
        <p>Take Profit 1: {money(buyTP1)}</p>
        <p>Take Profit 2: {money(buyTP2)}</p>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          Điều kiện vô hiệu: Giá phá vỡ vùng hỗ trợ hoặc cấu
          trúc tăng bị phá vỡ.
        </p>
      </section>

      <section style={panel}>
        <h3>Kịch bản giao dịch bán SELL</h3>

        <div style={{ color: "#ff6975", fontWeight: 700 }}>
          SELL · KỊCH BẢN GIẢM
        </div>

        <p>Giá vào lệnh tham khảo: {money(entry)}</p>
        <p>Stop Loss: {money(sellSL)}</p>
        <p>Take Profit 1: {money(sellTP1)}</p>
        <p>Take Profit 2: {money(sellTP2)}</p>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          Điều kiện vô hiệu: Giá vượt vùng kháng cự hoặc cấu
          trúc giảm bị phá vỡ.
        </p>
      </section>

      <section style={panel}>
        <h3>Quản lý vốn và tính khối lượng giao dịch</h3>

        <label>Số dư tài khoản (USD)</label>
        <input
          style={input}
          type="number"
          value={settings.balance}
          onChange={e =>
            updateSetting("balance", e.target.value)
          }
        />

        <label>Rủi ro mỗi giao dịch (%)</label>
        <input
          style={input}
          type="number"
          min="0"
          max="1"
          step="0.1"
          value={settings.risk}
          onChange={e =>
            updateSetting("risk", e.target.value)
          }
        />

        <label>Kích thước hợp đồng (ounce / lot)</label>
        <input
          style={input}
          type="number"
          value={settings.contractSize}
          onChange={e =>
            updateSetting("contractSize", e.target.value)
          }
        />

        <label>Giá vào lệnh dự kiến</label>
        <input
          style={input}
          type="number"
          placeholder="Mặc định dùng giá đóng cửa gần nhất"
          value={settings.entry}
          onChange={e =>
            updateSetting("entry", e.target.value)
          }
        />

        <div
          style={{
            background: "#17263c",
            padding: 14,
            borderRadius: 9,
          }}
        >
          <p>Số tiền rủi ro: ${money(riskMoney)}</p>

          <p>Khoảng cách Stop Loss: {money(stopDistance)} USD</p>

          <p
            style={{
              color: "#e8b94d",
              fontSize: 25,
              fontWeight: 800,
            }}
          >
            Khối lượng tham khảo: {money(lots)} LOT
          </p>

          {!analysis?.isFresh && (
            <p style={{ color: "#ffca79", fontSize: 12 }}>
              Chưa tính được khối lượng giao dịch vì dữ liệu
              chưa được xác nhận là mới.
            </p>
          )}

          {settings.risk > 1 && (
            <p style={{ color: "#ff6975", fontSize: 12 }}>
              Rủi ro vượt quá giới hạn 1%. Vui lòng điều chỉnh.
            </p>
          )}
        </div>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          Công thức: Số tiền rủi ro ÷ (Khoảng cách SL × Kích
          thước hợp đồng).
        </p>

        <p style={{ color: "#91a4c0", fontSize: 12 }}>
          Cần kiểm tra quy cách hợp đồng thực tế của nhà môi
          giới trước khi sử dụng kết quả.
        </p>
      </section>

      <section style={panel}>
        <h3>Điều kiện xác nhận giao dịch</h3>

        <p>1. Xu hướng tuần: Cần dữ liệu W1 riêng</p>
        <p>2. Cấu trúc ngày: Cần dữ liệu D1 riêng</p>
        <p>3. Điểm vào H4: Cần dữ liệu H4 riêng</p>
        <p>4. RSI14: {analysis ? money(analysis.currentRSI) : "--"}</p>
        <p>5. ATR14: {analysis ? money(analysis.currentATR) : "--"}</p>
        <p>6. DXY / Lợi suất trái phiếu Mỹ: Chưa kết nối</p>
        <p>7. Xác nhận phá vỡ giả: Cần kiểm tra hành động giá</p>
        <p>8. Lịch kinh tế: Chưa kết nối</p>

        <div
          style={{
            background: "#263044",
            padding: 12,
            borderRadius: 8,
            marginTop: 15,
            color: "#e8b94d",
          }}
        >
          QUẢN LÝ RỦI RO

          <p>
            Rủi ro tối đa 1% mỗi giao dịch. Không đuổi giá,
            không gồng lỗ, không hủy Stop Loss.
          </p>

          <p>
            Trước các tin tức lớn như NFP, CPI và FOMC:
            mặc định WAIT.
          </p>
        </div>
      </section>

      <footer
        style={{
          textAlign: "center",
          color: "#71839e",
          fontSize: 12,
          padding: 15,
        }}
      >
        GOLD PRO · PHÂN TÍCH VÀNG THÔNG MINH
        <br />
        Công cụ phân tích tham khảo · Không phải lời khuyên đầu tư
      </footer>
    </main>
  );
}
