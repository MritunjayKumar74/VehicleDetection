const { createWorker } = require('tesseract.js');

async function readPlate(imagePath) {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  });
  const { data } = await worker.recognize(imagePath);
  await worker.terminate();

  const plate = data.text.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return { plate, confidence: data.confidence };
}

module.exports = { readPlate };