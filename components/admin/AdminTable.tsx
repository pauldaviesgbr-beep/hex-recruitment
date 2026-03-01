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
  totalCount?: number
  onExportCSV?: () => void
  headerActions?: React.ReactNode
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
}: AdminTableProps<T>) {
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
          {totalCount !== undefined && (
            <span className={styles.totalCount}>{totalCount.toLocaleString()} result{totalCount !== 1 ? 's' : ''}</span>
          )}
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
          <tbody>
            {loading ? (
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
