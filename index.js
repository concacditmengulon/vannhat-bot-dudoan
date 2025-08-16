const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

// ====== CẤU HÌNH ======
const BOT_TOKEN = "7751217253:AAHYIOAF0HMufS9sm5soBgjOjdIy1XwyILg";
const ADMIN_ID = 6781092017;
const DATA_FILE = "data.json";
const STATS_FILE = "stats.json";
const API_URL = "https://admin-vannhat-sunpredict.onrender.com/api/du-doan";
const QR_IMAGE = "qr.jpg";

const bot = new Telegraf(BOT_TOKEN);

// ====== HÀM QUẢN LÝ DỮ LIỆU ======
const loadData = () => {
  if (!fs.existsSync(DATA_FILE)) {
    return { keys: {}, active_users: [] };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
};

const saveData = (data) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4));
};

const loadStats = () => {
  if (!fs.existsSync(STATS_FILE)) {
    return { correct: 0, wrong: 0, total_rounds: 0 };
  }
  return JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
};

const saveStats = (stats) => {
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 4));
};

// Khởi tạo file dữ liệu nếu chưa tồn tại
if (!fs.existsSync(DATA_FILE)) saveData({ keys: {}, active_users: [] });
if (!fs.existsSync(STATS_FILE)) saveStats({ correct: 0, wrong: 0, total_rounds: 0 });

// ====== HÀM TẠO THỐNG KÊ ĐẸP ======
const formatStats = (stats) => {
  const total = stats.total_rounds;
  if (total === 0) {
    return "📊 *Chưa có dữ liệu thống kê.*";
  }
  const ti_le = ((stats.correct / total) * 100).toFixed(2);
  return (
    `📊 *Thống kê bot Sunwin by Khởi Ân*\n` +
    `✅ *Đúng:* \`${stats.correct}\`\n` +
    `❌ *Sai:* \`${stats.wrong}\`\n` +
    `📈 *Tỉ lệ đúng:* \`${ti_le}%\`\n` +
    `🕒 *Tổng phiên:* \`${total}\``
  );
};

// ====== VÒNG LẶP LẤY API ======
const apiLoop = async () => {
  let stats = loadStats();
  let last_session = null;
  let last_prediction = null;
  const tz = 'Asia/Ho_Chi_Minh';

  while (true) {
    try {
      const res = await axios.get(API_URL, { timeout: 5000 });
      const data = res.data;
      const session_id = String(data.phien);
      const result = data.ket_qua.trim();
      const xuc_xac = data.xuc_xac;
      const tong = data.tong;
      const du_doan = data.du_doan.trim();
      const ty_le = data.ty_le_thanh_cong;
      
      if (session_id && session_id !== last_session) {
        const now = moment().tz(tz).format("YYYY-MM-DD HH:mm:ss");
        let check_str = "Chưa có";
        if (last_prediction) {
          if (result.toLowerCase() === last_prediction.toLowerCase()) {
            check_str = `${last_prediction} đúng✅`;
            stats.correct++;
          } else {
            check_str = `${last_prediction} sai❌`;
            stats.wrong++;
          }
          stats.total_rounds++;
          saveStats(stats);
        }

        if (stats.total_rounds > 0 && stats.total_rounds % 10 === 0) {
          bot.telegram.sendMessage(ADMIN_ID, formatStats(stats), { parse_mode: "Markdown" });
        }

        const msg = (
          `[VANNHAT]Phiên: ${session_id}\n` +
          `Kết quả: ${result} | ${xuc_xac} = (${tong})\n` +
          `Dự Đoán Trước : ${check_str}\n` +
          `Dự Đoán Sau : ${du_doan} | (${ty_le})\n` +
          `🇻🇳 Thời gian dự đoán: ${now}\n`
        );

        const appData = loadData();
        for (const user of appData.active_users) {
          await bot.telegram.sendMessage(user, msg, { parse_mode: "Markdown" });
          console.log(`Đã gửi dự đoán cho user: ${user}`);
        }

        last_session = session_id;
        last_prediction = du_doan;
      }
    } catch (e) {
      console.error("Lỗi API:", e.message);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
};

// ====== XỬ LÝ LỆNH TELEGRAM ======
bot.start((ctx) => {
  const caption = (
    "📌 Mua key để sử dụng tool:\n" +
    "- 1 ngày: 30k\n" +
    "- 1 tuần: 80k\n" +
    "- 1 tháng: 200k\n" +
    "- 2 tháng: 300k\n" +
    "- Vĩnh viễn: 444k\n\n" +
    "💳 Chuyển khoản theo QR ở trên\n" +
    "📩 Liên hệ: @Adm_VanNhat"
  );
  ctx.replyWithPhoto({ source: QR_IMAGE }, { caption: caption });
});

bot.help((ctx) => {
  const help_text = (
    "📖 Danh sách lệnh:\n" +
    "/start - Xem thông tin mua tool + QR\n" +
    "/help - Xem hướng dẫn\n" +
    "/key <key> - Nhập key để kích hoạt\n" +
    "/chaybot - Bật nhận dự đoán\n" +
    "/tatbot - Tắt nhận dự đoán\n\n" +
    "🔐 Lệnh admin:\n" +
    "/thongke - Xem thống kê\n" +
    "/taokey <key> <số_lượt> <số_ngày> - Tạo key\n" +
    "/xoakey <key> - Xóa key\n" +
    "/dskey - Xem danh sách key"
  );
  ctx.reply(help_text);
});

bot.command('thongke', (ctx) => {
  if (ctx.from.id == ADMIN_ID) {
    ctx.reply(formatStats(loadStats()), { parse_mode: "Markdown" });
  } else {
    ctx.reply("❌ Bạn không có quyền.");
  }
});

bot.command('taokey', (ctx) => {
  if (ctx.from.id == ADMIN_ID) {
    try {
      const parts = ctx.message.text.split(" ");
      const key = parts[1];
      const uses = parseInt(parts[2]) || -1;
      const days = parseInt(parts[3]) || -1;
      const expiry = days > 0 ? Date.now() / 1000 + days * 86400 : -1;
      
      const data = loadData();
      data.keys[key] = { uses, expiry };
      saveData(data);

      const expStr = expiry === -1 ? "vĩnh viễn" : moment.unix(expiry).tz('Asia/Ho_Chi_Minh').format("DD/MM/YYYY HH:mm");
      const usesStr = uses === -1 ? "không giới hạn" : uses;
      ctx.reply(`✅ Đã tạo key: ${key}\n🔹 Số lượt: ${usesStr}\n🔹 Hết hạn: ${expStr}`);
    } catch (e) {
      ctx.reply("❌ Sai cú pháp. /taokey <key> <số_lượt> <số_ngày>");
    }
  } else {
    ctx.reply("❌ Bạn không có quyền.");
  }
});

bot.command('key', (ctx) => {
  try {
    const key = ctx.message.text.split(" ")[1];
    const data = loadData();
    const keyInfo = data.keys[key];
    
    const isValid = keyInfo && (keyInfo.expiry === -1 || Date.now() / 1000 < keyInfo.expiry) && (keyInfo.uses === -1 || keyInfo.uses > 0);
    
    if (isValid) {
      if (keyInfo.uses > 0) {
        keyInfo.uses--;
      }
      if (!data.active_users.includes(ctx.from.id)) {
        data.active_users.push(ctx.from.id);
      }
      saveData(data);
      ctx.reply("✅ Key hợp lệ. Gõ /chaybot để làm giàu");
    } else {
      ctx.reply("❌ Key không hợp lệ hoặc đã hết hạn.");
      if (data.active_users.includes(ctx.from.id)) {
        data.active_users = data.active_users.filter(id => id !== ctx.from.id);
        saveData(data);
      }
    }
  } catch (e) {
    ctx.reply("❌ Sai cú pháp. /key <key>");
  }
});

bot.command('chaybot', (ctx) => {
  const data = loadData();
  if (!data.active_users.includes(ctx.from.id)) {
    data.active_users.push(ctx.from.id);
    saveData(data);
  }
  ctx.reply("✅ Đã bật tool anh ân dz");
});

bot.command('tatbot', (ctx) => {
  const data = loadData();
  if (data.active_users.includes(ctx.from.id)) {
    data.active_users = data.active_users.filter(id => id !== ctx.from.id);
    saveData(data);
  }
  ctx.reply("⏸️ Đã tắt nhận dự đoán.");
});

bot.command('xoakey', (ctx) => {
  if (ctx.from.id == ADMIN_ID) {
    try {
      const key = ctx.message.text.split(" ")[1];
      const data = loadData();
      if (data.keys[key]) {
        delete data.keys[key];
        saveData(data);
        ctx.reply(`✅ Đã xóa key: ${key}`);
      } else {
        ctx.reply("❌ Không tìm thấy key.");
      }
    } catch (e) {
      ctx.reply("❌ Sai cú pháp. /xoakey <key>");
    }
  } else {
    ctx.reply("❌ Bạn không có quyền.");
  }
});

bot.command('dskey', (ctx) => {
  if (ctx.from.id == ADMIN_ID) {
    const data = loadData();
    if (Object.keys(data.keys).length === 0) {
      ctx.reply("📂 Không có key nào.");
    } else {
      let msg = "📂 Danh sách key:\n";
      for (const [key, info] of Object.entries(data.keys)) {
        const expStr = info.expiry === -1 ? "vĩnh viễn" : moment.unix(info.expiry).tz('Asia/Ho_Chi_Minh').format("DD/MM/YYYY HH:mm");
        const usesStr = info.uses === -1 ? "không giới hạn" : info.uses;
        msg += `- \`${key}\`: ${usesStr} lượt, hết hạn ${expStr}\n`;
      }
      ctx.reply(msg, { parse_mode: "Markdown" });
    }
  } else {
    ctx.reply("❌ Bạn không có quyền.");
  }
});

// Khởi động bot và vòng lặp API
bot.launch();
apiLoop();
