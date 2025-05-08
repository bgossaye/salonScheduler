require('dotenv').config();
console.log("ENV VARS (DEBUG):", process.env);
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const bookingsRouter = require('./routes/bookings');
const hoursRouter = require('./routes/hours');

const app = express();
app.use(cors());
app.use(express.json());

console.log("ENV VARS:", process.env);  // Add this for debugging

console.log('Connecting to:', process.env.MONGO_URI); // Debug line

const uri = process.env.MONGO_URI || "mongodb+srv://bgossaye:5uEz8rWrHHQslQfQ@rakie-cluster.yquetxs.mongodb.net/salon?retryWrites=true&w=majority&appName=rakie-cluster";

mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('Connection error:', err));

app.use('/api/bookings', bookingsRouter);
app.use('/api/store-hours', hoursRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));