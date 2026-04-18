import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';

function LeaveBalanceSection({ label, data, color }) {
  return (
    <div>
      <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${color}`}>{label}</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="card py-3 text-center">
          <p className="text-xs font-semibold text-brand-slate uppercase tracking-wide">Accrued</p>
          <p className="text-2xl font-bold text-brand-black mt-1">{data.totalAccrued ?? '—'}</p>
          {data.carryOver > 0 && <p className="text-xs text-brand-slate mt-0.5">+{data.carryOver} carry</p>}
        </div>
        <div className="card py-3 text-center">
          <p className="text-xs font-semibold text-brand-slate uppercase tracking-wide">Taken</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{data.leaveTaken ?? '—'}</p>
        </div>
        <div className="card border-l-4 border-brand-yellow py-3 text-center">
          <p className="text-xs font-semibold text-brand-slate uppercase tracking-wide">Remaining</p>
          <p className={`text-2xl font-bold mt-1 ${(data.remaining ?? 0) < 2 ? 'text-red-600' : 'text-brand-black'}`}>
            {data.remaining ?? '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={`badge-${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0 });
  const [loading, setLoading] = useState(true);
  const year = new Date().getFullYear();

  useEffect(() => {
    const load = async () => {
      try {
        if (user.employeeId) {
          const [balRes, leavesRes] = await Promise.all([
            api.get(`/employees/${user.employeeId}/balance?year=${year}`),
            api.get(`/leaves?year=${year}`),
          ]);
          setBalance(balRes.data);
          setLeaves(leavesRes.data.slice(0, 5));
          const all = leavesRes.data;
          setStats({
            total: all.length,
            pending: all.filter(l => l.status === 'pending').length,
            approved: all.filter(l => l.status === 'approved').length,
          });
        }
        if (user.role !== 'employee') {
          const empRes = await api.get(`/employees?year=${year}`);
          setEmployees(empRes.data.slice(0, 6));
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, year]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-yellow" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-brand-black">Welcome back, {user.name?.split(' ')[0] || user.email?.split('@')[0]}!</h2>
        <p className="text-sm text-brand-slate mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')} · FY {year}</p>
      </div>

      {/* Employee leave balances */}
      {balance && (
        <div className="space-y-4">
          <LeaveBalanceSection label="Annual Leave" data={balance.annual} color="text-brand-asphalt" />
          <LeaveBalanceSection label="Sick Leave"   data={balance.sick}   color="text-brand-asphalt" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent leave applications — employee view */}
        {user.employeeId && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-brand-black">Recent Applications</h3>
              <Link to="/my-leaves" className="text-sm text-brand-asphalt hover:text-brand-black font-medium underline underline-offset-2">View all</Link>
            </div>
            {leaves.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-brand-slate text-sm">No leave applications yet.</p>
                {user.role === 'employee' && (
                  <Link to="/apply" className="btn-primary mt-3 text-xs px-3 py-1.5 inline-block">Apply for Leave</Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {leaves.map(l => (
                  <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-brand-black">{l.leave_type}</p>
                      <p className="text-xs text-brand-slate">
                        {format(new Date(l.start_date), 'MMM d')} – {format(new Date(l.end_date), 'MMM d, yyyy')} · {l.days} day{l.days !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <StatusBadge status={l.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Admin/HR: employee leave snapshot */}
        {user.role !== 'employee' && employees.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-brand-black">Employee Balances</h3>
              <Link to="/employees" className="text-sm text-brand-asphalt hover:text-brand-black font-medium underline underline-offset-2">View all</Link>
            </div>
            <div className="space-y-2">
              {employees.map(emp => (
                <div key={emp.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-black truncate">{emp.name}</p>
                    <p className="text-xs text-brand-slate truncate">{emp.department_name}</p>
                  </div>
                  <div className="text-right ml-4 shrink-0 space-y-0.5">
                    <p className="text-xs text-brand-slate">AL <span className="font-bold text-brand-black">{emp.balance?.annual?.remaining ?? 0}</span></p>
                    <p className="text-xs text-brand-slate">SL <span className="font-bold text-brand-black">{emp.balance?.sick?.remaining ?? 0}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Apply leave CTA for employees with no leaves */}
        {user.role === 'employee' && leaves.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 bg-brand-glow rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-brand-asphalt" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="text-sm font-medium text-brand-black mb-1">Apply for Leave</p>
            <p className="text-xs text-brand-slate mb-4">{balance?.annual?.remaining ?? 0} annual days · {balance?.sick?.remaining ?? 0} sick days remaining</p>
            <Link to="/apply" className="btn-primary text-xs px-4 py-2">Apply Now</Link>
          </div>
        )}
      </div>

      {/* Quick stats for admin/hr */}
      {user.role !== 'employee' && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="text-2xl font-bold text-brand-black">{stats.total}</p>
            <p className="text-xs text-brand-slate mt-1">Total Applications ({year})</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-brand-yellow">{stats.pending}</p>
            <p className="text-xs text-brand-slate mt-1">Pending Approval</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
            <p className="text-xs text-brand-slate mt-1">Approved This Year</p>
          </div>
        </div>
      )}
    </div>
  );
}
