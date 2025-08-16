import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ====== CẤU HÌNH ======
const BOT_TOKEN = "7751217253:AAHYIOAF0HMufS9sm5soBgjOjdIy1XwyILg"; // 🔑 Token bot
const ADMIN_ID = 6781092017; // 👑 Chat ID admin
const DATA_FILE = path.join(__dirname, "data.json");
const STATS_FILE = path.join(__dirname, "stats.json");
const API_URL = "https://admin-vannhat-sunpredict-gq2y.onrender.com/api/du-doan";
const QR_IMAGE = path.join(__dirname, "qr.jpg");

// ====== QUẢN LÝ DỮ LIỆU ======
function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function loadData() { return loadJSON(DATA_FILE, { keys: {}, active_users: [] }); }
function saveData(data) { saveJSON(DATA_FILE, data); }

function loadStats() { return loadJSON(STATS_FILE, { correct: 0, wrong: 0, total_rounds: 0 }); }
function saveStats(stats) { saveJSON(STATS_FILE, stats); }

// ====== TELEGRAM ======
async function sendTelegram(chat_id, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ chat_id, text, parse_mode: "Markdown" })
    });
    if (!r.ok) console.log("⚠️ Lỗi gửi telegram", r.status, await r.text());
  } catch (e) { console.log("❌ Lỗi gửi telegram:", e); }
}

async function sendPhoto(chat_id, photoPath, caption = "") {
  try {
    if (!fs.existsSync(photoPath)) {
      await sendTelegram(chat_id, "⚠️ Ảnh QR chưa được tải lên bot.");
      return;
    }
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("chat_id", chat_id);
    form.append("caption", caption);
    form.append("photo", fs.createReadStream(photoPath));

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
  } catch (e) { console.log("❌ Lỗi gửi ảnh telegram:", e); }
}

// ====== KIỂM TRA KEY ======
function keyValid(keyInfo) {
  const now = Date.now() / 1000;
  if ("expiry" in keyInfo && keyInfo.expiry !== -1 && now > keyInfo.expiry) return false;
  if ("uses" in keyInfo && keyInfo.uses !== -1 && keyInfo.uses <= 0) return false;
  return true;
}

// ====== FORMAT STATS ======
function formatStats(stats) {
  const total = stats.total_rounds;
  if (total === 0) return "📊 *Chưa có dữ liệu thống kê.*";
  const ti_le = ((stats.correct / total) * 100).toFixed(2);
  return `📊 *Thống kê bot Sunwin*\n✅ Đúng: \`${stats.correct}\`\n❌ Sai: \`${stats.wrong}\`\n📈 Tỉ lệ đúng: \`${ti_le}%\`\n🕒 Tổng phiên: \`${total}\``;
}

// ====== API LOOP ======
async function apiLoop() {
  let stats = loadStats();
  let lastSession = null;
  let lastPrediction = null;

  setInterval(async () => {
    try {
      const res = await fetch(API_URL, { timeout: 10000 });
      const dataAPI = await res.json();

      const session_id = String(dataAPI.phien || "");
      const result = (dataAPI.ket_qua || "").trim();
      const xuc_xac = dataAPI.xuc_xac || "[]";
      const tong = dataAPI.tong || 0;
      const du_doan = (dataAPI.du_doan || "").trim();
      const ty_le = String(dataAPI.ty_le_thanh_cong || "0%");
      const diem_xiu = Number(dataAPI.diem_xiu || 0);
      const diem_tai = Number(dataAPI.diem_tai || 0);

      if (session_id && session_id !== lastSession) {
        let checkStr = "Chưa có";

        if (lastPrediction) {
          if (result.toLowerCase() === lastPrediction.toLowerCase()) {
            checkStr = `${lastPrediction} ✅`;
            stats.correct++;
          } else {
            checkStr = `${lastPrediction} ❌`;
            stats.wrong++;
          }
          stats.total_rounds++;
          saveStats(stats);
        }

        if (stats.total_rounds > 0 && stats.total_rounds % 10 === 0) {
          await sendTelegram(ADMIN_ID, formatStats(stats));
        }

        let all_in_msg = "";
        if (diem_xiu === 1) all_in_msg = "🔥 ALL IN Xỉu!";
        else if (diem_tai === 1) all_in_msg = "🔥 ALL IN Tài!";

        const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

        const msg =
          `🎲 *Phiên:* \`${session_id}\`\n📌 Kết quả: *${result}* - ${xuc_xac} = (${tong})\n📊 Dự đoán trước: ${checkStr}\n🔮 Dự đoán sau: *${du_doan}* (${ty_le})\n🕒 ${now}\n${all_in_msg}`;

        const data = loadData();
        for (const user of data.active_users) {
          await sendTelegram(user, msg);
          await new Promise(r => setTimeout(r, 200));
        }

        lastSession = session_id;
        lastPrediction = du_doan;
      }
    } catch (e) {
      console.log("❌ Lỗi API:", e.message);
    }
  }, 3000);
}

// ====== TELEGRAM LOOP ======
async function telegramLoop() {
  let offset = 0;
  setInterval(async () => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`);
      const updates = (await res.json()).result;

      for (const update of updates) {
        offset = update.update_id + 1;
        if (!update.message) continue;

        const chat_id = update.message.chat.id;
        const text = (update.message.text || "").trim();
        const data = loadData();

        if (text.startsWith("/start")) {
          const caption =
            "📌 Mua key để sử dụng tool:\n- 1 ngày: 30k\n- 1 tuần: 80k\n- 1 tháng: 200k\n- Vĩnh viễn: 444k\n\n💳 Chuyển khoản theo QR\n📩 Liên hệ: @ADM_VANNHAT";
          await sendPhoto(chat_id, QR_IMAGE, caption);
        } else if (text.startsWith("/help")) {
          await sendTelegram(chat_id,
            "📖 Danh sách lệnh:\n/start - Xem thông tin mua tool + QR\n/help - Xem hướng dẫn\n/key <key> - Nhập key\n/chaybot - Bật dự đoán\n/tatbot - Tắt dự đoán\n");
        } else if (text.startsWith("/key")) {
          const key = text.split(" ")[1];
          if (key && data.keys[key] && keyValid(data.keys[key])) {
            await sendTelegram(chat_id, "✅ Key hợp lệ. Gõ /chaybot để bật dự đoán.");
            if (data.keys[key].uses > 0) data.keys[key].uses--;
            if (!data.active_users.includes(chat_id)) data.active_users.push(chat_id);
            saveData(data);
          } else {
            await sendTelegram(chat_id, "❌ Key không hợp lệ hoặc hết hạn.");
          }
        } else if (text.startsWith("/chaybot")) {
          if (!data.active_users.includes(chat_id)) {
            data.active_users.push(chat_id);
            saveData(data);
          }
          await sendTelegram(chat_id, "✅ Đã bật bot dự đoán!");
        } else if (text.startsWith("/tatbot")) {
          data.active_users = data.active_users.filter(u => u !== chat_id);
          saveData(data);
          await sendTelegram(chat_id, "⏸️ Đã tắt nhận dự đoán.");
        }

        // ADMIN
        else if (text.startsWith("/thongke") && chat_id === ADMIN_ID) {
          await sendTelegram(chat_id, formatStats(loadStats()));
        } else if (text.startsWith("/taokey") && chat_id === ADMIN_ID) {
          try {
            const parts = text.split(" ");
            const key = parts[1];
            const uses = parts[2] ? parseInt(parts[2]) : -1;
            const days = parts[3] ? parseInt(parts[3]) : -1;
            const expiry = days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : -1;
            data.keys[key] = { uses, expiry };
            saveData(data);
            const expStr = expiry === -1 ? "vĩnh viễn" : new Date(expiry * 1000).toLocaleString("vi-VN");
            await sendTelegram(chat_id, `✅ Key: \`${key}\`\n📌 Lượt: ${uses === -1 ? "∞" : uses}\n🕒 Hết hạn: ${expStr}`);
          } catch {
            await sendTelegram(chat_id, "❌ Sai cú pháp. /taokey <key> <số_lượt> <số_ngày>");
          }
        } else if (text.startsWith("/xoakey") && chat_id === ADMIN_ID) {
          const key = text.split(" ")[1];
          if (key && data.keys[key]) {
            delete data.keys[key];
            saveData(data);
            await sendTelegram(chat_id, `✅ Đã xóa key \`${key}\``);
          } else {
            await sendTelegram(chat_id, "❌ Không tìm thấy key.");
          }
        } else if (text.startsWith("/dskey") && chat_id === ADMIN_ID) {
          if (!Object.keys(data.keys).length) await sendTelegram(chat_id, "📂 Không có key nào.");
          else {
            let msg = "📂 Danh sách key:\n";
            for (const [k, v] of Object.entries(data.keys)) {
              const expStr = v.expiry === -1 ? "vĩnh viễn" : new Date(v.expiry * 1000).toLocaleString("vi-VN");
              const usesStr = v.uses === -1 ? "∞" : String(v.uses);
              msg += `- \`${k}\`: ${usesStr} lượt, hết hạn ${expStr}\n`;
            }
            await sendTelegram(chat_id, msg);
          }
        }
      }
    } catch (e) {
      console.log("❌ Lỗi xử lý tin nhắn:", e.message);
    }
  }, 2000);
}

// ====== MAIN ======
function main() {
  if (!fs.existsSync(DATA_FILE)) saveData({ keys: {}, active_users: [] });
  if (!fs.existsSync(STATS_FILE)) saveStats({ correct: 0, wrong: 0, total_rounds: 0 });

  apiLoop();
  telegramLoop();
}

main();
