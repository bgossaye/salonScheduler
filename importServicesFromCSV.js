const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Service = require('./models/Service');

mongoose.connect('mongodb://localhost:27017/salon', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function run() {
  const filePath = path.join(__dirname, 'Rakie_Salon_Services_with_Steps.csv');
  const csv = fs.readFileSync(filePath, 'utf-8');
  const lines = csv.trim().split('\n').slice(1); // skip header

  const services = lines.map(line => {
    const [category, name, priceStr, durationStr, stepsStr] = line.split(',');
    const steps = stepsStr
      .split('|')
      .map(step => step.trim())
      .filter(Boolean)
      .map(step => ({
        name: step,
        duration: Math.floor(Number(durationStr) / stepsStr.split('|').length)
      }));

    return {
      category: category.trim(),
      name: name.trim(),
      price: Number(priceStr),
      duration: Number(durationStr),
      steps
    };
  });

  try {
    await Service.deleteMany(); // Optional: clear previous entries
    await Service.insertMany(services);
    console.log('✅ Services imported successfully!');
  } catch (err) {
    console.error('❌ Error importing services:', err);
  } finally {
    mongoose.disconnect();
  }
}

run();
