/**
 * @fileoverview This module handles all interactions with the Twilio API for sending WhatsApp notifications.
 * It initializes the Twilio client using credentials from the configuration
 * and provides a simple interface for sending alerts.
 */

const twilio = require('twilio');
const { TWILIO_CONFIG } = require('./config');

let twilioClient;
let isInitialized = false;

// Initialize the Twilio client upon module load.
// This check ensures that the client is only created if all necessary credentials are present.
if (TWILIO_CONFIG.accountSid && TWILIO_CONFIG.authToken && TWILIO_CONFIG.whatsappSandboxNumber && TWILIO_CONFIG.recipientWhatsappNumber) {
    try {
        twilioClient = twilio(TWILIO_CONFIG.accountSid, TWILIO_CONFIG.authToken);
        console.log('Twilio client initialized for WhatsApp.');
        isInitialized = true;
    } catch (error) {
        console.error('Twilio initialization failed:', error.message);
    }
} else {
    console.warn('Twilio WhatsApp credentials/numbers not fully set in config.js. WhatsApp notifications will be disabled.');
}

/**
 * Sends a message body to the configured recipient via the Twilio WhatsApp API.
 * @param {string} messageBody The text of the message to send.
 * @returns {Promise<boolean>} A promise that resolves to true if the message was sent successfully, and false otherwise.
 */
async function sendWhatsAppAlert(messageBody) {
    if (!isInitialized || !twilioClient) {
        console.warn('Twilio client not configured. Cannot send WhatsApp alert. Message body:', messageBody);
        return false; // Return false to indicate failure.
    }

    try {
        await twilioClient.messages.create({
            body: messageBody,
            from: `whatsapp:${TWILIO_CONFIG.whatsappSandboxNumber}`,
            to: `whatsapp:${TWILIO_CONFIG.recipientWhatsappNumber}`
        });
        return true; // Indicates success
    } catch (error) {
        console.error('Error sending WhatsApp alert via Twilio:', error.message);
        if (error.response) {
            console.error('Twilio Error Response Status:', error.response.status);
            console.error('Twilio Error Response Data:', error.response.data);
        }
        return false; // Indicates failure
    }
}

/**
 * Exports the notifier functions and state.
 * @property {function} sendWhatsAppAlert - The function to send a WhatsApp message.
 * @property {boolean} isTwilioInitialized - A flag indicating if the Twilio client was successfully initialized.
 * @property {string} recipientWhatsappNumber - The recipient's WhatsApp number.
 */
module.exports = {
    sendWhatsAppAlert,
    isTwilioInitialized: isInitialized,
    recipientWhatsappNumber: TWILIO_CONFIG.recipientWhatsappNumber
}; 