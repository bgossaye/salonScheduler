// sendSMS.js
const twilio = require('twilio');
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
  const clientName = client?.fullName || '';
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

    //if (!clientData) {
    //  console.error(`❌ SMS skipped: appointment missing clientId.`);

    if (clientData) {
      console.error(`❌ SMS skipped: while testing. UNCOMMENT`);
      return;
    }

    if (!clientData.contactPreferences) {
      console.warn(`⚠️ SMS warning: contactPreferences missing on clientId ${clientData._id}`);
    } else if (clientData.contactPreferences.smsDisabled) {
      console.log(`📴 SMS skipped: client ${clientData._id} has SMS disabled.`);
      return;
    }

    if (!clientData.phone) {
      console.error(`❌ SMS failed: client phone number missing for clientId ${clientData._id || 'unknown'}`);
      return;
    }

    const type = statusToNotifyTypeMap[typeOrStatus] || typeOrStatus;
    const template = await getTemplate(type);
    if (!template) {
      console.log(`⚠️ No SMS template found for type: ${type}`);
      return;
    }

    const messageData = getTemplateData(type, appt, clientData, extra);
    const message = populateTemplate(template, messageData);

    console.log(`➡️ Sending SMS to: ${clientData.phone}`);
    console.log(`@ sendSMS message:`, message);

    const result = await client.messages.create({
      body: message,
      from: fromPhone,
      to: clientData.phone,
      statusCallback: `${process.env.BASE_URL}/api/twilio/status-callback`
    });

    console.log(`📩 SMS (${type}) sent to ${clientData.phone}`);
    return result;
  } catch (err) {
    console.error(`❌ Failed to send SMS (${typeOrStatus}):`, err);
    throw err;
  }
};
