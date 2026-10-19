import { useState } from 'react';

const API_URL = 'http://localhost:5000/api/ocr'; // change 5000 to your backend port

export default function PlateUpload() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError('');
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(API_URL, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '30px auto', textAlign: 'center' }}>
      <h2>Number Plate Reader</h2>
      <input type="file" accept="image/*" onChange={handleChange} />
      {preview && (
        <div>
          <img src={preview} alt="preview" style={{ maxWidth: '100%', marginTop: 15 }} />
        </div>
      )}
      <button onClick={handleSubmit} disabled={!file || loading} style={{ marginTop: 15 }}>
        {loading ? 'Reading...' : 'Detect Plate'}
      </button>
      {result && (
        <h3>
          Plate: {result.plate || 'Not detected'} <br />
          {result.confidence > 0 && (
            <small>Confidence: {Math.round(result.confidence)}%</small>
        )}
        </h3>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}