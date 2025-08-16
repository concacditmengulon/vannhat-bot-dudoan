const express = require('express');
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const { Telegraf } = require('telegraf');

// ====================== CẤU HÌNH ======================
const BOT_TOKEN = process.env.BOT_TOKEN || "7751217253:AAHYIOAF0HMufS9smSsoBgjOjdIy1XwyILg";
const ADMIN_ID = Number(process.env.ADMIN_ID) || 6781092017;
const DATA_FILE = "data.json";
const STATS_FILE = "stats.json";
const API_URL = "https://admin-vannhat-sunpredict.onrender.com/api/du-doan";
const QR_IMAGE = path.join(__dirname, "qr.jpg");
const PORT = process.env.PORT || 3000;

// ====================== KHỞI TẠO ======================
const app = express();
const bot = new Telegraf(BOT_TOKEN);

// ====================== HÀM QUẢN LÝ DỮ LIỆU ======================
async function loadData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') {
            console.log("File data.json not found, creating a new one.");
            const initialData = { keys: {}, active_users: [] };
            await saveData(initialData);
            return initialData;
        }
        console.error("Error loading data file:", e);
        return { keys: {}, active_users: [] };
    }
}

async function saveData(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 4), 'utf-8');
    } catch (e) {
        console.error("Error saving data file:", e);
    }
}

async function loadStats() {
    try {
        const stats = await fs.readFile(STATS_FILE, 'utf-8');
        return JSON.parse(stats);
    } catch (e) {
        if (e.code === 'ENOENT') {
            console.log("File stats.json not found, creating a new one.");
            const initialStats = { correct: 0, wrong: 0, total_rounds: 0 };
            await saveStats(initialStats);
            return initialStats;
        }
        console.error("Error loading stats file:", e);
        return { correct: 0, wrong: 0, total_rounds: 0 };
    }
}

async function saveStats(stats) {
    try {
        await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 4), 'utf-8');
    } catch (e) {
        console.error("Error saving stats file:", e);
    }
}

// ====================== HÀM KIỂM TRA KEY ======================
function isKeyValid(keyInfo) {
    if (!keyInfo) return false;
    // Check expiry
    if (keyInfo.expiry && keyInfo.expiry !== -1 && Date.now() / 1000 > keyInfo.expiry) {
        return false;
    }
    // Check uses
    if (keyInfo.uses && keyInfo.uses !== -1 && keyInfo.uses <= 0) {
        return false;
    }
    return true;
}

// ====================== HÀM TẠO THỐNG KÊ ======================
function formatStats(stats) {
    const total = stats.total_rounds;
    if (total === 0) {
        return "📊 *Chưa có dữ liệu thống kê.*";
    }
    const tiLe = ((stats.correct / total) * 100).toFixed(2);
    return `📊 *Thống kê bot Sunwin*\n✅ Đúng: \`${stats.correct}\`\n❌ Sai: \`${stats.wrong}\`\n📈 Tỉ lệ đúng: \`${tiLe}%\`\n🕒 Tổng phiên: \`${total}\``;
}

// ====================== CÔNG CỤ BOT ======================
let lastSessionId = null;
let lastPrediction = null;

async function sendPredictionToUsers(message) {
    const data = await loadData();
    for (const userId of data.active_users) {
        try {
            await bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error(`Error sending message to user ${userId}:`, e);
            // Xóa người dùng nếu bot không thể gửi tin nhắn (bị chặn)
            if (e.response && e.response.error_code === 403) {
                const index = data.active_users.indexOf(userId);
                if (index > -1) {
                    data.active_users.splice(index, 1);
                    await saveData(data);
                    console.log(`User ${userId} removed due to bot being blocked.`);
                }
            }
        }
    }
}

async function fetchAndSendPrediction() {
    try {
        const response = await axios.get(API_URL, { timeout: 10000 });
        const res = response.data;

        const sessionId = String(res.phien);
        const result = res.ket_qua;
        const xuc_xac = res.xuc_xac;
        const tong = res.tong;
        const du_doan = res.du_doan;
        const ty_le = res.ty_le_thanh_cong;
        const diem_xiu = res.diem_xiu || 0;
        const diem_tai = res.diem_tai || 0;

        if (sessionId && sessionId !== lastSessionId) {
            const stats = await loadStats();
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
                await saveStats(stats);
            }

            // Gửi thống kê cho admin mỗi 10 phiên
            if (stats.total_rounds > 0 && stats.total_rounds % 10 === 0) {
                await bot.telegram.sendMessage(ADMIN_ID, formatStats(stats), { parse_mode: 'Markdown' });
            }

            let allInMsg = "";
            if (diem_xiu === 1) allInMsg = "🔥 ALL IN Xỉu!";
            if (diem_tai === 1) allInMsg = "🔥 ALL IN Tài!";

            const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
            const message = `🎲 *Phiên:* \`${sessionId}\`\n📌 Kết quả: *${result}* - ${xuc_xac} = (${tong})\n📊 Dự đoán trước: ${checkStr}\n🔮 Dự đoán sau: *${du_doan}* (${ty_le})\n🕒 ${now}\n${allInMsg}`;

            await sendPredictionToUsers(message);

            lastSessionId = sessionId;
            lastPrediction = du_doan;
        }

    } catch (e) {
        console.error("❌ Lỗi API:", e.message);
    }
}

// Lặp lại việc lấy dữ liệu API sau mỗi 3 giây
setInterval(fetchAndSendPrediction, 3000);

// ====================== LỆNH BOT ======================
bot.start(async (ctx) => {
    const caption = "📌 Mua key để sử dụng tool:\n- 1 ngày: 30k\n- 1 tuần: 80k\n- 1 tháng: 200k\n- Vĩnh viễn: 444k\n\n💳 Chuyển khoản theo QR\n📩 Liên hệ: @ADM_VANNHAT";
    try {
        await ctx.replyWithPhoto({ source: QR_IMAGE }, { caption });
    } catch (e) {
        await ctx.reply(`⚠️ Ảnh QR chưa được tải lên bot.\n\n${caption}`);
    }
});

bot.help(async (ctx) => {
    await ctx.reply("📖 Danh sách lệnh:\n/start - Xem thông tin mua tool + QR\n/help - Xem hướng dẫn\n/key <key> - Nhập key\n/chaybot - Bật dự đoán\n/tatbot - Tắt dự đoán");
});

bot.command('key', async (ctx) => {
    const data = await loadData();
    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) {
        return ctx.reply("❌ Sai cú pháp. /key <key>");
    }
    const key = parts[1];
    if (data.keys[key] && isKeyValid(data.keys[key])) {
        await ctx.reply("✅ Key hợp lệ. Gõ /chaybot để bật dự đoán.");
        if (data.keys[key].uses > 0) {
            data.keys[key].uses--;
        }
        if (!data.active_users.includes(ctx.from.id)) {
            data.active_users.push(ctx.from.id);
        }
        await saveData(data);
    } else {
        await ctx.reply("❌ Key không hợp lệ hoặc hết hạn.");
    }
});

bot.command('chaybot', async (ctx) => {
    const data = await loadData();
    if (!data.active_users.includes(ctx.from.id)) {
        data.active_users.push(ctx.from.id);
        await saveData(data);
    }
    await ctx.reply("✅ Đã bật bot dự đoán!");
});

bot.command('tatbot', async (ctx) => {
    const data = await loadData();
    const index = data.active_users.indexOf(ctx.from.id);
    if (index > -1) {
        data.active_users.splice(index, 1);
        await saveData(data);
    }
    await ctx.reply("⏸️ Đã tắt nhận dự đoán.");
});

// ====================== LỆNH ADMIN ======================
bot.command('thongke', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply("❌ Bạn không có quyền.");
    }
    const stats = await loadStats();
    await ctx.reply(formatStats(stats), { parse_mode: 'Markdown' });
});

bot.command('taokey', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply("❌ Bạn không có quyền.");
    }
    try {
        const parts = ctx.message.text.split(' ');
        const key = parts[1];
        const uses = parts[2] ? Number(parts[2]) : -1;
        const days = parts[3] ? Number(parts[3]) : -1;
        const expiry = days > 0 ? Date.now() / 1000 + days * 86400 : -1;
        const data = await loadData();
        data.keys[key] = { uses, expiry };
        await saveData(data);

        const expStr = expiry === -1 ? "vĩnh viễn" : new Date(expiry * 1000).toLocaleString('vi-VN');
        const usesStr = uses === -1 ? "∞" : String(uses);
        await ctx.reply(`✅ Key: \`${key}\`\n📌 Lượt: ${usesStr}\n🕒 Hết hạn: ${expStr}`);
    } catch (e) {
        await ctx.reply("❌ Sai cú pháp. /taokey <key> <số_lượt> <số_ngày>");
    }
});

bot.command('xoakey', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply("❌ Bạn không có quyền.");
    }
    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) {
        return ctx.reply("❌ Sai cú pháp. /xoakey <key>");
    }
    const key = parts[1];
    const data = await loadData();
    if (data.keys[key]) {
        delete data.keys[key];
        await saveData(data);
        await ctx.reply(`✅ Đã xóa key \`${key}\``);
    } else {
        await ctx.reply("❌ Không tìm thấy key.");
    }
});

bot.command('dskey', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply("❌ Bạn không có quyền.");
    }
    const data = await loadData();
    if (Object.keys(data.keys).length === 0) {
        return ctx.reply("📂 Không có key nào.");
    }
    let msg = "📂 Danh sách key:\n";
    for (const [k, v] of Object.entries(data.keys)) {
        const expStr = v.expiry === -1 ? "vĩnh viễn" : new Date(v.expiry * 1000).toLocaleString('vi-VN');
        const usesStr = v.uses === -1 ? "∞" : String(v.uses);
        msg += `- \`${k}\`: ${usesStr} lượt, hết hạn ${expStr}\n`;
    }
    await ctx.reply(msg);
});

// ====================== START APP ======================
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    // Khởi động bot
    await bot.launch();
    console.log("Telegram bot launched.");

    // Xử lý graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
});

