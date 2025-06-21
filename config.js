/**
 * @fileoverview This file centralizes all configuration for the application.
 * It loads environment variables from a .env file and exports them as
 * structured objects for other modules to use. This makes the application
 * more modular and easier to configure.
 */

const dotenv = require('dotenv');
dotenv.config();

// --- Application Configuration ---

/**
 * Defines the schedule for when the stock check should run.
 * @type {number[]} - An array of minutes within the hour (0-59).
 */
const TARGET_MINUTES = [2, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51, 56];

/**
 * The second of the minute to trigger the stock check.
 * @type {number} - A second within the minute (0-59).
 */
const TARGET_SECONDS = 30;

/**
 * The timezone for all date and time operations.
 * See https://en.wikipedia.org/wiki/List_of_tz_database_time_zones for a list of valid timezones.
 * @type {string}
 */
const TIMEZONE = "Asia/Jerusalem";

/**
 * The hour (24-hour format) when quiet hours begin. Notifications will be suppressed.
 * @type {number}
 */
const QUIET_HOURS_START = parseInt(process.env.QUIET_HOURS_START || "0", 10);

/**
 * The hour (24-hour format) when quiet hours end. Notifications will resume.
 * @type {number}
 */
const QUIET_HOURS_END = parseInt(process.env.QUIET_HOURS_END || "9", 10);

/**
 * The interval, in milliseconds, at which the main scheduler checks the current time.
 * @type {number}
 */
const SCHEDULER_INTERVAL_MS = 1000;

// --- Twilio Credentials for WhatsApp ---

/**
 * Configuration object for the Twilio client.
 * All values are sourced from environment variables.
 */
const TWILIO_CONFIG = {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappSandboxNumber: process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER,
    recipientWhatsappNumber: process.env.YOUR_WHATSAPP_NUMBER,
};

// --- Keywords to Monitor ---

/**
 * An array of item names to watch for in the stock.
 * This is case-insensitive.
 * @type {string[]}
 */
const KEYWORDS_TO_MONITOR = [
    'Sugar Apple', 'Feijoa', 'Loquat', 'Prickly Pear', 'Bell Pepper',
    'Kiwi', 'Pineapple', 'Bug Egg',
    'Lightning Rod', 'Master Sprinkler',
];

// --- Scraper Configuration ---

/**
 * Configuration for the web scraper.
 * Includes the target URL, HTTP headers to mimic a browser, and a request timeout.
 */
const SCRAPER_CONFIG = {
    url: 'https://vulcanvalues.com/grow-a-garden/stock',
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'DNT': '1',
        'Host': 'vulcanvalues.com',
        'Sec-CH-UA': '"Not/A)Brand";v="99", "Google Chrome";v="125", "Chromium";v="125"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    },
    timeout: 15000,
    proxy: process.env.PROXY_URL || null
};

module.exports = {
    TARGET_MINUTES,
    TARGET_SECONDS,
    TIMEZONE,
    QUIET_HOURS_START,
    QUIET_HOURS_END,
    SCHEDULER_INTERVAL_MS,
    TWILIO_CONFIG,
    KEYWORDS_TO_MONITOR,
    SCRAPER_CONFIG
}; 