require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('../models/service');

const APPLY = process.argv.includes('--apply');
const OLD_NAMES = ['Eye Brow Tent', 'Eyebrow Tent'];
const NEW_NAME = 'Eyebrow Tint';

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not set. Run this from apps/booking/backend where the .env is available.');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const matches = await Service.find({ name: { $in: OLD_NAMES } })
    .select('_id name category price duration active')
    .lean();

  console.log('');
  console.log(`Found ${matches.length} exact matching service record(s).`);

  for (const row of matches) {
    console.log(
      `  ${row._id} | ${row.name} | ${row.category} | $${row.price} | ${row.duration} min | active=${row.active}`
    );
  }

  if (!matches.length) {
    console.log('Nothing to change.');
    return;
  }

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN ONLY — no database changes were made.');
    console.log('Run again with --apply to rename only these exact matches to "Eyebrow Tint".');
    return;
  }

  const result = await Service.updateMany(
    { name: { $in: OLD_NAMES } },
    { $set: { name: NEW_NAME } }
  );

  console.log('');
  console.log(`Updated ${result.modifiedCount} service record(s) to "${NEW_NAME}".`);

  const after = await Service.find({
    _id: { $in: matches.map((x) => x._id) }
  })
    .select('_id name category price duration active')
    .lean();

  for (const row of after) {
    console.log(
      `  VERIFIED ${row._id} | ${row.name} | ${row.category} | $${row.price} | ${row.duration} min`
    );
  }
}

main()
  .catch((err) => {
    console.error('Eyebrow Tint correction failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_) {}
  });