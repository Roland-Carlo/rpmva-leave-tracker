import { useState, useEffect } from 'react';
import api from '../api/client';
import { format } from 'date-fns';

function StatusBadge({ status }) {
  return <span className={`badge-${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

export default function Approvals() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [actionId, setActionId] = useState(null);
  const [noteModal, setNoteModal] = useState(null); // { id, action }
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

  const openModal = (id, action) => { setNoteModal({ id, action }); setNotes(''); };

  const handleAction = async () => {
    if (!noteModal) return;
    setActionId(noteModal.id);
    try {
      await api.put(`/leaves/${noteModal.id}/${noteModal.action}`, { notes });
      setLeaves(l => l.filter(x => x.id !== noteModal.id));
      setNoteModal(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Leave Approvals</h2>
        <p className="text-sm text-gray-500 mt-0.5">{leaves.length} application{leaves.length !== 1 ? 's' : ''}</p>
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
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : leaves.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-400 text-sm">No leave applications found.</p>
        </div>
      ) : (
        <>
          {/* Desktop */}
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
                          <button onClick={() => openModal(l.id, 'approve')} className="text-xs text-green-600 hover:text-green-800 font-medium">Approve</button>
                          <button onClick={() => openModal(l.id, 'reject')} className="text-xs text-red-600 hover:text-red-800 font-medium">Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
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
                  <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100">
                    <button onClick={() => openModal(l.id, 'approve')} className="flex-1 py-2 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700">Approve</button>
                    <button onClick={() => openModal(l.id, 'reject')} className="flex-1 py-2 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Action Modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-semibold text-gray-900 mb-1 capitalize">{noteModal.action} Leave</h3>
            <p className="text-sm text-gray-500 mb-4">Add an optional note for the employee.</p>
            <textarea
              className="input resize-none mb-4"
              rows={3}
              placeholder="Optional note…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => setNoteModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleAction}
                disabled={!!actionId}
                className={`flex-1 ${noteModal.action === 'approve' ? 'btn-primary' : 'btn-danger'}`}
              >
                {actionId ? 'Processing…' : noteModal.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
