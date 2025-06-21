/**
 * @fileoverview A simple script for immediate, one-off testing of the stock scraper.
 * This script bypasses the main application's scheduler to allow for rapid testing of proxy configurations.
 * It only logs the results to the console and does not send notifications.
 *
 * To use:
 * 1. Ensure your .env file is set up with the PROXY_URL you want to test.
 * 2. Run from the command line: `node test-proxy.js`
 */

// Load environment variables from .env file
require('dotenv').config();

const { fetchStockData } = require('./scraper');
const { KEYWORDS_TO_MONITOR } = require('./config');

async function runTest() {
    console.log('--- Starting Manual Scraper Test ---');

    try {
        console.log('Fetching stock data...');
        const stock = await fetchStockData();

        if (!stock) {
            console.error('Failed to fetch stock data. The scraper returned no data. Check scraper logs for errors.');
            return; // Exit after logging the error
        }

        console.log('Successfully fetched stock data. Checking for monitored items...');

        const allStockItems = [...stock.seedsStock, ...stock.eggStock, ...stock.gearStock];
        const foundItems = allStockItems.filter(item => KEYWORDS_TO_MONITOR.includes(item.name));

        if (foundItems.length === 0) {
            console.log('✅ Test successful: Connection worked, but no monitored items are currently in stock.');
        } else {
            const itemNames = foundItems.map(item => `${item.name} (${item.stock})`).join(', ');
            console.log(`✅ Test successful: Connection worked. 🚨 IN STOCK: ${itemNames}`);
        }

    } catch (error) {
        console.error('An unexpected error occurred during the test:', error.message);
    } finally {
        console.log('--- Test Finished ---');
    }
}

runTest(); 