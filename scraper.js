/**
 * @fileoverview This module is responsible for scraping the stock data from the target website.
 * It uses axios to fetch the HTML and cheerio to parse it, extracting the
 * items from the various stock categories.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { SCRAPER_CONFIG } = require('./config');

/**
 * Fetches the stock data from the configured URL, parses the HTML,
 * and extracts the stock items. It uses a comprehensive set of browser-like
 * headers and an optional proxy (HTTP, HTTPS, or SOCKS) to avoid detection.
 * @returns {Promise<object|null>} A promise that resolves to a structured stock object,
 * or null if fetching or parsing fails. The stock object contains arrays for
 * seedsStock, eggStock, and gearStock.
 */
async function fetchStockData() {
    try {
        console.log(`Attempting to fetch stock data from ${SCRAPER_CONFIG.url.split('/')[2]}...`);

        const axiosConfig = {
            headers: SCRAPER_CONFIG.headers,
            timeout: SCRAPER_CONFIG.timeout,
        };

        if (SCRAPER_CONFIG.proxy) {
            const proxyUrl = SCRAPER_CONFIG.proxy;
            console.log(`Using proxy for request: ${proxyUrl}`);

            if (proxyUrl.startsWith('socks')) {
                // Handle SOCKS proxies
                axiosConfig.httpsAgent = new SocksProxyAgent(proxyUrl);
                axiosConfig.httpAgent = new SocksProxyAgent(proxyUrl);
            } else {
                // Handle HTTP/HTTPS proxies
                const parsedProxy = new URL(proxyUrl);
                axiosConfig.proxy = {
                    protocol: parsedProxy.protocol.replace(':', ''),
                    host: parsedProxy.hostname,
                    port: parseInt(parsedProxy.port, 10),
                };
                if (parsedProxy.username && parsedProxy.password) {
                    axiosConfig.proxy.auth = {
                        username: parsedProxy.username,
                        password: parsedProxy.password
                    };
                }
            }
        }

        const { data: htmlContent } = await axios.get(SCRAPER_CONFIG.url, axiosConfig);

        const $ = cheerio.load(htmlContent);
        const stock = {
            seedsStock: [],
            eggStock: [],
            gearStock: []
        };

        const stockCategories = {
            'SEEDS STOCK': stock.seedsStock,
            'EGG STOCK': stock.eggStock,
            'GEAR STOCK': stock.gearStock,
            'HONEY STOCK': stock.gearStock,
            'COSMETICS STOCK': stock.gearStock
        };

        for (const categoryName in stockCategories) {
            const targetList = stockCategories[categoryName];
            const heading = $(`h2:contains("${categoryName}")`);

            if (heading.length > 0) {
                heading.siblings('ul').first().find('li').each((i, li) => {
                    const itemName = $(li).find('span').first().clone().children().remove().end().text().trim();
                    if (itemName) {
                        targetList.push({ name: itemName });
                    }
                });
            }
        }

        console.log('Successfully fetched and parsed stock data.');
        return stock;

    } catch (error) {
        let errorMessage = `Error fetching or parsing ${SCRAPER_CONFIG.url.split('/')[2]} data:`;
        if (error.code) {
            errorMessage += ` (Code: ${error.code})`;
        }
        console.error(errorMessage, error.message);
        return null;
    }
}

module.exports = { fetchStockData }; 