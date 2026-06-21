const TelegramBot = require('node-telegram-bot-api');
const { supabase } = require('./supabase');
const { format, startOfDay } = require('date-fns');
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable').default;
const cron = require('node-cron');
require('dotenv').config();

const MINIAPP_URL = process.env.MINIAPP_URL || 'https://buckygaminglive.github.io/telegram-bot/';

const token = process.env.TELEGRAM_BOT_TOKEN;
const registerCode = process.env.REGISTER_CODE || 'sanket2026';

// Start a dummy server for Railway health checks
try { require('./dummy-server.js'); } catch(e) {}


// --- Whitelist & Language Persistence ---
const whitelistFile = path.join(__dirname, 'whitelist.json');
const langFile = path.join(__dirname, 'languages.json');
const muteGhostsFile = path.join(__dirname, 'muteGhosts.json');

function loadJSON(file) {
    try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { }
    return file === whitelistFile ? [] : {};
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

let allowedIds = loadJSON(whitelistFile);
let userLangs = loadJSON(langFile);
let mutedGhosts = loadJSON(muteGhostsFile);

// State machine for interactive flows (e.g., changing prices)
// Format: { chatId: { action: 'awaiting_price', productId: '1', productName: 'Chicken' } }
let userStates = {};

const isAuthorized = (id) => allowedIds.includes(id);
const getLang = (id) => userLangs[id] || 'en';

// ═══════════════════════════════════════
//  TRANSLATIONS
// ═══════════════════════════════════════
const T = {
    en: {
        welcome: '🐔  *SANKET CHICKEN SHOP*\n━━━━━━━━━━━━━━━━━\n\nWelcome! Use the buttons below 👇',
        welcomeBack: '🐔  *SANKET CHICKEN SHOP*\n━━━━━━━━━━━━━━━━━\n\nWelcome back! Use the buttons below 👇',
        restricted: '🔒  *ACCESS RESTRICTED*\n\nThis bot is private.\nPlease type the *access code* to register:',
        granted: '✅  *ACCESS GRANTED!*\n\n🐔 Welcome to Sanket Chicken Shop!\nUse the buttons below 👇',
        wrongCode: '❌ Wrong code. Try again or contact admin.',
        langChanged: '🇬🇧  Language changed to *English* ✅',
        error: '❌ Something went wrong. Try again.',

        // Button labels (Reply Keyboard)
        btnSales: '💰 Today\'s Sales',
        btnWeight: '⚖️ Kg Sold',
        btnUnpaid: '🧾 Unpaid Bills',
        btnGhosts: '👻 Ghost Sales',
        btnSummary: '📊 Full Summary',
        btnChangePrice: '✏️ Change Price',
        btnTodayBills: '🧾 Today\'s Bills PDF',
        btnGhostBills: '👻 Ghost Sales PDF',
        btnMute: '🔕 Mute Alerts',
        btnUnmute: '🔔 Unmute Alerts',
        btnLang: '🇮🇳 मराठी',
        btnDashboard: '🤖 Bot Menu',

        // Data responses
        sales: (n, amt) =>
            `💰  *TODAY'S SALES*\n━━━━━━━━━━━━━━━━━\n\n` +
            `🧮  Bills:   *${n}*\n` +
            `💵  Total:   *₹${Math.floor(amt)}*`,

        weight: (kg) =>
            `⚖️  *KG SOLD TODAY*\n━━━━━━━━━━━━━━━━━\n\n` +
            `📦  Total:   *${kg.toFixed(3)} kg*`,

        unpaid: (n, amt) =>
            `🧾  *UNPAID OUTSTANDING*\n━━━━━━━━━━━━━━━━━\n\n` +
            `📋  Bills:   *${n}*\n` +
            `💸  Total:   *₹${Math.floor(amt)}*`,

        ghosts: (n) =>
            `👻  *GHOST SALES TODAY*\n━━━━━━━━━━━━━━━━━\n\n` +
            `🚨  Count:   *${n}*`,

        summary: (s, b, kg, u, uc, g, time) =>
            `📊  *FULL DAILY SUMMARY*\n━━━━━━━━━━━━━━━━━\n\n` +
            `💰  Sales:       *₹${Math.floor(s)}*  (${b} bills)\n` +
            `⚖️  Weight:     *${kg.toFixed(3)} kg*\n` +
            `🧾  Unpaid:     *₹${Math.floor(u)}*  (${uc} bills)\n` +
            `👻  Ghost:       *${g}*\n\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `🕐  _${time}_`,

        ghostAlert: (date, time, wt) =>
            `\n🚨🚨🚨🚨🚨🚨🚨🚨🚨\n\n` +
            `     *GHOST SALE DETECTED!*\n\n` +
            `📅  Date:     *${date}*\n` +
            `⏰  Time:     *${time}*\n` +
            `⚖️  Weight:  *${wt} kg*\n\n` +
            `_⚠️ Review security footage!_\n\n` +
            `🚨🚨🚨🚨🚨🚨🚨🚨🚨`,

        errSales: '❌ Error fetching sales.', errWeight: '❌ Error fetching weight.',
        errUnpaid: '❌ Error fetching unpaid.', errGhosts: '❌ Error fetching ghosts.',
    },
    mr: {
        welcome: '🐔  *संकेत चिकन शॉप*\n━━━━━━━━━━━━━━━━━\n\nस्वागत आहे! खालील बटणे वापरा 👇',
        welcomeBack: '🐔  *संकेत चिकन शॉप*\n━━━━━━━━━━━━━━━━━\n\nपुन्हा स्वागत! खालील बटणे वापरा 👇',
        restricted: '🔒  *प्रवेश प्रतिबंधित*\n\nहा बॉट खाजगी आहे.\nकृपया *प्रवेश कोड* टाका:',
        granted: '✅  *प्रवेश मंजूर!*\n\n🐔 संकेत चिकन शॉप मध्ये स्वागत!\nखालील बटणे वापरा 👇',
        wrongCode: '❌ चुकीचा कोड. पुन्हा प्रयत्न करा.',
        langChanged: '🇮🇳  भाषा *मराठी* मध्ये बदलली ✅',
        error: '❌ काहीतरी चूक झाली. पुन्हा प्रयत्न करा.',

        btnSales: '💰 आजची विक्री',
        btnWeight: '⚖️ किलो विकले',
        btnUnpaid: '🧾 उधारी',
        btnGhosts: '👻 घोस्ट सेल',
        btnSummary: '📊 संपूर्ण सारांश',
        btnChangePrice: '✏️ भाव बदला',
        btnTodayBills: '🧾 आजची बिले PDF',
        btnGhostBills: '👻 घोस्ट सेल PDF',
        btnMute: '🔕 अलर्ट बंद करा',
        btnUnmute: '🔔 अलर्ट चालू करा',
        btnLang: '🇬🇧 English',
        btnDashboard: '🤖 बॉट मेनू',

        sales: (n, amt) =>
            `💰  *आजची विक्री*\n━━━━━━━━━━━━━━━━━\n\n` +
            `🧮  बिले:    *${n}*\n` +
            `💵  एकूण:   *₹${Math.floor(amt)}*`,

        weight: (kg) =>
            `⚖️  *आज किती किलो विकले*\n━━━━━━━━━━━━━━━━━\n\n` +
            `📦  एकूण:   *${kg.toFixed(3)} किलो*`,

        unpaid: (n, amt) =>
            `🧾  *उधारी / बाकी रक्कम*\n━━━━━━━━━━━━━━━━━\n\n` +
            `📋  बिले:    *${n}*\n` +
            `💸  एकूण:   *₹${Math.floor(amt)}*`,

        ghosts: (n) =>
            `👻  *आजचे घोस्ट सेल*\n━━━━━━━━━━━━━━━━━\n\n` +
            `🚨  संख्या:  *${n}*`,

        summary: (s, b, kg, u, uc, g, time) =>
            `📊  *आजचा संपूर्ण सारांश*\n━━━━━━━━━━━━━━━━━\n\n` +
            `💰  विक्री:     *₹${Math.floor(s)}*  (${b} बिले)\n` +
            `⚖️  वजन:      *${kg.toFixed(3)} किलो*\n` +
            `🧾  उधारी:     *₹${Math.floor(u)}*  (${uc} बिले)\n` +
            `👻  घोस्ट:     *${g}*\n\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `🕐  _${time}_`,

        ghostAlert: (date, time, wt) =>
            `\n🚨🚨🚨🚨🚨🚨🚨🚨🚨\n\n` +
            `     *घोस्ट सेल सापडले!*\n\n` +
            `📅  तारीख:   *${date}*\n` +
            `⏰  वेळ:       *${time}*\n` +
            `⚖️  वजन:    *${wt} किलो*\n\n` +
            `_⚠️ कृपया सुरक्षा कॅमेरा तपासा._\n\n` +
            `🚨🚨🚨🚨🚨🚨🚨🚨🚨`,

        errSales: '❌ विक्री माहिती चूक.', errWeight: '❌ वजन माहिती चूक.',
        errUnpaid: '❌ उधारी माहिती चूक.', errGhosts: '❌ घोस्ट सेल माहिती चूक.',
    }
};

// ═══════════════════════════════════════
//  BOT INIT
// ═══════════════════════════════════════
const bot = new TelegramBot(token, { polling: true });

// Handle polling errors (e.g., Telegram 500 Internal Server Error) to prevent crashes
bot.on('polling_error', (error) => {
    console.log(`[Polling Error] ${error.code}: ${error.message}`);
});

console.log('🤖 Sanket Telegram Bot starting...');
// Set the menu button to open the Mini App (Web App)
bot.setChatMenuButton({
    menu_button: JSON.stringify({
        type: 'web_app',
        text: '📱 Dashboard',
        web_app: { url: MINIAPP_URL }
    })
}).then(() => console.log('✅ Menu button set!')).catch(e => console.log('Menu button:', e.message));

bot.setMyCommands([
    { command: '/start', description: 'Show Bot Menu' },
    { command: '/changeprice', description: '✏️ Change Product Price' },
    { command: '/report', description: '📊 Get Daily PDF Report' },
    { command: '/marathi', description: 'मराठी भाषा' },
    { command: '/english', description: 'English Language' }
]).then(() => console.log('✅ Bot commands set!'));

// Inline menu shown in chat
async function sendDashboardMenu(id, lang) {
    const l = T[lang];
    const inlineKeyboard = [
        [{ text: l.btnSales, callback_data: 'CMD_SALES' }, { text: l.btnWeight, callback_data: 'CMD_WEIGHT' }],
        [{ text: l.btnUnpaid, callback_data: 'CMD_UNPAID' }, { text: l.btnGhosts, callback_data: 'CMD_GHOSTS' }],
        [{ text: l.btnSummary, callback_data: 'CMD_SUMMARY' }],
        [{ text: l.btnTodayBills, callback_data: 'CMD_TODAYBILLS' }, { text: l.btnGhostBills, callback_data: 'CMD_GHOST_BILLS' }],
        [{ text: mutedGhosts[id] ? l.btnUnmute : l.btnMute, callback_data: 'CMD_TOGGLE_MUTE' }],
        [{ text: l.btnChangePrice, callback_data: 'CMD_CHANGEPRICE' }],
        [{ text: l.btnLang, callback_data: 'CMD_LANG' }]
    ];
    await bot.sendMessage(id, lang === 'mr' ? '🤖 *बॉट मेनू*\nखालीलपैकी एक पर्याय निवडा:' : '🤖 *Bot Menu*\nSelect an option below:', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
    });
}

// Back to Menu inline button (attached to every response)
function backToMenuButton(lang) {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: lang === 'mr' ? '🔙 मेनूवर परत जा' : '🔙 Back to Menu', callback_data: 'CMD_MENU' }]
            ]
        }
    };
}

// ═══════════════════════════════════════
//  COMMANDS
// ═══════════════════════════════════════
bot.onText(/\/start/, (msg) => {
    const id = msg.chat.id, lang = getLang(id), l = T[lang];
    if (isAuthorized(id)) {
        bot.sendMessage(id, l.welcomeBack, { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }).then(() => {
            sendDashboardMenu(id, lang);
        });
    } else {
        bot.sendMessage(id, T.en.restricted, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/changeprice/, async (msg) => {
    const id = msg.chat.id, lang = getLang(id), l = T[lang];
    if (!isAuthorized(id)) return;
    const { data, error } = await supabase.from('products').select('*').order('id', { ascending: true });
    if (error) { bot.sendMessage(id, l.error); return; }
    if (!data || data.length === 0) { bot.sendMessage(id, lang === 'mr' ? '❌ कोणतेही उत्पादन सापडले नाही.' : '❌ No products found.'); return; }
    const inlineKeyboard = data.map(p => ([{ text: `${p.name} (₹${p.rate} / ${p.unit})`, callback_data: `C_P_${p.id}` }]));
    bot.sendMessage(id, lang === 'mr' ? '👇 किंमत बदलण्यासाठी उत्पादन निवडा:' : '👇 Select a product to change its price:', { reply_markup: { inline_keyboard: inlineKeyboard } });
});

bot.onText(/\/marathi/, (msg) => {
    const id = msg.chat.id;
    if (!isAuthorized(id)) return;
    userLangs[id] = 'mr'; saveJSON(langFile, userLangs);
    bot.sendMessage(id, T.mr.langChanged, { parse_mode: 'Markdown' }).then(() => sendDashboardMenu(id, 'mr'));
});

bot.onText(/\/english/, (msg) => {
    const id = msg.chat.id;
    if (!isAuthorized(id)) return;
    userLangs[id] = 'en'; saveJSON(langFile, userLangs);
    bot.sendMessage(id, T.en.langChanged, { parse_mode: 'Markdown' }).then(() => sendDashboardMenu(id, 'en'));
});

// ═══════════════════════════════════════
//  MESSAGE HANDLER
// ═══════════════════════════════════════
bot.on('message', async (msg) => {
    const id = msg.chat.id;
    const text = msg.text?.trim() || 'menu'; // Default non-text like stickers to 'menu'
    if (text.startsWith('/')) return; // Commands are handled separately

    // --- Registration ---
    if (!isAuthorized(id)) {
        if (text === registerCode) {
            allowedIds.push(id); saveJSON(whitelistFile, allowedIds);
            userLangs[id] = 'en'; saveJSON(langFile, userLangs);
            console.log(`✅ Registered: ${id} (${msg.from.first_name})`);
            bot.sendMessage(id, T.en.granted, { parse_mode: 'Markdown' }).then(() => sendDashboardMenu(id, 'en'));
        } else {
            bot.sendMessage(id, T.en.wrongCode);
        }
        return;
    }

    const lang = getLang(id);
    const l = T[lang];
    let response = '';

    try {
        if (userStates[id] && userStates[id].action === 'awaiting_price') {
            const state = userStates[id];
            const newPrice = parseFloat(text);
            
            if (isNaN(newPrice) || newPrice < 0) {
                bot.sendMessage(id, lang === 'mr' ? '❌ कृपया वैध क्रमांक टाका.' : '❌ Please enter a valid number.');
                return;
            }

            // Update Supabase
            const { error } = await supabase.from('products').update({ rate: newPrice }).eq('id', state.productId);
            
            if (error) {
                bot.sendMessage(id, lang === 'mr' ? '❌ जतन करण्यात अयशस्वी.' : '❌ Failed to save.', backToMenuButton(lang));
                console.error("Supabase update error:", error);
            } else {
                const successText = lang === 'mr' 
                    ? `✅ यश! *${state.productName}* ची नवीन किंमत *₹${newPrice}* जतन केली आहे.`
                    : `✅ Success! New price for *${state.productName}* saved as *₹${newPrice}*.`;
                bot.sendMessage(id, successText, { parse_mode: 'Markdown', ...backToMenuButton(lang) });
            }

            // Clear state
            delete userStates[id];
            return;
        }
        else {
            // Default: show menu
            await sendDashboardMenu(id, lang);
            return;
        }
    } catch (err) {
        bot.sendMessage(id, l.error);
        console.error(err);
    }
});

bot.on('callback_query', async (query) => {
    const id = query.message.chat.id;
    const data = query.data; // e.g., 'C_P_1'
    const lang = getLang(id);
    const l = T[lang];

    // Provide immediate visual feedback to Telegram that button was clicked
    bot.answerCallbackQuery(query.id);

    try {
        let response = '';
        if (data === 'CMD_MENU') {
            await sendDashboardMenu(id, lang);
            return;
        }
        else if (data === 'CMD_SALES') response = await getSales(l);
        else if (data === 'CMD_WEIGHT') response = await getWeight(l);
        else if (data === 'CMD_UNPAID') response = await getUnpaid(l);
        else if (data === 'CMD_GHOSTS') response = await getGhosts(l);
        else if (data === 'CMD_SUMMARY') response = await getSummary(l);
        else if (data === 'CMD_LANG') {
            const newLang = lang === 'mr' ? 'en' : 'mr';
            userLangs[id] = newLang; saveJSON(langFile, userLangs);
            const nl = T[newLang];
            await bot.sendMessage(id, nl.langChanged, { parse_mode: 'Markdown' });
            await sendDashboardMenu(id, newLang);
            return;
        }
        else if (data === 'CMD_CHANGEPRICE') {
            const { data: pList, error } = await supabase.from('products').select('*').order('id', { ascending: true });
            if (error) { bot.sendMessage(id, l.error); return; }
            if (!pList || pList.length === 0) { bot.sendMessage(id, lang === 'mr' ? '❌ कोणतेही उत्पादन सापडले नाही.' : '❌ No products found.'); return; }
            
            const inlineKeyboard = pList.map(p => ([{
                text: `${p.name} (₹${p.rate} / ${p.unit})`,
                callback_data: `C_P_${p.id}`
            }]));
            inlineKeyboard.push([{ text: lang === 'mr' ? '🔙 मेनूवर परत जा' : '🔙 Back to Menu', callback_data: 'CMD_MENU' }]);
            
            const msgText = lang === 'mr' ? '👇 किंमत बदलण्यासाठी उत्पादन निवडा:' : '👇 Select a product to change its price:';
            bot.sendMessage(id, msgText, { reply_markup: { inline_keyboard: inlineKeyboard } });
            return;
        }
        else if (data === 'CMD_TODAYBILLS') {
            const targetDate = new Date();
            bot.sendMessage(id, lang === 'mr' ? `⏳ आजच्या बिलांचा PDF तयार करत आहे...` : `⏳ Generating today's bills PDF...`);
            try {
                const pdfBuffer = await generateBillsPDFBuffer(targetDate);
                const filename = `Sanket-Bills-${format(targetDate, 'dd-MMM-yyyy')}.pdf`;
                await bot.sendDocument(id, pdfBuffer, {
                    caption: `🧾 ${lang === 'mr' ? 'आजची बिले' : "Today's Bills"} — ${format(targetDate, 'dd MMM yyyy')}`
                }, {
                    filename,
                    contentType: 'application/pdf'
                });
            } catch (err) {
                bot.sendMessage(id, lang === 'mr' ? '❌ PDF तयार करण्यात अयशस्वी.' : '❌ Failed to generate PDF.', backToMenuButton(lang));
                console.error(err);
            }
            return;
        }
        else if (data === 'CMD_GHOST_BILLS') {
            const targetDate = new Date();
            bot.sendMessage(id, lang === 'mr' ? `⏳ घोस्ट सेल PDF तयार करत आहे...` : `⏳ Generating ghost sales PDF...`);
            try {
                const pdfBuffer = await generateGhostBillsPDFBuffer(targetDate);
                const filename = `Sanket-Ghosts-${format(targetDate, 'dd-MMM-yyyy')}.pdf`;
                await bot.sendDocument(id, pdfBuffer, {
                    caption: `👻 ${lang === 'mr' ? 'घोस्ट सेल' : "Ghost Sales"} — ${format(targetDate, 'dd MMM yyyy')}`
                }, {
                    filename,
                    contentType: 'application/pdf'
                });
            } catch (err) {
                bot.sendMessage(id, lang === 'mr' ? '❌ PDF तयार करण्यात अयशस्वी.' : '❌ Failed to generate PDF.', backToMenuButton(lang));
                console.error(err);
            }
            return;
        }
        else if (data === 'CMD_TOGGLE_MUTE') {
            mutedGhosts[id] = !mutedGhosts[id];
            saveJSON(muteGhostsFile, mutedGhosts);
            const msgText = mutedGhosts[id] 
                ? (lang === 'mr' ? '🔕 घोस्ट सेल अलर्ट बंद केले आहेत.' : '🔕 Ghost sale alerts are now MUTED.')
                : (lang === 'mr' ? '🔔 घोस्ट सेल अलर्ट चालू केले आहेत.' : '🔔 Ghost sale alerts are now UNMUTED.');
            bot.sendMessage(id, msgText);
            await sendDashboardMenu(id, lang);
            return;
        }

        if (response) {
            bot.sendMessage(id, response, { parse_mode: 'Markdown', ...backToMenuButton(lang) });
            return;
        }
    } catch (err) {
        console.error(err);
        bot.sendMessage(id, l.error);
    }

    if (data.startsWith('C_P_')) {
        const productId = data.replace('C_P_', '');
        
        // Fetch product name just to make the prompt friendlier
        const { data: pData } = await supabase.from('products').select('name').eq('id', productId).single();
        if (!pData) {
            bot.sendMessage(id, lang === 'mr' ? '❌ उत्पादन सापडले नाही.' : '❌ Product not found.');
            return;
        }

        userStates[id] = { action: 'awaiting_price', productId: productId, productName: pData.name };
        
        const text = lang === 'mr' 
            ? `*${pData.name}* साठी नवीन किंमत टाइप करा आणि पाठवा:` 
            : `Type and send the new price for *${pData.name}*:`;
            
        bot.sendMessage(id, text, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
    }
});

// ═══════════════════════════════════════
//  DATA FETCHING
// ═══════════════════════════════════════
async function getSales(l) {
    const today = startOfDay(new Date()).toISOString();
    const { data, error } = await supabase.from('bills').select('total_amount').gte('created_at', today);
    if (error) return l.errSales;
    return l.sales(data.length, data.reduce((a, c) => a + (c.total_amount || 0), 0));
}

async function getWeight(l) {
    const today = startOfDay(new Date()).toISOString();
    const { data, error } = await supabase.from('bills').select('weight').gte('created_at', today);
    if (error) return l.errWeight;
    return l.weight(data.reduce((a, c) => a + (parseFloat(c.weight) || 0), 0));
}

async function getUnpaid(l) {
    const { data, error } = await supabase.from('bills').select('total_amount').eq('status', 'unpaid');
    if (error) return l.errUnpaid;
    return l.unpaid(data.length, data.reduce((a, c) => a + (c.total_amount || 0), 0));
}

async function getGhosts(l) {
    const today = startOfDay(new Date()).toISOString();
    const { data, error } = await supabase.from('unbilled_events').select('*').gte('created_at', today);
    if (error) return l.errGhosts;
    return l.ghosts(data.length);
}

async function getSummary(l) {
    const today = startOfDay(new Date()).toISOString();
    const [bR, uR, gR] = await Promise.all([
        supabase.from('bills').select('total_amount, weight').gte('created_at', today),
        supabase.from('bills').select('total_amount').eq('status', 'unpaid'),
        supabase.from('unbilled_events').select('*', { count: 'exact', head: true }).gte('created_at', today),
    ]);
    return l.summary(
        bR.data?.reduce((a, c) => a + (c.total_amount || 0), 0) || 0,
        bR.data?.length || 0,
        bR.data?.reduce((a, c) => a + (parseFloat(c.weight) || 0), 0) || 0,
        uR.data?.reduce((a, c) => a + (c.total_amount || 0), 0) || 0,
        uR.data?.length || 0,
        gR.count || 0,
        format(new Date(), 'hh:mm a, dd MMM yyyy')
    );
}

// ═══════════════════════════════════════
//  REAL-TIME GHOST ALERTS
// ═══════════════════════════════════════
supabase
    .channel('unbilled_events_telegram')
    .on('postgres_changes', { event: 'INSERT', table: 'unbilled_events' }, async (payload) => {
        const g = payload.new;
        const date = format(new Date(g.created_at), 'dd MMM yyyy');
        const time = format(new Date(g.created_at), 'hh:mm:ss a');
        const wt = g.max_weight || 0;
        const videoUrl = g.video_url;

        console.log(`👻 Ghost alert triggered. Processing video...`);
        let videoBuffer = null;
        if (videoUrl) {
            try {
                const res = await fetch(videoUrl);
                if (res.ok) {
                    const arrayBuffer = await res.arrayBuffer();
                    videoBuffer = Buffer.from(arrayBuffer);
                    console.log(`Video downloaded successfully (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB).`);
                } else {
                    console.log(`Failed to fetch video: ${res.status}`);
                }
            } catch (err) {
                console.error("Video download error:", err.message);
            }
        }

        // Send to all allowed users
        for (const id of allowedIds) {
            if (!mutedGhosts[id]) {
                const l = T[getLang(id)];
                try {
                    if (videoBuffer) {
                        await bot.sendVideo(id, videoBuffer, {
                            caption: l.ghostAlert(date, time, wt),
                            parse_mode: 'Markdown'
                        }, { filename: `Ghost-${time}.mp4`, contentType: 'video/mp4' });
                    } else {
                        await bot.sendMessage(id, l.ghostAlert(date, time, wt), { parse_mode: 'Markdown' });
                    }
                } catch (e) {
                    console.error(`Telegram send error for user ${id}:`, e.message);
                    bot.sendMessage(id, l.ghostAlert(date, time, wt) + '\n\n_(Video attachment failed)_', { parse_mode: 'Markdown' }).catch(console.error);
                }
            }
        }

        // Auto-delete video from Supabase after sending it to Telegram
        if (videoBuffer) {
            try {
                const urlParts = videoUrl.split('/object/public/');
                if (urlParts.length === 2) {
                    const pathWithBucket = urlParts[1];
                    const slashIdx = pathWithBucket.indexOf('/');
                    const bucket = pathWithBucket.slice(0, slashIdx);
                    const filePath = pathWithBucket.slice(slashIdx + 1);
                    
                    const { error: delErr } = await supabase.storage.from(bucket).remove([filePath]);
                    if (!delErr) {
                        await supabase.from('unbilled_events').update({ video_url: null }).eq('id', g.id);
                        console.log(`Auto-deleted ghost video from Supabase cloud to free up space.`);
                    } else {
                        console.error(`Failed to delete from storage:`, delErr.message);
                    }
                }
            } catch (err) {
                console.error("Auto-delete error:", err.message);
            }
        }
    })
    .subscribe();

// ═══════════════════════════════════════
//  RECEIPT-STYLE BILLS PDF
// ═══════════════════════════════════════

function formatWeightForPDF(weightStr) {
    if (!weightStr) return '-';
    const num = parseFloat(weightStr);
    if (isNaN(num)) return weightStr;
    if (num === 0) return '0.00 kg';
    if (Math.abs(num) < 1 && Math.abs(num) > 0) return `${Math.round(Math.abs(num) * 1000)} g`;
    return `${num.toFixed(3)} kg`;
}

function parseReceiptItems(bill) {
    if (!bill.product_name) {
        return [{ name: 'Item', qty: formatWeightForPDF(bill.weight), rate: bill.rate || '-', amount: bill.total_amount || '-' }];
    }

    let globalRate = parseFloat(bill.rate);
    if (isNaN(globalRate) || globalRate <= 0) {
        const totalNum = parseFloat(bill.total_amount || bill.total);
        const weightNum = parseFloat(bill.weight);
        if (!isNaN(totalNum) && !isNaN(weightNum) && weightNum > 0) globalRate = Math.round(totalNum / weightNum);
        else globalRate = 0;
    }

    const parts = bill.product_name.split(',').map(s => s.trim()).filter(Boolean);

    if (parts.length === 1) {
        let cName = parts[0].replace(/\s*\(.*?\)/, '').trim() || parts[0];
        return [{ name: cName, qty: formatWeightForPDF(bill.weight), rate: globalRate > 0 ? globalRate : '-', amount: bill.total_amount || bill.total || '-' }];
    }

    return parts.map(part => {
        // Match: "Name (0.748kg @ 312)" or "Name (2 dozen @ 70.00)"
        const kgMatch = part.match(/^(.*?)\s*\((.*?)kg(?: \@ (.*?))?\)$/i);
        const dozenMatch = part.match(/^(.*?)\s*\((\d+)\s+(dozen|piece)(?: \@ (.*?))?\)$/i);

        if (dozenMatch) {
            const pName = dozenMatch[1].trim();
            const pQty = parseInt(dozenMatch[2]);
            const pUnit = dozenMatch[3];
            const embRate = dozenMatch[4] ? parseFloat(dozenMatch[4]) : globalRate;
            const pAmount = !isNaN(embRate) && embRate > 0 ? Math.round(pQty * embRate) : '-';
            return { name: pName, qty: `${pQty} ${pUnit}`, rate: embRate > 0 ? embRate : '-', amount: pAmount };
        }

        if (kgMatch) {
            const pName = kgMatch[1].trim();
            const pWeightStr = kgMatch[2].trim();
            const pWeightNum = parseFloat(pWeightStr);
            const embeddedRate = kgMatch[3] ? parseFloat(kgMatch[3].trim()) : null;
            const bestRate = (embeddedRate !== null && !isNaN(embeddedRate)) ? embeddedRate : globalRate;
            let pAmount = '-';
            if (!isNaN(pWeightNum) && bestRate > 0) pAmount = Math.round(pWeightNum * bestRate);
            return { name: pName, qty: `${pWeightStr} kg`, rate: bestRate > 0 ? bestRate : '-', amount: pAmount };
        }

        return { name: part, qty: '-', rate: '-', amount: '-' };
    });
}

async function generateBillsPDFBuffer(targetDate = new Date()) {
    const todayDisplay = format(targetDate, 'dd MMM yyyy');

    // Calculate IST start-of-day in UTC (IST is UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istMidnight = new Date(targetDate);
    istMidnight.setHours(0, 0, 0, 0); // local midnight
    const startISO = istMidnight.toISOString();
    const endISO = new Date(istMidnight.getTime() + 86400000).toISOString();

    const { data: bills } = await supabase
        .from('bills').select('*')
        .gte('created_at', startISO)
        .lt('created_at', endISO)
        .eq('status', 'paid')
        .order('created_at', { ascending: true });

    const dayBills = bills || [];
    if (dayBills.length === 0) throw new Error('No paid bills found for today.');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 15;

    // Cover Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 25, 'F');
    doc.setTextColor(34, 197, 94);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('SANKET CHICKEN SHOP', pageW / 2, 12, { align: 'center' });
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Digital Bill Batch Export — ${todayDisplay}`, pageW / 2, 19, { align: 'center' });

    y = 35;

    dayBills.forEach((bill) => {
        if (y > 250) { doc.addPage(); y = 15; }

        const billTime = bill.created_at ? format(new Date(bill.created_at), 'hh:mm:ss a') : '';
        const billIdShort = bill.id.substring(0, 8).toUpperCase();

        // Top border
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.line(14, y, pageW - 14, y);
        y += 6;

        // Receipt header
        doc.setFont('courier', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(`RECEIPT #${billIdShort}`, 16, y);
        doc.setFont('courier', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(billTime, pageW - 16, y, { align: 'right' });
        y += 8;

        // Column headers
        doc.setTextColor(15, 23, 42);
        doc.setFont('courier', 'bold');
        doc.setFontSize(9);
        doc.text('ITEM', 16, y);
        doc.text('QTY/WT', pageW - 48, y, { align: 'right' });
        doc.text('RATE', pageW - 28, y, { align: 'right' });
        doc.text('AMT', pageW - 16, y, { align: 'right' });
        y += 4;
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.2);
        doc.line(16, y, pageW - 16, y);
        y += 5;

        // Items
        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        const items = parseReceiptItems(bill);
        items.forEach(item => {
            if (y > 275) { doc.addPage(); y = 15; }
            let n = item.name;
            if (n.length > 15) n = n.substring(0, 13) + '..';
            doc.text(n, 16, y);
            doc.text(String(item.qty), pageW - 48, y, { align: 'right' });
            doc.text(String(item.rate), pageW - 28, y, { align: 'right' });
            doc.text(String(item.amount), pageW - 16, y, { align: 'right' });
            y += 5;
        });

        y += 1;
        doc.line(16, y, pageW - 16, y);
        y += 5;

        // Total weight
        doc.setFont('courier', 'bold');
        doc.setFontSize(10);
        doc.text('Total Wt:', 16, y);
        doc.text(formatWeightForPDF(bill.weight), pageW - 16, y, { align: 'right' });
        y += 8;

        // Total amount
        doc.setFont('courier', 'bold');
        doc.setFontSize(14);
        doc.text('TOTAL:', 16, y);
        doc.text(`Rs. ${Math.floor(bill.total_amount || bill.total || 0)}`, pageW - 16, y, { align: 'right' });
        y += 10;
    });

    // Bottom border
    doc.setDrawColor(203, 213, 225);
    doc.line(14, y, pageW - 14, y);

    return Buffer.from(doc.output('arraybuffer'));
}

async function generateGhostBillsPDFBuffer(targetDate = new Date()) {
    const todayDisplay = format(targetDate, 'dd MMM yyyy');
    const istMidnight = new Date(targetDate);
    istMidnight.setHours(0, 0, 0, 0); 
    const startISO = istMidnight.toISOString();
    const endISO = new Date(istMidnight.getTime() + 86400000).toISOString();

    const { data: ghosts } = await supabase
        .from('unbilled_events').select('*')
        .gte('created_at', startISO)
        .lt('created_at', endISO)
        .order('created_at', { ascending: true });

    const dayGhosts = ghosts || [];
    if (dayGhosts.length === 0) throw new Error('No ghost sales found for today.');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 15;

    // Cover Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 25, 'F');
    doc.setTextColor(239, 68, 68); // Red color for ghost sales
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('SANKET CHICKEN SHOP', pageW / 2, 12, { align: 'center' });
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ghost Sales Batch Export — ${todayDisplay}`, pageW / 2, 19, { align: 'center' });

    y = 35;

    dayGhosts.forEach((ghost) => {
        if (y > 250) { doc.addPage(); y = 15; }

        const ghostTime = ghost.created_at ? format(new Date(ghost.created_at), 'hh:mm:ss a') : '';
        const ghostIdShort = ghost.id.substring(0, 8).toUpperCase();

        // Top border
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.line(14, y, pageW - 14, y);
        y += 6;

        // Receipt header
        doc.setFont('courier', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(239, 68, 68); // Red color
        doc.text(`GHOST EVENT #${ghostIdShort}`, 16, y);
        doc.setFont('courier', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(ghostTime, pageW - 16, y, { align: 'right' });
        y += 8;

        // Details
        doc.setTextColor(15, 23, 42);
        doc.setFont('courier', 'normal');
        doc.setFontSize(10);
        doc.text(`Detected Weight: ${ghost.max_weight || 0} kg`, 16, y);
        y += 6;
        doc.text(`Duration: ${ghost.duration_seconds || 0} seconds`, 16, y);
        y += 8;
    });

    // Bottom border
    doc.setDrawColor(203, 213, 225);
    doc.line(14, y, pageW - 14, y);

    return Buffer.from(doc.output('arraybuffer'));
}

// ═══════════════════════════════════════
//  DAILY PDF REPORT CRON JOB
// ═══════════════════════════════════════

async function generateDailyReportBuffer(targetDate = new Date()) {
    const reportDate = format(targetDate, 'yyyy-MM-dd');
    const todayDisplay = format(targetDate, 'dd MMM yyyy');

    const [{ data: bills }, { data: ghostSales }] = await Promise.all([
        supabase.from('bills').select('*').gte('created_at', reportDate).lt('created_at', format(new Date(targetDate.getTime() + 86400000), 'yyyy-MM-dd')),
        supabase.from('unbilled_events').select('*').gte('created_at', reportDate).lt('created_at', format(new Date(targetDate.getTime() + 86400000), 'yyyy-MM-dd'))
    ]);

    const dayBills = bills || [];
    const dayGhosts = ghostSales || [];
    const paidBills = dayBills.filter(b => b.status === 'paid');
    const unpaidDayBills = dayBills.filter(b => b.status === 'unpaid');
    const totalDaySales = paidBills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const totalDayKg = paidBills.reduce((s, b) => s + (parseFloat(b.weight) || 0), 0);
    const totalDayUnpaid = unpaidDayBills.reduce((s, b) => s + Number(b.total_amount || 0), 0);

    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = 15;

    // Header
    doc.setFillColor(15, 23, 42); // dark header
    doc.rect(0, 0, pageW, 40, 'F');
    doc.setTextColor(34, 197, 94); // green
    doc.setFontSize(22);
    doc.text('SANKET CHICKEN SHOP', pageW / 2, 18, { align: 'center' });
    doc.setTextColor(148, 163, 184); // gray
    doc.setFontSize(11);
    doc.text(`Daily Sales Report — ${todayDisplay}`, pageW / 2, 28, { align: 'center' });

    y = 50;

    // Summary Cards
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('DAILY SUMMARY', 14, y);
    y += 8;

    const summaryData = [
        ['Total Sales (Paid)', `Rs. ${Math.floor(totalDaySales).toLocaleString()}`, `${paidBills.length} bills`],
        ['Total Weight Sold', `${totalDayKg.toFixed(3)} kg`, `${paidBills.length} items`],
        ['Unpaid Outstanding', `Rs. ${Math.floor(totalDayUnpaid).toLocaleString()}`, `${unpaidDayBills.length} bills`],
        ['Ghost Sales Detected', `${dayGhosts.length}`, dayGhosts.length > 0 ? 'Review CCTV!' : 'All Clear'],
    ];

    autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value', 'Details']],
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' }
    });

    y = doc.lastAutoTable.finalY + 15;

    // Transaction Table
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('TRANSACTION DETAILS', 14, y);
    y += 8;

    if (dayBills.length > 0) {
        const tableData = dayBills
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .map((b, i) => [
                i + 1,
                b.created_at ? format(new Date(b.created_at), 'hh:mm a') : '-',
                b.product_name || 'Unknown',
                b.weight ? `${b.weight} kg` : '-',
                `Rs. ${Math.floor(b.total_amount || 0)}`,
                (b.status || 'paid').toUpperCase(),
            ]);

        autoTable(doc, {
            startY: y,
            head: [['#', 'Time', 'Product', 'Weight', 'Amount', 'Status']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
            didParseCell: (data) => {
                if (data.column.index === 5 && data.section === 'body') {
                    if (data.cell.raw === 'PAID') {
                        data.cell.styles.textColor = [34, 197, 94];
                    } else if (data.cell.raw === 'UNPAID') {
                        data.cell.styles.textColor = [239, 68, 68];
                    }
                }
            }
        });

        y = doc.lastAutoTable.finalY + 8;

        // Totals Row
        autoTable(doc, {
            startY: y,
            body: [[
                '',
                '',
                'TOTAL',
                `${totalDayKg.toFixed(3)} kg`,
                `Rs. ${Math.floor(totalDaySales + totalDayUnpaid).toLocaleString()}`,
                `${dayBills.length} bills`,
            ]],
            theme: 'plain',
            bodyStyles: { fontStyle: 'bold', fillColor: [226, 232, 240] }
        });
    }

    if (dayGhosts.length > 0) {
        y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : y + 15;
        doc.setFontSize(13);
        doc.setTextColor(239, 68, 68);
        doc.text('GHOST SALES / SECURITY ALERTS', 14, y);
        y += 8;

        const ghostData = dayGhosts.map((g, i) => [
            i + 1,
            g.created_at ? format(new Date(g.created_at), 'hh:mm:ss a') : '-',
            `${g.max_weight || g.maxWeight || 0} kg`,
            `${g.duration_seconds || g.durationSeconds || 0}s`,
            g.video_url ? 'Yes' : 'No',
        ]);

        autoTable(doc, {
            startY: y,
            head: [['#', 'Time', 'Weight Detected', 'Duration', 'Video']],
            body: ghostData,
            theme: 'grid',
            headStyles: { fillColor: [127, 29, 29], textColor: [255, 255, 255] }
        });
    }

    return Buffer.from(doc.output('arraybuffer'));
}

async function sendPDFToUser(id, pdfBuffer, targetDate = new Date()) {
    const filename = `Sanket-Daily-Report-${format(targetDate, 'dd-MMM-yyyy')}.pdf`;
    try {
        await bot.sendMessage(id, `📊 *येथे ${format(targetDate, 'dd MMM yyyy')} चा संपूर्ण PDF रिपोर्ट आहे:*`, { parse_mode: 'Markdown' });
        await bot.sendDocument(id, pdfBuffer, {
            caption: `Sanket Chicken Shop - ${format(targetDate, 'dd MMM yyyy')}`
        }, {
            filename,
            contentType: 'application/pdf'
        });
    } catch (err) {
        console.error(`Failed to send report to ${id}`, err);
    }
}

// Schedule at 11:00 PM every day (IST timezone enforced)
cron.schedule('0 23 * * *', async () => {
    console.log('Generating daily report for scheduled cron...');
    try {
        const targetDate = new Date();
        const pdfBuffer = await generateDailyReportBuffer(targetDate);
        for (const id of allowedIds) {
            await sendPDFToUser(id, pdfBuffer, targetDate);
        }
    } catch (err) {
        console.error('Error in scheduled PDF:', err);
    }
}, {
    timezone: "Asia/Kolkata"
});

// Manual command to test PDF generation (supports /report yesterday)
bot.onText(/^\/report(?:\s+(.*))?$/, async (msg, match) => {
    const id = msg.chat.id;
    if (!isAuthorized(id)) return;

    let targetDate = new Date();
    if (match[1] && match[1].toLowerCase() === 'yesterday') {
        targetDate.setDate(targetDate.getDate() - 1);
    }

    bot.sendMessage(id, `⏳ Generating PDF report for ${format(targetDate, 'dd MMM yyyy')}...`);
    try {
        const pdfBuffer = await generateDailyReportBuffer(targetDate);
        await sendPDFToUser(id, pdfBuffer, targetDate);
    } catch (err) {
        bot.sendMessage(id, '❌ Failed to generate report.');
        console.error(err);
    }
});

console.log('✅ Sanket Telegram Bot is ONLINE & listening for Ghost Sales!');
