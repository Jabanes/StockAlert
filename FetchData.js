const dotenv = require('dotenv');
const axios = require('axios');
const twilio = require('twilio');
const http = require('http');

// --- Global Unhandled Exception/Rejection Handlers ---
process.on('uncaughtException', (error, origin) => {
    console.error('!!!!!!!!!! UNCAUGHT EXCEPTION !!!!!!!!!!!');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Error:', error);
    console.error('Origin:', origin);
    process.exit(1); // Exit for Render to attempt a restart
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('!!!!!!!!!! UNHANDLED PROMISE REJECTION !!!!!!!!!!!');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Promise:', promise);
    console.error('Reason:', reason);
    // Depending on the nature, you might consider exiting: process.exit(1);
});

dotenv.config();

// --- Application Configuration ---
const TARGET_MINUTES = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]; // Fetch when current minute is one of these
const TARGET_SECONDS = 30; // And current second is this
const TIMEZONE = "Asia/Jerusalem";
const QUIET_HOURS_START = parseInt(process.env.QUIET_HOURS_START || "0", 10); // 0 for 00:00 (midnight)
const QUIET_HOURS_END = parseInt(process.env.QUIET_HOURS_END || "9", 10);     // 9 for 09:00 (up to 08:59:59)
const SCHEDULER_INTERVAL_MS = 1000; // Check time every 1 second

// --- Twilio Credentials for WhatsApp ---
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioWhatsappSandboxNumber = process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER;
const recipientWhatsappNumber = process.env.YOUR_WHATSAPP_NUMBER;

let twilioClient;
if (twilioAccountSid && twilioAuthToken && twilioWhatsappSandboxNumber && recipientWhatsappNumber) {
    twilioClient = twilio(twilioAccountSid, twilioAuthToken);
    console.log('Twilio client initialized for WhatsApp.');
} else {
    console.warn('Twilio WhatsApp credentials/numbers not fully set in .env file. WhatsApp notifications will be disabled.');
}

// --- Keywords to Monitor ---
const keywordsToMonitor = [
    'Dragon Fruit', 'Mango', 'Grape', 'Mushroom', 'Pepper',
    'Cacao', 'Beanstalk', 'Bug Egg', 'Legendary Egg', 'Mythical Egg',
    'Lightning Rod'
];
console.log(`Monitoring for keywords: ${keywordsToMonitor.join(', ')}`);

// --- Grow A Garden API Fetching ---
const growAGardenApiUrl = 'https://growagarden.gg/api/ws/stocks.getAll?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D';

async function fetchGrowAGardenStock() {
    console.log('Attempting to fetch all stock data from growagarden.gg...');
    try {
        const response = await axios.get(growAGardenApiUrl, {
            headers: {
                'Referer': 'https://growagarden.gg/stocks',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000 // 10 second timeout
        });
        if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
            const resultData = response.data[0]?.result?.data?.json;
            if (resultData) {
                console.log('Successfully fetched and parsed stock data from growagarden.gg.');
                return resultData;
            }
            console.error('Could not find the expected JSON data structure in growagarden.gg response.');
        } else {
            console.error(`Failed to fetch data from growagarden.gg. Status: ${response.status || 'Unknown'}`);
        }
    } catch (error) {
        console.error('Error fetching growagarden.gg stock data:', error.message);
        if (error.response) {
            console.error('Error Response Status:', error.response.status);
            console.error('Error Response Data:', JSON.stringify(error.response.data).substring(0, 200) + '...'); // Log snippet
        } else if (error.request) {
            console.error('Error Request Data: No response received.');
        } else {
            console.error('Error Message:', error.message);
        }
    }
    return null;
}

// --- State Variables for Stock Change Detection ---
let notifiedItemsThisOverallStockCycle = new Set();
let previousOverallStockSignature = "";

// --- Helper Functions ---
function getCurrentTimeInJerusalem() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', { // Use en-GB for dd/mm/yyyy format parts
        timeZone: TIMEZONE,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        // weekday: 'short' // For logging if needed
    });

    const parts = formatter.formatToParts(now);
    const time = {};
    parts.forEach(part => {
        if (part.type !== 'literal') {
            time[part.type] = part.value; // Keep as string for formatting, parse for logic
        }
    });
    
    // For consistent Date object representation of current Jerusalem time
    // Note: month is 0-indexed for Date constructor, parts.month is 1-indexed.
    const dateObject = new Date(
        parseInt(time.year), 
        parseInt(time.month) - 1, 
        parseInt(time.day),
        parseInt(time.hour), 
        parseInt(time.minute), 
        parseInt(time.second)
    );

    return {
        hour: parseInt(time.hour),
        minute: parseInt(time.minute),
        second: parseInt(time.second),
        day: parseInt(time.day),
        month: parseInt(time.month),
        year: parseInt(time.year),
        formatted: `${time.day}/${time.month}/${time.year}, ${time.hour}:${time.minute}:${time.second}`,
        dateObject: dateObject
    };
}

function isQuietHours(currentTime) {
    const currentHour = currentTime.hour;
    if (currentHour >= QUIET_HOURS_START && currentHour < QUIET_HOURS_END) {
        return true;
    }
    return false;
}

function findNewKeywordItemsInCategory(items, categoryName, currentKeywords, notifiedItemsSet) {
    const foundItems = [];
    if (!items || !Array.isArray(items) || items.length === 0) {
        return foundItems;
    }
    for (const item of items) {
        if (!item || typeof item.name !== 'string') {
            // console.warn(`FIND_ITEMS: Skipping malformed item in ${categoryName}:`, item);
            continue;
        }
        const itemName = item.name;
        const itemKeyForNotification = `${itemName}|${categoryName}`;
        const itemNameLower = itemName.toLowerCase();
        for (const keyword of currentKeywords) {
            if (itemNameLower.includes(keyword.toLowerCase())) {
                if (!notifiedItemsSet.has(itemKeyForNotification)) {
                    foundItems.push({
                        name: itemName,
                        category: categoryName,
                        matchedKeyword: keyword
                    });
                }
                break; // Found a keyword for this item, no need to check other keywords
            }
        }
    }
    return foundItems;
}

// --- Core Logic: Check Stock and Notify ---
async function checkStockAndNotify(currentTimeDetails) {
    console.log(`\n[${currentTimeDetails.formatted} ${TIMEZONE}] Running scheduled stock check...`);
    const stockData = await fetchGrowAGardenStock();

    if (!stockData) {
        console.log(`[${currentTimeDetails.formatted}] No stock data received or error during fetch. Will retry next scheduled cycle.`);
        return;
    }

    const allCurrentStockItemsForSignature = [];
    // Safer Signature Generation
    const categories = ['seedsStock', 'eggStock', 'gearStock'];
    const categoryMap = { seedsStock: 'Seed', eggStock: 'Egg', gearStock: 'Gear' };

    categories.forEach(catKey => {
        if (stockData[catKey] && Array.isArray(stockData[catKey])) {
            stockData[catKey].forEach(item => {
                if (item && typeof item.name === 'string') {
                    allCurrentStockItemsForSignature.push(item.name + '|' + categoryMap[catKey]);
                } else {
                    console.warn(`SIGNATURE_GEN: Skipping malformed item in ${catKey}:`, item);
                }
            });
        }
    });

    const currentOverallStockSignature = allCurrentStockItemsForSignature.sort().join(',');

    if (currentOverallStockSignature !== previousOverallStockSignature) {
        if (previousOverallStockSignature !== "") {
            console.log(`[${currentTimeDetails.formatted}] Detected a change in overall stock makeup. Resetting notified items history for this new stock cycle.`);
        } else {
            console.log(`[${currentTimeDetails.formatted}] Initial stock signature generated.`);
        }
        notifiedItemsThisOverallStockCycle.clear();
        previousOverallStockSignature = currentOverallStockSignature;
    }

    const newlyFoundKeywordItems = [];
    categories.forEach(catKey => {
        if (stockData[catKey]) {
            newlyFoundKeywordItems.push(...findNewKeywordItemsInCategory(stockData[catKey], categoryMap[catKey], keywordsToMonitor, notifiedItemsThisOverallStockCycle));
        }
    });

    if (newlyFoundKeywordItems.length > 0) {
        let messageBody = `*GrowAGarden Stock Alert!* 🌱 (${currentTimeDetails.formatted} ${TIMEZONE})\n\nNew keyword items in stock:\n`;
        newlyFoundKeywordItems.forEach(item => {
            messageBody += `\n- *${item.name}* (Category: ${item.category}, Keyword: "${item.matchedKeyword}")`;
            console.log(`[${currentTimeDetails.formatted}] SUCCESS: Keyword item "${item.matchedKeyword}" FOUND in ${item.category} stock: ${item.name}`);
        });
        messageBody += `\n\nCheck now: https://www.roblox.com/games/126884695634066/Grow-a-Garden#ropro-quick-play`;

        // Add items to notified set *before* checking quiet hours or sending
        // This ensures they are marked "processed" for this stock signature, even if notification is suppressed.
        newlyFoundKeywordItems.forEach(item => {
            notifiedItemsThisOverallStockCycle.add(`${item.name}|${item.category}`);
        });

        if (isQuietHours(currentTimeDetails)) {
            console.log(`[${currentTimeDetails.formatted}] QUIET HOURS: Notification for ${newlyFoundKeywordItems.length} item(s) suppressed. Items marked as notified for this cycle.`);
            console.log(`[${currentTimeDetails.formatted}] Suppressed Message Body: ${messageBody}`);
        } else {
            if (twilioClient) {
                try {
                    await twilioClient.messages.create({
                        body: messageBody,
                        from: `whatsapp:${twilioWhatsappSandboxNumber}`,
                        to: `whatsapp:${recipientWhatsappNumber}`
                    });
                    console.log(`[${currentTimeDetails.formatted}] Consolidated WhatsApp alert SENT for ${newlyFoundKeywordItems.length} item(s)!`);
                } catch (error) {
                    console.error(`[${currentTimeDetails.formatted}] Error sending consolidated WhatsApp alert:`, error.message);
                    if (error.response) {
                        console.error('Twilio Error Response Status:', error.response.status);
                        console.error('Twilio Error Response Data:', error.response.data);
                    }
                }
            } else {
                console.warn(`[${currentTimeDetails.formatted}] Twilio client not configured. Cannot send WhatsApp alert. Message body:`, messageBody);
            }
        }
    } else if (allCurrentStockItemsForSignature.length > 0) {
        console.log(`[${currentTimeDetails.formatted}] No *new* keyword items found needing notification this cycle.`);
    } else if (stockData) {
        console.log(`[${currentTimeDetails.formatted}] Stock data fetched, but monitored categories were empty or not present.`);
    }
}

// --- Main Scheduler ---
let isCheckRunning = false; // Simple lock to prevent overlapping checks if one takes too long

async function mainScheduler() {
    const currentTime = getCurrentTimeInJerusalem();
    // console.log(`[${currentTime.formatted}] Scheduler check. Target M: ${TARGET_MINUTES.join(',')}, S: ${TARGET_SECONDS}. Current M: ${currentTime.minute}, S: ${currentTime.second}`); // Verbose log

    if (TARGET_MINUTES.includes(currentTime.minute) && currentTime.second === TARGET_SECONDS) {
        if (isCheckRunning) {
            console.warn(`[${currentTime.formatted}] SKIPPING check: Previous check still running.`);
            return;
        }
        isCheckRunning = true;
        try {
            await checkStockAndNotify(currentTime);
        } catch (error) {
            console.error(`[${currentTime.formatted}] FATAL ERROR within checkStockAndNotify execution:`, error);
            // The global uncaughtException handler should also catch this if it bubbles up,
            // but good to log context here too.
        } finally {
            isCheckRunning = false;
        }
    }
}

// --- Initial Setup and Start ---
function initialize() {
    console.log("Initializing Grow A Garden Stock Notifier...");
    console.log(`Target fetch times: Minute pattern ${TARGET_MINUTES.join(',')} at ${TARGET_SECONDS} seconds past the minute (${TIMEZONE}).`);
    console.log(`Quiet hours for notifications: From ${String(QUIET_HOURS_START).padStart(2, '0')}:00 to ${String(QUIET_HOURS_END).padStart(2, '0')}:00 (${TIMEZONE}).`);

    if (!twilioClient && !(twilioAccountSid && twilioAuthToken && twilioWhatsappSandboxNumber && recipientWhatsappNumber)) {
        console.error("FATAL: Twilio client could not be initialized due to missing .env variables. Ensure all TWILIO_* and YOUR_WHATSAPP_NUMBER variables are set.");
    } else if (!twilioClient) {
        console.warn("Twilio client was not initialized (likely due to previous console warnings). WhatsApp notifications will be disabled, but the stock checker will still run.");
    }

    if (recipientWhatsappNumber && twilioClient) {
        console.log(`Notifications will be sent to ${recipientWhatsappNumber} via WhatsApp (outside of quiet hours).`);
    } else {
        console.log(`Recipient WhatsApp number not set or Twilio client not active. NO WhatsApp notifications will be sent.`);
    }

    // Start the scheduler
    setInterval(mainScheduler, SCHEDULER_INTERVAL_MS);
    console.log(`Scheduler started. Will check time every ${SCHEDULER_INTERVAL_MS / 1000} second(s).`);

    // Optional: Perform an immediate check on startup if desired,
    // or let the scheduler pick up the first valid time.
    // For example, to run once on startup (useful for testing):
    // const nowForStartup = getCurrentTimeInJerusalem();
    // console.log(`Performing initial check on startup at [${nowForStartup.formatted}]...`);
    // checkStockAndNotify(nowForStartup);
}

// --- Minimal HTTP Server to Satisfy Render Web Service Requirement ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), lastCheckAttempt: 'See console logs' }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Grow A Garden Stock Notifier background service is running. Visit /health for status.\n');
    }
});

server.listen(PORT, () => {
    console.log(`HTTP server started and listening on port ${PORT} to satisfy Render.com Web Service requirements.`);
    initialize(); // Start the main application logic after the server starts
});