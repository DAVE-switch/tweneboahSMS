import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, BadgeCheck, BookOpen, CalendarDays, ChevronRight,
  CreditCard, FileText, GraduationCap, LayoutDashboard, LogOut, Mail, MapPin,
  Menu, MoveRight, Pencil, Phone, Plus, Printer, ReceiptText, Search, Share2, ShieldCheck,
  SlidersHorizontal, Sparkles, UserRound, UserRoundPlus, UsersRound, Wallet, X,
} from 'lucide-react';

const SCHOOL = 'TWENEBOAH KODUAH ROYAL ACADEMY';
const NAV = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: UsersRound },
  { id: 'payments', label: 'Payments & receipts', icon: ReceiptText },
];
const STATUSES = ['Active', 'On hold', 'Withdrawn', 'Transferred', 'Graduated'];
const METHODS = ['Cash', 'Mobile Money', 'Bank Transfer'];

const money = (value) => `GH₵ ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value, options = { day: '2-digit', month: 'short', year: 'numeric' }) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', options) : '—';
const today = () => new Date().toISOString().slice(0, 10);
const initials = (value = '') => value.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

async function request(url, options = {}, csrf = '') {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (csrf && options.method && options.method !== 'GET') headers['x-csrf-token'] = csrf;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function App() {
  const [user, setUser] = useState(null);
  const [csrf, setCsrf] = useState('');
  const [page, setPage] = useState('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    request('/api/me').then(result => { setUser(result.user); setCsrf(result.csrf); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const notify = (message) => setToast(message);
  const go = (target) => { setPage(target); setMobileNav(false); };
  const signIn = async (event) => {
    event.preventDefault(); setLoginError(''); setBusy(true);
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try { const result = await request('/api/login', { method: 'POST', body: JSON.stringify(body) }); setUser(result.user); setCsrf(result.csrf); }
    catch (error) { setLoginError(error.message); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    try { await request('/api/logout', { method: 'POST', body: '{}' }, csrf); } catch { /* allow a local sign-out if the session has expired */ }
    setUser(null); setCsrf(''); setPage('dashboard');
  };
  const openStudent = () => setDialog({ type: 'student' });
  const openPayment = () => setDialog({ type: 'payment' });
  const finishAction = (message) => { setDialog(null); setRefresh(value => value + 1); notify(message); };

  if (!user) return <Login onSubmit={signIn} error={loginError} busy={busy} />;

  return (
    <div className="min-h-screen bg-paper text-slate-800">
      <div className="flex min-h-screen">
        {mobileNav && <button aria-label="Close navigation" onClick={() => setMobileNav(false)} className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden" />}
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-forest-900 text-white transition-transform duration-200 lg:static lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex h-[84px] items-center gap-3 border-b border-white/10 px-6">
            <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-white/30"><img src="/school-logo.jpg" alt="School crest" className="size-full object-contain" /></div>
            <div className="min-w-0"><div className="truncate font-display text-[13px] font-extrabold tracking-wide">TWENEBOAH KODUAH</div><div className="mt-0.5 text-[13px] font-bold tracking-[.19em] text-amber-300">ROYAL ACADEMY</div></div>
            <button onClick={() => setMobileNav(false)} className="ml-auto rounded-lg p-2 text-white/60 hover:bg-white/10 lg:hidden"><X size={17} /></button>
          </div>
          <div className="px-5 pb-3 pt-7 text-[14px] font-bold uppercase tracking-[.19em] text-emerald-100/45">School office</div>
          <nav className="space-y-1 px-3" aria-label="Main navigation">
            {NAV.map(item => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => go(item.id)} />)}
          </nav>
          <div className="mt-auto px-4 pb-4">
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[.04] px-3 py-3"><ShieldCheck className="text-emerald-300" size={16} /><div><div className="text-[13px] font-semibold text-white/85">Private workspace</div><div className="mt-0.5 text-[14px] text-white/45">Authorised staff access</div></div></div>
            <div className="flex items-center gap-3 border-t border-white/10 px-1 pt-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-200 text-[13px] font-extrabold text-forest-900">{initials(user.name)}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-bold">{user.name}</div><div className="mt-0.5 text-[14px] text-white/50">{user.role}</div></div>
              <button onClick={signOut} title="Sign out" className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"><LogOut size={16} /></button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-7 xl:px-10">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileNav(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"><Menu size={19} /></button>
              <div className="hidden text-[13px] text-slate-400 sm:block">School office <span className="px-2 text-slate-300">/</span><b className="font-semibold text-slate-700">{NAV.find(item => item.id === page)?.label}</b></div>
              <div className="text-[13px] font-extrabold tracking-wide text-forest-900 sm:hidden">ROYAL ACADEMY</div>
            </div>
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="hidden items-center gap-2 text-[13px] font-medium text-slate-500 md:flex"><CalendarDays size={14} className="text-slate-400" />{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
              {page === 'students' && <Button onClick={openStudent}><Plus size={15} /> <span className="hidden sm:inline">Register student</span><span className="sm:hidden">Register</span></Button>}
              {page === 'payments' && <Button onClick={openPayment}><Plus size={15} /> <span className="hidden sm:inline">Record payment</span><span className="sm:hidden">Payment</span></Button>}
              <div className="hidden size-9 place-items-center rounded-full bg-emerald-50 text-xs font-extrabold text-forest-800 sm:grid">{initials(user.name)}</div>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7 sm:py-9 xl:px-10">
            {page === 'dashboard' && <Dashboard key={refresh} user={user} onPage={go} onStudent={openStudent} onPayment={openPayment} onReceipt={(id) => setDialog({ type: 'receipt', id })} />}
            {page === 'students' && <Students key={`students-${refresh}`} csrf={csrf} onStudent={openStudent} onProfile={(id) => setDialog({ type: 'student-detail', id })} notify={notify} />}
            {page === 'payments' && <Payments key={`payments-${refresh}`} onPayment={openPayment} onReceipt={(id) => setDialog({ type: 'receipt', id })} />}
          </div>
        </main>
      </div>

      {dialog?.type === 'student' && <StudentDialog csrf={csrf} onClose={() => setDialog(null)} onSaved={finishAction} />}
      {dialog?.type === 'payment' && <PaymentDialog csrf={csrf} onClose={() => setDialog(null)} onSaved={finishAction} onReceipt={(id) => setDialog({ type: 'receipt', id })} />}
      {dialog?.type === 'receipt' && <ReceiptDialog id={dialog.id} onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.type === 'student-detail' && <StudentDetailDialog id={dialog.id} csrf={csrf} onClose={() => setDialog(null)} onUpdated={() => setRefresh(value => value + 1)} onReceipt={(paymentId) => setDialog({ type: 'receipt', id: paymentId })} notify={notify} />}
      {toast && <div role="status" className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-xl bg-forest-900 px-4 py-3 text-xs font-semibold text-white shadow-xl"><BadgeCheck size={16} className="text-emerald-300" />{toast}</div>}
    </div>
  );
}

function NavButton({ item, active, onClick }) {
  const Icon = item.icon;
  return <button onClick={onClick} className={`group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[13px] font-semibold transition ${active ? 'bg-white/[.12] text-white shadow-sm' : 'text-emerald-50/65 hover:bg-white/[.06] hover:text-white'}`}>
    {active && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-amber-300" />}
    <Icon size={17} strokeWidth={active ? 2.2 : 1.8} /><span className="flex-1">{item.label}</span>{item.id === 'payments' && <ChevronRight size={13} className="text-white/25" />}
  </button>;
}

function Login({ onSubmit, error, busy }) {
  return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f1f4ef] px-4 py-10">
    <div className="absolute -left-28 -top-28 size-[460px] rounded-full border border-forest-900/[.04]" /><div className="absolute -left-16 -top-16 size-[330px] rounded-full border border-forest-900/[.05]" />
    <div className="absolute -bottom-40 -right-20 size-[430px] rounded-full bg-amber-200/20 blur-3xl" />
    <div className="relative grid w-full max-w-[950px] overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_30px_100px_-50px_rgba(20,54,45,.3)] md:grid-cols-[.94fr_1.06fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-forest-900 p-10 text-white md:flex">
        <div className="absolute -right-28 -top-20 size-80 rounded-full border border-white/[.08]" /><div className="absolute -right-12 -top-2 size-48 rounded-full border border-amber-100/10" />
        <div className="relative flex items-center gap-3"><img src="/school-logo.jpg" alt="School crest" className="size-12 rounded-full bg-white object-contain p-1" /><div><p className="font-display text-[13px] font-extrabold tracking-wide">TWENEBOAH KODUAH</p><p className="mt-0.5 text-[14px] font-bold tracking-[.2em] text-amber-300">ROYAL ACADEMY</p></div></div>
        <div className="relative py-10"><div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-white/10 text-amber-200"><GraduationCap size={23} /></div><p className="mb-3 text-[14px] font-bold uppercase tracking-[.2em] text-emerald-200/60">School office portal</p><h1 className="max-w-sm font-display text-[31px] font-bold leading-[1.22] tracking-[-.045em]">Every student’s story, in one place.</h1><p className="mt-4 max-w-sm text-[14px] leading-6 text-white/55">Securely manage student records, school fees and official receipts.</p></div>
        <div className="relative flex items-center gap-2 border-t border-white/10 pt-5 text-[14px] text-white/45"><ShieldCheck size={14} className="text-emerald-300" /> Access is limited to authorised school staff</div>
      </div>
      <div className="flex items-center justify-center px-7 py-10 sm:px-12 md:px-10 lg:px-14">
        <div className="w-full max-w-[360px]">
          <div className="mb-8 flex items-center gap-3 md:hidden"><img src="/school-logo.jpg" alt="School crest" className="size-12 object-contain" /><div><p className="font-display text-[13px] font-extrabold text-forest-900">TWENEBOAH KODUAH</p><p className="mt-0.5 text-[14px] font-bold tracking-[.18em] text-gold-500">ROYAL ACADEMY</p></div></div>
          <div className="mb-8"><p className="mb-2 text-[14px] font-bold uppercase tracking-[.18em] text-forest-700">Welcome back</p><h2 className="font-display text-[27px] font-extrabold tracking-[-.04em] text-slate-900">Sign in to continue</h2><p className="mt-2 text-[13px] leading-5 text-slate-500">Use your school account to access the records system.</p></div>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email address"><input name="email" type="email" autoComplete="username" required placeholder="name@school.edu" className="form-control" /></Field>
            <Field label="Password"><input name="password" type="password" autoComplete="current-password" required placeholder="Enter your password" className="form-control" /></Field>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{error}</p>}
            <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest-800 px-4 py-3 text-[13px] font-bold text-white shadow-lg shadow-forest-900/15 transition hover:bg-forest-900 disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}{!busy && <ArrowRight size={15} />}</button>
          </form>
          <div className="mt-7 flex items-center justify-center gap-2 text-[14px] text-slate-400"><ShieldCheck size={13} /> Private access for authorised users</div>
        </div>
      </div>
    </div>
  </main>;
}

function Field({ label, children, className = '' }) { return <label className={`block ${className}`}><span className="mb-1.5 block text-[13px] font-semibold text-slate-600">{label}</span>{children}</label>; }
function Button({ children, onClick, secondary = false, className = '', disabled = false, type = 'button' }) { return <button type={type} disabled={disabled} onClick={onClick} className={`${secondary ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'bg-forest-800 text-white shadow-sm shadow-forest-900/15 hover:bg-forest-900'} inline-flex items-center justify-center gap-2 rounded-[10px] px-3.5 py-2.5 text-[13px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}>{children}</button>; }
function Heading({ eyebrow, title, description, action }) { return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-[14px] font-bold uppercase tracking-[.18em] text-forest-700">{eyebrow}</p><h1 className="font-display text-[25px] font-extrabold tracking-[-.045em] text-slate-900 sm:text-[28px]">{title}</h1><p className="mt-1.5 text-[13px] text-slate-500">{description}</p></div>{action}</div>; }
function Panel({ children, className = '' }) { return <section className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_16px_-14px_rgba(20,45,36,.3)] ${className}`}>{children}</section>; }
function PanelTitle({ title, subtitle, action }) { return <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-display text-[14px] font-extrabold text-slate-800">{title}</h2>{subtitle && <p className="mt-1 text-[14px] text-slate-400">{subtitle}</p>}</div>{action}</div>; }

function Dashboard({ user, onPage, onStudent, onPayment, onReceipt }) {
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { request('/api/dashboard').then(setData).catch(e => setError(e.message)); }, []);
  const statuses = Object.fromEntries((data?.statuses || []).map(row => [row.status, row.total]));
  const percent = data?.totalStudents ? Math.round(((statuses.Active || 0) / data.totalStudents) * 100) : 0;
  const hour = new Date().getHours(); const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return <>
    <Heading eyebrow="School office · overview" title={`${greeting}, ${user.name.split(' ')[0]}`} description="Here’s the latest picture of student records and school fee payments." action={<Button onClick={onStudent}><Plus size={14} /> Register student</Button>} />
    {error && <Notice>{error}</Notice>}
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="Student records" value={data?.totalStudents ?? '—'} note="All students on the register" icon={UsersRound} tint="green" change="Permanent school IDs" />
      <Metric title="Active students" value={statuses.Active ?? '—'} note={`${percent}% of all student records`} icon={GraduationCap} tint="blue" change={`${statuses['On hold'] || 0} currently on hold`} />
      <Metric title="Received today" value={data ? money(data.today) : '—'} note="Payments recorded today" icon={Wallet} tint="amber" change="Ghana cedis" />
      <Metric title="Received this month" value={data ? money(data.month) : '—'} note="Payments recorded this month" icon={CreditCard} tint="purple" change="All payment methods" />
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(310px,.8fr)]">
      <Panel><PanelTitle title="Recent payments" subtitle="The latest fee payments entered by your school team" action={<button onClick={() => onPage('payments')} className="inline-flex items-center gap-1 text-[13px] font-bold text-forest-700 hover:text-forest-900">View all <ArrowRight size={13} /></button>} />
        <div className="overflow-x-auto"><table className="w-full min-w-[630px] text-left"><thead><tr className="bg-slate-50/70 text-[13px] font-bold uppercase tracking-[.12em] text-slate-400"><th className="px-5 py-3">Student</th><th className="px-3 py-3">Receipt number</th><th className="px-3 py-3">Payment date</th><th className="px-5 py-3 text-right">Amount</th></tr></thead><tbody>{!data ? <TableLoading cols={4} /> : data.recent.length ? data.recent.map(row => <tr key={row.id} className="border-t border-slate-100 transition hover:bg-slate-50/60"><td className="px-5 py-3"><StudentName name={row.full_name} code={row.student_code} /></td><td className="px-3 py-3 text-[13px] font-semibold text-slate-600">{row.receipt_number}</td><td className="px-3 py-3 text-[13px] text-slate-500">{dateLabel(row.paid_at)}</td><td className="px-5 py-3 text-right"><button onClick={() => onReceipt(row.id)} className="text-[13px] font-extrabold text-forest-800 hover:underline">{money(row.amount)}</button></td></tr>) : <tr><td colSpan="4" className="px-5 py-12 text-center text-[13px] text-slate-400">No payments have been recorded yet.</td></tr>}</tbody></table></div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3"><span className="text-[14px] text-slate-400">Receipts are linked to each saved payment.</span><button onClick={() => onPage('payments')} className="text-[14px] font-bold text-forest-700">Payment history <ArrowRight size={12} className="ml-1 inline" /></button></div>
      </Panel>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <Panel><PanelTitle title="Quick actions" subtitle="Common tasks for the school office" /><div className="grid grid-cols-2 gap-2.5 p-4">
          <QuickAction icon={UserRoundPlus} title="Register student" description="Add to school register" onClick={onStudent} />
          <QuickAction icon={Wallet} title="Record payment" description="Issue an official receipt" onClick={onPayment} />
          <QuickAction icon={Search} title="Find a student" description="Search by name or ID" onClick={() => onPage('students')} />
          <QuickAction icon={ReceiptText} title="Payment history" description="View or reprint receipts" onClick={() => onPage('payments')} />
        </div></Panel>
        <Panel className="bg-gradient-to-br from-forest-900 to-forest-800 text-white"><div className="p-5"><div className="flex items-center justify-between"><div className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-amber-200"><BookOpen size={17} /></div><Sparkles size={16} className="text-amber-200/70" /></div><p className="mt-4 text-[14px] font-bold uppercase tracking-[.16em] text-emerald-100/55">Student register</p><div className="mt-1 flex items-end justify-between gap-3"><div><p className="font-display text-[27px] font-extrabold tracking-tight">{data?.totalStudents ?? '—'}</p><p className="mt-1 text-[14px] text-white/55">Permanent student records</p></div><button onClick={() => onPage('students')} className="rounded-xl border border-white/15 p-2.5 text-white/75 transition hover:bg-white/10"><ArrowUpRight size={15} /></button></div><div className="mt-4 h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-amber-300" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-[13px] text-white/45">{statuses.Active || 0} active · {statuses['On hold'] || 0} on hold · {(statuses.Withdrawn || 0) + (statuses.Transferred || 0) + (statuses.Graduated || 0)} former</p></div></Panel>
      </div>
    </div>
  </>;
}

function Metric({ title, value, note, icon: Icon, tint, change }) {
  const colors = { green: 'bg-emerald-50 text-forest-700', blue: 'bg-sky-50 text-sky-700', amber: 'bg-amber-50 text-amber-700', purple: 'bg-violet-50 text-violet-700' };
  return <Panel className="p-4 sm:p-[18px]"><div className="flex items-start justify-between"><div><p className="text-[13px] font-semibold text-slate-500">{title}</p><p className="mt-3 font-display text-[24px] font-extrabold leading-none tracking-[-.045em] text-slate-900">{value}</p></div><div className={`grid size-9 place-items-center rounded-xl ${colors[tint]}`}><Icon size={17} /></div></div><p className="mt-2 text-[14px] text-slate-400">{note}</p><div className="mt-3 border-t border-slate-100 pt-2.5 text-[13px] font-medium text-slate-400">{change}</div></Panel>;
}
function QuickAction({ icon: Icon, title, description, onClick }) { return <button onClick={onClick} className="group rounded-xl border border-slate-200/80 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/30"><div className="mb-3 grid size-8 place-items-center rounded-lg bg-emerald-50 text-forest-700 transition group-hover:bg-forest-800 group-hover:text-white"><Icon size={15} /></div><p className="text-[14px] font-bold text-slate-700">{title}</p><p className="mt-1 text-[13px] text-slate-400">{description}</p></button>; }
function StudentName({ name, code, large = false }) { return <div className="flex items-center gap-2.5"><span className={`grid shrink-0 place-items-center rounded-xl bg-emerald-50 font-display font-extrabold text-forest-800 ${large ? 'size-10 text-[13px]' : 'size-8 text-[14px]'}`}>{initials(name)}</span><span><span className={`block font-semibold text-slate-800 ${large ? 'text-[13px]' : 'text-[13px]'}`}>{name}</span><span className="mt-0.5 block text-[13px] font-medium tracking-wide text-slate-400">{code}</span></span></div>; }
function TableLoading({ cols }) { return <tr><td colSpan={cols} className="px-5 py-12 text-center text-[13px] text-slate-400">Loading records…</td></tr>; }
function Notice({ children }) { return <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-[13px] font-medium text-rose-700">{children}</div>; }

function Students({ csrf, onStudent, onProfile, notify }) {
  const [rows, setRows] = useState([]); const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let current = true; setLoading(true); request(`/api/students?q=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`).then(result => { if (current) { setRows(result.students); setError(''); } }).catch(e => current && setError(e.message)).finally(() => current && setLoading(false)); return () => { current = false; }; }, [search, status]);
  const updateStatus = async (id, next) => { if (!next) return; try { await request(`/api/students/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next, reason: 'Updated from student register' }) }, csrf); notify('Student status updated.'); setRows(current => current.map(row => row.id === id ? { ...row, status: next } : row)); } catch (e) { notify(e.message); } };
  return <>
    <Heading eyebrow="School records" title="Student register" description="Find students and manage their current status." action={<Button onClick={onStudent}><Plus size={14} /> Register student</Button>} />
    {error && <Notice>{error}</Notice>}
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div className="relative min-w-[220px] flex-1 sm:max-w-[390px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, TK ID or class…" className="form-control h-9 pl-9 text-[13px]" /></div>
        <label className="flex items-center gap-2 text-[14px] font-semibold text-slate-400"><SlidersHorizontal size={13} /><select value={status} onChange={e => setStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-semibold text-slate-600 outline-none focus:border-emerald-500"><option value="">All statuses</option>{STATUSES.map(item => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[790px] text-left"><thead><tr className="bg-slate-50/70 text-[13px] font-bold uppercase tracking-[.12em] text-slate-400"><th className="px-5 py-3">Student</th><th className="px-3 py-3">Class</th><th className="px-3 py-3">Admission date</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Fees paid</th><th className="px-5 py-3 text-right">Update status</th></tr></thead><tbody>
        {loading ? <TableLoading cols={6} /> : rows.length ? rows.map(student => <tr key={student.id} className="border-t border-slate-100 transition hover:bg-slate-50/70"><td className="px-5 py-3"><button onClick={() => onProfile(student.id)} title={`Open ${student.full_name}'s profile`} className="rounded-xl text-left outline-none transition hover:ring-2 hover:ring-emerald-200 focus:ring-2 focus:ring-emerald-400"><StudentName name={student.full_name} code={student.student_code} /></button></td><td className="px-3 py-3 text-[13px] font-medium text-slate-600">{student.class_name}</td><td className="px-3 py-3 text-[13px] text-slate-500">{dateLabel(student.admission_date)}</td><td className="px-3 py-3"><StatusBadge value={student.status} /></td><td className="px-3 py-3 text-right text-[13px] font-bold text-slate-700">{money(student.total_paid)}</td><td className="px-5 py-3 text-right"><select aria-label={`Update ${student.full_name} status`} onChange={e => updateStatus(student.id, e.target.value)} value="" className="max-w-[135px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[14px] font-semibold text-slate-500 outline-none focus:border-emerald-500"><option value="">Change…</option>{STATUSES.filter(item => item !== student.status).map(item => <option key={item}>{item}</option>)}</select></td></tr>) : <tr><td colSpan="6" className="px-5 py-16 text-center"><div className="mx-auto mb-3 grid size-10 place-items-center rounded-2xl bg-slate-100 text-slate-400"><UsersRound size={17} /></div><p className="text-[13px] font-semibold text-slate-600">{search || status ? 'No matching students' : 'Your student register is ready'}</p><p className="mt-1 text-[14px] text-slate-400">{search || status ? 'Try a different name, ID or status.' : 'Add the first student to begin building your school records.'}</p>{!search && !status && <button onClick={onStudent} className="mt-4 text-[13px] font-bold text-forest-700">Register a student <ArrowRight size={12} className="ml-1 inline" /></button>}</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3"><span className="text-[14px] text-slate-400">{loading ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'student' : 'students'}`}</span><span className="text-[13px] text-slate-400">TK IDs stay with students permanently</span></div>
    </Panel>
  </>;
}

function StatusBadge({ value }) {
  const config = value === 'Active' ? ['bg-emerald-50 text-emerald-700', 'bg-emerald-500'] : value === 'On hold' ? ['bg-amber-50 text-amber-700', 'bg-amber-500'] : ['bg-slate-100 text-slate-500', 'bg-slate-400'];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold ${config[0]}`}><span className={`size-1.5 rounded-full ${config[1]}`} />{value}</span>;
}

function Payments({ onPayment, onReceipt }) {
  const [rows, setRows] = useState([]); const [search, setSearch] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let current = true; setLoading(true); request(`/api/payments?q=${encodeURIComponent(search)}`).then(result => { if (current) { setRows(result.payments); setError(''); } }).catch(e => current && setError(e.message)).finally(() => current && setLoading(false)); return () => { current = false; }; }, [search]);
  const total = useMemo(() => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0), [rows]);
  return <>
    <Heading eyebrow="School fees" title="Payments & receipts" description="Review payments and open a saved receipt to print another copy." action={<Button onClick={onPayment}><Plus size={14} /> Record payment</Button>} />
    {error && <Notice>{error}</Notice>}
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><Panel className="flex items-center gap-3 p-4"><div className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-forest-700"><ReceiptText size={16} /></div><div><p className="text-[14px] text-slate-400">Payments listed</p><p className="mt-1 font-display text-[17px] font-extrabold text-slate-800">{loading ? '—' : rows.length}</p></div></Panel><Panel className="flex items-center gap-3 p-4"><div className="grid size-9 place-items-center rounded-xl bg-amber-50 text-amber-700"><Wallet size={16} /></div><div><p className="text-[14px] text-slate-400">Total in current results</p><p className="mt-1 font-display text-[17px] font-extrabold text-slate-800">{loading ? '—' : money(total)}</p></div></Panel><Panel className="flex items-center gap-3 p-4"><div className="grid size-9 place-items-center rounded-xl bg-sky-50 text-sky-700"><ShieldCheck size={16} /></div><div><p className="text-[14px] text-slate-400">Receipt status</p><p className="mt-1 text-[13px] font-bold text-slate-700">Issued on save</p></div></Panel></div>
    <Panel><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5"><div><h2 className="font-display text-[14px] font-extrabold text-slate-800">Payment history</h2><p className="mt-1 text-[14px] text-slate-400">Search by student name or permanent school ID.</p></div><div className="relative w-full sm:max-w-[310px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student or TK ID…" className="form-control h-9 pl-9 text-[13px]" /></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="bg-slate-50/70 text-[13px] font-bold uppercase tracking-[.12em] text-slate-400"><th className="px-5 py-3">Student</th><th className="px-3 py-3">Receipt no.</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Method</th><th className="px-3 py-3 text-right">Amount</th><th className="px-5 py-3 text-right">Receipt</th></tr></thead><tbody>
        {loading ? <TableLoading cols={6} /> : rows.length ? rows.map(row => <tr key={row.id} className="border-t border-slate-100 transition hover:bg-slate-50/70"><td className="px-5 py-3"><StudentName name={row.full_name} code={`${row.student_code} · ${row.class_name}`} /></td><td className="px-3 py-3 text-[13px] font-semibold text-slate-600">{row.receipt_number}</td><td className="px-3 py-3 text-[13px] text-slate-500">{dateLabel(row.paid_at)}</td><td className="px-3 py-3"><span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-[13px] font-semibold text-slate-600"><CreditCard size={11} />{row.method}</span></td><td className="px-3 py-3 text-right text-[13px] font-extrabold text-slate-800">{money(row.amount)}</td><td className="px-5 py-3 text-right"><button onClick={() => onReceipt(row.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[14px] font-bold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-forest-800"><FileText size={12} /> View receipt</button></td></tr>) : <tr><td colSpan="6" className="px-5 py-16 text-center"><div className="mx-auto mb-3 grid size-10 place-items-center rounded-2xl bg-slate-100 text-slate-400"><ReceiptText size={17} /></div><p className="text-[13px] font-semibold text-slate-600">{search ? 'No matching payments' : 'No payments recorded yet'}</p><p className="mt-1 text-[14px] text-slate-400">{search ? 'Try another name or student ID.' : 'Verified school payments will appear here with their receipts.'}</p>{!search && <button onClick={onPayment} className="mt-4 text-[13px] font-bold text-forest-700">Record a payment <ArrowRight size={12} className="ml-1 inline" /></button>}</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3"><span className="text-[14px] text-slate-400">{loading ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'payment' : 'payments'}`}</span><span className="text-[13px] text-slate-400">Payments are entered manually by authorised staff.</span></div>
    </Panel>
  </>;
}

function Dialog({ title, description, children, onClose, wide = false, extraWide = false }) { return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className={`max-h-[94vh] w-full overflow-hidden rounded-2xl bg-white shadow-2xl ${extraWide ? 'max-w-[1000px]' : wide ? 'max-w-[820px]' : 'max-w-[560px]'}`}><header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="font-display text-[16px] font-extrabold text-slate-900">{title}</h2><p className="mt-1 text-[13px] text-slate-500">{description}</p></div><button onClick={onClose} className="rounded-lg bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200"><X size={15} /></button></header>{children}</section></div>; }
function StudentDialog({ csrf, onClose, onSaved }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event) => { event.preventDefault(); setError(''); setBusy(true); const body = Object.fromEntries(new FormData(event.currentTarget)); try { const result = await request('/api/students', { method: 'POST', body: JSON.stringify(body) }, csrf); onSaved(`Student registered with ID ${result.student.student_code}.`); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Dialog title="Register a student" description="Add a permanent student record to the school register." onClose={onClose} wide><form onSubmit={submit} className="max-h-[calc(94vh-70px)] overflow-y-auto px-5 py-5 sm:px-6"><div className="mb-4 flex items-start gap-3 rounded-xl bg-emerald-50/80 p-3.5"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-forest-700"><BadgeCheck size={16} /></div><p className="text-[14px] leading-5 text-emerald-900/75">A unique TK number is assigned when the record is saved. The student keeps the same ID if their status or class changes.</p></div>
    <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2"><Field label="Student full name *" className="sm:col-span-2"><input name="full_name" required maxLength="160" placeholder="Enter the student’s full name" className="form-control" /></Field><Field label="Date of birth"><input name="date_of_birth" type="date" className="form-control" /></Field><Field label="Gender"><select name="gender" className="form-control"><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option></select></Field><Field label="Admission date *"><input name="admission_date" type="date" defaultValue={today()} required className="form-control" /></Field><Field label="Class / level *"><input name="class_name" required placeholder="e.g. Primary 4" className="form-control" /></Field><Field label="Academic year"><input name="academic_year" placeholder="e.g. 2026/2027" className="form-control" /></Field><Field label="Home address"><input name="address" maxLength="240" placeholder="Residential address" className="form-control" /></Field><Field label="Parent / guardian name"><input name="guardian_name" maxLength="160" placeholder="Full name" className="form-control" /></Field><Field label="Relationship to student"><input name="guardian_relationship" maxLength="50" placeholder="e.g. Mother" className="form-control" /></Field><Field label="Guardian phone"><input name="guardian_phone" type="tel" maxLength="40" placeholder="Phone number" className="form-control" /></Field><Field label="Alternative phone"><input name="guardian_alt_phone" type="tel" maxLength="40" placeholder="Optional" className="form-control" /></Field><Field label="Guardian email" className="sm:col-span-2"><input name="guardian_email" type="email" maxLength="160" placeholder="Optional email address" className="form-control" /></Field><Field label="Notes" className="sm:col-span-2"><textarea name="notes" maxLength="1000" placeholder="Optional school record notes" rows="2" className="form-control resize-y" /></Field></div>
    {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[14px] font-medium text-rose-700">{error}</p>}
    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-[13px] text-slate-400">Fields marked * are required.</span><div className="flex gap-2"><Button secondary onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save student'}</Button></div></div>
  </form></Dialog>;
}

function PaymentDialog({ csrf, onClose, onSaved, onReceipt }) {
  const [students, setStudents] = useState([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  useEffect(() => { request('/api/students?status=Active').then(result => setStudents(result.students)).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const submit = async (event) => { event.preventDefault(); setError(''); setBusy(true); const body = Object.fromEntries(new FormData(event.currentTarget)); try { const result = await request('/api/payments', { method: 'POST', body: JSON.stringify(body) }, csrf); onSaved(`Payment recorded. Receipt ${result.payment.receipt_number} issued.`); onReceipt(result.payment.id); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Dialog title="Record a payment" description="Enter a verified fee payment and issue its official receipt." onClose={onClose} wide><form onSubmit={submit} className="max-h-[calc(94vh-70px)] overflow-y-auto px-5 py-5 sm:px-6"><div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 p-3.5"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-amber-700"><Wallet size={16} /></div><p className="text-[14px] leading-5 text-amber-900/75">Record cash already received or a transfer confirmed by the school. The system does not verify payments with a bank or mobile-money provider.</p></div>
    <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2"><Field label="Student *" className="sm:col-span-2"><select name="student_id" required className="form-control" defaultValue=""><option value="" disabled>{loading ? 'Loading students…' : students.length ? 'Choose an active student' : 'No active students available'}</option>{students.map(student => <option key={student.id} value={student.id}>{student.student_code} · {student.full_name} ({student.class_name})</option>)}</select></Field><Field label="Amount received (GHS) *"><input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" className="form-control" /></Field><Field label="Payment date *"><input name="paid_at" type="date" defaultValue={today()} required className="form-control" /></Field><Field label="Payment method *"><select name="method" required defaultValue="" className="form-control"><option value="" disabled>Choose a method</option>{METHODS.map(method => <option key={method}>{method}</option>)}</select></Field><Field label="Reference / transaction number"><input name="reference" maxLength="100" placeholder="If applicable" className="form-control" /></Field><Field label="Fee description *" className="sm:col-span-2"><input name="fee_description" maxLength="160" required placeholder="e.g. Term 1 fees" className="form-control" /></Field><Field label="Academic year"><input name="academic_year" placeholder="e.g. 2026/2027" className="form-control" /></Field></div>
    {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[14px] font-medium text-rose-700">{error}</p>}
    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-[13px] text-slate-400">A receipt number is created on save.</span><div className="flex gap-2"><Button secondary onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || loading || !students.length}>{busy ? 'Saving…' : 'Save & issue receipt'}</Button></div></div>
  </form></Dialog>;
}

function StudentDetailDialog({ id, csrf, onClose, onUpdated, onReceipt, notify }) {
  const [record, setRecord] = useState(null); const [loading, setLoading] = useState(true); const [mode, setMode] = useState('view'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => { setLoading(true); try { const result = await request(`/api/students/${id}`); setRecord(result); setError(''); } catch (e) { setError(e.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [id]);
  const submitProfile = async (event) => { event.preventDefault(); setError(''); setBusy(true); const body = Object.fromEntries(new FormData(event.currentTarget)); try { await request(`/api/students/${id}/profile`, { method: 'PATCH', body: JSON.stringify(body) }, csrf); await load(); setMode('view'); onUpdated(); notify('Student profile updated.'); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const submitClass = async (event) => { event.preventDefault(); setError(''); setBusy(true); const body = Object.fromEntries(new FormData(event.currentTarget)); try { await request(`/api/students/${id}/class`, { method: 'PATCH', body: JSON.stringify(body) }, csrf); await load(); setMode('view'); onUpdated(); notify('Student class placement updated.'); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const student = record?.student; const guardian = record?.guardians?.[0];
  return <Dialog title={student ? `${student.full_name} · ${student.student_code}` : 'Student profile'} description="Student details, class history and payments" onClose={onClose} extraWide>
    {loading && !student ? <div className="p-12 text-center text-[13px] text-slate-400">Loading student profile…</div> : error && !student ? <div className="p-6 text-[13px] text-rose-700">{error}</div> : student && <div className="max-h-[calc(94vh-76px)] overflow-y-auto p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-slate-50 p-4 sm:p-5">
        <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-white font-display text-[14px] font-extrabold text-forest-800 shadow-sm">{initials(student.full_name)}</span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-[18px] font-extrabold tracking-tight text-slate-900">{student.full_name}</h3><StatusBadge value={student.status} /></div><p className="mt-1 text-[12px] font-medium text-slate-500">{student.student_code} <span className="px-1 text-slate-300">·</span> {student.class_name}{student.academic_year ? ` · ${student.academic_year}` : ''}</p></div></div>
        <div className="flex flex-wrap gap-2"><Button secondary onClick={() => { setError(''); setMode('profile'); }}><Pencil size={13} /> Edit details</Button><Button onClick={() => { setError(''); setMode('class'); }}><MoveRight size={14} /> Promote / change class</Button></div>
      </div>
      {error && <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[11px] font-medium text-rose-700">{error}</div>}
      {mode === 'profile' && <Panel className="mb-5"><PanelTitle title="Edit student and guardian details" subtitle="Update the registered contact and biodata fields." /><form onSubmit={submitProfile} className="grid gap-3.5 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Student full name *" className="sm:col-span-2"><input name="full_name" required defaultValue={student.full_name} className="form-control" /></Field>
        <Field label="Date of birth"><input name="date_of_birth" type="date" defaultValue={student.date_of_birth || ''} className="form-control" /></Field>
        <Field label="Gender"><select name="gender" defaultValue={student.gender || ''} className="form-control"><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option></select></Field>
        <Field label="Home address" className="sm:col-span-2"><input name="address" defaultValue={student.address || ''} className="form-control" /></Field>
        <Field label="Parent / guardian name"><input name="guardian_name" defaultValue={guardian?.full_name || student.guardian_name || ''} className="form-control" /></Field>
        <Field label="Relationship"><input name="guardian_relationship" defaultValue={guardian?.student_relationship || student.guardian_relationship || ''} className="form-control" /></Field>
        <Field label="Guardian phone"><input name="guardian_phone" type="tel" defaultValue={guardian?.phone || student.guardian_phone || ''} className="form-control" /></Field>
        <Field label="Alternative phone"><input name="guardian_alt_phone" type="tel" defaultValue={guardian?.alt_phone || student.guardian_alt_phone || ''} className="form-control" /></Field>
        <Field label="Guardian email" className="sm:col-span-2"><input name="guardian_email" type="email" defaultValue={guardian?.email || student.guardian_email || ''} className="form-control" /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows="2" defaultValue={student.notes || ''} className="form-control resize-y" /></Field>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2"><Button secondary onClick={() => setMode('view')}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</Button></div>
      </form></Panel>}
      {mode === 'class' && <Panel className="mb-5"><PanelTitle title="Promote or change class" subtitle="This keeps the previous placement in the student's class history." /><form onSubmit={submitClass} className="grid gap-3.5 p-4 sm:grid-cols-3 sm:p-5">
        <Field label="New class / level *"><input name="class_name" required defaultValue={student.class_name} placeholder="e.g. KG2 b" className="form-control" /></Field>
        <Field label="Academic year"><input name="academic_year" defaultValue={student.academic_year || ''} placeholder="e.g. 2026/2027" className="form-control" /></Field>
        <Field label="Effective from *"><input name="effective_date" type="date" required defaultValue={today()} className="form-control" /></Field>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-3"><Button secondary onClick={() => setMode('view')}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new placement'}</Button></div>
      </form></Panel>}
      {mode === 'view' && <>
        <div className="mb-4 grid gap-3 sm:grid-cols-3"><Panel className="flex items-center gap-3 p-4"><div className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-forest-700"><Wallet size={16} /></div><div><p className="text-[10px] text-slate-500">Total paid</p><p className="mt-1 font-display text-[16px] font-extrabold text-slate-900">{money(student.total_paid)}</p></div></Panel><Panel className="flex items-center gap-3 p-4"><div className="grid size-9 place-items-center rounded-xl bg-sky-50 text-sky-700"><ReceiptText size={16} /></div><div><p className="text-[10px] text-slate-500">Payments recorded</p><p className="mt-1 font-display text-[16px] font-extrabold text-slate-900">{record.payments.length}</p></div></Panel><Panel className="flex items-center gap-3 p-4"><div className="grid size-9 place-items-center rounded-xl bg-amber-50 text-amber-700"><CalendarDays size={16} /></div><div><p className="text-[10px] text-slate-500">Admission date</p><p className="mt-1 font-display text-[13px] font-bold text-slate-800">{dateLabel(student.admission_date)}</p></div></Panel></div>
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Panel><PanelTitle title="Student details" subtitle="Personal information on the school record" /><div className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:p-5"><DetailValue label="Full name" value={student.full_name} /><DetailValue label="Student ID" value={student.student_code} /><DetailValue label="Date of birth" value={dateLabel(student.date_of_birth)} /><DetailValue label="Gender" value={student.gender || 'Not recorded'} /><DetailValue label="Current class" value={`${student.class_name}${student.academic_year ? ` · ${student.academic_year}` : ''}`} /><DetailValue label="Status" value={student.status} /><DetailValue label="Admission date" value={dateLabel(student.admission_date)} /><DetailValue label="Home address" value={student.address || 'Not recorded'} full /></div></Panel>
          <Panel><PanelTitle title="Parent / guardian" subtitle="Primary contact recorded for this student" /><div className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:p-5"><DetailValue label="Full name" value={guardian?.full_name || student.guardian_name || 'Not recorded'} /><DetailValue label="Relationship" value={guardian?.student_relationship || student.guardian_relationship || 'Not recorded'} /><DetailValue label="Phone" value={guardian?.phone || student.guardian_phone || 'Not recorded'} icon={Phone} /><DetailValue label="Alternative phone" value={guardian?.alt_phone || student.guardian_alt_phone || 'Not recorded'} icon={Phone} /><DetailValue label="Email" value={guardian?.email || student.guardian_email || 'Not recorded'} icon={Mail} full /><DetailValue label="Address" value={guardian?.address || student.address || 'Not recorded'} icon={MapPin} full /></div></Panel>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel><PanelTitle title="Class history" subtitle="Previous and current placements" /><div className="overflow-x-auto"><table className="w-full min-w-[460px] text-left"><thead><tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400"><th className="px-4 py-3">Class</th><th className="px-3 py-3">Academic year</th><th className="px-3 py-3">From</th><th className="px-4 py-3">To</th></tr></thead><tbody>{record.enrollments.length ? record.enrollments.map(item => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3 text-[12px] font-semibold text-slate-700">{item.class_name}{item.status === 'Active' && <span className="ml-2 text-[10px] font-bold text-emerald-700">Current</span>}</td><td className="px-3 py-3 text-[11px] text-slate-500">{item.academic_year || '—'}</td><td className="px-3 py-3 text-[11px] text-slate-500">{dateLabel(item.start_date)}</td><td className="px-4 py-3 text-[11px] text-slate-500">{item.end_date ? dateLabel(item.end_date) : 'Present'}</td></tr>) : <tr><td colSpan="4" className="px-4 py-8 text-center text-[11px] text-slate-400">No class history recorded yet.</td></tr>}</tbody></table></div></Panel>
          <Panel><PanelTitle title="Payment history" subtitle="Payments and receipts linked to this student's account" /><div className="overflow-x-auto"><table className="w-full min-w-[510px] text-left"><thead><tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400"><th className="px-4 py-3">Date / description</th><th className="px-3 py-3">Receipt</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{record.payments.length ? record.payments.map(payment => <tr key={payment.id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="text-[12px] font-semibold text-slate-700">{payment.fee_description}</p><p className="mt-1 text-[10px] text-slate-400">{dateLabel(payment.paid_at)} · {payment.method}</p></td><td className="px-3 py-3"><button onClick={() => onReceipt(payment.id)} className="inline-flex items-center gap-1 text-[10px] font-bold text-forest-700 hover:underline"><FileText size={12} />{payment.receipt_number}</button></td><td className="px-4 py-3 text-right text-[12px] font-extrabold text-slate-800">{money(payment.amount)}</td></tr>) : <tr><td colSpan="3" className="px-4 py-8 text-center text-[11px] text-slate-400">No payments recorded for this student.</td></tr>}</tbody></table></div></Panel>
        </div>
      </>}
    </div>}
  </Dialog>;
}
function DetailValue({ label, value, icon: Icon, full = false }) { return <div className={full ? 'col-span-2' : ''}><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1.5 flex items-start gap-1.5 break-words text-[12px] font-medium leading-5 text-slate-700">{Icon && <Icon size={13} className="mt-1 shrink-0 text-slate-400" />}{value || 'Not recorded'}</p></div>; }

function ReceiptDialog({ id, onClose, notify }) {
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { request(`/api/receipts/${id}`).then(setData).catch(e => setError(e.message)); }, [id]);
  const print = () => { document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 700); };
  const share = async () => {
    const r=data?.receipt;if(!r)return;
    const text=[SCHOOL,'OFFICIAL PAYMENT RECEIPT',`Receipt no.: ${r.receipt_number}`,`Date: ${dateLabel(r.paid_at)}`,`Received from: ${r.full_name} (${r.student_code})`,`Class: ${r.class_name}`,`Payment: ${r.fee_description}${r.academic_year?` · ${r.academic_year}`:''}`,`Amount: ${money(r.amount)} (${data.amount_words})`,`Method: ${r.method}${r.reference?` · Ref ${r.reference}`:''}`].join('\n');
    try{if(navigator.share){await navigator.share({title:`Receipt ${r.receipt_number}`,text});}else{await navigator.clipboard.writeText(text);notify('Receipt details copied. You can paste them into a message.');}}catch(e){if(e.name!=='AbortError')notify('Could not share the receipt. Try printing it instead.');}
  };
  const receipt = data?.receipt;
  return <Dialog title="Official payment receipt" description="Review the issued receipt or print another copy." onClose={onClose} wide>
    {error ? <div className="p-6 text-[13px] text-rose-700">{error}</div> : !receipt ? <div className="p-10 text-center text-[13px] text-slate-400">Loading receipt…</div> : <div className="flex max-h-[calc(94vh-76px)] min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
      <article className="print-receipt mx-auto max-w-[700px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3 border-b-2 border-forest-900 pb-4"><img src="/school-logo.jpg" alt="School crest" className="size-[58px] shrink-0 object-contain" /><div className="flex-1 text-center"><h3 className="font-display text-[15px] font-extrabold leading-snug tracking-wide text-forest-900">{SCHOOL}</h3><p className="mt-1 text-[12px] leading-5 text-slate-500">H/No. 2548 Asha-Town, Kumasi<br />Telephone: 0547 659 741 · Committed to Excellence</p></div><span className="hidden rounded bg-emerald-50 px-2 py-1.5 text-[10px] font-extrabold tracking-[.13em] text-forest-800 sm:block">OFFICIAL RECEIPT</span></div>
        <div className="my-4 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-[14px]"><span><b className="text-slate-500">Receipt no.</b><strong className="ml-2 text-forest-900">{receipt.receipt_number}</strong></span><span><b className="text-slate-500">Date</b><strong className="ml-2 text-slate-800">{dateLabel(receipt.paid_at)}</strong></span></div>
        <div className="space-y-3.5 text-[12px]"><ReceiptLine label="Received from" value={`${receipt.full_name} · ${receipt.student_code}`} /><ReceiptLine label="Class" value={receipt.class_name} /><ReceiptLine label="Being payment in respect of" value={`${receipt.fee_description}${receipt.academic_year ? ` · ${receipt.academic_year}` : ''}`} /><ReceiptLine label="Amount received" value={money(receipt.amount)} prominent /><ReceiptLine label="Amount in words" value={data.amount_words} /><ReceiptLine label="Payment method" value={`${receipt.method}${receipt.reference ? ` · ${receipt.reference}` : ''}`} /></div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-dashed border-slate-300 pt-4 text-[13px] text-slate-500"><div>Received by<strong className="mt-1 block text-[14px] text-slate-800">{receipt.received_by_name}</strong></div><div>Student payments recorded<strong className="mt-1 block text-[14px] text-slate-800">{money(receipt.total_paid)}</strong></div></div>
        <div className="mt-7 flex justify-between gap-6"><span className="w-[42%] border-t border-slate-400 pt-1.5 text-[13px] text-slate-500">Cashier’s signature</span><span className="w-[42%] border-t border-slate-400 pt-1.5 text-[13px] text-slate-500">School stamp / signature</span></div>
      </article>
      </div>
      <div className="print-hide flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-6"><span className="hidden text-[11px] text-slate-400 sm:inline">Print a copy or share the receipt details.</span><div className="ml-auto flex gap-2"><Button secondary onClick={onClose}>Close</Button><Button secondary onClick={share}><Share2 size={14} /> Share</Button><Button onClick={print}><Printer size={14} /> Print</Button></div></div>
    </div>}
  </Dialog>;
}
function ReceiptLine({ label, value, prominent = false }) { return <div className="flex items-end gap-2 border-b border-slate-200 pb-1.5"><span className="shrink-0 text-slate-500">{label}</span><span className={`min-w-0 flex-1 text-right font-semibold ${prominent ? 'font-display text-[13px] font-extrabold text-forest-800 sm:text-[16px]' : 'text-slate-800'}`}>{value || '—'}</span></div>; }

export default App;
