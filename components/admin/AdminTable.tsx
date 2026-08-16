'use client'

import styles from './AdminTable.module.css'

export interface Column<T = any> {
  key: string
  label: string
  sortable?: boolean
  render?: (value: any, row: T) => React.ReactNode
  width?: string
}

interface AdminTableProps<T = any> {
  columns: Column<T>[]
  data: T[]
  sortField?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (field: string) => void
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  searchValue?: string
  onSearch?: (value: string) => void
  searchPlaceholder?: string
  loading?: boolean
  actions?: (row: T) => React.ReactNode
  selectable?: boolean
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  onRowClick?: (row: T) => void
  totalCount?: number | null
  onExportCSV?: () => void
  headerActions?: React.ReactNode

  // ── A NUMBER IS A CLAIM ──────────────────────────────────────────────
  // The estate printed "0 results" in FOUR different states: while loading,
  // while a search matched nothing, while a table was genuinely empty, and
  // while the request had FAILED. Four states, one string — and a factual
  // claim about the data in three cases where no claim can be made. Worse,
  // filtered-to-nothing and failed rendered identically, so a mistyped
  // search was indistinguishable from a broken page.
  //
  // The cause is `setCount(data.total || 0)`: an error payload has no
  // `total`, so `|| 0` invents a confident zero. The fix is a nullable
  // count plus an explicit status — never a fallback.
  //
  // Optional, so the pages adopt one at a time; without `status` the table
  // behaves exactly as before.
  status?: 'loading' | 'ok' | 'empty' | 'error'
  /** The active search, so a filtered zero can name what was searched. */
  query?: string
  /** How many filters are set, so "Clear search" vs "Clear all filters". */
  filtersActive?: number
  onClearSearch?: () => void
  onRetry?: () => void
  errorMessage?: string
  /** Plural noun for the copy: "No jobs match…", "Couldn't load jobs." */
  entityName?: string
  /** Terminal-empty copy. Name the cause; don't apologise. */
  emptyTitle?: string
  emptyBody?: string
}

export default function AdminTable<T extends Record<string, any>>({
  columns,
  data,
  sortField,
  sortDir,
  onSort,
  page,
  totalPages,
  onPageChange,
  searchValue,
  onSearch,
  searchPlaceholder = 'Search...',
  loading,
  actions,
  selectable,
  selectedIds = [],
  onSelectionChange,
  onRowClick,
  totalCount,
  onExportCSV,
  headerActions,
  status,
  query,
  filtersActive = 0,
  onClearSearch,
  onRetry,
  errorMessage,
  entityName = 'results',
  emptyTitle,
  emptyBody,
}: AdminTableProps<T>) {
  // Derived, not passed, so a caller cannot set two of these inconsistently.
  const isFilteredEmpty = status === 'empty' && Boolean(query || filtersActive > 0)
  const isError = status === 'error'
  const isTerminalEmpty = status === 'empty' && !isFilteredEmpty
  const isLoadingState = status === 'loading'
  /** Any state that replaces the rows — and therefore drops the header. */
  const showsStateRow = isError || status === 'empty'
  const colCount = columns.length + (actions ? 1 : 0) + (selectable ? 1 : 0)
  const allSelected = data.length > 0 && data.every(row => selectedIds.includes(row.id))

  const toggleAll = () => {
    if (!onSelectionChange) return
    if (allSelected) {
      onSelectionChange(selectedIds.filter(id => !data.some(row => row.id === id)))
    } else {
      const newIds = Array.from(new Set([...selectedIds, ...data.map(row => row.id)]))
      onSelectionChange(newIds)
    }
  }

  const toggleRow = (id: string) => {
    if (!onSelectionChange) return
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(x => x !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {onSearch && (
            <div className={styles.searchBar}>
              <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchValue || ''}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className={styles.searchInput}
              />
            </div>
          )}
          {/* THE COUNT RENDERS FROM (status, total), NEVER FROM `total || 0`.
              A filtered zero against a real total is a different fact from a
              bare zero, and neither is a claim we can make while loading or
              after a failure. */}
          {isLoadingState || (loading && status === undefined && totalCount === undefined) ? (
            <span className={styles.countMuted}>Loading…</span>
          ) : isError ? (
            <span className={styles.countMuted} aria-label="count unavailable">—</span>
          ) : isFilteredEmpty && typeof totalCount === 'number' ? (
            <span className={styles.totalCount}>0 of {totalCount.toLocaleString()}</span>
          ) : totalCount !== undefined && totalCount !== null ? (
            <span className={styles.totalCount}>{totalCount.toLocaleString()} result{totalCount !== 1 ? 's' : ''}</span>
          ) : null}
        </div>

        <div className={styles.toolbarRight}>
          {selectedIds.length > 0 && headerActions && (
            <div className={styles.bulkActions}>
              <span className={styles.selectedCount}>{selectedIds.length} selected</span>
              {headerActions}
            </div>
          )}
          {onExportCSV && (
            <button className={styles.exportBtn} onClick={onExportCSV} title="Export CSV">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export
            </button>
          )}
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          {/* NO HEADER IN A STATE ROW. With a header the table keeps its full
              scrollable width, so a centred message centres in THAT and lands
              off to one side of the container — which is why /admin/reviews'
              "No results found" sits right of centre and clipped at 390.
              Dropping the header collapses the table to the container width,
              and the message centres where a reader is looking. */}
          {!showsStateRow && (
          <thead>
            <tr>
              {selectable && (
                <th className={styles.th} style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className={styles.checkbox}
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${styles.th} ${col.sortable && onSort ? styles.sortable : ''} ${sortField === col.key ? styles.active : ''}`}
                  onClick={() => col.sortable && onSort?.(col.key)}
                  style={col.width ? { width: col.width } : undefined}
                >
                  <span>{col.label}</span>
                  {col.sortable && sortField === col.key && (
                    <span className={styles.sortArrow}>
                      {sortDir === 'asc' ? ' ↑' : ' ↓'}
                    </span>
                  )}
                </th>
              ))}
              {actions && <th className={styles.th} style={{ width: '120px' }}>Actions</th>}
            </tr>
          </thead>
          )}
          <tbody>
            {/* FAILED — the state that did not exist. Announced as an alert,
                because a silent wrong number is the fault being fixed. */}
            {isError ? (
              <tr>
                <td colSpan={colCount} className={styles.stateCell}>
                  <div className={styles.errorState} role="alert">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p className={styles.errorHeading}>Couldn&rsquo;t load {entityName}.</p>
                    {/* This clause is the whole point of the state. */}
                    <p className={styles.errorBody}>
                      {errorMessage || `The ${entityName} weren't reached — this isn't an empty table.`}
                    </p>
                    {onRetry && (
                      <button type="button" className={styles.retryBtn} onClick={onRetry}>Try again</button>
                    )}
                  </div>
                </td>
              </tr>
            ) : isFilteredEmpty ? (
              /* FILTERED TO NOTHING — recoverable, so it gets the way out. */
              <tr>
                <td colSpan={colCount} className={styles.stateCell}>
                  <div className={styles.emptyState} role="status">
                    <p className={styles.emptyHeading}>
                      No {entityName} match{query ? <> &ldquo;{query}&rdquo;</> : ' those filters'}.
                    </p>
                    {typeof totalCount === 'number' && query && (
                      <p className={styles.emptyBody}>
                        {totalCount.toLocaleString()} {entityName} are here without that search.
                      </p>
                    )}
                    {onClearSearch && (
                      <button type="button" className={styles.clearBtn} onClick={onClearSearch}>
                        {filtersActive > 1 ? 'Clear all filters' : 'Clear search'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : isTerminalEmpty ? (
              /* HONESTLY EMPTY — terminal. Nothing to clear, so no action. */
              <tr>
                <td colSpan={colCount} className={styles.stateCell}>
                  <div className={styles.emptyState} role="status">
                    <p className={styles.emptyHeading}>{emptyTitle || `No ${entityName} yet.`}</p>
                    {emptyBody && <p className={styles.emptyBody}>{emptyBody}</p>}
                  </div>
                </td>
              </tr>
            ) : (loading || isLoadingState) ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className={styles.skeletonRow}>
                  {selectable && (
                    <td className={styles.td}>
                      <div className={styles.skeleton} style={{ width: '16px' }} />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={styles.td}>
                      <div className={styles.skeleton} />
                    </td>
                  ))}
                  {actions && (
                    <td className={styles.td}>
                      <div className={styles.skeleton} />
                    </td>
                  )}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0) + (selectable ? 1 : 0)} className={styles.empty}>
                  No results found
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={row.id || i}
                  className={`${styles.row} ${onRowClick ? styles.clickable : ''} ${selectable && selectedIds.includes(row.id) ? styles.selected : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleRow(row.id)}
                        className={styles.checkbox}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={styles.td}>
                      {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                    </td>
                  ))}
                  {actions && (
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actions}>{actions(row)}</div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            className={styles.pageBtn}
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

export function exportToCSV(data: Record<string, any>[], columns: Column[], filename: string) {
  const headers = columns.map(c => c.label)
  const rows = data.map(row =>
    columns.map(col => {
      const val = row[col.key]
      if (val === null || val === undefined) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    })
  )
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}
