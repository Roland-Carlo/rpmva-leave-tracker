import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';

function StatusBadge({ status }) {
  return <span className={`badge-${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

export default function MyLeaves() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [cancelling, setCancelling] = useState(null);

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear + 1].sort((a, b) => b - a);

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

  const cancel = async id => {
    if (!confirm('Cancel this leave application?')) return;
    setCancelling(id);
    try {
      await api.delete(`/leaves/${id}`);
      setLeaves(l => l.filter(x => x.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel');
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900">My Leave History</h2>
          <p className="text-sm text-gray-500 mt-0.5">{leaves.length} application{leaves.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/apply" className="btn-primary shrink-0">+ Apply Leave</Link>
      </div>

      {/* Filters */}
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
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : leaves.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-400 text-sm mb-3">No leave applications found.</p>
          <Link to="/apply" className="btn-primary">Apply for Leave</Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
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
                    <td className="px-5 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{l.reason || '—'}</td>
                    <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{format(new Date(l.created_at), 'MMM d, yyyy')}</td>
                    <td className="px-5 py-3">
                      {l.status === 'pending' && (
                        <button
                          onClick={() => cancel(l.id)}
                          disabled={cancelling === l.id}
                          className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
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
                {l.reason && <p className="text-xs text-gray-400 mb-2">{l.reason}</p>}
                {l.reviewer_notes && <p className="text-xs text-gray-500 italic">Note: {l.reviewer_notes}</p>}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">{format(new Date(l.created_at), 'MMM d, yyyy')}</span>
                  {l.status === 'pending' && (
                    <button onClick={() => cancel(l.id)} disabled={cancelling === l.id} className="text-xs text-red-600 font-medium">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
