const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
const DIRECTORY = __dirname;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const EXTENSIONS = new Set(['.csv', '.xlsx']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter(_req, file, callback) {
    if (!EXTENSIONS.has(path.extname(file.originalname).toLowerCase())) {
      return callback(new Error('Only CSV and XLSX files are supported.'));
    }
    callback(null, true);
  }
});

app.disable('x-powered-by');
app.use(cors({ origin: process.env.REPROJECT_ALLOWED_ORIGIN || 'http://localhost:5173' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', formats: ['csv', 'xlsx'] }));

function runReprojection(input, output) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_EXECUTABLE || 'python', [
      path.join(DIRECTORY, 'process_file.py'), input, output
    ], { cwd: DIRECTORY, timeout: 30000, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => {
      // Bound logging to avoid collecting a whole customer file on an error.
      stderr += chunk.toString().slice(0, 4096);
      stderr = stderr.slice(-4096);
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error('Reprojection failed (exit ' + code + '): ' + stderr.slice(0, 500)));
    });
  });
}

app.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, error => {
    if (!error) return next();
    const oversized = error.code === 'LIMIT_FILE_SIZE';
    return res.status(oversized ? 413 : 400).json({
      error: oversized ? 'The maximum file size is 10 MB.' : 'Upload a CSV or XLSX file.'
    });
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a file first.' });
  const extension = path.extname(req.file.originalname).toLowerCase();
  const originalBase = path.basename(req.file.originalname, extension);
  const safeBase = originalBase.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'coordinates';
  let workdir = null;

  try {
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'nyc-reproject-'));
    const source = path.join(workdir, 'input' + extension);
    const target = path.join(workdir, 'output' + extension);
    await fs.writeFile(source, req.file.buffer, { flag: 'wx' });
    await runReprojection(source, target);
    res.download(target, safeBase + '_reprojected' + extension, error => {
      void fs.rm(workdir, { recursive: true, force: true });
      if (error && !res.headersSent) res.status(500).json({ error: 'Download failed.' });
    });
  } catch (error) {
    if (workdir) await fs.rm(workdir, { recursive: true, force: true });
    // Do not expose an absolute path, traceback, or customer data.
    console.error('Reprojection failed:', error.message);
    if (!res.headersSent) res.status(422).json({
      error: 'Processing failed. Check the coordinate headers and row values.'
    });
  }
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log('Reprojection API listening on port ' + port));
}

module.exports = app;
