import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../api/client';
import { format } from 'date-fns';

function StatusBadge({ status }) {
  return <span className={`badge-${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

const ACTION_LABELS = { approve: 'Approve', reject: 'Reject', return: 'Return for Revision' };
const ACTION_BTN    = { approve: 'btn-primary', reject: 'btn-danger', return: 'btn-secondary' };

export default function Approvals() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [actionId, setActionId] = useState(null);
  const [modal, setModal] = useState(null); // { id, action }
  const [notes, setNotes] = useState('');

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1].sort((a, b) => b - a);

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

  const openModal = (id, action) => { setModal({ id, action }); setNotes(''); };

  const handleAction = async () => {
    if (!modal) return;
    if (modal.action === 'return' && !notes.trim()) {
      addToast('A note is required when returning a leave.', 'error');
      return;
    }
    setActionId(modal.id);
    try {
      await api.put(`/leaves/${modal.id}/${modal.action}`, { notes });
      setLeaves(l => l.filter(x => x.id !== modal.id));
      setModal(null);
      addToast(
        modal.action === 'approve' ? 'Leave approved.' :
        modal.action === 'reject'  ? 'Leave rejected.' :
        'Leave returned for revision.',
        'success'
      );
    } catch (err) {
      addToast(err.response?.data?.error || 'Action failed', 'error');
    } finally {
      setActionId(null);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900">Leave Approvals</h2>
          <p className="text-sm text-gray-500 mt-0.5">{leaves.length} application{leaves.length !== 1 ? 's' : ''}</p>
        </div>
        <ExportButton yearFilter={yearFilter} statusFilter={statusFilter} />
      </div>

      <div className="flex flex-wrap gap-3">
        <select className="input w-auto" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
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
          <p className="text-gray-400 text-sm">No leave applications found.</p>
        </div>
      ) : (
        <>
          <div className="card p-0 hidden md:block overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Employee</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Department</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Period</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Days</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Applied</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaves.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{l.employee_name}</td>
                    <td className="px-5 py-3 text-gray-500">{l.department_name}</td>
                    <td className="px-5 py-3 text-gray-600">{l.leave_type}</td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {format(new Date(l.start_date), 'MMM d')} – {format(new Date(l.end_date), 'MMM d, yyyy')}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{l.days}</td>
                    <td className="px-5 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{format(new Date(l.created_at), 'MMM d, yyyy')}</td>
                    <td className="px-5 py-3">
                      {l.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => openModal(l.id, 'approve')} className="text-xs text-green-600 hover:text-green-800 font-semibold">Approve</button>
                          <button onClick={() => openModal(l.id, 'return')} className="text-xs text-brand-asphalt hover:text-brand-black font-semibold">Return</button>
                          <button onClick={() => openModal(l.id, 'reject')} className="text-xs text-red-600 hover:text-red-800 font-semibold">Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {leaves.map(l => (
              <div key={l.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-gray-800">{l.employee_name}</p>
                    <p className="text-xs text-gray-400">{l.department_name}</p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
                <p className="text-sm text-gray-600">{l.leave_type} · {l.days} day{l.days !== 1 ? 's' : ''}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {format(new Date(l.start_date), 'MMM d')} – {format(new Date(l.end_date), 'MMM d, yyyy')}
                </p>
                {l.reason && <p className="text-xs text-gray-400 mt-1 italic">{l.reason}</p>}
                {l.status === 'pending' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button onClick={() => openModal(l.id, 'approve')} className="flex-1 py-2 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700">Approve</button>
                    <button onClick={() => openModal(l.id, 'return')} className="flex-1 py-2 text-xs font-medium text-brand-black bg-brand-glow rounded-lg">Return</button>
                    <button onClick={() => openModal(l.id, 'reject')} className="flex-1 py-2 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-semibold text-gray-900 mb-1">{ACTION_LABELS[modal.action]}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {modal.action === 'return'
                ? 'Explain what needs to be revised. This note is required.'
                : 'Add an optional note for the employee.'}
            </p>
            <textarea
              className="input resize-none mb-4"
              rows={3}
              placeholder={modal.action === 'return' ? 'Reason for returning…' : 'Optional note…'}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleAction}
                disabled={!!actionId}
                className={`flex-1 ${ACTION_BTN[modal.action]}`}
              >
                {actionId ? 'Processing…' : ACTION_LABELS[modal.action]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportButton({ yearFilter, statusFilter }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (yearFilter) params.set('year', yearFilter);
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/export/leaves?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `leaves_${yearFilter || 'all'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — user can retry
    } finally {
      setExporting(false);
    }
  };

  return (
    <button onClick={handleExport} disabled={exporting} className="btn-secondary shrink-0 flex items-center gap-2">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {exporting ? 'Exporting…' : 'Export CSV'}
    </button>
  );
}
