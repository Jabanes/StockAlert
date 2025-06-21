/**
 * @fileoverview Main application entry point.
 * This file initializes the server, sets up the scheduler, and orchestrates
 * the stock checking and notification process.
 */

const http = require('http');
const {
    TARGET_MINUTES,
    TARGET_SECONDS,
    TIMEZONE,
    QUIET_HOURS_START,
    QUIET_HOURS_END,
    SCHEDULER_INTERVAL_MS,
    KEYWORDS_TO_MONITOR
} = require('./config');
const { fetchStockData } = require('./scraper');
const { sendWhatsAppAlert, isTwilioInitialized } = require('./notifier');

// --- State Management ---

/**
 * A Set to keep track of items for which a notification has already been sent
 * within the current stock "cycle". A cycle is defined by the unique composition
 * of all items currently in stock. If the overall stock changes, this Set is cleared.
 * The format for entries is: 'itemName|categoryName'
 * @type {Set<string>}
 */
const notifiedItemsThisOverallStockCycle = new Set();

/**
 * Stores a unique signature of all items currently in stock.
 * If this signature changes, it means the stock has been updated (e.g., items added/removed),
 * and we should clear the notifiedItemsThisOverallStockCycle Set.
 * @type {string}
 */
let previousOverallStockSignature = "";

/**
 * A flag to prevent multiple concurrent executions of the stock check.
 * @type {boolean}
 */
let isCheckRunning = false;


// --- Utility Functions ---

/**
 * Gets the current time in the specified timezone.
 * @returns {{hour: number, minute: number, second: number, formatted: string}}
 */
function getCurrentTimeInTimezone() {
    const now = new Date();
    const options = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: TIMEZONE
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    const timeParts = {};
    parts.forEach(({ type, value }) => {
        timeParts[type] = parseInt(value, 10);
    });
    const formatted = `${String(timeParts.hour).padStart(2, '0')}:${String(timeParts.minute).padStart(2, '0')}:${String(timeParts.second).padStart(2, '0')}`;
    return { hour: timeParts.hour, minute: timeParts.minute, second: timeParts.second, formatted };
}


/**
 * Returns a formatted timestamp string for logging.
 * @returns {string} Formatted timestamp (e.g., "21/06/2025, 20:16:30").
 */
function getCurrentTimestamp() {
    const now = new Date();
    return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: TIMEZONE
    }).format(now);
}


/**
 * Checks if the current time is within the defined "quiet hours".
 * @returns {boolean} True if it's currently quiet hours, false otherwise.
 */
function isQuietHours() {
    const { hour } = getCurrentTimeInTimezone();
    if (QUIET_HOURS_START < QUIET_HOURS_END) {
        return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
    } else { // Handles overnight quiet hours (e.g., 22:00 to 07:00)
        return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
    }
}


// --- Core Application Logic ---

/**
 * This is the main operational function of the application.
 * It's designed to be called by the scheduler at the configured times.
 */
async function checkStockAndNotify() {
    if (isCheckRunning) {
        console.log(`[${getCurrentTimestamp()}] Skip check: Previous check is still running.`);
        return;
    }
    isCheckRunning = true;

    try {
        console.log(`[${getCurrentTimestamp()}] Running scheduled stock check...`);
        const stock = await fetchStockData();

        if (!stock) {
            console.log(`[${getCurrentTimestamp()}] No stock data received or error during fetch. Will retry next scheduled cycle.`);
            return;
        }

        const categoryMap = {
            seedsStock: 'Seeds',
            eggStock: 'Egg',
            gearStock: 'Gear/Honey/Cosmetics'
        };

        const allCurrentStockItems = [];
        Object.keys(stock).forEach(catKey => {
            if (stock[catKey] && Array.isArray(stock[catKey])) {
                stock[catKey].forEach(item => {
                    if (item && item.name) {
                        allCurrentStockItems.push(`${item.name}|${categoryMap[catKey]}`);
                    }
                });
            }
        });

        const currentOverallStockSignature = allCurrentStockItems.sort().join(',');

        if (currentOverallStockSignature !== previousOverallStockSignature) {
            console.log(`[${getCurrentTimestamp()}] Detected a change in overall stock. Resetting notified items history.`);
            notifiedItemsThisOverallStockCycle.clear();
            previousOverallStockSignature = currentOverallStockSignature;
        }

        const newlyFoundKeywordItems = [];
        Object.keys(stock).forEach(catKey => {
            if (stock[catKey]) {
                stock[catKey].forEach(item => {
                    if (!item || !item.name) return;
                    const itemIdentifier = `${item.name}|${categoryMap[catKey]}`;
                    if (notifiedItemsThisOverallStockCycle.has(itemIdentifier)) {
                        return; // Already notified for this item in this stock cycle
                    }

                    const lowerCaseItemName = item.name.toLowerCase();
                    const matchedKeyword = KEYWORDS_TO_MONITOR.find(kw => lowerCaseItemName.includes(kw.toLowerCase()));

                    if (matchedKeyword) {
                        console.log(`[${getCurrentTimestamp()}] SUCCESS: Keyword "${matchedKeyword}" FOUND in ${item.name}`);
                        newlyFoundKeywordItems.push({ ...item, category: categoryMap[catKey], matchedKeyword });
                        notifiedItemsThisOverallStockCycle.add(itemIdentifier);
                    }
                });
            }
        });

        if (newlyFoundKeywordItems.length > 0) {
            let messageBody = `*Grow A Garden Stock Alert!* 🌱\n\nNew items in stock:\n`;
            newlyFoundKeywordItems.forEach(item => {
                messageBody += `\n- *${item.name}* (Category: ${item.category})`;
            });

            if (isQuietHours()) {
                console.log(`[${getCurrentTimestamp()}] QUIET HOURS: Notification for ${newlyFoundKeywordItems.length} item(s) suppressed.`);
            } else {
                const success = await sendWhatsAppAlert(messageBody);
                if (success) {
                    console.log(`[${getCurrentTimestamp()}] WhatsApp alert SENT for ${newlyFoundKeywordItems.length} item(s)!`);
                } else {
                    console.error(`[${getCurrentTimestamp()}] Failed to send WhatsApp alert.`);
                }
            }
        } else {
            console.log(`[${getCurrentTimestamp()}] No new keyword items found this cycle.`);
        }

    } catch (error) {
        console.error(`[${getCurrentTimestamp()}] FATAL ERROR within checkStockAndNotify execution:`, error);
    } finally {
        isCheckRunning = false;
    }
}

/**
 * The main scheduler loop that checks the time and triggers the stock check.
 */
function mainScheduler() {
    setInterval(() => {
        const { minute, second } = getCurrentTimeInTimezone();
        if (TARGET_MINUTES.includes(minute) && second === TARGET_SECONDS) {
            checkStockAndNotify();
        }
    }, SCHEDULER_INTERVAL_MS);
}

/**
 * Initializes and starts the application.
 */
function startApp() {
    if (isTwilioInitialized) {
        console.log('Twilio client configured for WhatsApp.');
    } else {
        console.warn('Twilio credentials not fully configured. Notifications will be disabled.');
    }

    // This dummy server is required by Render to consider the service "healthy".
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Stock Notifier is running.\n');
    }).listen(process.env.PORT || 3000, () => {
        console.log('HTTP server started to satisfy Render.com Web Service requirements.');
    });

    console.log('\nInitializing Grow A Garden Stock Notifier...');
    console.log(`Monitoring for keywords: ${KEYWORDS_TO_MONITOR.join(', ')}`);
    console.log(`Target fetch times: Minute pattern ${TARGET_MINUTES.join(',')} at ${TARGET_SECONDS} seconds past the minute (${TIMEZONE}).`);
    console.log(`Quiet hours for notifications: From ${String(QUIET_HOURS_START).padStart(2, '0')}:00 to ${String(QUIET_HOURS_END).padStart(2, '0')}:00 (${TIMEZONE}).`);

    mainScheduler();
    console.log('Scheduler started.');
}

// --- Start the application ---
startApp(); 