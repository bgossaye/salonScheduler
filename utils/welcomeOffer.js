const Client = require('../models/client');

const WELCOME_OFFER_CODE = 'NEWCLIENT10';

function appointmentUsesWelcomeOffer(appointment = {}) {
  const couponCode = String(appointment?.couponCode || '').trim().toUpperCase();
  const snapshotCode = String(appointment?.appliedPromotion?.couponCode || '').trim().toUpperCase();
  const dealId = String(appointment?.appliedPromotion?.dealId || '').trim().toUpperCase();
  return couponCode === WELCOME_OFFER_CODE
    || snapshotCode === WELCOME_OFFER_CODE
    || dealId === 'WELCOME_NEWCLIENT10';
}

async function restoreWelcomeOfferForCanceledAppointment(appointment = {}) {
  const clientId = appointment?.clientId?._id || appointment?.clientId;
  const appointmentId = appointment?._id || appointment?.id;
  if (!clientId || !appointmentId || !appointmentUsesWelcomeOffer(appointment)) return false;

  const result = await Client.updateOne(
    {
      _id: clientId,
      'welcomeOffer.code': WELCOME_OFFER_CODE,
      'welcomeOffer.status': 'redeemed',
      'welcomeOffer.appointmentId': appointmentId,
    },
    {
      $set: {
        'welcomeOffer.status': 'available',
        'welcomeOffer.redeemedAt': null,
        'welcomeOffer.appointmentId': null,
      },
    }
  );

  return Number(result?.modifiedCount || 0) > 0;
}

module.exports = {
  WELCOME_OFFER_CODE,
  appointmentUsesWelcomeOffer,
  restoreWelcomeOfferForCanceledAppointment,
};
