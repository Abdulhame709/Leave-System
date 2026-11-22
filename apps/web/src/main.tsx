import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { confirmExample, type DemoState } from './demo';
import './style.css';

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    file: <><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 13h6M9 17h6"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
    arrow: <path d="M19 12H5m6-6-6 6 6 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    user: <><circle cx="12" cy="8" r="3"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/></>,
    sparkle: <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3ZM19 15l.6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15Z"/>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function App() {
  const [section, setSection] = useState<'overview' | 'onyx'>('overview');
  const [demo, setDemo] = useState<DemoState>('waiting');
  const onyx = section === 'onyx';
  return <div className="layout">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Icon name="sparkle"/></div><div><strong>مساحة</strong><small>إدارة الإجازات</small></div></div>
      <div className="side-label">القائمة الرئيسية</div>
      <nav aria-label="التنقل الرئيسي">
        <button className={!onyx ? 'nav active' : 'nav'} onClick={() => setSection('overview')} aria-current={!onyx ? 'page' : undefined}><Icon name="grid"/> نظرة عامة</button>
        <button className={onyx ? 'nav active' : 'nav'} onClick={() => setSection('onyx')} aria-current={onyx ? 'page' : undefined}><Icon name="check"/> متابعة أونكس</button>
      </nav>
      <div className="side-bottom"><div className="side-help"><Icon name="sparkle"/><strong>خطوة بخطوة</strong><p>نبني تجربة أبسط لإدارة إجازات فريقك.</p></div><div className="side-foot">مساحة الإجازات <span>نسخة تجريبية</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">مساحة الإجازات <span>/</span> <b>{onyx ? 'متابعة أونكس' : 'نظرة عامة'}</b></div><div className="top-tag"><span className="dot"/> واجهة تجريبية</div></header>
      <div className="content">
        <div className="notice"><span className="notice-icon">!</span><span><strong>معاينة أولية فقط.</strong> لا توجد بيانات حقيقية أو اتصال بقاعدة البيانات أو أونكس.</span></div>
        {!onyx ? <>
          <div className="heading"><div><div className="eyebrow">أهلاً بك في مساحة الإجازات <span>✦</span></div><h1>إجازات أكثر تنظيمًا،<br/><em>وفريق أكثر راحة.</em></h1><p>مساحة واحدة تساعد فريقك على تقديم طلبات الإجازة ومتابعتها، بكل وضوح وسهولة.</p><button className="primary" onClick={() => setSection('onyx')}>استكشف متابعة أونكس <Icon name="arrow"/></button></div><div className="hero-art" aria-hidden="true"><div className="art-circle circle-one"/><div className="art-circle circle-two"/><div className="art-card"><div className="art-icon"><Icon name="calendar"/></div><span>طلب إجازة</span><div className="art-line"/><div className="art-line short"/><div className="art-status"><Icon name="check"/> متابعة واضحة</div></div><div className="floating"><Icon name="sparkle"/></div></div></div>
          <div className="section-title"><div><span className="kicker">كل شيء في مكان واحد</span><h2>رحلة الإجازة ببساطة</h2></div><span className="muted">كيف سيعمل النظام؟</span></div>
          <div className="steps"><div className="step"><div className="step-top"><div className="step-icon mint"><Icon name="file"/></div><span>01</span></div><h3>تقديم الطلب</h3><p>يقدّم الموظف طلب الإجازة من هاتفه بدلًا من النموذج الورقي.</p></div><div className="step"><div className="step-top"><div className="step-icon peach"><Icon name="user"/></div><span>02</span></div><h3>مراجعة المسؤول</h3><p>يراجع المسؤول الطلب ويتخذ قراره وفق سياسة المؤسسة.</p></div><div className="step"><div className="step-top"><div className="step-icon purple"><Icon name="check"/></div><span>03</span></div><h3>تأكيد الإدخال</h3><p>تُدخل الموارد البشرية الإجازة في أونكس وتؤكد ذلك في التطبيق.</p></div></div>
          <div className="bottom-note"><div className="note-symbol"><Icon name="clock"/></div><div><strong>الحضور والانصراف يبقى كما هو</strong><p>يستمر تسجيل الحضور عبر أجهزة البصمة وترحيل بياناتها إلى أونكس بالطريقة الحالية.</p></div></div>
        </> : <>
          <div className="page-heading"><div className="eyebrow">الموارد البشرية / أونكس</div><h1>متابعة إدخال الإجازات</h1><p>خطوة إضافية تمنح فريق الموارد البشرية رؤية واضحة لما تم إدخاله في أونكس.</p></div>
          <div className="demo-layout"><section className="demo-card"><div className="demo-card-head"><div><span className="kicker">مثال توضيحي</span><h2>طلب إجازة معتمد</h2></div><span className={'badge '+ (demo === 'waiting' ? 'waiting' : 'confirmed')}>{demo === 'waiting' ? 'بانتظار الإدخال' : 'تم تأكيد الإدخال'}</span></div><p className="demo-description">بعد إدخال الإجازة يدويًا في أونكس، يؤكد موظف الموارد البشرية ذلك هنا.</p><div className="demo-line"><span>حالة الاعتماد</span><strong>معتمد <Icon name="check"/></strong></div><div className="demo-line"><span>حالة الإدخال في أونكس</span><strong aria-live="polite">{demo === 'waiting' ? 'بانتظار الإدخال' : 'تم تأكيد الإدخال'}</strong></div><button className="primary confirm-button" disabled={demo === 'confirmed'} onClick={() => setDemo(confirmExample(demo))}>{demo === 'waiting' ? 'تجربة تأكيد الإدخال' : 'تم التأكيد في المثال'} <Icon name="check"/></button><button className="text-button" onClick={() => setDemo('waiting')}>إعادة المثال</button><p className="demo-foot">هذا مثال مؤقت داخل المتصفح، ولا يحفظ أي تغيير أو يتحقق من أونكس.</p></section><aside className="explain-card"><div className="step-icon mint"><Icon name="check"/></div><h3>لماذا هذه الخطوة؟</h3><p>لتمييز الطلب المعتمد عن الطلب الذي أدخله موظف الموارد البشرية فعليًا في أونكس.</p><div className="divider"/><p>التأكيد اليدوي يساعد على المتابعة، لكنه لا يضمن منع التكرار أو صحة الإدخال دون ربط مع أونكس.</p></aside></div>
        </>}
        <footer>مساحة الإجازات <span>•</span> واجهة أولية قيد التطوير</footer>
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
