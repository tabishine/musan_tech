const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const app = express();
const port = 3000;

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/test').then(() => console.log('Connected!'));
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

// Connect to Redis
const client = redis.createClient();
client.on('error', (err) => console.error('Redis error:', err));

// MongoDB User Schema
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});
const User = mongoose.model('User', userSchema);

// Express middleware to parse JSON
app.use(express.json());

// Register a new user
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  
// Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);
  
// Save user to MongoDB
  const newUser = new User({ username, password: hashedPassword });
  await newUser.save();
  res.status(201).json({ message: 'User registered successfully' });
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
 
 // Find the user in MongoDB
  const user = await User.findOne({ username });
  
// Verify user and password
  if (user && await bcrypt.compare(password, user.password)) {
    
// Generate JWT token
    const token = jwt.sign({ username }, 'secret_key', { expiresIn: '1h' });
   
 // Store token in Redis
    client.set(username, token);
    res.json({ token });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// Logout (remove token from Redis)
app.post('/logout', (req, res) => {
  const { username } = req.body;
  client.del(username, (err, reply) => {
    if (err) {
      console.error('Error deleting token from Redis:', err);
      res.status(500).json({ message: 'Internal Server Error' });
    } else {
      res.json({ message: 'Logout successful' });
    }
  });
});

// Protected route example
app.get('/protected', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  
// Verify token against Redis
  client.get(jwt.decode(token).username, (err, reply) => {
    if (err || !reply || reply !== token) {
      res.status(401).json({ message: 'Unauthorized' });
    } else {
      res.json({ message: 'Protected route accessed successfully' });
    }
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});