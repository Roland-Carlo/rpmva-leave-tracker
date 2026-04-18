import { useState, useEffect } from 'react';
import api from '../api/client';

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | dept obj
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/departments');
      setDepartments(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setModal('add'); setName(''); setError(''); };
  const openEdit = d => { setModal(d); setName(d.name); setError(''); };

  const handleSave = async e => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (modal === 'add') {
        await api.post('/departments', { name });
      } else {
        await api.put(`/departments/${modal.id}`, { name });
      }
      setModal(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async dept => {
    if (!confirm(`Delete "${dept.name}"?`)) return;
    try {
      await api.delete(`/departments/${dept.id}`);
      setDepartments(d => d.filter(x => x.id !== dept.id));
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Departments</h2>
          <p className="text-sm text-gray-500 mt-0.5">{departments.length} department{departments.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openAdd} className="btn-primary">+ Add Department</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          {departments.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">No departments yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Department Name</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Employees</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {departments.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{d.name}</td>
                    <td className="px-5 py-3 text-gray-500">{d.employee_count}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-3 justify-end">
                        <button onClick={() => openEdit(d)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                        <button onClick={() => handleDelete(d)} className="text-xs text-red-600 hover:text-red-800 font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">{modal === 'add' ? 'Add Department' : `Edit — ${modal.name}`}</h3>
            {error && <p className="mb-3 px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">{error}</p>}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="label">Department Name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} required autoFocus />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
