const dotenv = require('dotenv');
const axios = require('axios');
const twilio = require('twilio');

dotenv.config();

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
    'Lightning Rod', 'Godly Sprinkler'
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
            }
        });
        if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
            const resultData = response.data[0]?.result?.data?.json;
            if (resultData) {
                return resultData;
            }
            console.error('Could not find the expected JSON data structure in growagarden.gg response.');
        } else {
            console.error(`Failed to fetch data from growagarden.gg. Status: ${response.status || 'Unknown'}`);
        }
    } catch (error) {
        console.error('Error fetching growagarden.gg stock data:', error.message);
        if (error.response) console.error('Error Response Status:', error.response.status);
    }
    return null;
}

// --- Notification Logic ---
let notifiedItemsThisOverallStockCycle = new Set();
let previousOverallStockSignature = "";

// Helper function to FIND keyword items in a category that haven't been notified yet
function findNewKeywordItemsInCategory(items, categoryName, currentKeywords, notifiedItemsSet) {
    const foundItems = [];
    if (!items || items.length === 0) {
        return foundItems;
    }

    for (const item of items) {
        const itemName = item.name;
        if (!itemName) continue;

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
                break; // Found a keyword for this item, move to the next item
            }
        }
    }
    return foundItems;
}

async function checkStockAndNotify() {
    const currentTimestamp = new Date().toLocaleString("en-IL", { timeZone: "Asia/Jerusalem" });
    console.log(`\n[${currentTimestamp}] Checking all Grow A Garden stock...`);

    const stockData = await fetchGrowAGardenStock();

    if (!stockData) {
        console.log("No stock data received or error during fetch. Will retry next cycle.");
        return;
    }

    const allCurrentStockItemsForSignature = [];
    if (stockData.seedsStock) allCurrentStockItemsForSignature.push(...stockData.seedsStock.map(item => item.name + '|Seed'));
    if (stockData.eggStock) allCurrentStockItemsForSignature.push(...stockData.eggStock.map(item => item.name + '|Egg'));
    if (stockData.gearStock) allCurrentStockItemsForSignature.push(...stockData.gearStock.map(item => item.name + '|Gear'));
    const currentOverallStockSignature = allCurrentStockItemsForSignature.sort().join(',');

    if (currentOverallStockSignature !== previousOverallStockSignature) {
        if (previousOverallStockSignature !== "") {
            console.log("Detected a change in overall stock makeup. Resetting notified items history for this new stock cycle.");
        }
        notifiedItemsThisOverallStockCycle.clear();
        previousOverallStockSignature = currentOverallStockSignature;
    }

    const newlyFoundKeywordItems = [];

    if (stockData.seedsStock) {
        newlyFoundKeywordItems.push(...findNewKeywordItemsInCategory(stockData.seedsStock, 'Seed', keywordsToMonitor, notifiedItemsThisOverallStockCycle));
    }
    if (stockData.eggStock) {
        newlyFoundKeywordItems.push(...findNewKeywordItemsInCategory(stockData.eggStock, 'Egg', keywordsToMonitor, notifiedItemsThisOverallStockCycle));
    }
    if (stockData.gearStock) {
        newlyFoundKeywordItems.push(...findNewKeywordItemsInCategory(stockData.gearStock, 'Gear', keywordsToMonitor, notifiedItemsThisOverallStockCycle));
    }

    if (newlyFoundKeywordItems.length > 0) {
        let messageBody = "*GrowAGarden Stock Alert!* 🌱\n\nNew keyword items in stock:\n";
        newlyFoundKeywordItems.forEach(item => {
            messageBody += `\n- *${item.name}* (Category: ${item.category}, Keyword: "${item.matchedKeyword}")`;
            console.log(`SUCCESS: Keyword item "${item.matchedKeyword}" FOUND in ${item.category} stock: ${item.name}`);
        });
        messageBody += `\n\nCheck now: https://www.roblox.com/games/126884695634066/Grow-a-Garden#ropro-quick-play`; // Updated link

        if (twilioClient) {
            try {
                await twilioClient.messages.create({
                    body: messageBody,
                    from: `whatsapp:${twilioWhatsappSandboxNumber}`,
                    to: `whatsapp:${recipientWhatsappNumber}`
                });
                console.log(`Consolidated WhatsApp alert SENT for ${newlyFoundKeywordItems.length} item(s)!`);
                // Add all notified items to the set AFTER successful sending
                newlyFoundKeywordItems.forEach(item => {
                    notifiedItemsThisOverallStockCycle.add(`${item.name}|${item.category}`);
                });
            } catch (error) {
                console.error(`Error sending consolidated WhatsApp alert:`, error.message);
            }
        } else {
            console.warn("Twilio client not configured. Cannot send WhatsApp alert for stock.");
        }
    } else if (allCurrentStockItemsForSignature.length > 0) {
        console.log("No *new* keyword items found needing notification this cycle.");
    } else if (stockData) {
        console.log("Stock data fetched, but monitored categories were empty or not present.");
    }
}

// --- Main Execution ---
if (!twilioClient) {
    console.error("FATAL: Twilio client could not be initialized. Check .env variables. Exiting.");
} else {
    const checkIntervalMinutes = 5;
    console.log("Grow A Garden Stock Notifier started.");
    console.log(`Will check all stock categories every ${checkIntervalMinutes} minutes.`);
    console.log(`Notifications will be sent to ${recipientWhatsappNumber} via WhatsApp.`);

    checkStockAndNotify(); // Initial check
    setInterval(checkStockAndNotify, checkIntervalMinutes * 60 * 1000);
}