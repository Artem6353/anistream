import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminCookieName, verifyAdminCookie } from '@/lib/admin-auth';
import { buildDashboard, type Dashboard } from '@/lib/aninova3/comics/operations/dashboard';
import { parseReviewQuery, type ReviewDetail, type ReviewQuery } from '@/lib/aninova3/comics/operations/review';
import { isCatalogReadConfigured, loadCatalogSnapshot, loadConflictWorkspace, loadRelationWorkspace, loadReviewWorkspace, type ConflictWorkspace, type RelationWorkspace, type ReviewWorkspace } from '@/lib/aninova3/comics/operations/repository';
import {
  REVIEW_REASONS,
  REVIEW_STATUSES,
  type ReviewItemRow,
} from '@/lib/aninova3/comics/operations/model';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Comics · очередь проверки',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;
type Tab = 'dashboard' | 'queue' | 'conflicts' | 'relations';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'dashboard', label: 'Дашборд качества' },
  { id: 'queue', label: 'Очередь проверки' },
  { id: 'conflicts', label: 'Конфликты источников' },
  { id: 'relations', label: 'Связи Anime ↔ Comics' },
];

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : undefined;
}

function parseTab(value: string | undefined): Tab {
  return value === 'queue' || value === 'conflicts' || value === 'relations' ? value : 'dashboard';
}

function href(tab: Tab, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams({ tab });
  for (const [key, value] of Object.entries(extra)) if (value !== undefined && value !== '') params.set(key, value);
  return `/admin/comics/review?${params.toString()}`;
}

function fmt(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function dt(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${date.toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC`;
}

function json(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function shortJson(value: unknown): string {
  const text = json(value).replace(/\s+/g, ' ');
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    missing_ru_title: 'нет подтверждённого RU-названия',
    name_mismatch: 'несовпадение названия',
    duplicate_alias: 'дубль алиаса',
    duplicate_external_id: 'дубль external ID',
    ambiguous_external_id: 'неоднозначный external ID',
    rights_unknown: 'права неизвестны',
    rights_expired: 'права истекли',
    source_conflict: 'конфликт источника',
    unsupported_relation: 'неподдержанная связь',
    unsupported_reading_mode: 'неподдержанный режим чтения',
    manual: 'ручная проверка',
    source_metadata_conflict: 'конфликт метаданных источника',
    kind_unknown: 'неизвестный kind',
    duplicate_public_title: 'дубль публичного названия',
    relation_evidence_conflict: 'конфликт evidence связи',
    ambiguous_people_identity: 'неоднозначная личность автора',
    missing_provenance: 'нет provenance',
  };
  return labels[reason] ?? reason;
}

function queueHref(query: ReviewQuery, page = query.page ?? 1): string {
  return href('queue', {
    reason: query.reason,
    work_id: query.workId,
    status: query.status,
    priority: query.priorityMin?.toString(),
    source: query.source,
    source_conflict: query.sourceConflict ? '1' : undefined,
    ambiguous_external_id: query.ambiguousExternalId ? '1' : undefined,
    relation_evidence_conflict: query.relationEvidenceConflict ? '1' : undefined,
    author_identity_conflict: query.authorIdentityConflict ? '1' : undefined,
    created_from: query.createdFrom?.slice(0, 10),
    created_to: query.createdTo?.slice(0, 10),
    q: query.q,
    group_by_work: query.groupByWork ? '1' : undefined,
    sort: query.sort,
    dir: query.dir,
    page_size: String(query.pageSize ?? 25),
    page: String(page),
  });
}

function itemHref(item: ReviewItemRow, query: ReviewQuery): string {
  return `${queueHref(query)}&item=${encodeURIComponent(item.id)}`;
}

function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={[styles.statValue, tone ? styles[`statValue_${tone}`] : ''].join(' ')}>{typeof value === 'number' ? fmt(value) : value}</strong>
      {hint ? <span className={styles.statHint}>{hint}</span> : null}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={`panel ${styles.section}`}>
      <div className={styles.sectionHead}>
        <h2 className="section-title">{title}</h2>
        {note ? <p className="panel__note">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function DashboardView({ dashboard }: { dashboard: Dashboard }) {
  const reasons = REVIEW_REASONS.filter((reason) => dashboard.review.by_reason[reason] > 0);
  return (
    <div className={styles.stack}>
      <div className={styles.callout}>
        <strong>Метаданные ≠ доступность для чтения.</strong> Счётчики ниже разделены по слоям: метаданные, качество источников и identity, adult/rights, главы и reading sources, публикация. Наличие карточки или external ID не означает, что произведение можно читать.
      </div>

      <Section title="Метаданные и происхождение" note="Сколько записей реально существует в каталоге и какие поля подтверждены. Это не счётчик публикаций.">
        <div className={styles.statsGrid}>
          <Stat label="Работ всего" value={dashboard.metadata.works_total} hint="все B3-C работы" />
          <Stat label="external IDs" value={dashboard.metadata.external_ids} />
          <Stat label="алиасы" value={dashboard.metadata.aliases} />
          <Stat label="люди" value={dashboard.metadata.people} hint={`${fmt(dashboard.metadata.credits)} credits`} />
          <Stat label="связи adaptations" value={dashboard.metadata.adaptations} hint="только записи, не подтверждение" />
          <Stat label="source observations" value={dashboard.metadata.source_observations} hint={`${fmt(dashboard.quality.observation_conflicts)} конфликтных строк`} />
          <Stat label="RU-название подтверждено" value={dashboard.metadata.verified_ru_titles} tone="good" />
          <Stat label="RU-название не подтверждено" value={dashboard.metadata.missing_ru_titles} tone="warn" />
          <Stat label="kind неизвестен" value={dashboard.metadata.unknown_kind} tone="warn" />
        </div>
        <div className={styles.distribution}>
          {Object.entries(dashboard.metadata.works_by_status).map(([status, count]) => (
            <span key={status} className="badge">{status}: {fmt(count)}</span>
          ))}
          {Object.entries(dashboard.metadata.works_by_kind).map(([kind, count]) => (
            <span key={kind} className="badge badge--accent">{kind}: {fmt(count)}</span>
          ))}
        </div>
      </Section>

      <Section title="Качество источников и identity" note="Конфликты и пробелы показываются как есть; ни одно значение не выбирается автоматически.">
        <div className={styles.statsGrid}>
          <Stat label="работ с конфликтом источника" value={dashboard.quality.source_conflict_works} tone="warn" hint={`${fmt(dashboard.quality.source_conflict_items)} review items`} />
          <Stat label="ambiguous external ID (items)" value={dashboard.quality.ambiguous_external_ids} tone="warn" />
          <Stat label="duplicate candidate (items)" value={dashboard.quality.duplicate_candidates} tone="warn" />
          <Stat label="name mismatch" value={dashboard.quality.name_mismatch_works} tone="warn" />
          <Stat label="identity автора не определена" value={dashboard.quality.unidentified_author_buckets} hint={`${fmt(dashboard.quality.identified_authors)} source-identified`} />
          <Stat label="неоднозначная identity" value={dashboard.quality.ambiguous_people_identities} tone="warn" />
          <Stat label="нет provenance" value={dashboard.quality.missing_provenance_items} tone="warn" />
          <Stat label="observations без URL" value={dashboard.quality.observations_missing_url} tone={dashboard.quality.observations_missing_url > 0 ? 'warn' : undefined} />
          <Stat label="adult-статус неизвестен" value={dashboard.quality.unknown_adult} tone="warn" />
          <Stat label="противоречивые связи" value={dashboard.quality.contradictory_relations} tone="bad" hint={dashboard.quality.contradictory_anime_ids.join(', ') || 'нет evidence-конфликтов'} />
        </div>
        <div className={styles.reasonList}>
          {reasons.length === 0 ? <p className="panel__note">Открытых reason-счётчиков нет.</p> : reasons.map((reason) => (
            <Link key={reason} className={styles.reasonRow} href={href('queue', { reason })}>
              <span>{reasonLabel(reason)}</span>
              <span className={styles.reasonCode}>{reason}</span>
              <strong>{fmt(dashboard.review.by_reason[reason])}</strong>
            </Link>
          ))}
        </div>
        <p className="panel__note">B3-C reference IDs: {dashboard.quality.contradictory_anime_ids.join(', ') || '—'}. Это evidence-конфликт, а не решение о направлении адаптации.</p>
      </Section>

      <Section title="Adult, права, главы и чтение" note="Публикационная безопасность проверяется отдельно от метаданных. Ноль здесь — ожидаемый gate, а не отсутствие данных дашборда.">
        <div className={styles.statsGrid}>
          <Stat label="draft" value={dashboard.publication.draft} />
          <Stat label="approved" value={dashboard.publication.approved} tone={dashboard.publication.approved > 0 ? 'warn' : 'good'} />
          <Stat label="published" value={dashboard.publication.published} tone={dashboard.publication.published > 0 ? 'warn' : 'good'} />
          <Stat label="adult" value={dashboard.publication.adult} tone={dashboard.publication.adult > 0 ? 'warn' : 'good'} />
          <Stat label="verified_non_adult" value={dashboard.publication.verified_non_adult} />
          <Stat label="adult неизвестен" value={dashboard.publication.adult_unknown} tone="warn" />
          <Stat label="approved rights" value={dashboard.publication.approved_rights} tone={dashboard.publication.approved_rights > 0 ? 'warn' : 'good'} />
          <Stat label="работ с approved rights" value={dashboard.publication.approved_rights_works} />
          <Stat label="главы" value={dashboard.publication.chapters} />
          <Stat label="главы со страницами" value={dashboard.publication.chapters_with_pages} />
          <Stat label="публичные главы" value={dashboard.publication.public_chapters} tone={dashboard.publication.public_chapters > 0 ? 'warn' : 'good'} />
          <Stat label="reading sources" value={dashboard.publication.reading_sources} hint={`${fmt(dashboard.publication.active_reading_sources)} active`} />
          <Stat label="public works (view)" value={dashboard.publication.public_works} tone={dashboard.publication.public_works > 0 ? 'warn' : 'good'} />
          <Stat label="реально публикуемых работ" value={dashboard.publication.publishable_works} tone={dashboard.publication.publishable_works > 0 ? 'warn' : 'good'} hint="по текущим gate-условиям" />
        </div>
        <p className="panel__note">Публикуемость не выводится из title/external ID: нужны approved rights, подтверждённый non-adult статус и доступный источник чтения. Сейчас эти условия не выполнены.</p>
      </Section>

      <Section title="Очередь проверки" note="Reason-счётчики суммируются в общий total; статусы не пересекаются.">
        <div className={styles.statsGrid}>
          <Stat label="всего review items" value={dashboard.review.total} />
          {REVIEW_STATUSES.map((status) => <Stat key={status} label={status} value={dashboard.review.by_status[status]} />)}
          <Stat label="source conflict" value={dashboard.review.source_conflict} />
          <Stat label="relation evidence conflict" value={dashboard.review.relation_evidence_conflict} />
          <Stat label="author identity conflict" value={dashboard.review.author_identity_conflict} />
        </div>
      </Section>
    </div>
  );
}

function QueueTable({ items, query }: { items: ReviewItemRow[]; query: ReviewQuery }) {
  if (items.length === 0) return <p className="panel__note">По текущим фильтрам записей нет.</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Приоритет</th><th>Статус</th><th>Reason</th><th>Работа</th><th>Item</th><th>Создан</th><th>Источники</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td data-label="Приоритет"><strong>{item.priority}</strong></td>
              <td data-label="Статус"><span className={`badge ${item.status === 'open' ? 'badge--warn' : item.status === 'resolved' ? 'badge--success' : ''}`}>{item.status}</span></td>
              <td data-label="Reason"><Link href={itemHref(item, query)}>{reasonLabel(item.reason)}</Link><br /><span className={styles.code}>{item.reason}</span></td>
              <td data-label="Работа">{item.work_id ? <span className={styles.code}>{item.work_id.slice(0, 8)}…</span> : <span className="panel__note">без привязки</span>}</td>
              <td data-label="Item"><span className={styles.code}>{item.item_ref ?? item.item_type}</span></td>
              <td data-label="Создан">{dt(item.created_at)}</td>
              <td data-label="Источники"><span className={styles.code}>{shortJson(item.details)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueueDetail({ detail, query }: { detail: ReviewDetail; query: ReviewQuery }) {
  return (
    <Section title={`Деталь проверки · ${reasonLabel(detail.item.reason)}`} note="Полная read-only карточка: review item, работа, provenance и связанные наблюдения.">
      <div className={styles.detailGrid}>
        <div className={styles.detailBox}>
          <h3>Review item</h3>
          <dl className={styles.kv}>
            <dt>id</dt><dd className={styles.code}>{detail.item.id}</dd>
            <dt>work_id</dt><dd className={styles.code}>{detail.item.work_id ?? 'null'}</dd>
            <dt>exact work link</dt><dd>{detail.exactWorkLink ? 'да' : 'НЕТ'}</dd>
            <dt>reason</dt><dd>{detail.item.reason}</dd>
            <dt>status</dt><dd>{detail.item.status}</dd>
            <dt>priority</dt><dd>{detail.item.priority}</dd>
            <dt>created</dt><dd>{dt(detail.item.created_at)}</dd>
          </dl>
          <pre className={styles.pre}>{json(detail.item.details)}</pre>
        </div>
        <div className={styles.detailBox}>
          <h3>Работа</h3>
          {detail.work ? (
            <>
              <p><strong>{detail.work.internal_key}</strong> · {detail.work.title_ru ?? 'RU-название не подтверждено'}</p>
              <p className="panel__note">kind={detail.work.kind} · publication={detail.work.publication_status} · title_ru_status={detail.work.title_ru_status} · adult={detail.work.content_rating_status}</p>
              <p><Link className="badge" href={href('conflicts', { work: detail.work.id })}>Открыть конфликты источников</Link></p>
            </>
          ) : <p className="panel__note">Работа не найдена или item не привязан.</p>}
          {detail.warnings.length > 0 ? <ul className={styles.warnList}>{detail.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
        </div>
      </div>

      <h3>Provenance и evidence URLs ({detail.provenance.length})</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Тип</th><th>Источник</th><th>External ID</th><th>Join key</th><th>Получено</th><th>Verification</th><th>URL</th></tr></thead>
          <tbody>
            {detail.provenance.map((entry, index) => (
              <tr key={`${entry.kind}-${index}`}>
                <td data-label="Тип">{entry.kind}</td>
                <td data-label="Источник">{entry.sourceName}</td>
                <td data-label="External ID" className={styles.code}>{entry.externalId ?? '—'}</td>
                <td data-label="Join key" className={styles.code}>{entry.joinKey ?? '—'}</td>
                <td data-label="Получено">{dt(entry.fetchedAt)}</td>
                <td data-label="Verification">{entry.verificationStatus}</td>
                <td data-label="URL">{entry.sourceUrl ? <a className={styles.link} href={entry.sourceUrl} target="_blank" rel="noreferrer noopener">открыть</a> : <span className="panel__note">нет URL</span>}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>

      <h3>Наблюдения ({detail.observations.length})</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Поле</th><th>Источник</th><th>Значение</th><th>Конфликт</th><th>URL</th><th>Получено</th></tr></thead>
          <tbody>
            {detail.observations.map((row) => (
              <tr key={row.id}>
                <td data-label="Поле" className={styles.code}>{row.field_name}</td>
                <td data-label="Источник">{row.source_name}</td>
                <td data-label="Значение" className={styles.code}>{shortJson(row.value_json)}</td>
                <td data-label="Конфликт">{row.is_conflict ? 'да' : 'нет'}</td>
                <td data-label="URL">{row.source_url ? <a className={styles.link} href={row.source_url} target="_blank" rel="noreferrer noopener">источник</a> : '—'}</td>
                <td data-label="Получено">{dt(row.observed_at)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>

      <h3>Связанные review items ({detail.relatedItems.length})</h3>
      <ul className={styles.itemList}>
        {detail.relatedItems.map((item) => (
          <li key={item.id}><Link href={`${queueHref(query)}&item=${encodeURIComponent(item.id)}`}>{item.reason}</Link> <span className="panel__note">priority {item.priority} · {item.status}</span></li>
        ))}
      </ul>
    </Section>
  );
}

function QueueView({ workspace, query }: { workspace: ReviewWorkspace; query: ReviewQuery }) {
  const { queue, detail } = workspace;
  return (
    <div className={styles.stack}>
      <Section title="Фильтры очереди" note="Фильтрация read-only; изменения review item здесь невозможны.">
        <form className={styles.form} method="get" action="/admin/comics/review">
          <input type="hidden" name="tab" value="queue" />
          <label>Reason<select name="reason" defaultValue={query.reason ?? ''}><option value="">все</option>{REVIEW_REASONS.map((reason) => <option key={reason} value={reason}>{reasonLabel(reason)} · {reason}</option>)}</select></label>
          <label>Статус<select name="status" defaultValue={query.status ?? ''}><option value="">все</option>{REVIEW_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label>Work ID<input name="work_id" defaultValue={query.workId ?? ''} placeholder="UUID" /></label>
          <label>Приоритет ≥<input name="priority" type="number" min="0" max="100" defaultValue={query.priorityMin ?? ''} /></label>
          <label>Источник<input name="source" defaultValue={query.source ?? ''} placeholder="anilist / shikimori" /></label>
          <label>Поиск<input name="q" defaultValue={query.q ?? ''} placeholder="internal key или RU title" /></label>
          <label>С даты<input name="created_from" type="date" defaultValue={query.createdFrom?.slice(0, 10) ?? ''} /></label>
          <label>По дату<input name="created_to" type="date" defaultValue={query.createdTo?.slice(0, 10) ?? ''} /></label>
          <label>Сортировка<select name="sort" defaultValue={query.sort}><option value="priority">priority</option><option value="created_at">created_at</option><option value="status">status</option></select></label>
          <label>Направление<select name="dir" defaultValue={query.dir}><option value="desc">desc</option><option value="asc">asc</option></select></label>
          <label>На странице<select name="page_size" defaultValue={String(query.pageSize)}><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
          <label className={styles.check}><input type="checkbox" name="source_conflict" value="1" defaultChecked={query.sourceConflict} /> source conflict</label>
          <label className={styles.check}><input type="checkbox" name="ambiguous_external_id" value="1" defaultChecked={query.ambiguousExternalId} /> ambiguous external ID</label>
          <label className={styles.check}><input type="checkbox" name="relation_evidence_conflict" value="1" defaultChecked={query.relationEvidenceConflict} /> relation evidence conflict</label>
          <label className={styles.check}><input type="checkbox" name="author_identity_conflict" value="1" defaultChecked={query.authorIdentityConflict} /> author identity conflict</label>
          <label className={styles.check}><input type="checkbox" name="group_by_work" value="1" defaultChecked={query.groupByWork} /> группировать по работе</label>
          <div className={styles.formActions}><button className="btn btn--primary" type="submit">Применить</button><Link className="btn btn--ghost" href={href('queue')}>Сбросить</Link></div>
        </form>
      </Section>

      <div className={styles.summaryBar}>
        <span>Найдено: <strong>{fmt(queue.total)}</strong></span>
        <span>Страница {queue.page} из {Math.max(1, queue.pageCount)}</span>
        <span>open: {queue.summary.by_status.open} · in_review: {queue.summary.by_status.in_review} · resolved: {queue.summary.by_status.resolved} · dismissed: {queue.summary.by_status.dismissed}</span>
      </div>

      {queue.query.groupByWork ? (
        queue.groups.length === 0 ? <p className="panel__note">Групп нет.</p> : queue.groups.map((group) => (
          <Section key={group.workId ?? 'unlinked'} title={`${group.label} · ${group.count}`} note={`max priority ${group.maxPriority} · reasons: ${group.reasons.join(', ')}`}>
            <QueueTable items={group.items} query={query} />
          </Section>
        ))
      ) : <Section title="Review items" note="Полный список по фильтрам; details показаны сокращённо, полная карточка открывается по ссылке reason."><QueueTable items={queue.items} query={query} /></Section>}

      <nav className={styles.pagination} aria-label="Постраничная навигация">
        {queue.page > 1 ? <Link className="btn btn--ghost" href={queueHref(query, queue.page - 1)}>← Назад</Link> : null}
        {queue.page < queue.pageCount ? <Link className="btn btn--ghost" href={queueHref(query, queue.page + 1)}>Вперёд →</Link> : null}
      </nav>

      {detail ? <QueueDetail detail={detail} query={query} /> : null}
    </div>
  );
}

function ConflictsView({ workspace, selectedWork }: { workspace: ConflictWorkspace; selectedWork: string | undefined }) {
  const selected = workspace.selected;
  const workSet = new Set(workspace.workIds);
  const conflictWorks = workspace.works.filter((work) => workSet.has(work.id));
  return (
    <div className={styles.stack}>
      <Section title="Выбор работы" note="Показаны только работы, у которых есть source conflict review item. Значения не канонизируются.">
        <form className={styles.form} method="get" action="/admin/comics/review">
          <input type="hidden" name="tab" value="conflicts" />
          <label>Работа<select name="work" defaultValue={selectedWork ?? selected?.work.id ?? ''}><option value="">первая конфликтная</option>{conflictWorks.map((work) => <option key={work.id} value={work.id}>{work.internal_key} · {work.title_ru ?? 'RU не подтверждено'} · {work.id.slice(0, 8)}</option>)}</select></label>
          <div className={styles.formActions}><button className="btn btn--primary" type="submit">Открыть</button></div>
        </form>
        <p className="panel__note">Конфликтных работ: {fmt(workspace.workIds.length)} · conflict review items: {fmt(selected?.reviewItemIds.length ?? 0)}</p>
      </Section>

      {selected ? (
        <>
          <Section title={`${selected.work.internal_key} · конфликты (${selected.groups.length})`} note={`Наблюдений: ${selected.observationCount}; из них conflict: ${selected.conflictObservationCount}. Work ID: ${selected.work.id}`}>
            {selected.warnings.length > 0 ? <ul className={styles.warnList}>{selected.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
            {selected.groups.map((group) => (
              <article className={styles.conflictCard} key={group.key}>
                <header className={styles.conflictHead}>
                  <div><h3>{group.fieldLabel}</h3><span className={styles.code}>{group.field} · {group.conflictGroup}</span></div>
                  <span className="badge badge--warn">unresolved · winner не выбран</span>
                </header>
                <p className="panel__note">{group.nonCanonicalReason}</p>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Источник</th><th>External ID</th><th>Join key</th><th>Значение</th><th>Получено</th><th>Verification</th><th>URL</th><th>Review</th></tr></thead>
                    <tbody>
                      {group.values.map((value) => (
                        <tr key={value.observationId}>
                          <td data-label="Источник">{value.sourceName}</td>
                          <td data-label="External ID" className={styles.code}>{value.externalId ?? '—'}</td>
                          <td data-label="Join key" className={styles.code}>{value.joinKey ?? '—'}</td>
                          <td data-label="Значение" className={styles.code}>{shortJson(value.value)}</td>
                          <td data-label="Получено">{dt(value.observedAt)}</td>
                          <td data-label="Verification">{value.verificationStatus}{value.isConflict ? ' · conflict' : ''}</td>
                          <td data-label="URL">{value.sourceUrl ? <a className={styles.link} href={value.sourceUrl} target="_blank" rel="noreferrer noopener">источник</a> : <span className="panel__note">нет URL</span>}</td>
                          <td data-label="Review">{group.reviewItemIds.length > 0 ? <Link className={styles.link} href={href('queue', { item: group.reviewItemIds[0] })}>item</Link> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="panel__note">canonical value: <strong>null</strong> · distinct values: {group.distinctValues} · review items: {group.reviewItemIds.join(', ') || '—'}</p>
                {group.warnings.length > 0 ? <ul className={styles.warnList}>{group.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
              </article>
            ))}
          </Section>
        </>
      ) : <p className="panel__note">Конфликтных работ не найдено.</p>}
    </div>
  );
}

function RelationsView({ workspace, animeFilter }: { workspace: RelationWorkspace; animeFilter: number | null }) {
  const { inspection } = workspace;
  const filtered = animeFilter ? inspection.links.filter((link) => link.animeId === animeFilter) : inspection.links;
  const visible = filtered.slice(0, 100);
  return (
    <div className={styles.stack}>
      <div className={styles.callout}>
        <strong>Инспектор не принимает решений.</strong> raw и normalized типы, direction, confidence и verification показаны как записаны. CHARACTER, PARENT, SIDE_STORY, SPIN_OFF не превращаются в RELATED; ADAPTATION не объявляется первоисточником; auto-confirm отсутствует.
      </div>
      <Section title="Сводка связей" note="Все значения — из существующих adaptation rows; это не подтверждение публикации.">
        <div className={styles.statsGrid}>
          <Stat label="всего связей" value={inspection.summary.total} />
          <Stat label="recorded" value={inspection.summary.recorded} />
          <Stat label="source_verified" value={inspection.summary.source_verified} />
          <Stat label="editorially_verified" value={inspection.summary.editorially_verified} />
          <Stat label="disputed" value={inspection.summary.disputed} />
          <Stat label="primary" value={inspection.summary.primary} tone={inspection.summary.primary > 0 ? 'warn' : 'good'} />
          <Stat label="public" value={inspection.summary.public} tone={inspection.summary.public > 0 ? 'warn' : 'good'} />
          <Stat label="без evidence URL" value={inspection.summary.missing_evidence} tone={inspection.summary.missing_evidence > 0 ? 'warn' : undefined} />
          <Stat label="policy warning" value={inspection.summary.policy_violations} tone={inspection.summary.policy_violations > 0 ? 'warn' : 'good'} />
          <Stat label="contradictory links" value={inspection.summary.contradictory_links} tone={inspection.summary.contradictory_links > 0 ? 'bad' : 'good'} />
        </div>
        <div className={styles.distribution}>
          {Object.entries(inspection.summary.by_raw_type).map(([type, count]) => <span className="badge" key={`raw-${type}`}>raw {type}: {count}</span>)}
          {Object.entries(inspection.summary.by_normalized_type).map(([type, count]) => <span className="badge badge--accent" key={`norm-${type}`}>norm {type}: {count}</span>)}
        </div>
      </Section>

      <Section title="Противоречивые evidence-наборы" note="ID из B1D review categories. Направление не выбирается.">
        <div className={styles.contradictionGrid}>
          {inspection.knownContradictoryIds.map((animeId) => {
            const item = inspection.contradictions.find((entry) => entry.animeId === animeId);
            return (
              <div className={styles.contradictionCard} key={animeId}>
                <h3>anime {animeId}</h3>
                <p className="panel__note">hints: {item?.hintCount ?? 0} · links: {inspection.links.filter((link) => link.animeId === animeId).length}</p>
                <p className="panel__note">{item ? item.categories.join(' + ') : 'в текущей выборке нет обоих direction hints'}</p>
                <Link className="badge badge--warn" href={href('relations', { anime_id: String(animeId) })}>открыть связи</Link>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Фильтр по anime ID" note="Показываются все связи выбранного anime ID; иначе — первые 100 из общего набора.">
        <form className={styles.form} method="get" action="/admin/comics/review">
          <input type="hidden" name="tab" value="relations" />
          <label>Anime ID<input name="anime_id" type="number" min="1" defaultValue={animeFilter ?? ''} /></label>
          <div className={styles.formActions}><button className="btn btn--primary" type="submit">Показать</button><Link className="btn btn--ghost" href={href('relations')}>Все</Link></div>
        </form>
      </Section>

      <Section title={`Связи (${visible.length}${filtered.length > visible.length ? ` из ${filtered.length}` : ''})`} note={filtered.length > visible.length ? 'Показаны первые 100; используйте anime_id для точной выборки.' : 'Полная выборка по текущему фильтру.'}>
        {visible.length === 0 ? <p className="panel__note">Связей нет.</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Anime</th><th>Comic work</th><th>Raw</th><th>Normalized</th><th>Direction</th><th>Confidence</th><th>Verification</th><th>Primary / public</th><th>Evidence</th><th>Warnings</th></tr></thead>
              <tbody>
                {visible.map((link) => (
                  <tr key={link.id} className={link.isContradictory ? styles.contradictoryRow : undefined}>
                    <td data-label="Anime"><strong>{link.animeId}</strong></td>
                    <td data-label="Comic work"><span className={styles.code}>{link.internalKey ?? link.comicWorkId.slice(0, 8)}</span><br /><span className="panel__note">{link.titleRu ?? 'RU не подтверждено'}</span></td>
                    <td data-label="Raw" className={styles.code}>{link.rawType}</td>
                    <td data-label="Normalized" className={styles.code}>{link.normalizedType}</td>
                    <td data-label="Direction">{link.direction}</td>
                    <td data-label="Confidence">{link.confidence}</td>
                    <td data-label="Verification">{link.verificationStatus}</td>
                    <td data-label="Primary / public">{link.isPrimary ? 'primary' : '—'} / {link.isPublic ? 'public' : '—'}</td>
                    <td data-label="Evidence">{link.sourceUrl ? <a className={styles.link} href={link.sourceUrl} target="_blank" rel="noreferrer noopener">{link.sourceName}</a> : <span className="panel__note">{link.sourceName} · нет URL</span>}</td>
                    <td data-label="Warnings">{link.policyWarnings.length > 0 ? <ul className={styles.warnList}>{link.policyWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

export default async function ComicsReviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const store = await cookies();
  if (!verifyAdminCookie(store.get(adminCookieName())?.value)) redirect('/admin/login');
  const params = await searchParams;
  const tab = parseTab(one(params, 'tab'));
  const configured = isCatalogReadConfigured();
  let error: string | null = null;
  let dashboard: Dashboard | null = null;
  let review: ReviewWorkspace | null = null;
  let conflicts: ConflictWorkspace | null = null;
  let relations: RelationWorkspace | null = null;
  const query = parseReviewQuery(params);
  const itemId = one(params, 'item');
  const workId = one(params, 'work');
  const animeRaw = one(params, 'anime_id');
  const animeFilter = animeRaw && /^\d+$/.test(animeRaw) ? Number.parseInt(animeRaw, 10) : null;

  if (configured) {
    try {
      if (tab === 'dashboard') dashboard = buildDashboard(await loadCatalogSnapshot());
      else if (tab === 'queue') review = await loadReviewWorkspace(query, itemId);
      else if (tab === 'conflicts') conflicts = await loadConflictWorkspace(workId);
      else relations = await loadRelationWorkspace();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Не удалось загрузить read-only выборку.';
    }
  }

  return (
    <main className={`container ${styles.page}`}>
      <header className="page-head">
        <h1>Comics · review operations</h1>
        <p>B3-D read-only слой: качество, очередь проверки, конфликты источников и связи. Никаких записей в каталог, rights, главы или review queue.</p>
      </header>

      <div className={styles.readonlyBar}>
        <span className="badge badge--success">read-only</span>
        <span className="panel__note">Admin-доступ: существующая HMAC-cookie. user_metadata.role не используется.</span>
        <Link className={styles.link} href="/admin">← Админ-панель</Link>
      </div>

      <nav className={styles.tabs} aria-label="Разделы review operations">
        {TABS.map((entry) => <Link key={entry.id} className={`${styles.tab} ${tab === entry.id ? styles.tabActive : ''}`} href={href(entry.id)}>{entry.label}</Link>)}
      </nav>

      {!configured ? (
        <section className={`panel ${styles.notice}`}>
          <h2 className="section-title">Read-only слой не настроен</h2>
          <p className="panel__note">Для серверного чтения нужны <code>NEXT_PUBLIC_SUPABASE_URL</code> и <code>SUPABASE_SERVICE_KEY</code> (или <code>SUPABASE_SERVICE_ROLE_KEY</code>) в серверном окружении. Anon-ключ намеренно не используется: без service-доступа admin-read fail-closed. Секреты не выводятся.</p>
          <p className="panel__note">Публичный доступ к маршруту закрыт admin-cookie; при отсутствии конфигурации данные не подставляются и не имитируются.</p>
        </section>
      ) : error ? (
        <section className={`panel ${styles.notice}`}>
          <h2 className="section-title">Ошибка чтения</h2>
          <p className="panel__note">{error}</p>
          <p className="panel__note">Страница не изменяет данные. Проверьте доступ к read-only REST и повторите запрос.</p>
        </section>
      ) : tab === 'dashboard' && dashboard ? <DashboardView dashboard={dashboard} /> : null}
      {configured && !error && tab === 'queue' && review ? <QueueView workspace={review} query={query} /> : null}
      {configured && !error && tab === 'conflicts' && conflicts ? <ConflictsView workspace={conflicts} selectedWork={workId} /> : null}
      {configured && !error && tab === 'relations' && relations ? <RelationsView workspace={relations} animeFilter={animeFilter} /> : null}
    </main>
  );
}