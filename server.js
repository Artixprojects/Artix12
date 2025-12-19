const express = require('express');
const path = require('path');
const app = express();

// public folder serve karo
app.use(express.static(path.join(__dirname, 'public')));

// root fix (IMPORTANT)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('ARTIX GAMES RUNNING ON PORT', PORT);
});
