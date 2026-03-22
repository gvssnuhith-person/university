import app from './api/index.js';

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`GVS University API running on http://localhost:${PORT}`);
});
