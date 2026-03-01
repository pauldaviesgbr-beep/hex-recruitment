'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import styles from './DatePicker.module.css'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
}

export default function DatePicker({ value, onChange, id, placeholder = 'Select date' }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Parse YYYY-MM-DD string to Date
  const selectedDate = value ? parseValue(value) : undefined

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      onChange(`${y}-${m}-${d}`)
    }
    setOpen(false)
  }

  // Format for display: DD/MM/YYYY
  const displayValue = selectedDate
    ? `${String(selectedDate.getDate()).padStart(2, '0')}/${String(selectedDate.getMonth() + 1).padStart(2, '0')}/${selectedDate.getFullYear()}`
    : ''

  return (
    <div className={styles.picker} ref={pickerRef}>
      <button
        type="button"
        id={id}
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={displayValue ? '' : styles.placeholder}>
          {displayValue || placeholder}
        </span>
        <span className={styles.calendarIcon}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
      </button>

      {open && (
        <div className={styles.panel}>
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            captionLayout="dropdown"
            startMonth={new Date(1970, 0)}
            endMonth={new Date(new Date().getFullYear(), 11)}
            defaultMonth={selectedDate || new Date()}
            showOutsideDays
            fixedWeeks
            weekStartsOn={1}
            classNames={{
              root: styles.rdp,
              months: styles.rdpMonths,
              month: styles.rdpMonth,
              month_caption: styles.rdpCaption,
              caption_label: styles.rdpCaptionLabel,
              nav: styles.rdpNav,
              button_previous: styles.rdpNavBtn,
              button_next: styles.rdpNavBtn,
              chevron: styles.rdpChevron,
              dropdowns: styles.rdpDropdowns,
              dropdown: styles.rdpDropdown,
              dropdown_root: styles.rdpDropdownRoot,
              months_dropdown: styles.rdpMonthsDropdown,
              years_dropdown: styles.rdpYearsDropdown,
              month_grid: styles.rdpTable,
              weekdays: styles.rdpHeadRow,
              weekday: styles.rdpHeadCell,
              weeks: styles.rdpBody,
              week: styles.rdpRow,
              day: styles.rdpDay,
              day_button: styles.rdpDayButton,
              outside: styles.rdpDayOutside,
              today: styles.rdpDayToday,
              selected: styles.rdpDaySelected,
              disabled: styles.rdpDayDisabled,
            }}
          />
        </div>
      )}
    </div>
  )
}

function parseValue(value: string): Date | undefined {
  if (!value) return undefined
  const parts = value.split('-')
  if (parts.length === 3) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
  }
  if (parts.length === 2) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1)
  }
  return undefined
}
