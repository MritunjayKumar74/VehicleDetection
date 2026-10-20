import { useEffect, useState } from 'react';
import './PlateUpload.css';

const API = `${import.meta.env.VITE_API_URL}/api`;
const SOURCES = [
  ['DB1_CameraSightings', 'Camera sightings'],
  ['DB2_InsuranceRecords', 'Insurance records'],
  ['DB3_VehicleRegistration', 'RTO registration'],
  ['DB4_TheftRecords', 'Theft records'],
  ['DB5_MotReports', 'MOT reports'],
];

export default function PlateUpload() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [plateText, setPlateText] = useState('');
  const [recordedPlate, setRecordedPlate] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [algorithm, setAlgorithm] = useState(null);
  const [selectedPlate, setSelectedPlate] = useState('');
  const [selectedSources, setSelectedSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const handleChange = (event) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
    setResult(null);
    setPlateText('');
    setRecordedPlate('');
    setSelectedSources([]);
    setCandidates([]);
    setSelectedPlate('');
    setError('');
    setNotice('');
  };

  const findCandidates = async (plate) => {
    if (!plate.trim()) return;
    setMatching(true);
    setError('');
    setNotice('');
    try {
      const query = new URLSearchParams({ plate: plate.trim() });
      if (make.trim()) query.set('make', make.trim());
      if (model.trim()) query.set('model', model.trim());
      if (color.trim()) query.set('color', color.trim());
      const response = await fetch(`${API}/vehicle/matches?${query.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Candidate search failed');
      setCandidates(data.candidates || []);
      setAlgorithm(data.algorithm || null);
      setSelectedPlate('');
      if (!data.candidates?.length) setNotice('No close candidates found. Check the OCR text or add context clues.');
    } catch (err) {
      setError(err.message);
    } finally {
      setMatching(false);
    }
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await fetch(`${API}/ocr`, { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'OCR failed');
      setResult(data);
      setPlateText(data.plate || '');
      setRecordedPlate(data.plate || '');
      setCandidates([]);
      setSelectedPlate('');
      if (data.plate) await findCandidates(data.plate);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (source) => {
    setSelectedSources(current => current.includes(source)
      ? current.filter(item => item !== source)
      : [...current, source]);
  };

  const handleReconcile = async () => {
    const candidate = candidates.find(item => item.plate === selectedPlate);
    if (!candidate || !plateText.trim() || !recordedPlate.trim() || selectedSources.length === 0) return;
    const sourceLabels = SOURCES
      .filter(([source]) => selectedSources.includes(source))
      .map(([, label]) => label)
      .join(', ');
    const confirmed = window.confirm(
      `Change records matching stored plate ${recordedPlate} to ${candidate.plate} in: ${sourceLabels}?`
    );
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API}/vehicle/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordedPlate, canonicalPlate: candidate.plate, sources: selectedSources }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Plate correction failed');
      const summary = (data.updates || []).map(update => {
        const label = SOURCES.find(([source]) => source === update.source)?.[1] || update.source;
        return update.error
          ? `${label}: failed (${update.error})`
          : `${label}: ${update.updated} record${update.updated === 1 ? '' : 's'} updated`;
      }).join('; ');
      const totalUpdated = (data.updates || []).reduce((sum, update) => sum + update.updated, 0);
      const hasErrors = (data.updates || []).some(update => update.error);
      await findCandidates(plateText);
      setSelectedPlate(candidate.plate);
      const status = hasErrors ? 'Correction partially applied.' : totalUpdated ? 'Correction complete.' : 'No records changed.';
      setNotice(`${status} ${summary}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedCandidate = candidates.find(item => item.plate === selectedPlate);

  return (
    <main className="plate-upload">
      <header className="plate-upload-header">
        <span className="plate-upload-kicker">VEHICLE DATA QUALITY</span>
        <h1>Number Plate Reader</h1>
        <p>Read a plate, compare likely records across the connected databases, then review any correction before it is applied.</p>
      </header>

      <section className="ocr-panel">
        <h2>1. Scan a registration image</h2>
        <label className="ocr-file-label">
          <span>Choose a vehicle image</span>
          <input type="file" accept="image/*" onChange={handleChange} />
        </label>
        {preview && <img className="ocr-preview" src={preview} alt="Selected vehicle registration preview" />}
        <button className="ocr-primary-button" onClick={handleSubmit} disabled={!file || loading}>
          {loading ? 'Reading plate…' : 'Read plate and find matches'}
        </button>
        {result && (
          <div className="ocr-read-result" aria-live="polite">
            <label>OCR plate (edit if misread)
              <input value={plateText} onChange={event => {
                const value = event.target.value.toUpperCase();
                setPlateText(value);
                setRecordedPlate(value);
                setCandidates([]);
                setSelectedPlate('');
              }} />
            </label>
            {result.confidence > 0 && <span>OCR confidence: {Math.round(result.confidence)}%</span>}
          </div>
        )}
      </section>

      {result && (
        <section className="ocr-panel context-panel">
          <div>
            <h2>2. Add visible vehicle details</h2>
            <p>Optional clues help rank close plate readings. Leave fields blank when unsure.</p>
          </div>
          <div className="ocr-context-fields">
            <label>Make<input value={make} onChange={event => setMake(event.target.value)} placeholder="e.g. Maruti" /></label>
            <label>Model<input value={model} onChange={event => setModel(event.target.value)} placeholder="e.g. Swift" /></label>
            <label>Color<input value={color} onChange={event => setColor(event.target.value)} placeholder="e.g. White" /></label>
          </div>
          <button className="ocr-secondary-button" onClick={() => findCandidates(plateText)} disabled={matching || !plateText.trim()}>
            {matching ? 'Comparing records…' : 'Update candidate ranking'}
          </button>
        </section>
      )}

      {algorithm && (
        <details className="ocr-algorithm">
          <summary>How candidates are matched</summary>
          <p><strong>{algorithm.name}.</strong> {algorithm.plateRules} {algorithm.candidateGate} {algorithm.ranking}</p>
          <p>Context fields are compared against RTO make/model and camera color. Missing data is ignored.</p>
        </details>
      )}

      {candidates.length > 0 && (
        <section className="ocr-candidates">
          <div className="ocr-section-heading">
            <div>
              <h2>3. Review close matches</h2>
              <p>Choose the correct vehicle before changing any records.</p>
            </div>
            <span>{candidates.length} candidate{candidates.length === 1 ? '' : 's'}</span>
          </div>
          <div className="ocr-candidate-list">
            {candidates.map(candidate => (
              <button
                type="button"
                key={candidate.plate}
                className={`ocr-candidate ${selectedPlate === candidate.plate ? 'selected' : ''}`}
                onClick={() => setSelectedPlate(candidate.plate)}
              >
                <span className="ocr-candidate-topline">
                  <strong>{candidate.plate}</strong>
                  <span>{candidate.score}% rank score</span>
                </span>
                <span className="ocr-candidate-details">
                  Plate similarity {candidate.plateSimilarity}% - weighted edits {candidate.plateDistance}
                </span>
                <span className="ocr-candidate-details">
                  {[candidate.registration?.make, candidate.registration?.model, candidate.registration?.year, candidate.camera?.color].filter(Boolean).join(' | ') || 'No vehicle context recorded'}
                </span>
                <span className="ocr-source-list">
                  {candidate.sourceRecords.map(source => (
                    <span key={source}>{SOURCES.find(([name]) => name === source)?.[1] || source}</span>
                  ))}
                </span>
                {candidate.contextMatches.length > 0 && (
                  <span className="ocr-context-results">
                    {candidate.contextMatches.map(match => (
                      <span key={match.field} className={match.matched ? 'context-match' : 'context-mismatch'}>
                        {match.field}: {match.record || 'not recorded'} ({match.similarity === null ? 'no data' : `${Math.round(match.similarity * 100)}%`})
                      </span>
                    ))}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedCandidate && (
        <section className="ocr-panel reconcile-panel">
          <h2>4. Correct the selected source records</h2>
          <p>Records matching the stored plate value below will change to <strong>{selectedCandidate.plate}</strong>. Other fields are left as recorded.</p>
          <label className="ocr-recorded-plate">Stored plate value to correct
            <input list="ocr-known-plates" value={recordedPlate} onChange={event => setRecordedPlate(event.target.value.toUpperCase())} />
            <datalist id="ocr-known-plates">
              <option value={plateText} />
              {candidates.map(candidate => <option key={candidate.plate} value={candidate.plate} />)}
            </datalist>
          </label>
          <fieldset>
            <legend>Databases to update</legend>
            {SOURCES.map(([source, label]) => (
              <label key={source} className="ocr-source-checkbox">
                <input type="checkbox" checked={selectedSources.includes(source)} onChange={() => toggleSource(source)} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <button className="ocr-correct-button" onClick={handleReconcile} disabled={saving || selectedSources.length === 0 || !recordedPlate.trim() || recordedPlate.replace(/[^a-z0-9]/gi, '').toUpperCase() === selectedCandidate.plate.replace(/[^a-z0-9]/gi, '').toUpperCase()}>
            {saving ? 'Applying correction…' : `Correct ${recordedPlate || 'stored plate'} to ${selectedCandidate.plate}`}
          </button>
        </section>
      )}

      {error && <p className="ocr-message error" role="alert">{error}</p>}
      {notice && <p className="ocr-message success" role="status">{notice}</p>}
    </main>
  );
}



