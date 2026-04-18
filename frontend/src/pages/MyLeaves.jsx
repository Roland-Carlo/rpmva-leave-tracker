import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../api/client';
import { format } from 'date-fns';

const LEAVE_TYPES = ['Annual Leave', 'Sick Leave'];

function StatusBadge({ status }) {
  return <span className={`badge-${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

function workingDays(start, end) {
  let count = 0;
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default function MyLeaves() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editBalance, setEditBalance] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = [currentYear + 1, currentYear, currentYear - 1];

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (yearFilter) params.set('year', yearFilter);
      const { data } = await api.get(`/leaves?${params}`);
      setLeaves(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, yearFilter]);

  // Load balance when editing
  useEffect(() => {
    if (!editModal) { setEditBalance(null); return; }
    const year = editForm.start_date
      ? new Date(editForm.start_date).getFullYear()
      : new Date().getFullYear();
    api.get(`/employees/${user.employeeId}/balance?year=${year}`)
      .then(r => setEditBalance(r.data))
      .catch(() => {});
  }, [editModal, editForm.start_date, user.employeeId]);

  const openEdit = leave => {
    setEditModal(leave);
    setEditForm({
      leave_type: leave.leave_type,
      start_date: leave.start_date,
      end_date: leave.end_date,
      reason: leave.reason || '',
    });
  };

  const handleEdit = async e => {
    e.preventDefault();
    if (new Date(editForm.start_date) > new Date(editForm.end_date)) {
      addToast('End date must be after start date', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.put(`/leaves/${editModal.id}/edit`, editForm);
      setEditModal(null);
      addToast('Leave updated and resubmitted.', 'success');
      load();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update leave', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirmCancel) return;
    setCancelling(true);
    try {
      await api.put(`/leaves/${confirmCancel.id}/cancel`);
      setLeaves(l => l.map(x => x.id === confirmCancel.id ? { ...x, status: 'cancelled' } : x));
      addToast('Leave cancelled.', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to cancel', 'error');
    } finally {
      setCancelling(false);
      setConfirmCancel(null);
    }
  };

  const editPreview = editForm.start_date && editForm.end_date
    ? workingDays(editForm.start_date, editForm.end_date)
    : null;
  const editTypeBalance = editBalance
    ? (editForm.leave_type === 'Sick Leave' ? editBalance.sick : editBalance.annual)
    : null;

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900">My Leave History</h2>
          <p className="text-sm text-gray-500 mt-0.5">{leaves.length} application{leaves.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/apply" className="btn-primary shrink-0">+ Apply Leave</Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <select className="input w-auto" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="returned">Returned</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-yellow" /></div>
      ) : leaves.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-400 text-sm mb-3">No leave applications found.</p>
          <Link to="/apply" className="btn-primary">Apply for Leave</Link>
        </div>
      ) : (
        <>
          <div className="card p-0 hidden sm:block overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Period</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Days</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Reason</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Applied</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaves.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{l.leave_type}</td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {format(new Date(l.start_date), 'MMM d')} – {format(new Date(l.end_date), 'MMM d, yyyy')}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{l.days}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={l.status} />
                      {l.reviewer_notes && l.status === 'returned' && (
                        <p className="text-xs text-brand-slate mt-1 max-w-xs">{l.reviewer_notes}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{l.reason || '—'}</td>
                    <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{format(new Date(l.created_at), 'MMM d, yyyy')}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        {l.status === 'returned' && (
                          <button onClick={() => openEdit(l)} className="text-xs text-brand-asphalt hover:text-brand-black font-semibold">Edit & Resubmit</button>
                        )}
                        {['pending', 'returned'].includes(l.status) && (
                          <button onClick={() => setConfirmCancel(l)} className="text-xs text-red-600 hover:text-red-800 font-medium">Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden space-y-3">
            {leaves.map(l => (
              <div key={l.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-gray-800">{l.leave_type}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {format(new Date(l.start_date), 'MMM d')} – {format(new Date(l.end_date), 'MMM d, yyyy')} · {l.days} day{l.days !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
                {l.reason && <p className="text-xs text-gray-400 mb-1">{l.reason}</p>}
                {l.reviewer_notes && l.status === 'returned' && (
                  <p className="text-xs text-brand-asphalt italic mb-1">Note: {l.reviewer_notes}</p>
                )}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">{format(new Date(l.created_at), 'MMM d, yyyy')}</span>
                  <div className="flex gap-2">
                    {l.status === 'returned' && (
                      <button onClick={() => openEdit(l)} className="text-xs text-brand-asphalt font-semibold">Edit & Resubmit</button>
                    )}
                    {['pending', 'returned'].includes(l.status) && (
                      <button onClick={() => setConfirmCancel(l)} className="text-xs text-red-600 font-medium">Cancel</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit & Resubmit Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-brand-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h3 className="font-bold text-brand-black text-lg mb-1">Edit & Resubmit Leave</h3>
            {editModal.reviewer_notes && (
              <div className="mb-4 px-3 py-2.5 bg-brand-glow text-brand-asphalt text-sm rounded-lg border border-brand-beacon">
                <span className="font-semibold">Reviewer note:</span> {editModal.reviewer_notes}
              </div>
            )}
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="label">Leave Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {LEAVE_TYPES.map(t => (
                    <button
                      key={t} type="button"
                      onClick={() => setEditForm(f => ({ ...f, leave_type: t }))}
                      className={`py-2 px-3 rounded-lg border-2 text-sm font-semibold transition-colors ${
                        editForm.leave_type === t
                          ? 'border-brand-yellow bg-brand-yellow text-brand-black'
                          : 'border-gray-200 bg-white text-brand-asphalt'
                      }`}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" className="input" min={today} value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" className="input" min={editForm.start_date || today} value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} required />
                </div>
              </div>
              {editPreview !== null && editTypeBalance && (
                <div className={`px-3 py-2 rounded-lg text-sm ${editPreview > editTypeBalance.remaining ? 'bg-red-50 text-red-700' : 'bg-brand-glow text-brand-asphalt'}`}>
                  {editPreview} working day{editPreview !== 1 ? 's' : ''} — {editTypeBalance.remaining} remaining
                </div>
              )}
              <div>
                <label className="label">Reason</label>
                <textarea className="input resize-none" rows={2} value={editForm.reason} onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={submitting || (editPreview !== null && editTypeBalance && editPreview > editTypeBalance.remaining)}>
                  {submitting ? 'Submitting…' : 'Resubmit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-brand-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-brand-black text-base">Cancel this leave?</p>
                <p className="text-sm text-brand-slate mt-0.5">
                  {confirmCancel.leave_type} · {format(new Date(confirmCancel.start_date), 'MMM d')} – {format(new Date(confirmCancel.end_date), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmCancel(null)} className="btn-secondary flex-1">Keep</button>
              <button onClick={handleCancel} disabled={cancelling} className="btn-danger flex-1">
                {cancelling ? 'Cancelling…' : 'Cancel Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
