import React, { useState } from 'react';
import './App.css';
import nycDotLogo from './assets/nyc_dot_logo.png';

const MAX_BYTES = 10 * 1024 * 1024;
const supported = /\.(csv|xlsx)$/i;

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setSuccess(false);
    setError(null);
    setProgress(0);
    if (next && (!supported.test(next.name) || next.size > MAX_BYTES)) {
      setError('Use a CSV or XLSX file no larger than 10 MB.');
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || uploading) return;
    if (!supported.test(file.name) || file.size > MAX_BYTES) {
      setError('Use a CSV or XLSX file no larger than 10 MB.');
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(false);
    setProgress(0);

    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', import.meta.env.VITE_API_URL || 'http://localhost:3000/upload', true);
    xhr.responseType = 'blob';
    xhr.timeout = 35000;

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) setProgress(Math.round(100 * event.loaded / event.total));
    };
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status !== 200 || !(xhr.response instanceof Blob)) {
        setError('Reprojection failed. Check that the file has valid latitude and longitude columns.');
        return;
      }
      const url = URL.createObjectURL(xhr.response);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name.replace(/\.(csv|xlsx)$/i, '_reprojected.$1');
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess(true);
      setProgress(100);
    };
    xhr.onerror = () => {
      setUploading(false);
      setError('Could not contact the local reprojection service.');
    };
    xhr.ontimeout = () => {
      setUploading(false);
      setError('The request timed out. Try a smaller file.');
    };
    xhr.send(form);
  };

  return (
    <div className="app">
      <nav className="navbar">
        <img src={nycDotLogo} alt="NYC DOT inspired project logo" className="logo" />
        <h1>Geospatial Reprojection</h1>
      </nav>
      <main className="main">
        <section className="instructions">
          <h2>WGS84 to NYC State Plane</h2>
          <p>Convert latitude/longitude in EPSG:4326 to EPSG:2263 projected coordinates.</p>
          <ol>
            <li>Choose a CSV or XLSX file up to 10 MB.</li>
            <li>Provide columns named latitude and longitude, or lat and lon.</li>
            <li>Download your table with two new fields: x_epsg2263_ft and y_epsg2263_ft.</li>
            <li>These values are projected X/Y in US survey feet, not degrees.</li>
          </ol>
        </section>
        <form onSubmit={submit} className="upload-form">
          <label htmlFor="dataset">Choose coordinate file</label>
          <input id="dataset" type="file" onChange={chooseFile} accept=".csv,.xlsx" className="file-input" />
          <button type="submit" disabled={!file || uploading || Boolean(error)} className="upload-button">
            {uploading ? 'Processing…' : 'Upload and reproject'}
          </button>
        </form>
        {uploading && <div role="status" className="progress-bar">
          <div className="progress" style={{ width: String(progress) + '%' }} />
        </div>}
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        {success && <p role="status" className="checkmark">✓ Reprojected file downloaded</p>}
      </main>
    </div>
  );
};

export default App;
