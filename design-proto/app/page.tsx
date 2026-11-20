import Link from 'next/link';
import { DevicePreview } from '@/components/proto/DevicePreview';
import { Pulse } from '@/components/proto/Pulse';
import { concepts, screens } from '@/lib/site';

export const metadata = { title: 'Три концепции AniNova 3.0' };

export default function IndexPage() {
  return (
    <main className="ix">
      <div className="ix-wrap">
        <header className="ix-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Pulse size={7} />
            <strong>AniNova 3.0 · B1-A</strong>
            <span>Design exploration</span>
          </div>
          <nav aria-label="Разделы прототипа">
            <a href="#concepts">Концепции</a>
            <a href="#screens">Экраны</a>
            <a href="#responsive">Адаптивность</a>
            <a href="#how">Как запустить</a>
          </nav>
        </header>

        <section className="ix-hero">
          <span className="ix-kicker">
            <Pulse live size={6} /> B1-A · дизайн-исследование
          </span>
          <h1 className="ix-h1">Три концепции. Один продукт. Ни одного изменения в production.</h1>
          <p className="ix-lead">
            Nova Minimal, Nova Editorial и Nova Cinematic собраны на одинаковом наборе из десяти экранов, на одном
            стеке (Next.js App Router + React) и на одних mock-данных. Задача — выбрать направление до интеграции, а
            не обсуждать картинки.
          </p>
          <div className="ix-meta">
            <span>
              <strong>10</strong> экранов × <strong>3</strong> концепции = <strong>30</strong> живых страниц
            </span>
            <span>
              <strong>4</strong> ширины: 390 / 768 / 1440 / 1920
            </span>
            <span>
              <strong>2</strong> темы в каждой концепции
            </span>
            <span>
              <strong>0</strong> внешних зависимостей сверх Next + React
            </span>
          </div>
          <div className="ix-flag">
            <Pulse size={6} />
            Все названия, цифры, «прогресс» и обложки — демонстрационные. Это не данные production-каталога, не
            реальные постеры и не подключение к Supabase.
          </div>
        </section>

        <section id="concepts" aria-labelledby="concepts-h">
          <h2 className="ix-h2" id="concepts-h">
            Концепции
          </h2>
          <div className="ix-grid">
            {concepts.map((c) => (
              <article key={c.id} className="ix-card">
                <div className="ix-card-top">
                  <div>
                    <div className="ix-letter" aria-hidden="true">
                      {c.letter}
                    </div>
                    <h3 className="ix-name" style={{ marginTop: 10 }}>
                      {c.name}
                    </h3>
                    <p className="ix-ru">{c.ru}</p>
                  </div>
                  <span className="ix-ru">{c.themeDefault === 'dark' ? 'тёмная по умолчанию' : 'светлая по умолчанию'}</span>
                </div>
                <p className="ix-sum">{c.summary}</p>
                <div className="ix-swatches">
                  {c.colors.map((s) => (
                    <span key={s.name} className="ix-swatch">
                      <i style={{ background: s.value }} aria-hidden="true" />
                      {s.name} {s.value}
                    </span>
                  ))}
                </div>
                <div className="ix-type">
                  <span>
                    Заголовки: <b>{c.type.display}</b>
                  </span>
                  <span>
                    Текст: <b>{c.type.body}</b>
                  </span>
                </div>
                <div className="ix-lists">
                  <div>
                    <h3>Сильные стороны</h3>
                    <ul>
                      {c.strengths.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>Риски</h3>
                    <ul>
                      {c.risks.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <Link className="ix-open" href={c.path}>
                  Открыть концепцию
                  <span aria-hidden="true">→</span>
                </Link>
                <div className="ix-screenlinks">
                  {screens.map((s) => (
                    <Link key={s.id} href={`${c.path}${s.path}`}>
                      {s.short}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="ix-section" id="screens" aria-labelledby="screens-h">
          <h2 className="ix-h2" id="screens-h">
            Матрица экранов
          </h2>
          <p className="ix-section-lead">
            Один и тот же экран в трёх концепциях — так сравнивается не «красивость», а решения: иерархия, плотность,
            навигация, состояния.
          </p>
          <div className="ix-matrix">
            <table className="ix-table">
              <thead>
                <tr>
                  <th scope="col">Экран</th>
                  <th scope="col">Что проверяем</th>
                  <th scope="col">A · Minimal</th>
                  <th scope="col">B · Editorial</th>
                  <th scope="col">C · Cinematic</th>
                </tr>
              </thead>
              <tbody>
                {screens.map((s) => (
                  <tr key={s.id}>
                    <th scope="row">{s.label}</th>
                    <td className="ix-note">{s.note}</td>
                    {concepts.map((c) => (
                      <td key={c.id}>
                        <Link href={`${c.path}${s.path}`}>{c.letter}</Link>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ix-section" id="responsive" aria-labelledby="responsive-h">
          <h2 className="ix-h2" id="responsive-h">
            Адаптивные варианты
          </h2>
          <p className="ix-section-lead">
            390, 768, 1440 и 1920 — внутри одного iframe, без переключения устройства. Выберите концепцию и экран:
            на мобильной ширине проверяются навигация, карточки, плеер и читалка.
          </p>
          <DevicePreview />
        </section>

        <section className="ix-section" id="how" aria-labelledby="how-h">
          <h2 className="ix-h2" id="how-h">
            Изоляция и запуск
          </h2>
          <p className="ix-section-lead">
            Прототип живёт отдельным приложением в <code>design-proto/</code> рабочего дерева{' '}
            <code>anistream-design</code> (ветка <code>design/aninova-3-b1-exploration-2026-11</code>). Он не
            импортирует <code>app/layout.tsx</code>, <code>app/theme-2026.css</code>, <code>SiteHeader</code> или
            production-плеер и не влияет на сборку основного приложения.
          </p>
          <div className="ix-flag" style={{ display: 'grid', gap: 6, marginTop: 14 }}>
            <span>
              <code>cd design-proto</code> · <code>npm run dev</code> → http://localhost:3311
            </span>
            <span>
              сборка: <code>npm run build</code> · скриншоты: <code>npm run shots</code>
            </span>
            <span>
              документы: <code>docs/ANINOVA_3_DESIGN_SYSTEM.md</code>, <code>docs/ANINOVA_3_DESIGN_COMPARISON.md</code>,{' '}
              <code>docs/ANINOVA_3_RESPONSIVE_SPEC.md</code>
            </span>
          </div>
        </section>

        <footer className="ix-foot">
          <span>AniNova 3.0 · B1-A · дизайн-прототип. Production, Supabase, Redis, secrets и deployment не затрагивались.</span>
          <span>
            Проверки прототипа: отсутствие горизонтальной прокрутки на 390/768/1440/1920, клавиатурная доступность,
            <code>prefers-reduced-motion</code>, адаптивные изображения через <code>next/image</code>, ленивые
            iframe-превью.
          </span>
        </footer>
      </div>
    </main>
  );
}
