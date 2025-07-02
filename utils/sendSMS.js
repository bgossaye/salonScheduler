// sendSMS.js
require('dotenv').config();
const twilio = require('twilio');
const NotificationSettings = require('../models/notificationSettings');
const { getTemplate } = require('../utils/templateManager');
const { formatDate, formatTime } = require('./formatHelpers');
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
const fromPhone = process.env.TWILIO_PHONE;

const statusToNotifyTypeMap = {
  booked: 'confirmation',
  completed: 'thankyou',
  canceled: 'cancelation',
  noshow: 'noshow'
};

const getTemplateData = (type, appt, client, extra = {}) => {
  const date = formatDate(appt.date);
  const time = formatTime(appt.time);
  const clientName = `${client?.firstName || ''} ${client?.lastName || ''}`.trim();
  const message = extra.message || '';

  return {
    '{{clientName}}': clientName,
    '{{date}}': date,
    '{{time}}': time,
    '{{message}}': message
  };
};

const populateTemplate = (template, dataMap) => {
  let result = template;
  for (const key in dataMap) {
    result = result.replace(new RegExp(key, 'g'), dataMap[key]);
  }
  return result;
};

module.exports = async function sendSMS(typeOrStatus, appt, extra = {}) {

    try {
    const clientData = appt.clientId;
    if (!clientData) {
      console.error(`❌ SMS skipped: appointment missing clientId.`);
      }

      const settings = await NotificationSettings.findOne();

      if (!settings?.masterNotificationsEnabled) {
          console.log(`📴 Global SMS disabled)`);
          return;
      }

      const type = statusToNotifyTypeMap[typeOrStatus] || typeOrStatus;
      const templateEnabled = settings?.[type]?.enabled;

      if (!templateEnabled) {
          console.log(`📴 SMS type "${type}" is disabled in notification settings.`);
          return;
      }

      if (clientData.contactPreferences?.smsDisabled) {
          console.log(`📴 SMS skipped: client ${clientData._id} has opted out of SMS.`);
          return;
      }


    const template = await getTemplate(type);
    if (!template) {
      console.log(`⚠️ No SMS template found for type: ${type}`);
      return;
    }

    const messageData = getTemplateData(type, appt, clientData, extra);
    const message = populateTemplate(template, messageData);


        let toPhone = clientData.phone?.trim();

        // If number doesn't start with '+', assume it's US and prepend +1
        if (toPhone && !toPhone.startsWith('+')) {
            toPhone = '+1' + toPhone.replace(/\D/g, '');
        }

        if (!/^\+\d{10,15}$/.test(toPhone)) {
            console.error(`❌ Invalid phone number format for SMS: ${toPhone}`);
            return;
        }
        console.log(`➡️ Sending SMS to: `, toPhone);
        console.log(`@ sendSMS message:`, message);

        const result = await client.messages.create({
            body: message,
            from: fromPhone,
            to: toPhone,
            statusCallback: `${process.env.BACKEND_BASE_URL}/api/twilio/status-callback`
        });



    console.log(`📩 SMS (${type}) sent to ${clientData.phone}`);
    return result;
  } catch (err) {
    console.error(`❌ Failed to send SMS (${typeOrStatus}):`, err);
    throw err;
  }
};
