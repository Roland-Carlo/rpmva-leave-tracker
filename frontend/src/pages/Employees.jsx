import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';

const EMPTY = { name: '', email: '', department_id: '', start_date: '', carry_over_annual: 0, carry_over_sick: 0, password: '' };

export default function Employees() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [empRes, deptRes] = await Promise.all([api.get('/employees'), api.get('/departments')]);
      setEmployees(empRes.data);
      setDepartments(deptRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setModal('add'); setForm(EMPTY); setError(''); };
  const openEdit = emp => {
    setModal(emp);
    setForm({
      name: emp.name,
      email: emp.email,
      department_id: emp.department_id || '',
      start_date: emp.start_date,
      carry_over_annual: emp.balance?.annual?.carryOver || 0,
      carry_over_sick: emp.balance?.sick?.carryOver || 0,
      password: '',
    });
    setError('');
  };

  const handleSave = async e => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (modal === 'add') {
        await api.post('/employees', { ...form, year: new Date().getFullYear() });
      } else {
        await api.put(`/employees/${modal.id}`, { ...form, year: new Date().getFullYear() });
      }
      setModal(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async emp => {
    if (!confirm(`Delete ${emp.name}? This will remove all their data.`)) return;
    try {
      await api.delete(`/employees/${emp.id}`);
      setEmployees(e => e.filter(x => x.id !== emp.id));
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const filtered = employees.filter(e =>
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase())) &&
    (!deptFilter || String(e.department_id) === deptFilter)
  );

  const al = emp => emp.balance?.annual ?? {};
  const sl = emp => emp.balance?.sick ?? {};

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-brand-black">Employees</h2>
          <p className="text-sm text-brand-slate mt-0.5">{filtered.length} of {employees.length} employees</p>
        </div>
        {user.role === 'admin' && <button onClick={openAdd} className="btn-primary shrink-0">+ Add Employee</button>}
      </div>

      <div className="flex flex-wrap gap-3">
        <input className="input flex-1 min-w-48" placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input w-auto" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-yellow" /></div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card p-0 hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-brand-slate/20">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-brand-slate text-xs uppercase tracking-wide" rowSpan={2}>Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-brand-slate text-xs uppercase tracking-wide" rowSpan={2}>Department</th>
                  <th className="text-left px-4 py-3 font-semibold text-brand-slate text-xs uppercase tracking-wide" rowSpan={2}>Start Date</th>
                  <th className="text-center px-4 py-2 font-bold text-brand-asphalt text-xs uppercase tracking-wide border-l border-brand-slate/20" colSpan={3}>Annual Leave</th>
                  <th className="text-center px-4 py-2 font-bold text-brand-asphalt text-xs uppercase tracking-wide border-l border-brand-slate/20" colSpan={3}>Sick Leave</th>
                  <th className="px-4 py-3" rowSpan={2} />
                </tr>
                <tr className="bg-gray-50 border-b border-brand-slate/20">
                  <th className="text-center px-3 py-2 font-semibold text-brand-slate text-xs border-l border-brand-slate/20">Accrued</th>
                  <th className="text-center px-3 py-2 font-semibold text-brand-slate text-xs">Taken</th>
                  <th className="text-center px-3 py-2 font-semibold text-brand-slate text-xs">Left</th>
                  <th className="text-center px-3 py-2 font-semibold text-brand-slate text-xs border-l border-brand-slate/20">Accrued</th>
                  <th className="text-center px-3 py-2 font-semibold text-brand-slate text-xs">Taken</th>
                  <th className="text-center px-3 py-2 font-semibold text-brand-slate text-xs">Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-brand-glow/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-brand-black">{emp.name}</p>
                      <p className="text-xs text-brand-slate">{emp.email}</p>
                    </td>
                    <td className="px-4 py-3 text-brand-slate">{emp.department_name || '—'}</td>
                    <td className="px-4 py-3 text-brand-slate whitespace-nowrap">{format(new Date(emp.start_date), 'MMM d, yyyy')}</td>
                    {/* Annual Leave */}
                    <td className="px-3 py-3 text-center text-brand-asphalt border-l border-brand-slate/10">{al(emp).totalAccrued ?? 0}</td>
                    <td className="px-3 py-3 text-center text-red-600 font-semibold">{al(emp).leaveTaken ?? 0}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`font-bold ${(al(emp).remaining ?? 0) < 3 ? 'text-red-600' : 'text-brand-black'}`}>{al(emp).remaining ?? 0}</span>
                    </td>
                    {/* Sick Leave */}
                    <td className="px-3 py-3 text-center text-brand-asphalt border-l border-brand-slate/10">{sl(emp).totalAccrued ?? 0}</td>
                    <td className="px-3 py-3 text-center text-red-600 font-semibold">{sl(emp).leaveTaken ?? 0}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`font-bold ${(sl(emp).remaining ?? 0) < 2 ? 'text-red-600' : 'text-brand-black'}`}>{sl(emp).remaining ?? 0}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button onClick={() => openEdit(emp)} className="text-xs text-brand-asphalt hover:text-brand-black font-semibold underline underline-offset-2">Edit</button>
                        {user.role === 'admin' && (
                          <button onClick={() => handleDelete(emp)} className="text-xs text-red-500 hover:text-red-700 font-semibold underline underline-offset-2">Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(emp => (
              <div key={emp.id} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-brand-black">{emp.name}</p>
                    <p className="text-xs text-brand-slate">{emp.department_name || 'No Department'}</p>
                  </div>
                  <div className="text-right text-xs text-brand-slate space-y-0.5">
                    <p>AL <span className="font-bold text-brand-black">{al(emp).remaining ?? 0}</span></p>
                    <p>SL <span className="font-bold text-brand-black">{sl(emp).remaining ?? 0}</span></p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-brand-glow rounded p-2">
                    <p className="font-semibold text-brand-asphalt mb-1">Annual Leave</p>
                    <p>Accrued: <strong>{al(emp).totalAccrued ?? 0}</strong></p>
                    <p>Taken: <strong className="text-red-600">{al(emp).leaveTaken ?? 0}</strong></p>
                  </div>
                  <div className="bg-blue-50 rounded p-2">
                    <p className="font-semibold text-brand-asphalt mb-1">Sick Leave</p>
                    <p>Accrued: <strong>{sl(emp).totalAccrued ?? 0}</strong></p>
                    <p>Taken: <strong className="text-red-600">{sl(emp).leaveTaken ?? 0}</strong></p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => openEdit(emp)} className="flex-1 text-xs py-1.5 bg-brand-glow text-brand-asphalt rounded font-semibold">Edit</button>
                  {user.role === 'admin' && (
                    <button onClick={() => handleDelete(emp)} className="flex-1 text-xs py-1.5 bg-red-50 text-red-700 rounded font-semibold">Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-brand-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-brand-black text-lg mb-4">
              {modal === 'add' ? 'Add Employee' : `Edit — ${modal.name}`}
            </h3>
            {error && (
              <p className="mb-4 px-3 py-2.5 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                {error}
              </p>
            )}
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Full Name</label>
                  <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="col-span-2">
                  <label className="label">Email</label>
                  <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">Department</label>
                  <select className="input" value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}>
                    <option value="">— None —</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" className="input" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required />
                </div>

                <div className="col-span-2">
                  <p className="label mb-2">Carry-Over <span className="text-brand-slate font-normal">({new Date().getFullYear()})</span></p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-brand-slate font-medium mb-1 block">Annual Leave</label>
                      <input type="number" step="0.5" min="0" className="input" value={form.carry_over_annual} onChange={e => setForm(f => ({ ...f, carry_over_annual: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-brand-slate font-medium mb-1 block">Sick Leave</label>
                      <input type="number" step="0.5" min="0" className="input" value={form.carry_over_sick} onChange={e => setForm(f => ({ ...f, carry_over_sick: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {modal === 'add' && (
                  <div className="col-span-2">
                    <label className="label">Initial Password <span className="text-brand-slate font-normal">(default: password123)</span></label>
                    <input type="password" className="input" placeholder="Leave blank for default" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
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
