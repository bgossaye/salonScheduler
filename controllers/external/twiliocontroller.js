const StatusLog = require('../../models/statusLog'); // Ensure model exists

exports.handleStatusCallback = async (req, res) => {

  try {
    console.log('📥 Twilio Status Callback Body:', req.body);
    const {
      MessageSid,
      MessageStatus,
      To,
      From,
      ErrorCode,
      ErrorMessage,
      Timestamp = new Date()
    } = req.body;

    await StatusLog.create({
      messageSid: MessageSid,
      status: MessageStatus,
      to: To,
      from: From,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
      timestamp: Timestamp,
    });
    console.log(`📡 Twilio status update for ${To} → ${MessageStatus}`);

    res.sendStatus(200);
console.log("📥 Twilio Status Callback finished");

  } catch (err) {
    console.error('❌ Status Callback Error:', err);
    res.sendStatus(500);
  }
};
