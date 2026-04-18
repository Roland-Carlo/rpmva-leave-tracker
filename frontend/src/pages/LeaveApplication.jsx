import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

const LEAVE_TYPES = ['Annual Leave', 'Sick Leave'];

export default function LeaveApplication() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [balance, setBalance] = useState(null);
  const [form, setForm] = useState({
    employee_id: user.employeeId || '',
    leave_type: 'Annual Leave',
    start_date: '',
    end_date: '',
    reason: '',
  });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user.role !== 'employee') {
      api.get('/employees').then(r => setEmployees(r.data));
    }
  }, [user.role]);

  useEffect(() => {
    const empId = form.employee_id || user.employeeId;
    if (!empId) return;
    const year = form.start_date ? new Date(form.start_date).getFullYear() : new Date().getFullYear();
    api.get(`/employees/${empId}/balance?year=${year}`).then(r => setBalance(r.data)).catch(() => {});
  }, [form.employee_id, form.start_date, user.employeeId]);

  useEffect(() => {
    if (!form.start_date || !form.end_date) { setPreview(null); return; }
    const start = new Date(form.start_date);
    const end = new Date(form.end_date);
    if (start > end) { setPreview(null); return; }
    let days = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const d = cur.getDay();
      if (d !== 0 && d !== 6) days++;
      cur.setDate(cur.getDate() + 1);
    }
    setPreview(days);
  }, [form.start_date, form.end_date]);

  const typeBalance = balance
    ? (form.leave_type === 'Sick Leave' ? balance.sick : balance.annual)
    : null;

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/leaves', {
        ...form,
        employee_id: form.employee_id || user.employeeId,
      });
      navigate('/my-leaves');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Apply for Leave</h2>
        <p className="text-sm text-gray-500 mt-0.5">Submit a new leave application</p>
      </div>

      {/* Balance summary — per selected leave type */}
      {typeBalance && (
        <div>
          <p className="text-xs font-semibold text-brand-asphalt uppercase tracking-wide mb-2">{form.leave_type} Balance</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-brand-glow rounded-lg px-4 py-3 text-center">
              <p className="text-xs text-brand-asphalt font-semibold">Accrued</p>
              <p className="text-xl font-bold text-brand-black mt-0.5">{typeBalance.totalAccrued}</p>
            </div>
            <div className="bg-red-50 rounded-lg px-4 py-3 text-center">
              <p className="text-xs text-red-600 font-semibold">Taken</p>
              <p className="text-xl font-bold text-red-800 mt-0.5">{typeBalance.leaveTaken}</p>
            </div>
            <div className="bg-brand-yellow rounded-lg px-4 py-3 text-center">
              <p className="text-xs text-brand-asphalt font-semibold">Remaining</p>
              <p className="text-xl font-bold text-brand-black mt-0.5">{typeBalance.remaining}</p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        {error && (
          <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {user.role !== 'employee' && (
            <div>
              <label className="label">Employee</label>
              <select
                className="input"
                value={form.employee_id}
                onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                required
              >
                <option value="">Select employee…</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name} – {e.department_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">Leave Type</label>
            <div className="grid grid-cols-2 gap-3">
              {LEAVE_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, leave_type: t }))}
                  className={`py-2.5 px-4 rounded-lg border-2 text-sm font-semibold transition-colors ${
                    form.leave_type === t
                      ? 'border-brand-yellow bg-brand-yellow text-brand-black'
                      : 'border-gray-200 bg-white text-brand-asphalt hover:border-brand-beacon'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                className="input"
                min={today}
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">End Date</label>
              <input
                type="date"
                className="input"
                min={form.start_date || today}
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                required
              />
            </div>
          </div>

          {preview !== null && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
              typeBalance && preview > typeBalance.remaining
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-brand-glow text-brand-asphalt border border-brand-beacon'
            }`}>
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {preview} working day{preview !== 1 ? 's' : ''} selected
              {typeBalance && preview > typeBalance.remaining && ` — exceeds available balance (${typeBalance.remaining} days)`}
            </div>
          )}

          <div>
            <label className="label">Reason <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Briefly describe the reason for your leave…"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary flex-1">Cancel</button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={submitting || (preview !== null && typeBalance && preview > typeBalance.remaining)}
            >
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
