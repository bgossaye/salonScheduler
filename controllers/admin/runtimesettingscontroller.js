const {
  getAllRuntimeSettings,
  setRuntimeSetting,
} = require('../../utils/runtimeSettings');

function groupSettings(settings) {
  return settings.reduce((acc, setting) => {
    const group = setting.group || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push(setting);
    return acc;
  }, {});
}

exports.getAll = async (req, res) => {
  try {
    const settings = await getAllRuntimeSettings();
    res.json({ settings, groups: groupSettings(settings) });
  } catch (err) {
    console.error('❌ fetch runtime settings failed', err);
    res.status(500).json({ error: 'Failed to fetch runtime settings' });
  }
};

exports.updateOne = async (req, res) => {
  try {
    const { key } = req.params;
    const value = Object.prototype.hasOwnProperty.call(req.body || {}, 'value')
      ? req.body.value
      : req.body?.enabled;

    const updatedBy = req.admin?.email || req.admin?.id || '';
    const setting = await setRuntimeSetting(key, value, updatedBy);
    res.json({ success: true, setting });
  } catch (err) {
    console.error('❌ update runtime setting failed', err);
    res.status(err.status || 500).json({
      error: err.status === 400 ? err.message : 'Failed to update runtime setting',
      allowedKeys: err.allowedKeys,
    });
  }
};
