import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { Button } from './Button'
import { useHabitsStore } from '@/stores/useHabitsStore'

export function BulkImport() {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const addHabit = useHabitsStore((s) => s.addHabit)

  const parseFile = (file: File) => {
    if (file.name.endsWith('.json')) {
      file.text().then((text) => {
        try {
          const arr = JSON.parse(text)
          if (Array.isArray(arr)) importEntries(arr)
        } catch {
          setMessage('Invalid JSON')
        }
      })
    } else {
      Papa.parse(file, {
        complete: (results) => {
          const rows = (results.data as string[][]).flat().filter(Boolean)
          importEntries(rows)
        },
      })
    }
  }

  const importEntries = async (entries: string[]) => {
    let count = 0
    for (const text of entries) {
      if (typeof text !== 'string' || !text.trim()) continue
      await addHabit(text.slice(0, 140))
      count++
    }
    setMessage(`Imported ${count} habits`)
  }

  return (
    <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-white/70">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-white">Bulk upload</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
            Upload CSV/JSON
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-white/50">CSV first column or JSON array of strings.</p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) parseFile(file)
        }}
      />
      {message && <div className="mt-2 text-xs text-glow-amber">{message}</div>}
    </div>
  )
}
