const milestones = [
  {
    phase: 'Phase 0',
    title: '구조 정리',
    body: 'src/react 아래에 새 구조를 만들고, 기존 바닐라 엔트리는 유지합니다.',
  },
  {
    phase: 'Phase 1',
    title: '앱 셸 구축',
    body: 'main.tsx, App, AppProviders, router, AppShell을 먼저 고정합니다.',
  },
  {
    phase: 'Phase 2',
    title: '인증 분해',
    body: 'auth.js를 service, rules, page 계층으로 분리할 준비를 합니다.',
  },
];

export function DashboardPage() {
  return (
    <section className="react-page">
      <div className="react-hero-card">
        <span className="react-chip">요약</span>
        <h2>INVEX React 전환 베이스가 준비됐습니다.</h2>
        <p>
          지금 단계의 목표는 기존 코드를 바로 삭제하는 것이 아니라, React 기준 구조를 먼저 세워
          이후 화면 전환을 안전하게 진행하는 것입니다.
        </p>
      </div>

      <div className="react-grid react-grid--three">
        {milestones.map((item) => (
          <article key={item.phase} className="react-card">
            <span className="react-card__eyebrow">{item.phase}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>

      <article className="react-card">
        <h3>현재 포함된 것</h3>
        <p>React 진입점, 라우터, 앱 셸, 그리고 인증/재고/입출고용 placeholder 페이지를 추가했습니다.</p>
      </article>
    </section>
  );
}
