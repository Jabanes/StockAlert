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
    'Godly Sprinkler'
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
                return resultData; // Contains { gearStock, eggStock, seedsStock, ... }
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
let notifiedItemsThisOverallStockCycle = new Set(); // Tracks items notified since the last major stock change
let previousOverallStockSignature = ""; // Signature of all items to detect a major stock refresh

// Helper function to process a specific category of items
async function processCategoryForKeywords(items, categoryName, currentKeywords, notifiedItemsSet) {
    if (!items || items.length === 0) {
        // console.log(`No items in ${categoryName} stock to process this cycle.`);
        return false;
    }

    let keywordFoundInCategoryThisCycle = false;
    for (const item of items) {
        const itemName = item.name;
        if (!itemName) continue;

        const itemKeyForNotification = `${itemName}|${categoryName}`; // Unique key per item per category

        const itemNameLower = itemName.toLowerCase();
        for (const keyword of currentKeywords) {
            if (itemNameLower.includes(keyword.toLowerCase())) {
                if (!notifiedItemsSet.has(itemKeyForNotification)) {
                    keywordFoundInCategoryThisCycle = true;
                    console.log(`SUCCESS: Keyword item "${keyword}" FOUND in ${categoryName} stock: ${itemName}`);
                    
                    const notificationMessageWhatsapp = `*Grow a Garden Stock Alert!* 🌱\n\nCategory: ${categoryName}\nItem: *${itemName}*\n\nNow available: https://www.roblox.com/games/126884695634066/Grow-a-Garden#ropro-quick-play`;

                    if (twilioClient) {
                        try {
                            await twilioClient.messages.create({
                                body: notificationMessageWhatsapp,
                                from: `whatsapp:${twilioWhatsappSandboxNumber}`,
                                to: `whatsapp:${recipientWhatsappNumber}`
                            });
                            console.log(`WhatsApp alert SENT for ${itemName} (${categoryName})!`);
                            notifiedItemsSet.add(itemKeyForNotification); 
                        } catch (error) {
                            console.error(`Error sending WhatsApp alert for ${itemName} (${categoryName}):`, error.message);
                        }
                    } else {
                        console.warn("Twilio client not configured. Cannot send WhatsApp alert for stock.");
                    }
                }
                break; // Found a keyword for this item, move to the next item in this category
            }
        }
    }
    return keywordFoundInCategoryThisCycle;
}

async function checkStockAndNotify() {
    const currentTimestamp = new Date().toLocaleString("en-IL", { timeZone: "Asia/Jerusalem" }); // Using your local time
    console.log(`\n[${currentTimestamp}] Checking all Grow A Garden stock...`);
    
    const stockData = await fetchGrowAGardenStock();

    if (!stockData) {
        console.log("No stock data received or error during fetch. Will retry next cycle.");
        return;
    }

    // Create a signature for the entire current stock to detect overall changes
    const allCurrentStockItemsForSignature = [];
    if (stockData.seedsStock) allCurrentStockItemsForSignature.push(...stockData.seedsStock.map(item => item.name + '|Seed'));
    if (stockData.eggStock) allCurrentStockItemsForSignature.push(...stockData.eggStock.map(item => item.name + '|Egg'));
    if (stockData.gearStock) allCurrentStockItemsForSignature.push(...stockData.gearStock.map(item => item.name + '|Gear'));
    // Add other stock types to signature if you monitor them
    const currentOverallStockSignature = allCurrentStockItemsForSignature.sort().join(',');

    if (currentOverallStockSignature !== previousOverallStockSignature) {
        if (previousOverallStockSignature !== "") { // Avoid logging this on the very first run
            console.log("Detected a change in overall stock makeup. Resetting notified items history for this new stock cycle.");
        }
        notifiedItemsThisOverallStockCycle.clear();
        previousOverallStockSignature = currentOverallStockSignature;
    } else if (allCurrentStockItemsForSignature.length > 0) {
        // console.log("Overall stock makeup appears unchanged. Will only notify for new keyword items not yet alerted in this cycle.");
    }

    let anyKeywordsFoundThisRun = false;

    // Process all categories every 5 minutes
    if (stockData.seedsStock) {
        if (await processCategoryForKeywords(stockData.seedsStock, 'Seed', keywordsToMonitor, notifiedItemsThisOverallStockCycle)) {
            anyKeywordsFoundThisRun = true;
        }
    }
    if (stockData.eggStock) {
        if (await processCategoryForKeywords(stockData.eggStock, 'Egg', keywordsToMonitor, notifiedItemsThisOverallStockCycle)) {
            anyKeywordsFoundThisRun = true;
        }
    }
    if (stockData.gearStock) {
         if (await processCategoryForKeywords(stockData.gearStock, 'Gear', keywordsToMonitor, notifiedItemsThisOverallStockCycle)) {
            anyKeywordsFoundThisRun = true;
        }
    }
    // Add processing for other stock types from stockData if needed

    if (!anyKeywordsFoundThisRun && allCurrentStockItemsForSignature.length > 0) {
        console.log("No new keyword items found needing notification this cycle.");
    } else if (allCurrentStockItemsForSignature.length === 0 && stockData) { // Check if stockData was fetched but categories were empty
        console.log("Stock data fetched, but monitored categories (seeds, eggs, gear) were empty or not present.");
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
    
    checkStockAndNotify(); // Initial check when the script starts
    setInterval(checkStockAndNotify, checkIntervalMinutes * 60 * 1000); // Check every 5 minutes
}