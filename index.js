const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { supabase } = require('./supabase');
const { format, startOfDay, endOfDay, subDays } = require('date-fns');
require('dotenv').config();

const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox'],
    }
});

client.on('qr', (qr) => {
    console.log('--- SCAN THIS QR CODE WITH WHATSAPP ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Sanket WhatsApp Bot is READY!');

    // Start listening for Ghost Sales in real-time
    subscribeToGhostSales();
});

// Real-time subscription for Ghost Sales
function subscribeToGhostSales() {
    const channel = supabase
        .channel('ghost_sales_whatsapp')
        .on('postgres_changes', { event: 'INSERT', table: 'ghost_sales' }, (payload) => {
            const ghost = payload.new;
            sendGhostAlert(ghost);
        })
        .subscribe();
}

async function sendGhostAlert(ghost) {
    if (!adminNumber) return;

    const date = format(new Date(ghost.created_at), 'dd MMM yyyy');
    const time = format(new Date(ghost.created_at), 'hh:mm:ss a');
    const weight = ghost.maxweight || 0;

    const message = `🚨 *GHOST SALE DETECTED!* 🚨\n\n` +
        `📅 *Date:* ${date}\n` +
        `⏰ *Time:* ${time}\n` +
        `⚖️ *Weight:* ${weight} kg\n\n` +
        `_Please review the security footage immediately._`;

    try {
        await client.sendMessage(adminNumber, message);
        console.log('Ghost alert sent to WhatsApp!');
    } catch (err) {
        console.error('Error sending WhatsApp message:', err);
    }
}

client.on('message', async (msg) => {
    const text = msg.body.toLowerCase();

    if (text === 'menu' || text === 'hi' || text === 'stats') {
        const welcome = `🐔 *Sanket Chicken Shop Bot* 🐔\n\n` +
            `Hello! Please choose an option:\n\n` +
            `1️⃣ *Today's Sales Summary*\n` +
            `2️⃣ *Today's Total Weight (Kg)*\n` +
            `3️⃣ *Unpaid Outstanding Amount*\n` +
            `4️⃣ *Today's Ghost Sale Count*\n\n` +
            `_Reply with the number to get info._`;
        msg.reply(welcome);
    }
    else if (text === '1') {
        const stats = await getSalesSummary();
        msg.reply(stats);
    }
    else if (text === '2') {
        const weight = await getTotalWeight();
        msg.reply(weight);
    }
    else if (text === '3') {
        const unpaid = await getUnpaidOutstanding();
        msg.reply(unpaid);
    }
    else if (text === '4') {
        const ghostCount = await getGhostCount();
        msg.reply(ghostCount);
    }
});

// Data fetching helpers
async function getSalesSummary() {
    const today = startOfDay(new Date()).toISOString();
    const { data, error } = await supabase
        .from('bills')
        .select('total_amount')
        .gte('created_at', today);

    if (error) return "❌ Error fetching sales data.";

    const total = data.reduce((acc, curr) => acc + (curr.total_amount || 0), 0);
    return `💰 *Today's Total Sales:* ₹${total.toFixed(0)}`;
}

async function getTotalWeight() {
    const today = startOfDay(new Date()).toISOString();
    const { data, error } = await supabase
        .from('bills')
        .select('weight')
        .gte('created_at', today);

    if (error) return "❌ Error fetching weight data.";

    const total = data.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);
    return `⚖️ *Today's Total Weight Sold:* ${total.toFixed(3)} kg`;
}

async function getUnpaidOutstanding() {
    const { data, error } = await supabase
        .from('bills')
        .select('total_amount')
        .eq('status', 'unpaid');

    if (error) return "❌ Error fetching unpaid data.";

    const total = data.reduce((acc, curr) => acc + (curr.total_amount || 0), 0);
    return `🧾 *Total Unpaid Outstanding:* ₹${total.toFixed(0)}`;
}

async function getGhostCount() {
    const today = startOfDay(new Date()).toISOString();
    const { count, error } = await supabase
        .from('ghost_sales')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today);

    if (error) return "❌ Error fetching ghost sale count.";
    return `👻 *Today's Ghost Sales:* ${count}`;
}

client.initialize();
