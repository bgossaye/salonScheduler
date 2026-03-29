const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Admin = require('../../models/admin');

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({
      $or: [
        { email: email },
        { username: email }
      ]
    });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin._id, role: 'admin', email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token });
  } catch (err) {
    console.error('🔥 Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.register = async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const admin = new Admin({ email, password: hashed });
    await admin.save();
    res.status(201).json({ message: 'Admin created' });
  } catch (err) {
    console.error('🔥 Registration error:', err);
    res.status(400).json({ error: 'Registration failed' });
  }
};
