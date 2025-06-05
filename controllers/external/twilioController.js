const StatusLog = require('../../models/statusLog'); // Ensure model exists

exports.handleStatusCallback = async (req, res) => {
  try {
    const {
      MessageSid,
      MessageStatus,
      To,
      ErrorCode,
      ErrorMessage,
      Timestamp = new Date()
    } = req.body;

    await StatusLog.create({
      messageSid: MessageSid,
      status: MessageStatus,
      to: To,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
      timestamp: Timestamp,
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Status Callback Error:', err);
    res.sendStatus(500);
  }
};
