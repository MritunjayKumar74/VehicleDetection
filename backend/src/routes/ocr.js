const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { readPlate } = require('../services/ocrService');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  try {
    const result = await readPlate(req.file.path);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

module.exports = router;