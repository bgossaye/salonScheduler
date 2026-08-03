// AdminNotifications.jsx
import React, { useState, useEffect } from 'react';
import API from '../../api';

const TEMPLATE_TYPES = [
  'pending',
  'confirmation',
  'reminder',
  'thankyou',
  'promotion',
  'announcement',
  'holiday',
  'cancellation',
  'noshow',
  'pin_otp',
  'pin_verified',
  'pin_changed'
];

const defaultMessages = {
  pending: 'Hi {{clientName}}, a confirmation for {{date}} at {{time}} for {{service}} will be sent to you shortly. Thank you',
  
confirmation: 'Hi {{clientName}}, your appointment is confirmed for {{date}} at {{time}}.',
  reminder: 'Hi {{clientName}}, this is a reminder from Rakie Salon for your {{service}} on {{date}} at {{time}}',
  thankyou: 'Hi {{clientName}}, thank you for your visit! We hope to see you again soon.',
  promotion: 'Hi {{clientName}}, Special Offer! Enjoy a limited-time promotion at Rakie Salon. Details inside!',
  announcement: 'Hi {{clientName}}, Announcement from Rakie Salon: {{message}}',
  holiday: 'Hi {{clientName}}, Happy Holidays from Rakie Salon! Wishing you joy and beauty.',
  cancellation: 'Hi {{clientName}}, your appointment on {{date}} at {{time}} has been canceled. Please contact us to reschedule.',
  noshow: 'Hi {{clientName}}, we missed you today at {{time}} on {{date}}. Please contact us to reschedule or update your availability.'
};

const defaultEmailMessages = {
  pending: 'Dear {{clientName}},<br><br>a confirmation for {{date}} at {{time}} for {{service}} will be sent to you shortly..<br><br>Thank you,<br>Rakie Salon',

  confirmation: 'Dear {{clientName}},<br><br>Your appointment is confirmed for {{date}} at {{time}}.<br><br>Thank you,<br>Rakie Salon',
  reminder: 'Dear {{clientName}},<br><br>This is a reminder for your upcoming appointment on {{date}} at {{time}}.<br><br>See you soon!<br>Rakie Salon',
  thankyou: 'Dear {{clientName}},<br><br>Thank you for choosing Rakie Salon. We hope you had a great experience!<br><br>See you next time.',
  promotion: 'Dear {{clientName}},<br><br>Check out our latest promotion: {{message}}<br><br>Book now and save!',
  announcement: 'Dear {{clientName}},<br><br>{{message}}<br><br>Best,<br>Rakie Salon',
  holiday: 'Dear {{clientName}},<br><br>Warm wishes this season from all of us at Rakie Salon. Happy Holidays!',
  cancellation: 'Dear {{clientName}},<br><br>Your appointment scheduled for {{date}} at {{time}} has been canceled.<br><br>Please contact us if you’d like to reschedule.',
  noshow: 'Dear {{clientName}},<br><br>We noticed you missed your appointment on {{date}} at {{time}}.<br><br>Please let us know if you’d like to reschedule. We’d love to see you soon!'
};

export default function AdminNotifications() {
  const [templates, setTemplates] = useState([]);
  const [masterEnabled, setMasterEnabled] = useState(null);
  const [smsClientNameEnabled, setSmsClientNameEnabled] = useState(null);
  const [newSchedule, setNewSchedule] = useState({
    type: 'announcement',
    smsTemplate: '',
    scheduledAt: '',
  });

  useEffect(() => {
    fetchTemplates();
    fetchSmsClientNameSetting();
  }, []);

  const fetchTemplates = async () => {
  try {
    const { data } = await API.get('/admin/notificationsettings');
    console.log("🔄 Fetched settings:", data);

    if ('masterNotificationsEnabled' in data) {
      setMasterEnabled(data.masterNotificationsEnabled);
    } else {
      console.warn("⚠️ Master setting not found in response");
      setMasterEnabled(false); // fallback
    }

    setTemplates(data.templates || []);
  } catch (err) {
    console.error("❌ Failed to fetch notification templates", err);
    setMasterEnabled(false);
    setTemplates([]);
  }
};


  const fetchSmsClientNameSetting = async () => {
    try {
      const { data } = await API.get('/admin/runtime-settings');
      const setting = (data.settings || []).find((item) => item.key === 'sms.clientName.enabled');
      if (setting) setSmsClientNameEnabled(Boolean(setting.value));
    } catch (err) {
      console.warn('⚠️ Could not load SMS client-name runtime setting', err);
      setSmsClientNameEnabled(null);
    }
  };


  const handleChange = (templateType, field, value) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.templateType === templateType ? { ...t, [field]: value } : t
      )
    );
  };

  const handleSave = async (template) => {
    try {
      if (!template.templateType || !template.smsTemplate || !template.emailTemplate) return;

        await API.put(`/admin/notificationsettings/${template.templateType}`, {
        smsTemplate: template.smsTemplate,
        emailTemplate: template.emailTemplate,
        enabled: template.enabled,
      });

      fetchTemplates();
    } catch (err) {
      console.error(`❌ Save failed for ${template.templateType}`, err);
    }
  };

  const handleAddScheduledReminder = async () => {
    if (!newSchedule.smsTemplate || !newSchedule.scheduledAt) return;
    await API.post('/admin/reminders', {
      ...newSchedule,
      type: 'sms',
      status: 'scheduled',
      enabled: true,
    });
    setNewSchedule({ type: 'announcement', smsTemplate: '', scheduledAt: '' });
    fetchTemplates();
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Manage SMS & Email Templates</h2>

      <div className="mb-4 p-3 border border-blue-200 bg-blue-50 text-blue-900 rounded text-sm">
        <strong>SMS client-name setting:</strong>{' '}
        SMS templates may keep <code>{'{{clientName}}'}</code> or <code>{'[clientName]'}</code>, but outgoing SMS includes the name only when
        <strong> Runtime Settings → SMS Content → Use client name in SMS </strong>
        is enabled.
        {' '}Current status:{' '}
        <strong>
          {smsClientNameEnabled === null ? 'Check Runtime Settings' : smsClientNameEnabled ? 'Enabled' : 'Disabled'}
        </strong>.
      </div>

      <div className="mb-6 p-4 border rounded bg-white">
  <label className="text-lg font-semibold block mb-2">Master Notification Switch</label>
  {masterEnabled !== null ? (
    <>
      <input
        type="checkbox"
        checked={masterEnabled}
        onChange={async (e) => {
          const newVal = e.target.checked;
          setMasterEnabled(newVal);
          try {
            await API.put('/admin/notificationsettings/master-toggle', { enabled: newVal });
          } catch (err) {
            console.error("❌ Failed to update master toggle", err);
          }
        }}
        className="mr-2"
      />
      <span>{masterEnabled ? 'Enabled' : 'Disabled'}</span>
    </>
  ) : (
    <div>Loading...</div>
  )}
</div>

      {TEMPLATE_TYPES.map((type) => {
        const tpl = templates.find((t) => t.templateType === type) || {
          templateType: type,
          smsTemplate: defaultMessages[type] || '',
          emailTemplate: defaultEmailMessages[type] || '',
          enabled: true,
        };
        return (
          <div key={type} className="border p-4 mb-4 rounded bg-gray-50">
            <h3 className="text-lg font-semibold capitalize mb-2">{type} Template</h3>
            <input
  type="checkbox"
  checked={tpl.enabled}
  onChange={async (e) => {
    const next = e.target.checked;
    handleChange(tpl.templateType, 'enabled', next);
    // optional: live-save on toggle
    try {
      await API.put(`/admin/notificationsettings/${tpl.templateType}`, {
        smsTemplate: tpl.smsTemplate,
        emailTemplate: tpl.emailTemplate,
        enabled: next,
      });
    } catch (err) {
      console.error('❌ Toggle save failed', err);
    }
  }}
  className="mb-2"
/>

            <label className="block mb-1 font-medium">SMS Template</label>
            <textarea
              rows={3}
              value={tpl.smsTemplate}
              onChange={(e) => handleChange(tpl.templateType, 'smsTemplate', e.target.value)}
              className="w-full border mb-2 p-2"
            />
            <label className="block mb-1 font-medium">Email Template</label>
            <textarea
              rows={3}
              value={tpl.emailTemplate}
              onChange={(e) => handleChange(tpl.templateType, 'emailTemplate', e.target.value)}
              className="w-full border mb-2 p-2"
            />
            <button
              onClick={() => handleSave(tpl)}
              className="bg-blue-600 text-white px-4 py-1 rounded"
            >
              Save {type} Template
            </button>
          </div>
        );
      })}

      <h2 className="text-xl font-bold mt-8 mb-2">Schedule New Announcement</h2>
      <div className="border p-4 bg-gray-100 rounded">
        <label className="block font-medium mb-1">Type</label>
        <select
          value={newSchedule.type}
          onChange={(e) => setNewSchedule({ ...newSchedule, type: e.target.value })}
          className="border p-2 w-full mb-2"
        >
          <option value="announcement">Announcement</option>
          <option value="holiday">Holiday</option>
          <option value="promotion">Promotion</option>
        </select>

        <label className="block font-medium mb-1">Scheduled At</label>
        <input
          type="datetime-local"
          value={newSchedule.scheduledAt}
          onChange={(e) => setNewSchedule({ ...newSchedule, scheduledAt: e.target.value })}
          className="border p-2 w-full mb-2"
        />

        <label className="block font-medium mb-1">SMS Message</label>
        <textarea
          rows={3}
          value={newSchedule.smsTemplate}
          onChange={(e) => setNewSchedule({ ...newSchedule, smsTemplate: e.target.value })}
          className="border p-2 w-full mb-4"
        />

        <button
          onClick={handleAddScheduledReminder}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Add Scheduled Reminder
        </button>
      </div>
    </div>
  );
}
